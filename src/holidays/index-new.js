/**
 * Holiday definitions using date-holidays package
 * Replaces the local YAML holiday files with dynamic data from date-holidays
 */

const DateHolidaysAdapter = require('../date-holidays-adapter');

// Erstelle eine Instanz des Adapters
const adapter = new DateHolidaysAdapter();

// Generiere die Holiday-Definitionen dynamisch
const holiday_definitions = adapter.generateHolidayDefinitions();

// Exportiere alle Länder einzeln (für Rückwärtskompatibilität)
module.exports = holiday_definitions;

// Named exports für Kompatibilität mit dem ursprünglichen Format
Object.keys(holiday_definitions).forEach(countryCode => {
    module.exports[countryCode] = holiday_definitions[countryCode];
});
