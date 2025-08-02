const opening_hours = require('./build/opening_hours.js');

console.log('=== Test der opening_hours.js Integration mit date-holidays ===\n');

// Test für Deutschland (sollte date-holidays verwenden falls verfügbar)
const nominatim_de = {
    address: {
        country_code: 'de',
        state: 'Baden-Württemberg'
    },
    lat: '49.5400039',
    lon: '9.7937133'
};

console.log('--- Test für Deutschland mit Baden-Württemberg ---');
try {
    // Test mit "PH off" - an Feiertagen geschlossen
    const oh = new opening_hours('Mo-Fr 09:00-17:00; PH off', nominatim_de);
    console.log('Opening hours parser erfolgreich erstellt');
    
    // Test mit einem konkreten Datum
    const testDate = new Date('2024-01-06'); // Heilige Drei Könige in BW
    const isOpen = oh.getState(testDate);
    console.log(`Am 6. Januar 2024 (Heilige Drei Könige): ${isOpen ? 'geöffnet' : 'geschlossen'}`);
    
    // Test für andere Feiertage
    const easterMonday2024 = new Date('2024-04-01'); // Ostermontag 2024
    const isOpenEaster = oh.getState(easterMonday2024);
    console.log(`Am Ostermontag 2024: ${isOpenEaster ? 'geöffnet' : 'geschlossen'}`);
    
    // Test für normalen Werktag
    const normalDay = new Date('2024-01-08 10:00:00'); // Montag, 10 Uhr
    const isOpenNormal = oh.getState(normalDay);
    console.log(`Am Montag, 8. Januar 2024, 10:00 Uhr: ${isOpenNormal ? 'geöffnet' : 'geschlossen'}`);
    
} catch (error) {
    console.error('Fehler beim Testen:', error.message);
}

// Test für anderes Land
console.log('\n--- Test für Österreich ---');
const nominatim_at = {
    address: {
        country_code: 'at'
    },
    lat: '48.2082',
    lon: '16.3738'
};

try {
    const oh_at = new opening_hours('Mo-Fr 09:00-17:00; PH off', nominatim_at);
    console.log('Opening hours parser für Österreich erfolgreich erstellt');
    
    const testDate_at = new Date('2024-01-06'); // Heilige Drei Könige auch in AT
    const isOpen_at = oh_at.getState(testDate_at);
    console.log(`Am 6. Januar 2024 in Österreich: ${isOpen_at ? 'geöffnet' : 'geschlossen'}`);
    
} catch (error) {
    console.error('Fehler beim Testen von Österreich:', error.message);
}

console.log('\n=== Test abgeschlossen ===');
