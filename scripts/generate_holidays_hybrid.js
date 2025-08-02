#!/usr/bin/env node

/**
 * Generate YAML holiday files from date-holidays package (HYBRID APPROACH)
 * 
 * This script generates PH (Public Holidays) from date-holidays and preserves
 * SH (School Holidays) from existing YAML files, since date-holidays doesn't
 * include school holidays.
 * 
 * Usage: node scripts/generate_holidays_hybrid.js
 */

const fs = require('fs');
const path = require('path');
const { stringify, parse } = require('yaml');

let Holidays;
try {
    Holidays = require('date-holidays');
} catch {
    console.error('❌ date-holidays package not found. Please install it first:');
    console.error('   npm install date-holidays');
    process.exit(1);
}

// Fixed holidays that don't change year to year
const FIXED_HOLIDAYS = {
    'New Year\'s Day': [1, 1],
    'Neujahr': [1, 1],
    'Neujahrstag': [1, 1],
    'Heilige Drei Könige': [1, 6],
    'Epiphany': [1, 6],
    'Frauentag': [3, 8],
    'International Women\'s Day': [3, 8],
    'Tag der Arbeit': [5, 1],
    'Maifeiertag': [5, 1],
    'Labour Day': [5, 1],
    'May Day': [5, 1],
    'Mariä Himmelfahrt': [8, 15],
    'Assumption of Mary': [8, 15],
    'Weltkindertag': [9, 20],
    'World Children\'s Day': [9, 20],
    'Tag der Deutschen Einheit': [10, 3],
    'German Unity Day': [10, 3],
    'Reformationstag': [10, 31],
    'Reformation Day': [10, 31],
    'Allerheiligen': [11, 1],
    'All Saints\' Day': [11, 1],
    '1. Weihnachtstag': [12, 25],
    'Christmas Day': [12, 25],
    'Christmas': [12, 25],
    '2. Weihnachtstag': [12, 26],
    'Boxing Day': [12, 26],
    'St. Stephen\'s Day': [12, 26]
};

// Easter-based holidays with their offsets
const EASTER_HOLIDAYS = {
    'Karfreitag': -2,
    'Good Friday': -2,
    'Ostersonntag': 0,
    'Easter Sunday': 0,
    'Ostermontag': 1,
    'Easter Monday': 1,
    'Christi Himmelfahrt': 39,
    'Ascension Day': 39,
    'Pfingstsonntag': 49,
    'Whit Sunday': 49,
    'Pfingstmontag': 50,
    'Whit Monday': 50,
    'Fronleichnam': 60,
    'Corpus Christi': 60
};

// Country configurations
const COUNTRY_CONFIGS = {
    'DE': { 
        yamlFile: 'de.yaml', 
        name: 'Germany',
        nominalUrl: 'https://nominatim.openstreetmap.org/reverse?format=json&lat=49.5487&lon=9.8160&zoom=18&addressdetails=1&accept-language=de,en'
    },
    'AT': { 
        yamlFile: 'at.yaml', 
        name: 'Austria',
        nominalUrl: 'https://nominatim.openstreetmap.org/reverse?format=json&lat=47.8095&lon=13.0550&zoom=18&addressdetails=1&accept-language=de,en'
    },
    'CH': { 
        yamlFile: 'ch.yaml', 
        name: 'Switzerland',
        nominalUrl: 'https://nominatim.openstreetmap.org/reverse?format=json&lat=46.8182&lon=8.2275&zoom=18&addressdetails=1&accept-language=de,en'
    },
    'US': { 
        yamlFile: 'us.yaml', 
        name: 'United States',
        nominalUrl: 'https://nominatim.openstreetmap.org/reverse?format=json&lat=39.7837&lon=-100.4458&zoom=18&addressdetails=1&accept-language=en'
    },
    'GB': { 
        yamlFile: 'gb.yaml', 
        name: 'United Kingdom',
        nominalUrl: 'https://nominatim.openstreetmap.org/reverse?format=json&lat=54.7023&lon=-3.2765&zoom=18&addressdetails=1&accept-language=en'
    },
    'FR': { 
        yamlFile: 'fr.yaml', 
        name: 'France',
        nominalUrl: 'https://nominatim.openstreetmap.org/reverse?format=json&lat=46.2276&lon=2.2137&zoom=18&addressdetails=1&accept-language=fr,en'
    }
};

/**
 * Convert date-holidays holiday to opening_hours format
 */
function convertHoliday(holiday) {
    const name = holiday.name;
    
    // Check if it's a fixed date holiday
    if (FIXED_HOLIDAYS[name]) {
        return {
            name: name,
            fixed_date: FIXED_HOLIDAYS[name]
        };
    }
    
    // Check if it's an Easter-based holiday
    if (EASTER_HOLIDAYS[name] !== undefined) {
        const result = {
            name: name,
            variable_date: 'easter'
        };
        
        if (EASTER_HOLIDAYS[name] !== 0) {
            result.offset = EASTER_HOLIDAYS[name];
        }
        
        return result;
    }
    
    // For unknown holidays, treat as fixed date based on current year
    const date = new Date(holiday.date);
    return {
        name: name,
        fixed_date: [date.getMonth() + 1, date.getDate()]
    };
}

/**
 * Get existing YAML data to preserve SH data
 */
function getExistingYamlData(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            return parse(content);
        }
    } catch (error) {
        console.warn(`⚠️  Could not read existing ${filePath}: ${error.message}`);
    }
    return null;
}

/**
 * Generate YAML content for a country (hybrid approach)
 */
function generateHybridYamlForCountry(countryCode, config) {
    console.log(`📝 Generating ${config.yamlFile} for ${config.name} (hybrid approach)...`);

    const holidaysDir = path.join(__dirname, '..', 'src', 'holidays');
    const filePath = path.join(holidaysDir, config.yamlFile);
    
    // Get existing data to preserve SH
    const existingData = getExistingYamlData(filePath);

    const yamlData = {
        _nominatim_url: config.nominalUrl,
        PH: []
    };

    // Get current year holidays from date-holidays
    const currentYear = new Date().getFullYear();
    try {
        const hd = new Holidays(countryCode);
        const holidays = hd.getHolidays(currentYear);
        
        const publicHolidays = holidays.filter(holiday => 
            holiday.type === 'public' && 
            holiday.name && 
            holiday.date
        );

        // Convert holidays to our format
        const convertedHolidays = publicHolidays.map(holiday => convertHoliday(holiday));
        
        // Remove duplicates based on name
        const uniqueHolidays = convertedHolidays.filter((holiday, index, self) => 
            index === self.findIndex(h => h.name === holiday.name)
        );

        yamlData.PH = uniqueHolidays;
        
        console.log(`  - Generated ${uniqueHolidays.length} public holidays`);
    } catch (error) {
        console.warn(`  ⚠️  Could not get holidays for ${countryCode}: ${error.message}`);
    }

    // Preserve existing state/region data with SH
    if (existingData) {
        Object.keys(existingData).forEach(key => {
            if (key !== 'PH' && key !== '_nominatim_url' && typeof existingData[key] === 'object') {
                yamlData[key] = existingData[key];
                console.log(`  - Preserved state/region data for: ${key}`);
            }
        });
    }

    return yamlData;
}

/**
 * Main function
 */
function main() {
    console.log('🚀 Generating holiday YAML files (HYBRID approach)...');
    console.log('   PH (Public Holidays): from date-holidays package');
    console.log('   SH (School Holidays): preserved from existing files\n');

    const holidaysDir = path.join(__dirname, '..', 'src', 'holidays');
    
    // Ensure holidays directory exists
    if (!fs.existsSync(holidaysDir)) {
        fs.mkdirSync(holidaysDir, { recursive: true });
    }

    let successCount = 0;
    let errorCount = 0;

    // Generate YAML files for each country
    Object.entries(COUNTRY_CONFIGS).forEach(([countryCode, config]) => {
        try {
            const yamlData = generateHybridYamlForCountry(countryCode, config);
            const filePath = path.join(holidaysDir, config.yamlFile);
            
            // Add header comment
            const header = `---
# Generated with HYBRID approach
# PH (Public Holidays): from date-holidays package
# SH (School Holidays): preserved from original files
# Country: ${config.name} (${countryCode})
# Generated on: ${new Date().toISOString()}

`;
            
            const yamlContent = stringify(yamlData, {
                indent: 2,
                lineWidth: 0,
                minContentWidth: 0
            });
            
            fs.writeFileSync(filePath, header + yamlContent);
            console.log(`✅ Generated ${config.yamlFile}`);
            successCount++;
        } catch (error) {
            console.error(`❌ Failed to generate ${config.yamlFile}:`, error.message);
            errorCount++;
        }
    });

    console.log('\n🎉 Generation complete!');
    console.log(`✅ Success: ${successCount} files`);
    if (errorCount > 0) {
        console.log(`❌ Errors: ${errorCount} files`);
    }

    console.log('\n📋 Next steps:');
    console.log('1. Run `npm run build` to rebuild the library');
    console.log('2. Run `npm test` to verify everything works');
    console.log('3. Check that SH (School Holidays) data is preserved');
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = {
    generateHybridYamlForCountry,
    COUNTRY_CONFIGS,
    main
};
