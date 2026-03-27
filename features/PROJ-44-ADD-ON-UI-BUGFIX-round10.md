# PROJ-44-ADD-ON-UI-BUGFIX — Round 10 (Rettungsplan)

**Stand:** 2026-03-22
**Status:** Done
**Scope:** 6 kritische Round-9-Regressionen reparieren
**Diagnostik-Grundlage:** `features/PROJ-44-ADD-ON-UI-BUGFIX-round10_diagnostic.md`
**Betroffene Dateien:**

- `src/store/runStore.ts`
- `src/components/run-detail/IssueDialog.tsx`

---

## Fix 1 — Workflow-Blockade: `advanceToNextStep` blockiert nicht bei offenen Error-Issues

### Problem
`advanceToNextStep()` (runStore.ts:1571-1592) prüft nur `price-mismatch`-Issues in Step 2 als Blocker. Alle anderen Error-Issues (z.B. `no-article-match`, `serial-mismatch`, `inactive-article`) werden ignoriert. Danach wird der Step pauschal auf `ok` gesetzt (Zeile 1592). Dadurch fließt der Workflow unkontrolliert weiter.

### Lösung
Einen **generischen Error-Issue-Guard** direkt nach dem bestehenden `price-mismatch`-Guard einfügen — NOCH innerhalb des `if (runningStep)`-Blocks, VOR Zeile 1592.

### Aktion
**Datei:** `src/store/runStore.ts`
**Stelle:** Nach Zeile 1589 (Ende des price-mismatch-Blocks), vor Zeile 1591 (`// Set current step to 'ok'`)

Neuen Block einfügen:

```ts
// PROJ-44-R10: Generischer Error-Issue-Guard — blockiert Step-Advance
// wenn IRGENDEIN offenes/pending Error-Issue im aktuellen Step existiert.
const openErrorIssues = issues.filter(
  i => i.runId === runId
    && i.stepNo === runningStep.stepNo
    && i.severity === 'error'
    && (i.status === 'open' || i.status === 'pending'),
);
if (openErrorIssues.length > 0) {
  logService.warn(
    `Block-Guard: Step ${runningStep.stepNo} blockiert (${openErrorIssues.length} offene Error-Issues)`,
    { runId, step: 'System' },
  );
  return;
}
```

### Warum das reicht
- Der bestehende `price-mismatch`-Guard (Zeile 1578-1589) bleibt unangetastet — er greift bei `blockStep2OnPriceMismatch=true` für Warnings.
- Der neue generische Guard fängt alles mit `severity: 'error'` ab — step-übergreifend.
- `severity: 'warning'` und `severity: 'info'` blockieren NICHT (gewünscht: Workflow darf bei Warnungen weiterlaufen).
- Kein Eingriff in die Step-Status-Berechnung nötig.

### Risiko
Gering. Additive Logik, kein bestehender Pfad wird verändert.

---

## Fix 2 — Preis-Popover schließt den Dialog (Portal-Kollision)

### Problem
`PriceCell` rendert ein Radix `Popover` in einem Portal. Der `IssueDialog` ist ein modaler Radix `Dialog`. Klickt der User ins portalierte Popover (z.B. manuelles Preisfeld), wertet der Dialog das als "Outside Interaction" und schließt sich. Der lokale `pendingPrice`-State geht verloren.

### Lösung
`onInteractOutside` am `DialogContent` blockieren: `(e) => e.preventDefault()`. Damit bleibt der Dialog offen, auch wenn der User in portalierte Kinder (Popover, Select) klickt. Das X-Icon und ESC funktionieren weiterhin zum Schließen.

### Aktion
**Datei:** `src/components/run-detail/IssueDialog.tsx`
**Stelle:** Zeile 457 — das `<DialogContent>` Tag

Vorher:
```tsx
<DialogContent className="max-w-6xl w-full h-[85vh] max-h-[850px] flex flex-col" style={{ backgroundColor: '#D8E6E7' }}>
```

Nachher:
```tsx
<DialogContent
  className="max-w-6xl w-full h-[85vh] max-h-[850px] flex flex-col"
  style={{ backgroundColor: '#D8E6E7' }}
  onInteractOutside={(e) => e.preventDefault()}
>
```

### Warum das reicht
- Radix Dialog feuert `onInteractOutside` bei Pointer-Events außerhalb der Content-Boundary, was portalisierte Kinder einschließt.
- `preventDefault()` unterdrückt nur den Auto-Close, nicht andere Interaktionen.
- Der User kann den Dialog weiterhin über X-Button, ESC-Taste oder den expliziten `onClose()`-Pfad schließen.
- Dasselbe Pattern löst automatisch auch das E-Mail-Dropdown-Portal-Problem (Fix 5).

### Gewollter Trade-off
`onInteractOutside` blockiert AUCH Klicks auf den abgedunkelten Backdrop (Overlay). Der Overlay ist ein separates Portal-Element außerhalb der DialogContent-Boundary. Das heißt: der User kann den Dialog NICHT mehr durch Klick auf den dunklen Hintergrund schließen. Er muss den X-Button oder ESC nutzen. Das ist ein bewusster Trade-off zugunsten der Datensicherheit (`pendingPrice` geht nicht verloren). Dasselbe Pattern verwendet Radix intern für `AlertDialog`.

### Risiko
Gering. Standard-Pattern für modale Dialoge mit portalierten Kind-Komponenten. UX-Einschränkung (kein Backdrop-Close) ist gewollt.

---

## Fix 3 — Re-Open setzt Zeilen-Status nicht zurück (PriceBox verschwindet)

### Problem
`reopenIssue()` (runStore.ts:2517-2537) setzt nur Issue-Metadaten zurück (`status`, `resolvedAt`, etc.). Die zugehörige `InvoiceLine` bleibt auf `priceCheckStatus: 'custom'` und `unitPriceFinal` behält den alten Wert. Dadurch rendert die PriceBox nicht (Guard: `affectedLines.find(l => l.priceCheckStatus === 'mismatch')` in IssueDialog.tsx:529).

### Lösung
In `reopenIssue()` nach dem Issue-Status-Reset: wenn das Issue vom Typ `price-mismatch` ist, die betroffenen Zeilen zurück auf `priceCheckStatus: 'mismatch'` setzen und `unitPriceFinal` auf `null` zurücksetzen.

### Typensicherheit
`unitPriceFinal` ist typisiert als `number | null` (types/index.ts:316). Alle Renderer (PriceCell, DetailPopup, formatCurrency, exportService) behandeln `null` bereits sauber via Nullish-Coalescing (`??`) oder expliziten Null-Checks. Der Reset auf `null` ist typsicher und crash-frei. **KEIN `undefined`-Hack** — `undefined ∉ number | null`.

### Aktion
**Datei:** `src/store/runStore.ts`
**Stelle:** In `reopenIssue` (Zeile 2517-2537) — nach dem `set(...)` Block (Zeile 2531), vor dem `const runId` (Zeile 2532).

Den bestehenden Code ab Zeile 2517 durch folgendes ersetzen:

```ts
reopenIssue: (issueId) => {
  const issueToReopen = get().issues.find(i => i.id === issueId);
  if (!issueToReopen) return;

  set((state) => {
    let updatedLines = state.invoiceLines;

    // PROJ-44-R10: Bei price-mismatch die betroffenen Zeilen zurücksetzen
    if (issueToReopen.type === 'price-mismatch' && issueToReopen.affectedLineIds?.length) {
      const affectedSet = new Set(issueToReopen.affectedLineIds);
      // Auch expandierte Zeilen der betroffenen Positionen zurücksetzen
      const affectedPositions = new Set(
        state.invoiceLines
          .filter(l => affectedSet.has(l.lineId))
          .map(l => l.positionIndex),
      );
      const runPrefix = issueToReopen.runId + '-';
      updatedLines = state.invoiceLines.map(line =>
        line.lineId.startsWith(runPrefix)
          && affectedPositions.has(line.positionIndex)
          && line.priceCheckStatus === 'custom'
          ? { ...line, priceCheckStatus: 'mismatch' as const, unitPriceFinal: null }
          : line
      );
    }

    return {
      invoiceLines: updatedLines,
      issues: state.issues.map(issue =>
        issue.id === issueId
          ? {
              ...issue,
              status: 'open' as const,
              resolvedAt: null,
              resolutionNote: null,
              escalatedAt: undefined,
              escalatedTo: undefined,
            }
          : issue
      ),
    };
  });

  const runId = get().issues.find(i => i.id === issueId)?.runId ?? get().currentRun?.id;
  if (runId) {
    logService.info(`Issue reaktiviert: ${issueId}`, { runId, step: 'Issues' });
    get().addAuditEntry({ runId, action: 'reopenIssue', details: `issueId=${issueId}`, userId: 'system' });

    // PROJ-44-R10: Price-Stats aktualisieren nach Line-Reset
    if (issueToReopen.type === 'price-mismatch') {
      const { invoiceLines } = get();
      const runLines = invoiceLines.filter(l => l.lineId.startsWith(runId));
      const priceStats = {
        priceOkCount: runLines.filter(l => l.priceCheckStatus === 'ok').length,
        priceMismatchCount: runLines.filter(l => l.priceCheckStatus === 'mismatch').length,
        priceMissingCount: runLines.filter(l => l.priceCheckStatus === 'missing').length,
        priceCustomCount: runLines.filter(l => l.priceCheckStatus === 'custom').length,
      };
      set((state) => ({
        runs: state.runs.map(r =>
          r.id === runId ? { ...r, stats: { ...r.stats, ...priceStats } } : r
        ),
        currentRun: state.currentRun?.id === runId
          ? { ...state.currentRun, stats: { ...state.currentRun.stats, ...priceStats } }
          : state.currentRun,
      }));
    }
  }
},
```

### Warum das reicht
- Der Guard in IssueDialog.tsx:529 prüft `priceCheckStatus === 'mismatch'` — sobald die Zeile zurückgesetzt ist, rendert die PriceBox wieder.
- Die `autoResolveIssues()`-Funktion (runStore.ts:256-257) prüft dasselbe Feld — solange `mismatch` aktiv ist, wird das Issue nicht auto-resolved.
- Die Price-Stats werden aktualisiert, damit die UI konsistente Zahlen zeigt.

### Risiko
Mittel. Greift in den Line-State. Aber: nur `custom`-Zeilen werden zurückgesetzt, und nur für die betroffenen Positionen des konkreten Issues.

---

## Fix 4 — "Lösung anwenden" Button-Logik: `disabled` ignoriert persistierten Preis

### Problem
Der `disabled`-Guard (IssueDialog.tsx:693) prüft nur den ephemeren `pendingPrice`. Wenn `pendingPrice` verloren geht (z.B. durch Issue-Wechsel und Rückkehr), bleibt der Button disabled, obwohl der Preis bereits im Store auf `priceCheckStatus: 'custom'` steht.

### Lösung
Den `disabled`-Guard erweitern: Bei `price-mismatch`-Issues auch prüfen, ob ALLE betroffenen Zeilen bereits `priceCheckStatus === 'custom'` haben (= Preis wurde bereits gewählt). In diesem Fall den Button ebenfalls freigeben.

### Aktion
**Datei:** `src/components/run-detail/IssueDialog.tsx`
**Stelle:** Zeile 693

Vorher:
```tsx
disabled={issue.type === 'price-mismatch' && pendingPrice ? false : !resolutionNote.trim()}
```

Nachher:
```tsx
disabled={(() => {
  if (issue.type === 'price-mismatch') {
    // Freigeben wenn: pendingPrice vorhanden ODER Preis bereits persistiert
    if (pendingPrice) return false;
    const allFixed = affectedLines.length > 0
      && affectedLines.every(l => l.priceCheckStatus === 'custom');
    if (allFixed) return false;
  }
  return !resolutionNote.trim();
})()}
```

### Zusätzlich: Pending-Price Info-Box auch bei persistiertem Preis zeigen
**Stelle:** Zeile 650

Vorher:
```tsx
{issue.type === 'price-mismatch' && pendingPrice && (
```

Nachher:
```tsx
{issue.type === 'price-mismatch' && (pendingPrice || affectedLines.every(l => l.priceCheckStatus === 'custom')) && (
```

Und den Inhalt der Info-Box anpassen, damit bei persistiertem Preis (ohne `pendingPrice`) ein passender Text erscheint. Im `<div>` (Zeile 658-663):

Vorher:
```tsx
<div className="flex items-center gap-3 rounded border border-teal-300/50 bg-white/40 px-3 py-2">
  <span className="text-xs font-mono text-foreground">{pendingPrice.lineLabel}</span>
  <span className="ml-auto text-sm font-bold text-teal-700">
    {pendingPrice.price.toFixed(2)} EUR
  </span>
</div>
```

Nachher:
```tsx
<div className="flex items-center gap-3 rounded border border-teal-300/50 bg-white/40 px-3 py-2">
  {pendingPrice ? (
    <>
      <span className="text-xs font-mono text-foreground">{pendingPrice.lineLabel}</span>
      <span className="ml-auto text-sm font-bold text-teal-700">
        {pendingPrice.price.toFixed(2)} EUR
      </span>
    </>
  ) : (
    <span className="text-xs text-teal-700 font-medium">
      Preis bereits korrigiert ({affectedLines[0]?.unitPriceFinal?.toFixed(2) ?? '—'} EUR)
    </span>
  )}
</div>
```

### Warum das reicht
- Deckt beide Fälle ab: (a) `pendingPrice` vorhanden → wie bisher, (b) Preis bereits persistiert → Button trotzdem frei.
- Der Resolve-Handler (Zeile 684-688) funktioniert weiterhin: mit `pendingPrice` wird gespeichert, ohne `pendingPrice` fällt er durch zum regulären `handleResolve()` (Textarea-Flow).
- Kein Store-Eingriff nötig.

### Risiko
Gering. Rein UI-Logik, kein State-Mutation.

---

## Fix 5 — E-Mail-Dropdown: Select-Portal wird vom Dialog geschluckt

### Problem
Die Empfänger-`Select`-Komponente (IssueDialog.tsx:714-724) rendert via `SelectContent` (select.tsx:65) in ein Portal. Interaktion im Portal-Dropdown wird vom modalen Dialog als Outside-Interaction gewertet → Dialog schließt, Select verschwindet.

### Lösung
**Bereits durch Fix 2 gelöst.** Das `onInteractOutside={(e) => e.preventDefault()}` am `DialogContent` verhindert, dass Klicks in portalisierte Kind-Elemente (Popover, Select) den Dialog schließen.

### Verifizierung nach Implementierung
- Dialog öffnen → E-Mail Tab → Empfänger-Dropdown öffnen → Adresse auswählen
- Dialog darf sich NICHT schließen.

### Aktion
Keine zusätzliche Code-Änderung. Fix 2 deckt diesen Fall mit ab.

### Risiko
Keins (kein zusätzlicher Code).

---

## Fix 6 — Zombie-Popup: Fehlender `onClose()` im Pending-Tab

### Problem
Im Pending-Tab (Tab 5) markiert der Button "Als gelöst markieren" (IssueDialog.tsx:802-806) das Issue via `resolveIssue()`, aber der Dialog bleibt offen (kein `onClose()`-Aufruf).

### Lösung
`onClose()` nach `resolveIssue()` aufrufen.

### Aktion
**Datei:** `src/components/run-detail/IssueDialog.tsx`
**Stelle:** Zeile 806

Vorher:
```tsx
onClick={() => { resolveIssue(pi.id, 'Manuell als geloest markiert'); }}
```

Nachher:
```tsx
onClick={() => { resolveIssue(pi.id, 'Manuell als geloest markiert'); onClose(); }}
```

### Warum das reicht
- `resolveIssue` ist synchron (Store-Mutation via `set()`).
- `onClose()` danach aufzurufen ist safe — der Dialog schließt, das Issue ist bereits resolved.
- Identisches Pattern wie im regulären Resolve-Pfad (Zeile 434-435).

### Risiko
Gering. Einzeiler, identisches Pattern.

---

## Zusammenfassung der Änderungen

| Fix | Datei | Art | Risiko |
|-----|-------|-----|--------|
| 1 — Workflow-Blockade | `runStore.ts` | Neuer Guard-Block (12 Zeilen) | Gering |
| 2 — Preis-Popover Crash | `IssueDialog.tsx` | 1 Prop am `DialogContent` | Gering |
| 3 — Re-Open Reset | `runStore.ts` | `reopenIssue` umschreiben (~50 Zeilen) | Mittel |
| 4 — Button-Logik | `IssueDialog.tsx` | `disabled`-Guard + Info-Box erweitern | Gering |
| 5 — E-Mail-Dropdown | — | Bereits durch Fix 2 gelöst | Keins |
| 6 — Zombie-Popup | `IssueDialog.tsx` | 1 Zeile `onClose()` ergänzen | Gering |

**Gesamtumfang:** ~2 Dateien, ~80 Zeilen netto. Kein neues Feature, nur Reparatur.

## Implementierungsreihenfolge

1. **Fix 2** (Dialog `onInteractOutside`) — Grundlage für stabiles Testen aller anderen Fixes
2. **Fix 6** (Pending-Tab `onClose`) — Einzeiler, sofort erledigt
3. **Fix 1** (Workflow-Guard) — Store-Logik, unabhängig von UI
4. **Fix 3** (Re-Open Line-Reset) — Store-Logik, Basis für Fix 4
5. **Fix 4** (Button-Logik) — UI-Logik, benötigt korrekten Line-State aus Fix 3
6. **Fix 5** — Nur Verifizierung (durch Fix 2 abgedeckt)

## Nicht-Ziele (Scope-Schutz)

- **Kein Refactoring** der Step-Status-Berechnung (Zeilen 3548-3644, 3756-3922). Das Grundproblem (halbe Migration auf Einzel-Issues) wird durch den generischen Guard in `advanceToNextStep` überbrückt, ohne die Step-Berechnung anfassen zu müssen.
- **Keine neuen Komponenten, keine neuen Dateien.**
- **Keine Änderung am `dialog.tsx` Base-Component.** Das `onInteractOutside` wird nur am konkreten `<DialogContent>` in `IssueDialog.tsx` gesetzt.
- **Kein Eingriff in `PriceCell.tsx`, `IssuesCenter.tsx`, oder `popover.tsx`.**
