/**
 * Enhanced holiday definitions using date-holidays package
 * This can be used as a drop-in replacement for the local YAML files
 */

let dateHolidaysAvailable = false;
let DateHolidaysAdapter = null;
let adapter = null;

// Versuche date-holidays zu laden
try {
    // Dynamischer Import um Fehler zu vermeiden wenn date-holidays nicht verfügbar ist
    DateHolidaysAdapter = require('../date-holidays-adapter');
    adapter = new DateHolidaysAdapter();
    dateHolidaysAvailable = true;
} catch (error) {
    console.warn('date-holidays not available, falling back to local definitions:', error.message);
}

// Fallback: Importiere lokale Definitionen
import * as localHolidays from './index';

/**
 * Enhanced getMatchingHoliday function that uses date-holidays when available
 * @param {string} location_cc - Country code
 * @param {string} location_state - State/region name
 * @param {string} type_of_holidays - 'PH' or 'SH'
 * @returns {Array} Holiday definitions
 */
function getMatchingHolidayEnhanced(location_cc, location_state, type_of_holidays) {
    if (dateHolidaysAvailable && adapter) {
        try {
            const currentYear = new Date().getFullYear();
            return adapter.getHolidays(location_cc, location_state, currentYear, type_of_holidays);
        } catch (error) {
            console.warn(`Error getting holidays from date-holidays for ${location_cc}:`, error.message);
        }
    }
    
    // Fallback zu lokalen Definitionen
    if (localHolidays[location_cc]) {
        if (location_state && localHolidays[location_cc][location_state] && localHolidays[location_cc][location_state][type_of_holidays]) {
            return localHolidays[location_cc][location_state][type_of_holidays];
        } else if (localHolidays[location_cc][type_of_holidays]) {
            return localHolidays[location_cc][type_of_holidays];
        }
    }
    
    return [];
}

// Erweiterte Holiday-Definitionen mit date-holidays Integration
const enhancedHolidayDefinitions = new Proxy(localHolidays, {
    get(target, prop) {
        if (prop === 'getMatchingHolidayEnhanced') {
            return getMatchingHolidayEnhanced;
        }
        
        if (dateHolidaysAvailable && adapter && typeof prop === 'string' && prop.length === 2) {
            // Versuche Daten von date-holidays zu holen
            try {
                const currentYear = new Date().getFullYear();
                const dynamicData = {
                    PH: adapter.getHolidays(prop, null, currentYear, 'PH'),
                    SH: adapter.getHolidays(prop, null, currentYear, 'SH')
                };
                
                // Füge state-spezifische Daten hinzu falls verfügbar
                if (adapter.stateMapping[prop]) {
                    Object.keys(adapter.stateMapping[prop]).forEach(stateName => {
                        dynamicData[stateName] = {
                            _state_code: adapter.stateMapping[prop][stateName],
                            PH: adapter.getHolidays(prop, stateName, currentYear, 'PH'),
                            SH: adapter.getHolidays(prop, stateName, currentYear, 'SH')
                        };
                    });
                }
                
                // Merge mit lokalen Daten falls vorhanden
                if (target[prop]) {
                    return { ...target[prop], ...dynamicData };
                } else {
                    return dynamicData;
                }
            } catch (error) {
                console.warn(`Error generating dynamic holidays for ${prop}:`, error.message);
            }
        }
        
        return target[prop];
    }
});

// Für Rückwärtskompatibilität: alle ursprünglichen Exporte
Object.keys(localHolidays).forEach(key => {
    enhancedHolidayDefinitions[key] = enhancedHolidayDefinitions[key]; // Trigger Proxy
});

export default enhancedHolidayDefinitions;

// Named exports für Kompatibilität
export * from './index';
