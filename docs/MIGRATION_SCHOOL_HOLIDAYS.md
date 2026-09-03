# Migration: School Holidays → OpenHolidays API

## Zusammenfassung

Migration von lokalen YAML-Dateien zu **OpenHolidays API** für School Holidays (SH) von EU-Ländern.  
**Bidirektionaler Ansatz:** Wir nutzen OpenHolidays UND tragen unsere Nicht-EU-Daten bei.

**API:** https://openholidaysapi.org  
**Daten-Repo:** https://github.com/openpotato/openholidaysapi.data  
**Abdeckung:** 35 Länder (EU + BR, MX, ZA)

## Warum OpenHolidays für SH?

```yaml
# Unsere YAMLs: Perioden-Struktur
Osterferien:
  2025: [4, 14, 4, 26]  # April 14-26

# OpenHolidays API: Gleiche Struktur!
{
  "startDate": "2025-04-14",
  "endDate": "2025-04-26",
  "type": "SchoolHoliday",
  "name": [{"language": "DE", "text": "Osterferien"}]
}
```

**vs. date-holidays:**
- Hat **keine** School Holiday Perioden
- Nur einzelne Tage als `type: 'school'`
- Nicht geeignet für Ferienzeiten

## Länderabdeckung

**Analyse (Stand 31.12.2025):**

| Kategorie | Anzahl | Länder |
|-----------|--------|--------|
| **In beiden Repos** | 20 | at, be, br, ch, cz, de, es, fr, hr, hu, ie, it, lu, nl, pl, ro, ru, se, si, sk |
| **Nur Schulferien (YAML)** | 17 | ar, au, ca, ci, cn, dk, fi, gb, gr, jp, na, no, nz, ua, us, vn, xa |
| **Nur OpenHolidays** | 17 | ad, al, bg, by, ee, li, lt, lv, mc, md, mt, mx, pt, rs, sm, va, za |

## Pragmatische Strategie: Hybrid-Ansatz

**Build-Time Logik:**

```javascript
// Für jedes Land mit Schulferien:
if (openholidaysHasSchoolHolidays(country)) {
  // 1. Nutze OpenHolidays API
  holidays = await fetchFromOpenHolidays(country);
  
  if (yamlHasSchoolHolidays(country)) {
    // 3. Warnung: Redundante Daten
    console.warn(`⚠️  ${country}: SH in YAML + OpenHolidays → YAML sollte gelöscht werden`);
  }
} else {
  // 2. Fallback auf YAML
  holidays = loadFromYaml(country);
}
```

**Vorteile:**
- ✅ Keine aufwändigen Contributions nötig
- ✅ Nutzt OpenHolidays wo verfügbar
- ✅ YAML als Fallback für fehlende Länder
- ✅ Schrittweise Migration möglich
- ✅ Kein Datenverlust

## Implementierung

### Phase 1: Build-Script mit Hybrid-Quelle (1-2 Wochen)

**Ziel:** OpenHolidays API nutzen wo verfügbar, YAML als Fallback.

#### 1.1 API-Check & Fetch

#### 1.1 API-Check & Fetch

- [ ] `scripts/fetch-school-holidays.mjs`
  ```javascript
  // 1. Discovery: Finde ALLE Länder mit SchoolHolidays
  async function discoverAllCountries() {
    const allCountries = new Set();
    
    // A) Länder aus OpenHolidays API (alle mit SH-Daten)
    try {
      const response = await fetch('https://openholidaysapi.org/Countries');
      const countries = await response.json();
      
      for (const country of countries) {
        // Prüfe ob SchoolHolidays verfügbar
        const sh = await fetch(
          `https://openholidaysapi.org/SchoolHolidays?countryIsoCode=${country.isoCode}`
        );
        if (sh.ok && (await sh.json()).length > 0) {
          allCountries.add(country.isoCode.toLowerCase());
        }
      }
    } catch (error) {
      console.warn('⚠️  OpenHolidays API nicht erreichbar');
    }
    
    // B) Länder aus unseren YAMLs
    const yamlFiles = await fs.readdir('src/holidays');
    for (const file of yamlFiles) {
      if (file.endsWith('.yaml')) {
        allCountries.add(file.replace('.yaml', ''));
      }
    }
    
    return Array.from(allCountries).sort();
  }
  
  // 2. Für jedes Land: Beste Quelle wählen
  async function getSchoolHolidays(country) {
    const countryUpper = country.toUpperCase();
    const hasYaml = await yamlHasSchoolHolidays(country);
    
    // Versuche zuerst OpenHolidays
    try {
      const response = await fetch(
        `https://openholidaysapi.org/SchoolHolidays?countryIsoCode=${countryUpper}`,
        { timeout: 5000 }
      );
      
      if (response.ok) {
        const holidays = await response.json();
        
        if (holidays.length > 0) {
          if (hasYaml) {
            console.warn(`⚠️  ${country}: YAML + OpenHolidays (cleanup YAML)`);
          } else {
            console.log(`✅ ${country}: OpenHolidays (neu!)`);
          }
          return { source: 'openholidays', data: holidays };
        }
      }
    } catch (error) {
      // Fallthrough zu YAML
    }
    
    // Fallback: YAML
    if (hasYaml) {
      console.log(`📄 ${country}: YAML`);
      return { source: 'yaml', data: await loadFromYaml(country) };
    }
    
    return { source: 'none', data: [] };
  }
  
  // 3. Build: Alle Länder verarbeiten
  async function buildSchoolHolidays() {
    const countries = await discoverAllCountries();
    console.log(`Discovered ${countries.length} countries with school holidays`);
    
    const results = { openholidays: [], yaml: [], redundant: [], new: [] };
    
    for (const country of countries) {
      const { source, data } = await getSchoolHolidays(country);
      
      if (source === 'openholidays') {
        results.openholidays.push(country);
        
        const hadYaml = await yamlHasSchoolHolidays(country);
        if (hadYaml) {
          results.redundant.push(country);
        } else {
          results.new.push(country); // Neu von OpenHolidays!
        }
      } else if (source === 'yaml') {
        results.yaml.push(country);
      }
      
      // Bundle data...
    }
    
    return results;
  }
  ```

#### 1.2 Automatische Discovery + Cleanup Detection

- [ ] **Vorteile:**
  - ✅ Entdeckt ALLE Länder (OpenHolidays + YAML)
  - ✅ Automatisch neue Länder wenn OpenHolidays erweitert wird
  - ✅ Automatisch neue Länder die wir gar nicht in YAML haben
  - ✅ Keine hartcodierte Logik, 100% dynamisch

- [ ] **Beispiel-Szenario:**
  - Heute: OpenHolidays hat pt (Portugal) - wir nicht in YAML
  - → Automatisch genutzt, ohne Code-Änderung!
  - Morgen: OpenHolidays fügt au (Australien) hinzu
  - → Automatisch von YAML zu OpenHolidays migriert!

- [ ] **Ausgabe beim Build:**
  ```
  ════════════════════════════════════════════════════
  School Holidays Build
  ════════════════════════════════════════════════════
  
  Discovered 54 countries with school holidays
  (37 YAML + 17 OpenHolidays-only)
  
  Processing...
  
  ✅ de: OpenHolidays
  ✅ pt: OpenHolidays (neu!)
  ✅ mx: OpenHolidays (neu!)
  ...
  📄 au: YAML (OpenHolidays nicht verfügbar)
  📄 ca: YAML (OpenHolidays nicht verfügbar)
  ...
  
  ════════════════════════════════════════════════════
  Summary:
    OpenHolidays: 37 countries (17 nur in OH, 20 auch in YAML)
    YAML Fallback: 17 countries
    Total: 54 countries
  
  🎉 Neu von OpenHolidays (ohne YAML):
    - pt (Portugal), mx (Mexico), bg (Bulgaria), ...
  
  ⚠️  Redundant (cleanup required):
    - de: Remove SH from src/holidays/de.yaml
    - at: Remove SH from src/holidays/at.yaml
  
  💾 Cache: build/school-holidays-cache.json (892 KB)
  ════════════════════════════════════════════════════
  ```

#### 1.3 Caching & Error-Handling

#### 1.3 Caching & Error-Handling

- [ ] Build-time Cache: `build/school-holidays-cache.json`
  - Letzte erfolgreiche API-Daten
  - Timestamp + Quelle (openholidays vs yaml)
  - Bei API-Fehler: Nutze Cache als Fallback

- [ ] Error-Handling:
  - API offline → Fallback auf Cache → Fallback auf YAML
  - Rate-Limiting → Retry mit Backoff
  - Ungültige Daten → Validierung + Warnung

**Akzeptanzkriterien:**
- Build funktioniert auch wenn OpenHolidays offline
- Redundante YAML-Daten werden erkannt und gewarnt
- Cache verhindert unnötige API-Calls

### Phase 2: Schrittweise YAML-Bereinigung (1-2 Wochen)

**Ziel:** SH-Daten aus YAMLs entfernen, wo OpenHolidays verfügbar.

- [ ] **Für jedes Land mit OpenHolidays SH:**
  1. Verify: Build nutzt OpenHolidays erfolgreich
  2. Remove: SH-Einträge aus YAML löschen
  3. Keep: PH + Nominatim-Cache bleiben
  
- [ ] **Dokumentation in YAML:**
  ```yaml
  # src/holidays/de.yaml
  
  # Public Holidays: → date-holidays (siehe MIGRATION_PUBLIC_HOLIDAYS.md)
  
  # School Holidays: → OpenHolidays API
  # https://openholidaysapi.org/SchoolHolidays?countryIsoCode=DE
  
  # Nominatim Cache:
  _nominatim_cache:
    ...
  ```

**Akzeptanzkriterien:**
- YAML nur noch für Länder ohne OpenHolidays SH
- Build-Warnungen verschwunden
- Tests grün

### Phase 3: Monitoring & Optional Contributions (ongoing)

### Phase 3: Monitoring & Optional Contributions (ongoing)

**Ziel:** Langfristige Datenpflege.

- [ ] **Monatlicher Check:**
  - Welche YAML-Länder haben jetzt SH bei OpenHolidays?
  - Auto-Migration wenn verfügbar
  
- [ ] **Optional: Contributions**
  - Wenn wir Zeit/Interesse haben
  - Unsere 17 YAML-only Länder zu OpenHolidays beitragen
  - Aber: Kein Blocker für Migration!

**Vorteil:** Flexible, schrittweise Verbesserung ohne Zeitdruck.

## Timeline (vereinfacht)

| Phase | Dauer | Ziel |
|-------|-------|------|
| Phase 1: Hybrid-Build | 1-2 Wochen | OpenHolidays + YAML parallel |
| Phase 2: YAML-Cleanup | 1-2 Wochen | SH aus redundanten YAMLs löschen |
| Phase 3: Monitoring | Ongoing | Auto-Update bei neuen OH-Daten |

**Gesamtdauer:** ~2-4 Wochen bis Go-Live

**Parallel zu PH-Migration möglich!**

### API-Limits

**OpenHolidays API:**
- Kostenlos, keine Rate-Limits dokumentiert
- ABER: Build-Time Fetch → nicht kritisch
- Bei Problemen: Caching + Retry

### Bundle-Size Impact

**Konkrete Daten 2020-2027:**
- Pro Land/Region/Jahr: ~5-10 Ferienperioden
- Pro Periode: ~100 Bytes (JSON)
- Deutschland (16 Bundesländer × 8 Jahre × 6 Perioden): ~77 KB
- Alle EU-Länder: ~300-500 KB

**Akzeptabel weil:**
- Nur SH (nicht PH → date-holidays hat Rules!)
- Schulferien sind meist konkret geplant (keine Berechnung möglich)
- Reduziert Wartungsaufwand massiv

### Datenqualität

**OpenHolidays ist community-driven:**
- Daten können Fehler haben
- → Deshalb Diff-Tool + Validierung
- → Upstream Contributions helfen allen

## Risiken & Mitigations

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|-------------------|--------|------------|
| OpenHolidays API offline | Niedrig | Mittel | Caching + Fallback auf YAML |
| Daten-Unterschiede OpenHolidays/YAML | Hoch | Niedrig | Diff-Tool, schrittweise Migration |
| Bundle-Size zu groß | Niedrig | Niedrig | Nur relevante Jahre bundlen |

## Erfolgsmetriken

- ✅ **Alle** OpenHolidays-Länder automatisch genutzt (aktuell 37, expandierend)
- ✅ 17 YAML-Länder als Fallback (bis OpenHolidays sie hinzufügt)
- ✅ **Bonus:** 17 zusätzliche Länder die nur OpenHolidays hat (pt, mx, bg, ...)
- ✅ **Abdeckung:** ~54 Länder statt 37 (ohne extra Arbeit!)
- ✅ Build funktioniert auch offline (via Cache)
- ✅ YAML-Wartungsaufwand: -50% → später -100% für migrierte Länder
- ✅ Automatische Expansion wenn OpenHolidays wächst
- ✅ Keine Breaking Changes für User
