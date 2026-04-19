# ShadowAudit M3-1 — PROJ-46 AP4c Slice-Split

**Mission:** Sektor 3 Finale — physische Auflösung des `runStore.ts`-Monolithen.
**Kontrakt:** Mechaniker-Kontrakt (nur Umzug, kein Refactor), Scope `src/store/` only.
**Ownership-Quelle:** `src/store/internal/ownership.md`.
**Modus:** Execution-Loop — je Schritt Audit-Eintrag + Halt für "GO".

---

## Schritt 1 — Typen-Rettung (Anti-Zirkelbezug)

**Status:** ✅ ABGESCHLOSSEN — wartet auf "GO Schritt 2".

### 1.1 Neu erstellte Datei

- **[src/store/types.ts](../src/store/types.ts)** (~243 Zeilen)
  - Re-importiert alle Typ-Abhängigkeiten aus `@/types`, `@/services/invoiceParserService`,
    `@/services/matchers/types`, `@/services/runPersistenceService`,
    `@/services/matching/orderPool` — **nur `import type`**, damit keine Laufzeit-Dependency
    entsteht.
  - Exportiert `ManualArticleData`, `FileSnapshot`, `IngestResult`, `RunState`.
  - Leitplanke-R8-Kommentar (Primärwriter-Regel) lebt jetzt zentral im Modul-Header.

### 1.2 Geänderte Datei

- **[src/store/runStore.ts](../src/store/runStore.ts)**
  - Inline-Deklarationen entfernt:
    - `interface ManualArticleData { ... }` (~13 Zeilen)
    - R8-Kommentarblock (6 Zeilen) — Duplikat, lebt nun in types.ts
    - `interface RunState { ... }` (~168 Zeilen)
    - `export interface FileSnapshot` + `export interface IngestResult` (~15 Zeilen)
  - Neu am Import-Block (nach Zeile 70):
    ```ts
    import type {
      RunState, FileSnapshot, IngestResult, ManualArticleData,
    } from '@/store/types';
    export type { RunState, FileSnapshot, IngestResult } from '@/store/types';
    ```
  - **Körper unverändert:** `resetRunSensitiveState`, `buildGuardInput`, `runStepGuard`,
    `executeStep4Orchestration`, `create<RunState>((set, get) => ({ ... }))` — keine Zeile
    Logik angefasst.

### 1.3 Zirkelbezug-Auflösung

**Problem:** Sobald die Slices in eigene Dateien wandern, würden sie `RunState` aus
`runStore.ts` importieren — `runStore.ts` importiert aber seinerseits die Slices. Klassischer
Zirkel-Bezug, den TypeScript über `import type` zwar teilweise toleriert, der aber bei ESM-
Bundlern (Vite) zu `undefined`-Hoisting-Effekten führt.

**Lösung:** Ein drittes, blattloses Modul `types.ts`, das nur Typen exportiert und keine
Runtime-Dependencies in Richtung Slices/Aggregator hat:

```
@/store/types  ← @/store/slices/*  ← @/store/runStore
     ↑_____________________________________________|
                 (nur Re-Export, kein Runtime-Pfad)
```

- Slices importieren `RunState` aus `@/store/types`.
- `runStore.ts` importiert `RunState` aus `@/store/types` und re-exportiert ihn für
  externe Consumer (stepRunner, IssueDialog, IssuesCenter).
- Kein einziger Slice importiert aus `@/store/runStore`.

### 1.4 TypeScript-Konflikte

**Keine.** `npx tsc --noEmit` → Exit 0.

Bewusst entschieden **gegen** folgende Alternativen:
- `export * from './types'` in runStore.ts → zu breit, hätte nicht-öffentliche Typen
  (`ManualArticleData`) mit-exportiert.
- `import type { RunState } from './runStore'` in stepRunner.ts beibehalten → funktioniert
  dank Re-Export in runStore.ts weiter; `stepRunner.ts` bleibt unangetastet (Scope-Treue).

### 1.5 Public-API-Kompatibilität

| Consumer | Import vorher | Import jetzt | Aktion nötig? |
|---|---|---|---|
| `src/store/internal/stepRunner.ts` | `RunState from '@/store/runStore'` | unverändert (Re-Export) | — |
| `src/components/run-detail/IssueDialog.tsx` | `resolveIssueLines from '@/store/runStore'` | unverändert | — |
| `src/components/run-detail/IssuesCenter.tsx` | `resolveIssueLines from '@/store/runStore'` | unverändert | — |
| 17 weitere UI-Consumer | `useRunStore from '@/store/runStore'` | unverändert | — |

### 1.6 Offene Punkte für Folgeschritte

- `assignParsedRunId` (Cross-Slice-Action für `currentParsedRunId`) **nicht** in Schritt 1
  aufgenommen — gehört laut Mission in Schritt 3.
- Keine Slice-Dateien angelegt — Schritt 2.
- Helper-Funktionen (`resetRunSensitiveState`, `runStepGuard`, `executeStep4Orchestration`,
  `checkIssueStillActive`, `isIssueBlockingStep`, `autoResolveIssues`, `computeMatchStats`,
  `computeOrderStats`, `buildArticleMatchIssues`, `formatOrderParserDiagnostics`,
  `buildOrderParserFailureIssue`, `mapParserWarningToIssueType`, `buildStep1ParserIssues`,
  `resolveIssueLines`, `loadPersistedFiles`, `savePersistedFiles`, `saveParsedInvoice`,
  `loadParsedInvoice`) bleiben vorerst in `runStore.ts`. Verteilung auf Slices bzw.
  `internal/helpers.ts` erfolgt in Schritt 2.

### 1.7 Probleme / Abweichungen

**Keine Logik-Abweichungen.** Zwei Zwischenedit-Iterationen nötig (erster Edit-Versuch
erzeugte unsauberen Sentinel-Block, zweiter Edit hat ihn bereinigt) — Endstand ist
identisch zu einem Direktmove.

---

## Schritt 2 — Basis-Split (Slices anlegen)

**Status:** ✅ ABGESCHLOSSEN — wartet auf "GO Schritt 3".

### 2.1 Neu erstellte Dateien

| Datei | Zeilen | Inhalt |
|---|---:|---|
| [src/store/internal/helpers.ts](../src/store/internal/helpers.ts) | 694 | Alle aus dem Monolithen ausgelagerten Helper-Funktionen + LocalStorage-Keys. Re-Ziele für `resolveIssueLines` (UI) und `runStepGuard` (stepRunner). |
| [src/store/slices/runCrudSlice.ts](../src/store/slices/runCrudSlice.ts) | 821 | `runs[]`, `currentRun`, Identitäts-Writes, Audit-Log, globale Config, UI-State. 18 Actions. |
| [src/store/slices/ingestSlice.ts](../src/store/slices/ingestSlice.ts) | 798 | Phase-1: `uploadedFiles`, `parsedInvoiceResult`, `parsedPositions`, `parserWarnings`, `serialDocument`, `preFilteredSerials`, `orderPool`. 13 Actions. |
| [src/store/slices/workflowSlice.ts](../src/store/slices/workflowSlice.ts) | 1582 | Phase-2: `isPaused`, `isWaitingBeforeStep4`, `latestDiagnostics`. 14 Actions inkl. `advanceToNextStep`, `retryStep`, `reprocessCurrentRun` und die Step-2/3/4 execute-Funktionen. |
| [src/store/slices/mutationSlice.ts](../src/store/slices/mutationSlice.ts) | 843 | Line-Mutations + Issue-Resolution. 14 Actions (`updateInvoiceLine`, `setManual*`, `reassignOrder`, `confirmManualFix`, `bulkConfirmDraftIssues`, `refreshIssues`, `reopenIssue`). |
| [src/store/slices/persistenceSlice.ts](../src/store/slices/persistenceSlice.ts) | 266 | IDB-Persistenz + Archiv: `archiveRun`, `abortRun`, `loadPersistedRun*`, `getStorageStats`, `export*`, `delete*`, `clearPersistedRuns`. 8 Actions. |

Gesamt: **5242 Zeilen** in 6 Dateien (5 Slices + helpers).

### 2.2 Geänderte Datei

- [src/store/runStore.ts](../src/store/runStore.ts) — auf **38 Zeilen** reduziert.
  Inhalt jetzt:
  1. Zustand-`create<RunState>` mit Spread der 5 Slice-Creator.
  2. Re-Export `RunState`, `FileSnapshot`, `IngestResult` aus `./types`.
  3. Re-Export `resolveIssueLines`, `runStepGuard` aus `./internal/helpers`.

  Der vorherige Monolith (4838 Zeilen) ist komplett aufgelöst.

### 2.3 Parallelisierung

Die 5 Slice-Dateien wurden von 5 parallelen Subagenten geschrieben (Mechaniker-
Kontrakt pro Agent: Zeilenbereiche aus `runStore.ts` lesen, Actions verbatim in
Slice-Datei übernehmen, keine Logik-Änderungen). Helper-Datei vorab sequentiell
angelegt, damit die Slices sie importieren konnten.

### 2.4 Action-Map (67 Actions insgesamt)

Mapping entspricht 1:1 der Ownership-Matrix in `src/store/internal/ownership.md` §4:

**runCrudSlice (18):** `setCurrentRun`, `setActiveTab`, `setIssuesStepFilter`,
`setActiveIssueFilterIds`, `navigateToLine`, `clearHighlightedLines`,
`setGlobalConfig`, `createNewRun`, `createNewRunWithParsing`,
`updateRunWithParsedData`, `updateRunStatus`, `updateStepStatus`, `resolveIssue`,
`escalateIssue`, `deleteRun`, `setBookingDate`, `incrementExportVersion`,
`addAuditEntry`.

**ingestSlice (13):** `addUploadedFile`, `removeUploadedFile`,
`clearUploadedFiles`, `loadStoredFiles`, `parseInvoice`, `setParsedInvoiceResult`,
`clearParsedInvoice`, `setParsingProgress`, `createRunSkeleton`,
`parseInvoiceForIngest`, `ingestAndPersistRunData`, `startWorkflowPhase2`,
`cleanupFailedIngest`.

**workflowSlice (14):** `setStepDiagnostics`, `advanceToNextStep`, `retryStep`,
`reprocessCurrentRun`, `pauseRun`, `resumeRun`, `dismissStep4WaitingDialog`,
`proceedStep4FromWaiting`, `generateStep5Issues`, `executeArticleMatching`,
`executeMatcherCrossMatch`, `executeMatcherSerialExtract`,
`executeOrderMatching`, `executeOrderMapping`.

**mutationSlice (14):** `updateInvoiceLine`, `updatePositionLines`,
`refreshIssues`, `reopenIssue`, `confirmManualFix`, `bulkConfirmDraftIssues`,
`setManualPrice`, `setManualPriceByPosition`, `setManualArticleByPosition`,
`setManualArticleByLine`, `updateLineSerialData`, `setManualOrder`,
`confirmNoOrder`, `reassignOrder`.

**persistenceSlice (8):** `archiveRun`, `abortRun`, `loadPersistedRun`,
`loadPersistedRunList`, `getStorageStats`, `exportRunsToDirectory`,
`deletePersistedRun`, `clearPersistedRuns`.

### 2.5 TypeScript-Konflikte

**Keine.** `npx tsc --noEmit` → **Exit 0** direkt beim ersten Lauf nach der
Rewire.

Interessant: Zustands `StateCreator<RunState, [], [], SliceT>` akzeptiert in
jedem Slice ein `set: (partial: Partial<RunState>) => void`. Cross-Slice-`set()`-
Aufrufe lassen sich dadurch aus TypeScript-Sicht aktuell NICHT verhindern — R8
bleibt eine *documentierte* Leitplanke, keine Compiler-erzwungene. Die strikte
Enforcement-Form aus `ownership.md` §5 würde narrow-typisierte Per-Slice-`set`-
Wrapper erfordern (Follow-up für eine spätere Iteration, nicht Mechaniker-Scope).

### 2.6 Offene Punkte für Schritt 3

- **FileSnapshot-Kopier-Semantik** in `startWorkflowPhase2` bereits korrekt
  übertragen (Snapshot-Nutzung statt `state.uploadedFiles`) — Subagent hat
  bestätigt.  Verifikation + ggf. Hardening erfolgt in Schritt 3.
- **`assignParsedRunId`-Action** am `runCrudSlice` noch nicht implementiert.
  Aktuell schreibt `ingestSlice.parseInvoiceForIngest` das Feld
  `currentParsedRunId` per direktem `set({ currentParsedRunId })` — das läuft
  zur Runtime, widerspricht aber R8. Schritt 3 löst das.
- Ein harmloser nicht-referenzierter Import in `workflowSlice.ts`
  (`autoResolveIssues` — Subagent hat ihn auf Wunsch stehen gelassen) — in
  Schritt 4 beim Polish entfernen oder belassen.

### 2.7 Probleme / Abweichungen

**Keine Logik-Abweichungen**, keine Build-Errors.

Einzige sichtbare Abweichung von einer reinen "copy/paste": Der Parameter
`get` in `resetRunSensitiveState` (helpers.ts) wurde zu `_get` umbenannt, weil
der Body ihn nicht nutzt — rein kosmetisch, keine Auswirkung auf die Call-Sites.

Keine externen Consumer mussten angefasst werden (alle Imports von
`@/store/runStore` funktionieren weiterhin dank der Re-Exports).

---

## Schritt 3 — Warnungen aus M3 auflösen

**Status:** ✅ ABGESCHLOSSEN — wartet auf "GO Schritt 4".

### 3.1 FileSnapshot-Kopier-Semantik — Verifikation & Härtung

**Verifikation (statische Code-Analyse):**

Der Aufruf-Pfad lebt in [pages/NewRun.tsx:70-95](../src/pages/NewRun.tsx):

```ts
const fileSnapshot = {
  invoice:     uploadedFiles.find(f => f.type === 'invoice'),
  articleList: uploadedFiles.find(f => f.type === 'articleList'),
  serialList:  uploadedFiles.find(f => f.type === 'serialList'),
  openWE:      uploadedFiles.find(f => f.type === 'openWE'),
};                                          // ← Snapshot VOR Reset
currentRunId = await createRunSkeleton();   // ← resetRunSensitiveState() → uploadedFiles = []
await parseInvoiceForIngest(currentRunId, fileSnapshot);
await ingestAndPersistRunData(finalRunId,  fileSnapshot);
await startWorkflowPhase2(finalRunId);      // ← braucht Snapshot NICHT, lädt aus IDB
```

**Grep-Beweis** (innerhalb `ingestSlice.ts`):

| Action | Zugriff auf `state.uploadedFiles` / `get().uploadedFiles`? |
|---|---|
| `addUploadedFile` (Zeile ~155) | ✅ erlaubt (ist Writer) |
| `removeUploadedFile` (Zeile ~173) | ✅ erlaubt (ist Writer) |
| `parseInvoiceForIngest` | ❌ kein Zugriff |
| `ingestAndPersistRunData` | ❌ kein Zugriff |
| `startWorkflowPhase2` | ❌ kein Zugriff |

Die drei Phase-1-Bridge-Actions lesen ausschließlich den `fileSnapshot`-Parameter
bzw. die IDB-Kopie (`startWorkflowPhase2` → `loadPersistedRun`).

**Härtung:**

1. **Prominenter Invariant-Header** am Slice-Kopf von
   [slices/ingestSlice.ts:6-21](../src/store/slices/ingestSlice.ts) eingefügt —
   Kontrakt, Grund (Reset), Grep-Check dokumentiert.
2. **JSDoc-Banner pro Action** (Zeile 283, 339) bleibt erhalten ("NICHT aus
   `state.uploadedFiles` lesen"), unverändert aus runStore.ts übernommen.
3. **Laufzeit-Guard** NICHT eingeführt: Ein `throw`, der die Invariante erzwingt,
   wäre Logik-Änderung außerhalb des Mechaniker-Kontrakts. Statische
   Dokumentation + Code-Review reichen für AP4c.

### 3.2 Cross-Slice-Channel: `assignParsedRunId`

**Problem:** `currentParsedRunId` wohnt in `runCrudSlice` (Identitäts-Feld,
`ownership.md` §1), aber `ingestSlice` schrieb es bis Schritt 2 direkt per
`set({ currentParsedRunId: ... })`. Das verletzte R8 (Primärwriter-Regel).

**Lösung: Neue Action auf runCrudSlice als legitimer Schreibkanal.**

#### Geänderte Dateien

| Datei | Δ | Inhalt |
|---|---|---|
| [src/store/types.ts](../src/store/types.ts) | +8 Zeilen | `assignParsedRunId: (runId: string \| null) => void` am Ende von `RunState`. Kommentar erklärt den R8-Channel-Zweck. |
| [src/store/slices/runCrudSlice.ts](../src/store/slices/runCrudSlice.ts) | +1 Pick-Eintrag, +7 Zeilen Implementierung | `'assignParsedRunId'` im `Pick<RunState, …>`; Body = `set({ currentParsedRunId: runId })`. |
| [src/store/slices/ingestSlice.ts](../src/store/slices/ingestSlice.ts) | 2 Sites ersetzt | siehe unten. |

#### Ersetzte Writes in ingestSlice

**Site A — `setParsedInvoiceResult` (Zeile ~766):**
- Vorher: `set({ parsedInvoiceResult, parsedPositions, parserWarnings, currentParsedRunId: get().currentRun?.id ?? null })` — 1 atomarer Set mit Cross-Slice-Feld.
- Nachher: Der `set()` schreibt nur noch die drei ingest-eigenen Felder;
  direkt anschließend `get().assignParsedRunId(get().currentRun?.id ?? null)`.

**Site B — `parseInvoiceForIngest` Rename-Block (Zeile ~294):**
- Vorher: atomares `set((state) => ({ runs, currentRun, invoiceLines, issues, currentParsedRunId: … }))` —
  5 Felder gleichzeitig, darunter das Cross-Slice-Feld.
- Nachher:
  ```ts
  const parsedRunIdShouldFollow = get().currentParsedRunId === runId;
  set((state) => ({ runs, currentRun, invoiceLines, issues }));  // 4 eigene Felder
  if (parsedRunIdShouldFollow) {
    get().assignParsedRunId(newRunId);
  }
  ```
  Die Bedingung wird VOR dem Rename-Set gelesen, damit der "owned-Guard" in
  `buildAutoSavePayload` nicht durch den Rename-Lauf verloren geht.

#### Abwägung: Atomarität vs. R8

Die beiden alten Sets waren atomar (1 Zustand-Update). Nach der Aufspaltung
laufen 2 Updates hintereinander — theoretisch ein micro-Fenster zwischen
Rename und `assignParsedRunId`-Commit. Laut `ownership.md` §1 ist genau dieses
Thema für **AP6 ("R6 macht Rename atomar")** vorgesehen. Für AP4c akzeptiert
das die dortige Ownership-Notiz.

### 3.3 Bewusst NICHT gefixt in Schritt 3

- **`resetRunSensitiveState` (helpers.ts)** setzt `currentParsedRunId: null` in
  seinem Batch-`set()`. Der Helper wird aus `setCurrentRun` (runCrudSlice, OK),
  `createRunSkeleton` (ingestSlice, Cross-Slice via Helper) und
  `cleanupFailedIngest` (ingestSlice, Cross-Slice via Helper) gerufen. Wäre
  ein vollständiger R8-Gate-Fix, würde aber die Batch-Atomarität von
  `resetRunSensitiveState` brechen. **Scope-bewusst in Schritt 4 oder später
  behandeln**, da die Mission "AUSSCHLIESSLICH die Punkte aus Schritt 3"
  limitiert hatte.
- Der kleine ungenutzte Import `autoResolveIssues` in `workflowSlice.ts`
  bleibt für Schritt 4 (Final-Cut-Polish) liegen.

### 3.4 Verifikation

- `npx tsc --noEmit` → **Exit 0** ✅
- Keine Runtime-Pfad-Änderung (sowohl `assignParsedRunId` als auch die beiden
  Call-Sites produzieren denselben Store-End-Zustand wie vorher).

### 3.5 Probleme / Abweichungen

**Keine Abweichungen.** Beide Schritt-3-Ziele sind erfüllt: Snapshot-Kontrakt
dokumentiert + gehärtet, R8-Kanal eingeführt und die direkten Cross-Slice-Sets
in ingestSlice entfernt.

## Schritt 4 — Aggregation (Final Cut)

**Status:** ✅ ABGESCHLOSSEN — Mission PROJ-46 AP4c abgeschlossen.

### 4.1 Unused-Import-Audit

Audit-Methode: pro Datei jede importierte Named-Symbole mit
`grep -c '\bSYMBOL\b'` gegen den gesamten Dateiinhalt gezählt. Count ≤ 1
bedeutet: nur die Import-Zeile referenziert das Symbol → ungenutzt.

Ergebnis:

| Datei | Ungenutzte Imports |
|---|---|
| [slices/runCrudSlice.ts](../src/store/slices/runCrudSlice.ts) | — |
| [slices/ingestSlice.ts](../src/store/slices/ingestSlice.ts) | — |
| [slices/workflowSlice.ts](../src/store/slices/workflowSlice.ts) | `autoResolveIssues` (entfernt) |
| [slices/mutationSlice.ts](../src/store/slices/mutationSlice.ts) | — |
| [slices/persistenceSlice.ts](../src/store/slices/persistenceSlice.ts) | — |
| [internal/helpers.ts](../src/store/internal/helpers.ts) | — |
| [types.ts](../src/store/types.ts) | — |
| [runStore.ts](../src/store/runStore.ts) | — |

**Fix:** 1 Import-Eintrag (`autoResolveIssues`) aus
`workflowSlice.ts`-Helper-Import-Block gestrichen. Keine weiteren Änderungen
nötig — die Subagent-Reports waren bereits sauber.

Hinweis: `tsconfig.app.json` hat `noUnusedLocals: false`, daher schlägt
`tsc --noEmit` ungenutzte Imports NICHT an. Audit ist manuell nötig und wurde
mit oben beschriebenem Grep-Verfahren durchgeführt.

### 4.2 runStore.ts — Assembly-Check

[src/store/runStore.ts](../src/store/runStore.ts) ist jetzt eine reine
Aggregator-Datei, 38 Zeilen inkl. Kommentaren. Struktur:

```
├─ Kopfkommentar (12 Zeilen) — Rolle, Public-API-Liste, Ownership-Referenz
├─ import { create } from 'zustand'
├─ import type { RunState } from './types'
├─ 5× Slice-Creator-Imports
├─ export const useRunStore = create<RunState>()((...a) => ({
│    ...createRunCrudSlice(...a),
│    ...createIngestSlice(...a),
│    ...createWorkflowSlice(...a),
│    ...createMutationSlice(...a),
│    ...createPersistenceSlice(...a),
│  }))
├─ export type { RunState, FileSnapshot, IngestResult } from './types'
└─ export { resolveIssueLines, runStepGuard } from './internal/helpers'
```

Keine Helper, keine Actions, keine Initial-State-Literals. Ausschließlich
Zustand-Verdrahtung + Public-API-Re-Exports. Der Monolith (4838 Zeilen vor
Schritt 1) ist restlos aufgelöst.

### 4.3 Finaler TypeScript-Check

`npx tsc --noEmit` → **Exit 0** ✅ (final, nach Cleanup-Edit).

### 4.4 Endzustand — Dateien

| Datei | Zeilen | Rolle |
|---|---:|---|
| `runStore.ts` | **38** | Aggregator |
| `types.ts` | 246 | Typen + R8-Kommentar + `assignParsedRunId` |
| `internal/helpers.ts` | 694 | Geteilte Helper, `resolveIssueLines`, `runStepGuard`, `executeStep4Orchestration`, `resetRunSensitiveState`, `buildGuardInput`, 14 weitere Helper |
| `internal/stepRunner.ts` | 33 | (unverändert) |
| `internal/ownership.md` | 101 | (unverändert) |
| `slices/runCrudSlice.ts` | 829 | 18 Actions + 16 State-Felder |
| `slices/ingestSlice.ts` | 821 | 13 Actions + 7 State-Felder + Invariant-Header |
| `slices/workflowSlice.ts` | 1581 | 14 Actions + 5 State-Felder |
| `slices/mutationSlice.ts` | 843 | 14 Actions |
| `slices/persistenceSlice.ts` | 266 | 8 Actions |
| **Σ neu** | **5318** | 67 Actions + 28 State-Felder |

### 4.5 Was Schritt 4 NICHT getan hat (bewusste Nicht-Änderungen)

- **`resetRunSensitiveState`-Helper schreibt weiterhin `currentParsedRunId`
  direkt im Batch-`set()`.** Das ist technisch eine R8-Durchbruch-Stelle,
  die aber über einen GETEILTEN Helper läuft, nicht über einen direkten
  Cross-Slice-`set()` im Slice-Body. Ein vollständiger Fix würde die
  Batch-Atomarität des Reset-Helpers brechen. Schritt 4 war als Polish
  definiert — der Helper-Case gehört in eine separate Iteration (Kandidat
  für AP6 Rename-Atomarität-Arbeiten).
- **Runtime-Guards** für die FileSnapshot-Invariante wurden NICHT
  hinzugefügt. Der Mechaniker-Kontrakt erlaubt keine Logik-Änderungen;
  die Invariante ist durch den Header in `ingestSlice.ts` dokumentiert.
- **Legacy-Fallback-Pfad** in `executeStep4Orchestration` (uploadedFiles-
  basierter Order-Parser) bleibt drin (siehe helpers.ts-Kommentar und
  ursprünglichen ShadowAudit_M3 §2.2 — bewusst nicht entfernt).

### 4.6 Summary der 4 Schritte

| Schritt | Ergebnis | Dateien |
|---|---|---|
| 1 — Typen-Rettung | ✅ | `types.ts` neu, `runStore.ts` trimmen |
| 2 — Basis-Split | ✅ | 5 Slices + `internal/helpers.ts` neu, `runStore.ts` als Aggregator |
| 3 — M3-Warnungen | ✅ | FileSnapshot-Invariante gehärtet, `assignParsedRunId` Cross-Slice-Channel |
| 4 — Final-Cut | ✅ | Unused import entfernt, final tsc Exit 0 |

### 4.7 Offene Folgearbeiten (nicht Teil AP4c)

- **R8-Enforcement auf Compile-Ebene** (ownership.md §5 beschreibt das als
  "ab AP4c macht TypeScript Cross-Slice-set() unmöglich"). Aktuell nicht
  erzwungen: `StateCreator<RunState, [], [], X>` gibt jedem Slice
  `set: (partial: Partial<RunState>) => void`. Eine strikte Per-Slice-
  Set-Typisierung würde narrow-Wrapper über `set` verlangen — Follow-up
  für eine spätere Iteration.
- **Rename-Atomarität** (ownership.md §1 Fußnote "R6 (AP6) macht Rename
  atomar") — aktuell ist der parseInvoiceForIngest-Rename nach Schritt 3
  auf 2 Store-Updates aufgeteilt (`set()` für die run-id-Felder, dann
  `assignParsedRunId(newRunId)`).
- **Legacy openWE-Pfad in `executeStep4Orchestration`** sollte entfernt
  werden, sobald alle aktiven Runs SSOT-ingestiert sind.
- **Ein einziger geteilter Helper (`resetRunSensitiveState`) schreibt
  cross-slice-besetzte Felder** im gemeinsamen Batch — siehe §4.5.

---

**ENDE MISSION PROJ-46 AP4c — Slice-Split abgeschlossen.**
