<!--
SPDX-FileCopyrightText: © opening_hours.js contributors

SPDX-License-Identifier: CC0-1.0
-->

# Roadmap: Visueller Editor für `opening_hours`

## Worum geht es?

YoHours wird seit Oktober 2018 nicht mehr gepflegt. Im Projekt wird es heute nur noch verwendet, um bei passenden Eingaben einen Link zum externen YoHours-Editor anzuzeigen. Dafür liegen noch ein Submodul und eine rund 2800 Zeilen große Kopie des YoHours-Modells im Repository.

Das Evaluation Tool soll deshalb einen eigenen Editor bekommen. Nutzer sollen Öffnungszeiten direkt im Kalender bearbeiten können und dabei jederzeit den passenden `opening_hours`-Text sehen. Die bestehende Bibliothek übernimmt weiterhin Parsing, Validierung und Auswertung.

## Zielbild

- Wochenkalender mit Zeitintervallen für Montag bis Sonntag
- Änderungen per Drag & Drop, Klick und Größenänderung
- Synchronisation in beide Richtungen: Text ↔ Kalender
- Live-Validierung und verständliche Fehlermeldungen
- Unterstützung einfacher Eingaben zuerst, komplexer Syntax später
- Fallback auf den Textmodus, wenn etwas nicht visuell bearbeitbar ist
- Barrierearme Bedienung und gute Nutzung auf mobilen Geräten

Der Editor wird Teil des bestehenden Evaluation Tools. Eine zusätzliche App ist zunächst nicht nötig.

## Vorteile gegenüber YoHours

| Bereich | YoHours | Unser Editor |
|---|---|---|
| Syntax-Unterstützung | Nur ein Teil der Syntax | Vollständige Unterstützung als Ziel |
| Parser | Eigene, veraltete Implementierung | `opening_hours.js` |
| Import komplexer Regeln | Nur teilweise | Mit Textmodus als Fallback |
| Live-Validierung | Nein | Ja |
| Synchronisation | Eingeschränkt | Text und Kalender in beide Richtungen |
| Integration | Separates Tool | Teil des Evaluation Tools |
| Pflege | Seit 2018 nicht mehr aktiv | Wird mit dem Projekt weiterentwickelt |
| Technologie | jQuery, Bootstrap 3, FullCalendar | Bestehender moderner Projekt-Stack |
| Barrierefreiheit | Grundlegend | Von Anfang an mitgedacht |

## Umsetzung

### Phase 1: MVP

**Ziel:** Ein verlässlicher Editor, der bei den bisherigen Kernfunktionen keinen Rückschritt gegenüber YoHours darstellt.

- [ ] Wochenansicht von Montag bis Sonntag, 00:00 bis 24:00
- [ ] Zeitintervalle per Drag & Drop anlegen
- [ ] Intervalle löschen und an den Rändern verändern
- [ ] Änderungen aus dem Textfeld im Kalender anzeigen
- [ ] Kalenderänderungen zurück in `opening_hours` schreiben
- [ ] Mehrere Zeiträume oder Seasons anlegen und bearbeiten
- [ ] Einfache bestehende Regeln importieren und weiterbearbeiten
- [ ] Tests für Parser, Generator und die wichtigsten Interaktionen
- [ ] Vergleichstests mit typischen YoHours-Anwendungsfällen

Der MVP muss die grundlegenden YoHours-Abläufe mindestens gleich gut abdecken: Wochenansicht, Zeitintervalle, Drag & Drop, Größenänderung, Löschen, mehrere Zeiträume und die Ausgabe eines gültigen `opening_hours`-Strings. Eine vollständige Unterstützung der `opening_hours`-Syntax ist dafür noch nicht nötig.

Beispiele:

```text
Mo-Fr 10:00-20:00
Mo-Fr 08:00-12:00,14:00-18:00
Sa 09:00-13:00
```

### Phase 2: Mehr Syntax

**Ziel:** Regeln abbilden, die über eine normale Wochenroutine hinausgehen.

- [ ] Feiertage und Schulferien (`PH`, `SH`)
- [ ] Wochenintervalle wie `week 1-52/2`
- [ ] Monthday-Regeln wie `Jan 25-30`
- [ ] Kommentare und Modifier wie `open "only by appointment"` oder `PH off`
- [ ] Erweiterte visuelle Auswahl für Zeiträume und Sondertage

### Phase 3: Vollständige Integration

**Ziel:** Der Editor wird ein gleichwertiger Teil des Evaluation Tools.

- [ ] Komplexe `opening_hours` importieren und bearbeitbare Teile erkennen
- [ ] Nicht unterstützte Teile klar markieren und im Textmodus weiterbearbeiten
- [ ] Live-Vorschau der resultierenden Öffnungszeiten
- [ ] Konflikte und Überschneidungen hervorheben
- [ ] Undo/Redo sowie Kopieren zwischen Tagen
- [ ] Vorlagen für typische Fälle wie Restaurant, Geschäft und 24/7
- [ ] Tastaturbedienung, Screenreader-Unterstützung und ARIA-Labels

Beispiele für spätere Phasen:

```text
Mo-Fr 10:00-20:00; PH off; easter -2 days off
(sunrise+01:00)-20:00; PH off
```

### Phase 4: Testen und Verbessern

- [ ] Beta-Test mit OSM-Nutzern
- [ ] Dokumentation und kurze Beispiele ergänzen
- [ ] Mobile Nutzung prüfen und verbessern
- [ ] Übersetzungen in das bestehende i18n-System einbauen
- [ ] Performance und Offline-Nutzung prüfen
- [ ] Eine Integration in iD oder JOSM nur bei konkretem Bedarf planen

### Phase 5: YoHours entfernen

YoHours bleibt bis zur Stabilisierung als Referenz und Fallback erhalten. Danach:

- [ ] Submodul `submodules/YoHours/` entfernen
- [ ] `site/js/yohours_model.js` löschen
- [ ] YoHours-Prüfung und Link aus `helpers.js` entfernen
- [ ] Veraltete Übersetzungen, README-Hinweise und `.gitmodules` bereinigen

## Technische Richtung

Die erste Version wird mit Vanilla JavaScript umgesetzt und bleibt damit möglichst nah am bestehenden Code. React, Vue oder Lit sind für den MVP nicht vorgesehen.

Für die Darstellung bietet sich normales DOM mit CSS Grid an: Das ist leichter zugänglich als Canvas und reicht für einen Wochenkalender aus. Parser, Generator und Validierung kommen aus `opening_hours.js`; die Editorlogik sollte keine zweite Syntax-Implementierung aufbauen.

## Risiken

| Risiko | Umgang damit |
|---|---|
| Der MVP wird zu groß | Erst nur einfache Wochenregeln umsetzen. |
| Komplexe Syntax lässt sich nicht visualisieren | Textmodus als Fallback beibehalten. |
| Parser- oder Generatorfehler | Beispiele und Roundtrip-Tests früh ergänzen. |
| Zusätzlicher Pflegeaufwand | Kleine, bestehende Technologien bevorzugen. |
| Zu wenig Feedback | Früh einen kleinen Beta-Test mit OSM-Nutzern starten. |

## Nächste Schritte

1. [x] Einen kleinen Proof of Concept für die Wochenansicht mit Vanilla JavaScript bauen.
2. Roundtrip-Tests für Text → Kalender → Text anlegen.
3. Design und Bedienung mit ein paar echten Beispielen prüfen.
4. Danach den MVP schrittweise in das Evaluation Tool integrieren.

## Leitlinien

- **Darstellung:** Desktop-first, aber responsive und auf mobilen Geräten grundsätzlich nutzbar.
- **Komplexe Sonderzeiten:** Regeln wie `sunrise`, `sunset` oder `easter` bleiben bei Bedarf im Textmodus. Sie dürfen nicht stillschweigend verändert werden.
- **API:** Eine externe API ist nicht Teil des MVP. Sie wird erst geplant, wenn es dafür einen konkreten Anwendungsfall gibt.

## Links

- [opening_hours-Spezifikation](https://wiki.openstreetmap.org/wiki/Key:opening_hours/specification)
- [opening_hours.js](https://github.com/opening-hours/opening_hours.js)
- [YoHours](https://framagit.org/PanierAvide/YoHours)
- [Taginfo: opening_hours](https://taginfo.openstreetmap.org/keys/opening_hours)

---

**Erstellt:** 2025-12-26
**Letzte Änderung:** 2026-08-08
**Status:** Entwurf
**Nächstes Review:** Nach dem MVP
