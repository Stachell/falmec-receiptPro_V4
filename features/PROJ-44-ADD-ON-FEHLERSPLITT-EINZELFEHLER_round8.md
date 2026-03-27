# PROJ-44-ADD-ON-FEHLERSPLITT-EINZELFEHLER — Round 8

## Context

**Problem:** Alle Issue-Generatoren (Step 2/3/4/5) buendeln aktuell ALLE betroffenen Zeilen in EIN einziges Issue-Objekt ("Sammel-Fehler"). Das hat zu Over-Engineering im UI gefuehrt (Checkbox-Splitting, Bulk-Resolver via `splitIssue`) und gefaehrdet die Datenintegritaet.

**Loesung:** Striktes 1:1-Paradigma: **1 Issue = 1 originale Rechnungsposition (positionIndex)**. Die Arrays `affectedLineIds` und `relatedLineIds` enthalten ab sofort immer exakt 1 Element: `[line.lineId]`. Die `positionIndex` wird als Routing-Anker im `context`-Feld gesetzt.

**Scope Round 1:** NUR Backend (Issue-Generatoren). Kein Frontend/UI-Code. IndexedDB wird manuell gewiped (keine Migration). Frontend-Bereinigung (splitIssue-Entfernung, Checkbox-Listen, Multi-Line-Rendering) ist fuer eine spaetere Round vorgesehen.

---

## Betroffene Dateien

| Datei | Aenderungen |
|-------|-------------|
| `src/services/matchers/modules/FalmecMatcher_Master.ts` | 4 Bulk-Generatoren → for-Schleifen (mit positionIndex-Dedup bei sn-insufficient-count) |
| `src/store/runStore.ts` | 4 Bulk-Generatoren + 1 Legacy-Hilfsfunktion → for-Schleifen/.map() + 1 Bug-Fix (`updateLineSerialData`) |
| `src/services/matching/matchingEngine.ts` | 3 Bulk-Generatoren → for-Schleifen mit positionIndex-Dedup (AKTIVER Step-4-Pfad) |
| `src/services/matching/orderMapper.ts` | 4 Bulk-Generatoren → for-Schleifen (LEGACY, importiert aber ungenutzt) |

**Keine Aenderungen an:**
- `src/types/index.ts` (Issue-Interface bleibt — Arrays bleiben Arrays, nur mit 1 Element)
- Alle Frontend-Dateien (IssueDialog.tsx, IssuesCenter.tsx etc.)
- Auto-Resolve-Logik (`checkIssueStillActive`, `resolveIssueLines`, `autoResolveIssues`)
- `splitIssue` (bleibt bestehen, wird nur nicht mehr benoetigt)

---

## WICHTIG: Wann ist positionIndex-Deduplizierung noetig?

Die Frage "brauche ich `seenPositions`-Dedup?" haengt davon ab, ob die Zeilen zum Zeitpunkt der Issue-Erzeugung AGGREGIERT (1 Zeile pro Position, qty bewahrt) oder EXPANDIERT (qty > 1 → N Einzelzeilen) sind:

| Schritt | Zeilen-Zustand | Dedup noetig? |
|---------|----------------|---------------|
| Step 2 crossMatch (FalmecMatcher) | AGGREGIERT — `representativeLines` (1 pro Position) | NEIN |
| Step 2 Store (price-mismatch, inactive) | AGGREGIERT — `enrichedLines` (1 pro Position, defensiver Dedup bleibt) | DEFENSIV JA |
| Step 3 preFiltered (serial-mismatch) | AGGREGIERT — vor Step-4-Expansion | DEFENSIV JA (Edge-Case: Re-Run nach Step 4) |
| Step 3 Legacy (sn-insufficient-count) | AGGREGIERT — vor Step-4-Expansion | DEFENSIV JA (Edge-Case: Re-Run nach Step 4) |
| Step 4 matchingEngine | **EXPANDIERT** — nach Expansion | **ZWINGEND JA** |
| Step 4 orderMapper (legacy) | AGGREGIERT — pre-Expansion | NEIN |
| Step 5 missing-storage-location | **EXPANDIERT** — nach Step-4-Expansion | **ZWINGEND JA** |

**Regel:** Im Zweifel IMMER `seenPositions`-Dedup einbauen. Es schadet nie und schuetzt vor Edge-Cases.

---

## Issue-ID Schema (NEU)

**Alt:** `issue-${runId}-step${N}-${type}-${Date.now()}` — nicht deterministisch, Kollisionsgefahr in Schleifen
**Neu:** `issue-${runId}-step${N}-${type-fragment}-pos${positionIndex}` — deterministisch, eindeutig pro Run

Beispiele:
- `issue-run123-step2-artno-pos3`
- `issue-run123-step2-price-mismatch-pos5`
- `issue-run123-step3-sn-mismatch-pos7`
- `issue-run123-step4-not-ordered-pos2`
- `issue-run123-step5-missing-loc-pos1`

---

## Phase 1A: FalmecMatcher_Master.ts (Step 2 + Step 3 Matcher-Issues)

**Datei:** `src/services/matchers/modules/FalmecMatcher_Master.ts`

### 1A-1: `match-artno-not-found` (Zeilen 265-282)

**IST:** Ein `if`-Block mit `.push({...})`, `affectedLineIds: noMatchNoConflict.map(r => r.line.lineId)` (BULK)

**Zeilen-Zustand:** AGGREGIERT (crossMatch empfaengt `representativeLines`) → Kein Dedup noetig.

**SOLL:** `for`-Schleife ueber `noMatchNoConflict`:
```typescript
for (const r of noMatchNoConflict) {
  issues.push({
    id: `issue-${runId}-step2-artno-pos${r.line.positionIndex}`,
    runId,
    severity: 'error',
    stepNo: 2,
    type: 'match-artno-not-found',
    message: `Pos ${r.line.positionIndex}: Artikelnummer/EAN nicht im Stamm gefunden`,
    details: `${r.line.manufacturerArticleNo || r.line.ean || r.line.lineId}: ${r.reason}`,
    relatedLineIds: [r.line.lineId],
    affectedLineIds: [r.line.lineId],
    status: 'open',
    createdAt: now,
    resolvedAt: null,
    resolutionNote: null,
    context: { positionIndex: r.line.positionIndex, field: 'matchStatus', expectedValue: 'full-match' },
  });
}
```

### 1A-2: `match-conflict-id` (Zeilen 284-301)

**Zeilen-Zustand:** AGGREGIERT → Kein Dedup noetig.

Gleiches Muster wie 1A-1, iteriert ueber `conflictResults`:
- ID: `issue-${runId}-step2-conflict-pos${r.line.positionIndex}`
- Message: `Pos ${r.line.positionIndex}: ArtNo/EAN-Konflikt (verschiedene Artikel)`
- Details: `${r.line.manufacturerArticleNo || r.line.ean}: ${r.reason}`
- Context: `{ positionIndex: r.line.positionIndex, field: 'matchStatus', expectedValue: 'full-match' }`

### 1A-3: `supplier-missing` (Zeilen 220-244)

**Zeilen-Zustand:** AGGREGIERT (updatedLines kommen aus crossMatch-Resultat) → Kein Dedup noetig.

Iteriert ueber `supplierIssueLines`:
- ID: `issue-${runId}-step2-supplier-pos${l.positionIndex}`
- Message: `Pos ${l.positionIndex}: Lieferant fehlt/ungueltig`
- Details: `${l.falmecArticleNo || l.manufacturerArticleNo}: "${l.supplierId ?? 'leer'}"`
- Context: `{ positionIndex: l.positionIndex, field: 'supplierId' }`

### 1A-4: `sn-insufficient-count` (Zeilen 592-609)

**Zeilen-Zustand:** Normalerweise AGGREGIERT (Legacy-Step-3-Pfad vor Expansion). ABER: Edge-Case bei Re-Run von Step 3 nach Step-4-Expansion → **Defensiver Dedup zwingend.**

Vorher die Lines selbst behalten (nicht nur IDs mappen), dann mit `seenPositions` deduplizieren:
```typescript
if (mismatchCount > 0) {
  const unassignedLines = updatedLines.filter(l => l.serialRequired && !l.serialNumber);
  // Dedup: 1 Issue pro positionIndex (defensiv gegen expandierte Zeilen bei Re-Run)
  const seenPositions = new Set<number>();
  for (const l of unassignedLines) {
    if (seenPositions.has(l.positionIndex)) continue;
    seenPositions.add(l.positionIndex);
    issues.push({
      id: `issue-step3-insufficient-pos${l.positionIndex}`,
      severity: 'warning',
      stepNo: 3,
      type: 'sn-insufficient-count',
      message: `Pos ${l.positionIndex}: Seriennummer fehlt`,
      details: `${l.falmecArticleNo || l.manufacturerArticleNo || l.lineId}: S/N nicht zugewiesen`,
      relatedLineIds: [l.lineId],
      affectedLineIds: [l.lineId],
      status: 'open',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      resolutionNote: null,
      context: { positionIndex: l.positionIndex, field: 'serialNumbers' },
    });
  }
}
```
**Hinweis:** Kein `runId` im Issue (Legacy-Pfad, wird ggf. vom Aufrufer ergaenzt).

---

## Phase 1B: runStore.ts — price-mismatch + inactive-article (Step 2)

**Datei:** `src/store/runStore.ts`

### 1B-1: `price-mismatch` (Zeilen 3553-3582)

**Zeilen-Zustand:** AGGREGIERT (vor Step-4-Expansion). Bestehender defensiver Dedup bleibt.

Die bestehende Deduplizierung nach `positionIndex` bleibt erhalten. Statt EINEM Issue fuer alle `uniquePriceMismatch` wird pro Position ein Issue erzeugt:

```typescript
const priceMismatchLines = enrichedLines.filter(l => l.priceCheckStatus === 'mismatch');
if (priceMismatchLines.length > 0) {
  const seenPositions = new Set<number>();
  const uniquePriceMismatch = priceMismatchLines.filter(l => {
    if (seenPositions.has(l.positionIndex)) return false;
    seenPositions.add(l.positionIndex);
    return true;
  });
  for (const l of uniquePriceMismatch) {
    step2Issues.push({
      id: `issue-${runId}-step2-price-mismatch-pos${l.positionIndex}`,
      runId,
      severity: 'warning',
      stepNo: 2,
      type: 'price-mismatch',
      message: `Pos ${l.positionIndex}: Preisabweichung RE ${l.unitPriceInvoice.toFixed(2)}€ vs. Sage ${(l.unitPriceSage ?? 0).toFixed(2)}€`,
      details: `${l.falmecArticleNo ?? l.manufacturerArticleNo} — RE ${l.unitPriceInvoice.toFixed(2)}€, Sage ${(l.unitPriceSage ?? 0).toFixed(2)}€`,
      relatedLineIds: [l.lineId],
      affectedLineIds: [l.lineId],
      status: 'open',
      createdAt: now21,
      resolvedAt: null,
      resolutionNote: null,
      context: { positionIndex: l.positionIndex, field: 'priceCheckStatus', expectedValue: 'ok', actualValue: 'mismatch' },
    });
  }
}
```

### 1B-2: `inactive-article` (Zeilen 3584-3612)

**Zeilen-Zustand:** AGGREGIERT. Bestehender defensiver Dedup bleibt.

Gleiches Muster — Deduplizierung bleibt, for-Schleife ueber `uniqueInactive`:
- ID: `issue-${runId}-step2-inactive-pos${l.positionIndex}`
- Message: `Pos ${l.positionIndex}: Inaktiver Artikel im Stamm`
- Details: `${l.falmecArticleNo ?? l.manufacturerArticleNo}`
- Context: `{ positionIndex: l.positionIndex, field: 'activeFlag', expectedValue: 'true', actualValue: 'false' }`

### 1B-3: `buildArticleMatchIssues` Legacy-Hilfsfunktion (Zeilen 353-371)

Return-Wert aendert sich von `[{...}]` (1 Bulk) zu `noMatchLines.map(l => ({...}))` (N Einzel):
```typescript
function buildArticleMatchIssues(runId: string, lines: InvoiceLine[]): Issue[] {
  const noMatchLines = lines.filter(l => l.matchStatus === 'no-match');
  if (noMatchLines.length === 0) return [];
  return noMatchLines.map(l => ({
    id: `issue-${runId}-step2-no-match-pos${l.positionIndex}`,
    runId,
    severity: 'error' as const,
    stepNo: 2,
    type: 'no-article-match' as const,
    message: `Pos ${l.positionIndex}: Artikel ohne Match in Stammdaten`,
    details: `${l.manufacturerArticleNo || l.ean || l.lineId}`,
    relatedLineIds: [l.lineId],
    affectedLineIds: [l.lineId],
    status: 'open' as const,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolutionNote: null,
    context: { positionIndex: l.positionIndex, field: 'matchStatus', expectedValue: 'full-match' },
  }));
}
```

---

## Phase 1C: runStore.ts — serial-mismatch (Step 3)

**Datei:** `src/store/runStore.ts` (Zeilen 3754-3775)

### 1C-1: `serial-mismatch`

**Zeilen-Zustand:** Normalerweise AGGREGIERT (preFiltered-Pfad vor Step-4-Expansion). ABER: Edge-Case bei Re-Run von Step 3 nach Step-4-Expansion → **Defensiver Dedup zwingend.**

```typescript
if (!checksumMatch) {
  const underServedLines = updatedRunLines.filter(l => l.serialRequired && l.serialNumbers.length < l.qty);
  // Dedup: 1 Issue pro positionIndex (defensiv gegen expandierte Zeilen bei Re-Run)
  const seenPositions = new Set<number>();
  for (const l of underServedLines) {
    if (seenPositions.has(l.positionIndex)) continue;
    seenPositions.add(l.positionIndex);
    step3Issues.push({
      id: `issue-${runId}-step3-sn-mismatch-pos${l.positionIndex}`,
      runId,
      severity: shouldHardFail ? 'error' : 'warning',
      stepNo: 3,
      type: 'serial-mismatch',
      message: `Pos ${l.positionIndex}: S/N fehlt (${l.serialNumbers.length}/${l.qty})`,
      details: `${l.falmecArticleNo ?? l.manufacturerArticleNo ?? l.lineId}: ${l.serialNumbers.length}/${l.qty} S/N zugewiesen`,
      relatedLineIds: [l.lineId],
      affectedLineIds: [l.lineId],
      status: 'open',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      resolutionNote: null,
      context: { positionIndex: l.positionIndex, field: 'serialNumbers', expectedValue: 'qty', actualValue: `${l.serialNumbers.length}/${l.qty}` },
    });
  }
  // Log-Block (Z.3777-3782) bleibt unveraendert (loggt Gesamtzahlen)
}
```

---

## Phase 1D: Step 4 + Step 5 Bulk-Issues

### 1D-1: matchingEngine.ts — `buildEngineIssues` (AKTIVER Pfad, Zeilen 62-149)

**Datei:** `src/services/matching/matchingEngine.ts`

**Zeilen-Zustand: EXPANDIERT** (post-Expansion, qty > 1 → N Einzelzeilen). **positionIndex-Dedup ZWINGEND.**

**`order-no-match`** (Z.69-90):
```typescript
const notOrderedLines = expandedLines.filter(l => l.orderAssignmentReason === 'not-ordered');
const seenPositions = new Set<number>();
for (const l of notOrderedLines) {
  if (seenPositions.has(l.positionIndex)) continue;
  seenPositions.add(l.positionIndex);
  issues.push({
    id: `issue-${runId}-step4-not-ordered-pos${l.positionIndex}`,
    runId,
    severity: 'warning',
    stepNo: 4,
    type: 'order-no-match',
    message: `Pos ${l.positionIndex}: Keine Bestellzuordnung`,
    details: `${l.falmecArticleNo ?? l.manufacturerArticleNo ?? l.lineId}`,
    relatedLineIds: [l.lineId],
    affectedLineIds: [l.lineId],
    status: 'open',
    createdAt: now,
    resolvedAt: null,
    resolutionNote: null,
    context: { positionIndex: l.positionIndex, field: 'orderAssignmentReason', expectedValue: 'assigned', actualValue: 'not-ordered' },
  });
}
```

**`order-fifo-only`** (Z.92-114): Gleiches Muster mit eigenem `seenPositions`-Set:
- ID: `issue-${runId}-step4-fifo-only-pos${l.positionIndex}`
- Message: `Pos ${l.positionIndex}: Nur via FIFO zugeordnet`
- Context: `{ positionIndex: l.positionIndex, field: 'orderAssignmentReason', expectedValue: 'reference-match', actualValue: 'fifo-fallback' }`

**`order-multi-split`** (Z.116-147): Iteriere ueber `multiSplitPositions` (bereits nach positionIndex gruppiert, daher kein separates `seenPositions` noetig):
```typescript
for (const [pi, orders] of multiSplitPositions) {
  const representative = expandedLines.find(l => l.positionIndex === pi);
  if (!representative) continue;
  issues.push({
    id: `issue-${runId}-step4-multi-split-pos${pi}`,
    runId,
    severity: 'info',
    stepNo: 4,
    type: 'order-multi-split',
    message: `Pos ${pi}: Auf ${orders.size} Bestellungen aufgeteilt`,
    details: `${representative.falmecArticleNo ?? representative.manufacturerArticleNo ?? representative.lineId}: ${orders.size} Bestellungen`,
    relatedLineIds: [representative.lineId],
    affectedLineIds: [representative.lineId],
    status: 'open',
    createdAt: now,
    resolvedAt: null,
    resolutionNote: null,
    context: { positionIndex: pi, field: 'allocatedOrders' },
  });
}
```

### 1D-2: orderMapper.ts — `mapAllOrders` (LEGACY, importiert aber UNGENUTZT)

**Datei:** `src/services/matching/orderMapper.ts` (Zeilen 331-423)

`mapAllOrdersWaterfall` wird in `runStore.ts` importiert (Z.42), aber **nirgends aufgerufen**. Trotzdem refactoren wir der Konsistenz halber:

- `order-no-match` (Z.335-354): for-Schleife ueber `notOrderedLines`
- `order-incomplete` (Z.356-379): for-Schleife ueber `incompleteLines`
- `order-multi-split` (Z.381-400): for-Schleife ueber `multiSplitLines`
- `order-fifo-only` (Z.402-423): for-Schleife ueber `fifoOnlyLines`

**Achtung:** orderMapper arbeitet auf AGGREGIERTEN Zeilen (pre-Expansion), daher KEIN `seenPositions`-Dedup noetig.

### 1D-3: runStore.ts Step 5 — `missing-storage-location` (Z.2406-2431)

**Zeilen-Zustand: EXPANDIERT** (Step 5 laeuft nach Step-4-Expansion). **positionIndex-Dedup ZWINGEND.**

Ohne Dedup wuerden fuer eine Position mit qty=3 drei Issues mit identischer ID erzeugt!

```typescript
const missingLocLines = lines.filter(l => !l.storageLocation);
// ZWINGEND: Dedup nach positionIndex — lines sind expandiert nach Step 4
const seenPositions = new Set<number>();
for (const l of missingLocLines) {
  if (seenPositions.has(l.positionIndex)) continue;
  seenPositions.add(l.positionIndex);
  const existingOpen = updatedIssues.find(
    i => i.runId === runId && i.stepNo === 5 && i.type === 'missing-storage-location'
      && (i.status === 'open' || i.status === 'pending')
      && i.context?.positionIndex === l.positionIndex,
  );
  if (!existingOpen) {
    newIssues.push({
      id: `issue-${runId}-step5-missing-loc-pos${l.positionIndex}`,
      runId,
      severity: 'error',
      stepNo: 5,
      type: 'missing-storage-location',
      message: `Pos ${l.positionIndex}: Lagerort fehlt`,
      details: `${l.falmecArticleNo ?? l.manufacturerArticleNo ?? l.lineId}`,
      relatedLineIds: [l.lineId],
      affectedLineIds: [l.lineId],
      status: 'open',
      createdAt: now,
      resolvedAt: null,
      resolutionNote: null,
      context: { positionIndex: l.positionIndex, field: 'storageLocation' },
    });
  }
}
```

**Aenderung gegenueber alter Plan-Version:** Duplikat-Guard prueft jetzt `i.context?.positionIndex === l.positionIndex` statt `i.affectedLineIds.includes(l.lineId)`, weil nach Expansion die lineId eine expandierte ID ist, waehrend ein bestehendes Issue eine andere expandierte lineId der gleichen Position referenzieren koennte.

---

## Phase 1E: Bug-Fix `updateLineSerialData` (Pre-Existing)

**Datei:** `src/store/runStore.ts` (Z.2941-3009)

**Befund:** `updateLineSerialData()` aktualisiert Serial-Daten korrekt, ruft aber KEIN `refreshIssues()` auf. Das bedeutet: `serial-mismatch` Issues resolven NICHT automatisch nach manueller S/N-Korrektur. Alle anderen Manual-Fix-Actions (`setManualPrice`, `setManualPriceByPosition`, `setManualArticleByPosition`) rufen `refreshIssues()` korrekt auf.

**Fix:** Am Ende der Funktion (nach Z.3008, vor Z.3009) einfuegen:
```typescript
// PROJ-44-ADD-ON: Auto-resolve serial issues after manual S/N update
get().refreshIssues(targetRunId);
```

**Hinweis:** Dieser Fix ist ein pre-existing Bug, nicht direkt durch den Fehler-Splitt verursacht. Aber ohne ihn wuerden die neuen Einzel-Serial-Issues nach manueller Korrektur nicht auto-resolven, was den Workflow blockiert.

---

## Unberuehrte Issues (kein Refactoring)

| Issue-Typ | Datei | Grund |
|-----------|-------|-------|
| `parser-error`, `missing-ean`, `order-assignment` | runStore.ts (Step 1) | Bereits per-Warning/per-Position, kein Bulk |
| `no-article-match` (blockingIssue Z.3445-3458) | runStore.ts | Spezialfall "Keine Stammdaten" — `relatedLineIds: []`, kein Positionsbezug |
| `sn-invoice-ref-missing` | FalmecMatcher_Master.ts | Run-Level-Issue — `affectedLineIds: []`, kein Positionsbezug |
| `pool-empty-mismatch` | runStore.ts | Pool-Level-Issue — `relatedLineIds: []`, kein Positionsbezug |
| `export-no-lines` | runStore.ts (Step 5) | Run-Level-Issue — `relatedLineIds: []`, kein Positionsbezug |

---

## Auto-Resolve Kompatibilitaet

`checkIssueStillActive` (Z.246-289) funktioniert korrekt mit 1-Element-Arrays:
- `resolveIssueLines` findet die Zeile via Stufe 1 (direkte ID) oder Stufe 2 (positionIndex-Fallback)
- Alle `switch`-Cases nutzen `related.some(...)` — funktioniert mit 1 Element identisch wie mit N
- `supplier-missing` und `missing-storage-location` fallen durch zu `default: return true` (nicht auto-resolvable) — keine Aenderung noetig

**Workflow-Lebenszyklus (Erstellung → Anzeige → Resolve → Refresh):**
1. **Erstellung:** Generatoren erzeugen N Einzel-Issues statt 1 Bulk → keine Blockade
2. **Anzeige:** UI rendert `affectedLineIds[0]` korrekt (`.map()`, `.find()` auf 1-Element-Array ist safe) → keine Blockade
3. **Resolve:** `resolveIssue()` setzt `status: 'resolved'` auf EIN Issue → keine Blockade (kein Splitting noetig)
4. **Auto-Resolve via refreshIssues():** `checkIssueStillActive` prueft `related.some(...)` auf 1 Element → funktioniert exakt wie erwartet
5. **Refresh:** `generateStep5Issues` auto-resolved bestehende Issues per `.every(...)` auf `affectedLineIds` → mit 1 Element aequivalent zu direkter Pruefung

`splitIssue` (Z.2475-2525) wird obsolet (Issues sind bereits 1:1), bleibt aber bestehen als Safety-Net.

---

## Step-5 Auto-Resolve Kompatibilitaet (Detail)

Der Auto-Resolve-Block in `generateStep5Issues` (Z.2376-2379) prueft:
```typescript
const allResolved = (issue.affectedLineIds ?? []).every(id => {
  const line = lines.find(l => l.lineId === id);
  return line ? !!line.storageLocation : true;
});
```
Mit dem neuen 1:1-Modell: `affectedLineIds` hat 1 Element (die lineId des Repraesentanten der Position). `lines.find()` findet die expandierte Zeile. Wenn `storageLocation` gesetzt ist, resolved das Issue korrekt. Da `storageLocation` aus dem Masterdata-Match (Step 2) kommt und auf Positions-Ebene gesetzt wird, haben ALLE expandierten Zeilen einer Position den gleichen Wert → kein Risiko von Teil-Resolutions.

---

## issuesCount Auswirkung

`step2Issues.length` / `step3Issues.length` steigt von z.B. 1 auf N. Das beeinflusst:
- **WorkflowStepper Badge:** Zeigt neu z.B. "5 Probleme" statt "1 Problem" — **semantisch korrekt und gewuenscht**
- **Step-Status:** Wird VOR Issue-Zaehlung bestimmt (matchStats/checksum), keine Auswirkung

---

## Enrichment-Block Kompatibilitaet

Der Context-Enrichment-Block in runStore.ts (Z.3544-3551) prueft `if (!issue.context)`. Da wir jetzt `context` direkt in den Issues mitliefern, greift der Block nicht mehr. Das ist korrekt — der Block kann stehen bleiben.

---

## Verifikation

1. `npx tsc --noEmit` — 0 Errors
2. Manueller Test: Rechnung mit bekannten Preisabweichungen hochladen → pruefen ob N einzelne Issues statt 1 Bulk-Issue im IssuesCenter erscheinen
3. Auto-Resolve pruefen: Preis manuell korrigieren → Issue muss auto-resolven
4. Serial-Auto-Resolve pruefen: S/N manuell korrigieren → Issue muss jetzt auto-resolven (Phase 1E Bug-Fix)
5. Step-4-Issues pruefen: Bestellungen laden → einzelne order-no-match Issues pro Position
6. Step-5-Issues pruefen: Zeilen ohne Lagerort → einzelne missing-storage-location Issues pro Position (keine Duplikate bei qty > 1)
7. Edge-Case: Step 3 nach Step 4 erneut ausfuehren → pruefen ob keine doppelten serial-mismatch Issues entstehen

---

## Nuetzliche Hinweise fuer Sonnet

1. **Issue-Interface Arrays beibehalten** — ueberall `[singleId]` statt Skalar. `affectedLineIds: [l.lineId]`, NICHT `affectedLineIds: l.lineId`. Das TypeScript-Interface erwartet `string[]`.

2. **Kein Frontend/UI-Code anfassen** — IssueDialog.tsx, IssuesCenter.tsx, IssueCard, PriceCell, ArticleMatchCard, WorkflowStepper etc. bleiben komplett unveraendert. Wenn das UI temporaer "haesslich" wird (z.B. viele einzelne Issues statt ein kompakter Sammel-Fehler), ist das fuer Round 1 gewollt.

3. **`as const`-Assertions** bei Inline-Objekten in `.map()`-Returns beachten (z.B. in `buildArticleMatchIssues`). TypeScript braucht `severity: 'error' as const` und `status: 'open' as const` bei Return-Objekten in `.map()`.

4. **Reihenfolge:** Phase 1A → 1B → 1C → 1D → 1E. Nach JEDER Phase `npx tsc --noEmit` ausfuehren.

5. **`features/INDEX.md` aktualisieren** mit neuem Eintrag fuer PROJ-44-ADD-ON-FEHLERSPLITT.

6. **IndexedDB wird gewiped** — keine Migration noetig. Alte Runs mit Bulk-Issues werden bei Reload nicht kompatibel sein.

7. **`splitIssue` nicht loeschen** — bleibt als Safety-Net. Optional mit Kommentar markieren.

8. **Enrichment-Block (Z.3544-3551)** stehen lassen — er schadet nicht, wird nur nicht mehr getriggert.

9. **`no-article-match` blockingIssue (Z.3445-3458)** mit `relatedLineIds: []` bleibt unveraendert (Spezialfall "Keine Stammdaten").

10. **positionIndex-Dedup ist PFLICHT bei expandierten Zeilen** — betrifft matchingEngine.ts (Step 4), missing-storage-location (Step 5), und defensiv serial-mismatch/sn-insufficient-count (Step 3). Muster: `const seenPositions = new Set<number>()` → `if (seenPositions.has(l.positionIndex)) continue;` → `seenPositions.add(l.positionIndex);` VOR dem `issues.push()`.

11. **Dedup-Guard in Step 5** — der bestehende Guard `updatedIssues.find(i => ... && i.affectedLineIds.includes(l.lineId))` muss auf `i.context?.positionIndex === l.positionIndex` umgestellt werden, weil nach Expansion verschiedene expandierte lineIds die gleiche Position referenzieren koennen. Alternative: komplett durch `seenPositions`-Dedup ersetzen (bevorzugt, da einfacher).

12. **Phase 1E (Bug-Fix updateLineSerialData)** — NACH dem IndexedDB-Persist-Block (Z.3008) und VOR dem Funktionsende (Z.3009) `get().refreshIssues(targetRunId);` einfuegen. Ohne diesen Fix bleiben serial-mismatch Issues nach manueller S/N-Korrektur offen.

13. **Tabellenreferenz fuer Zeilen-Zustaende** — bevor du an einem Generator arbeitest, pruefe in der Tabelle oben ("Wann ist positionIndex-Deduplizierung noetig?"), ob Dedup noetig ist. Im Zweifel: IMMER Dedup einbauen.
