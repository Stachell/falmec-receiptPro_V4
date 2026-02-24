# PROJ-21 — Zentrales Issue- & Log-Center

**Status:** Done
**Datum:** 2026-02-21
**Commit:** `a037f51` (zusammen mit PROJ-20)
**Baut auf:** PROJ-17, PROJ-20

---

## Ziel

Vollständiger Umbau des Issue- und Log-Systems: einheitliche Severity-Semantik, neue Issue-Typen, Jump-Links aus Issues in die Artikelliste und Auto-Resolve-Logik.

---

## Umgesetzte Änderungen

### Phase 1: Severity-Migration

- **Altes System:** `blocking` / `soft-fail`
- **Neues System:** `error` / `warning` / `info`

Migration-Mapping:
| Alt | Neu |
|-----|-----|
| `blocking` | `error` |
| `soft-fail` | `warning` |
| *(neu)* | `info` |

**3 neue IssueTypes** hinzugefügt:
- `order-incomplete` — Bestellung ohne ausreichende Identifier
- `order-multi-split` — Menge auf mehrere Bestellungen aufgeteilt
- `order-fifo-only` — Zuordnung nur via FIFO möglich (kein direkter Bezug)

**`Issue.context`** Feld neu: Strukturiertes Objekt mit Zusatzinformationen je IssueType (z.B. gefundene vs. erwartete Menge, Bestellnummern).

### Phase 2: Issue-Generatoren

Neue/überarbeitete Issue-Generatoren für spezifische Szenarien:

| Generator | Trigger | Severity |
|-----------|---------|----------|
| `price-mismatch` | Rechnungspreis ≠ Sage-Preis (außerhalb Toleranz) | `warning` |
| `inactive-article` | Artikel in Stammdaten als inaktiv markiert | `warning` |
| `serial-mismatch` | Erwartete Serials != gefundene Serials (enriched) | `error` |
| `order-incomplete` | Bestellung ohne EAN + artNoIT | `warning` |
| `order-multi-split` | Menge auf N Bestellungen aufgeteilt | `info` |
| `order-fifo-only` | FIFO-Fallback verwendet | `info` |

### Phase 3: Jump-Links

- **`navigateToLine(lineId)`:** Store-Action navigiert zur RunDetail-Seite und setzt `highlightedLineIds`.
- **`highlightedLineIds`:** Set von LineIds die in der Artikelliste hervorgehoben werden (gelber Border/Hintergrund).
- **`scrollToLineId`:** Scroll-Signal — die entsprechende Zeile scrollt automatisch in den sichtbaren Bereich.
- **Auto-Clear:** Highlighting und Scroll-Signal werden nach 5 Sekunden automatisch zurückgesetzt.

**Integration in Issue-Center:**
- Jedes Issue mit `relatedLineIds` zeigt einen "→ Zur Zeile" Link/Button.
- Klick triggert `navigateToLine()` für die erste `relatedLineId`.

### Phase 4: Auto-Resolve

- **`checkIssueStillActive(issue, currentState)`:** Validierungsfunktion je IssueType.
  - Prüft ob die Ursache des Issues noch besteht.
  - Wenn nicht → Issue automatisch als `resolved` markieren.
- **Trigger:** Auto-Resolve läuft nach jeder relevanten State-Änderung (z.B. nach manuellem Preis-Override, nach Bestellzuordnung).
- **`run-report.json`:** Enthält alle Issues (inkl. resolved) als Teil des Archiv-Exports.

### Hotfixes (im gleichen Commit, 4 kritische Patches)

| Hotfix | Problem | Lösung |
|--------|---------|--------|
| **HOTFIX-1** | Global State Leak — Komponenten zeigten Daten von anderem Run | `runId`-Filter in `ItemsTable`, `ExportPanel`, `InvoicePreview`, `WarehouseLocations` |
| **HOTFIX-2** | Broken Retry-Flow — `advanceToNextStep` fehlerhaft bei Retry | Neue `retryStep(runId, stepNo)` Action ersetzt fehlerhafte Aufrufe |
| **HOTFIX-3** | Status-Kaskadierung fehlend | `updateStepStatus` kaskadiert `failed` → `run.status = soft-fail` |
| **HOTFIX-4** | Log-Tab Buffer leer nach Page-Reload | `localStorage`-Fallback bei leerem RAM-Buffer implementiert |

---

## Technische Details

**Modifizierte Dateien:**

| Datei | Änderung |
|-------|----------|
| `src/types/index.ts` | Severity-Enum, neue IssueTypes, `Issue.context` Feld |
| `src/store/runStore.ts` | `navigateToLine`, `highlightedLineIds`, `scrollToLineId`, Auto-Resolve, Hotfix-1-4 |
| `src/components/run-detail/IssuesCenter.tsx` | Jump-Link Buttons, `info` Severity Styling |
| `src/components/run-detail/ItemsTable.tsx` | `runId`-Filter (HOTFIX-1), Highlighting-Logik |
| `src/components/run-detail/InvoicePreview.tsx` | `runId`-Filter (HOTFIX-1) |
| `src/components/run-detail/ExportPanel.tsx` | `runId`-Filter (HOTFIX-1) |
| `src/components/run-detail/WarehouseLocations.tsx` | `runId`-Filter (HOTFIX-1) |

**Jump-Link Pattern:**
```typescript
// Store
navigateToLine: (lineId: string) => {
  set({ highlightedLineIds: new Set([lineId]), scrollToLineId: lineId });
  setTimeout(() => set({ highlightedLineIds: new Set(), scrollToLineId: null }), 5000);
}

// ItemsTable — Zeile highlighten
<TableRow className={highlightedLineIds.has(line.lineId) ? 'ring-2 ring-yellow-400 bg-yellow-50' : ''} />
```

**Auto-Resolve Pattern:**
```typescript
function checkIssueStillActive(issue: Issue, state: RunState): boolean {
  switch (issue.type) {
    case 'price-mismatch':
      const line = state.invoiceLines.find(l => l.lineId === issue.relatedLineIds[0]);
      return line ? Math.abs(line.unitPriceInvoice - line.unitPriceSage) > state.priceTolerance : false;
    // ... weitere IssueTypes
  }
}
```
