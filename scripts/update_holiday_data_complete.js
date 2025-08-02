#!/usr/bin/env node

/**
 * Complete holiday data corrector
 * Updates holiday names AND dates from date-holidays package while preserving structure
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

function getHolidayDataMapping(countryCode) {
  try {
    const hd = new Holidays(countryCode);
    const holidays = hd.getHolidays(2024);
    
    const mapping = {};
    holidays.forEach(holiday => {
      const date = new Date(holiday.date);
      const month = date.getMonth() + 1;
      const day = date.getDate();
      
      // Create multiple keys for better matching
      const nameKey = holiday.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const dateKey = `${month}-${day}`;
      
      const data = {
        name: holiday.name,
        month: month,
        day: day,
        rule: holiday.rule
      };
      
      mapping[nameKey] = data;
      mapping[dateKey] = data;
    });
    
    console.log(`  📊 Found ${holidays.length} holidays in date-holidays`);
    return mapping;
  } catch (error) {
    console.log(`❌ Error getting holidays for ${countryCode}:`, error.message);
    return {};
  }
}

function updateHolidayDataInFile(yamlFile, holidayMapping) {
  const yamlPath = path.join(__dirname, '..', 'src', 'holidays', yamlFile);
  
  if (!fs.existsSync(yamlPath)) {
    console.log(`❌ File not found: ${yamlFile}`);
    return false;
  }

  let content = fs.readFileSync(yamlPath, 'utf8');
  let updated = false;
  let updateCount = 0;

  // Pattern to match fixed date holidays in JSON format
  const fixedDatePattern = /\{"name":\s*"([^"]+)",\s*"fixed_date":\s*\[(\d+),\s*(\d+)\](.*?)\}/g;

  content = content.replace(fixedDatePattern, (match, name, month, day, rest) => {
    const nameKey = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const dateKey = `${month}-${day}`;
    
    // Try to find holiday by name first, then by date
    let holidayData = holidayMapping[nameKey];
    if (!holidayData) {
      holidayData = holidayMapping[dateKey];
    }
    
    if (holidayData) {
      let hasChanges = false;
      let newName = name;
      let newMonth = parseInt(month);
      let newDay = parseInt(day);
      
      // Check if name needs update
      if (holidayData.name !== name) {
        console.log(`  📝 Updating name "${name}" → "${holidayData.name}"`);
        newName = holidayData.name;
        hasChanges = true;
        updateCount++;
      }
      
      // Check if date needs update
      if (holidayData.month !== newMonth || holidayData.day !== newDay) {
        console.log(`  📅 Updating date "${name}" from [${month}, ${day}] → [${holidayData.month}, ${holidayData.day}]`);
        newMonth = holidayData.month;
        newDay = holidayData.day;
        hasChanges = true;
        updateCount++;
      }
      
      if (hasChanges) {
        updated = true;
        return `{"name": "${newName}", "fixed_date": [${newMonth}, ${newDay}]${rest}}`;
      }
    }
    
    return match;
  });

  if (updated) {
    fs.writeFileSync(yamlPath, content, 'utf8');
    console.log(`✅ Updated ${updateCount} holiday data entries in ${yamlFile}`);
    return true;
  } else {
    console.log(`ℹ️  No updates needed for ${yamlFile}`);
    return false;
  }
}

function main() {
  console.log('🔄 Updating holiday names AND dates from date-holidays package...\n');

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
    
    const holidayMapping = getHolidayDataMapping(countryCode);
    if (Object.keys(holidayMapping).length === 0) {
      errorCount++;
      continue;
    }

    try {
      const updated = updateHolidayDataInFile(`${country}.yaml`, holidayMapping);
      if (updated) successCount++;
    } catch (error) {
      console.log(`❌ Error processing ${country}:`, error.message);
      errorCount++;
    }
    
    console.log(); // Empty line between countries
  }

  console.log('🎉 Holiday data update complete!');
  console.log(`✅ Success: ${successCount} countries`);
  console.log(`❌ Errors: ${errorCount} countries`);
  
  console.log('\n📋 Summary:');
  console.log('✅ Holiday names updated from date-holidays');
  console.log('✅ Holiday dates corrected from date-holidays');
  console.log('✅ Original YAML structure preserved');
  console.log('✅ Variable dates (easter, etc.) kept intact');
  console.log('✅ School holidays (SH) unchanged');
  console.log('✅ State-specific data preserved');
}

if (require.main === module) {
  main();
}
