# PROJ-46 AP4a — Ownership-Matrix (Audit-Artefakt)

**Status:** AP4a (Phase 4a) — ausführbares Audit, Grundlage für AP4b/4c.
**Erstellt:** 2026-04-18 (Milestone 3, Sektor 3)
**Quelle:** Projektplan v1.14, Sektion B.4.
**Kontrakt:** Jedes run-sensitive Feld hat **genau EINEN Primärwriter-Slice**. Alle anderen Writes gehen zwingend durch eine Action dieses Primär-Slices. Direktes `set({ feld: ... })` außerhalb des Primär-Slices ist ab AP4c verboten (Leitplanke R8).

---

## 1. Run-sensitive Felder — Primärwriter-Matrix

| Feld | Primärwriter | Sekundäre Writer (heute direkt) | Ziel-Slice | Umzug-Strategie |
|---|---|---|---|---|
| `parsedInvoiceResult` | `parseInvoiceForIngest` | `resetRunSensitiveState`, `loadPersistedRun`, `reprocessCurrentRun` | **ingestSlice** | Sekundäre gehen durch `ingestSlice.hydrateParsedInvoice(payload \| null)` |
| `parsedPositions` | `parseInvoiceForIngest` | `loadPersistedRun`, `reprocessCurrentRun`, `resetRunSensitiveState` | **ingestSlice** | wie oben (same Action-Channel) |
| `parserWarnings` | `parseInvoiceForIngest` | `resetRunSensitiveState` | **ingestSlice** | trivial |
| `serialDocument` | `ingestAndPersistRunData` (Sub-3b) | `loadPersistedRun`, `reset` | **ingestSlice** | `ingestSlice.hydrateSerialDocument()` |
| `preFilteredSerials` | `ingestAndPersistRunData` (Sub-3b) | `loadPersistedRun`, `reset` | **ingestSlice** | dito |
| `uploadedFiles` | `startNewRun`/UI-Drop | `cleanupFailedIngest`, `resetRunSensitiveState` | **ingestSlice** (AP3-Kandidat: Umzug nach `runCrudSlice`) | Entscheidung in AP4a (siehe §3.1) |
| `orderPool` / `parsedOrderPool` | `ingestAndPersistRunData` (Sub-3d) | `loadPersistedRun`, Override-Actions | **ingestSlice** (Schreib), **mutationSlice** (Override-Actions rufen ingestSlice-Setter) | Reassign-Actions konsumieren, Primärwriter bleibt Ingest |
| `currentParsedRunId` | `parseInvoiceForIngest` (Rename) | `renameRun` (AP6), `reset` | **runCrudSlice** (Identitäts-Feld) | R6 (AP6) macht Rename atomar |
| `isWaitingBeforeStep4`, `waitingStep4RunId`, `showStep4WaitingDialog` | `advanceToNextStep`-Targeted | `proceedStep4FromWaiting`, `dismissStep4WaitingDialog`, `reset` | **workflowSlice** | Waiting-Point-Semantik (A16) gehört zum Workflow |
| `isPaused` | `pauseRun`/`resumeRun` | `startWorkflowPhase2` (Init-Clear) | **workflowSlice** | Init-Clear via workflowSlice-interner Action |
| `latestDiagnostics` | `runStepGuard` / Execute-Funktionen | `reset` | **workflowSlice** | Step-Diagnostik gehört zu Workflow-Fortschritt |

---

## 2. Engine-Entry-Points (CIRCUIT A1) → Slice-Zuordnung

| Entry-Point | Slice | Begründung |
|---|---|---|
| `advanceToNextStep(runId, stepNo?)` | **workflowSlice** | Primär-Dispatcher aller Step-Übergänge |
| `retryStep(runId, stepNo)` | **workflowSlice** | Trigger-Variante |
| `resumeRun(runId)` | **workflowSlice** | Trigger-Variante |
| `proceedStep4FromWaiting()` | **workflowSlice** | an A16 Waiting-Point gebunden |
| `reprocessCurrentRun()` | **workflowSlice** | orchestriert mehrere Resets + advance |
| `startWorkflowPhase2(runId)` | **ingestSlice** | Bridge von Phase 1 nach Phase 2; nicht Workflow-intern |

---

## 3. Abbruch-Kriterien (Plan B.4)

### 3.1 Unklare Ownership: `uploadedFiles`
Plan-Hinweis: „im Zuge AP3 kandidiert für `runCrudSlice`". Aktuell in `resetRunSensitiveState` geleert (Zeile ~697 runStore.ts) und über `setCurrentRun` mit Fix 1 (M1) ID-gated reset-betroffen. UI-Drop-Aktion (`addUploadedFile`) liegt im Monolith.

**Entscheidung AP4a:** `uploadedFiles` geht in **ingestSlice** (Primärwriter = `startNewRun`-artige UI-Flow-Actions + `ingestAndPersistRunData`-Bridge), nicht in `runCrudSlice`. Grund: Das Feld ist eng an Phase-1-Ingest gekoppelt (snapshot → parse → persist). `runCrudSlice` hält nur Identitäts-Metadaten (`runs[]`, `currentRun.id`, Rename).

### 3.2 Mehrfach-Writer ohne klaren Ownership
Falls ein Feld weder Ingest noch Workflow noch CRUD klar zuordenbar ist, gehört es **zwingend in `runCrudSlice`** mit expliziten Setter-Actions. **Kein Slice „wurschtelt" quer** (Plan B.4 Abbruchregel).

---

## 4. Slice-Kontur (Ziel-Architektur nach AP4c)

```
store/
  ├─ runStore.ts            (Aggregator — combine(...slices), dünne Assembly)
  ├─ slices/
  │   ├─ runCrudSlice.ts    (runs[], currentRun, Identitäts-Writes, renameRun)
  │   ├─ ingestSlice.ts     (Phase 1: uploadedFiles, parsedInvoiceResult,
  │   │                      parsedPositions, parserWarnings, serialDocument,
  │   │                      preFilteredSerials, orderPool, parsedOrderPool,
  │   │                      currentParsedRunId-Write)
  │   ├─ workflowSlice.ts   (Phase 2: advanceToNextStep, retryStep, resumeRun,
  │   │                      proceedStep4FromWaiting, reprocessCurrentRun,
  │   │                      isPaused, isWaitingBeforeStep4, latestDiagnostics)
  │   ├─ mutationSlice.ts   (updateInvoiceLine, updatePositionLines,
  │   │                      setManual*, reassignOrder, confirmNoOrder,
  │   │                      confirmManualFix, bulkConfirmDraftIssues,
  │   │                      refreshIssues, reopenIssue, R7-Helper)
  │   └─ persistenceSlice.ts (loadPersistedRun, loadPersistedRunList,
  │                          getStorageStats, archiveRun, abortRun,
  │                          exportRunsToDirectory, delete*Persisted*)
  └─ internal/
      ├─ stepRunner.ts      (PROJ-46 AP2 — vorhanden seit M2)
      ├─ ownership.md       (dieses Dokument)
      └─ stepGuard-Facade   (ggf. in AP4c — heute @/services/stepGuard)
```

---

## 5. Leitplanke R8 (Primärwriter-Regel)

> **Run-sensitive Felder haben genau EINEN Primärwriter-Slice. Sekundäre Writes MÜSSEN durch die Actions dieses Primär-Slices gehen. Direkte `set()`-Aufrufe auf fremde Felder sind strengstens verboten.**

**Quelle:** Projektplan v1.14, B.5 R8.
**Verankerung:** Inline-Block über `interface RunState` in `runStore.ts` (AP4b, bereits gesetzt).
**Enforcement ab:** AP4c — sobald die Slices physisch getrennt sind, macht TypeScript Cross-Slice-`set()` unmöglich (jeder Slice sieht nur eigene `set`-Signatur).
**Pre-Commit-Check:** `madge --circular src/store/` muss leer sein, bevor AP4c gemergt wird (Plan B.6).

---

## 6. Freigabe-Status AP4a/b/c

| Phase | Status | Bemerkung |
|---|---|---|
| 4a — Matrix erstellen | ✅ abgeschlossen | dieses Dokument |
| 4b — Leitplanke R8 verankern | ✅ abgeschlossen | `runStore.ts` Kommentarblock über `interface RunState` |
| 4c — Mechanischer Move | ⏸ aufgeschoben | Pre-Commit `madge --circular`-Check im Quarantäne-Scope nicht ausführbar (kein Build-Kontext). Umzug in separater Iteration. Siehe ShadowAudit_M3 §3.1. |
