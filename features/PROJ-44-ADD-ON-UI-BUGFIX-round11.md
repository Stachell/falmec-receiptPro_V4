# PROJ-44 ADD-ON UI BUGFIX Round 11 — Implementierungsplan

Stand: 2026-03-23 (v2 — nach Kreuzverhör)
Basis: `PROJ-44-ADD-ON-UI-BUGFIX-round11_diagnostic.md`

---

## Übersicht

5 Phasen, strikt sequentiell. Jede Phase ist in sich abgeschlossen testbar.

| Phase | Thema | Dateien |
|-------|-------|---------|
| 1 | Workflow-Guard Sanierung (SSOT) | `runStore.ts`, `types/index.ts` |
| 2 | 2-Step KISS-Flow (Persist vs. Resolve) | `runStore.ts`, `IssueDialog.tsx`, `IssuesCenter.tsx` |
| 3 | Top-Down vs. Bottom-Up (Array-Ausroll-Mechanik) | `runStore.ts` |
| 4 | UI-Routing & Popover-Crash Fix | `IssueDialog.tsx`, `PriceCell.tsx`, `ItemsTable.tsx`, `InvoicePreview.tsx` |
| 5 | PDF-Datenverlust (Reprocess-Fix) | `runStore.ts` |

---

## Phase 1: Workflow-Guard Sanierung (SSOT)

**Ziel:** Der Guard in `advanceToNextStep` entscheidet NICHT mehr über `severity`, sondern über eine zentrale, typbasierte Blocker-Matrix.

### Schritt 1.1 — Helper-Funktion `isIssueBlockingStep` erstellen

**Datei:** `src/store/runStore.ts`
**Ort:** Direkt ÜBER der `autoResolveIssues`-Funktion (vor Zeile ~290), als freistehende pure Funktion.

```typescript
/**
 * PROJ-44-R11: Zentrale Blocker-Matrix — SSOT für Workflow-Guards.
 * Entscheidet typbasiert (NICHT severity-basiert), ob ein Issue den Step blockiert.
 */
function isIssueBlockingStep(issue: Issue, stepNo: number, config: RunConfig): boolean {
  // Nur offene/pending Issues können blockieren
  if (issue.status !== 'open' && issue.status !== 'pending') return false;
  // Issue muss zum aktuellen Step gehören
  if (issue.stepNo !== stepNo) return false;

  switch (stepNo) {
    case 1:
      // Parser-Fehler blockieren immer
      return issue.type === 'parser-error';

    case 2:
      // Artikel-Fehler blockieren IMMER
      if (
        issue.type === 'no-article-match' ||
        issue.type === 'match-artno-not-found' ||
        issue.type === 'match-ean-not-found' ||
        issue.type === 'match-conflict-id'
      ) {
        return true;
      }
      // Preisabweichung blockiert NUR wenn Config-Toggle aktiv
      if (issue.type === 'price-mismatch') {
        return config.blockStep2OnPriceMismatch === true;
      }
      return false;

    case 4:
      // Order-Fehler blockieren NUR wenn Config-Toggle aktiv
      if (
        issue.type === 'order-no-match' ||
        issue.type === 'order-incomplete' ||
        issue.type === 'order-assignment'
      ) {
        return config.blockStep4OnMissingOrder === true;
      }
      return false;

    case 5:
      // Export-Fehler blockieren IMMER
      return issue.type === 'missing-storage-location' || issue.type === 'export-no-lines';

    default:
      return false;
  }
}
```

### Schritt 1.2 — Guard in `advanceToNextStep` ersetzen

**Datei:** `src/store/runStore.ts`
**Ort:** Zeile 1572–1605 (der gesamte Block von `// PROJ-28: Block-Step Guard` bis zum Ende des `openErrorIssues`-Checks).

**Ersetze** den gesamten Block (Zeile 1572–1605) durch:

```typescript
      // PROJ-44-R11: Typbasierter Blocker-Guard (SSOT) — ersetzt severity-basierte Prüfung
      const effectiveConfig = run.config ?? globalConfig;
      const blockingIssues = issues.filter(
        i => i.runId === runId && isIssueBlockingStep(i, runningStep.stepNo, effectiveConfig as RunConfig),
      );
      if (blockingIssues.length > 0) {
        logService.warn(
          `Block-Guard: Step ${runningStep.stepNo} blockiert (${blockingIssues.length} blockierende Issues: ${blockingIssues.map(i => i.type).join(', ')})`,
          { runId, step: 'System' },
        );
        return;
      }
```

**WICHTIG — Was zu entfernen ist:**
- Den gesamten spezifischen `blockStep2OnPriceMismatch`-Check (Zeile 1578–1588) → wird jetzt durch die Matrix in `isIssueBlockingStep` abgedeckt.
- Den gesamten generischen `severity === 'error'`-Check (Zeile 1591–1605) → ersetzt durch typbasierte Prüfung.

**Was NICHT angefasst wird:**
- Der Pause-Guard `if (get().isPaused) return;` (Zeile 1562) bleibt unverändert.
- Die Step-4-Waiting-Point-Logik (Zeile 1657–1665) bleibt unverändert — das ist der User-Schieberegler, kein Issue-Guard.

### Schritt 1.3 — `RunConfig`-Typ bestätigen

**Datei:** `src/types/index.ts`
**Aktion:** Nur visuell bestätigen, dass `blockStep2OnPriceMismatch` (Zeile 164) und `blockStep4OnMissingOrder` (Zeile 166) existieren. Kein Code-Change nötig — die Felder sind bereits da, werden jetzt zum ersten Mal vollständig verdrahtet.

---

## Phase 2: Entkopplung 2-Step KISS-Flow (Persist vs. Resolve)

**Ziel:** Store-Actions schreiben NUR Fachdaten. Issue-Lifecycle wird AUSSCHLIESSLICH durch expliziten UI-Trigger (`resolveIssue`) gesteuert. Nach dem Resolve wird `refreshIssues` zur Re-Synchronisierung kaskadiernder Issues aufgerufen (Step-5-Regenerierung etc.).

### Schritt 2.1 — `setManualPrice`: `refreshIssues` entfernen

**Datei:** `src/store/runStore.ts`
**Ort:** Zeile 2819–2823

**Lösche** den gesamten Block:
```typescript
    // PROJ-44-ADD-ON-R7: Auto-Resolve nach manuellem Preis (analog setManualPriceByPosition)
    const runIdForRefresh = get().currentRun?.id;
    if (runIdForRefresh) {
      get().refreshIssues(runIdForRefresh);
    }
```

Die Funktion endet nach dem Stats-Update (Zeile ~2817). Logging und Audit bleiben.

### Schritt 2.2 — `setManualPriceByPosition`: `refreshIssues` entfernen

**Datei:** `src/store/runStore.ts`
**Ort:** Zeile 2871–2872

**Lösche:**
```typescript
    // Auto-Resolve feuern
    get().refreshIssues(runId);
```

### Schritt 2.3 — `setManualArticleByPosition`: `refreshIssues` UND Auto-Advance entfernen

**Datei:** `src/store/runStore.ts`
**Ort:** Zeile 2989–2997

**Lösche** den gesamten Block:
```typescript
    // Issues neu generieren (Auto-Resolve für behobene no-match Zeilen)
    get().refreshIssues(runId);

    // Auto-Advance wenn alle no-match Zeilen behoben — PAUSE-GUARD PFLICHT
    if (noMatchCount === 0) {
      setTimeout(() => {
        const s = get();
        if (!s.isPaused) s.advanceToNextStep(runId);
      }, 100);
    }
```

Die Funktion endet nach dem Stats/Step2-Status-Update (Zeile ~2987).

### Schritt 2.4 — `IssueDialog`: "Lösung anwenden" Button-Umbau

**Datei:** `src/components/run-detail/IssueDialog.tsx`
**Ort:** Zeile 694–704 (onClick-Handler des "Lösung anwenden"-Buttons)

**Ersetze** den onClick-Handler durch:

```typescript
                onClick={() => {
                  // PROJ-44-R11: 2-Step KISS — Persist DANN Resolve, nie zusammen
                  if (issue.type === 'price-mismatch' && pendingPrice && currentRun) {
                    // 1. Daten persistieren (ohne Auto-Resolve)
                    setManualPriceByPosition(pendingPrice.positionIndex, pendingPrice.price, currentRun.id);
                    // 2. Issue explizit schließen
                    resolveIssue(issue.id, `Manueller Preis: ${pendingPrice.price.toFixed(2)} EUR`);
                    // 3. Kaskadierende Issues re-synchronisieren (Step-5 etc.)
                    refreshIssues(currentRun.id);
                    setPendingPrice(null);
                    onClose();
                    return;
                  }
                  // PROJ-44-R11: Artikel-Fix 2-Step — ArticleMatchCard hat Daten bereits persistiert
                  if ((issue.type === 'no-article-match' || issue.type === 'match-artno-not-found') && currentRun) {
                    resolveIssue(issue.id, resolutionNote || 'Manueller Artikel-Fix');
                    // Kaskadierende Issues re-synchronisieren (z.B. Step-5 missing-storage-location)
                    refreshIssues(currentRun.id);
                    onClose();
                    return;
                  }
                  // Fallback: regulärer Resolve-Flow (Textarea-Begründung)
                  handleResolve();
                }}
```

**WICHTIG — Warum `refreshIssues` NACH `resolveIssue`:**
`refreshIssues` (Zeile 2523–2529) macht zwei Dinge: `autoResolveIssues` + `generateStep5Issues`.
Ohne diesen Aufruf würden Step-5-Issues stale bleiben, wenn ein Artikel-Fix den `storageLocation`-Wert setzt.
Der Aufruf ist architektonisch korrekt, weil er NACH dem expliziten Resolve als Re-Synchronisierung läuft, NICHT als Seiteneffekt der Datenmutation.

**Prüfe**, dass `refreshIssues` im destructuring des `useRunStore`-Hooks enthalten ist. Es ist bereits über `resolveIssue` importiert (Zeile 368). Ergänze `refreshIssues` falls nötig:

```typescript
const { ..., resolveIssue, refreshIssues } = useRunStore();
```

`resolveIssue` ist bereits importiert (Zeile 24 + 368). ✅

### Schritt 2.5 — `IssuesCenter`: Bulk-Price-Fix mit explizitem Resolve

**Datei:** `src/components/run-detail/IssuesCenter.tsx`
**Ort:** Zeile 599–601 (der `onBulkSetPrice`-Handler in der `IssueCard`-Props)

**Ersetze:**
```typescript
                      onBulkSetPrice={(positionIndex, price) => {
                        if (currentRun) setManualPriceByPosition(positionIndex, price, currentRun.id);
                      }}
```

**Durch:**
```typescript
                      onBulkSetPrice={(positionIndex, price) => {
                        if (currentRun) {
                          // PROJ-44-R11: Persist + expliziter Resolve (kein Auto-Resolve im Store mehr)
                          setManualPriceByPosition(positionIndex, price, currentRun.id);
                          resolveIssue(issue.id, `Manueller Preis: ${price.toFixed(2)} EUR`);
                        }
                      }}
```

**Begründung (Kreuzverhör-Fix):** Der alte Plan wollte hier den Dialog öffnen. Das wäre eine UX-Regression: Der User hat im PriceCell-Popover bereits einen Preis gewählt — diesen Wert wegzuwerfen und den Dialog zu öffnen ist sinnlos. Stattdessen: Persist (Store, jetzt ohne Auto-Resolve) + expliziter Resolve auf UI-Ebene. Die SSOT-Trennung bleibt gewahrt, weil im Store selbst keine Kopplung mehr stattfindet.

**Prüfe**, dass `resolveIssue` im Component-Scope verfügbar ist. Falls nicht, ergänze im destructuring:
```typescript
const { ..., resolveIssue } = useRunStore();
```

### Schritt 2.6 — `updateInvoiceLine` / `updatePositionLines`: Auto-Resolve NICHT entfernen

**Datei:** `src/store/runStore.ts`
**Ort:** Zeile 2082–2087 und 2115–2117

**KEINE ÄNDERUNG.** Diese generischen Update-Funktionen werden NICHT aus dem KISS-Issue-Flow aufgerufen, sondern aus programmatischen Pipeline-Steps (Step 2 Matcher, Step 3 Serial-Extraktion). Der Auto-Resolve dort ist korrekt, weil er automatische Korrekturen erkennt, nicht User-Aktionen.

---

## Phase 3: Top-Down vs. Bottom-Up (Array-Ausroll-Mechanik)

**Ziel:** Top-Down Actions (`ByPosition`) kaskadieren nach Expansion korrekt. Bottom-Up bekommt eine eigene Artikel-Action.

### Schritt 3.1 — `setManualArticleByPosition`: Post-Expansion-Kaskade sicherstellen

**Datei:** `src/store/runStore.ts`
**Ort:** Zeile 2884–2950 (der `set()`-Call innerhalb von `setManualArticleByPosition`)

**Prüfe:** Der Filter `line.positionIndex === positionIndex && line.lineId.startsWith(runId + '-line-')` (Zeile 2886) erfasst BEREITS alle expandierten Zeilen einer Position, da alle denselben `positionIndex` tragen und das `runId`-Prefix haben.

**Ergebnis:** Kein Code-Change nötig. Die Kaskade funktioniert bereits korrekt, weil `startsWith(runId + '-line-')` alle Zeilen matcht (sowohl `runId-line-0` als repräsentative Zeile als auch `runId-line-0-0`, `runId-line-0-1` etc. als expandierte Zeilen).

**Bestätige** dies durch einen kurzen Blick auf die lineId-Struktur: Das Prefix `${runId}-line-` ist bewusst so gewählt, dass es positionIndex-übergreifend matcht. Die Kombination mit `positionIndex ===` schränkt korrekt ein.

### Schritt 3.2 — Neue Action `setManualArticleByLine` erstellen

**Datei:** `src/store/runStore.ts`
**Ort:** Direkt NACH `setManualArticleByPosition` (nach Zeile ~2999), VOR `updateLineSerialData`.

**Interface-Ergänzung** im RunStore-Interface (suche nach `setManualArticleByPosition` in der Interface-Definition, ca. Zeile 555):

```typescript
  /** PROJ-44-R11: Chirurgischer Artikel-Fix — nur einzelne ausgerollte Zeile, keine Geschwister */
  setManualArticleByLine: (lineId: string, data: ManualArticleData, runId: string) => void;
```

**Typ:** `ManualArticleData` ist bereits definiert in `runStore.ts:414–426`. Denselben Typ verwenden.

**Implementation:**

```typescript
  // ─── PROJ-44-R11: Chirurgischer Artikel-Fix für einzelne ausgerollte Zeile ───
  setManualArticleByLine: (lineId, data, runId) => {
    const masterArticles = useMasterDataStore.getState().articles;
    const matched = masterArticles.find(a => a.falmecArticleNo === data.falmecArticleNo);

    const { globalConfig } = get();
    const tolerance = globalConfig?.tolerance ?? 0.01;

    set((state) => ({
      invoiceLines: state.invoiceLines.map(line => {
        if (line.lineId !== lineId) return line;

        const storageLocation = matched?.storageLocation || data.storageLocation || line.storageLocation || null;
        const logicalStorageGroup: 'WE' | 'KDD' | null = storageLocation
          ? (storageLocation.includes('KDD') ? 'KDD' : 'WE')
          : null;

        const finalPrice = data.unitPriceSage ?? matched?.unitPriceNet ?? null;
        const priceCheckStatus = (!finalPrice
          ? 'missing'
          : Math.abs(finalPrice - line.unitPriceInvoice) <= tolerance
            ? 'ok'
            : 'mismatch') as InvoiceLine['priceCheckStatus'];
        const unitPriceFinal = priceCheckStatus === 'ok' ? finalPrice : line.unitPriceFinal;

        if (matched) {
          return {
            ...line,
            falmecArticleNo: data.falmecArticleNo,
            matchStatus: 'full-match' as const,
            unitPriceSage: data.unitPriceSage ?? matched.unitPriceNet,
            descriptionDE: matched.descriptionDE ?? data.descriptionDE ?? line.descriptionDE,
            storageLocation,
            logicalStorageGroup,
            serialRequired: data.serialRequired ?? matched.serialRequirement,
            manufacturerArticleNo: matched.manufacturerArticleNo || data.manufacturerArticleNo || line.manufacturerArticleNo,
            ean: matched.ean || data.ean || line.ean,
            supplierId: matched.supplierId ?? data.supplierId ?? line.supplierId,
            activeFlag: matched.activeFlag,
            priceCheckStatus,
            unitPriceFinal,
            orderNumberAssigned: data.orderNumberAssigned || line.orderNumberAssigned,
            qty: data.quantity ?? line.qty,
            serialNumbers: data.serialNumbers?.length ? data.serialNumbers : line.serialNumbers,
            serialNumber: data.serialNumbers?.length ? data.serialNumbers[0] : line.serialNumber,
            serialSource: data.serialNumbers?.length ? 'manual' as const : line.serialSource,
            articleSource: 'manual' as const,
          };
        } else {
          return {
            ...line,
            falmecArticleNo: data.falmecArticleNo,
            matchStatus: 'full-match' as const,
            unitPriceSage: data.unitPriceSage ?? null,
            descriptionDE: data.descriptionDE ?? line.descriptionDE,
            storageLocation,
            logicalStorageGroup,
            serialRequired: data.serialRequired ?? line.serialRequired,
            manufacturerArticleNo: data.manufacturerArticleNo ?? line.manufacturerArticleNo,
            ean: data.ean ?? line.ean,
            supplierId: data.supplierId ?? line.supplierId,
            priceCheckStatus,
            unitPriceFinal,
            orderNumberAssigned: data.orderNumberAssigned || line.orderNumberAssigned,
            qty: data.quantity ?? line.qty,
            serialNumbers: data.serialNumbers?.length ? data.serialNumbers : line.serialNumbers,
            serialNumber: data.serialNumbers?.length ? data.serialNumbers[0] : line.serialNumber,
            serialSource: data.serialNumbers?.length ? 'manual' as const : line.serialSource,
            articleSource: 'manual' as const,
          };
        }
      }),
    }));

    logService.info(
      `Manueller Artikel-Fix (line-scoped): ${data.falmecArticleNo} für lineId=${lineId}`,
      { runId, step: 'Artikel extrahieren', details: matched ? 'Stammdaten-Treffer' : 'Nur Formulardaten' },
    );
    get().addAuditEntry({
      runId,
      action: 'setManualArticleByLine',
      details: `lineId=${lineId}, falmecArticleNo=${data.falmecArticleNo}, source=${matched ? 'master' : 'form'}`,
      userId: 'system',
    });

    // Match-Stats re-evaluieren (KEIN refreshIssues, KEIN auto-advance!)
    const runLines = get().invoiceLines.filter(l => l.lineId.startsWith(runId));
    const matchStats = computeMatchStats(runLines);
    set((state) => ({
      runs: state.runs.map(r =>
        r.id === runId ? { ...r, stats: { ...r.stats, ...matchStats } } : r
      ),
      currentRun: state.currentRun?.id === runId
        ? { ...state.currentRun, stats: { ...state.currentRun.stats, ...matchStats } }
        : state.currentRun,
    }));
  },
```

**WICHTIG:** Kein `refreshIssues`, kein `advanceToNextStep`, kein Step2-Status-Update. Das ist die chirurgische Bottom-Up-Variante. Die Isolation ist garantiert durch den `line.lineId !== lineId`-Filter — es wird exakt eine Zeile geändert.

---

## Phase 4: UI-Routing & Popover-Crash Fix

**Ziel:** Popover schließt sich nicht mehr beim Tippen. Post-Expansion-Klicks auf gelöste Felder routen zum Issues-Tab.

### Schritt 4.1 — Click-Delegations-Wrapper in `IssueDialog` fixen

**Datei:** `src/components/run-detail/IssueDialog.tsx`
**Ort:** Zeile 539–548

**Ersetze** den Wrapper:
```tsx
                  <div
                    role="button"
                    tabIndex={0}
                    className="inline-flex items-center gap-2 rounded border border-black/60 bg-green-50/40 px-3 py-1.5 cursor-pointer shadow-sm hover:bg-green-100/50 transition-colors"
                    onClick={(e) => {
                      const btn = e.currentTarget.querySelector('button');
                      if (btn && !btn.contains(e.target as Node)) {
                        btn.click();
                      }
                    }}
                  >
```

**Durch:**
```tsx
                  <div
                    className="inline-flex items-center gap-2 rounded border border-black/60 bg-green-50/40 px-3 py-1.5 shadow-sm"
                  >
```

**Begründung:** Der `role="button"` + `onClick` + `btn.click()`-Delegationsmechanismus ist die Primärursache des Popover-Crashes. Events aus dem Radix-Portal bubblen durch den React-Tree zurück zum Wrapper, der dann erneut `btn.click()` feuert und das Popover toggelt. Durch Entfernung von `role`, `tabIndex`, `cursor-pointer`, `hover` und dem `onClick`-Handler wird der Wrapper zu einem reinen Layout-Container. Der PriceCell-Button bleibt direkt klickbar.

### Schritt 4.2 — PriceCell Input: Textfarbe explizit setzen

**Datei:** `src/components/run-detail/PriceCell.tsx`
**Ort:** Zeile 199

**Ersetze:**
```tsx
                  className="flex-1 text-sm"
```

**Durch:**
```tsx
                  className="flex-1 text-sm text-foreground"
```

### Schritt 4.3 — IssueDialog Serial-Dialog: `text-white` entfernen

**Datei:** `src/components/run-detail/IssueDialog.tsx`
**Ort:** Zeile 318 (DialogTitle) und Zeile 338 (Input)

**Zeile 318 — Ersetze:**
```tsx
            <DialogTitle className="text-sm text-white">
```
**Durch:**
```tsx
            <DialogTitle className="text-sm text-foreground">
```

**Zeile 338 — Ersetze:**
```tsx
                  className="h-7 text-xs text-white"
```
**Durch:**
```tsx
                  className="h-7 text-xs text-foreground"
```

### Schritt 4.4 — `ItemsTable`: Post-Expansion Routing für gelöste Felder

**Datei:** `src/components/run-detail/ItemsTable.tsx`
**Ort:** Zeile 453–459 (die `PriceCell`-Render-Stelle)

**KRITISCHER KONTEXT (Kreuzverhör-Fix):** In `PriceCell.tsx` wird die `readOnly`-Prüfung (Zeile 75–104) VOR der `onJumpToArticleList`-Prüfung (Zeile 107) ausgewertet. Wenn `readOnly=true` ist, returned PriceCell sofort ein nicht-interaktives Element — `onJumpToArticleList` wird NIEMALS erreicht. Deshalb darf `readOnly` NICHT auf `true` gesetzt werden, wenn gleichzeitig ein Jump gewünscht ist.

**Aktueller Code:**
```tsx
                      <TableCell className="text-right">
                        <PriceCell
                          line={line}
                          onSetPrice={handleSetPrice}
                          readOnly={!currentRun?.isExpanded}
                        />
                      </TableCell>
```

**Ersetze durch:**
```tsx
                      <TableCell className="text-right">
                        <PriceCell
                          line={line}
                          onSetPrice={handleSetPrice}
                          readOnly={!currentRun?.isExpanded}
                          onJumpToArticleList={
                            currentRun?.isExpanded && line.priceCheckStatus === 'custom'
                              ? () => useRunStore.getState().setActiveTab('issues')
                              : undefined
                          }
                        />
                      </TableCell>
```

**Logik-Trace durch PriceCell-Guards:**
- `!isExpanded` → `readOnly=true`, kein Jump → nicht-interaktives Display ✅
- `isExpanded` + `custom` → `readOnly=false`, `onJumpToArticleList` gesetzt → Jump-Mode (klickbares Badge, Zeile 107–131) ✅
- `isExpanded` + nicht `custom` → `readOnly=false`, kein Jump → normaler Popover-Edit ✅

**Zugriff auf `setActiveTab`:** `ItemsTable` nutzt bereits `useRunStore.getState()` (Zeile 82). Dasselbe Pattern hier. KEIN neues Destructuring nötig.

### Schritt 4.5 — `InvoicePreview`: Post-Expansion Routing für gelöste Felder

**Datei:** `src/components/run-detail/InvoicePreview.tsx`
**Ort:** Zeile 582–590 (die `PriceCell`-Render-Stelle mit `onJumpToArticleList`)

**Aktueller Code:**
```tsx
                            <PriceCell
                                line={posStatus.representativeLine}
                                onSetPrice={handleSetPrice}
                                readOnly={false}
                                onJumpToArticleList={
                                  currentRun?.isExpanded
                                    ? () => handlePriceJump(position.positionIndex)
                                    : undefined
                                }
                              />
```

**Ersetze durch:**
```tsx
                            <PriceCell
                                line={posStatus.representativeLine}
                                onSetPrice={handleSetPrice}
                                readOnly={false}
                                onJumpToArticleList={
                                  currentRun?.isExpanded
                                    ? (posStatus.representativeLine.priceCheckStatus === 'custom'
                                      ? () => useRunStore.getState().setActiveTab('issues')
                                      : () => handlePriceJump(position.positionIndex))
                                    : undefined
                                }
                              />
```

**readOnly bleibt `false`** — gleicher Grund wie Schritt 4.4: PriceCell prüft `readOnly` vor `onJumpToArticleList`. Bei `readOnly=true` würde der Jump nie erreicht.

**Logik-Trace:**
- Nicht expanded → kein Jump, `readOnly=false` → Popover-Edit (RE-Positionen Arbeitsbereich) ✅
- Expanded + `custom` → Jump zu Issues-Tab ✅
- Expanded + nicht `custom` → Jump zu Artikelliste (wie bisher) ✅

**Zugriff auf `setActiveTab`:** `InvoicePreview` nutzt bereits `useRunStore.getState()` (Zeile 92). Dasselbe Pattern hier.

---

## Phase 5: PDF-Datenverlust (Reprocess-Fix)

**Ziel:** `currentParsedRunId` wird beim Reprocess korrekt synchronisiert, damit der Debounce-AutoSave die PDF-Daten nicht überschreibt.

### Schritt 5.1 — `reprocessCurrentRun`: Parse-Ownership setzen

**Datei:** `src/store/runStore.ts`
**Ort:** Zeile 2059–2068 (der `set()`-Call in `reprocessCurrentRun`)

**Ersetze:**
```typescript
    set((s) => ({
      runs: s.runs.map(r =>
        r.id === runId ? { ...r, steps: resetSteps, status: 'running' as const } : r
      ),
      currentRun: s.currentRun?.id === runId
        ? { ...s.currentRun, steps: resetSteps, status: 'running' as const }
        : s.currentRun,
      issues: keptIssues,
      latestDiagnostics: {},
    }));
```

**Durch:**
```typescript
    set((s) => ({
      runs: s.runs.map(r =>
        r.id === runId ? { ...r, steps: resetSteps, status: 'running' as const } : r
      ),
      currentRun: s.currentRun?.id === runId
        ? { ...s.currentRun, steps: resetSteps, status: 'running' as const }
        : s.currentRun,
      issues: keptIssues,
      latestDiagnostics: {},
      // PROJ-44-R11: Parse-Ownership explizit mitführen — verhindert,
      // dass buildAutoSavePayload die PDF-Daten als leer persistiert.
      currentParsedRunId: runId,
    }));
```

### Schritt 5.2 — `setCurrentRun`: Parse-Ownership synchronisieren

**Datei:** `src/store/runStore.ts`
**Ort:** Zeile 653

**Ersetze:**
```typescript
  setCurrentRun: (run) => set({ currentRun: run }),
```

**Durch:**
```typescript
  setCurrentRun: (run) => set({
    currentRun: run,
    // PROJ-44-R11: Parse-Ownership synchronisieren — verhindert latenten Datenverlust
    // wenn ein Run aktiviert wird, ohne loadPersistedRun() durchzulaufen.
    currentParsedRunId: run?.id ?? null,
  }),
```

**Begründung:** `loadPersistedRun` (Zeile 4078) setzt `currentParsedRunId` korrekt. Aber `setCurrentRun` (verwendet bei Run-Wechsel ohne Rehydrierung) tut das nicht. Dadurch bleibt `currentParsedRunId` auf dem alten Wert, und `buildAutoSavePayload` (Zeile 42–43) schreibt leere Arrays.

---

## Validierungs-Checkliste

Nach Abschluss aller 5 Phasen, prüfe folgende Szenarien:

| # | Szenario | Erwartung |
|---|----------|-----------|
| 1 | Step 2 mit offenem `no-article-match` → "Weiter" | Blockiert (immer) |
| 2 | Step 2 mit offenem `price-mismatch`, Toggle AUS | Nicht blockiert |
| 3 | Step 2 mit offenem `price-mismatch`, Toggle AN | Blockiert |
| 4 | Step 4 mit offenem `order-assignment`, Toggle AUS | Nicht blockiert |
| 5 | Step 4 mit offenem `order-assignment`, Toggle AN | Blockiert |
| 6 | `setManualPriceByPosition` aufrufen | Issue bleibt offen |
| 7 | "Lösung anwenden" im IssueDialog (Preis) | Persist + Resolve + refreshIssues + Close |
| 8 | "Lösung anwenden" im IssueDialog (Artikel) | Resolve + refreshIssues + Close |
| 9 | IssuesCenter PriceCell Bulk-Fix | Persist + Resolve (Shortcut) |
| 10 | PriceCell Popover in IssueDialog → Input tippen | Popover bleibt offen |
| 11 | Klick auf korrigierten Preis in ItemsTable (post-expansion) | Wechsel zu Issues-Tab |
| 12 | Klick auf korrigierten Preis in InvoicePreview (post-expansion) | Wechsel zu Issues-Tab |
| 13 | Klick auf offenen Preis in InvoicePreview (post-expansion) | Jump zu Artikelliste |
| 14 | "Neu verarbeiten" → Reload | PDF-Daten vorhanden |
| 15 | Serial-Dialog Text in IssueDialog | Lesbar (nicht weiß-auf-weiß) |
| 16 | Artikel-Fix setzt storageLocation → Step-5 Issue | Wird nach Resolve auto-resolved |

---

## Hinweise für die Implementierung

1. **Reihenfolge einhalten.** Phase 1 zuerst, dann 2, dann 3, dann 4, dann 5. Jede Phase kann einzeln committet werden.
2. **Keine neuen Dateien.** Alle Änderungen in bestehenden Dateien.
3. **TypeScript-Kompilierung prüfen** nach jeder Phase (`npm run build` oder `npx tsc --noEmit`).
4. **`refreshIssues`-Aufrufe:** NUR die in Schritt 2.1–2.3 genannten entfernen. Andere `refreshIssues`-Aufrufe (z.B. in `updateLineSerialData` Zeile 3073) bleiben — die gehören zu Pipeline-Actions, nicht zum KISS-Issue-Flow.
5. **`autoResolveIssues`-Aufrufe:** NICHT anfassen (Schritt 2.6 erklärt warum).
6. **PriceCell Guard-Reihenfolge:** `readOnly` wird in `PriceCell.tsx` VOR `onJumpToArticleList` geprüft (Zeile 75 vs. 107). Deshalb darf `readOnly` NIEMALS `true` sein, wenn gleichzeitig ein Jump-Handler gesetzt wird. Die Schritte 4.4 und 4.5 respektieren das.
7. **`setActiveTab`-Pattern:** Beide Tabellen (`ItemsTable`, `InvoicePreview`) nutzen `useRunStore.getState()` für imperativen Zugriff. Dasselbe Pattern für die neuen Jump-Handler verwenden — kein neues Destructuring.

---

## Kreuzverhör-Protokoll (v2)

4 Lücken im Originalplan identifiziert und geschlossen:

| # | Befund | Severity | Fix |
|---|--------|----------|-----|
| 1 | `refreshIssues` fehlt nach `resolveIssue` im IssueDialog → Step-5-Issues stale | KRITISCH | Schritt 2.4: `refreshIssues(currentRun.id)` nach jedem `resolveIssue` |
| 2 | PriceCell: `readOnly=true` blockiert `onJumpToArticleList` (Guard-Reihenfolge) | KRITISCH | Schritte 4.4/4.5: `readOnly` unverändert lassen, nur `onJumpToArticleList` setzen |
| 3 | IssuesCenter: Dialog-Umleitung verwirft bereits gewählten Preis | SIGNIFIKANT | Schritt 2.5: Persist + Resolve direkt, kein Dialog-Umweg |
| 4 | `setActiveTab` Zugriff inkonsistent mit bestehendem Pattern | MINOR | Schritte 4.4/4.5: `useRunStore.getState().setActiveTab()` statt Destructuring |
