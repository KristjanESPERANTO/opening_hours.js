<!-- SPDX-FileCopyrightText: © opening_hours.js contributors -->
<!-- SPDX-License-Identifier: LGPL-3.0-only -->
# Migration: Public Holidays → date-holidays

Stand: November 2026. Überblick und Datenfluss: [MIGRATION_OVERVIEW.md](MIGRATION_OVERVIEW.md).

## Zusammenfassung

Die Public Holidays (PH) werden nicht mehr von Hand gepflegt, sondern aus dem Projekt
[date-holidays](https://github.com/commenthol/date-holidays) abgeleitet. Das Skript
`scripts/sync_holidays_from_date_holidays.js` liest die Regeln aus dem Submodul
`submodules/date-holidays/data/countries/*.yaml` und schreibt `src/holidays/<cc>.yaml`.

```bash
# Submodul aktualisieren, dann YAML neu erzeugen
git -C submodules/date-holidays pull
node scripts/sync_holidays_from_date_holidays.js            # alle Länder
node scripts/sync_holidays_from_date_holidays.js --dry-run de at   # nur ausgeben
```

Danach muss `node scripts/generate-holiday-definitions.mjs` laufen, damit
`src/holidays/generated-openholidays.mjs` die neuen Daten enthält.

## Warum Regeln statt Daten?

```yaml
# Regel: gilt für jedes Jahr
- {name: Karfreitag, variable_date: easter, offset: -2}

# konkrete Daten: würden pro Jahr und Land wachsen
{"date": "2025-04-18", "name": "Karfreitag"}
```

Wir speichern die Regeln (`fixed_date`, `variable_date`, `offset`, `shift_rule`, `substitute_rule`, `years`,
`only_states`). Das Bundle bleibt klein und gilt für beliebige Jahre. Deshalb wird `date-holidays` nur als
Datenquelle im Submodul genutzt und nicht als Laufzeit-Abhängigkeit gebündelt.

## Abdeckung

- `date-holidays` kennt 199 Länder.
- Das Skript erzeugt **53 Länder**. 13 werden bewusst übersprungen (`skip` in `COUNTRY_CONFIGS`).
- Von Hand gepflegt bleiben `gb`, `ci`, `cn`, `vn` und der Platzhalter `xa`.

| Grund für `skip` | Länder |
|---|---|
| Mond- oder islamischer Kalender, nicht unterstützt | `al`, `ba`, `ci`, `cn`, `kr`, `ma`, `me`, `sg`, `tr`, `vn` |
| Eigenes Format pro Abschnitt | `gb` |
| Regeln mit Donnerstagen | `is` |
| Platzhalter | `xa` |

## Was die Umwandlung macht

- Es werden nur Feiertage vom Typ `public` übernommen. Pro Land lässt sich das mit `includeDayTypes` erweitern,
  einzelne Regeln mit `includeDayRules` (z. B. `dk`: 06-05 und 12-24).
- Regeln mit `since`/`until`/`prior to` und `active`-Zeiträumen werden auf den aktuellen Stand gefiltert.
- Namen kommen aus dem Land (`name`, `_name`) und der globalen `names.yaml`. Die Sprache bestimmen `langs`,
  `preferredLangs` und `nameLangs`.
- Bundesländer und Regionen werden zu `only_states`. Regionen werden hochgezogen, wenn ein Feiertag nur dort
  `public` ist (Ausnahmen in `SKIP_SUBREGION_PROMOTION`).
- Länder mit `baseCc` erben die Regeln eines anderen Landes (`je`, `gg`, `im`, `gi` von `gb`).
- Kommentare vor `PH:`, `_nominatim_url` und `SH` in bestehenden YAML-Dateien bleiben erhalten.
- Nicht umsetzbare Regeln werden mit einer Warnung übersprungen. Julianische Daten werden mit einem Versatz
  von 13 Tagen umgerechnet. Das ist bis 2099 korrekt, das Skript warnt davor.

Länderspezifische Korrekturen nach der Umwandlung stehen in `COUNTRY_OVERRIDES` (`au`, `jp`, `ca`).

## Fehler in den Daten beheben

1. Wenn möglich **upstream in `date-holidays`** korrigieren (Quelle als `@source` im Kommentar angeben).
2. Bis die Korrektur im Submodul ankommt, hilft eine lokale Anpassung in `COUNTRY_CONFIGS` oder
   `COUNTRY_OVERRIDES`.
3. Nach dem Update des Submoduls Sync und Generate neu ausführen und die Tests laufen lassen.

## Stand der Umsetzung

- [x] `date-holidays` als versioniertes Submodul
- [x] Synchronisationsskript und Konverter (Regeln, Bundesländer, Typen, Namen)
- [x] Konfiguration pro Land (`COUNTRY_CONFIGS`, `COUNTRY_OVERRIDES`)
- [x] Vorgehen vor dem Release dokumentiert
- [ ] Submodul-Update automatisieren und Änderungen als Diff-Bericht ausgeben
- [ ] CI-Prüfung, dass Sync und Generate keinen Diff erzeugen
- [ ] Verbleibende von Hand gepflegte Länder (`gb`, `ci`, `cn`, `vn`) umstellen, sobald der Parser es erlaubt

Die ursprünglich geplante schrittweise Aktivierung pro Land (Wochenplan, Feature-Flags,
`config/public-holidays-sources.json`) wurde nicht umgesetzt. Alle unterstützten Länder wurden auf einmal
erzeugt und durch die Test-Suite abgesichert.

## Risiken

| Risiko | Wahrscheinlichkeit | Impact | Gegenmaßnahme |
|---|---|---|---|
| Fehler in den Quelldaten | Mittel | Hoch | Upstream korrigieren, Diff nach jedem Submodul-Update prüfen |
| Name oder Schreibweise weicht von der amtlichen Quelle ab | Mittel | Niedrig | Primärquelle als `@source` prüfen, Override nur wenn nötig |
| Bundesland-Zuordnung falsch | Niedrig | Mittel | `check_holiday_state_codes.mjs` (jede Region braucht `_state_code`), Tests |
| Änderungen in `date-holidays` | Niedrig | Hoch | Submodul-Stand ist festgelegt, Updates bewusst durchführen |

## Offene Fragen

1. Sollen die verbleibenden Länder mit Mond- und islamischem Kalender unterstützt werden? Das braucht
   Berechnungen im Parser.
2. Soll der Submodul-Stand automatisch aktualisiert werden (z. B. monatlich per Action)?
3. Sollen unsere lokalen Overrides regelmäßig auf Upstream-Beiträge geprüft werden?
4. Wenn die PH vollständig erzeugt werden: YAML auflösen, Sync und Generator zusammenführen und den Parser
   von `date-holidays` verwenden? Siehe [Danach evaluieren](MIGRATION_OVERVIEW.md#danach-evaluieren).

## Ziele

- Alle unterstützten Länder werden erzeugt (aktuell 53 von 53)
- Bundle-Größe nicht größer als vorher
- Tests grün
- Keine zusätzlichen Fehlerberichte zu Feiertagen
