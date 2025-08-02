const Holidays = require('date-holidays');

// Test verschiedene Länder
const countries = ['DE', 'AT', 'US', 'FR'];

countries.forEach(country => {
    console.log(`\n=== ${country} ===`);
    
    const hd = new Holidays(country);
    
    // Hole Feiertage für 2024
    const holidays2024 = hd.getHolidays(2024);
    
    console.log(`Anzahl Feiertage in ${country} für 2024:`, holidays2024.length);
    
    // Zeige erste 5 Feiertage
    holidays2024.slice(0, 5).forEach(holiday => {
        console.log(`- ${holiday.name}: ${holiday.date} (${holiday.type})`);
    });
});

// Test für Deutschland mit Bundesland
console.log('\n=== Deutschland mit Bundesland (Baden-Württemberg) ===');
const hdDE_BW = new Holidays('DE', 'bw');
const holidaysDE_BW = hdDE_BW.getHolidays(2024);
console.log('Anzahl Feiertage in Baden-Württemberg für 2024:', holidaysDE_BW.length);

holidaysDE_BW.slice(0, 8).forEach(holiday => {
    console.log(`- ${holiday.name}: ${holiday.date} (${holiday.type})`);
});

// Verfügbare Länder anzeigen
console.log('\n=== Verfügbare Länder ===');
const hdForCountries = new Holidays();
const availableCountries = hdForCountries.getCountries();
console.log('Erste 10 verfügbare Länder:', Object.keys(availableCountries).slice(0, 10));

// Verfügbare Staaten für Deutschland
console.log('\n=== Verfügbare Staaten für Deutschland ===');
const hdDE = new Holidays('DE');
const statesDE = hdDE.getStates();
if (statesDE) {
    console.log('Verfügbare deutsche Bundesländer:', Object.keys(statesDE));
} else {
    console.log('Keine Staaten verfügbar für Deutschland');
}

// Test verschiedene State-Codes für Deutschland
console.log('\n=== Test verschiedener State-Codes für Deutschland ===');
const testStates = ['bw', 'by', 'be', 'bb', 'hb', 'hh', 'he', 'mv', 'ni', 'nw', 'rp', 'sl', 'sn', 'st', 'sh', 'th'];
testStates.forEach(state => {
    try {
        const hdState = new Holidays('DE', state);
        const holidays = hdState.getHolidays(2024);
        console.log(`${state}: ${holidays.length} Feiertage`);
    } catch (error) {
        console.log(`${state}: Error - ${error.message}`);
    }
});

// Teste direkten Zugriff auf holiday data structure
console.log('\n=== Test interner API ===');
const hdTest = new Holidays('DE', 'bw');
console.log('Verfügbare Methoden:', Object.getOwnPropertyNames(Object.getPrototypeOf(hdTest)));
