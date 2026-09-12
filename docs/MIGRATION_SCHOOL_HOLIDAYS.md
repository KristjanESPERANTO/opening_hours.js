# Migration: School Holidays → OpenHolidays-Daten

## Zusammenfassung

Migration von lokalen YAML-Dateien zu **OpenHolidays-Daten aus dem Git-Submodul**
für School Holidays (SH) von EU-Ländern.

**Daten-Submodul:** `submodules/openholidaysapi.data`
**Upstream-Projekt:** https://github.com/openpotato/openholidaysapi.data
**Abdeckung:** 35 Länder (EU + BR, MX, ZA)

## Warum OpenHolidays-Daten für SH?

```yaml
# Unsere YAMLs: Perioden-Struktur
Osterferien:
  2025: [4, 14, 4, 26]  # April 14-26

# OpenHolidays-Daten: Gleiche Struktur!
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

**Build-Time-Logik:**

```javascript
// Für jedes Land mit Schulferien:
if (openholidaysHasSchoolHolidays(country)) {
  // 1. Nutze generierte OpenHolidays-Daten aus dem Submodul
  holidays = loadFromGeneratedOpenHolidays(country);

  if (yamlHasSchoolHolidays(country)) {
    // 3. Warnung: Redundante Daten
    console.warn(`⚠️  ${country}: SH in YAML + OpenHolidays → YAML sollte gelöscht werden`);
  }
} else {
  // 2. Fallback auf YAML
  holidays = loadFromYaml(country);
}
```

**Bereits umgesetzt:**
- ✅ OpenHolidays-Daten werden aus dem versionierten Daten-Submodul genutzt
- ✅ YAML bleibt als Fallback für PH und nicht abgedeckte SH-Daten erhalten
- ✅ Schrittweise Migration ohne Datenverlust durch Merge mit bestehenden Definitionen

## Implementierung

### Phase 1: Build-Script mit Hybrid-Quelle (teilweise umgesetzt)

**Zielbild:** OpenHolidays-Daten aus dem Submodul build-time nutzen, YAML als Fallback.

#### 1.1 Daten-Discovery und Generierung

- [x] `scripts/fetch-school-holidays.mjs`
  - Liest die versionierten CSV-Daten aus `submodules/openholidaysapi.data`
  - Erkennt Länder mit School-Holiday-Dateien automatisch
  - Erzeugt `src/holidays/generated-openholidays.js`
  - Verbindet die erzeugten SH-Daten mit bestehenden YAML-Metadaten
- [x] Länder und School-Holiday-Dateien werden im Submodul automatisch erkannt.
- [x] CSV-Daten werden in `src/holidays/generated-openholidays.js` konvertiert.
- [x] Nicht durch OpenHolidays abgedeckte Daten bleiben in YAML verfügbar.

#### 1.2 Automatische Discovery aus dem Submodul

- [x] **Vorteile:**
  - ✅ Entdeckt alle Länder mit School-Holiday-Dateien im Submodul
  - ✅ Übernimmt neue versionierte Submodul-Daten beim nächsten Lauf
  - ✅ YAML bleibt für nicht abgedeckte Länder erhalten
  - ✅ Keine Live-Netzwerkverbindung beim Build erforderlich

- [ ] **Beispiel-Szenario:**
  - Heute: OpenHolidays hat pt (Portugal) - wir nicht in YAML
  - → Automatisch genutzt, ohne Code-Änderung!
  - Morgen: OpenHolidays fügt au (Australien) hinzu
  - → Automatisch von YAML zu OpenHolidays migriert!

- [ ] **Ausgabe beim Build:**
  ```text
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

#### 1.3 Submodul- und Datenvalidierung

- [x] Build funktioniert offline mit dem versionierten Submodul.
- [ ] Submodul-Update mit Datenvalidierung und gezieltem Diff prüfen.

**Akzeptanzkriterien:**
- Build funktioniert auch wenn OpenHolidays offline
- Redundante YAML-Daten werden erkannt und gewarnt
- Cache verhindert unnötige API-Calls

### Phase 2: Schrittweise YAML-Bereinigung (erledigt)

**Ziel:** SH-Daten aus YAMLs entfernen, wo OpenHolidays verfügbar.

- [x] **Für jedes Land mit OpenHolidays SH:**
  1. Verify: Build nutzt OpenHolidays erfolgreich
  2. Remove: SH-Einträge aus YAML löschen
  3. Keep: PH + Nominatim-Cache bleiben

  Ausnahme: `xa` ist ein künstlicher Test-/Fallback-Code ohne OpenHolidays-
  Abdeckung und behält deshalb seine Dummy-School-Holidays.

- [ ] **Optional: Quellenhinweis in YAML:**
  ```yaml
  # src/holidays/de.yaml

  # Public Holidays: → date-holidays (siehe MIGRATION_PUBLIC_HOLIDAYS.md)

  # School Holidays: → openholidaysapi.data Submodul

  # Nominatim Cache:
  _nominatim_cache:
    ...
  ```

**Akzeptanzkriterien:**
- [x] YAML enthält keine redundanten SH-Daten für OpenHolidays-Länder
- [x] Keine redundanten SH-Daten für OpenHolidays-Länder
- [ ] Gesamte Test-Suite erneut ausführen

### Phase 3: Monitoring & Optional Contributions (offen)

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

### Datenaktualisierung

**OpenHolidays-Daten:**
- Updates erfolgen über den Git-Submodul-Stand.
- Der Build benötigt keinen Netzwerkzugriff.
- Änderungen werden durch den generierten Diff und die Tests geprüft.

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
| OpenHolidays-Submodul veraltet | Mittel | Mittel | Submodul aktualisieren und Daten-Diff prüfen |
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
