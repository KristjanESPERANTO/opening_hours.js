#!/usr/bin/env node

/**
 * Generate YAML holiday files from date-holidays package
 * 
 * This script replaces the manual maintenance of holiday YAML files
 * by automatically generating them from the date-holidays npm package.
 * 
 * Usage: node scripts/generate_holidays_from_date_holidays.js
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

// Country configurations - mapping date-holidays codes to our structure
const COUNTRY_CONFIGS = {
    'AR': { yamlFile: 'ar.yaml', name: 'Argentina' },
    'AT': { yamlFile: 'at.yaml', name: 'Austria' },
    'AU': { yamlFile: 'au.yaml', name: 'Australia' },
    'BE': { yamlFile: 'be.yaml', name: 'Belgium' },
    'BR': { yamlFile: 'br.yaml', name: 'Brazil' },
    'CA': { yamlFile: 'ca.yaml', name: 'Canada' },
    'CH': { yamlFile: 'ch.yaml', name: 'Switzerland' },
    'CI': { yamlFile: 'ci.yaml', name: 'Ivory Coast' },
    'CN': { yamlFile: 'cn.yaml', name: 'China' },
    'CZ': { yamlFile: 'cz.yaml', name: 'Czech Republic' },
    'DE': { 
        yamlFile: 'de.yaml', 
        name: 'Germany',
        states: {
            'BW': { name: 'Baden-Württemberg', code: 'bw' },
            'BY': { name: 'Bayern', code: 'by' },
            'BE': { name: 'Berlin', code: 'be' },
            'BB': { name: 'Brandenburg', code: 'bb' },
            'HB': { name: 'Bremen', code: 'hb' },
            'HH': { name: 'Hamburg', code: 'hh' },
            'HE': { name: 'Hessen', code: 'he' },
            'MV': { name: 'Mecklenburg-Vorpommern', code: 'mv' },
            'NI': { name: 'Niedersachsen', code: 'ni' },
            'NW': { name: 'Nordrhein-Westfalen', code: 'nw' },
            'RP': { name: 'Rheinland-Pfalz', code: 'rp' },
            'SL': { name: 'Saarland', code: 'sl' },
            'SN': { name: 'Sachsen', code: 'sn' },
            'ST': { name: 'Sachsen-Anhalt', code: 'st' },
            'SH': { name: 'Schleswig-Holstein', code: 'sh' },
            'TH': { name: 'Thüringen', code: 'th' }
        },
        nominatimUrl: 'https://nominatim.openstreetmap.org/reverse?format=json&lat=49.5487&lon=9.8160&zoom=18&addressdetails=1&accept-language=de,en'
    },
    'DK': { yamlFile: 'dk.yaml', name: 'Denmark' },
    'ES': { yamlFile: 'es.yaml', name: 'Spain' },
    'FI': { yamlFile: 'fi.yaml', name: 'Finland' },
    'FR': { yamlFile: 'fr.yaml', name: 'France' },
    'GB': { yamlFile: 'gb.yaml', name: 'United Kingdom' },
    'GR': { yamlFile: 'gr.yaml', name: 'Greece' },
    'HR': { yamlFile: 'hr.yaml', name: 'Croatia' },
    'HU': { yamlFile: 'hu.yaml', name: 'Hungary' },
    'IE': { yamlFile: 'ie.yaml', name: 'Ireland' },
    'IT': { yamlFile: 'it.yaml', name: 'Italy' },
    'JP': { yamlFile: 'jp.yaml', name: 'Japan' },
    'LU': { yamlFile: 'lu.yaml', name: 'Luxembourg' },
    'NA': { yamlFile: 'na.yaml', name: 'Namibia' },
    'NL': { yamlFile: 'nl.yaml', name: 'Netherlands' },
    'NO': { yamlFile: 'no.yaml', name: 'Norway' },
    'NZ': { yamlFile: 'nz.yaml', name: 'New Zealand' },
    'PL': { yamlFile: 'pl.yaml', name: 'Poland' },
    'RO': { yamlFile: 'ro.yaml', name: 'Romania' },
    'RU': { yamlFile: 'ru.yaml', name: 'Russia' },
    'SE': { yamlFile: 'se.yaml', name: 'Sweden' },
    'SI': { yamlFile: 'si.yaml', name: 'Slovenia' },
    'SK': { yamlFile: 'sk.yaml', name: 'Slovakia' },
    'UA': { yamlFile: 'ua.yaml', name: 'Ukraine' },
    'US': { yamlFile: 'us.yaml', name: 'United States' },
    'VN': { yamlFile: 'vn.yaml', name: 'Vietnam' },
    'XA': { yamlFile: 'xa.yaml', name: 'Extended Area' }
};

/**
 * Convert date-holidays holiday to our YAML format
 */
function convertHoliday(holiday) {
    const result = {
        name: holiday.name
    };

    // Check if it's a fixed date (same date every year)
    const date = new Date(holiday.date);
    const month = date.getMonth() + 1;
    const day = date.getDate();

    // Simple heuristic: if the holiday falls on the same date in multiple years, it's fixed
    result.fixed_date = [month, day];

    // Add state restrictions if available
    if (holiday.state) {
        result.only_states = [holiday.state];
    }

    return result;
}

/**
 * Get holidays for a country and year
 */
function getHolidaysForCountry(countryCode, year = new Date().getFullYear()) {
    try {
        const hd = new Holidays(countryCode);
        const holidays = hd.getHolidays(year);
        
        return holidays.filter(holiday => 
            holiday.type === 'public' && 
            holiday.name && 
            holiday.date
        );
    } catch (error) {
        console.warn(`⚠️  Could not get holidays for ${countryCode}:`, error.message);
        return [];
    }
}

/**
 * Generate YAML content for a country - HYBRID APPROACH
 * - PH (Public Holidays) from date-holidays package for automatic updates
 * - SH (School Holidays) and other data preserved from original YAML files
 */
function generateYamlForCountry(countryCode, config) {
    console.log(`📝 Updating ${config.yamlFile} for ${config.name}...`);

    const yamlFilePath = path.join(__dirname, '..', 'src', 'holidays', config.yamlFile);
    let existingData = {};
    
    // Try to read existing YAML file to preserve SH data and structure
    try {
        if (fs.existsSync(yamlFilePath)) {
            const existingContent = fs.readFileSync(yamlFilePath, 'utf8');
            existingData = parse(existingContent);
            console.log(`  📋 Found existing data for ${config.name}`);
        }
    } catch {
        console.log(`  ⚠️  Could not read existing ${config.yamlFile}, creating new one`);
    }

    // Start with existing structure or create new
    const yamlData = {
        _nominatim_url: config.nominatimUrl || existingData._nominatim_url,
        PH: []
    };

    // Get current year holidays from date-holidays
    const currentYear = new Date().getFullYear();
    const holidays = getHolidaysForCountry(countryCode, currentYear);

    if (holidays.length > 0) {
        // Convert holidays to our format
        const convertedHolidays = holidays.map(holiday => convertHoliday(holiday));
        
        // Remove duplicates based on name
        const uniqueHolidays = convertedHolidays.filter((holiday, index, self) => 
            index === self.findIndex(h => h.name === holiday.name)
        );

        yamlData.PH = uniqueHolidays;
        console.log(`  ✅ Generated ${uniqueHolidays.length} public holidays from date-holidays`);
    } else {
        // Fallback to existing PH data if date-holidays fails
        if (existingData.PH) {
            yamlData.PH = existingData.PH;
            console.log(`  📁 Preserved existing ${existingData.PH.length} public holidays`);
        }
    }

    // Preserve all non-PH data from existing file (like state-specific data, SH, etc.)
    Object.keys(existingData).forEach(key => {
        if (key !== 'PH' && key !== '_nominatim_url') {
            yamlData[key] = existingData[key];
            console.log(`  📋 Preserved section: ${key}`);
        }
    });

    return '---\n\n' + stringify(yamlData, {
        indent: 2,
        lineWidth: 0,
        minContentWidth: 0
    });
}

/**
 * Main function
 */
function main() {
    console.log('🚀 Generating holiday YAML files from date-holidays package...\n');

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
            const yamlContent = generateYamlForCountry(countryCode, config);
            const filePath = path.join(holidaysDir, config.yamlFile);
            
            // Add header comment
            const header = `---
# Generated automatically from date-holidays package
# Country: ${config.name} (${countryCode})
# Generated on: ${new Date().toISOString()}
# Source: https://www.npmjs.com/package/date-holidays

`;
            
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

    // Generate index file
    try {
        const indexContent = `// Generated automatically from date-holidays package
// This file exports all holiday definitions

${Object.values(COUNTRY_CONFIGS).map(config => {
    const countryName = config.yamlFile.replace('.yaml', '');
    return `export { default as ${countryName} } from './${config.yamlFile}';`;
}).join('\n')}
`;
        
        fs.writeFileSync(path.join(holidaysDir, 'index.js'), indexContent);
        console.log('✅ Generated index.js');
    } catch (error) {
        console.error('❌ Failed to generate index.js:', error.message);
    }

    console.log('\n📋 Next steps:');
    console.log('1. Run `npm run build` to rebuild the library');
    console.log('2. Run `npm test` to verify everything works');
    console.log('3. Add this script to your build process for automatic updates');
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = {
    generateYamlForCountry,
    COUNTRY_CONFIGS,
    main
};
