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
