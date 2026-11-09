<!-- SPDX-FileCopyrightText: © opening_hours.js contributors -->
<!-- SPDX-License-Identifier: LGPL-3.0-only -->
# Migration: School Holidays → OpenHolidays-Daten

Stand: November 2026. Überblick und Datenfluss: [MIGRATION_OVERVIEW.md](MIGRATION_OVERVIEW.md).

## Zusammenfassung

Die School Holidays (SH) kommen aus den CSV-Dateien des Projekts
[openholidaysapi.data](https://github.com/openpotato/openholidaysapi.data), das als Git-Submodul
`submodules/openholidaysapi.data` eingebunden ist. Das Skript `scripts/generate-holiday-definitions.mjs`
liest die CSV-Dateien, verbindet sie mit den PH aus `src/holidays/<cc>.yaml` und schreibt
`src/holidays/generated-openholidays.mjs`. `src/index.js` importiert diese Datei.

```bash
# Nach dem PH-Sync ausführen
node scripts/generate-holiday-definitions.mjs
```

Der Kopf der erzeugten Datei nennt den verwendeten Stand des Submoduls.

## Warum OpenHolidays für SH?

- Die Daten haben dieselbe Struktur wie unsere früheren YAML-Einträge: Ferienperioden mit Start und Ende.
- `date-holidays` hat **keine** Ferienperioden, nur einzelne Tage mit `type: school`.
- Schulferien sind konkret geplant und lassen sich nicht berechnen. Deshalb stehen im Modul konkrete Jahre
  statt Regeln, im Gegensatz zu den PH.

## Abdeckung

- **33 Länder** haben SH aus OpenHolidays: `ad`, `al`, `at`, `be`, `bg`, `by`, `ch`, `cz`, `de`, `ee`, `es`,
  `fr`, `hr`, `hu`, `ie`, `it`, `li`, `lt`, `lu`, `lv`, `mc`, `md`, `mt`, `mx`, `nl`, `pl`, `pt`, `ro`, `rs`,
  `si`, `sk`, `sm`, `za`.
- Dazu kommt der Platzhalter `xa` mit Beispieldaten in der YAML (`src/holidays/xa.yaml`).
- Länder ohne Daten in OpenHolidays haben aktuell **keine** SH im Modul. Eine YAML-Rückfallebene ist
  weiterhin möglich (Beispiel: `xa.yaml`), wird aber nur für den Platzhalter genutzt.
- Drei Länder haben nur SH und keine PH im Modul: `ad`, `al`, `li`.

## Ablauf des Skripts

1. CSV-Dateien aus dem Submodul lesen, Länder und Regionen automatisch erkennen. Das Zeitfenster reicht
   höchstens vom Jahr des Submodul-Commits minus 5 bis plus 15 Jahre.
2. Mit den PH und Metadaten aus `src/holidays/<cc>.yaml` zusammenführen
3. Pro Land einen benannten Export in `generated-openholidays.mjs` erzeugen

Das Skript braucht kein Netzwerk und keinen Cache, die Daten kommen aus dem eingecheckten Submodul.
Die erzeugte Datei darf nicht von Hand bearbeitet werden. Fehlende oder falsche Schulferien gehören in das
Upstream-Projekt.

## Stand der Umsetzung

- [x] Submodul `openholidaysapi.data` eingebunden
- [x] Generator liest CSV-Daten und erkennt Länder automatisch
- [x] SH und PH werden in einem Modul zusammengeführt
- [x] Redundante SH-Einträge aus den YAML-Dateien entfernt (Ausnahme: Platzhalter `xa`)
- [x] Build funktioniert offline
- [ ] Submodul-Update mit gezieltem Diff der geänderten Ferien prüfen
- [ ] Beim Update neue Länder erkennen und im Bericht nennen
- [ ] Gesamte Test-Suite nach jedem Update ausführen (als CI-Prüfung)

## Größe

`generated-openholidays.mjs` ist etwa 500 KB groß (unminifiziert). Das ist für SH akzeptabel, weil
Schulferien konkret geplant sind und die Wartung sonst von Hand erfolgen müsste. Die PH bleiben als Regeln
klein.

## Datenqualität

OpenHolidays wird von einer Community gepflegt, die Daten können Fehler enthalten. Auffälligkeiten werden
beim Update über den Diff der erzeugten Datei und über die Tests erkannt und als Beitrag oder Fehlerbericht
an das Upstream-Projekt gegeben.

## Risiken

| Risiko | Wahrscheinlichkeit | Impact | Gegenmaßnahme |
|---|---|---|---|
| Submodul veraltet | Mittel | Mittel | Regelmäßig aktualisieren, Diff prüfen |
| Fehler in den Quelldaten | Mittel | Niedrig | Upstream melden, Diff und Tests |
| Dateigröße wächst | Niedrig | Niedrig | Datenfenster begrenzen |

## Offene Fragen

1. Sollen wir SH für Länder ohne OpenHolidays-Daten (z. B. `ar`, `au`, `ca`, `dk`, `fi`, `gb`, `gr`, `jp`,
   `na`, `no`, `nz`, `ua`, `us`) selbst bereitstellen oder dort upstream beitragen?
2. Soll das Update des Submoduls automatisiert werden?

## Ziele

- Alle OpenHolidays-Länder werden automatisch genutzt (aktuell 33)
- Keine von Hand gepflegten SH-Daten außer dem Platzhalter
- Build funktioniert offline
- Keine Breaking Changes für Nutzer
