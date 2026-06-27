# Migration zu externen Feiertagsdaten - Overview

## Zusammenfassung

Dieses Dokument gibt einen Überblick über die Migration von lokalen YAML-Dateien zu externen Datenquellen.

**Ziel:** Reduzierung des Wartungsaufwands für Public Holidays (PH) und School Holidays (SH).

**Zwei unabhängige Migrationen:**

1. **[Public Holidays → date-holidays](MIGRATION_PUBLIC_HOLIDAYS.md)**  
   - 199 Länder sofort verfügbar
   - Berechnungslogik → kleine Bundle-Size
   - Schneller, geringes Risiko
   
2. **[School Holidays → OpenHolidays API](MIGRATION_SCHOOL_HOLIDAYS.md)**  
   - 35 EU-Länder + unsere 17 Contributions
   - Bidirektionale Strategie
   - Langfristiger, größerer Impact

## Externe Datenquellen

Wir nutzen zwei komplementäre Quellen:

**OpenHolidays API** (EU-Länder)
- ~35 Länder, Fokus Europa
- PH + SH (Ferienperioden!)
- API: https://openholidaysapi.org
- Daten: https://github.com/openpotato/openholidaysapi.data

**date-holidays** (weltweit)
- 199 Länder
- Nur PH (keine SH-Perioden)
- npm: https://www.npmjs.com/package/date-holidays
- Hat Berechnungslogik für bewegliche Feiertage

**Wichtig:** Berechnungslogik vs. konkrete Daten

- **date-holidays**: Hat Berechnungslogik für bewegliche Feiertage (wie unsere `variable_date: easter`)
- **OpenHolidays API**: Nur konkrete Daten 2020-2027, keine Berechnungen

→ Daher date-holidays für PH (unbegrenzte Jahre, klein), OpenHolidays nur für SH (Perioden sind meist konkret geplant)

---

### Entscheidung

**Integrationsstrategie: Option 2 (Build-Time Data Fetch)** ✅

Daten werden während `npm run build` von den externen Quellen geholt und ins Bundle gepackt.

**Datenquellen-Strategie:**
- **Public Holidays (PH)**: `date-holidays` für ALLE Länder
  - ✅ Berechnungslogik (variable_date) → kleine Bundle-Size
  - ✅ 199 Länder
  - ✅ Unbegrenzte Jahre
- **School Holidays (SH)**: `OpenHolidays API` für EU-Länder
  - ✅ Perioden-Struktur (startDate/endDate)
  - ✅ Reduziert Wartungsaufwand
  - ⚠️ Konkrete Daten 2020-2027 (Bundle-Inflation akzeptabel für SH)
- **Fallback**: Bestehende YAMLs für nicht-abgedeckte Länder/Regionen

**Warum nicht OpenHolidays für PH?**
OpenHolidays speichert konkrete Daten ohne Berechnungslogik → Bundle würde sich für PH massiv aufblähen (7 Jahre × alle Feiertage × alle Länder). date-holidays hat `variable_date` Berechnungen → kompakt für unbegrenzte Jahre.

## Länderabdeckung

**OpenHolidays API:** 35 Länder (hauptsächlich EU + BR, MX, ZA)  
**date-holidays:** 199 Länder weltweit  
**Nur in unseren YAMLs (School Holidays):** ar, au, ca, ci, cn, dk, fi, gb, gr, jp, na, no, nz, ru, ua, us, vn

→ **Alle unsere SH-Daten werden zu OpenHolidays API beigetragen!**

---

## Erkenntnisse aus Branch `test-date-holiday`

**Übernehmenswert:** Adapter-Grundstruktur, State-Mapping, Konvertierungslogik  
**Probleme:** Big-Bang-Ansatz, keine Validierung, harte Dependency

---

## Warum zwei separate Migrationen?

| AsBuild-Scripts

- `scripts/fetch-public-holidays.mjs` - Holt PH von date-holidays
- `scripts/fetch-school-holidays.mjs` - Holt SH von OpenHolidays API
- `scripts/compare-ph-sources.mjs` - Vergleicht PH: YAML vs. date-holidays
- `scripts/compare-sh-sources.mjs` - Vergleicht SH: YAML vs. OpenHolidays
- `scripts/convert-sh-to-openholidays.mjs` - Konvertiert unsere SH für Contributions

### Config-Files

```javascript
// config/public-holidays-sources.json
{
  "de": {"source": "date-holidays", "fallback": "yaml"},
  "us": {"source": "date-holidays", "fallback": "yaml"}
}

// config/school-holidays-sources.json  
{
  "de": {"source": "openholidays", "fallback": "yaml"},
  "au": {"source": "yaml"}  // Bis Contribution gemerged
}
```

### GitHub Actions

```yaml
# .github/workflows/holiday-data-sync.yml
- Monatlich: Fetch latest data from all sources
- Run diff tools (PH + SH separat)
- Create PRs bei Änderungen
- Create upstream contribution issues
```

---

**Ergebnis:** Dokumentation mit Entscheidungen pro Land:
- ✅ Migration möglich (Daten identisch)
- ⚠️ Migration mit Anpassungen (kleine Unterschiede → beheben)
- 🔄 Contribution nötig (unsere Daten besser → PR erstellen)
- ➕ Update unserer Daten (externe Quelle besser)
- ❌ Nicht in OpenHolidays API (Fallback auf YAML oder date-holidays)

### Phase 3: Hybride Datenquellen

**Ziel:** Flexibles System das beste Quelle pro Land wählt.

```
Priorität:
1. OpenHolidays API (wenn verfügbar und Daten verifiziert)
2. date-holidays (für Länder außerhalb Europa, nur PH)
3. Lokale YAML-Dateien (Fallback, Legacy)
```

- [ ] Konfiguration pro Land: welche Quelle für PH, welche für SH
- [ ] Fallback-Kette implementieren
- [ ] Caching mit konfigurierbarer TTL
- [ ] Offline-Modus mit gecachten Daten

### Phase 4: Schrittweise Aktivierung

**Ziel:** Für validierte Länder externe Quellen als primäre Datenquelle nutzen.

- [ ] Beginnen mit Deutschland (beste Testabdeckung)
- [ ] Dann: AT, CH, FR (wichtige Märkte)
- [ ] Dann: restliche EU-Länder
- [ ] Monitoring: Fehlerberichte sammeln
- [ ] Rollback-Möglichkeit pro Land

### Phase 5: YAML-Bereinigung

**Ziel:** Entfernung redundanter Daten aus YAML-Dateien.

- [ ] Erst nach erfolgreicher Phase 4 (mind. 3 Monate Stabilität)
- [ ] PH- und SH-Einträge aus YAMLs entfernen für migrierte Länder
- [ ] Nominatim-Cache-Daten bleiben erhalten
- [ ] YAMLs für nicht-migrierte Länder bleiben vollständig

### Phase 6: Dokumentation & Kommunikation

- [ ] README aktualisieren
- [ ] CHANGELOG-Eintrag
- [ ] Migration Guide für Nutzer
- [ ] Contribution Guide für neue Länder bei OpenHolidays API
- [ ] Dokumentation unserer Upstream Contributions
  - Liste aller beigetragenen Länder/Regionen
  - Danksagung an date-holidays und OpenHolidays Communities

## Technische Details

### Build-Time Data Fetch ✅ **GEWÄHLTE STRATEGIE**

```
┌─────────────────────────────────────────────────────┐
│ npm run build:                                      │
│ 1. date-holidays: PH mit Berechnungslogik          │
│    → Kompakt, unbegrenzte Jahre                     │
│ 2. OpenHolidays API: SH-Perioden (2020-2027)       │
│    → Wartungsarm für EU-Länder                      │
│ 3. YAML-Fallback: Nicht-abgedeckte Länder/Regionen │
│ 4. Merge & Bundle in opening_hours.js              │
│ 5. Package ist vollständig offline                  │
└─────────────────────────────────────────────────────┘
```

**Integration:**
```json
// package.json
{
  "scripts": {
    "prebuild": "npm run fetch-holidays",
    "fetch-holidays": "npm run fetch-ph && npm run fetch-sh",
    "fetch-ph": "node scripts/fetch-public-holidays.mjs",
    "fetch-sh": "node scripts/fetch-school-holidays.mjs",
    "build": "rollup -c"
  }
}
```

---

## Erfolgsmetriken (nach vollständiger Migration)

**Public Holidays:**
- ✅ 199 Länder verfügbar (statt ~35)
- ✅ Bundle-Size: Gleich oder kleiner
- ✅ YAML-Wartung: -100% für PH

**School Holidays:**
- ✅ 52+ Länder verfügbar (35 + 17 contributed)
- ✅ Andere Projekte nutzen unsere Daten
- ✅ YAML-Wartung: -90% für SH

**Gesamt:**
- ✅ Wartungsaufwand drastisch reduziert
- ✅ Community profitiert bidirektional
- ✅ Tests: 100% Passing
- ✅ Keine Breaking Changes

---

## Nächste Schritte

1. Entscheiden: PH oder SH zuerst? (Empfehlung: Parallel)
2. Team-Kapazität festlegen
3. Tracking-Issues erstellen:
   - `#XXX: Migration Public Holidays → date-holidays`
   - `#YYY: Migration School Holidays → OpenHolidays API`
4. Los geht's! 🚀

Siehe detaillierte Roadmaps:
- **[MIGRATION_PUBLIC_HOLIDAYS.md](MIGRATION_PUBLIC_HOLIDAYS.md)**
- **[MIGRATION_SCHOOL_HOLIDAYS.md](MIGRATION_SCHOOL_HOLIDAYS.md)**
