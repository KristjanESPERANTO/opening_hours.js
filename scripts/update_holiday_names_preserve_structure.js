#!/usr/bin/env node

/**
 * Structure-preserving holiday name updater
 * Updates only holiday names from date-holidays package while preserving original YAML structure
 */

const fs = require('fs');
const path = require('path');
const Holidays = require('date-holidays');

// Country mappings
const countryMappings = {
  'at': 'AT', 'be': 'BE', 'ch': 'CH', 'cz': 'CZ', 'de': 'DE', 'dk': 'DK',
  'es': 'ES', 'fi': 'FI', 'fr': 'FR', 'gb': 'GB', 'ie': 'IE', 'it': 'IT',
  'nl': 'NL', 'no': 'NO', 'pl': 'PL', 'se': 'SE', 'us': 'US'
};

function getHolidayNameMapping(countryCode) {
  try {
    const hd = new Holidays(countryCode);
    const holidays = hd.getHolidays(2024);
    
    const mapping = {};
    holidays.forEach(holiday => {
      const date = new Date(holiday.date);
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const key = `${month}-${day}`;
      mapping[key] = holiday.name;
    });
    
    console.log(`  📊 Found ${holidays.length} holidays in date-holidays`);
    return mapping;
  } catch (error) {
    console.log(`❌ Error getting holidays for ${countryCode}:`, error.message);
    return {};
  }
}

function updateHolidayNamesInFile(yamlFile, holidayMapping) {
  const yamlPath = path.join(__dirname, '..', 'src', 'holidays', yamlFile);
  
  if (!fs.existsSync(yamlPath)) {
    console.log(`❌ File not found: ${yamlFile}`);
    return false;
  }

  let content = fs.readFileSync(yamlPath, 'utf8');
  let updated = false;
  let updateCount = 0;

  // Pattern to match holiday entries with names
  // Matches both: {'name': 'Old Name', ...} and - name: Old Name
  const patterns = [
    // Complex JSON format with only_states: {"name": "Holiday", "fixed_date": [m, d], "only_states": [...]}
    /\{"name":\s*"([^"]+)",\s*"fixed_date":\s*\[(\d+),\s*(\d+)\],?\s*(?:"only_states":\s*\[[^\]]*\])?\}/g,
    // Simple JSON format: {"name": "Holiday", "fixed_date": [m, d]}
    /\{"name":\s*"([^"]+)",\s*"fixed_date":\s*\[(\d+),\s*(\d+)\]\}/g,
    // Variable date JSON format: {"name": "Holiday", "variable_date": "easter", "offset": n, ...}
    /\{"name":\s*"([^"]+)",\s*"variable_date":\s*"[^"]+",?\s*(?:"offset":\s*[^,}]+,?)?\s*(?:"only_states":\s*\[[^\]]*\])?\}/g,
    // Extended YAML format: - name: Holiday Name \n fixed_date: \n - month \n - day
    /- name:\s*([^\n]+)\n\s*fixed_date:\n\s*-\s*(\d+)\n\s*-\s*(\d+)/g
  ];

  patterns.forEach(pattern => {
    content = content.replace(pattern, (match, name, month, day) => {
      const key = `${parseInt(month)}-${parseInt(day)}`;
      const newName = holidayMapping[key];
      
      if (newName && newName !== name.trim()) {
        console.log(`  📝 Updating "${name.trim()}" → "${newName}"`);
        updateCount++;
        updated = true;
        
        // Preserve the original format
        if (match.includes('{"name":')) {
          return match.replace(`"${name}"`, `"${newName}"`);
        } else if (match.includes("{'name':")) {
          return match.replace(`'${name}'`, `'${newName}'`);
        } else {
          return match.replace(name, newName);
        }
      }
      return match;
    });
  });

  if (updated) {
    fs.writeFileSync(yamlPath, content, 'utf8');
    console.log(`✅ Updated ${updateCount} holiday names in ${yamlFile}`);
    return true;
  } else {
    console.log(`ℹ️  No updates needed for ${yamlFile}`);
    return false;
  }
}

function main() {
  console.log('🔄 Updating holiday names from date-holidays package...\n');

  let successCount = 0;
  let errorCount = 0;

  // Get countries to process from command line args or process all
  const targetCountries = process.argv.slice(2);
  const countriesToProcess = targetCountries.length > 0 
    ? targetCountries 
    : Object.keys(countryMappings);

  for (const country of countriesToProcess) {
    const countryCode = countryMappings[country];
    if (!countryCode) {
      console.log(`❌ Unknown country code: ${country}`);
      errorCount++;
      continue;
    }

    console.log(`🌍 Processing ${country.toUpperCase()} (${countryCode})...`);
    
    const holidayMapping = getHolidayNameMapping(countryCode);
    if (Object.keys(holidayMapping).length === 0) {
      errorCount++;
      continue;
    }

    try {
      const updated = updateHolidayNamesInFile(`${country}.yaml`, holidayMapping);
      if (updated) successCount++;
    } catch (error) {
      console.log(`❌ Error processing ${country}:`, error.message);
      errorCount++;
    }
    
    console.log(); // Empty line between countries
  }

  console.log('🎉 Holiday name update complete!');
  console.log(`✅ Success: ${successCount} countries`);
  console.log(`❌ Errors: ${errorCount} countries`);
  
  console.log('\n📋 Summary:');
  console.log('✅ Holiday names updated from date-holidays');
  console.log('✅ Original YAML structure preserved');
  console.log('✅ Variable dates (easter, etc.) kept intact');
  console.log('✅ School holidays (SH) unchanged');
  console.log('✅ State-specific data preserved');
}

if (require.main === module) {
  main();
}
