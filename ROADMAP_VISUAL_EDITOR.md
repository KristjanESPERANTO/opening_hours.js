# Roadmap: Visual Opening Hours Editor

## Hintergrund

YoHours wird seit 2018/2019 nicht mehr aktiv entwickelt (letzter Commit: Oktober 2018). Das Projekt nutzt YoHours aktuell nur minimal:

### Aktuelle YoHours-Nutzung

1. **Git-Submodul** unter `submodules/YoHours/`
   - Repository: `https://framagit.org/PanierAvide/YoHours.git`
   - Letzter Commit: Oktober 2018 (über 6 Jahre alt)

2. **`site/js/yohours_model.js`** (~2800 Zeilen)
   - Kopie von YoHours' `model.js`
   - Enthält eigenen OpeningHoursParser
   - Hauptnutzung: `YoHoursChecker.canRead()` Funktion

3. **Tatsächliche Verwendung** in `site/js/helpers.js`:
   ```javascript
   if (YoHoursChecker.canRead(value)) {
       // Zeigt Link zu https://projets.pavie.info/yohours/ an
   }
   ```

**Fazit**: Einziger Zweck ist das Anzeigen eines Links zu einem externen Tool.

---

## Vision: Integrierter Visual Editor

Das Evaluation Tool soll um einen vollwertigen **visuellen Editor** erweitert werden, der YoHours nicht nur ersetzt, sondern übertrifft.

### Was YoHours bietet:
- ✅ Drag & Drop auf Wochenkalender
- ✅ Mehrere Seasons/Date Ranges
- ✅ Live-Generierung von `opening_hours` Strings
- ❌ Nur Subset der Syntax unterstützt
- ❌ Kein Import komplexer opening_hours
- ❌ Veraltet (jQuery, Bootstrap 3, FullCalendar)

### Was unser Editor bieten soll:
- ✅ Drag & Drop auf Wochenkalender
- ✅ Mehrere Seasons/Date Ranges
- ✅ Vollständige opening_hours Syntax-Unterstützung
- ✅ Bi-direktionale Synchronisation (Text ↔ Visual)
- ✅ Import und Export komplexer opening_hours
- ✅ Live-Validation mit sofortigem Feedback
- ✅ Moderne Technologie
- ✅ Integriert in ein Tool (Editor + Validator + Visualizer)

---

## Architektur

```text
┌─────────────────────────────────────────────────────┐
│         Evaluation Tool (erweitert)                 │
│                                                     │
│  ┌──────────────────┐  ┌─────────────────────────┐ │
│  │  Text Editor     │←→│  Visual Calendar Editor │ │
│  │  (existing)      │  │  - Wochenansicht        │ │
│  │  - Input field   │  │  - Drag & Drop          │ │
│  │  - Syntax HL     │  │  - Date Ranges          │ │
│  └──────────────────┘  └─────────────────────────┘ │
│           ↓                       ↓                 │
│  ┌────────────────────────────────────────────────┐ │
│  │     opening_hours.js Library                   │ │
│  │     - Parser (read opening_hours strings)      │ │
│  │     - Generator (write opening_hours strings)  │ │
│  │     - Validation                               │ │
│  └────────────────────────────────────────────────┘ │
│           ↓                                         │
│  ┌────────────────────────────────────────────────┐ │
│  │  Visualization & Evaluation                    │ │
│  │  - Weekly table                                │ │
│  │  - Time evaluation                             │ │
│  │  - Prettified output                           │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## Entwicklungsphasen

### **Phase 1: Basis-Editor (MVP)** 🎯 Nächste Priorität
**Aufwand**: 2-3 Wochen  
**Ziel**: Einfacher, funktionaler Wocheneditor

#### Features:
- [ ] Simple Wochenansicht (Mo-So, 00:00-24:00)
- [ ] Drag & Drop für Zeitintervalle erstellen
- [ ] Click zum Löschen von Intervallen
- [ ] Resize von Intervallen (Drag am Rand)
- [ ] Bi-direktionale Synchronisation:
  - Input-Feld ändern → Kalender aktualisiert
  - Kalender ändern → Input-Feld aktualisiert
- [ ] Nur "einfache" opening_hours (keine Seasons, keine PH zunächst)

#### Technische Entscheidungen:
- **Framework**: React / Vue / Vanilla JS?
  - Vorschlag: Vanilla JS oder Lit (Web Components) für minimale Dependencies
- **Rendering**: Canvas / SVG / DOM?
  - Vorschlag: DOM mit CSS Grid für beste Zugänglichkeit
- **Integration**: opening_hours.js als Parser/Generator nutzen

#### Beispiel-Unterstützung (Phase 1):
```text
Mo-Fr 10:00-20:00
Mo-Fr 08:00-12:00,14:00-18:00
Sa 09:00-13:00
```

---

### **Phase 2: Erweiterte Features** 🚀 Mittelfristig
**Aufwand**: 2-4 Wochen  
**Ziel**: Umfassende Syntax-Unterstützung

#### Features:
- [ ] **Multiple Date Ranges / Seasons**
  - Tab-Navigation wie in YoHours
  - "All year" + spezifische Ranges
  - Visual Picker für Date Ranges
  
- [ ] **Public Holidays (PH) Support**
  - PH-Tag im Kalender
  - PH off / PH open Handling
  - School Holidays (SH)
  
- [ ] **Wochenintervalle**
  - `week 1-52/2` (jede 2. Woche)
  - `week 4-16` (bestimmte Wochen)
  
- [ ] **Comments & Modifiers**
  - `open "only by appointment"`
  - `off "closed for holidays"`
  
- [ ] **Monthday Selectors**
  - `Jan 25-30: Mo-Fr 10:00-18:00`
  - Visual Calendar-Picker für spezifische Daten

#### Beispiel-Unterstützung (Phase 2):
```text
Mo-Fr 10:00-20:00; PH off
Jan-Mar: Mo-Fr 09:00-17:00; Apr-Dec: Mo-Fr 10:00-18:00
week 1-52/2: Sa 10:00-14:00
```

---

### **Phase 3: Vollständige Integration** ⭐ Langfristig
**Aufwand**: 1-2 Wochen  
**Ziel**: Best-in-class opening_hours Editor

#### Features:
- [ ] **Import komplexer opening_hours**
  - Automatische Erkennung editierbarer Teile
  - Fallback zu Text-Mode bei nicht unterstützten Features
  
- [ ] **Live-Vorschau**
  - Generierte Öffnungszeiten-Tabelle während Editing
  - Hervorhebung von Konflikten/Überschneidungen
  
- [ ] **Advanced Mode Toggle**
  - Automatischer Wechsel bei komplexer Syntax
  - Warnung bei Features die visuell nicht editierbar sind
  
- [ ] **Template-System**
  - Vorlagen: "Restaurant", "Shop", "Bank", "24/7", etc.
  - Community-Templates
  - Speichern eigener Templates
  
- [ ] **Undo/Redo**
  - History-System für Änderungen
  
- [ ] **Copy & Paste**
  - Zeitintervalle zwischen Tagen kopieren
  - "Apply to all weekdays"
  
- [ ] **Accessibility**
  - Keyboard-Navigation
  - Screen-Reader Support
  - ARIA-Labels

#### Beispiel-Unterstützung (Phase 3):
```text
Mo-Fr 10:00-20:00; PH off; easter -2 days off
(sunrise+01:00)-20:00; PH off
2025 Jan 01-2025 Dec 31: Mo-Fr 09:00-17:00
```

---

### **Phase 4: Community & Polish** 💎 Future
**Aufwand**: Ongoing

- [ ] Beta-Testing mit OSM-Community
- [ ] Dokumentation & Tutorials
- [ ] Integration in OSM-Editoren (iD, JOSM)?
- [ ] Mobile-optimierte Version
- [ ] Mehrsprachigkeit (i18n wie Evaluation Tool)
- [ ] Performance-Optimierung
- [ ] Offline-Modus (PWA)

---

### **Phase 5: YoHours Cleanup** 🧹 Final
**Aufwand**: 1-2 Stunden  
**Timing**: Nachdem der neue Editor stabil läuft

**Begründung**: YoHours kann während der Entwicklung als Referenz dienen und parallel laufen. Erst wenn der neue Editor alle wichtigen Features hat und stabil ist, sollte YoHours entfernt werden.

- [ ] YoHours Submodul entfernen (`git rm submodules/YoHours`)
- [ ] `site/js/yohours_model.js` löschen
- [ ] YoHours-Check und Referenzen aus `helpers.js` entfernen
- [ ] i18n-Übersetzungen "refer to yohours" aus `i18n-resources.js` entfernen
- [ ] README aktualisieren (YoHours → neuer Editor)
- [ ] `.gitmodules` aufräumen
- [ ] CHANGELOG aktualisieren

**Ergebnis**: Projekt ist schlanker, keine veralteten Dependencies, neuer Editor ist die einzige Lösung

---

## Vorteile gegenüber YoHours

| Feature | YoHours | Unser Editor |
|---------|---------|--------------|
| Syntax-Unterstützung | Subset | Vollständig |
| Parser | Custom (veraltet) | opening_hours.js (aktiv) |
| Import komplexer OH | ❌ Teilweise | ✅ Vollständig |
| Live-Validation | ❌ | ✅ |
| Bi-direktional | ❌ Limited | ✅ Full |
| Integration | Separate Tool | ✅ Ein Tool |
| Wartung | ❌ Seit 2018 tot | ✅ Aktiv |
| Technologie | jQuery, Bootstrap 3 | Modern Stack |
| Accessibility | ⚠️ Basic | ✅ WCAG 2.1 |

---

## Technische Überlegungen

### Option A: Vanilla JavaScript
**Pro**:
- Keine zusätzlichen Dependencies
- Volle Kontrolle
- Konsistent mit bestehendem Code

**Contra**:
- Mehr Boilerplate-Code
- State-Management selbst bauen

### Option B: Lit (Web Components)
**Pro**:
- Lightweight (~5KB)
- Standard Web Components
- Reactive und modern
- Gute TypeScript-Unterstützung

**Contra**:
- Neue Dependency
- Learning Curve für Maintainer

### Option C: React/Vue
**Pro**:
- Große Community
- Viele Komponenten verfügbar
- Ausgereiftes Ökosystem

**Contra**:
- Größere Bundle-Size
- Overkill für dieses Feature?

### Empfehlung: **Lit** oder **Vanilla JS**
Für maximale Kompatibilität und minimale Dependencies würde ich **Lit** empfehlen, mit Fallback zu Vanilla JS falls das Team keine neuen Dependencies möchte.

---

## Risiken & Mitigationen

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|-------------------|--------|------------|
| Zu komplex für Umsetzung | Mittel | Hoch | Phased Approach, MVP first |
| Community nutzt YoHours weiter | Niedrig | Mittel | Marketing, bessere Features |
| Parsing-Bugs | Mittel | Hoch | Extensive Tests, nutze existing lib |
| Browser-Kompatibilität | Niedrig | Mittel | Modern aber standard APIs |
| Maintenance-Burden | Mittel | Mittel | Clean Code, Docs, Tests |

---

## Erfolgsmetriken1: MVP

```text
              [==============] 2-3 Wochen
|
+2 Monate      Phase 2: Erweitert        [==================] 2-4 Wochen
|
+4 Monate      Phase 3: Integration      [==========] 1-2 Wochen
|
+5 Monate      Phase 4: Community        [~~~~~~~~~~~~~~~~~~~~~] Ongoing
|                                         ↓
+6 Monate      Phase 5: YoHours Cleanup  [===] 1-2 Stunden (nach Stabilisierung)
```

**Hinweis**: YoHours bleibt während der gesamten Entwicklung als Referenz und Fallback bestehen. ] <5% Bug-Reports nach 3 Monaten Beta
- [ ] Positive Feedback von OSM-Community
- [ ] 1000+ monatliche Nutzer

---

## Zeitplan (Grob)

```text
Heute          Phase 0: Cleanup          [=====] 1-2 Stunden
|
+1 Monat       Phase 1: MVP              [==============] 2-3 Wochen
|
+3 Monate      Phase 2: Erweitert        [==================] 2-4 Wochen
|
+5 Monate      Phase 3: Integration      [==========] 1-2 Wochen
|
+6 Monate      Phase 4: Community        [~~~~~~~~~~~~~~~~~~~~~] Ongoing
```

---

## Nächste Schritte

### STech-Stack Entscheidung treffen
3. ⏳ GitHub Issue erstellen für Community-Feedback
4. ⏳ Design-Mockups/Wireframes erstellen

### Kurzfristig (nächster Monat):
1. ⏳ Proof-of-Concept implementieren
2. ⏳ Test-Suite für Editor aufsetzen
3. ⏳ YoHours als Referenz analysieren (was funktioniert gut, was nicht)

### Mittelfristig (Q1-Q2 2026):
1. ⏳ Phase 1 MVP fertigstellen
2. ⏳ Beta-Testing starten
3. ⏳ Feedback sammeln und iterieren
4. ⏳ Nach Stabilisierung: YoHours Dependencies entfernen (Phase 5)
2. ⏳ Beta-Testing starten
3. ⏳ Feedback sammeln und iterieren

---

## Offene Fragen

- [ ] Soll der Editor Teil der bestehenden Site sein oder separate App?
- [ ] Mobile-First oder Desktop-First?
- [ ] Welche Browser-Unterstützung (Modern only vs. IE11)?
- [ ] Soll es eine API geben für externe Integration?
- [ ] Wie mit sehr komplexen opening_hours umgehen (sunrise, easter, etc.)?

---

## Ressourcen & Links

- [opening_hours Specification](https://wiki.openstreetmap.org/wiki/Key:opening_hours/specification)
- [opening_hours.js Library](https://github.com/opening-hours/opening_hours.js)
- [YoHours (archived)](https://framagit.org/PanierAvide/YoHours)
- [Taginfo opening_hours](https://taginfo.openstreetmap.org/keys/opening_hours)
- [OSM Wiki: opening_hours](https://wiki.openstreetmap.org/wiki/Key:opening_hours)
## Notizen

### Warum YoHours erst am Ende entfernen?

1. **Referenz-Implementierung**: YoHours zeigt, wie ein visueller Editor funktioniert - gut als Orientierung
2. **Parallele Nutzung**: Während der Entwicklung können beide Tools koexistieren
3. **Risikoreduzierung**: Falls der neue Editor Probleme hat, existiert noch ein Fallback
4. **Analyse-Möglichkeit**: Code kann studiert werden um Patterns/Algorithmen zu verstehen
5. **Schrittweise Migration**: Nutzer können graduell zum neuen Editor wechseln

---

**Erstellt**: 2025-12-26  
**Letzte Änderung**: 2025-12-26  
**Status**: 📋 Draft  
**Nächstes Review**: Nach Phase 1 MVP
**Erstellt**: 2025-12-26  
**Status**: 📋 Draft  
**Nächstes Review**: Nach Phase 0 Completion
