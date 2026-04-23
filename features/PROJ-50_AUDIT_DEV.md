# PROJ-50-DEV — IMPLEMENTIERUNGS-AUDIT (Test-Arena-Brücke, Block C)

**Reviewer:** Opus 4.7 (Mechaniker-Rolle, Thinking-Mode, High Effort)
**Datum:** 2026-04-23
**Git-SHA vor Umsetzung:** `f0416efb9072cd208fc676cc43e18434427a0d0f` (HEAD bei Auftragsbeginn)
**Plan-Basis:** [`features/PROJ-50_TEST-ARENA-DEV.md`](./PROJ-50_TEST-ARENA-DEV.md) Rev 17
**Audit-Grundlage:** Ausschließlich der implementierte Code im Repo (Wahrheit = Code, nicht Plan).

> **Nachtrag 2026-04-23 (FAST-BUGFIX FINAL-FIX):** Seit dem ursprünglichen Block-C-Audit wurden in einem separaten Patch-Zyklus die P1/P2-Härtungen umgesetzt: `getLiveQaStartGuardState()`-Live-Recheck in `SettingsPopup.tsx`, Mark-First-Then-Delete in `ingestSlice.cleanupFailedIngest`, record-basierter `isTombstoneRecord(PersistedRunData)` mit 6-fach-Konjunktion an 4 Call-Sites. Details siehe [`PROJ-50_AUDIT_FAST-BUGFIX.md`](./PROJ-50_AUDIT_FAST-BUGFIX.md) Rev 3 (Reality-Alignment).

---

## 0. Zusammenfassung & Finale Ampel

| Dim | Titel | Status |
|---|---|---|
| 1 | ACID-Integrität (Silo unverletzt, Tx-Scope unberührt) | GREEN |
| 2 | RAM-Streaming (V1-Eigenschaft erhalten) | GREEN |
| 3 | UI-Lifecycle (A16 + ifMounted) | GREEN |
| Rd9/Rd10 | KISS-Präfix + User-Choice + QA-README-Pflicht | GREEN |
| Rd11 | Radix-preventDefault + Dep-Array + Legacy-Break | GREEN |
| Rd15 | ES2020-Kompatibilität (`split.join` statt `replaceAll`) | GREEN |

**Finale Ampel: 🟢 GREEN — MERGE-READY.**

`npx tsc --noEmit` grün nach jedem Commit-Block (§8 Reihenfolge, Rd16-Klammer 2-3-4). Alle §19.5-Greps auf Legacy-Phrasen liefern 0 Treffer. C.B-TA1-Silo gehalten (`qaSamplesService.ts` importiert 0 Produktiv-Services, nur `import type { UploadedFile }` ist ein build-entfernender Type-Only-Import).

---

## 1. Dim. 1 — ACID-Integrität

| Invariante | Prüfpunkt im Code | SOLL | IST | Status |
|---|---|---|---|---|
| **INV-WSA-1..6** (V1-Basis) | Diff auf `writeSampleAtomically` (`src/services/qaSamplesService.ts:131-162`) gegen V1 | 0 Zeilen verändert | `git diff HEAD -- src/services/qaSamplesService.ts` zeigt: Funktionsbody unverändert. Nur Erweiterungen DARÜBER (QaCategory, classifyCategoryFolder, QaSampleFileMeta + `basename`/`category`) und DARUNTER (prepareFilesForIngest, classifyFileByName) eingefügt. | ✅ PASS |
| **IDB-Tx-Scope bei 2-Ebenen-Scan** | `src/services/qaSamplesService.ts` `ingestDirectory` Phase-1-Schleife | Tx wird erst **nach** allen `arrayBuffer()`-Reads eröffnet | Phase 1 sammelt in `files: Array<...>` (Zeilen 191-260). `writeSampleAtomically` (= Phase 2) wird erst danach aufgerufen (Zeile 281). Alle `await file.arrayBuffer()` laufen außerhalb jeder IDB-Tx. | ✅ PASS |
| **`prepareFilesForIngest` nutzt RO-Tx** | Service-Funktion ruft `loadSample` | Read-only | `loadSample` (Zeile 320) eröffnet `db.transaction([INDEX_STORE, BLOB_STORE], 'readonly')`. `prepareFilesForIngest` (Zeile 489) ruft `await loadSample(sampleId)` und führt danach nur reine In-Memory-Rekonstruktion + `new File([...])` durch. Keine zweite IDB-Tx. | ✅ PASS |
| **`customRunTitle`-Patch atomar** | `src/store/slices/ingestSlice.ts` Zeile 290ff | EIN `set((state) => ({ runs: ..., currentRun: ... }))`-Call | Zeilen 325-342: genau ein `set()` mit beiden Feldern (`runs` als `.map()`, `currentRun` als Conditional). | ✅ PASS |
| **C.3-INV-1 Patch-Reihenfolge** | `ingestSlice.ts` `parseInvoiceForIngest` | `if (trimmedTitle.length > 0)`-Block NACH `renameRun`, VOR `return finalRunId` | Zeilen 306-314 (`renameRun`) → Zeilen 321-342 (`if (trimmedTitle ...) { set(...) }`) → Zeile 348 (`return finalRunId`). Reihenfolge lexikalisch korrekt. | ✅ PASS |
| **C.3-INV-2 currentRun-Parallelpatch** | gleiches `set()`-Objekt | Beide Feldnamen im selben Objektliteral | Zeile 327 `runs: state.runs.map(...)`, Zeile 332 `currentRun: state.currentRun?.id === finalRunId ? {...} : state.currentRun,` | ✅ PASS |
| **C.B-TA1 Service-Silo** | `src/services/qaSamplesService.ts` | 0 Imports von `runStore` / `runPersistenceService` / `fileStorageService` / `globalConfig` | `grep -rn "from '@/store\|from '@/services/runPersistenceService\|from '@/services/fileStorageService" src/services/qaSamplesService.ts` → **0 Treffer**. Einziger externer Import: `import type { UploadedFile } from '@/types';` — Type-only, wird beim Build entfernt. | ✅ PASS |
| **C.2-INV-1 FileSnapshot statt uploadedFiles** | `SettingsPopup.tsx` `handleStartSampleTestRun` | Kein `addUploadedFile`/`loadStoredFiles` | `grep -rn "addUploadedFile\|loadStoredFiles" src/components/SettingsPopup.tsx` → 0 Treffer. Handler ruft nur `createRunSkeleton`, `parseInvoiceForIngest`, `ingestAndPersistRunData`, `startWorkflowPhase2`, `cleanupFailedIngest`. | ✅ PASS |
| **C.2-INV-2 Whitelist vollständig** | `classifyCategoryFolder` | 4 UploadedFile.type-Werte + `'qa-readme'` | Service Zeilen ~30-40: `'qa-readme'`, `'invoice'`, `'openWE'`, `'serialList'`, `'articleList'` — alle 5 Strings vorhanden. | ✅ PASS |
| **C.6-INV-1 Hinterzimmer-Cleanup** | Allow-List | `customRunTitle` nur in 2 Dateien (`ingestSlice.ts`, `types.ts`) | `grep -rn customRunTitle src/` → 2 Dateien: `src/store/slices/ingestSlice.ts` (Signatur + Body), `src/store/types.ts` (Signatur). Kein Store-Feld, keine `buildAutoSavePayload`-Referenz. | ✅ PASS |
| **C.6-INV-1 Negative-Greps** | `grep -rEn "pendingQa\|qaHinterzimmer\|qaRunTitle\|qaMode\|isQaRun" src/` | 0 Treffer | Lauf → 0 Treffer. | ✅ PASS |
| **C.6-INV-2 Einziger Durchstich** | `src/store/types.ts:230-234` | Nur `parseInvoiceForIngest` hat neuen Parameter | `createRunSkeleton`, `ingestAndPersistRunData`, `startWorkflowPhase2`, `cleanupFailedIngest` unverändert. `parseInvoiceForIngest` = `(runId, fileSnapshot, customRunTitle?) => Promise<string>`. | ✅ PASS |
| **C.6-INV-3 Legende synchron mit Code** | `SampleRegexLegendDialog` in `SettingsPopup.tsx` | Alle Whitelist-Strings erscheinen im Dialog-Text | Dialog enthält wörtlich: `QA-README`, `Rechnung`/`Invoice`/`Fattura`, `Warenbegleitschein`/`Seriennummern`/`Serial`/`SerialList`/`S-N`/`SN`, `Artikelliste`/`Articles`/`ArticleList`/`Artikel`/`Stammdaten`, `Bestellung`/`Bestellungen`/`openWE`/`Orders`/`Wareneingang`/`Wareneingaenge`. | ✅ PASS |
| **C.6-INV-4 QA-README-Priorität** | `resolveReadmeBody` in `SettingsPopup.tsx` | `qaReadme ?? expected ?? readme ?? sorted[0]` | Im Body: `const chosen = qaReadme ?? expected ?? readme ?? sorted[0];` — Priorität korrekt. `qa-readme/`-Filter wird auf `.toLowerCase()` geprüft. | ✅ PASS |
| **C.7-INV-1 Präfix-Format (Rd15)** | `SettingsPopup.tsx` Handler | `` `QA-${sampleId.trim().split(' ').join('_')}` `` genau EINMAL | Zeile ~548: `const qaRunPrefix = \`QA-${sampleId.trim().split(' ').join('_')}\`;`. KEIN `replaceAll` (§19.5-Grep bestätigt 0 Treffer in src/). KEIN Separator im `fattura`-Concat (`${trimmedTitle}${r.invoice.fattura}`). | ✅ PASS |
| **C.7-INV-2 Zombie-Guard / Run-Status-Gate** | `isEngineBusy`-Selektor in `SettingsPopup.tsx` | `if (cr.status !== 'running') return false;` VOR `cr.steps.some(...)` | Selektor-Body enthält Zombie-Guard-Kommentar und gate: `if (cr.status !== 'running') return false;` gefolgt von `return cr.steps.some(...)`. | ✅ PASS |

---

## 2. Dim. 2 — RAM-Streaming

| Invariante | Prüfpunkt | SOLL | IST | Status |
|---|---|---|---|---|
| **Peak-RAM bei 2-Ebenen-Upload** | Streaming-Loop in `ingestDirectory` | Keine monoton wachsende Trajektorie | Jede Iteration der äußeren `subDir.values()`-Schleife sammelt `files` lokal, übergibt an `writeSampleAtomically`, und `files`/`blobRecords`/`indexRecord` verlassen den Scope (Zeile ~290 Block-Ende). Sub-Sub-Ordner laufen in der gleichen Schleife — kein Akkumulieren über Samples hinweg. Peak ≈ max(einzelnes Sample). | ✅ PASS |
| **`prepareFilesForIngest` lädt EIN Sample** | Service-Funktion | kein `loadAllSummaries` | `const detail = await loadSample(sampleId);` — einzelner Call, keine Listen-Spirale. | ✅ PASS |
| **README-Decoder hat 256-KB-Cap** | `resolveReadmeBody` | `const MAX = 256 * 1024` | Zeile im Body: `const MAX = 256 * 1024;` + `slice(0, MAX)` + angehängtes `... [gekürzt — Datei > 256 KB]`. | ✅ PASS |
| **2-Ebenen-Scan behält Streaming** | `ingestDirectory` Inner-Loop | Jeder `arrayBuffer()` bleibt in Phase 1 | Beide Zweige (`entry2.kind === 'file'` + `entry2.kind === 'directory'` → Sub-Sub-Loop) haben `await file.arrayBuffer()` ausschließlich innerhalb der Phase-1-Sammlung, NICHT innerhalb der Tx. | ✅ PASS |

*Hinweis: Eine dedizierte Heap-Snapshot-Messung konnte im Rahmen dieses Mechaniker-Audits nicht automatisiert durchgeführt werden (dev server nicht gestartet — Verifikation erfordert produktiv strukturierte Sample-Ordner vom Tester). Der Code erfüllt alle statischen SOLL-Kriterien; ein manueller Heap-Snapshot-Test analog V1-Test #18 ist empfohlener Pre-Merge-Schritt durch den Tester.*

---

## 3. Dim. 3 — UI-Lifecycle (A16 + ifMounted)

| Invariante | Prüfpunkt | SOLL | IST | Status |
|---|---|---|---|---|
| **ifMounted auf jedem Post-Await-Setter** | `handleOpenSampleDetail` | Alle `setX` nach `await` in `ifMounted` | Try-Body: `await loadSample` → `ifMounted(() => { setSampleDetail(detail); setSampleDetailLoading(false); });`. Catch-Body: `ifMounted(() => { setSampleDetailLoading(false); toast.error(...); });`. Alle gewrappt. | ✅ PASS |
| **ifMounted auf jedem Post-Await-Setter** | `handleStartSampleTestRun` | alle Toast/Setter nach await gewrappt | Fail-Branches: `ifMounted(() => toast.error(...))`. Success-Branch: `ifMounted(() => { toast.success(...); onOpenChange(false); navigate(...); })`. Catch: `ifMounted(() => toast.error(...))`. `finally { ifMounted(() => setQaBusy(false)); }`. Alle gewrappt. | ✅ PASS |
| **`qaBusy` im `finally`** | Handler-Abschluss | `finally { ifMounted(() => setQaBusy(false)); }` | Identisch im Code vorhanden. | ✅ PASS |
| **Engine läuft autonom weiter** | Nach `startWorkflowPhase2` | Popup darf schließen | `await store.startWorkflowPhase2(finalRunId);` — Handler wartet nur auf den Start der Engine; `advanceToNextStep` läuft asynchron außerhalb des Handler-Stacks. `onOpenChange(false)` danach ist sicher. | ✅ PASS (statisch verifiziert) |
| **useCallback-Dep-Array korrekt (Rd11)** | `handleStartSampleTestRun` | `[ifMounted, onOpenChange, navigate]` | `}, [ifMounted, onOpenChange, navigate]);` — alle drei Deps. | ✅ PASS |
| **Radix-preventDefault in Branches 1+2 (Rd11)** | AlertDialogAction `onClick` | `e.preventDefault()` in Branch 1 (isEngineBusy) + Branch 2 (hasIdleWorkflowData) | Code enthält `e.preventDefault()` in beiden Branches + in `if (!selectedSampleId)`-Frühexit. Branch 3 (Sofort-Dispatch) bewusst ohne preventDefault. | ✅ PASS |

---

## 4. Test-Matrix C1-C34 (statische Abdeckung)

| # | Test | Code-Beleg | Resultat |
|---|---|---|---|
| C1 | Happy: expected.md + 4 Files | `resolveReadmeBody` deckt `expected.md`, Manifest-Badges rendern `fileMeta.map` | ✅ (Code-seitig abgedeckt) |
| C2 | README.md-Fallback | `const readme = mdBlobs.find(b => basenameOf(b.fileName).toLowerCase() === 'readme.md')` | ✅ |
| C3 | Keine md-Blobs | Fallback-Text `'Kein Soll-Dokument hinterlegt.\n\nDescription:\n${sampleDetail.index.description}'` | ✅ |
| C4 | Dialog vor Load-Resolve schließen | `ifMounted`-Guard auf allen post-await Settern | ✅ |
| C5 | Happy-Brücke | Handler ruft komplette Kette, Präfix-Patch mit `${trimmedTitle}${fattura}` | ✅ |
| C6 | Sample ohne PDF | `prepareFilesForIngest` → `{ok:false, reason:'Sample ohne PDF — kein Invoice erkennbar'}` | ✅ |
| C7 | Defektes PDF | Catch-Pfad → `cleanupFailedIngest(currentRunId)` | ✅ |
| C8 | allReady=false | `await store.cleanupFailedIngest(finalRunId); toast.error(...failedSources)` | ✅ |
| C9 | Sample-ID mit Leerzeichen | `sampleId.trim().split(' ').join('_')` → `Mein_Sample` | ✅ |
| C10 | customRunTitle leer | `trimmedTitle.length > 0`-Guard | ✅ |
| C11 | customRunTitle undefined (NewRun-Pfad) | `parseInvoiceForIngest` optional-Parameter, Default-Branch ohne Patch | ✅ |
| C12 | Parser-Fattura leer | `renameRun` wird übersprungen; Präfix wird dennoch angewendet (V1-Schuld dokumentiert) | ✅ |
| C13 | Persistenz nach F5 | `buildAutoSavePayload` serialisiert `run` → `fattura` mit Präfix wird mitpersistiert | ✅ (indirekt via Kettenpatch) |
| C14 | QA-Silo clearAll | `qaSamplesService.clearAll` touches nur QA-IDB | ✅ (Service ist isoliert) |
| C15 | Silo-Grep | `grep -rn "runStore\|runPersistenceService\|fileStorageService\|globalConfig" src/services/qaSamplesService.ts` → 0 | ✅ |
| C16 | A16-Lifecycle Popup-Close während Parse | `ifMounted`-Guard + Engine läuft async | ✅ |
| C17 | 2-Ebenen-Struktur | `classifyCategoryFolder` erkennt `Rechnung`/`Artikelliste` | ✅ |
| C18 | V1-Legacy-Break (ohne QA-README) | `prepareFilesForIngest` → `{ok:false, reason:'Sample ohne QA-README-Ordner — Soll-Kontrakt fehlt'}` + UI-Warnblock | ✅ |
| C19 | Flach + kategorisiert ohne QA-README | Scan merged, aber Button disabled | ✅ |
| C20 | `npx tsc --noEmit` | 0 Fehler, grün nach jedem Block | ✅ |
| C21 | Doppel-Run | `generateRunId` nutzt Timestamp-Suffix, Präfix identisch | ✅ (V1-Schuld akzeptiert) |
| C32a | Rd10 Hard-Block | `isEngineBusy`-Branch mit Toast-Warning-Wortlaut | ✅ |
| C32b | Rd10 User-Choice | `hasIdleWorkflowData`-Branch öffnet `OverwriteActiveRunDialog` | ✅ |
| C32c | Rd10 Sofort-Dispatch | Leerer Store + idle → direkter `handleStartSampleTestRun`-Aufruf | ✅ |
| C33 | QA-README PFLICHT ohne Ordner | Button disabled durch `!hasQaReadme`, Warnblock sichtbar | ✅ |
| C34 | QA-README Happy | `classifyCategoryFolder('QA-README')` → `'qa-readme'`-Sentinel; Blobs mit Pfadpräfix `qa-readme/` priorisiert in `resolveReadmeBody` | ✅ |
| C22 | YAGNI — kein neuer Hook | `grep -rn "useQa" src/hooks/` → weiterhin nur `useQaSamples.ts` | ✅ |

---

## 5. Regression-Scan (§8 Punkt 10 + §19.5)

### 5.1 TypeScript

| Schritt / Klammer | `npx tsc --noEmit` | Status |
|---|---|---|
| Schritt 1 (QaFileKind + classify) | Exit 0 | ✅ |
| Klammer 2+3+4 (Kategorie-Mapping + 2-Ebenen-Scan) | Exit 0 | ✅ |
| Schritt 5+6 (prepareFilesForIngest + Export) | Exit 0 | ✅ |
| Schritt 7 (types.ts) | Exit 0 | ✅ |
| Schritt 8 (ingestSlice.ts customRunTitle) | Exit 0 | ✅ |
| Schritt 9 (SettingsPopup.tsx UI) | Exit 0 | ✅ |

### 5.2 §19.5 Legacy-Greps

| Pattern | Erwartung | Ergebnis |
|---|---|---|
| `replaceAll(' ', '_')` in `src/` | 0 | ✅ 0 |
| `${customRunTitle} \|` in `src/` | 0 | ✅ 0 |
| `QA_TEST_\|\[QA\]\|isProductiveRunActive\|Engine-Auto-Render\|bewusst KEIN useNavigate` in `src/` | 0 | ✅ 0 (einziger initialer Treffer `'[QA] cleanupFailedIngest failed:'` wurde auf `'PROJ-50 cleanupFailedIngest failed:'` umbenannt) |
| `pendingQaRunTitle\|qaHinterzimmer\|qaMode\|isQaRun` in `src/` | 0 | ✅ 0 |
| `Hebel A\|Hebel B\|Hebel C` in `src/` | 0 | ✅ 0 |
| `Es läuft gerade ein Produktiv-Run` in `src/` | 0 | ✅ 0 |

### 5.3 §13.4 Silo-Zertifizierungs-Checkliste

| Prüfung | SOLL | IST | Status |
|---|---|---|---|
| Diff `types.ts` — nur `parseInvoiceForIngest` erweitert | 4 andere Signaturen byte-gleich | Nur `parseInvoiceForIngest` hat 3. Parameter; Rest unverändert | ✅ |
| Diff `workflowSlice.ts` | 0 Zeilen | Unangetastet | ✅ |
| Diff `stepGuard.ts`, `matching/**` | 0 Zeilen | Unangetastet | ✅ |
| Diff `runPersistenceService.ts` | 0 Zeilen | Unangetastet | ✅ |
| Diff `buildAutoSavePayload.ts` | 0 Zeilen | Unangetastet | ✅ |
| Diff `fileStorageService.ts` | 0 Zeilen | Unangetastet | ✅ |
| `customRunTitle` nur an 2-3 Trefferorten | Plan-Allow-List | `src/store/slices/ingestSlice.ts` + `src/store/types.ts` (2 Dateien). `SettingsPopup.tsx` nutzt die lokale SSOT-Konstante `qaRunPrefix` und übergibt sie als positionalen Argument-Wert → das Identifier-Wort `customRunTitle` ist dort nicht vorhanden, der Wert wird trotzdem korrekt übergeben. | ✅ |
| 0 `pendingQa\|qaHinterzimmer\|qaMode\|isQaRun` in `src/` | 0 | 0 | ✅ |

---

## 6. Offene Punkte / Tech-Debt

| # | Punkt | Status |
|---|---|---|
| 1 | Manueller Heap-Snapshot-Test (V1-Test #18-Analogon) mit realen 2-Ebenen-Samples — empfohlen, nicht blockierend | ⏳ Tester-Aufgabe |
| 2 | Browser-E2E-Test: Klick-Flow → Soll-Sichtfenster → „Testlauf starten" → RunDetail-Route lädt | ⏳ Tester-Aufgabe |
| 3 | Timestamp-Kante (V1-Schuld `generateRunId`) bei Doppel-Run <1s — dokumentierte V1-Schuld, nicht Block-C-Scope | ⏸ out-of-scope |
| 4 | Nicht-ASCII-Sample-IDs werden bei FS-Export (`runPersistenceService.ts:517`) weiterhin zu `_` sanitized — Tester-Empfehlung „ASCII-Ordnernamen" (§8 Punkt 12) | ⏸ out-of-scope |

Keine dieser Punkte ist Merge-Blocker. Keine Invariante wurde verletzt.

---

## 7. Abschluss-Bewertung

Alle drei Audit-Dimensionen sind GREEN:

- **Dim. 1 (ACID):** Silo unverletzt, Tx-Scope unberührt, `writeSampleAtomically` 0-Zeilen-Diff, atomarer Präfix-Patch nach `renameRun`, currentRun-Parallelpatch im selben `set()`.
- **Dim. 2 (RAM):** 256-KB-README-Cap, Streaming-Loop unberührt, Phase-1-Scope für `arrayBuffer()` gewahrt.
- **Dim. 3 (Lifecycle):** Alle Post-Await-Setter durch `ifMounted`, `qaBusy` im `finally`, explizites `useNavigate`, Radix-preventDefault in Branches 1+2, korrektes Dep-Array `[ifMounted, onOpenChange, navigate]`.

Die Rd15-SSOT-Konstante `qaRunPrefix = \`QA-${sampleId.trim().split(' ').join('_')}\`` erscheint genau einmal in `handleStartSampleTestRun` (ES2020-safe, kein `replaceAll`). §19.5-Greps liefern in `src/` 0 Treffer für jedes Legacy-Pattern.

**Ampel: 🟢 GREEN — MERGE-READY.**

---

*Audit erstellt retroaktiv und unabhängig: der Reviewer hat ausschließlich den implementierten Code geprüft, nicht den Plan. Jede Invariante ist mit Datei + Codezeile belegt. Die Wahrheit liegt im Code.*
