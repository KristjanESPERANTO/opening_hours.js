<!-- SPDX-FileCopyrightText: © opening_hours.js contributors -->
<!-- SPDX-License-Identifier: LGPL-3.0-only -->
# Migration: Public Holidays → date-holidays

Stand: 15. November 2026. Überblick und Datenfluss: [MIGRATION_OVERVIEW.md](MIGRATION_OVERVIEW.md).

## Zusammenfassung

Für 53 konfigurierte Länder werden Public Holidays (PH) aus dem Projekt
[date-holidays](https://github.com/commenthol/date-holidays) abgeleitet; einige Länder bleiben von Hand
gepflegt. Das Skript
`scripts/sync_holidays_from_date_holidays.js` liest die Regeln aus dem Submodul
`submodules/date-holidays/data/countries/*.yaml` und schreibt `src/holidays/<cc>.yaml`.

```bash
# Submodul aktualisieren, dann YAML neu erzeugen
git -C submodules/date-holidays pull
node scripts/sync_holidays_from_date_holidays.js
```

Danach muss `node scripts/generate-holiday-definitions.mjs` laufen, damit
`src/holidays/generated-openholidays.mjs` die neuen Daten enthält.
Der Sync verarbeitet immer alle konfigurierten Länder und schreibt deren YAML-Dateien; er akzeptiert
keine Argumente. Änderungen anschließend per Git-Diff prüfen.

## Warum Regeln statt Daten?

```yaml
# Regel: gilt für jedes Jahr
- {name: Karfreitag, variable_date: easter, offset: -2}

# konkrete Daten: würden pro Jahr und Land wachsen
{"date": "2025-04-18", "name": "Karfreitag"}
```

Wir speichern Regeln (`fixed_date`, `variable_date`, `offset`, `shift_rule`, `substitute_rule`, `years`,
`only_states`) und bei einmaligen Feiertagen das `year`. Wiederkehrende Regeln sind kompakt, garantieren
aber keine historische oder weit zukünftige Genauigkeit. `date-holidays` wird nur als Datenquelle im
Submodul genutzt und nicht als Laufzeit-Abhängigkeit gebündelt.

## Abdeckung

- Das `date-holidays`-Submodul enthält derzeit 208 Länderdateien.
- Das Skript erzeugt **53 Länder**. 13 werden bewusst übersprungen (`skip` in `COUNTRY_CONFIGS`).
- Von Hand gepflegt bleiben `gb`, `ci`, `cn`, `vn` und der Platzhalter `xa`.

| Grund für `skip` | Länder |
|---|---|
| Mond- oder islamischer Kalender, nicht unterstützt | `al`, `ba`, `ci`, `cn`, `kr`, `ma`, `me`, `sg`, `tr`, `vn` |
| Eigenes Format pro Abschnitt | `gb` |
| Regeln mit Donnerstagen | `is` |
| Platzhalter | `xa` |

## Was die Umwandlung macht

- Standardmäßig werden Feiertage vom Typ `public` oder ohne expliziten Typ übernommen. Pro Land oder Region
  lässt sich das mit `includeDayTypes` erweitern, einzelne Regeln mit `includeDayRules` (z. B. `dk`: 06-05
  und 12-24). Gedenktage, Bankfeiertage und Schultage sind nicht generell `PH`.
- `since`/`until`/`prior to` und `active` beeinflussen die Auswahl zum Zeitpunkt des Syncs.
  Einmalige Feiertage werden für das aktuelle Jahr bis einschließlich drei Jahre danach übernommen.
  `active`, `disable` und `enable` werden nicht zur Laufzeit ausgewertet: Historische und weit zukünftige
  Ergebnisse sowie einzelne Ausnahmetermine sind deshalb nicht allgemein garantiert.
- Namen kommen aus dem Land (`name`, `_name`) und der globalen `names.yaml`. Die Sprache bestimmen `langs`,
  `preferredLangs` und `nameLangs`.
- Bundesländer werden je nach Land über `only_states` oder eigene PH-Abschnitte abgebildet. Manche
  Unterregionen werden auf die Bundeslandebene hochgezogen (Ausnahmen in `SKIP_SUBREGION_PROMOTION`);
  das ist eine Näherung und kann örtlich zu ungenau sein.
- Länder mit `baseCc` erben die Regeln eines anderen Landes (`je`, `gg`, `im`, `gi` von `gb`).
- Kommentare vor `PH:`, `_nominatim_url` und `SH` in bestehenden YAML-Dateien bleiben erhalten.
- Nicht umsetzbare Regeln, z. B. manche Kalender- und Zeitregeln, werden mit einer Warnung übersprungen.
  Julianische Daten werden mit einem Versatz von 13 Tagen umgerechnet. Das ist bis 2099 korrekt;
  das Skript warnt davor.

Der Abgleich ist daher kein Nachweis vollständiger Konfliktfreiheit mit `date-holidays`. Insbesondere
Filter, Übersetzungen, Ausnahmen und Ortsauflösung müssen bei Änderungen überprüft werden.

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
- [ ] Referenzzeit für den Sync festlegen und eine reproduzierbare CI-Diff-Prüfung ermöglichen
- [ ] Verbleibende von Hand gepflegte Länder (`gb`, `ci`, `cn`, `vn`) umstellen, sobald der Parser es erlaubt
- [ ] Warnungen zu nicht unterstützten öffentlichen Regeln auswerten und nach Relevanz priorisieren
- [ ] Aktuelle und nahe zukünftige Ausnahmen (`active`, `disable`, `enable`) sowie die Genauigkeit
      hochgezogener Unterregionen überprüfen

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
4. Können YAML, Sync und Generator vereinfacht oder der Parser von `date-holidays` genutzt werden, ohne
   Datenqualität, Ortsauflösung oder Bundle-Größe zu verschlechtern? Siehe
   [Danach evaluieren](MIGRATION_OVERVIEW.md#danach-evaluieren).

## Ziele

- Die derzeit 53 konfigurierten Länder werden erzeugt; offene Regeln und Ausnahmen sind bekannt
- Bundle-Größe bei Änderungen messen und bewerten
- Tests nach Datenänderungen grün
- Keine zusätzlichen Fehlerberichte zu Feiertagen
