#!/usr/bin/env node

/**
 * Holiday Data Comparison Tool
 * Compares our YAML holiday data with date-holidays package and reports differences
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const Holidays = require('date-holidays');

// Easter calculation function
function calculateEaster(year) {
  const f = Math.floor;
  const G = year % 19;
  const C = f(year / 100);
  const H = (C - f(C / 4) - f((8 * C + 13) / 25) + 19 * G + 15) % 30;
  const I = H - f(H / 28) * (1 - f(29 / (H + 1)) * f((21 - G) / 11));
  const J = (year + f(year / 4) + I + 2 - C + f(C / 4)) % 7;
  const L = I - J;
  const month = 3 + f((L + 40) / 44);
  const day = L + 28 - 31 * f(month / 4);
  return new Date(year, month - 1, day);
}

// Calculate variable date based on rule
function calculateVariableDate(variableRule, offset, year) {
  if (variableRule === 'easter') {
    const easter = calculateEaster(year);
    if (offset) {
      easter.setDate(easter.getDate() + offset);
    }
    return easter;
  } else if (variableRule === 'nextWednesday16Nov') {
    // Buß- und Bettag: Wednesday before November 23rd (= Wednesday after November 16th)
    let date = new Date(year, 10, 16); // November 16th
    const dayOfWeek = date.getDay(); // 0 = Sunday, 3 = Wednesday
    const daysToWednesday = (3 - dayOfWeek + 7) % 7;
    if (daysToWednesday === 0 && date.getDate() === 16) {
      // If Nov 16 is already a Wednesday, take the next Wednesday
      date.setDate(date.getDate() + 7);
    } else {
      date.setDate(date.getDate() + daysToWednesday);
    }
    return date;
  }
  // Add more variable date calculations here if needed
  return null;
}

// German state mappings for date-holidays
const stateCodeMappings = {
  'Baden-Württemberg': 'bw',
  'Bayern': 'by', 
  'Berlin': 'be',
  'Brandenburg': 'bb',
  'Bremen': 'hb',
  'Hamburg': 'hh',
  'Hessen': 'he',
  'Mecklenburg-Vorpommern': 'mv',
  'Niedersachsen': 'ni',
  'Nordrhein-Westfalen': 'nw',
  'Rheinland-Pfalz': 'rp',
  'Saarland': 'sl',
  'Sachsen': 'sn',
  'Sachsen-Anhalt': 'st',
  'Schleswig-Holstein': 'sh',
  'Thüringen': 'th'
};

function getDateHolidaysData(countryCode, stateCode = null) {
  try {
    const hd = stateCode ? new Holidays(countryCode, stateCode) : new Holidays(countryCode);
    const holidays = hd.getHolidays(2024);
    
    const holidayMap = {};
    holidays.forEach(holiday => {
      if (holiday.type === 'public') { // Only public holidays
        const date = new Date(holiday.date);
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const key = `${month}-${day}`;
        
        holidayMap[key] = {
          name: holiday.name,
          month: month,
          day: day,
          rule: holiday.rule
        };
      }
    });
    
    return holidayMap;
  } catch (error) {
    console.log(`❌ Error getting date-holidays data for ${countryCode}${stateCode ? '-' + stateCode : ''}:`, error.message);
    return {};
  }
}

function parseOurHolidayData(yamlFile, year = 2024) {
  const yamlPath = path.join(__dirname, '..', 'src', 'holidays', yamlFile);
  
  if (!fs.existsSync(yamlPath)) {
    console.log(`❌ File not found: ${yamlFile}`);
    return { national: {}, regional: {} };
  }

  const content = fs.readFileSync(yamlPath, 'utf8');
  let yamlData;
  
  try {
    yamlData = yaml.load(content);
  } catch (parseError) {
    try {
      const documents = yaml.parseAllDocuments(content);
      yamlData = documents.find(doc => doc && doc.toJS && typeof doc.toJS() === 'object')?.toJS() || {};
    } catch (multiDocError) {
      console.log(`❌ Failed to parse ${yamlFile}:`, multiDocError.message);
      return { national: {}, regional: {} };
    }
  }

  const result = { national: {}, regional: {} };

  if (yamlData.PH) {
    yamlData.PH.forEach(holiday => {
      let holidayData = {
        name: holiday.name,
        states: holiday.only_states || []
      };

      if (holiday.fixed_date) {
        // Fixed date holiday
        const key = `${holiday.fixed_date[0]}-${holiday.fixed_date[1]}`;
        holidayData.month = holiday.fixed_date[0];
        holidayData.day = holiday.fixed_date[1];
        holidayData.type = 'fixed';

        if (holiday.only_states && holiday.only_states.length > 0) {
          // Regional holiday
          holiday.only_states.forEach(state => {
            if (!result.regional[state]) result.regional[state] = {};
            result.regional[state][key] = holidayData;
          });
        } else {
          // National holiday
          result.national[key] = holidayData;
        }
      } else if (holiday.variable_date) {
        // Variable date holiday - calculate actual date for comparison
        const calculatedDate = calculateVariableDate(holiday.variable_date, holiday.offset || 0, year);
        
        if (calculatedDate) {
          const month = calculatedDate.getMonth() + 1;
          const day = calculatedDate.getDate();
          const key = `${month}-${day}`;
          
          holidayData.month = month;
          holidayData.day = day;
          holidayData.type = 'variable';
          holidayData.variable_rule = holiday.variable_date;
          holidayData.offset = holiday.offset || 0;

          if (holiday.only_states && holiday.only_states.length > 0) {
            // Regional variable holiday
            holiday.only_states.forEach(state => {
              if (!result.regional[state]) result.regional[state] = {};
              result.regional[state][key] = holidayData;
            });
          } else {
            // National variable holiday
            result.national[key] = holidayData;
          }
        } else {
          console.log(`⚠️  Could not calculate variable date for: ${holiday.name} (${holiday.variable_date})`);
        }
      }
    });
  }

  return result;
}

function compareHolidayData(ourData, dateHolidaysData, nationalData = {}) {
  const differences = {
    onlyInOurs: [],
    onlyInDateHolidays: [],
    nameDifferences: [],
    dateDifferences: []
  };

  // Check holidays only in our data
  Object.keys(ourData).forEach(key => {
    if (!dateHolidaysData[key]) {
      differences.onlyInOurs.push({
        key,
        name: ourData[key].name,
        date: `${ourData[key].month}/${ourData[key].day}`
      });
    } else {
      // Check name differences
      if (ourData[key].name !== dateHolidaysData[key].name) {
        differences.nameDifferences.push({
          key,
          ourName: ourData[key].name,
          dateHolidaysName: dateHolidaysData[key].name,
          date: `${ourData[key].month}/${ourData[key].day}`
        });
      }
    }
  });

  // Check holidays only in date-holidays
  Object.keys(dateHolidaysData).forEach(key => {
    if (!ourData[key]) {
      // Check if this holiday exists as a national holiday
      const isNationalHoliday = nationalData[key] && 
        nationalData[key].name === dateHolidaysData[key].name;
      
      if (!isNationalHoliday) {
        differences.onlyInDateHolidays.push({
          key,
          name: dateHolidaysData[key].name,
          date: `${dateHolidaysData[key].month}/${dateHolidaysData[key].day}`
        });
      }
    }
  });

  return differences;
}

function printDifferences(differences, region) {
  console.log(`\n📊 === ${region} ===`);
  
  if (differences.onlyInOurs.length > 0) {
    console.log(`\n🔵 Nur in unseren Daten (${differences.onlyInOurs.length}):`);
    differences.onlyInOurs.forEach(item => {
      console.log(`  - ${item.name} (${item.date})`);
    });
  }

  if (differences.onlyInDateHolidays.length > 0) {
    console.log(`\n🟠 Nur in date-holidays (${differences.onlyInDateHolidays.length}):`);
    differences.onlyInDateHolidays.forEach(item => {
      console.log(`  - ${item.name} (${item.date})`);
    });
  }

  if (differences.nameDifferences.length > 0) {
    console.log(`\n🟡 Name-Unterschiede (${differences.nameDifferences.length}):`);
    differences.nameDifferences.forEach(item => {
      console.log(`  - ${item.date}: "${item.ourName}" vs "${item.dateHolidaysName}"`);
    });
  }

  if (differences.onlyInOurs.length === 0 && 
      differences.onlyInDateHolidays.length === 0 && 
      differences.nameDifferences.length === 0) {
    console.log('✅ Keine Unterschiede gefunden');
  }
}

function main() {
  console.log('🔍 Vergleiche Holiday-Daten: Unsere YAML vs date-holidays\n');

  const country = process.argv[2] || 'de';
  const countryCode = country.toUpperCase();

  console.log(`🌍 Analysiere ${countryCode}...`);

  // Parse our holiday data
  const ourData = parseOurHolidayData(`${country}.yaml`);
  
  // Get national holidays from date-holidays
  const nationalDateHolidays = getDateHolidaysData(countryCode);
  
  // Compare national holidays
  const nationalDifferences = compareHolidayData(ourData.national, nationalDateHolidays);
  printDifferences(nationalDifferences, 'Nationale Feiertage');

  // Compare regional holidays
  if (countryCode === 'DE') {
    Object.keys(stateCodeMappings).forEach(stateName => {
      const stateCode = stateCodeMappings[stateName];
      const ourRegionalData = ourData.regional[stateName] || {};
      
      if (Object.keys(ourRegionalData).length > 0) {
        const regionalDateHolidays = getDateHolidaysData(countryCode, stateCode);
        // Pass national data to exclude national holidays from regional differences
        const regionalDifferences = compareHolidayData(ourRegionalData, regionalDateHolidays, ourData.national);
        printDifferences(regionalDifferences, `${stateName} (${stateCode})`);
      }
    });
  }

  console.log('\n🎉 Vergleich abgeschlossen!');
  console.log('\n📋 Nächste Schritte:');
  console.log('1. Recherchiere bei Unterschieden, welche Quelle korrekt ist');
  console.log('2. Aktualisiere entsprechend unsere YAML-Daten oder melde Fehler an date-holidays');
  console.log('3. Nutze update_holiday_names_preserve_structure.js für Korrekturen');
}

if (require.main === module) {
  main();
}
