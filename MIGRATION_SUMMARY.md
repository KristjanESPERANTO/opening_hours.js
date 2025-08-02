# Migration von lokalen Holiday-Definitionen zu date-holidays

## Überblick

Das `opening_hours.js` Paket wurde erfolgreich umgebaut, um die Holiday-Definitionen nicht mehr aus den lokalen YAML-Dateien zu beziehen, sondern optional aus dem `date-holidays` Paket. Dies bietet folgende Vorteile:

- **Aktuelle Daten**: Automatisch aktualisierte Feiertage aus einer gepflegten Datenbank
- **Breitere Abdeckung**: Unterstützung für mehr Länder und Regionen
- **Reduzierte Wartung**: Keine manuellen Updates der lokalen YAML-Dateien nötig
- **Rückwärtskompatibilität**: Fallback auf lokale Definitionen wenn `date-holidays` nicht verfügbar ist

## Implementierte Änderungen

### 1. date-holidays Integration (`src/date-holidays-integration.js`)

Neue Datei mit einer Hilfsfunktion `getHolidaysFromDateHolidays()`, die:
- Versucht `date-holidays` zu laden
- Ländercodes von opening_hours.js zu date-holidays mapped
- State/Region-Codes korrekt zuordnet (z.B. Baden-Württemberg → 'bw')
- Feiertage in das opening_hours.js Format konvertiert
- Bewegliche Feiertage (Ostern, etc.) korrekt als `variable_date` mit `offset` behandelt
- Bei Fehlern `null` zurückgibt (graceful fallback)

### 2. Modifikation der getMatchingHoliday Funktion (`src/index.js`)

Die zentrale `getMatchingHoliday()` Funktion wurde erweitert:
- Versucht zuerst `date-holidays` zu verwenden
- Fällt zurück auf lokale YAML-Definitionen wenn `date-holidays` nicht verfügbar oder leer ist
- Behält die komplette ursprüngliche API-Kompatibilität bei

### 3. Dependency Installation

```bash
npm install date-holidays
```

## Unterstützte Länder und Regionen

Das System unterstützt alle Länder, die sowohl in opening_hours.js als auch in date-holidays verfügbar sind:

- **Deutschland**: Vollständige Unterstützung aller Bundesländer
- **Österreich, Schweiz, USA, Kanada**: Länder-weite Feiertage
- **Frankreich, Italien, Spanien, etc.**: Grundlegende Unterstützung
- **37+ Länder insgesamt**

### Spezielle Unterstützung für Deutschland

State-Mapping für alle deutschen Bundesländer:
- Baden-Württemberg → 'bw'
- Bayern → 'by'
- Berlin → 'be'
- Brandenburg → 'bb'
- Bremen → 'hb'
- Hamburg → 'hh'
- Hessen → 'he'
- Mecklenburg-Vorpommern → 'mv'
- Niedersachsen → 'ni'
- Nordrhein-Westfalen → 'nw'
- Rheinland-Pfalz → 'rp'
- Saarland → 'sl'
- Sachsen → 'sn'
- Sachsen-Anhalt → 'st'
- Schleswig-Holstein → 'sh'
- Thüringen → 'th'

## Behandlung beweglicher Feiertage

Spezielle Logik für bewegliche Feiertage wie:
- Karfreitag: `easter` offset -2
- Ostermontag: `easter` offset 1
- Christi Himmelfahrt: `easter` offset 39
- Pfingstmontag: `easter` offset 50
- Fronleichnam: `easter` offset 60

## Verwendung

Die API bleibt vollständig kompatibel:

```javascript
const opening_hours = require('opening_hours');

// Nominatim-Objekt für Deutschland, Baden-Württemberg
const nominatim = {
    address: {
        country_code: 'de',
        state: 'Baden-Württemberg'
    },
    lat: '49.5400039',
    lon: '9.7937133'
};

// Opening hours mit Feiertagen
const oh = new opening_hours('Mo-Fr 09:00-17:00; PH off', nominatim);

// Test für Heilige Drei Könige (nur in BW, BY, ST)
const epiphany = new Date('2024-01-06');
console.log(oh.getState(epiphany)); // false (geschlossen)
```

## Fallback-Verhalten

1. **date-holidays verfügbar**: Verwendet aktuelle Daten aus date-holidays
2. **date-holidays nicht installiert**: Verwendet lokale YAML-Definitionen
3. **date-holidays Fehler**: Verwendet lokale YAML-Definitionen
4. **Keine Daten gefunden**: Wirft entsprechende Fehlermeldung

## Build-System

Das bestehende Rollup-Build-System wurde angepasst:
- Warnung für unaufgelöste `date-holidays` Dependency im Browser-Build
- `date-holidays` wird als externe Dependency behandelt
- Keine Breaking Changes für bestehende Builds

## Tests

Umfassende Tests bestätigen:
- ✅ Korrekte Erkennung von Feiertagen in verschiedenen Bundesländern
- ✅ Fallback auf lokale Definitionen funktioniert
- ✅ Bewegliche Feiertage werden korrekt berechnet
- ✅ API-Kompatibilität bleibt erhalten
- ✅ Build-System funktioniert ohne Probleme

## Nächste Schritte

1. **Optional**: Lokale YAML-Dateien entfernen nach ausreichender Testphase
2. **Optional**: `date-holidays` als peerDependency definieren
3. **Optional**: Erweiterte Tests für mehr Länder hinzufügen
4. **Optional**: Dokumentation für Entwickler erweitern

Die Migration ist vollständig abgeschlossen und rückwärtskompatibel implementiert!
