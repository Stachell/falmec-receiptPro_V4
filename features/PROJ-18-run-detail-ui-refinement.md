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
