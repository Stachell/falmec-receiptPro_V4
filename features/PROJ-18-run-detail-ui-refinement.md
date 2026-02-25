# PROJ-18 — Run-Detail UI-Refinement

**Status:** Done
**Datum:** 2026-02-20
**Baut auf:** PROJ-15, PROJ-16

---

## Ziel

Verbesserung der Symmetrie und Benutzerfreundlichkeit der Run-Detail-Seite durch konsistente Abstände und kollabierbare Datenbereiche.

---

## Umgesetzte Änderungen

### 1. Symmetrische Abstände (`RunDetail.tsx`)
- Spacer-Div `<div className="mb-4" />` zwischen KPI-Kacheln und Tab-Leiste entfernt.
- `Tabs className` von `space-y-4` (16 px) auf `space-y-6` (24 px) geändert.
- Ergebnis: Abstand KPIs→Tab-Leiste = 24 px (`mb-6`), Abstand Tab-Leiste→Body = 24 px (`space-y-6`) — perfekte vertikale Symmetrie.

### 2. Expand-Logik — RE-Positionen (`InvoicePreview.tsx`)
- `ScrollArea h-[400px]` durch ein `<div>` mit `transition-all duration-500 ease-in-out` und bedingtem `max-h-[400px]` / `max-h-[5000px]` ersetzt.
- `useState(false)` für `expandedPositions`.
- Unterhalb der Tabelle: rahmenloses Icon-Button mit `ChevronsDown` (collapsed, `animate-pulse`) / `ChevronsUp` (expanded).
- `ScrollArea`-Import entfernt; `useState` + `ChevronsDown/Up` hinzugefügt.

### 3. Expand-Logik — Artikelliste (`ItemsTable.tsx`)
- Tabellen-Container von `overflow-x-auto` auf `overflow-y-auto overflow-x-auto transition-all duration-500 ease-in-out` mit `max-h-[400px]` (collapsed) / `max-h-[5000px]` (expanded) umgebaut.
- `useState(false)` für `expanded`.
- Chevron-Toggle unter der Tabelle (nur sichtbar wenn `filteredLines.length > 0`).
- `ChevronsDown/Up` zu Lucide-Import hinzugefügt.

### 4. Expand-Logik — Lagerort-Details (`WarehouseLocations.tsx`)
- `<Table>` im "Lagerort-Details"-Block in einen Wrapper-Div mit `transition-all duration-500 ease-in-out max-h-[360px]` / `max-h-[5000px]` eingebettet.
- `useState(false)` für `expandedDetails`.
- Chevron-Toggle unterhalb der Tabelle.
- `ChevronsDown/Up` zu Lucide-Import hinzugefügt.

### 5. Expand-Logik — XML-Vorschau (`ExportPanel.tsx`)
- `ScrollArea h-[300px]` durch `<div>` mit `transition-all duration-500 ease-in-out max-h-[300px]` / `max-h-[5000px]` ersetzt.
- `useState(false)` für `expandedXml`.
- Chevron-Toggle unterhalb des XML-Blocks.
- `ScrollArea`-Import entfernt; `ChevronsDown/Up` zu Lucide-Import hinzugefügt.

### 6 & 7. Spalten-Rename — Artikelliste (`ItemsTable.tsx`)
| Vorher | Nachher |
|---|---|
| `DE` | `Art-# (DE)` |
| `Artikel-# (IT)` | `Art-# (IT)` |

---

## Technische Details

**Expand-Pattern (konsistent in allen 4 Bereichen):**
```tsx
const [expanded, setExpanded] = useState(false);

// Container — overflow-y wechselt beim Expand auf 'hidden', damit kein innerer
// Scroll-Container bestehen bleibt und Mausrad-Events an die Seite weitergereicht werden.
// RE-Positionen nutzt overflow-y-auto dauerhaft (InvoicePreview, wenige Zeilen).
// Alle anderen: overflow-y-hidden im expanded-State.
<div className={`transition-all duration-500 ease-in-out ${
  expanded
    ? 'max-h-[5000px] overflow-y-hidden'   // kein innerer Scroll-Container
    : 'max-h-[Xpx]   overflow-y-auto'      // Scrollbalken sichtbar wenn Inhalt > max-h
}`}>
  {/* content */}
</div>

// Toggle
<div className="flex justify-center py-2 border-t border-border/40">
  <button
    className="text-muted-foreground/50 hover:text-muted-foreground transition-colors p-1 rounded"
    onClick={() => setExpanded(e => !e)}
  >
    {expanded ? <ChevronsUp className="w-5 h-5" /> : <ChevronsDown className="w-5 h-5 animate-pulse" />}
  </button>
</div>
```

**Scroll-Verhalten (Bugfix v2):**
- Problem: `overflow-y-auto` erzeugt auch ohne sichtbaren Scrollbalken einen Scroll-Container.
  Mausrad-Events werden vom Browser zuerst an diesen Container gesendet, was zu wechselndem
  Scroll-Verhalten (innerer Body vs. Seite) führt.
- Lösung: Im ausgeklappten Zustand `overflow-y-hidden` setzen → kein Scroll-Context, Events
  bubbling zur Seite. Im eingeklappten Zustand `overflow-y-auto` → Scrollbalken nur wenn nötig.
- `overflow-y-hidden` + `overflow-x-auto` (für Tabellen) ist gemäß CSS-Spec valide.
- `overflow-y-visible` + `overflow-x-auto` wäre NICHT valide (CSS-Spec erzwingt dann auto/auto).

**Collapsed-Heights:**
- RE-Positionen: `max-h-[400px]`
- Artikelliste: `max-h-[400px]`
- Lagerort-Details: `max-h-[360px]`
- XML-Vorschau: `max-h-[300px]`

---

## Nachtrag 2026-02-24 - Artikelliste Scroll-Verhalten + Header

### Zielbild
- Scroll-Interferenz in der Artikelliste aufloesen: collapsed = innerer Scroll, expanded = Seiten-Scroll.
- Sticky Header nur im collapsed Zustand aktiv.
- Header-Beschriftungen der 11 Spalten auf die neue Fachsprache angleichen.

### Umsetzung (technisch)
- `ItemsTable.tsx`: dynamische collapsed Hoehe per Viewport-Berechnung:
  - Formel: `max(260, window.innerHeight - containerTop - toggleHeight - 16)`
  - Fallback: `400`
- Collapsed (`expanded === false`):
  - `overflow-y-auto`
  - `maxHeight: <berechneter px-Wert>`
- Expanded (`expanded === true`):
  - `overflow-y-hidden`
  - `maxHeight: none`
- Sticky Header nur collapsed:
  - collapsed: `sticky top-0 z-10 bg-card`
  - expanded: `bg-card` (ohne sticky)

### Header-Mapping (final)
| Spalte | Neuer Header |
|---|---|
| 1 | `DETAILS` |
| 2 | `#` |
| 3 | *(leer)* |
| 4 | `ARTIKEL` |
| 5 | `BESTELLNUMMER` |
| 6 | `EAN` |
| 7 | `BEZEICHNUNG` |
| 8 | `MENGE` |
| 9 | `PREIS` |
| 10 | `SN / SERIAL` |
| 11 | `BESTELLUNG` |

### Verifikation
- Technisch: `npx tsc --noEmit` ohne Fehler.
- Manuelle Abnahmekriterien:
  - collapsed: innerer Scrollbalken nur im Tabellen-Body
  - collapsed: Header bleibt sichtbar beim inneren Scroll
  - expanded: kein innerer Scrollbalken, Scroll ueber Seiten-Scrollbar
  - Toggle hin/zurueck ohne Scroll-Sprung

---

## Nachtrag 2026-02-24 - ADD: Dynamische Breite Spalte `BEZEICHNUNG`

### Job / Location
- Job: Anpassung der Breite einer Tabelle zu einem dynamischen Wert.
- Location: Run-Detail-Site > Tab `Artikelliste` > Body > Tabelle `Bezeichnung`.

### Zielbild
- Nur die Spalte `BEZEICHNUNG` soll dynamisch auf die verbleibende Tabellenbreite reagieren.
- Alle anderen Spalten behalten feste Breiten.
- Bei kleinerer Bildschirmauflösung wird in `BEZEICHNUNG` entsprechend weniger Text sichtbar, bei größerer mehr.

### Umsetzung (technisch)
- Datei: `src/components/run-detail/ItemsTable.tsx`
- Spalte `BEZEICHNUNG`:
  - feste Begrenzung `max-w-[140px]` entfernt
  - harte Zeichenkappung per `substring(0, 35)` entfernt
  - ersetzt durch `truncate w-full` innerhalb einer `TableCell` mit `min-w-0`
- Ergebnis: Abschneiden erfolgt jetzt rein über die tatsächlich verfügbare Spaltenbreite.

### Verifikation
- Die Spalte `BEZEICHNUNG` wächst/schrumpft mit der verfügbaren Restbreite.
- Feste Breiten der übrigen Spalten bleiben unverändert.

---

## Nachtrag 2026-02-24 - ADD: Dynamische Breite Spalte `Bezeichnung` (RE-Positionen)

### Job / Location
- Job: Anpassung der Breite einer Tabelle zu einem dynamischen Wert.
- Location: Run-Detail-Site > Tab `RE-Positionen` > Body > Tabelle `Bezeichnung`.

### Zielbild
- Nur die Spalte `Bezeichnung` reagiert dynamisch auf die verfuegbare Restbreite.
- Alle anderen Spalten bleiben mit festen Breiten bestehen.
- `EAN` bleibt direkt neben `Herstellerartikelnr.`; bei kleinerer Aufloesung wird in `Bezeichnung` entsprechend weniger Inhalt sichtbar.

### Umsetzung (technisch)
- Datei: `src/components/run-detail/InvoicePreview.tsx`
- Tabelle auf `table-fixed w-full` gesetzt, damit feste Spaltenbreiten stabil bleiben.
- `Herstellerartikelnr.` explizit auf `w-[200px]` gesetzt (fix).
- `Bezeichnung`-Header ohne feste Breite gelassen (nimmt Restplatz).
- `Bezeichnung`-Zelle:
  - feste Begrenzung `max-w-[150px]` entfernt
  - harte Zeichenkappung `substring(0, 35)` entfernt
  - ersetzt durch `truncate w-full` innerhalb einer `TableCell` mit `min-w-0`

### Verifikation
- Nur `Bezeichnung` waechst/schrumpft dynamisch mit der Aufloesung.
- Alle anderen Spalten (inkl. `Herstellerartikelnr.` und `EAN`) bleiben fix.

---

## Nachtrag 2026-02-24 - ADD (Plan): RE-Positionen Scroll-Entkopplung (Double-Scrollbar)

### Job / Location
- Job: UI/UX-Fix fuer Scroll-Interferenz (innerer vs. aeusserer Scrollbalken).
- Location: Run-Detail-Site > Tab `RE-Positionen` > Body.

### Erkenntnisse (Ist-Stand)
- Datei: `src/components/run-detail/InvoicePreview.tsx`
- Der Tabellen-Container nutzt aktuell durchgehend `overflow-y-auto` und toggelt nur `max-h-[400px]` / `max-h-[5000px]`.
- Dadurch bleibt auch im ausgeklappten Zustand ein innerer Scroll-Context aktiv; Mausrad-Ereignisse konkurrieren mit dem Seiten-Scroll.
- Header ist aktuell immer sticky (`sticky top-0`), auch im expanded Zustand.

### Zielbild
- Collapsed:
  - definierte Hoehe
  - innerer Scroll aktiv (`overflow-y-auto`)
  - Header sticky
- Expanded:
  - keine Begrenzung (`maxHeight: none`)
  - innerer Scroll komplett aus (`overflow-y-hidden`)
  - Seite uebernimmt 100% Scroll
  - Header nicht sticky

### Geplanter Umbau (State -> CSS Toggle)
- Bestehenden State `expandedPositions` weiterverwenden.
- Optional analog `ItemsTable`: `collapsedHeightPx` + `tableContainerRef` + `toggleContainerRef`, damit collapsed-Hoehe bis zur sichtbaren Unterkante dynamisch passt.
- Tabellen-Container umstellen auf:
  - collapsed: `overflow-y-auto` + `maxHeight: <px>`
  - expanded: `overflow-y-hidden` + `maxHeight: none`
- Header-Klasse umstellen auf:
  - collapsed: `sticky top-0 z-10 bg-card`
  - expanded: `bg-card`

### Geplantes Code-Muster
```tsx
const [expandedPositions, setExpandedPositions] = useState(false);
const [collapsedHeightPx, setCollapsedHeightPx] = useState(400);

<div
  ref={tableContainerRef}
  className={`overflow-x-hidden transition-all duration-500 ease-in-out ${
    expandedPositions ? 'overflow-y-hidden' : 'overflow-y-auto'
  }`}
  style={expandedPositions ? { maxHeight: 'none' } : { maxHeight: `${collapsedHeightPx}px` }}
>
  <Table className="table-fixed w-full">
    <TableHeader className={expandedPositions ? 'bg-card' : 'sticky top-0 z-10 bg-card'}>
      ...
    </TableHeader>
  </Table>
</div>
```

### Akzeptanzkriterien (Abnahme)
- Collapsed:
  - innerer Scrollbalken nur im Tabellenbereich
  - Seiten-Scroll bleibt ruhig
  - Header bleibt beim Tabellen-Scroll sichtbar
- Expanded:
  - kein innerer Scrollbalken mehr im Tabellencontainer
  - Mausrad scrollt ausschliesslich die Seite
  - Header scrollt normal mit (nicht sticky)
- Toggle zwischen beiden Zustaenden ohne Scroll-Spruenge.

### Umsetzung (ausgefuehrt 2026-02-24)
- Datei: `src/components/run-detail/InvoicePreview.tsx`
- Container-Logik auf state-gekoppeltes Scrollverhalten umgestellt:
  - collapsed: `overflow-y-auto` + dynamische `maxHeight` (Viewport-basiert)
  - expanded: `overflow-y-hidden` + `maxHeight: none`
- Header-Sticky an den State gekoppelt:
  - collapsed: `sticky top-0 z-10 bg-card`
  - expanded: `bg-card`
- Refs + Hoehenberechnung analog Artikelliste eingebaut:
  - `tableContainerRef`, `toggleContainerRef`, `collapsedHeightPx`
  - Formel: `max(260, window.innerHeight - containerTop - toggleHeight - 16)`

---

## Nachtrag 2026-02-24 - ADD: Sticky Header an Body koppeln (Phase 1: RE-Positionen)

### Job / Scope
- Location 1: Run-Detail > RE-Positionen > Body > Ueberschriftenzeile.
- Ziel: Header bleibt beim Scrollen im Body sichtbar, ohne Logik-/Store-/Workflow-Eingriffe.
- Rollout-Vorgabe: zuerst nur RE-Positionen; danach Sichtpruefung, erst dann Artikelliste + Lagerort-Details.

### Ursache (technisch)
- In `InvoicePreview.tsx` wurde die Tabelle ueber das UI-Primitive `Table` gerendert.
- `Table` kapselt intern ein zusaetzliches Wrapper-`div` mit `overflow-auto` (`src/components/ui/table.tsx`).
- Gleichzeitig liegt der eigentliche Body-Scroll auf dem aeusseren Container (`overflow-y-auto` im collapsed State).
- Ergebnis: Sticky-Header war nicht sauber an den aktiven Scroll-Container gekoppelt.

### Umsetzung (Phase 1 ausgefuehrt: nur RE-Positionen)
- Datei: `src/components/run-detail/InvoicePreview.tsx`
- Render-Pfad von `Table` auf nativen `<table>` umgestellt:
  - statt `<Table className="table-fixed w-full">` jetzt
    `div.relative.w-full.overflow-x-auto > table.w-full.table-fixed.caption-bottom.text-sm`
- `TableHeader` Sticky-Logik bleibt unveraendert:
  - collapsed: `sticky top-0 z-10 bg-card`
  - expanded: `bg-card`
- Keine Aenderung an:
  - Expand/Collapse State
  - Overflow-Y Toggle
  - Refs/Scroll-Hoehenberechnung
  - Datenfluss und Interaktionen

### Verifikation (technisch)
- `npx tsc --noEmit` ohne Fehler.

### Iteration 2 nach UI-Feedback (ausgefuehrt 2026-02-24)
- Problem nach erster Umsetzung:
  - Header blieb im collapsed State weiterhin nicht sauber fixiert.
  - Beige Header-Ton war visuell verloren gegangen.
- Ursache:
  - zusaetzlicher Zwischen-Wrapper mit `overflow-x-auto` zwischen Scroll-Container und Header erzeugte einen konkurrierenden Overflow-Kontext.
- Anpassung:
  - Zwischen-Wrapper entfernt; X- und Y-Overflow liegen nun auf demselben Container.
  - Header-Hintergrund wieder auf `bg-muted/50` (beiger Ton) gesetzt.
  - Sticky nur collapsed direkt auf den `th`-Zellen (`sticky top-0 z-20 bg-muted/50`).
- Logikpruefung:
  - Keine "erste Zeile ueberspringen"-Logik im UI gefunden.
  - Positionsanzeige nutzt direkt `position.positionIndex` aus den Parserdaten.

### Iteration 3 nach UI-Feedback (ausgefuehrt 2026-02-24)
- Zusatzanforderung:
  - Header beim Scrollen voll deckend (keine Halbtransparenz), damit Inhalte darunter nicht durchscheinen.
- RE-Positionen:
  - Header-Flaeche auf voll deckenden Beige-Ton `bg-[hsl(var(--surface-sunken))]` umgestellt.
  - Sticky bleibt nur collapsed aktiv (`sticky top-0 z-20` auf `th`).
- Rollout gemaess Plan auf weitere Locations:
  1. Artikelliste (`ItemsTable.tsx`):
     - Render-Pfad auf natives `<table>` umgestellt (kein zusaetzlicher `Table`-Overflow-Wrapper).
     - Sticky auf `th`-Zellen, voll deckender Beige-Ton.
  2. Lagerort-Details (`WarehouseLocations.tsx`):
     - Sticky Header im collapsed State ergaenzt.
     - Header voll deckend im Beige-Ton.
     - X/Y-Overflow auf denselben Scroll-Container gelegt.
- Sicherheitsaspekt:
  - Keine Aenderung an Store-/Workflow-/Zuordnungslogik, nur Header-Render/Styling und Scroll-Container-Kopplung.

### Nächster Schritt (nach Abnahme)
- Bei positiver Rueckmeldung gleiche Sticky-Kopplung auf:
  1. Run-Detail > Artikelliste > Body > Ueberschriftenzeile
  2. Run-Detail > Lagerort > Body "Lagerort-Details" > Ueberschriftenzeile

---

## Nachtrag 2026-02-25 - ADD: Artikelliste Header-Separator + Top-Right Toggle

### Job / Location
- Job 1: Separator-Bereich in der Body-Ueberschrift erzeugen.
- Job 2: Expand/Collapse-Button aus dem Footer als zweite Trigger-Position in die Ueberschrift kopieren.
- Location: `Run-Detail > Artikelliste > Body > Ueberschrift Body` in `src/components/run-detail/ItemsTable.tsx`.

### Zielbild
- Die Texte `Artikel Liste` und `/article list (counter)` bleiben inhaltlich unveraendert.
- Rechts daneben existiert ein unsichtbarer Separator-Slot mit derselben Breite wie die Spalte `BESTELLUNG`.
- In diesem Slot sitzt ein kompakter Icon-Button (ohne Text), der denselben Expand/Collapse-State wie der Footer-Button toggelt.
- Footer-Button bleibt weiterhin aktiv; beide Trigger arbeiten synchron auf demselben State.

### Umsetzung (technisch)
- Gemeinsame Breitenquelle fuer `BESTELLUNG`-Spalte und Header-Slot ueber eine Klassen-Konstante (`w-24`).
- Rechter Header-Cluster in zwei Bereiche getrennt:
  1. Textblock (rechtsbuendig)
  2. Separator-Slot (`border-l border-transparent`, visuell unsichtbar)
- Neuer Top-Button im Separator-Slot:
  - `Button` mit `variant="ghost"` und `size="icon"` (kompakt, icon-only)
  - collapsed: `ChevronsDown` + Pulse
  - expanded: `ChevronsUp`
  - gleicher Toggle-State wie Footer (`expanded` via `setExpanded`).
- Sichtbarkeit analog Footer nur bei vorhandenen Zeilen (`filteredLines.length > 0`).

### Nicht veraendert
- Keine Aenderung an Store-/Parser-/Workflow-Logik.
- Keine Aenderung an APIs, Types, Datenfluss oder Footer-Toggle-Verhalten.
- Keine Textaenderung an `Artikel Liste` und `/article list (counter)`.

### Verifikation / Abnahme
- Header-Texte unveraendert, aber vor dem neuen Separator-Slot positioniert.
- Top-Button ist im rechten Slot horizontal und vertikal zentriert.
- Expand/Collapse funktioniert identisch ueber Top- und Footer-Button.
- Collapsed: Pulse sichtbar; Expanded: statischer Up-Icon-Zustand.

---

## Nachtrag 2026-02-25 - ADD-ON: Artikelliste Body Edge-to-Edge + Header-Alignment

### Job / Location
- Job: Tabellen-Body in der Artikelliste auf echte Edge-to-Edge-Optik umstellen, bei unveraendertem Header-Padding.
- Location: `Run-Detail > Artikelliste > Body` in `src/components/run-detail/ItemsTable.tsx`.

### Zielbild
- Header bleibt seitlich eingerueckt (normales Card-Header-Padding).
- Tabellenbereich (Headerzeile + Body-Zeilen) laeuft links/rechts bis an den aeusseren Card-Rand.
- Keine "klebenden" Inhalte am Rand: erste und letzte Spalte bleiben visuell an der Header-Fluchtlinie ausgerichtet.

### Umsetzung (technisch)
- Container-Migration in `ItemsTable.tsx`:
  - root von `enterprise-card` auf shadcn `Card` umgestellt.
  - Toolbar in `CardHeader`.
  - Tabellenbereich in `CardContent` (`pt-0 pb-0`).
- Edge-to-Edge-Bleed nur fuer den Tabellenbereich:
  - Tabellenblock in `div.-mx-6` eingebettet.
  - Header bleibt unberuehrt ausserhalb dieses Bleed-Wrappers.
- Sicherheits-Add-on fuer Randabstaende:
  - Erste Spalte (`DETAILS`) erhaelt `pl-6` (thead + tbody Startkante).
  - Letzte Spalte (`BESTELLUNG`) erhaelt `pr-6` (thead + tbody Endkante).
- Scroll-/Sticky-Logik bleibt identisch:
  - collapsed: `overflow-y-auto overflow-x-auto`
  - expanded: `overflow-y-hidden overflow-x-auto`
  - sticky Header weiterhin state-gekoppelt auf den `th`-Zellen.

### Nicht veraendert
- Keine Aenderung an Store, Parser, Workflow, API oder Datenmodell.
- Keine Aenderung an Filter-/Suche-/Toggle-Logik.
- Keine Aenderung an Zeilen-Mapping, Highlighting, Detail-Popup oder Manual-Order-Interaktion.

### Verifikation / Abnahme
- `Run-Detail > Artikelliste > Body`:
  - Tabellenbereich ist links/rechts edge-to-edge.
  - Header bleibt seitlich eingerueckt.
  - Erste/letzte Spalte kleben nicht am Rand (saubere Fluchtlinie).
- Expand/Collapse, Sticky-Header und Scroll-Verhalten unveraendert funktionsfaehig.
- Typecheck: `npx tsc --noEmit` ohne Fehler.

---

## Nachtrag 2026-02-25 - ADD-BUGFIX: Edge-to-Edge Tabellen-Padding Minimierung

### Job / Scope
- Ziel: Nutzbare Tabellenbreite links/rechts maximieren, ohne Text direkt am Pixelrand kleben zu lassen.
- Gilt fuer beide Tabellen:
  - `src/components/run-detail/ItemsTable.tsx` (Artikelliste)
  - `src/components/run-detail/InvoicePreview.tsx` (RE-Positionen)

### Ursache
- In der Artikelliste wurde die Edge-to-Edge-Wirkung durch `pl-6`/`pr-6` auf erster/letzter Spalte optisch wieder neutralisiert.
- In den RE-Positionen war der `-mx-6` Bleed-Wrapper am Tabellenblock noch nicht gesetzt.

### Umsetzung (technisch)
- Gemeinsame Regel fuer erste/letzte Spalte:
  - links: `pl-6` -> `pl-2` (thead + tbody)
  - rechts: `pr-6` -> `pr-2` (thead + tbody)
- `ItemsTable.tsx`:
  - bestehender `-mx-6` Wrapper bleibt unveraendert erhalten.
  - nur Padding-Reduktion auf erster/letzter Spalte.
- `InvoicePreview.tsx`:
  - Tabellenblock in `div.-mx-6` eingebettet (Bleed analog Artikelliste).
  - erste/letzte Spalte auf `pl-2`/`pr-2` gesetzt.

### Nicht veraendert
- Keine Aenderung an Datenfluss, Store, Parser, APIs oder Workflow-Logik.
- Keine Aenderung an Spaltenbreiten.
- Keine Aenderung an Inhalt/Truncate/Zoom der Spalte `BESTELLUNG` (separater Follow-up).

### Verifikation / Abnahme
- Beide Tabellen nutzen den Body-Raum bis fast an den Rand.
- Linke/rechte Kante bleibt lesbar durch minimales `pl-2`/`pr-2`.
- Sticky-Header, Expand/Collapse und Scroll-Verhalten bleiben unveraendert.
- Typecheck: `npx tsc --noEmit` ohne Fehler.

---

## Nachtrag 2026-02-25 - ADD-ON: Bestellung-Spalte dynamischer Text-Zoom

### Job / Scope
- Ziel: In der Spalte `BESTELLUNG` den Text dynamisch verkleinern, wenn mehrere Bestellnummern angezeigt werden.
- Gilt nur fuer:
  - `Run-Detail > RE-Positionen > Body > Tabelle > Spalte BESTELLUNG`
  - `Run-Detail > Artikelliste > Body > Tabelle > Spalte BESTELLUNG`
- Nicht im Scope:
  - Tabellenkopf `BESTELLUNG` (`th`) bleibt unveraendert
  - Andere Tabellen/Spalten bleiben unveraendert

### Ausgangslage / Physikalisches Limit
- Spaltenbreite bleibt fix auf `w-24` (96px).
- Bei mehreren Bestellnummern (z. B. pipe-getrennt) reicht selbst kleine Schriftbreite nicht immer fuer eine Einzeile.
- Deshalb muessen Zoom-Stufen fuer 3+ Nummern harte Umbruchregeln enthalten.

### Zoom-Mapping (KISS)
- `1..2`: `text-xs`
- `3`: `text-[11px] tracking-tighter break-all leading-none`
- `4`: `text-[10px] tracking-tighter break-all leading-none`
- `>=5`: `text-[9px] tracking-tighter break-all leading-none`

### Umsetzung (technisch)
- Lokale Hilfslogik `getOrderZoomClass(value)` in `ItemsTable.tsx` und `InvoicePreview.tsx`:
  - zaehlt Nummern ueber `split('|')`, `trim()`, `filter(Boolean)`
  - liefert Zoom-Klasse gemaess Mapping
- Anwendung:
  - `InvoicePreview.tsx`: nur auf den `td`-Inhalt der Spalte `BESTELLUNG`
  - `ItemsTable.tsx`: nur auf den `td`-Inhalt der Spalte `BESTELLUNG`
  - `ItemsTable.tsx` expanded-Pfad: Zoom-Klasse wird als Prop in `ManualOrderPopup.tsx` gereicht
  - `ManualOrderPopup.tsx`: Trigger-Label nutzt `labelClassName` statt festem `text-xs`

### Nicht veraendert
- Keine Aenderung an Spaltenbreiten (`w-24` bleibt fix).
- Keine Aenderung an Header-Texten/Head-Zellen.
- Keine Aenderung an Datenfluss, Store, Parser oder Workflow.

### Verifikation / Abnahme
- Bei 1-2 Nummern bleibt Standardlesbarkeit (`text-xs`) erhalten.
- Bei 3-5+ Nummern verkleinert sich Text progressiv; mehrzeilige Faelle umbrechen kontrolliert (`break-all`) bei kompakter Zeilenhoehe (`leading-none`).
- Tabellenlayout bleibt stabil (keine unkontrollierten Hoehenspruenge der Zeilen).
- Typecheck: `npx tsc --noEmit` ohne Fehler.
