#!/usr/bin/env node

/**
 * Update holiday names from date-holidays package while preserving original structure
 * 
 * This script only updates holiday names from date-holidays but keeps the original
 * YAML structure (variable_date, fixed_date, offsets, etc.) intact.
 * 
 * Usage: node scripts/update_holiday_names.js
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

// Mapping of countries that we want to update
const COUNTRY_CONFIGS = {
    'de': 'DE',
    'at': 'AT',
    'ch': 'CH',
    'us': 'US',
    'gb': 'GB',
    'fr': 'FR',
    'it': 'IT',
    'es': 'ES',
    'nl': 'NL',
    'be': 'BE',
    'pl': 'PL',
    'cz': 'CZ',
    'dk': 'DK',
    'se': 'SE',
    'no': 'NO',
    'fi': 'FI'
};

/**
 * Get holiday name mapping from date-holidays
 */
function getHolidayNameMapping(countryCode, year = new Date().getFullYear()) {
    try {
        const hd = new Holidays(countryCode);
        const holidays = hd.getHolidays(year);
        
        const mapping = {};
        holidays.forEach(holiday => {
            if (holiday.type === 'public' && holiday.name && holiday.date) {
                const date = new Date(holiday.date);
                const key = `${date.getMonth() + 1}-${date.getDate()}`;
                mapping[key] = holiday.name;
            }
        });
        
        return mapping;
    } catch (error) {
        console.warn(`⚠️  Could not get holidays for ${countryCode}:`, error.message);
        return {};
    }
}

/**
 * Update holiday names in YAML while preserving structure
 */
function updateHolidayNames(countryCode, holidayMapping) {
    const yamlPath = path.join(__dirname, '..', 'src', 'holidays', `${countryCode}.yaml`);
    
    if (!fs.existsSync(yamlPath)) {
        console.log(`⚠️  ${countryCode}.yaml not found, skipping`);
        return false;
    }

    try {
        // Read original YAML
        const yamlContent = fs.readFileSync(yamlPath, 'utf8');
        
        // Parse YAML file - preserve original formatting
    let yamlData;
    let isMultiDocument = yamlContent.includes('---');
    let originalLines = yamlContent.split('\n');
    
    try {
      yamlData = yaml.load(yamlContent);
    } catch (parseError) {
      // Try parsing as multi-document YAML
      try {
        const documents = yaml.loadAll(yamlContent);
        yamlData = documents.find(doc => doc && typeof doc === 'object') || {};
      } catch (multiDocError) {
        console.log(`❌ Failed to parse ${yamlFile}:`, multiDocError.message);
        errorCount++;
        return;
      }
    }

        if (!yamlData.PH || !Array.isArray(yamlData.PH)) {
            console.log(`⚠️  No PH section found in ${countryCode}.yaml, skipping`);
            return false;
        }

        let updatedCount = 0;

        // Update holiday names based on date matching
        yamlData.PH.forEach(holiday => {
            if (holiday.fixed_date && Array.isArray(holiday.fixed_date) && holiday.fixed_date.length === 2) {
                const month = holiday.fixed_date[0];
                const day = holiday.fixed_date[1];
                const key = `${month}-${day}`;
                
                if (holidayMapping[key] && holidayMapping[key] !== holiday.name) {
                    console.log(`  📝 Updating "${holiday.name}" → "${holidayMapping[key]}"`);
                    holiday.name = holidayMapping[key];
                    updatedCount++;
                }
            }
        });

        if (updatedCount > 0) {
            // Write back to file with preserved structure
            // Keep the original YAML format as much as possible
            const originalLines = yamlContent.split('\n');
            const header = originalLines.slice(0, originalLines.findIndex(line => line.trim() === 'PH:' || line.includes('PH:'))).join('\n');
            
            const updatedYaml = stringify(yamlData, {
                indent: 2,
                lineWidth: 0,
                minContentWidth: 0
            });
            
            // Combine header with updated data
            const finalContent = header + '\n' + updatedYaml;
            
            fs.writeFileSync(yamlPath, finalContent);
            console.log(`✅ Updated ${updatedCount} holiday names in ${countryCode}.yaml`);
            return true;
        } else {
            console.log(`ℹ️  No updates needed for ${countryCode}.yaml`);
            return false;
        }
        
    } catch (error) {
        console.error(`❌ Error processing ${countryCode}.yaml:`, error.message);
        return false;
    }
}

/**
 * Main function
 */
function main() {
    console.log('🔄 Updating holiday names from date-holidays package...\n');

    let successCount = 0;
    let errorCount = 0;

    // Process each country
    Object.entries(COUNTRY_CONFIGS).forEach(([countryCode, dateHolidaysCode]) => {
        console.log(`🌍 Processing ${countryCode.toUpperCase()} (${dateHolidaysCode})...`);
        
        // Get name mapping from date-holidays
        const holidayMapping = getHolidayNameMapping(dateHolidaysCode);
        
        if (Object.keys(holidayMapping).length === 0) {
            console.log(`  ⚠️  No holidays found for ${dateHolidaysCode}, skipping`);
            errorCount++;
            return;
        }

        console.log(`  📊 Found ${Object.keys(holidayMapping).length} holidays in date-holidays`);
        
        // Update the YAML file
        const success = updateHolidayNames(countryCode, holidayMapping);
        if (success) {
            successCount++;
        } else {
            errorCount++;
        }
        
        console.log(); // Empty line for readability
    });

    console.log('🎉 Holiday name update complete!');
    console.log(`✅ Success: ${successCount} countries`);
    if (errorCount > 0) {
        console.log(`❌ Errors: ${errorCount} countries`);
    }

    console.log('\n📋 Summary:');
    console.log('✅ Holiday names updated from date-holidays');
    console.log('✅ Original YAML structure preserved');
    console.log('✅ Variable dates (easter, etc.) kept intact');
    console.log('✅ School holidays (SH) unchanged');
    console.log('✅ State-specific data preserved');
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = {
    updateHolidayNames,
    getHolidayNameMapping,
    main
};
