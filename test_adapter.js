const DateHolidaysAdapter = require('./src/date-holidays-adapter');

console.log('=== Test des DateHolidaysAdapter ===\n');

const adapter = new DateHolidaysAdapter();

// Test für Deutschland
console.log('--- Test für Deutschland (ohne Bundesland) ---');
const deHolidays = adapter.getHolidays('de', null, 2024, 'PH');
console.log(`Anzahl Feiertage für Deutschland 2024: ${deHolidays.length}`);
deHolidays.slice(0, 5).forEach(holiday => {
    if (holiday.fixed_date) {
        console.log(`- ${holiday.name}: [${holiday.fixed_date[0]}, ${holiday.fixed_date[1]}] (fixed)`);
    } else if (holiday.variable_date) {
        console.log(`- ${holiday.name}: ${holiday.variable_date} offset ${holiday.offset || 0} (variable)`);
    }
});

// Test für Deutschland mit Bundesland
console.log('\n--- Test für Deutschland (Baden-Württemberg) ---');
const deBwHolidays = adapter.getHolidays('de', 'Baden-Württemberg', 2024, 'PH');
console.log(`Anzahl Feiertage für Baden-Württemberg 2024: ${deBwHolidays.length}`);
deBwHolidays.slice(0, 5).forEach(holiday => {
    if (holiday.fixed_date) {
        console.log(`- ${holiday.name}: [${holiday.fixed_date[0]}, ${holiday.fixed_date[1]}] (fixed)`);
    } else if (holiday.variable_date) {
        console.log(`- ${holiday.name}: ${holiday.variable_date} offset ${holiday.offset || 0} (variable)`);
    }
});

// Test für andere Länder
console.log('\n--- Test für andere Länder ---');
const countries = ['at', 'fr', 'us'];
countries.forEach(country => {
    const holidays = adapter.getHolidays(country, null, 2024, 'PH');
    console.log(`${country.toUpperCase()}: ${holidays.length} Feiertage`);
    if (holidays.length > 0) {
        const firstHoliday = holidays[0];
        if (firstHoliday.fixed_date) {
            console.log(`  Beispiel: ${firstHoliday.name}: [${firstHoliday.fixed_date[0]}, ${firstHoliday.fixed_date[1]}]`);
        } else if (firstHoliday.variable_date) {
            console.log(`  Beispiel: ${firstHoliday.name}: ${firstHoliday.variable_date} offset ${firstHoliday.offset || 0}`);
        }
    }
});

// Test der generateHolidayDefinitions Methode
console.log('\n--- Test der generateHolidayDefinitions Methode ---');
console.log('Generiere Holiday-Definitionen...');
const definitions = adapter.generateHolidayDefinitions();
console.log(`Anzahl unterstützter Länder: ${Object.keys(definitions).length}`);

// Beispiel für Deutschland
if (definitions.de) {
    console.log(`Deutschland - PH: ${definitions.de.PH.length} Feiertage`);
    console.log(`Deutschland - SH: ${definitions.de.SH.length} Schulferien`);
    
    if (definitions.de['Baden-Württemberg']) {
        console.log(`Baden-Württemberg - PH: ${definitions.de['Baden-Württemberg'].PH.length} Feiertage`);
        console.log(`Baden-Württemberg - SH: ${definitions.de['Baden-Württemberg'].SH.length} Schulferien`);
    }
}

console.log('\n=== Test abgeschlossen ===');
