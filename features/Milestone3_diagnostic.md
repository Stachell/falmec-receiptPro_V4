# AP4c Slicing Verifikation - Team Red Audit

## 1. CONFI-SCORE (0-100%)

**CONFI-SCORE: 44%**

Die **physische Trennung** ist real: `src/store/runStore.ts:25-38` ist ein duennes Aggregator-File, die Store-Logik lebt in `slices/` und `internal/helpers.ts`, und die heikle `currentParsedRunId`-Fremdschreiberei wurde in `ingestSlice` sichtbar auf `assignParsedRunId()` umgebogen (`src/store/slices/ingestSlice.ts:309-330`, `src/store/slices/ingestSlice.ts:781-788`).

Die **exakte Uebereinstimmung mit der Ownership-Matrix** ist aber nicht nachgewiesen, sondern mehrfach widerlegt. Die Abzuege kommen **nicht** vom bekannten fehlenden Compile-Enforcement, sondern von realen direkten Fremd-Writes:

- Zentraler Reset-Helper schreibt Slice-fremde Felder in einem Batch direkt: `src/store/internal/helpers.ts:448-462`.
- `persistenceSlice.loadPersistedRun()` hydriert ingest-/runCrud-Felder direkt statt ueber Owner-Channels: `src/store/slices/persistenceSlice.ts:139-140`, `src/store/slices/persistenceSlice.ts:189-207`, `src/store/slices/persistenceSlice.ts:220`.
- `workflowSlice.reprocessCurrentRun()` schreibt `orderPool` und `currentParsedRunId` direkt: `src/store/slices/workflowSlice.ts:434-440`.
- `workflowSlice.executeOrderMapping()` schreibt `orderPool` direkt: `src/store/slices/workflowSlice.ts:1549-1558`.
- `mutationSlice.reassignOrder()` schreibt `orderPool` direkt: `src/store/slices/mutationSlice.ts:827-831`.
- `ingestSlice.startWorkflowPhase2()` schreibt workflow-eigene Waiting-/Pause-/Diagnostics-Felder direkt: `src/store/slices/ingestSlice.ts:550-556`.
- `runCrudSlice.createNewRunWithParsing()` schreibt ingest-eigene Serial-Felder direkt: `src/store/slices/runCrudSlice.ts:321-336`.

Kurz: **Dateien sind gesplittet, Ownership ist noch nicht sauber versiegelt.**

## 2. R8-VIOLATION-SCAN

### Ergebnis

**R8 ist aktuell verletzt.** Es existieren mehrere direkte `set(...)`-Writes auf Felder, die laut Matrix einem anderen Slice gehoeren.

### Bestaetigte Violations

| Fremdschreiber | Direkt beschriebenes Feld | Primaerwriter laut Matrix | Beleg |
|---|---|---|---|
| `internal/helpers.ts` | `currentParsedRunId`, `parsedInvoiceResult`, `parsedPositions`, `parserWarnings`, `serialDocument`, `preFilteredSerials`, `uploadedFiles`, `orderPool`, `isPaused`, `isWaitingBeforeStep4`, `waitingStep4RunId`, `showStep4WaitingDialog`, `latestDiagnostics` | runCrud / ingest / workflow | `src/store/internal/helpers.ts:448-462` |
| `persistenceSlice.loadPersistedRun()` | `currentParsedRunId`, `parsedPositions`, `parserWarnings`, `parsedInvoiceResult`, `serialDocument`, `preFilteredSerials` | runCrud / ingest | `src/store/slices/persistenceSlice.ts:139-140`, `src/store/slices/persistenceSlice.ts:189-207`, `src/store/slices/persistenceSlice.ts:220` |
| `workflowSlice.reprocessCurrentRun()` | `orderPool`, `currentParsedRunId` | ingest / runCrud | `src/store/slices/workflowSlice.ts:434-440` |
| `workflowSlice.executeOrderMapping()` | `orderPool` | ingest | `src/store/slices/workflowSlice.ts:1557` |
| `mutationSlice.reassignOrder()` | `orderPool` | ingest | `src/store/slices/mutationSlice.ts:827-831` |
| `ingestSlice.startWorkflowPhase2()` | `isWaitingBeforeStep4`, `waitingStep4RunId`, `showStep4WaitingDialog`, `isPaused`, `latestDiagnostics` | workflow | `src/store/slices/ingestSlice.ts:550-556` |
| `runCrudSlice.createNewRunWithParsing()` | `preFilteredSerials`, `serialDocument` | ingest | `src/store/slices/runCrudSlice.ts:321-336` |

### Speziell zu `ingestSlice`

`ingestSlice` ist **teilweise korrigiert**:

- **kein direkter Write mehr** auf `currentParsedRunId`; stattdessen Channel ueber `assignParsedRunId()` (`src/store/slices/ingestSlice.ts:309-330`, `src/store/slices/ingestSlice.ts:786-788`).
- **aber** `startWorkflowPhase2()` schreibt weiterhin workflow-eigene Flags direkt (`src/store/slices/ingestSlice.ts:550-556`).
- Zusaetzlich ruft `ingestSlice` den globalen `resetRunSensitiveState()`-Helper, der seinerseits slice-fremde Felder direkt leert (`src/store/slices/ingestSlice.ts:232`, `src/store/slices/ingestSlice.ts:592` in Kombination mit `src/store/internal/helpers.ts:448-462`).

### Speziell zu `mutationSlice`

Hier ist der klare R8-Treffer `reassignOrder()`: Die Funktion mutiert erst den Pool in-place und committed ihn dann selbst zurueck in den Store (`src/store/slices/mutationSlice.ts:768-785`, `src/store/slices/mutationSlice.ts:827-831`). Laut Matrix sollten Override-Actions den ingest-Owner-Channel benutzen, nicht `orderPool` direkt setzen.

## 3. ARCHITEKTUR-INTEGRITAET

### Re-Exports in `runStore.ts`

Fuer die **aktuellen Consumer** sind die Re-Exports vollstaendig.

- `useRunStore` wird direkt aus `runStore.ts` exportiert (`src/store/runStore.ts:25-31`) und von UI/Hooks/Pages genutzt.
- `resolveIssueLines` wird re-exportiert (`src/store/runStore.ts:38`) und von `IssueDialog`, `IssuesCenter` und `src/lib/issueLineFormatter.ts` importiert.
- `runStepGuard` und `RunState` werden fuer `src/store/internal/stepRunner.ts` bereitgestellt (`src/store/runStore.ts:37-38`).

Import-Scan gegen `src/components`, `src/hooks`, `src/lib`, `src/pages` und `src/store/internal` zeigt **keinen fehlenden Symbolfall**. Damit ist die Public API des Aggregators fuer die heutigen UI-Consumer konsistent.

### Ist `helpers.ts` frei von State-Zirkelbezuegen?

**Import-seitig: ja. Ownership-seitig: nein.**

- Import-seitig sauber: `helpers.ts` importiert `RunState` aus `@/store/types`, aber weder `runStore.ts` noch einen Slice zurueck (`src/store/internal/helpers.ts:9-32`). Das vermeidet den alten Typ-/Modul-Zirkel.
- Ownership-seitig nicht sauber: `helpers.ts` ist ein zentraler Querkanal ueber mehrere Slice-Grenzen hinweg. Vor allem `resetRunSensitiveState()` schreibt Felder aus mindestens drei Ownership-Bloecken direkt (`src/store/internal/helpers.ts:448-462`), und `buildGuardInput()` kennt ebenfalls mehrere run-sensitive Bereiche gleichzeitig (`src/store/internal/helpers.ts:475-480`).

Fazit hier: **kein Import-Zirkel, aber weiterhin ein State-Kopplungs-Knoten.**

## 4. FAZIT FUER DEN BAUZEICHNER

**Sektor 3 ist als mechanischer Split brauchbar, aber als Ownership-saubere Basis fuer Milestone 4 noch nicht stabil genug.**

Wenn M4 nur auf der reinen Dateitrennung aufsetzt, ist die Basis funktional vorhanden. Wenn M4 aber darauf baut, dass die Ownership-Matrix jetzt wirklich der harte Bauplan ist, ist der Untergrund noch weich. Die offenen Fremd-Writes sitzen nicht am Rand, sondern in den zentralen Pfaden **Reset**, **Hydrate**, **Reprocess** und **Order-Pool-Mutation**.

Mein Red-Team-Urteil:

- **Ja** zur Aussage: "Der Monolith wurde physisch zerlegt."
- **Nein** zur Aussage: "Die Zerlegung entspricht bereits exakt der Ownership-Matrix."
- **Nein** zur Freigabe fuer M4 als harte Architektur-Basis, **solange** die oben genannten Fremd-Writes nicht zuerst ueber echte Owner-Channels gezogen werden.

---

## 5. NACHTRAG - RE-EVALUIERUNG FUER M4

### Neue Faktenlage des Bauleiters

Der Bauleiter hat die Zielsetzung von AP4c auf den **mechanischen physischen Split** eingegrenzt und die verbleibenden Cross-Slice-Writes bewusst als **Technical Debt fuer Iteration 2** akzeptiert. Die zentrale These lautet:

- AP4c musste den Monolithen physisch zerlegen, nicht alle Legacy-Verknotungen sofort aufloesen.
- Die Cross-Slice-Writes sind architektonisch unsauber, laufen aber unter dem aktuellen Aggregator zur Laufzeit stabil.
- M4 fasst die Architektur nicht direkt an, sondern konzentriert sich auf:
  - UI-Sync in `useRunAutoSave`
  - Entfernung des toten Diagnostics-Felds `lastOrderParserDiagnostics`
  - Type-Cleanup

Diese Argumentation ist **teilweise tragfaehig**, hat aber zwei klare blinde Flecke.

### Blind Spot Radar

#### 1. `useRunAutoSave` haengt bereits an genau dieser Debt

Der kritischste Punkt ist nicht ein abstrakter R8-Purismus, sondern die reale Kopplung zwischen akzeptierter Debt und dem geplanten M4-Scope:

- `useRunAutoSave` reagiert nur auf Referenzwechsel bei `currentRun`, `invoiceLines`, `issues`, `auditLog`, `parsedInvoiceResult` und `serialDocument` (`src/hooks/useRunAutoSave.ts:47-55`).
- **Nicht beobachtet** werden unter anderem `currentParsedRunId`, `parsedPositions`, `parserWarnings`, `preFilteredSerials`, `orderPool`, `isPaused`, `isWaitingBeforeStep4`.
- Gleichzeitig gibt es Reparatur- und Hydrate-Pfade, die genau solche Felder direkt per `set(...)` aendern, z. B. `stepGuard` bei `parsedPositions` und `currentParsedRunId` (`src/services/stepGuard.ts:392-413`).

Folge: Ein Zustand kann **im Speicher korrekt repariert** sein, ohne dass `useRunAutoSave` sofort persistiert. Wenn M4 jetzt Debounce-, Flush- oder Sync-Logik anfasst, liegt hier ein reales Seiteneffekt-Risiko.

#### 2. `buildAutoSavePayload` schuetzt Ownership nur halb

`buildAutoSavePayload()` gate-t `parsedPositions`, `parserWarnings` und `uploadMetadata` sauber ueber `currentParsedRunId === runId` (`src/hooks/buildAutoSavePayload.ts:40-62`).

Aber:

- `parsedInvoiceResult` wird **immer** mitgeschrieben (`src/hooks/buildAutoSavePayload.ts:51`).
- `runPersistenceService.saveRun()` verhindert fremde Ueberschreibung von `parsedInvoiceResult` nur dann, wenn der neue Wert `null` ist und nicht-owned (`src/services/runPersistenceService.ts:156-164`).
- Ein **nicht-null, aber fremdes** `parsedInvoiceResult` wird damit nicht abgefangen.

Das ist der schärfste Blind Spot fuer M4: Ein Auto-Save-/Flush-Refactor kann gemischte Snapshots persistieren, obwohl die Debt heute „meistens funktioniert“.

### Type-Cleanup-Risiko

Der geplante M4-Cleanup von `lastOrderParserDiagnostics` ist **nicht rein kosmetisch**.

Das Feld lebt noch in echten Write-/Reset-Pfaden:

- `src/store/internal/helpers.ts:461`
- `src/store/internal/helpers.ts:597`
- `src/store/slices/ingestSlice.ts:556`
- `src/store/slices/runCrudSlice.ts:74`
- `src/store/slices/workflowSlice.ts:456`

Fazit: Das Entfernen ist machbar, aber es ist mehr als bloßes Type-Aufraeumen. Der Touch-Surface ist breiter als die Bauleiter-Zusammenfassung vermuten laesst.

### Adjusted Confi-Score fuer M4

**ADJUSTED CONFI-SCORE FUER DIE FREIGABE VON M4: 67%**

Begruendung:

- **Plus:** M4 greift laut aktuellem Scope nicht in die Kern-Store-Architektur ein. Der physische Split selbst ist erfolgt und als Basis verwendbar.
- **Minus:** M4 fasst mit `useRunAutoSave` ausgerechnet den Bereich an, in dem die akzeptierte Technical Debt bereits operative Wirkung hat.
- **Minus:** Der Ownership-Schutz fuer Auto-Save ist asymmetrisch; `parsedInvoiceResult` ist der sichtbarste Leckpunkt.
- **Minus:** Der Diagnostics-Cleanup ist kein Nullrisiko, weil das Feld noch an mehreren realen Reset-/Set-Pfaden haengt.

### Messerscharfe Kurzfassung

Die Bauleiter-Entscheidung ist **vertretbar**, aber **nicht blind-spot-frei**.

- Die Cross-Slice-Writes sind fuer M4 **nicht komplett isolierte** Schulden.
- Der groesste versteckte Risikokanal ist `useRunAutoSave` in Kombination mit `buildAutoSavePayload`.
- Das gefaehrlichste Detail ist die Asymmetrie zwischen `currentParsedRunId`-Ownership-Guard und dem unguarded `parsedInvoiceResult`.

Red-Team-Schluss:

- **AP4c als mechanischer Split:** akzeptabel.
- **M4-Freigabe trotz Debt:** ja, aber nur mit erhöhter Vorsicht.
- **M4 als risikolos:** nein.
