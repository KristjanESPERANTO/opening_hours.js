import Holidays from 'date-holidays';

/**
 * Adapter für date-holidays, um die lokalen Holiday-Definitionen zu ersetzen
 */
class DateHolidaysAdapter {
    constructor() {
        // Mapping der opening_hours.js Länder-Codes zu date-holidays Codes
        this.countryMapping = {
            'ar': 'AR',  // Argentinien
            'at': 'AT',  // Österreich
            'au': 'AU',  // Australien
            'be': 'BE',  // Belgien
            'br': 'BR',  // Brasilien
            'ca': 'CA',  // Kanada
            'ch': 'CH',  // Schweiz
            'ci': 'CI',  // Elfenbeinküste
            'cn': 'CN',  // China
            'cz': 'CZ',  // Tschechien
            'de': 'DE',  // Deutschland
            'dk': 'DK',  // Dänemark
            'es': 'ES',  // Spanien
            'fi': 'FI',  // Finnland
            'fr': 'FR',  // Frankreich
            'gb': 'GB',  // Großbritannien
            'gr': 'GR',  // Griechenland
            'hr': 'HR',  // Kroatien
            'hu': 'HU',  // Ungarn
            'ie': 'IE',  // Irland
            'it': 'IT',  // Italien
            'jp': 'JP',  // Japan
            'lu': 'LU',  // Luxemburg
            'na': 'NA',  // Namibia
            'nl': 'NL',  // Niederlande
            'no': 'NO',  // Norwegen
            'nz': 'NZ',  // Neuseeland
            'pl': 'PL',  // Polen
            'ro': 'RO',  // Rumänien
            'ru': 'RU',  // Russland
            'se': 'SE',  // Schweden
            'si': 'SI',  // Slowenien
            'sk': 'SK',  // Slowakei
            'ua': 'UA',  // Ukraine
            'us': 'US',  // USA
            'vn': 'VN',  // Vietnam
            'xa': 'XA'   // Fallback/Test
        };

        // State/Region-Mapping für Deutschland (von opening_hours.js zu date-holidays)
        this.stateMapping = {
            'de': {
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
            }
            // Weitere Länder können hier hinzugefügt werden
        };
    }

    /**
     * Holt die Feiertage für ein bestimmtes Land und Jahr
     * @param {string} countryCode - Ländercode (z.B. 'de', 'at')
     * @param {string|null} state - Staat/Region (z.B. 'Baden-Württemberg')
     * @param {number} year - Jahr
     * @param {string} type - Typ der Feiertage ('PH' für public holidays, 'SH' für school holidays)
     * @returns {Array} Array von Holiday-Objekten
     */
    getHolidays(countryCode, state, year, type = 'PH') {
        const mappedCountry = this.countryMapping[countryCode.toLowerCase()];
        if (!mappedCountry) {
            return [];
        }

        let hd;
        let mappedState = null;

        // State-Mapping prüfen
        if (state && this.stateMapping[countryCode.toLowerCase()]) {
            mappedState = this.stateMapping[countryCode.toLowerCase()][state];
        }

        // Holidays-Instanz erstellen
        if (mappedState) {
            hd = new Holidays(mappedCountry, mappedState);
        } else {
            hd = new Holidays(mappedCountry);
        }

        const holidays = hd.getHolidays(year);

        // Filtern nach Typ
        let filteredHolidays = holidays;
        if (type === 'PH') {
            // Nur öffentliche Feiertage
            filteredHolidays = holidays.filter(h => h.type === 'public');
        } else if (type === 'SH') {
            // Schulferien
            filteredHolidays = holidays.filter(h => h.type === 'school');
        }

        // In das opening_hours.js Format konvertieren
        return this.convertToOpeningHoursFormat(filteredHolidays);
    }

    /**
     * Konvertiert date-holidays Format zum opening_hours.js Format
     * @param {Array} holidays - Array von date-holidays Holiday-Objekten
     * @returns {Array} Array im opening_hours.js Format
     */
    convertToOpeningHoursFormat(holidays) {
        return holidays.map(holiday => {
            const date = new Date(holiday.date);
            const result = {
                name: holiday.name
            };

            // Bekannte bewegliche Feiertage erkennen und als variable_date definieren
            const variableHolidays = {
                'Karfreitag': { variable_date: 'easter', offset: -2 },
                'Good Friday': { variable_date: 'easter', offset: -2 },
                'Ostersonntag': { variable_date: 'easter', offset: 0 },
                'Easter Sunday': { variable_date: 'easter', offset: 0 },
                'Ostermontag': { variable_date: 'easter', offset: 1 },
                'Easter Monday': { variable_date: 'easter', offset: 1 },
                'Christi Himmelfahrt': { variable_date: 'easter', offset: 39 },
                'Ascension Day': { variable_date: 'easter', offset: 39 },
                'Pfingstsonntag': { variable_date: 'easter', offset: 49 },
                'Whit Sunday': { variable_date: 'easter', offset: 49 },
                'Pfingstmontag': { variable_date: 'easter', offset: 50 },
                'Whit Monday': { variable_date: 'easter', offset: 50 },
                'Fronleichnam': { variable_date: 'easter', offset: 60 },
                'Corpus Christi': { variable_date: 'easter', offset: 60 }
            };

            if (variableHolidays[holiday.name]) {
                Object.assign(result, variableHolidays[holiday.name]);
            } else {
                // Fixed date format: [month, day]
                result.fixed_date = [date.getMonth() + 1, date.getDate()];
            }

            // Zusätzliche Eigenschaften falls vorhanden
            if (holiday.substitute) {
                result.substitute = true;
            }

            return result;
        });
    }    /**
     * Erstellt ein holiday_definitions-kompatibles Objekt
     * @returns {Object} Holiday definitions im gleichen Format wie die lokalen YAML-Dateien
     */
    generateHolidayDefinitions() {
        const definitions = {};

        Object.keys(this.countryMapping).forEach(countryCode => {
            definitions[countryCode] = {
                PH: [],
                SH: []
            };

            // Beispieljahr für die Struktur verwenden
            const currentYear = new Date().getFullYear();
            
            try {
                const phHolidays = this.getHolidays(countryCode, null, currentYear, 'PH');
                const shHolidays = this.getHolidays(countryCode, null, currentYear, 'SH');

                definitions[countryCode].PH = phHolidays;
                definitions[countryCode].SH = shHolidays;

                // States hinzufügen falls vorhanden
                if (this.stateMapping[countryCode]) {
                    Object.keys(this.stateMapping[countryCode]).forEach(stateName => {
                        const stateCode = this.stateMapping[countryCode][stateName];
                        definitions[countryCode][stateName] = {
                            _state_code: stateCode,
                            PH: this.getHolidays(countryCode, stateName, currentYear, 'PH'),
                            SH: this.getHolidays(countryCode, stateName, currentYear, 'SH')
                        };
                    });
                }
            } catch (error) {
                console.warn(`Fehler beim Laden der Feiertage für ${countryCode}:`, error.message);
            }
        });

        return definitions;
    }
}

export default DateHolidaysAdapter;
