# Migration: Public Holidays → date-holidays

## Zusammenfassung

Migration von lokalen YAML-Dateien zu **date-holidays** npm Package für alle Public Holidays (PH).

**Datenquelle:** https://github.com/commenthol/date-holidays  
**Abdeckung:** 199 Länder weltweit  
**Vorteil:** Berechnungslogik für bewegliche Feiertage → kompakte Bundle-Size, unbegrenzte Jahre

## Warum date-holidays?

```yaml
# Aktuell (YAML): ~10 KB für alle Jahre
- name: Karfreitag
  variable_date: easter
  offset: -2

# date-holidays: Gleiche Berechnungslogik
hd.getHolidays(2025)  // Berechnet Ostern für beliebiges Jahr
```

**vs. OpenHolidays API:**
```json
// Würde Bundle aufblähen: 7 Jahre × alle Feiertage
{"date": "2025-04-18", "name": "Karfreitag"}
{"date": "2026-04-03", "name": "Karfreitag"}
{"date": "2027-03-26", "name": "Karfreitag"}
...
```

## Länderabdeckung

**date-holidays:** 199 Länder ✅  
**Unsere YAMLs:** ~35 Länder

→ Vollständige Abdeckung, keine Upstream Contributions nötig für PH

## Migrationsphasen

### Phase 1: Integration & Validierung (1-2 Wochen)

**Ziel:** date-holidays als Datenquelle für PH anbinden.

- [ ] `npm install date-holidays` als Produktions-Dependency
- [ ] Build-Script: `scripts/fetch-public-holidays.mjs`
  ```javascript
  import Holidays from 'date-holidays';
  
  function fetchPublicHolidays(country, state) {
    const hd = new Holidays(country, state);
    return hd.getHolidays(); // Gibt Rules zurück, nicht konkrete Daten!
  }
  ```
- [ ] Konverter: date-holidays Format → opening_hours.js Format
  - State-Mapping (z.B. `'Baden-Württemberg'` → `'BW'`)
  - Feiertags-Typ-Mapping (`public`, `bank`, `school`, `optional`)
  - Variable-Date Extraktion (Easter, Islamic Calendar, etc.)
- [ ] Fallback-Logik: Bei fehlenden Ländern/States → YAML nutzen

**Akzeptanzkriterien:**
- Alle existierenden Tests grün
- Neue Tests für date-holidays Adapter
- Dokumentierte Länder-/State-Mappings

### Phase 2: Vergleich & Diff-Reports (1-2 Wochen)

**Ziel:** Systematischer Vergleich YAML vs. date-holidays.

- [ ] Diff-Tool: `scripts/compare-ph-sources.mjs`
  ```bash
  node scripts/compare-ph-sources.mjs --country=de --state=bw --year=2025
  ```
  
- [ ] Output:
  ```
  Public Holidays Deutschland/Baden-Württemberg 2025
  ═══════════════════════════════════════════════════
  
  YAML                      date-holidays              Status
  ─────────────────────────────────────────────────────────────
  ✅ Neujahr 01.01          New Year 01.01             OK
  ✅ Karfreitag 18.04       Good Friday 18.04          OK (berechnet)
  ⚠️  Reformationstag 31.10 -                          FEHLT in date-holidays
  ➕ -                      Repentance Day 19.11       NUR in date-holidays
  ```

- [ ] Pro Land/State dokumentieren:
  - ✅ Identisch → Migration sicher
  - ⚠️ Kleine Unterschiede → Manual Review
  - 🔄 Unsere Daten besser → Contribution zu date-holidays
  - ➕ date-holidays besser → YAML updaten

**Deliverable:** Markdown-Report mit Migrations-Readiness pro Land

### Phase 3: Schrittweise Aktivierung (2-3 Wochen)

**Ziel:** Für validierte Länder date-holidays als primäre PH-Quelle nutzen.

- [ ] **Rollout-Plan:**
  1. **Woche 1:** Deutschland (alle Bundesländer)
     - Beste Testabdeckung
     - Am kritischsten für Nutzerbasis
  2. **Woche 2:** AT, CH, FR, IT, ES
     - EU-Kernmärkte
  3. **Woche 3:** Rest Europa + US, CA, AU, JP
     - Wichtige internationale Märkte
  4. **Woche 4:** Restliche Länder

- [ ] **Config-System:**
  ```javascript
  // config/public-holidays-sources.json
  {
    "de": {"source": "date-holidays", "fallback": "yaml"},
    "at": {"source": "date-holidays", "fallback": "yaml"},
    "xy": {"source": "yaml"}  // Noch nicht migriert
  }
  ```

- [ ] **Feature-Flag pro Land:**
  - Einfacher Rollback bei Problemen
  - A/B Testing möglich
  - Monitoring: Fehlerrate vor/nach Migration

- [ ] **Monitoring:**
  - GitHub Issues für gemeldete PH-Fehler tracken
  - Vergleich: Fehlerrate vor vs. nach Migration
  - Bei Anstieg: Rollback + Analyse

**Akzeptanzkriterien:**
- Mind. 3 Monate stabile Nutzung für Top-10 Länder
- Keine signifikante Zunahme von Bug-Reports
- Performance gleichbleibend oder besser

### Phase 4: YAML-Bereinigung (1 Woche)

**Ziel:** Redundante PH-Daten aus YAMLs entfernen.

**WICHTIG:** Erst nach Phase 3 Stabilität (3+ Monate)

- [ ] Für migrierte Länder:
  - PH-Einträge aus YAMLs löschen
  - SH-Einträge bleiben!
  - Nominatim-Cache bleibt!
  
- [ ] YAMLs für nicht-migrierte Länder:
  - Komplett unverändert
  - Bis date-holidays Support hinzugefügt

**Beispiel:**
```yaml
# src/holidays/de.yaml - NACH Bereinigung
# Public Holidays: → Siehe date-holidays Package

# School Holidays: (bleiben bis SH-Migration)
Osterferien:
  2025: [4, 14, 4, 26]
  2026: [3, 30, 4, 11]
  ...

# Nominatim Cache: (bleibt immer)
_nominatim_cache:
  ...
```

### Phase 5: Upstream Contributions (Optional, parallel)

**Ziel:** Unsere YAML-Daten zu date-holidays beitragen (falls besser).

- [ ] Aus Phase 2 Diff-Reports: Fälle wo unsere YAMLs vollständiger
- [ ] PRs zu https://github.com/commenthol/date-holidays erstellen
  - Fehlende regionale Feiertage
  - Korrekturen bei Datumsberechnungen
  - Neue Länder/Regionen
  
- [ ] Tracking-Issue: "date-holidays Contributions Status"

**Benefit:** Verbessert date-holidays für alle → Win-Win

## Technische Details

### Build-Time Integration

```javascript
// scripts/fetch-public-holidays.mjs
import Holidays from 'date-holidays';
import fs from 'fs/promises';

async function buildPublicHolidays() {
  const config = JSON.parse(await fs.readFile('config/public-holidays-sources.json'));
  const result = {};
  
  for (const [country, settings] of Object.entries(config)) {
    if (settings.source === 'date-holidays') {
      const hd = new Holidays(country.toUpperCase());
      
      // Hole Rules (nicht konkrete Daten!)
      const holidays = hd.getHolidays();
      
      // Konvertiere zu unserem Format
      result[country] = convertToInternalFormat(holidays);
    } else {
      // Fallback: Lade aus YAML
      result[country] = await loadFromYAML(country);
    }
  }
  
  await fs.writeFile('build/public-holidays.json', JSON.stringify(result));
}
```

### Datenmodell beibehalten

```javascript
// date-holidays gibt Rules zurück
{
  name: 'Good Friday',
  type: 'public',
  rule: 'easter -2'  // ← Berechnungsregel!
}

// Wir behalten variable_date
{
  name: 'Karfreitag',
  variable_date: 'easter',
  offset: -2
}
```

→ **Kein Bundle-Size-Problem**, da wir Rules speichern, nicht konkrete Daten

### State/Region Mapping

```javascript
const STATE_MAPPING = {
  // Deutschland
  'Baden-Württemberg': 'BW',
  'Bayern': 'BY',
  'Berlin': 'BE',
  // ...
  
  // Österreich
  'Burgenland': 'B',
  'Kärnten': 'K',
  // ...
};
```

## Risiken & Mitigations

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|-------------------|--------|------------|
| date-holidays hat Fehler | Mittel | Hoch | Diff-Tool + stufenweiser Rollout |
| State-Mapping falsch | Niedrig | Mittel | Tests + Validierung |
| Breaking Changes in date-holidays | Niedrig | Hoch | Version pinnen, langsame Updates |
| Performance-Regression | Sehr niedrig | Niedrig | Benchmarks vorher/nachher |

## Offene Fragen

1. **Berechnungslogik übernehmen?**
   - date-holidays hat eigene Easter-Berechnung
   - Wir haben Computus-Algorithmus
   - → Nutzen wir deren Logic oder konvertieren nur Daten?

2. **Bundle date-holidays komplett?**
   - Option A: Nur die Rules für genutzte Länder (~50 KB)
   - Option B: Ganzes Package (~1.5 MB)
   - → Empfehlung: Option A mit Tree-Shaking

3. **Historische Daten?**
   - date-holidays hat Daten ab ~1900
   - Relevant für opening_hours.js?
   - → Wahrscheinlich nein, aber zu klären

## Timeline

| Phase | Dauer | Abhängigkeit |
|-------|-------|--------------|
| Phase 1: Integration | 1-2 Wochen | - |
| Phase 2: Vergleich | 1-2 Wochen | Phase 1 |
| Phase 3: Aktivierung | 2-3 Wochen | Phase 2 |
| Phase 4: YAML-Cleanup | 1 Woche | Phase 3 + 3 Monate |
| Phase 5: Contributions | Parallel zu 2-4 | - |

**Gesamtdauer:** ~1-2 Monate bis Go-Live, dann 3 Monate Stabilität

## Erfolgsmetriken

- ✅ Alle 199 date-holidays Länder verfügbar
- ✅ Bundle-Size: Gleich oder kleiner als vorher
- ✅ Tests: 100% Passing
- ✅ Bug-Reports: Nicht erhöht vs. Baseline
- ✅ YAML-Wartungsaufwand: -100% für PH
