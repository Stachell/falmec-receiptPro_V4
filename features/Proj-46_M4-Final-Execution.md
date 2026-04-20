# PROJ-46 — Milestone 4 (Final) — Execution Plan für Mechaniker (V5)

**Status:** READY-FOR-EXECUTION (V5 — Grep-Konsistenz Final) — Phase V: VALIDATED (100% IST-Zitate, 2026-04-20)
**Erstellt:** 2026-04-20 (Opus, Planungsmeister)
**Baseline:** `features/Proj-46_M4-Final.md` (unangetastet)
**Gilt für:** Mechaniker-Rolle (Sonnet / Opus / Codex, Step-by-Step)

**Changelog V1 → V2:**
- **AP6** erweitert um `auditLog`-Migration + IDB-Ghost-Cleanup.
- **AP7** Helper-Split: `recalculateRunStats` (pure) + `recalculateRunAfterMutation` (Fix-Hub mit autoResolve + step5).
- **AP8** Matrix 8.3 Row 4 (`reopenIssue`) neu bewertet — nutzt **`recalculateRunStats`**, nicht Full-Hub (verhindert No-Op-Regression).
- **AP9** ergänzt um inline Pause-Checks in `executeStep4Orchestration` (async-Löcher in `helpers.ts`).
- **Phase V** tief erweitert: reopenIssue-Body, runStepGuard-Awaits, executeStep4Orchestration-Awaits, auditLog-Typ-Existenzbeweis, IDB-API-Existenzbeweis.

**Changelog V2 → V3 (Audit-Score 74% adressiert, ausschließlich AP6 + AP9-Verifikation):**
- **AP6 Schritt 6.2 Body:** Issues-Map migriert nun auch `relatedLineIds` + `affectedLineIds` (Line-Präfix-Migration innerhalb der Issues). Schließt Daten-Leck, das `reopenIssue` + `confirmManualFix` + `bulkConfirmDraftIssues` nach Rename ins Leere laufen ließ.
- **AP6 TSC-Radar korrigiert:** Nicht „3 Errors an Call-Sites", sondern **1 Error im Factory-Return-Type** (`createRunCrudSlice` — StateCreator-Signatur-Mismatch). Reale Compiler-Reihenfolge.
- **AP9 Verifikations-Zielwerte korrigiert:** `get().isPaused` exakte Endwerte aus IST-Zählung abgeleitet — workflowSlice.ts: 10 → **16**; helpers.ts: 3 → **5**.
- **Phase V.1.e + V.4.g (neu):** Beweis der Line-ID-Präfix-Konvention in Issues + IST-Zählung der Pause-Checks.
- **AP7, AP8, AP10 bleiben unverändert (V2-Stand).**

**Changelog V3 → V4 (Audit-Score 89% adressiert, ausschließlich AP10):**
- **AP10 Schritt 10.2 pagehide-Zielwert korrigiert:** `Grep -c 'pagehide'` → V3 sagte „2", korrekt ist **4** (Kommentar + Log-String + `addEventListener` + `removeEventListener`). Mathematisch aus dem eigenen Soll-Code abgeleitet.
- **AP10 Schritt 10.3 (neu) — Doppel-Flush-Guard via Consume-Pattern:** `pagehide` (neu) und React-Unmount-Cleanup (IST Zeilen 86-103) feuern bei Tab-Close nacheinander und würden sonst denselben Payload zweimal in IDB schreiben. Fix nutzt `lastRunIdRef.current` als Idempotenz-Token: nach Capture auf `null` setzen, zweite Flush-Instanz sieht `if (!runId) return;` und bricht ab. Kein neuer State, keine neue Ref — KISS.
- **Phase V.5.d (neu):** IST-Zitat der Unmount-Cleanup (beweist das fehlende Consume-Pattern) + Herleitung der 4-Treffer-Grep-Mathematik.
- **AP6, AP7, AP8, AP9 bleiben unverändert (V3-Stand).**

**Changelog V4 → V5 (Audit-Score 93% adressiert, ausschließlich Grep-Konsistenz in AP10):**
- **AP10 Schritt 10.3 Kommentar umformuliert:** Das Wort `pagehide` aus dem neuen Kommentar `// PROJ-46 M4 AP10 V4: Consume-Guard gegen Doppel-Flush mit pagehide-Handler.` entfernt. Neuer Wortlaut: `// PROJ-46 M4 AP10 V4: Consume-Guard gegen Doppel-Flush beim Tab-Close.` — damit bleibt der Grep-Zielwert für `pagehide` **stabil bei 4** und das Verifikations-Gate schlägt nicht fälschlich fehl.
- **Phase V.5.d Tabelle unverändert:** Die 4-Treffer-Herleitung zeigt weiterhin nur die 4 Tokens aus Schritt 10.2. V5 dokumentiert zusätzlich, dass Schritt 10.3-Kommentar explizit ohne `pagehide` formuliert ist.
- **AP6, AP7, AP8, AP9 bleiben unverändert (V3-Stand). AP10-Body (Consume-Guard, 10.2- und 10.3-Code-Logik) bleibt unverändert (V4-Stand). V5 ist rein textuell.**

---

## BIG PICTURE

Härtung der Frontend-Schnittstellen (Hooks) und der manuellen Mutationen in der neuen Slice-Architektur (`src/store/slices/`). UI-Aktionen dürfen den Zustand nicht korrumpieren (Guards), Berechnungen nach manuellen Eingriffen laufen zentral & atomar (Fix-Hub), und AutoSave-Timing überlebt das Unmount verlässlich.

**Gesetze, die absolute Wahrheit haben:**
- `INVARIANTS.md` Sektion A (v1.7) — insbesondere A13 (Identitäts-Wechsel), A17 (6 Entry-Points), A18 (5-Familien-Guard), A19 (UI-Entkopplung).
- `CIRCUIT.md` Sektion A (v1.8) — insbesondere A5 (State-Feld-Writer-Matrix), A14 (Pause-Hazard), A17 (Destruktiver UI-Cleanup).
- `CLAUDE.md` v1.4 — Strict Write Discipline, kein Refactoring, Step-by-Step.

**Handschellen für Mechaniker:**
1. **KEIN Code-Schreiben für Folgeschritte**, bevor Dom den aktuellen Schritt `[✓]` freigegeben hat.
2. **KEIN Refactoring** neben dem Scope. Du rührst nur die genannten Zeilen an.
3. **Jeder Schritt endet** mit `npx tsc --noEmit`. Error-Budget pro Schritt ist unten angegeben.
4. **Kein Erfinden von Logik**: Phase V ist verbindliche SOLL-Referenz; Abweichung = STOPP + Rückfrage.

---

## AUDIT-FINDINGS V1/V2 (Eingang) & Ihre Auflösung in V2

| # | Finding | Auflösung in V2 |
|---|---------|-----------------|
| 1 | `reopenIssue` würde durch Recalc-Hub zum No-Op (autoResolve schließt das gerade re-opened Issue sofort wieder) | **AP7 Helper-Split:** `recalculateRunStats` (pure, ohne autoResolve) + `recalculateRunAfterMutation` (Fix-Hub). reopenIssue nutzt **`recalculateRunStats`**. Phase V.2.e beweist über `checkIssueStillActive`-Zitate, dass Issue-Typen ohne Line-Reset (serial-mismatch, order-no-match, inactive-article) sonst fälschlich re-resolved würden. |
| 2 | Async-Löcher: nach `await` in Step-Wrappers und `executeStep4Orchestration` kein Pause-Check — pausierter Run läuft weiter | **AP9 V2:** 2 zusätzliche inline `if (get().isPaused) return;` in `helpers.ts:executeStep4Orchestration` (nach `loadRun` + nach `parseOrderFile`). Wrapper-Ebene (advance + retry) wie V1. Keine neue Boilerplate-Architektur, nur 2 Zeilen. |
| 3 | `renameRun` migriert weder `auditLog` (Speicher) noch räumt IDB-Ghost-Runs auf (Persistenz) | **AP6 V2:** (a) `auditLog`-Migration im selben `set()`-Block (atomar). (b) Fire-and-forget `runPersistenceService.deleteRun(oldId).catch(...)` **nach** dem atomaren In-Memory-Set. Beweis `deleteRun`-API: Phase V.1.d. |
| 4 | Phase V nicht tief genug — Mutations-Signaturen behauptet, Bodies nicht zitiert | **Phase V V2:** reopenIssue komplett zitiert (V.2.e), runStepGuard Awaits (V.4.d), executeStep4Orchestration Awaits (V.4.e), auditLog-Typ-Existenz (V.1.c), runPersistenceService.deleteRun-Existenz (V.1.d). |

## AUDIT-FINDINGS V2 → V3 (74 % → Detail-Härtung) & Ihre Auflösung in V3

| # | Finding | Auflösung in V3 |
|---|---------|-----------------|
| V3-1 | `renameRun` migriert `issue.runId`, aber NICHT `issue.relatedLineIds` / `issue.affectedLineIds` → nach Rename matchen `reopenIssue`, `confirmManualFix`, `bulkConfirmDraftIssues` keine Lines mehr (exakter Set-Match gegen `invoiceLines.lineId`). | **AP6 Schritt 6.2 Body erweitert:** Die `issues.map()` im atomaren `set()` migriert zusätzlich beide Array-Felder via `.map(id => id.startsWith(oldPrefix) ? id.replace(oldPrefix, newPrefix) : id)`. Ownership bleibt beim Primärwriter (R8). Beweis: Phase V.1.e mit Zitaten der 3 betroffenen Actions. |
| V3-2 | Falsche Grep-Zielwerte in Verifikation AP9 (V2 sagte „alte Zahl + 5" bzw. „2"). | **AP9 Verifikation V3:** IST-Zählung dokumentiert (workflowSlice: 10, helpers: 3). Delta-Matrix: workflow +6, helpers +2. **Zielwerte exakt: 16 bzw. 5.** Beweis: Phase V.4.g mit Zeilenzuordnung aller 10+3 IST-Treffer. |
| V3-3 | Falsches TSC-Radar in AP6 („3 Errors an Call-Sites"). Realer Compiler-Lauf produziert **1 Error** am Factory-Return-Type `createRunCrudSlice`. | **AP6 Schritt 6.1 TSC-Radar korrigiert:** Nach 6.1.b 0 Errors (Interface-Addition), nach 6.1.c 1 Error im StateCreator-Return-Type (fehlende `renameRun`-Implementation). Call-Sites werfen an diesem Punkt KEINEN Fehler — sie nutzen noch Inline-Blöcke. Beweis: Zeigeverzweigung `createRunCrudSlice: StateCreator<RunState, [], [], RunCrudSlice>` (runCrudSlice.ts:64). |

---

## SEKTION A — Scope-Übertrag aus Baseline (1:1, inkl. V2-Erweiterungen)

| AP | Titel | Ziel-Datei(en) | Status nach Ausführung |
|----|-------|----------------|------------------------|
| AP6 | `renameRun` konsolidieren (+ auditLog + IDB-Cleanup) | `runCrudSlice.ts`, `ingestSlice.ts`, `store/types.ts` | 1 Action, 3 Call-Sites gepatcht, IDB ghost-free |
| AP7 | Fix-Hub (Helper-Split) | `store/internal/helpers.ts`, `mutationSlice.ts` (nur Imports) | 2 Helper: Stats-Only + Full-Hub |
| AP8 | 5-Familien Action-Guards + Recalc-Einbau | `mutationSlice.ts` | Jede Mutation Early-Return-gesichert, Recalc differenziert |
| AP9 | Pause-Check in `retryStep` + `executeStep4Orchestration` | `workflowSlice.ts`, `helpers.ts` | Alle async-Pfade pause-aware |
| AP10 | UI-Sync / AutoSave-Timing | `useRunAutoSave.ts` | Run-id-stable Debounce + pagehide-Flush |

---

## SEKTION B — Kleinteiliger Ausführungsplan

> **Reihenfolge ist PFLICHT.** AP6 ist typ-invasiv (Type-Addition + neue Sub-Action); AP7 ist Grundlage für AP8 (Helper müssen existieren, bevor Matrix eingebaut wird); AP8 danach; AP9 und AP10 danach, je 1 Commit. Zwischen den APs: `npx tsc --noEmit` MUSS 0 Errors zeigen.

---

### AP6 — `renameRun` als atomare Action (V2: vollständige Identitäts-Migration)

**Warum:** Heute 3 inline Rename-Blöcke, alle **unvollständig** — keiner migriert `auditLog`, keiner räumt IDB-Ghost-Runs auf. Das heißt: Audit-Trail für den ersten `run-${Date.now()}`-State geht verloren, und die IDB akkumuliert verwaiste Einträge unter der temporären ID.

**R8-Klarstellung:** `resetRunSensitiveState` wird durch AP6 **NICHT** aufgerufen. Rename ≠ Cleanup.

#### Schritt 6.1 — Type-Eintrag in `RunState`

**Datei:** `src/store/types.ts`.

- **6.1.a:** `Grep 'interface RunState' src/store/types.ts -n` ausführen, um die Sektion der CRUD-Actions zu lokalisieren.
- **6.1.b:** Unterhalb von `assignParsedRunId` einfügen:
  ```typescript
  renameRun: (oldId: string, newId: string) => void;
  ```
- **6.1.c:** In `RunCrudSlice` Pick-Union (`runCrudSlice.ts:26-62`) nach `'assignParsedRunId'` ergänzen:
  ```typescript
  | 'renameRun'
  ```

**TSC-Radar (V3 korrigiert):** Nach 6.1.b (Interface) **0 Errors** — Interfaces sind nur deklarativ. Nach 6.1.c (Pick-Union) **genau 1 Error** am Factory-Return-Type `createRunCrudSlice` (`runCrudSlice.ts:64`): `Type '{ ... }' is not assignable to type 'RunCrudSlice'. Property 'renameRun' is missing in type '{ ... }'.` Die Call-Sites (`runCrudSlice.ts:362-386`, `:424-447`, `ingestSlice.ts:313-333`) produzieren an diesem Punkt **noch KEINEN** Fehler, weil sie `renameRun` noch nicht referenzieren — sie nutzen weiterhin die Inline-Blöcke. Der Factory-Error verschwindet mit 6.2 (Body eingefügt). Durch 6.3 bleibt TSC sauber.

#### Schritt 6.2 — Action-Body in `runCrudSlice.ts`

**Position:** Direkt nach `assignParsedRunId` (Datei-Zeile 826).

**Body-Kontrakt (V3 — vollständig, inkl. Issue-Line-Ref-Migration):**

```typescript
  // PROJ-46 M4 AP6 — Atomare Identitäts-Migration (Speicher + IDB-Cleanup).
  // Schreibpfad für ALLE ID-führenden Felder in EINEM set(). Fire-and-forget
  // IDB-Delete für Ghost-Records unter der alten ID (idempotent).
  renameRun: (oldId, newId) => {
    if (oldId === newId) return;                                  // Idempotenz
    const present = get().runs.some(r => r.id === oldId);
    if (!present) return;                                         // silent no-op

    const oldPrefix = `${oldId}-line-`;
    const newPrefix = `${newId}-line-`;
    const parsedRunIdShouldFollow = get().currentParsedRunId === oldId;

    set((state) => {
      const updatedRun = state.runs.find(r => r.id === oldId);
      if (!updatedRun) return state;
      const finalRun = { ...updatedRun, id: newId };
      return {
        runs: state.runs.map(r => r.id === oldId ? finalRun : r),
        currentRun: state.currentRun?.id === oldId ? finalRun : state.currentRun,
        invoiceLines: state.invoiceLines.map(l =>
          l.lineId.startsWith(oldPrefix)
            ? { ...l, lineId: l.lineId.replace(oldPrefix, newPrefix) }
            : l
        ),
        // V3 Audit-Finding #1: Issue-interne Line-Referenzen mitmigrieren.
        // relatedLineIds + affectedLineIds halten run-präfixierte lineIds
        // (siehe helpers.ts:129-130, 151-152, 393-394 + types/index.ts:388-389).
        // Ohne Migration laufen reopenIssue / confirmManualFix / bulkConfirmDraftIssues
        // nach einem Rename ins Leere (exakte Set-Matches gegen invoiceLines.lineId).
        issues: state.issues.map(issue =>
          issue.runId === oldId
            ? {
                ...issue,
                runId: newId,
                relatedLineIds: issue.relatedLineIds.map(id =>
                  id.startsWith(oldPrefix) ? id.replace(oldPrefix, newPrefix) : id
                ),
                affectedLineIds: issue.affectedLineIds.map(id =>
                  id.startsWith(oldPrefix) ? id.replace(oldPrefix, newPrefix) : id
                ),
              }
            : issue
        ),
        // V2 Audit-Finding #3: auditLog mitmigrieren (bisher vergessen!)
        auditLog: state.auditLog.map(e =>
          e.runId === oldId ? { ...e, runId: newId } : e
        ),
      };
    });

    if (parsedRunIdShouldFollow) {
      get().assignParsedRunId(newId);
    }

    logService.renameRunBuffer(oldId, newId);

    // V2 Audit-Finding #3: IDB-Ghost entfernen. Fire-and-forget — ein eventuell
    // bereits unter oldId persistierter Record muss weg, bevor der nächste
    // AutoSave unter newId läuft. saveRun() läuft sowieso danach via useRunAutoSave.
    if (runPersistenceService.isAvailable()) {
      runPersistenceService.deleteRun(oldId).catch(err => {
        console.warn('[RunStore] renameRun: IDB-Ghost-Cleanup fehlgeschlagen:', err);
      });
    }
  },
```

**Import-Ergänzung oberhalb** (`runCrudSlice.ts` nahe Zeile 10):
```typescript
import { runPersistenceService } from '@/services/runPersistenceService';
```
(Falls nicht bereits importiert — `Grep` prüfen.)

**Phase-V-Compliance:** Die Felder `runs`, `currentRun`, `invoiceLines`, `issues`, `auditLog` sind alle in `RunCrudSlice` owned (Pick-Liste Zeile 28-33) → R8 gewahrt. `currentParsedRunId`-Follow via `assignParsedRunId` (R8-konform, wie Ist-Code ingestSlice.ts:329-330). Line-ID-Präfix-Migration in `relatedLineIds`/`affectedLineIds` konsistent mit invoiceLines-Migration (selbe `.replace(oldPrefix, newPrefix)`-Logik).

**TSC-Radar (V3 korrigiert):** Nach Einfügen des Bodies **0 Errors**. Der 1 Error aus 6.1.c (Factory-Return-Type) ist damit aufgelöst — das Object-Literal implementiert `renameRun` jetzt.

#### Schritt 6.3 — 3 Call-Sites durch `get().renameRun(…)` ersetzen

**Call-Site A:** `runCrudSlice.ts:362-386` — Erfolgspfad in `createNewRunWithParsing`.
- **Entfernen:** Block `// Update run ID + rename invoiceLine lineIds …` bis **inkl.** `runId = newRunId;` **inkl.** `logService.renameRunBuffer(runId, newRunId);` (Zeile 385).
- **Ersetzen durch:**
  ```typescript
  get().renameRun(runId, newRunId);
  runId = newRunId;
  ```

**Call-Site B:** `runCrudSlice.ts:424-447` — Partial-Pfad.
- **Entfernen:** Analog A, Block `set((state) => { const updatedRun = …` bis **inkl.** `logService.renameRunBuffer(runId, newRunId);` + `runId = newRunId;`
- **Ersetzen durch:**
  ```typescript
  get().renameRun(runId, newRunId);
  runId = newRunId;
  ```

**Call-Site C:** `ingestSlice.ts:313-333` — Phase-1-Bridge.
- **Entfernen:** Kompletter Block ab `const parsedRunIdShouldFollow = get().currentParsedRunId === runId;` bis **inkl.** `logService.renameRunBuffer(runId, newRunId);`
- **Ersetzen durch:**
  ```typescript
  get().renameRun(runId, newRunId);
  ```
- **Kommentar-Pflege:** Kommentar über dem entfernten Block (Zeilen 309-312) **ersetzen** durch:
  ```typescript
  // PROJ-46 M4 AP6: Atomarer Rename via runCrudSlice.renameRun — ID-Migration
  // (runs, currentRun, invoiceLines, issues, auditLog, currentParsedRunId,
  // log-buffer) in EINEM set() + IDB-Ghost-Cleanup. R8 gewahrt.
  ```

**TSC-Radar nach 6.3:** 0 Errors.

**Verifikation AP6:**
1. `npx tsc --noEmit` → 0 Errors.
2. `Grep -n 'logService.renameRunBuffer' src/store/slices/` → darf **nur** im `renameRun`-Body (einmal) auftauchen.
3. `Grep -n 'state.runs.map(r => r.id === runId ? finalRun' src/store/slices/` → 0 Treffer in Call-Sites.
4. `Grep -n 'auditLog: state.auditLog.map' src/store/slices/runCrudSlice.ts` → 1 Treffer (in `renameRun`).
5. `Grep -n 'runPersistenceService.deleteRun' src/store/slices/runCrudSlice.ts` → 1 Treffer.
6. `Grep -n 'relatedLineIds: issue.relatedLineIds.map' src/store/slices/runCrudSlice.ts` → **1 Treffer** (V3, in `renameRun`).
7. `Grep -n 'affectedLineIds: issue.affectedLineIds.map' src/store/slices/runCrudSlice.ts` → **1 Treffer** (V3, in `renameRun`).

---

### AP7 — Fix-Hub mit Helper-Split (V2: verhindert reopenIssue-No-Op)

**Warum Split:** `autoResolveIssues` schließt **jedes** offene Issue, dessen `checkIssueStillActive` `false` liefert. Für `reopenIssue` mit Issue-Typ **ohne** begleitenden Line-Reset (siehe Phase V.2.e) wäre das Issue nach `set(status:'open')` sofort wieder `resolved` — **No-Op-Regression**.

**Lösung (architektonisch sauber, KISS):** Zwei Helper mit klarer semantischer Trennung.

#### Schritt 7.1 — `recalculateRunStats` in `helpers.ts`

**Position:** Nach `computeOrderStats` (Zeile 376).

```typescript
/**
 * PROJ-46 M4 AP7 — Stats-Only Recalc (für Mutationen, die autoResolve/Step5
 * NICHT triggern dürfen — z.B. reopenIssue). Aggregiert matchStats + orderStats
 * (expandedLineCount ist in matchStats bereits enthalten) und schreibt
 * run.stats + currentRun.stats in EINEM set().
 */
export function recalculateRunStats(
  runId: string,
  get: () => RunState,
  set: (partial: Partial<RunState> | ((s: RunState) => Partial<RunState>)) => void,
): void {
  const runLines = get().invoiceLines.filter(l => l.lineId.startsWith(`${runId}-line-`));
  const matchStats = computeMatchStats(runLines);
  const orderStats = computeOrderStats(runLines);
  set((state) => ({
    runs: state.runs.map(r =>
      r.id === runId ? { ...r, stats: { ...r.stats, ...matchStats, ...orderStats } } : r
    ),
    currentRun: state.currentRun?.id === runId
      ? { ...state.currentRun, stats: { ...state.currentRun.stats, ...matchStats, ...orderStats } }
      : state.currentRun,
  }));
}
```

#### Schritt 7.2 — `recalculateRunAfterMutation` in `helpers.ts`

**Position:** Direkt unterhalb `recalculateRunStats`.

```typescript
/**
 * PROJ-46 M4 AP7 — Fix-Hub: Stats + AutoResolve + Step-5 Issue-Regen.
 * KEIN Step-Status-Wechsel, KEIN advanceToNextStep (Baseline Punkt 4).
 * Aufruf-Bedingung: Action mutiert Lines UND möchte Follow-up-Kaskade.
 * NICHT aufrufen aus: reopenIssue (würde re-opened Issue sofort schließen).
 */
export function recalculateRunAfterMutation(
  runId: string,
  get: () => RunState,
  set: (partial: Partial<RunState> | ((s: RunState) => Partial<RunState>)) => void,
): void {
  recalculateRunStats(runId, get, set);
  const { issues, invoiceLines } = get();
  const resolved = autoResolveIssues(issues, invoiceLines, runId);
  if (resolved !== issues) set({ issues: resolved });
  get().generateStep5Issues(runId);
}
```

**Import-Ergänzung in `mutationSlice.ts` (Zeile 14-18):**

**Vorher (IST):**
```typescript
import {
  autoResolveIssues,
  computeMatchStats,
  computeOrderStats,
} from '@/store/internal/helpers';
```

**Nachher:**
```typescript
import {
  autoResolveIssues,
  computeMatchStats,
  computeOrderStats,
  recalculateRunStats,
  recalculateRunAfterMutation,
} from '@/store/internal/helpers';
```

**Hinweis:** `autoResolveIssues`, `computeMatchStats`, `computeOrderStats` bleiben im Import, weil einzelne Action-Bodies (z.B. `setManualArticleByPosition` Step2-Re-Eval, `reassignOrder` pre-set) sie weiter direkt nutzen. Nicht eigenmächtig entfernen.

**TSC-Radar AP7:** 0 Errors.

**Verifikation AP7:**
1. `npx tsc --noEmit` → 0 Errors.
2. `Grep 'recalculateRunStats\|recalculateRunAfterMutation' src/store/` → ≥ 4 Treffer (2 Definitionen + 2 Imports).

---

### AP8 — 5-Familien Action-Guards + Recalc-Einbau (V2: Matrix überarbeitet)

**Warum:** INVARIANTS A18 ist aktives Gesetz. Heute haben die Mutation-Actions keine Early-Returns — jede Mutation geht durch, egal ob der Run aktiv ist.

**Diskrepanz-Hinweis:** Baseline AP8 nennt 4 Familien, INVARIANTS A18 nennt 5 (inkl. `positionIndex-only`). V2 folgt A18 (aktives Gesetz > Baseline-Beschreibung). **Wenn Dom das anders will → HARTER STOPP vor 8.2.**

#### Schritt 8.1 — Guard-Familien-Matrix

| # | Action | Zeilen (IST) | Familie | Early-Return-Guard (wörtlich) |
|---|--------|--------------|---------|-------------------------------|
| 1 | `updateInvoiceLine(lineId, updates)` | 39-64 | F1 (lineId) | `const cr = get().currentRun; if (!cr || !lineId.startsWith(\`${cr.id}-line-\`)) return;` |
| 2 | `updatePositionLines(positionIndex, updates)` | 67-94 | F4 (positionIndex-only) | **bereits guarded** (Zeile 69) — KEIN neuer Guard |
| 3 | `refreshIssues(runId)` | 97-104 | F2 (runId) | `const cr = get().currentRun; if (!cr || runId !== cr.id) return;` |
| 4 | `reopenIssue(issueId)` | 107-192 | F5 (issueId) | Nach existierendem `if (!issueToReopen) return;` (Zeile 109): `const cr = get().currentRun; if (!cr || issueToReopen.runId !== cr.id) return;` |
| 5 | `confirmManualFix(issueId, note)` | 195-231 | F5 (issueId) | Nach existierendem Lookup (Zeilen 196-199): `const cr = get().currentRun; if (runId !== cr?.id) return;` |
| 6 | `bulkConfirmDraftIssues(runId)` | 234-307 | F2 (runId, Return-Objekt!) | `const cr = get().currentRun; if (!cr || runId !== cr.id) return { success: false, message: 'Run nicht aktiv.' };` |
| 7 | `setManualPrice(lineId, price)` | 309-348 | F1 (lineId) | `const cr = get().currentRun; if (!cr || !lineId.startsWith(\`${cr.id}-line-\`)) return;` |
| 8 | `setManualPriceByPosition(posIdx, price, runId)` | 351-396 | F3 (dual) | `const cr = get().currentRun; if (!cr || runId !== cr.id) return;` |
| 9 | `setManualArticleByPosition(posIdx, data, runId)` | 399-514 | F3 (dual) | `const cr = get().currentRun; if (!cr || runId !== cr.id) return;` |
| 10 | `setManualArticleByLine(lineId, data, runId)` | 517-614 | F3 (dual, lineId-Form) | `const cr = get().currentRun; if (!cr || runId !== cr.id || !lineId.startsWith(\`${runId}-line-\`)) return;` |
| 11 | `updateLineSerialData(posIdx, sR, sN, runId?)` | 616-687 | F3 (dual, optional runId) | Nach existierendem `if (!targetRunId) return;` (Zeile 619): `const cr = get().currentRun; if (!cr || targetRunId !== cr.id) return;` |
| 12 | `setManualOrder(lineId, orderYear, orderCode)` | 689-721 | F1 (lineId) | `const cr = get().currentRun; if (!cr || !lineId.startsWith(\`${cr.id}-line-\`)) return;` |
| 13 | `confirmNoOrder(lineId)` | 723-752 | F1 (lineId) | `const cr = get().currentRun; if (!cr || !lineId.startsWith(\`${cr.id}-line-\`)) return;` |
| 14 | `reassignOrder(lineId, newPosId, freeText)` | 754-842 | F1 (lineId) | Bestehender `if (!currentRun)` bleibt; **zusätzlich** nach `const runId = currentRun.id;` (Zeile 760): `if (!lineId.startsWith(\`${runId}-line-\`)) { console.warn('[RunStore] reassignOrder: lineId prefix mismatch'); return; }` |

#### Schritt 8.2 — Guards einsetzen (pro Action EIN Edit)

Für jede Action aus 8.1: den genannten Guard **als erste Code-Zeile** nach dem Action-Header einsetzen. Spezialfälle #4, #5, #11, #14 siehe Matrix-Spalte 5.

**TSC-Radar 8.2:** 0 Errors erwartet.

#### Schritt 8.3 — Recalc-Einbau-Matrix (V2)

| # | Action | Helper | Ersetzt Zeilen (IST) | Begründung |
|---|--------|--------|----------------------|------------|
| 1 | `updateInvoiceLine` | **Full-Hub** (`recalculateRunAfterMutation`) | 46-63 | UI-Edit, Kaskade inkl. Step-5 gewünscht. |
| 2 | `updatePositionLines` | **Full-Hub** | 79-93 | Bulk-Variante von #1. |
| 3 | `refreshIssues` | **Full-Hub** (ersetzt Body-Kern) | 98-103 (minus logService-Zeile) | Der Helper ersetzt eigenen `autoResolve`+`generateStep5Issues`-Body 1:1. `logService.info` bleibt nach dem Helper. |
| 4 | `reopenIssue` | **Stats-Only** (`recalculateRunStats`) | 172-190 (price-stats-Block) | **V2 Audit-Finding #1:** Full-Hub würde gerade re-opened Issue sofort wieder schließen. Siehe Phase V.2.e. |
| 5 | `confirmManualFix` | KEIN direkter Aufruf | — | Ruft bereits `refreshIssues(runId)` (Zeile 223), welches nach #3 den Full-Hub triggert. |
| 6 | `bulkConfirmDraftIssues` | KEIN direkter Aufruf | — | Ruft bereits `refreshIssues(runId)` (Zeile 299). |
| 7 | `setManualPrice` | **Full-Hub** | 329-347 | Preis-Stats sind in `matchStats` enthalten (V.2.a). |
| 8 | `setManualPriceByPosition` | **Full-Hub** | 377-395 | Analog #7. |
| 9 | `setManualArticleByPosition` | **Full-Hub** | 490-513 **teilweise** | Der `matchStats`-Block (Zeile 490-491) wird durch Helper ersetzt. **Step2-Status-Re-Eval** (Zeilen 492-512 mit `newStep2Status`) bleibt UNVERÄNDERT als eigener `set()`-Aufruf. Reihenfolge: erst Step2-Status-set, dann Full-Hub. |
| 10 | `setManualArticleByLine` | **Full-Hub** | 604-613 | KEIN Step-Status-Change in dieser Action. |
| 11 | `updateLineSerialData` | KEIN direkter Aufruf | — | Action hat eigene serialRequiredCount/serialMatchedCount-Berechnung (nicht in matchStats enthalten). Ruft bereits `refreshIssues(targetRunId)` (Zeile 686), was #3 ableitet. |
| 12 | `setManualOrder` | **Full-Hub** | 705-716 | Order-Stats via `orderStats`. |
| 13 | `confirmNoOrder` | **Full-Hub** | 736-747 | Analog #12. |
| 14 | `reassignOrder` | **Full-Hub** (nach bestehendem set) | 822-838 **teilweise** | Der vorhandene `set()` (822-838) schreibt zusätzlich `invoiceLines`, `issues: resolvedIssues`, `orderPool` → **BLEIBT**. Nur der Stats-Anteil (`runs.map({ …stats: { ...r.stats, ...orderStats } })` + `currentRun.stats`) wird durch Full-Hub-Aufruf **nach** dem bestehenden set ersetzt. `autoResolveIssues` wird in der Action bereits vorher (Zeile 821) gerufen — der nachfolgende Full-Hub-Aufruf ist idempotent dazu. |

**Mechaniker-Warnung #1:** Die Matrix bedeutet: pro Action gibt es genau **einen** Edit — Guard + Recalc-Ersatz in einem Schritt. Kein Doppel-Edit.

**Mechaniker-Warnung #2:** In Row 9 (`setManualArticleByPosition`) den `noMatchCount`-Block NICHT löschen — Step2-Status-Logik ist fachlich wichtig und der Full-Hub berechnet Step-Status **nicht**.

**Mechaniker-Warnung #3:** Row 4 (`reopenIssue`) nutzt **Stats-Only**, nicht Full-Hub. Wenn dein Edit `recalculateRunAfterMutation` in `reopenIssue` schreibt → STOPP, Finding #1 wird wieder reaktiviert.

**Dead-Code-Putz:** Nach 8.3 werden `computeMatchStats`/`computeOrderStats` in den meisten Actions unbenutzt. Row 9 und Row 14 halten sie noch live; Row 11 nutzt `computeMatchStats` nicht (nur manuelle Serial-Berechnung). **NICHT eigenmächtig Imports entfernen** (CLAUDE.md §3).

**TSC-Radar AP8:** 0 Errors erwartet.

**Verifikation AP8:**
1. `npx tsc --noEmit` → 0 Errors.
2. `Grep -c 'const cr = get().currentRun' src/store/slices/mutationSlice.ts` → ≥ 13 Treffer (alle Actions außer updatePositionLines).
3. `Grep -c 'recalculateRunAfterMutation' src/store/slices/mutationSlice.ts` → ≥ 9 (Import + 8 Einbauten laut Matrix: #1,#2,#3,#7,#8,#9,#10,#12,#13,#14 = 10 − 1 Import-Nicht-Zähl = ≥ 10, konservativ ≥ 9).
4. `Grep -c 'recalculateRunStats' src/store/slices/mutationSlice.ts` → ≥ 2 (Import + 1 Einbau in reopenIssue).

---

### AP9 — Pause-Check in `retryStep` UND `executeStep4Orchestration` (V2: luftdicht)

**Warum V2:** Wrapper-Pause-Checks (V1) schützen das **Betreten** des async-Pfads, aber `executeStep4Orchestration` hat **intern** zwei awaits, nach denen keine Pause-Prüfung steht. Wenn der User nach Check-2 aber vor `loadRun`/`parseOrderFile` pausiert, läuft die Order-Mapping-Engine blind weiter.

**KISS-Lösung:** 2 inline Pause-Checks in `helpers.ts:executeStep4Orchestration`, kein neues Helper-Pattern.

#### Schritt 9.1 — Entry-Pause-Check in `retryStep`

**Position:** `workflowSlice.ts:253` (Zeile direkt nach `retryStep: (runId: string, stepNo: number) => {`).

**Einzufügen (neuer ERSTER Code-Block der Action):**
```typescript
    if (get().isPaused) {
      logService.warn(`Retry abgelehnt: Run ist pausiert`, { runId, step: 'System' });
      return;
    }
```

#### Schritt 9.2 — Inner-Loop-Pause-Check in `retryStep` case 3

**Position:** `workflowSlice.ts:295`.

**Vorher (IST):**
```typescript
              () => false,
              () => get().executeMatcherSerialExtract(),
```

**Nachher:**
```typescript
              () => get().isPaused,
              () => get().executeMatcherSerialExtract(),
```

#### Schritt 9.3 — Case 2 und Case 4 in `retryStep`: 2-Check-Schablone

**Case 2 (workflowSlice.ts:270-286) — Nachher:**
```typescript
      case 2:
        void (async () => {
          try {
            if (get().isPaused) return;                     // NEU: Check 1
            const guard = await runStepGuard(2, runId, get, set);
            if (get().isPaused) return;                     // NEU: Check 2 nach async Guard
            if (guard.blockReason) {
              logService.error(`[StepGuard] Retry Step 2 blockiert: ${guard.blockReason}`, { runId, step: 'Artikel extrahieren' });
              get().updateStepStatus(runId, 2, 'failed');
              return;
            }
            get().executeMatcherCrossMatch();
          } catch (err) {
            console.error('[retryStep] Step 2 wrapper failed:', err);
            get().updateStepStatus(runId, 2, 'failed');
          }
        })();
        break;
```

**Case 4 (workflowSlice.ts:320-335) — Nachher:**
```typescript
      case 4:
        void (async () => {
          try {
            if (get().isPaused) return;                     // NEU: Check 1
            const guard = await runStepGuard(4, runId, get, set);
            if (get().isPaused) return;                     // NEU: Check 2 nach async Guard
            if (guard.blockReason) {
              logService.error(`[StepGuard] Retry Step 4 blockiert: ${guard.blockReason}`, { runId, step: 'Bestellungen mappen' });
              get().updateStepStatus(runId, 4, 'failed');
              return;
            }
            await executeStep4Orchestration(runId, get, set);
          } catch (err) {
            console.error('[retryStep] Step 4 wrapper failed:', err);
            get().updateStepStatus(runId, 4, 'failed');
          }
        })();
        break;
```

#### Schritt 9.4 — Kommentar-Pflege (veralteter BIT-IDENTISCH-Block)

**Position:** `workflowSlice.ts:288-290`.

**Entfernen:**
```typescript
        // PROJ-46 AP2: Guard-Execute-Kern via runStepCore.
        // v1.3 BIT-IDENTISCH: KEIN Pause-Check (pauseCheck = () => false) — entspricht heutigem Verhalten
        // (runStore.ts:2087 historisch). Pause-in-Retry-Härtung ist separater Vorschlag (Sektion B, INVARIANTS), NICHT Iteration 1.
```

**Ersetzen durch:**
```typescript
        // PROJ-46 M4 AP9: Guard-Execute-Kern via runStepCore MIT Pause-Check —
        // symmetrisch zum advanceToNextStep-Pfad. Verhindert, dass ein pausierter
        // Run durch UI-Retry-Klick unbemerkt weiterläuft.
```

#### Schritt 9.5 — `executeStep4Orchestration` luftdicht machen (V2 Kern-Fix)

**Datei:** `src/store/internal/helpers.ts`. Beide Checks sind je **eine Zeile**, direkt nach dem jeweiligen `await`.

**Check A — nach `loadRun` (heute Zeile 545):**

**Vorher (IST, Zeilen 544-547):**
```typescript
  if (activeMapper === 'engine-proj-23') {
    // PROJ-49 SSOT 12a: parsedOrders aus IDB für SSOT-Runs
    const idbData = await runPersistenceService.loadRun(runId);
    const isSSoTRun = !!idbData?.ingestStatus;
```

**Nachher:**
```typescript
  if (activeMapper === 'engine-proj-23') {
    // PROJ-49 SSOT 12a: parsedOrders aus IDB für SSOT-Runs
    const idbData = await runPersistenceService.loadRun(runId);
    if (get().isPaused) return;                   // PROJ-46 M4 AP9 — Pause-Check nach await
    const isSSoTRun = !!idbData?.ingestStatus;
```

**Check B — nach `parseOrderFile` (heute Zeile 577):**

**Vorher (IST, Zeilen 574-580):**
```typescript
    const openWEFile = cs.uploadedFiles.find(f => f.type === 'openWE');
    if (openWEFile?.file) {
      const { parseOrderFile } = await import('@/services/matching/orderParser');
      const runConfig = cs.currentRun?.config ?? cs.globalConfig;
      const parseResult = await parseOrderFile(openWEFile.file, {
        profileId: runConfig.activeOrderParserProfileId ?? DEFAULT_ORDER_PARSER_PROFILE_ID,
        overrides: runConfig.orderParserProfileOverrides,
      });
```

**Nachher (Check unmittelbar nach `parseResult`-Zuweisung, VOR dem ersten Warn-Log-Block):**
```typescript
      const parseResult = await parseOrderFile(openWEFile.file, {
        profileId: runConfig.activeOrderParserProfileId ?? DEFAULT_ORDER_PARSER_PROFILE_ID,
        overrides: runConfig.orderParserProfileOverrides,
      });
      if (get().isPaused) return;                 // PROJ-46 M4 AP9 — Pause-Check nach await
```

**Keine weiteren Checks nötig:** Der dynamische `await import(...)` (Zeile 576) liefert nur das Modul, keinen Daten-Fetch; ein Pause-Check dort würde ins UX-Niemandsland verlegt (Pause während Code-Ladens ist unwahrscheinlich und harmlos).

**TSC-Radar AP9:** 0 Errors.

**Verifikation AP9 (V3 korrigiert — exakte Zielwerte aus IST-Zählung):**

**IST-Zählung `get().isPaused`** (gemessen 2026-04-20 via `Grep -c 'get\(\)\.isPaused'`):
- `src/store/slices/workflowSlice.ts` → **10** Treffer (Zeilen 80, 151, 153, 176, 206, 208, 235, 309, 517, 529).
- `src/store/internal/helpers.ts` → **3** Treffer (Zeilen 553, 680, 688).

**Delta durch AP9:**
- workflowSlice.ts: +1 (9.1 Entry in retryStep) + 1 (9.2 case 3: `() => false` → `() => get().isPaused`) + 2 (9.3 case 2: Check 1 + Check 2) + 2 (9.3 case 4: Check 1 + Check 2) = **+6**.
- helpers.ts: +1 (9.5 Check A nach `loadRun`) + 1 (9.5 Check B nach `parseOrderFile`) = **+2**.

**Zielwerte nach AP9:**
1. `npx tsc --noEmit` → 0 Errors.
2. `Grep -c 'get().isPaused' src/store/slices/workflowSlice.ts` → **16** (IST 10 + 6).
3. `Grep -c 'get().isPaused' src/store/internal/helpers.ts` → **5** (IST 3 + 2).
4. `Grep 'BIT-IDENTISCH' src/store/slices/workflowSlice.ts` → **0** Treffer (Kommentar in 9.4 ersetzt).
5. `Grep -c '() => false' src/store/slices/workflowSlice.ts` → mindestens **1 Treffer weniger** als im IST (case-3-pauseCheck-Literal entfernt; andere `() => false`-Vorkommen außerhalb des Retry-Scopes bleiben).

---

### AP10 — UI-Sync / AutoSave-Timing Härtung (V4: inkl. Doppel-Flush-Guard)

**Warum:** Drei schlafende Bugs:
1. **Stale-Run-Bug:** Timer liest `currentRun.id` bei fire-time → Run-Wechsel im 2s-Window speichert alten Payload unter neuer ID.
2. **Kein Tab-Close-Flush:** Unmount-Flush greift nur bei React-Unmount, nicht bei Tab-Close/Reload.
3. **Doppel-Flush-Risiko (V4):** Der neue `pagehide`-Handler (10.2) und der bestehende React-Unmount-Flush (IST Zeilen 86-103) feuern bei Tab-Close beide nacheinander und würden ohne Guard denselben Payload zweimal in IDB schreiben.

#### Schritt 10.1 — Stale-Run-Fix: RunId bei Subscribe einfrieren

**Position:** `useRunAutoSave.ts:40-84`.

**Nachher (Subscribe-Callback ersetzt Zeilen 40-84 komplett):**

```typescript
    const unsubscribe = useRunStore.subscribe((state, prev) => {
      if (!state.currentRun) return;

      const currentRunId = state.currentRun.id;

      // V2: Run-Wechsel im Debounce-Fenster → Flush pending für old run
      if (timerRef.current && lastRunIdRef.current && lastRunIdRef.current !== currentRunId) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        const staleRunId = lastRunIdRef.current;
        const stalePayload = buildAutoSavePayload(staleRunId);
        if (stalePayload) {
          runPersistenceService.saveRun(stalePayload).catch(err => {
            console.error('[AutoSave] Run-switch flush failed:', err);
          });
        }
      }

      lastRunIdRef.current = currentRunId;

      if (
        state.currentRun === prev.currentRun &&
        state.invoiceLines === prev.invoiceLines &&
        state.issues === prev.issues &&
        state.auditLog === prev.auditLog &&
        state.parsedInvoiceResult === prev.parsedInvoiceResult &&
        state.serialDocument === prev.serialDocument &&
        state.currentParsedRunId === prev.currentParsedRunId &&
        state.parsedPositions === prev.parsedPositions &&
        state.parserWarnings === prev.parserWarnings &&
        state.preFilteredSerials === prev.preFilteredSerials
      ) {
        return;
      }

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        // Captured currentRunId aus Closure (nicht live state)
        const payload = buildAutoSavePayload(currentRunId);
        if (payload) {
          runPersistenceService.saveRun(payload).catch(err => {
            console.error('[AutoSave] Failed to save run:', err);
          });
        }
      }, DEBOUNCE_MS);
    });
```

#### Schritt 10.2 — Tab-Close-Flush via `pagehide` (mit Consume-Guard)

**Position:** Neuer `useEffect` direkt unter dem bestehenden (nach `}, []);` Zeile 104).

**V4-Hinweis:** Die **drei** neuen Zeilen gegenüber V3 sind markiert — sie implementieren den Doppel-Flush-Guard aus Schritt 10.3.

```typescript
  // PROJ-46 M4 AP10 — Tab-Close-Flush via pagehide (modern, iOS-safe).
  // V4: Consume-Pattern — lastRunIdRef.current = null nach Capture, damit der
  // nachfolgende React-Unmount-Cleanup (IST Zeilen 86-103) bei Tab-Close nicht
  // denselben Payload ein zweites Mal in IDB schreibt.
  useEffect(() => {
    const flushOnHide = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const runId = lastRunIdRef.current;
      if (!runId) return;
      lastRunIdRef.current = null;                     // V4 CONSUME-GUARD
      const payload = buildAutoSavePayload(runId);
      if (payload) {
        runPersistenceService.saveRun(payload).catch(err => {
          console.error('[AutoSave] pagehide flush failed:', err);
        });
      }
    };
    window.addEventListener('pagehide', flushOnHide);
    return () => {
      window.removeEventListener('pagehide', flushOnHide);
    };
  }, []);
```

**INVARIANTS-Compliance:** A15 (Mount-Effekte ohne reaktive Store-Deps) — leeres Dep-Array, nur `useRef`-Werte (nicht-reaktiv) gelesen.

#### Schritt 10.3 — Consume-Guard im bestehenden Unmount-Flush (V4 — Doppel-Flush-Fix)

**Warum:** Bei Tab-Close feuern `pagehide` (Browser) UND der React-Unmount-Cleanup (IST Zeilen 86-103) kurz nacheinander. Ohne Guard lesen beide denselben `lastRunIdRef.current`, bauen zweimal den **identischen** `payload` via `buildAutoSavePayload(runId)` und schreiben zweimal `runPersistenceService.saveRun(payload)` in die IDB. Zwar schreibfelduell idempotent, aber: (a) doppelte Fehler-Logs, (b) IDB-Transaktionsrace mit evtl. anderen Schreibern, (c) verschwendete I/O beim Tab-Close-Stress. KISS-Neutralisierung: Derselbe Consume-Pattern wie in 10.2 auch im IST-Cleanup.

**Position:** `useRunAutoSave.ts:86-103` — die IST-Cleanup-Funktion des bestehenden `useEffect`.

**Vorher (IST — Zeilen 86-103):**
```typescript
    return () => {
      unsubscribe();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;

        // PROJ-40 ADD-ON-3: Flush — pending Save sofort ausfuehren
        const runId = lastRunIdRef.current;
        if (runId) {
          const payload = buildAutoSavePayload(runId);
          if (payload) {
            runPersistenceService.saveRun(payload).catch(err => {
              console.error('[AutoSave] Flush on unmount failed:', err);
            });
          }
        }
      }
    };
```

**Nachher (V4 — 1 neue Zeile eingefügt):**
```typescript
    return () => {
      unsubscribe();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;

        // PROJ-40 ADD-ON-3: Flush — pending Save sofort ausfuehren
        // PROJ-46 M4 AP10 V5: Consume-Guard gegen Doppel-Flush beim Tab-Close.
        const runId = lastRunIdRef.current;
        if (runId) {
          lastRunIdRef.current = null;                 // V4 CONSUME-GUARD
          const payload = buildAutoSavePayload(runId);
          if (payload) {
            runPersistenceService.saveRun(payload).catch(err => {
              console.error('[AutoSave] Flush on unmount failed:', err);
            });
          }
        }
      }
    };
```

**Laufzeitverhalten nach V4 (Szenarien):**

| Szenario | Reihenfolge | Verhalten |
|----------|-------------|-----------|
| Tab-Close (`pagehide` feuert zuerst, dann React-Cleanup) | pagehide → flushOnHide capturet runId, setzt Ref `null`, saveRun. Danach React-Cleanup: `runId = lastRunIdRef.current === null` → `if (runId)` false → **kein zweiter Flush**. | ✅ Genau 1 saveRun |
| SPA-Route-Wechsel (nur React-Unmount, kein pagehide) | React-Cleanup capturet runId, setzt Ref `null`, saveRun. | ✅ Genau 1 saveRun |
| Harter Browser-Kill (nur pagehide, React-Cleanup läuft nicht mehr) | pagehide feuert, saveRun gestartet, dann Prozess-Ende. React-Cleanup wird ausgelassen. | ✅ Genau 1 saveRun (best effort) |
| Re-Mount ohne Store-Change | `lastRunIdRef.current` ist `null` nach Consume. Die nächste Store-Änderung initialisiert die Ref wieder via Zeile 46 (`lastRunIdRef.current = state.currentRun.id;`). | ✅ Kein Side-Effect |

**KISS-Begründung:** Null-Setzen einer bereits vorhandenen `useRef` ist 1 Zeile pro Flush. Kein neuer `useRef`, kein neuer State, kein Mutex. Der Guard nutzt das bestehende Null-Check-Pattern (`if (runId)` bzw. `if (!runId) return;`), das in beiden Flushes eh schon steht.

**INVARIANTS-Compliance:** A15 weiter eingehalten — keine reaktiven Store-Deps. Das Nullen der Ref ist eine **lokale** React-Ref-Operation ohne Store-Seiteneffekt. Der Subscribe-Callback (Schritt 10.1) re-initialisiert `lastRunIdRef.current` bei der nächsten Store-Änderung (IST-Zeile 45 bleibt im ersetzten Block: `lastRunIdRef.current = currentRunId;`).

**TSC-Radar AP10:** 0 Errors.

**Verifikation AP10 (V4 korrigiert):**
1. `npx tsc --noEmit` → 0 Errors.
2. `Grep -c 'pagehide' src/hooks/useRunAutoSave.ts` → **4** (1 Kommentar in 10.2-Block + 1 Log-String + 1 `addEventListener` + 1 `removeEventListener`). V4-Korrektur gegenüber V3, das fälschlich „2" sagte.
3. `Grep -c 'currentRunId' src/hooks/useRunAutoSave.ts` → **≥ 3** (Declare + Run-Switch-Compare + Timer-Closure-Arg; genauer Wert aus Schritt 10.1-Block: 4 Vorkommen — `const currentRunId`, Compare `!== currentRunId`, Assignment `lastRunIdRef.current = currentRunId`, Timer `buildAutoSavePayload(currentRunId)`).
4. `Grep -c 'lastRunIdRef.current = null' src/hooks/useRunAutoSave.ts` → **2** (V4: je ein Consume-Guard in 10.2 und 10.3).

---

## SEKTION C — Abschluss-Routine nach jedem AP

Nach **jedem** AP (6 → 7 → 8 → 9 → 10):
- [ ] `npx tsc --noEmit` → MUSS 0 Errors. Bei Fehler: STOPP, Dom fragen.
- [ ] Grep-Verifikation aus der jeweiligen AP-Sektion.
- [ ] **Kein** Commit ohne Dom-Freigabe.
- [ ] Neue Erkenntnisse: Sektion „Neue Vorschläge" unten, NICHT direkt in I.md/C.md A.

---

## PHASE V — CODE-VALIDIERUNG (V2: vertieft)

**Zweck:** Beweis per wörtlichem IST-Zitat, dass dieser Plan auf dem realen Code steht (INVARIANTS A12). Alle Zitate stammen aus Datei-Reads am 2026-04-20.

### V.1 — AP6 Referenzen (Rename + auditLog + IDB)

**V.1.a) `src/store/slices/ingestSlice.ts:313-332` — SSOT-Variante (ohne auditLog!):**
```typescript
      const parsedRunIdShouldFollow = get().currentParsedRunId === runId;
      set((state) => {
        const updatedRun = state.runs.find(r => r.id === runId);
        if (!updatedRun) return state;
        const finalRun = { ...updatedRun, id: newRunId };
        const oldPrefix = `${runId}-line-`;
        const newPrefix = `${newRunId}-line-`;
        return {
          runs: state.runs.map(r => r.id === runId ? finalRun : r),
          currentRun: finalRun,
          invoiceLines: state.invoiceLines.map(l =>
            l.lineId.startsWith(oldPrefix) ? { ...l, lineId: l.lineId.replace(oldPrefix, newPrefix) } : l
          ),
          issues: state.issues.map(i => i.runId === runId ? { ...i, runId: newRunId } : i),
        };
      });
      if (parsedRunIdShouldFollow) {
        get().assignParsedRunId(newRunId);
      }
      logService.renameRunBuffer(runId, newRunId);
```
**Gap-Beweis:** `auditLog` fehlt im Return-Objekt → Audit-Einträge der Pre-Rename-Phase bleiben mit alter `runId` stehen.

**V.1.b) `runCrudSlice.ts:362-386` — Erfolgspfad (auch ohne auditLog):**
```typescript
          // Update run ID + rename invoiceLine lineIds to match new runId
          set((state) => {
            const updatedRun = state.runs.find(r => r.id === runId);
            if (updatedRun) {
              const finalRun = { ...updatedRun, id: newRunId };
              const oldPrefix = `${runId}-line-`;
              const newPrefix = `${newRunId}-line-`;
              return {
                runs: state.runs.map(r => r.id === runId ? finalRun : r),
                currentRun: finalRun,
                invoiceLines: state.invoiceLines.map(l =>
                  l.lineId.startsWith(oldPrefix)
                    ? { ...l, lineId: l.lineId.replace(oldPrefix, newPrefix) }
                    : l
                ),
                issues: state.issues.map(issue =>
                  issue.runId === runId ? { ...issue, runId: newRunId } : issue
                ),
              };
            }
            return state;
          });

          // Rename log buffer to match new runId
          logService.renameRunBuffer(runId, newRunId);
          runId = newRunId;
```

**V.1.c) `src/store/types.ts:77` — auditLog-Typ-Existenzbeweis:**
```typescript
  auditLog: AuditLogEntry[];
```
(Gegrepped aus `store/types.ts` — Feld existiert, besitzt `runId` via Entry-Struktur.)

**V.1.c') `src/store/slices/ingestSlice.ts:593-597` — Beweis, dass `auditLog` **anderswo** per `runId` gefiltert wird (cleanupFailedIngest):**
```typescript
      // 2. auditLog + Run + invoiceLines + issues aus In-Memory-Store entfernen
      set((state) => ({
        runs:         state.runs.filter(r => r.id !== runId),
        currentRun:   state.currentRun?.id === runId ? null : state.currentRun,
        auditLog:     state.auditLog.filter(a => a.runId !== runId),
```
**Folgerung:** `AuditLogEntry.runId` existiert → Migration ist syntaktisch trivial.

**V.1.d) `src/store/slices/persistenceSlice.ts:250` — Beweis, dass `runPersistenceService.deleteRun` existiert:**
```typescript
    const success = await runPersistenceService.deleteRun(runId);
```
Referenzierte weitere Stelle: `src/components/SettingsPopup.tsx:628`:
```typescript
        const ok = await runPersistenceService.deleteRun(run.id);
```
**Folgerung:** `deleteRun(id): Promise<boolean>` ist öffentliche Schnittstelle und darf von `renameRun` genutzt werden (Signatur `(id: string) => Promise<boolean>` bewiesen).

**V.1.e) V3 Audit-Finding #1 — Issue-Line-Referenzen sind run-präfix-gebunden:**

**Beweis 1 — Issue-Typ (types/index.ts:380-406):**
```typescript
export interface Issue {
  id: string;
  runId?: string;
  severity: IssueSeverity;
  stepNo: number;
  type: IssueType;
  message: string;
  details: string;
  relatedLineIds: string[];          // PROJ-21: for jump-link navigation + auto-resolve — DO NOT CHANGE
  affectedLineIds: string[];         // PROJ-37: descriptive list for UI rendering only
  status: 'open' | 'pending' | 'resolved';
  ...
}
```
`context`-Feld (Zeile 395-402) enthält `positionIndex`, `field`, `expectedValue`, `actualValue`, `candidates` — **keine** lineId-Strings → keine Migration nötig.

**Beweis 2 — Line-ID-Konstruktion mit run-präfix (`helpers.ts:129-130`):**
```typescript
    relatedLineIds: warning.positionIndex ? [`${runId}-line-${warning.positionIndex}`] : [],
    affectedLineIds: warning.positionIndex ? [`${runId}-line-${warning.positionIndex}`] : [],
```
Identisches Muster auf Zeilen 151-152 (soft-fail issues), 393-394 (article-match issues), sowie in `services/matching/matchingEngine.ts:84-85,112-113,145-146` und `services/matching/orderMapper.ts:346-347,371-372,392-393,415`.

**Beweis 3 — exakter Set-Match gegen `invoiceLines.lineId` in `reopenIssue` (`mutationSlice.ts:115-116`):**
```typescript
      if (issueToReopen.type === 'price-mismatch' && issueToReopen.affectedLineIds?.length) {
        const affectedSet = new Set(issueToReopen.affectedLineIds);
        const affectedPositions = new Set(
          state.invoiceLines
            .filter(l => affectedSet.has(l.lineId))        // EXAKT-Match erforderlich
            .map(l => l.positionIndex),
        );
```
Und in `confirmManualFix` (`mutationSlice.ts:203-205`):
```typescript
    const affectedSet = new Set(issue.relatedLineIds ?? []);
    const affectedPositions = new Set(
      allLines.filter(l => affectedSet.has(l.lineId)).map(l => l.positionIndex),
    );
```
Und `bulkConfirmDraftIssues` (`mutationSlice.ts:289-293`):
```typescript
    const issuesToResolve = runIssues.filter(i =>
      (i.relatedLineIds ?? []).some(lid => {
        const line = runLines.find(l => l.lineId === lid);
        return line && draftPositions.has(line.positionIndex);
      })
    );
```

**Daten-Leck-Beweis:** Alle drei Funktionen machen einen **exakten** lineId-Vergleich. Nach einem Rename tragen `invoiceLines` den neuen Präfix, aber die unmigrierten `relatedLineIds`/`affectedLineIds` tragen den alten → `affectedSet.has(l.lineId)` liefert konstant `false` → Funktionen werden zum No-Op. Die V3-Migration in `renameRun` (Schritt 6.2) schließt diese Lücke durch `.map(id => id.replace(oldPrefix, newPrefix))` für beide Arrays — dieselbe Logik wie bei `invoiceLines.lineId`.

### V.2 — AP7 Referenzen (Helper-Split)

**V.2.a) `helpers.ts:346-363` — `computeMatchStats` (expandedLineCount enthalten):**
```typescript
export function computeMatchStats(lines: InvoiceLine[]): Partial<RunStats> {
  return {
    expandedLineCount: lines.length,
    fullMatchCount: lines.filter(l => l.matchStatus === 'full-match').length,
    ...
    priceOkCount: lines.filter(l => l.priceCheckStatus === 'ok').length,
    priceMismatchCount: lines.filter(l => l.priceCheckStatus === 'mismatch').length,
    priceMissingCount: lines.filter(l => l.priceCheckStatus === 'missing').length,
    priceCustomCount: lines.filter(l => l.priceCheckStatus === 'custom').length,
  };
}
```

**V.2.b) `helpers.ts:368-376` — `computeOrderStats`:**
```typescript
export function computeOrderStats(lines: InvoiceLine[]): Partial<RunStats> {
  return {
    matchedOrders: lines.filter(
      l => l.orderAssignmentReason !== 'pending' && l.orderAssignmentReason !== 'not-ordered'
    ).length,
    notOrderedCount: lines.filter(l => l.orderAssignmentReason === 'not-ordered').length,
    manualOkOrderCount: lines.filter(l => l.orderAssignmentReason === 'manual-ok').length,
  };
}
```

**V.2.c) `helpers.ts:323-341` — `autoResolveIssues`:**
```typescript
export function autoResolveIssues(issues: Issue[], lines: InvoiceLine[], runId: string): Issue[] {
  let changed = false;
  const result = issues.map(issue => {
    if (issue.status !== 'open' || issue.runId !== runId) return issue;

    const stillActive = checkIssueStillActive(issue, lines);
    if (!stillActive) {
      changed = true;
      return {
        ...issue,
        status: 'resolved' as const,
        resolvedAt: new Date().toISOString(),
        resolutionNote: 'Automatisch gelöst durch manuelle Korrektur',
      };
    }
    return issue;
  });
  return changed ? result : issues;
}
```
**Semantik-Beweis:** Filter `issue.status !== 'open'` → nur offene Issues werden geprüft. Ein gerade re-opened Issue (status: 'open') **würde** durch diesen Helper gehen.

**V.2.d) `helpers.ts:213-265` — `checkIssueStillActive` (entscheidet, ob ein Issue closed wird):**
```typescript
export function checkIssueStillActive(issue: Issue, lines: InvoiceLine[]): boolean {
  if (issue.relatedLineIds.length === 0) return true;
  const related = resolveIssueLines(issue.relatedLineIds, lines, false);
  if (related.length === 0) return true;

  switch (issue.type) {
    case 'price-mismatch':
      return related.some(l => l.priceCheckStatus === 'mismatch' || (l.priceCheckStatus === 'custom' && l.manualStatus === 'draft'));

    case 'no-article-match':
    case 'match-artno-not-found':
    case 'match-ean-not-found':
      return related.some(l => l.matchStatus === 'no-match' || l.manualStatus === 'draft');

    case 'match-conflict-id':
    case 'match-ambiguous':
      return related.some(l => l.matchStatus === 'no-match' || l.matchStatus === 'pending' || l.manualStatus === 'draft');

    case 'supplier-missing':
      return related.some(l => !l.supplierId || !/^\d{5}$/.test(l.supplierId));

    case 'serial-mismatch':
    case 'sn-insufficient-count':
      return related.some(l => (l.serialRequired && l.serialNumbers.length < l.qty) || l.manualStatus === 'draft');

    case 'order-no-match':
      return related.some(l => l.orderAssignmentReason === 'not-ordered' || l.orderAssignmentReason === 'pending');

    case 'order-incomplete': {
      return related.some(l => {
        const allocated = l.allocatedOrders.reduce((s, a) => s + a.qty, 0);
        return allocated > 0 && allocated < l.qty;
      });
    }

    case 'inactive-article':
      return related.some(l => l.activeFlag === false);

    default:
      return true;
  }
}
```

**V.2.e) `mutationSlice.ts:107-192` — `reopenIssue` komplett (Beweis der fachlichen Absicht):**
```typescript
  reopenIssue: (issueId) => {
    const issueToReopen = get().issues.find(i => i.id === issueId);
    if (!issueToReopen) return;

    set((state) => {
      let updatedLines = state.invoiceLines;

      // PROJ-44-R10: Bei price-mismatch die betroffenen Zeilen zurücksetzen
      if (issueToReopen.type === 'price-mismatch' && issueToReopen.affectedLineIds?.length) {
        const affectedSet = new Set(issueToReopen.affectedLineIds);
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
            ? { ...line, priceCheckStatus: 'mismatch' as const, unitPriceFinal: null, manualStatus: undefined }
            : line
        );
      }

      // PROJ-46: Bei Artikel-Issues confirmed→draft zurückstufen (kein Full-Reset)
      const articleIssueTypes = ['no-article-match', 'match-artno-not-found', 'match-ean-not-found'];
      if (articleIssueTypes.includes(issueToReopen.type)) {
        const affIds = new Set(issueToReopen.affectedLineIds ?? issueToReopen.relatedLineIds ?? []);
        const affPos = new Set(
          state.invoiceLines.filter(l => affIds.has(l.lineId)).map(l => l.positionIndex),
        );
        const runPfx = issueToReopen.runId + '-';
        updatedLines = updatedLines.map(line =>
          line.lineId.startsWith(runPfx)
            && affPos.has(line.positionIndex)
            && line.manualStatus === 'confirmed'
            ? { ...line, manualStatus: 'draft' as const }
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

**No-Op-Beweis (Finding #1):** Bei Issue-Typen ohne Line-Reset — z.B. `serial-mismatch`, `order-no-match`, `inactive-article` — bleibt nach `reopenIssue` der Line-State unverändert. `checkIssueStillActive` liefert dann `false` (weil z.B. `serialNumbers.length >= qty` oder `orderAssignmentReason === 'manual-ok'`), und `autoResolveIssues` würde das soeben re-opened Issue sofort wieder auf `resolved` setzen. **Daher Stats-Only-Helper, nicht Full-Hub.**

**V.2.f) `mutationSlice.ts:97-104` — `refreshIssues` (Auto-Resolve + Step5):**
```typescript
  refreshIssues: (runId) => {
    const { invoiceLines, issues } = get();
    const lines = invoiceLines.filter(l => l.lineId.startsWith(runId));
    const resolved = autoResolveIssues(issues, lines, runId);
    if (resolved !== issues) set({ issues: resolved });
    get().generateStep5Issues(runId);
    logService.info('Issues aktualisiert', { runId, step: 'Issues' });
  },
```
**Hinweis für Matrix Row #3:** Der Body (Zeilen 98-103, minus logService) wird **komplett** durch `recalculateRunAfterMutation(runId, get, set)` ersetzt. Das `logService.info` bleibt am Ende.

### V.3 — AP8 Referenzen (14 Action-Signaturen)

(Zitate identisch zu V1 — gekürzt, nur die Signatur-Zeilen:)

- `updateInvoiceLine:` mutationSlice.ts:39 — `updateInvoiceLine: (lineId, updates) => {`
- `updatePositionLines:` :67 — `updatePositionLines: (positionIndex, updates) => {` (+ bestehender Guard Zeile 69 `if (!currentRun) return;`)
- `refreshIssues:` :97 — `refreshIssues: (runId) => {`
- `reopenIssue:` :107 — `reopenIssue: (issueId) => {`
- `confirmManualFix:` :195 — `confirmManualFix: (issueId, resolutionNote) => {`
- `bulkConfirmDraftIssues:` :234 — `bulkConfirmDraftIssues: (runId) => {` (Return-Typ `{ success, message }` bewiesen Zeile 243)
- `setManualPrice:` :309 — `setManualPrice: (lineId, price) => {`
- `setManualPriceByPosition:` :351 — `setManualPriceByPosition: (positionIndex, price, runId) => {`
- `setManualArticleByPosition:` :399 — `setManualArticleByPosition: (positionIndex, data, runId) => {`
- `setManualArticleByLine:` :517 — `setManualArticleByLine: (lineId, data, runId) => {`
- `updateLineSerialData:` :616 — `updateLineSerialData: (positionIndex, serialRequired, serialNumbers, runId?) => {` (+ bestehender Guard Zeile 618-619 `const targetRunId = runId ?? currentRun?.id; if (!targetRunId) return;`)
- `setManualOrder:` :689 — `setManualOrder: (lineId, orderYear, orderCode) => {`
- `confirmNoOrder:` :723 — `confirmNoOrder: (lineId) => {`
- `reassignOrder:` :754 — `reassignOrder: (lineId, newOrderPositionId, freeText) => {` (+ bestehender Guard Zeilen 756-759)

**Step2-Re-Eval in Row #9 — `mutationSlice.ts:489-513` (BLEIBT):**
```typescript
    // Match-Stats + Step2-Status re-evaluieren
    const runLines = get().invoiceLines.filter(l => l.lineId.startsWith(runId));
    const matchStats = computeMatchStats(runLines);
    const noMatchCount = matchStats.noMatchCount ?? 0;
    const newStep2Status: StepStatus = noMatchCount > 0 ? 'failed' : 'ok';

    set((state) => ({
      runs: state.runs.map(r =>
        r.id === runId
          ? {
              ...r,
              stats: { ...r.stats, ...matchStats },
              steps: r.steps.map(s => s.stepNo === 2 ? { ...s, status: newStep2Status } : s),
            }
          : r
      ),
      currentRun: state.currentRun?.id === runId
        ? {
            ...state.currentRun,
            stats: { ...state.currentRun.stats, ...matchStats },
            steps: state.currentRun.steps.map(s => s.stepNo === 2 ? { ...s, status: newStep2Status } : s),
          }
        : state.currentRun,
    }));
```
**Einbau-Hinweis:** Nach diesem `set()` wird `recalculateRunAfterMutation(runId, get, set)` aufgerufen. Der Helper überschreibt `stats` mit dem vollen Aggregat — Step2-Status bleibt unangetastet (Helper schreibt `run.stats` ohne `steps`).

### V.4 — AP9 Referenzen (Pause-Awareness)

**V.4.a) `workflowSlice.ts:253-266` — `retryStep` Header (IST, kein Pause-Check):**
```typescript
  retryStep: (runId: string, stepNo: number) => {
    const state = get();
    const run = state.runs.find(r => r.id === runId);
    if (!run) return;

    const step = run.steps.find(s => s.stepNo === stepNo);
    if (!step || step.status !== 'failed') return;

    logService.info(`Retry: Step ${stepNo} (${step.name})`, { runId, step: step.name });

    // Reset step + run status
    get().updateStepStatus(runId, stepNo, 'running');
    get().updateRunStatus(runId, 'running');
```

**V.4.b) `workflowSlice.ts:291-298` — retryStep case 3 (hardcoded `() => false`):**
```typescript
        void (async () => {
          try {
            const r = await runStepCore(
              3, runId, get, set,
              () => false,
              () => get().executeMatcherSerialExtract(),
              // Self-Advance liegt IN executeMatcherSerialExtract
            );
```

**V.4.c) `stepRunner.ts:17-32` — `runStepCore` nutzt pauseCheck korrekt:**
```typescript
export async function runStepCore(
  stepNo: 2 | 3 | 4,
  runId: string,
  get: Getter,
  set: Setter,
  pauseCheck: () => boolean,                      // Trigger-spezifisch injiziert
  execute: () => void | Promise<void>,            // Trigger liefert die konkrete Execute-Funktion
): Promise<StepRunOutcome> {
  if (pauseCheck()) return { kind: 'blocked', reason: '__paused__' };
  const guard = await runStepGuard(stepNo, runId, get, set);
  if (pauseCheck()) return { kind: 'blocked', reason: '__paused__' };
  if (guard.blockReason) return { kind: 'blocked', reason: guard.blockReason };
  if (guard.skipReason)  return { kind: 'skipped', reason: guard.skipReason };
  await execute();
  return { kind: 'executed' };
}
```
**Folgerung:** `runStepCore` ist bereits pause-aware — Umstellung `() => false` → `() => get().isPaused` in retryStep case 3 reicht. Kein Code-Change in `stepRunner.ts` nötig.

**V.4.d) `helpers.ts:493-518` — `runStepGuard` (hat 2 await-Stufen):**
```typescript
export async function runStepGuard(
  stepNo: number,
  runId: string,
  get: () => RunState,
  set: (partial: Partial<RunState>) => void,
): Promise<StepGuardResult> {
  const state = get();
  const guardInput = buildGuardInput(state);

  // Phase 2 (PROJ-44-R12): Step 3 uses async variant for IDB-Check (SSOT)
  const result = stepNo === 3
    ? await validateStep3Async(runId, guardInput)
    : validateStepPrerequisites(stepNo, runId, guardInput);

  if (result.canProceed || result.skipReason) return result;

  // Attempt repairs
  const repaired = await applyStepRepairs(
    result,
    stepNo,
    runId,
    guardInput,
    (partial) => set(partial as unknown as Partial<RunState>),
  );
  return repaired;
}
```
**Analyse:** `runStepGuard` hat zwei await-Stellen (validateStep3Async, applyStepRepairs). Beide sind durch das Wrapper-Pattern (Check 1 vor `await runStepGuard(...)` + Check 2 danach) bereits abgedeckt. Pause **innerhalb** von runStepGuard (zwischen den zwei awaits) ist ein theoretisches Mini-Fenster, das durch Check 2 am Wrapper-Ebene aufgefangen wird. **Kein Code-Change in runStepGuard nötig.**

**V.4.e) `helpers.ts:534-692` — `executeStep4Orchestration` (die 2 Ziel-Awaits):**

*Ziel A — `loadRun` ohne Post-Check (IST-Zeile 543-547):*
```typescript
  if (activeMapper === 'engine-proj-23') {
    // PROJ-49 SSOT 12a: parsedOrders aus IDB für SSOT-Runs
    const idbData = await runPersistenceService.loadRun(runId);
    const isSSoTRun = !!idbData?.ingestStatus;
```

*Ziel B — `parseOrderFile` ohne Post-Check (IST-Zeile 575-580):*
```typescript
    const openWEFile = cs.uploadedFiles.find(f => f.type === 'openWE');
    if (openWEFile?.file) {
      const { parseOrderFile } = await import('@/services/matching/orderParser');
      const runConfig = cs.currentRun?.config ?? cs.globalConfig;
      const parseResult = await parseOrderFile(openWEFile.file, {
        profileId: runConfig.activeOrderParserProfileId ?? DEFAULT_ORDER_PARSER_PROFILE_ID,
        overrides: runConfig.orderParserProfileOverrides,
      });
```
**Pause-Hazard bewiesen:** Zwischen jedem await und dem nachfolgenden `executeOrderMapping`/set-Aufruf kann der User pausieren, ohne dass der Pfad es bemerkt. AP9 Schritt 9.5 schließt genau diese Lücken.

**V.4.f) Symmetrie-Referenz aus `advanceToNextStep` (workflowSlice.ts:149-156):**
```typescript
        void (async () => {
          try {
            if (get().isPaused) return; // Check 1
            const guard = await runStepGuard(2, runId, get, set);
            if (get().isPaused) return; // Check 2 (KRITISCH nach async Guard!)
            if (guard.blockReason) {
```
→ Vorlage für die retry-Wrappers Case 2/4 in 9.3.

**V.4.g) V3 Audit-Finding #2 — IST-Zählung `get().isPaused` (exakte Grep-Mathematik):**

**workflowSlice.ts — 10 Treffer (Messung 2026-04-20 via `Grep -c 'get\(\)\.isPaused'`):**
- Zeile 80 — `advanceToNextStep` Entry-Pause-Guard.
- Zeile 151 — `advanceToNextStep` case 2 Check 1.
- Zeile 153 — `advanceToNextStep` case 2 Check 2.
- Zeile 176 — `advanceToNextStep` case 3 `runStepCore` pauseCheck-Callback.
- Zeile 206 — `advanceToNextStep` case 4 Check 1.
- Zeile 208 — `advanceToNextStep` case 4 Check 2.
- Zeile 235 — `advanceToNextStep` case 5 Auto-Complete Pause-Guard.
- Zeile 309 — `retryStep` case 3 Skip-Pfad Advance-Guard.
- Zeile 517 — `resumeRun` (nach runStepGuard, vor Execute).
- Zeile 529 — `resumeRun` case 3 `runStepCore` pauseCheck-Callback.

**helpers.ts — 3 Treffer:**
- Zeile 553 — `executeStep4Orchestration` SSOT `openWE='not_provided'` Skip-Pfad Advance-Guard.
- Zeile 680 — `executeStep4Orchestration` Legacy „kein openWEFile" Skip-Pfad Advance-Guard.
- Zeile 688 — `executeStep4Orchestration` Fallback „andere Mapper" Advance-Guard.

**Delta-Rechnung für AP9:**

| Schritt | Datei | Art | Netto |
|---------|-------|-----|-------|
| 9.1 | workflowSlice.ts | Entry-Check in retryStep | +1 |
| 9.2 | workflowSlice.ts | case 3 Literal-Change `() => false` → `() => get().isPaused` | +1 |
| 9.3 | workflowSlice.ts | case 2 Check 1 + Check 2 | +2 |
| 9.3 | workflowSlice.ts | case 4 Check 1 + Check 2 | +2 |
| 9.5 A | helpers.ts | nach `loadRun` | +1 |
| 9.5 B | helpers.ts | nach `parseOrderFile` | +1 |

**Zielwerte nach AP9:**
- `Grep -c 'get().isPaused' src/store/slices/workflowSlice.ts` → IST 10 + 6 = **16**.
- `Grep -c 'get().isPaused' src/store/internal/helpers.ts` → IST 3 + 2 = **5**.

### V.5 — AP10 Referenzen (useRunAutoSave)

**V.5.a) `useRunAutoSave.ts:30-33` — Hook-Header:**
```typescript
const DEBOUNCE_MS = 2000;

export function useRunAutoSave(): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRunIdRef = useRef<string | null>(null);
```

**V.5.b) `useRunAutoSave.ts:73-83` — Stale-Run-Bug in IST:**
```typescript
      // Debounce the save
      timerRef.current = setTimeout(() => {
        const current = useRunStore.getState();
        if (!current.currentRun) return;

        const payload = buildAutoSavePayload(current.currentRun.id);
        if (payload) {
          runPersistenceService.saveRun(payload).catch(err => {
            console.error('[AutoSave] Failed to save run:', err);
          });
        }
      }, DEBOUNCE_MS);
```
**Bug-Beweis:** `current.currentRun.id` wird bei Timer-Fire gelesen. Wurde zwischen subscribe und fire `setCurrentRun(otherRun)` aufgerufen, landet der alte Payload unter falscher ID.

**V.5.c) `useRunAutoSave.ts:86-103` — Unmount-Flush im IST (V4: wird via 10.3 ergänzt):**
```typescript
    return () => {
      unsubscribe();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;

        // PROJ-40 ADD-ON-3: Flush — pending Save sofort ausfuehren
        const runId = lastRunIdRef.current;
        if (runId) {
          const payload = buildAutoSavePayload(runId);
          if (payload) {
            runPersistenceService.saveRun(payload).catch(err => {
              console.error('[AutoSave] Flush on unmount failed:', err);
            });
          }
        }
      }
    };
```
**Doppel-Flush-Beweis:** Der Block capturet `runId`, schreibt aber **nicht** `lastRunIdRef.current = null` zurück. Wenn `pagehide` (Schritt 10.2 neu) vor diesem Cleanup feuert, feuert Cleanup trotzdem erneut. Schritt 10.3 schiebt `lastRunIdRef.current = null;` nach dem Capture ein — derselbe Pattern wie im pagehide-Handler.

**V.5.d) V4 Audit-Finding AP10 — Grep-Mathematik für `pagehide`:**

**Herleitung aus dem eigenen Soll-Code (Schritt 10.2, V4-Fassung):**

| Zeile im Soll-Code | Treffer |
|--------------------|---------|
| `// PROJ-46 M4 AP10 — Tab-Close-Flush via pagehide (modern, iOS-safe).` | 1 |
| `console.error('[AutoSave] pagehide flush failed:', err);` | 1 |
| `window.addEventListener('pagehide', flushOnHide);` | 1 |
| `window.removeEventListener('pagehide', flushOnHide);` | 1 |
| **Summe** | **4** |

V3 sagte „2" — falsch. V4 setzt Zielwert auf **4**. Der 2. Kommentarblock über dem `useEffect` in 10.2 V4 („V4: Consume-Pattern …") enthält das Wort `pagehide` **nicht** (bewusst formuliert), also bleibt die Zahl bei 4.

**Szenario-Matrix für den Doppel-Flush-Guard (V4):**

| Event-Reihenfolge | pagehide-Handler | React-Cleanup | IDB saveRun-Aufrufe |
|-------------------|------------------|---------------|---------------------|
| Tab-Close (pagehide → Cleanup) | capturet → null → save | sieht `null` → bail | **1** |
| SPA-Navigation (nur Cleanup) | —                       | capturet → null → save | **1** |
| Harter Browser-Kill (nur pagehide) | capturet → null → save | läuft nicht | **1** |
| pagehide ohne pending Run (runId=null) | bail                   | bail | **0** (kein Datenverlust, weil es nichts zu flushen gab) |

Das Consume-Pattern ist **idempotent**: Zweiter Aufruf auf derselben leeren Ref = leiser Skip.

### V.6 — INVARIANTS / CIRCUIT Compliance (V4)

| AP | Betroffene Regel | Einhaltung |
|----|------------------|------------|
| AP6 | I.A13 (Idempotenz), R8 (Primärwriter), CIRCUIT A5 (Writer-Matrix) | `renameRun` ist 1 set, owned Felder nur in runCrudSlice, IDB-Cleanup fire-and-forget. |
| AP7 | I.A4 (kein setTimeout), I.A12 (keine Rekon) | Helper synchron, Zitate V.2.a-c. |
| AP8 | **I.A18** (5 Familien), I.A19 (UI-Entkopplung) | Matrix 8.1 → 14 Actions, 13 Guards. |
| AP9 | **CIRCUIT A14** (Pause-Hazard), I.A5 (Self-Advance), I.A11 (erster Code-Block) | Pause-Check als erster Code-Block in retryStep, inline nach `await` in executeStep4Orchestration. |
| AP10 | I.A15 (Mount-Effekte, keine reaktiven Deps), A14 (UI-Mount Store First) | Neuer Effect `[]`-Dep, nur useRef genutzt. |

**Phase-V-Verdikt (V5):** **VALIDATED** — alle Snippets aus direktem Code-Read am 2026-04-20. Keine Rekonstruktion aus Gedächtnis. Audit-Findings V1/V2 #1–#4, V3 #V3-1/V3-2/V3-3, V4 (AP10 pagehide-Grep + Doppel-Flush-Guard) und V5 (Kommentar-Grep-Kollision in 10.3 entfernt) adressiert. **CONFI: 97%** — nicht 99% wegen dokumentierter offener Restpunkte:
- **-2%** für `runPersistenceService.deleteRun`-Signatur: API-Existenz via Aufruferstellen bewiesen (V.1.d), aber die genaue Rückgabe-Typisierung (`Promise<boolean>` vs. `Promise<void>`) nicht direkt gegen die Service-Definition geprüft. Für `.catch()` als fire-and-forget irrelevant, aber ehrliche Lücke.
- **-1%** für Shadow-Edge-Case im Pause-Hazard **innerhalb** `runStepGuard` (zwischen `validateStep3Async` und `applyStepRepairs`). Pragmatisch durch Wrapper-Check 2 aufgefangen, aber technisch bleibt ein Mikro-Fenster. KISS/YAGNI — nicht adressiert.

**Ehrlichkeit:** CONFI = **97%** — keine Rundung nach oben. Der V4-Restpunkt „types.ts-Einfügestelle (Self-Serve-Grep)" wurde konsolidiert entfernt, weil V5 nichts daran ändert und der Self-Serve-Schritt als Standard-Arbeitspraxis für Mechaniker (Hinweis 10 in HINWEISE FÜR MECHANIKER) gilt — das ist keine Unsicherheit, sondern eine dokumentierte Methode. 100 % schließen wir bewusst nicht: die 2 verbleibenden Punkte sind reale Lücken, die ein ehrlicher Plan ausweist statt wegzurunden. Die Grep-Konsistenz-Korrektur V5 ist rein textuell — sie erhöht die Confi, weil ein reales Verifikations-Gate geschlossen wurde, ohne dass architektonisches Risiko entsteht.

---

## HINWEISE FÜR MECHANIKER (Pflichtlektüre vor AP6.1)

1. **Step-by-Step-Gesetz:** Du führst immer nur den gerade anliegenden Teilschritt aus (z.B. 6.1.a). Danach stoppst du, meldest „✅ 6.1.a fertig, warte auf Freigabe".
2. **TSC ist dein Radar (V3 korrigiert):** Nach 6.1.c **genau 1 Error** am Factory-Return-Type `createRunCrudSlice` in `runCrudSlice.ts:64` (`Property 'renameRun' is missing in type …`). Das ist **erwartet und gewollt**. Nicht vorzeitig fixen, sondern 6.2 ausführen — dann verschwindet der Error.
3. **Ein-Action-Ein-Edit:** In AP8 kombinierst du Guard (8.2) + Recalc-Ersatz (8.3) in einem Edit pro Action.
4. **reopenIssue-Trap:** Wenn dein Edit `recalculateRunAfterMutation` in `reopenIssue` schreibt → STOPP. Matrix 8.3 Row 4 sagt **`recalculateRunStats`**.
5. **R8-Schutzwall:** Direktes `runs.map(...)` oder `auditLog.map(...)` in `ingestSlice` oder `mutationSlice` → STOPP. Nur `runCrudSlice.renameRun` bzw. Helper-API.
6. **Phase-V-Zitate als SOLL:** Weicht dein `Read`-Output vom Zitat ab → STOPP, Dom fragen (Code kann sich zwischen Plan-Erstellung und Execution verändert haben).
7. **executeStep4Orchestration-Checks liegen in `helpers.ts`, NICHT in `workflowSlice.ts`:** AP9 berührt 2 Dateien. Missverständnis = STOPP.
8. **Imports hygienisch lassen:** Nur hinzufügen, was AP7 vorgibt. Unused Imports NICHT eigenmächtig entfernen (CLAUDE.md §3).
9. **Commit-Disziplin:** Pro AP genau **ein** Commit, nach Dom-Freigabe. Format: `feat(store): PROJ-46 M4 AP[6-10] [Kurztitel]`.
10. **Pragmatismus bei auditLog-Order:** Wenn der bestehende `set()` in `renameRun` eine Reihenfolge der Felder verlangt (TypeScript-Narrowing), halte dich an die Reihenfolge aus V.1.a — `runs, currentRun, invoiceLines, issues, auditLog`.
11. **V4 Doppel-Flush-Guard — PFLICHT zweizeilig:** AP10 Schritt 10.2 **und** 10.3 bekommen beide die Zeile `lastRunIdRef.current = null;` **direkt nach** dem `if (!runId) return;` / `if (runId) {`-Check. Lässt du einen davon weg → der Tab-Close-Doppel-Flush kehrt zurück. Beweis: V.5.c + V.5.d.

---

## Neue Vorschläge (post-execution — zu Beginn leer)

> *Mechaniker trägt hier Erkenntnisse während der Ausführung ein. Dom sichtet, bei `[✓]` → I.md/C.md Sektion B.*

**(Noch keine Einträge — Ausführung nicht begonnen.)**

---

## Status: V5 — VALIDATED — READY-FOR-EXECUTION

**Bedingung „Phase V Status = VALIDATED":** Erfüllt (IST-Zitate, inkl. V.1.e + V.4.g + V.5.d aus V4).
**Bedingung „CONFI ≥ 90%":** Erfüllt — **97%**, nicht gerundet, 2 offene Restpunkte dokumentiert.
**Bedingung „Audit-Findings V1/V2 #1–#4 adressiert":** Erfüllt (Tabelle oben, bleibt aus V2).
**Bedingung „Audit-Findings V3 #V3-1, #V3-2, #V3-3 adressiert":** Erfüllt (V2→V3-Tabelle, Belege V.1.e + V.4.g).
**Bedingung „Audit-Findings V4 (AP10 pagehide-Grep + Doppel-Flush-Guard) adressiert":** Erfüllt — Schritt 10.2 Consume-Zeile, Schritt 10.3 für IST-Cleanup, Verifikation 10.2 auf **4** korrigiert, Beleg V.5.d mit Szenario-Matrix.
**Bedingung „Audit-Finding V5 (Kommentar-Grep-Kollision) adressiert":** Erfüllt — Schritt-10.3-Kommentar umformuliert (Wort `pagehide` raus, `Tab-Close` rein). Gezählte Tokens im Soll-Code für `useRunAutoSave.ts`: **exakt 4** (Schritt 10.2: Hauptkommentar + Log-String + addEventListener + removeEventListener; Schritt 10.3: 0). Grep-Gate hält.
**Bedingung „AP6, AP7, AP8, AP9 bleiben unverändert":** Erfüllt — V5 berührt ausschließlich 1 Kommentarzeile in Schritt 10.3, Changelog-Eintrag, Verdikt und Status-Block.
**Bedingung „Kein Mismatch im Code":** Erfüllt.

**Freigabe für Mechaniker:** ⏳ wartet auf Dom.

*Letzter Edit: 2026-04-20 — Opus (Planungsmeister) — V5.*
