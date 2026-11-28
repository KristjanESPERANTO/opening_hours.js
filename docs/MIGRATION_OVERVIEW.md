<!-- SPDX-FileCopyrightText: © opening_hours.js contributors -->
<!-- SPDX-License-Identifier: LGPL-3.0-only -->
# Migration zu externen Feiertagsdaten - Überblick

Stand: 15. November 2026

## Ziel

Der Wartungsaufwand für Public Holidays (PH) und School Holidays (SH) soll sinken, indem die Daten aus
externen Projekten übernommen werden, statt sie von Hand zu pflegen. Fehler in den Quelldaten werden
bevorzugt dort behoben (Upstream) und danach per Synchronisation übernommen.

Zwei Migrationen mit eigenen Detaildokumenten:

1. **[Public Holidays → date-holidays](MIGRATION_PUBLIC_HOLIDAYS.md)**: Regeln (`easter -2`, `1st monday in May`)
   werden in unser Format umgewandelt.
2. **[School Holidays → OpenHolidays-Daten](MIGRATION_SCHOOL_HOLIDAYS.md)**: konkrete Ferienperioden werden
   aus CSV-Dateien erzeugt.

## Datenfluss

```text
submodules/date-holidays
        │  node scripts/sync_holidays_from_date_holidays.js
        ▼
src/holidays/<cc>.yaml  (PH, Nominatim-Metadaten)
        │
        │            submodules/openholidaysapi.data (SH, CSV)
        │                          │
        ▼                          ▼
   node scripts/generate-holiday-definitions.mjs
        │
        ▼
src/holidays/generated-openholidays.mjs  ──►  Rollup-Build (src/index.js)
```

- **Die Reihenfolge ist verbindlich:** Das zweite Skript liest die YAML-Dateien, die das erste schreibt.
- Beide Skripte arbeiten offline auf den versionierten Submodulen. Die erzeugten Dateien werden committed;
  der normale Build braucht weder Netzwerk noch die Submodule.
- Der PH-Sync verwendet das aktuelle Datum und Jahr. Deshalb kann er auch bei unverändertem Submodulstand
  zu einem späteren Zeitpunkt andere Daten erzeugen. Der SH-Generator verwendet das Jahr des
  OpenHolidays-Submodul-Commits für sein Zeitfenster.
- Der Ablauf vor einem Release steht in [CONTRIBUTING.md](../CONTRIBUTING.md) und
  [src/holidays/README.md](../src/holidays/README.md).

## Quellen und Abdeckung

| | Public Holidays | School Holidays |
|---|---|---|
| Quelle | [date-holidays](https://github.com/commenthol/date-holidays) (Regeln) | [OpenHolidays-Daten](https://github.com/openpotato/openholidaysapi.data) (konkrete Perioden) |
| Submodul | `submodules/date-holidays` | `submodules/openholidaysapi.data` |
| Skript | `scripts/sync_holidays_from_date_holidays.js` | `scripts/generate-holiday-definitions.mjs` |
| Zwischenstand | `src/holidays/<cc>.yaml` | - |
| Abdeckung | 53 Länder werden erzeugt | 33 Länder, dazu der Platzhalter `xa` |
| Begründung | Wiederkehrende Regeln bleiben klein; einmalige Feiertage behalten ihr Jahr | Schulferien sind konkret geplant und lassen sich nicht berechnen |

Im generierten Modul stehen derzeit **61 Länder bzw. Ländercodes**: 58 mit PH, 34 mit SH, 31 mit beidem.

**PH-Länder, die nicht erzeugt werden (13)** und deshalb ihre YAML behalten oder keine PH haben:

- Kalender nicht unterstützt: `al`, `ba`, `ci`, `cn`, `kr`, `ma`, `me`, `sg`, `tr`, `vn`
- Sonderfälle: `gb` (eigenes Format pro Abschnitt), `is` (Regeln mit Donnerstagen)
- Platzhalter: `xa`

Von Hand gepflegt bleiben damit `gb`, `ci`, `cn`, `vn` und der Platzhalter `xa`.
SH-Daten stehen nur noch für `xa` in der YAML, alle anderen kommen aus OpenHolidays.

Das `date-holidays`-Submodul enthält derzeit 208 Länderdateien. Nicht alle zusätzlichen Einträge sind
für `PH` geeignet: Es gibt beispielsweise Gedenktage, Bankfeiertage und Schultage. Auch bei öffentlichen
Feiertagen fehlen noch Regel- und Kalendersysteme sowie teilweise eine hinreichend genaue Ortsauflösung.
Die erzeugten Daten sind daher weder vollständig noch garantiert konfliktfrei gegenüber der Quelle.

## Steuerung im Sync-Skript

Pro Land stehen die Besonderheiten in `scripts/sync_holidays_from_date_holidays.js`:

- `COUNTRY_CONFIGS`: Feiertagstypen (`includeDayTypes`, `includeDayRules`), Namenssprachen, Bundesländer,
  Nominatim-Angaben, `skip` mit Begründung. Beispiel: `dk` nimmt per `includeDayRules` Grundlovsdag (06-05)
  und Juleaftensdag (12-24) auf, obwohl sie dort als Beobachtungstage geführt werden.
- `COUNTRY_OVERRIDES`: Korrekturen nach der Umwandlung für `au`, `jp`, `ca`. Neue Länder brauchen
  eine Konfiguration und gegebenenfalls zusätzliche Regel- und Regionsunterstützung.
- Kommentare, `_nominatim_url` und `SH` in bestehenden YAML-Dateien bleiben beim Sync erhalten.
- Der Sync verarbeitet immer alle konfigurierten Länder; eine Länderauswahl oder `--dry-run` gibt es nicht.
- Einmalige Feiertage werden nur für das aktuelle Jahr bis einschließlich drei Jahre danach übernommen.
  `active` wird bei der Auswahl berücksichtigt, aber wie `disable` und `enable` nicht zur Auswertung
  beliebiger Jahre ausgegeben.

Einen Land-Rollback gibt es über `skip` in `COUNTRY_CONFIGS` oder über `git revert` der generierten Datei.

## Offene Punkte

**Automatisierung**

- [ ] Submodule automatisch aktualisieren und PH-/SH-Änderungen als Diff-Bericht ausgeben
- [ ] Reproduzierbare PH-Referenzzeit festlegen und darauf aufbauend prüfen, ob Sync und Generate
      auf dem eingecheckten Stand einen Diff erzeugen
- [ ] Regelmäßigen Sync per GitHub Action einrichten (es gibt bisher nur `ci.yaml`)

**Daten**

- [ ] Verbleibende PH von Hand: `gb`, `ci`, `cn`, `vn`; Parser-Unterstützung für Mond- und islamische Kalender
  und für das GB-Format wäre nötig
- [ ] Übersprungene Länder erneut prüfen, wenn der Parser mehr Kalender kann
- [ ] Gefundene Fehler in den Quelldaten upstream melden oder beheben (date-holidays, openholidaysapi.data)
- [ ] Übersprungene öffentliche Regeln und zeit- oder ortsabhängige Ausnahmen erfassen und priorisieren;
      Ergebnisse mit der Quelle vergleichen, statt pauschal Konfliktfreiheit anzunehmen
- [ ] Umgang mit `active`, `disable` und `enable` erneut prüfen, falls relevante aktuelle oder nahe
      zukünftige Ausnahmen auftreten

**Dokumentation**

- [ ] Hinweis im Haupt-README auch zur PH-Quelle ergänzen (SH ist bereits beschrieben)
- [ ] Änderungsprotokoll für die PH-Synchronisation ergänzen; bestehende Datenänderungen und
      die SH-Migration sind bereits im CHANGELOG aufgeführt
- [ ] Liste der Upstream-Beiträge und Dank an die beiden Projekte

## Danach evaluieren

Wenn Abdeckung, Zeitbezug und Datenqualität ausreichend geklärt sind, sind folgende Schritte zu prüfen.
Eine vollständige PH-Migration einschließlich `gb`, `ci`, `cn` und `vn` ist dafür noch nicht erreicht:

- [ ] **YAML-Daten auflösen:** Die `src/holidays/<cc>.yaml` ersetzen oder auf die Metadaten reduzieren
      (Nominatim-URLs, `_state_code`, Quellenkommentare). Offen ist, wo diese Angaben danach liegen.
- [ ] **Sync-Skript im Generator aufgehen lassen:** Eine Pipeline statt zwei Skripten. Das beseitigt die
      Abhängigkeit von der Reihenfolge Sync, dann Generate.
- [ ] **Eigenen PH-Parser durch den von `date-holidays` ersetzen:** Das würde die Umwandlung in unser
      Regelformat (`variable_date`, `shift_rule`) möglicherweise überflüssig machen und zusätzliche Kalender
      ermöglichen. Zu prüfen sind tatsächliche Regelabdeckung, Lizenz, Bundle-Größe, Laufzeit-Abhängigkeit,
      Ortsauflösung und der Aufwand für die Anpassung von Parser und Tests.

Die Reihenfolge ist offen: Die ersten beiden Punkte lassen sich ohne den Parser-Wechsel umsetzen.

## Entschieden und umgesetzt

- [x] `date-holidays` und `openholidaysapi.data` als versionierte Submodule
- [x] PH-Synchronisation für 53 Länder inklusive Bundesländer
- [x] SH-Generierung aus den OpenHolidays-CSV-Dateien, zusammen mit den PH in einem Modul
- [x] SH-Daten aus OpenHolidays ersetzen die bisherigen SH-Einträge; `xa` bleibt YAML-Beispiel und Fallback
- [x] Vorgehen vor dem Release dokumentiert (Reihenfolge Sync, dann Generate)

## Nicht umgesetzt (ursprünglich geplant)

Diese Punkte standen im früheren Plan und existieren nicht:

- Skripte `fetch-public-holidays.mjs`, `compare-ph-sources.mjs`, `compare-sh-sources.mjs`,
  `convert-sh-to-openholidays.mjs` und `prebuild`/`fetch-holidays`
- Konfigurationsdateien `config/*-sources.json` und Feature-Flags pro Land
- Workflow `holiday-data-sync.yml`
- `date-holidays` als Laufzeit-Abhängigkeit. Das Paket wird nur als Datenquelle im Submodul genutzt.

Die unterstützten Länder wurden nicht schrittweise aktiviert, sondern in einem Schritt aus den Quellen
erzeugt und mit der Test-Suite abgesichert. Ob ein Fetch beim Build (Zielbild früherer Planstände)
noch gewünscht ist, ist offen: Der aktuelle Ablauf ist offline, der PH-Sync aber zeitabhängig.

## Erfolgsmetriken

| Metrik | Ziel | Stand |
|---|---|---|
| PH ohne Handpflege | alle unterstützten Länder | 53 erzeugt, 4 von Hand |
| SH ohne Handpflege | alle OpenHolidays-Länder | 33 von 33 |
| Tests | alle grün | `npm test` ausführen; Ergebnis ist laufabhängig |
| Netzwerk beim Build | keins | keins |
