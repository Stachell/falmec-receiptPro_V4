# PROJ-46 M3.5 Leak-Patch — 3 Blind-Spot-Fix (AutoSave-Hygiene + Legacy-Feld-Ausbau)

**Status:** PLAN (V4 — Feinschliff Team-Red, ready für VALIDATED)
**Datum:** 2026-04-19
**Scope:**
- `src/hooks/useRunAutoSave.ts` (Subscribe-Diff / Wachhund)
- `src/hooks/buildAutoSavePayload.ts` (Snapshot-Türsteher)
- `src/store/types.ts` (Typ-Ausbau `lastOrderParserDiagnostics` + JSDoc-Bereinigung)
- `src/store/internal/helpers.ts` (Reset-Batch + Format-Pfad)
- `src/store/slices/runCrudSlice.ts` (Pick-Union + Initial-State)
- `src/store/slices/ingestSlice.ts` (Phase-2-Reset-Batch)
- `src/store/slices/workflowSlice.ts` (Reprocess-Reset-Batch)

**Auslöser:** QA-Auditor M3-Audit (`features/ShadowAudit_M3-1.md`, `features/Milestone3_diagnostic.md`) hat drei Datenlecks zwischen dem Slice-Split (M3) und dem geplanten UI-Sync (M4) identifiziert, die in der aktuellen AutoSave-Pipeline zu stillem Datenverlust oder Mixed-Snapshots führen können.

**V4-Changelog (Feinschliff Team-Red):**
- **V4.1 — Ehrliche Klassifikation der Wachhund-Erweiterung:** Die 4 neuen Diff-Felder sind nicht alle gleichrangig. `currentParsedRunId` und `parsedPositions` werden als **echte Lecks** deklariert (isolierte Mutations-Pfade nachgewiesen). `parserWarnings` und `preFilteredSerials` werden als **Sicherheitsnetze / Future-Proofing** deklariert (co-mutieren heute zuverlässig mit bereits beobachteten Feldern, sollen aber gegen spätere Entkopplungen abgesichert sein).
- **V4.2 — Kongruenz-Regel mathematisch präzisiert:** Die Regel in §12.1/§12.2 erlaubt **zwei** Abdeckungsformen: (a) direkte Beobachtung im Diff ODER (b) verlässliche Ableitung aus einem beobachteten Feld. `uploadMetadata` als Projektion von `uploadedFiles` ist der dokumentierte Beispielfall.
- **V4.3 — Bestandsschutz V3:** Schritt 2 (Türsteher), Schritte 3–8 (Diagnostics-Ausbau), TSC-Radar, Grep-Konsistenz, keine Zwischenfreigaben — alles aus V3 **unangetastet**.
- V2/V3-Korrekturen (TSC-Policy, 4-Feld-Wachhund, Dead-Trigger-Ausschluss, 6-Touchpoint-Zählung, Grep-Konsistenz, keine Zwischenfreigaben) bleiben erhalten.

---

## 1. Problemanalyse

### 1.1 Blind Spot 1 — Wachhund ignoriert 4 persistierte Felder (2 echte Lecks + 2 Sicherheitsnetze)

`useRunAutoSave.ts` nutzt `useRunStore.subscribe((state, prev) => ...)` und vergleicht derzeit NUR 6 Felder im Skip-Diff (Zeilen 48–57): `currentRun`, `invoiceLines`, `issues`, `auditLog`, `parsedInvoiceResult`, `serialDocument`. Alle anderen Store-Mutationen werden als „irrelevant" verworfen und lösen KEINEN Debounce-Save aus.

**Persistenz-Abgleich (Soll-Ist):** `buildAutoSavePayload` (Zeilen 42–64) schreibt aktuell folgende Felder in die IDB-Payload:
`id`, `currentParsedRunId`, `run`, `invoiceLines`, `issues`, `auditLog`, `parsedPositions`, `parserWarnings`, `parsedInvoiceResult`, `serialDocument`, `preFilteredSerials`, `uploadMetadata`, `runLog`.

Davon werden durch den bestehenden 6-Feld-Diff nur 6 direkt erfasst. Die 4 Ergänzungsfelder sind — ehrlich klassifiziert — **2 echte Lecks und 2 Sicherheitsnetze**:

#### Echtes Leck 1: `currentParsedRunId`

- **Setzende Pfade:** Dedizierte Action `assignParsedRunId(runId | null)` (runCrudSlice, R8-Cross-Slice-Channel, siehe `types.ts:244`), plus Co-Sets in `setParsedInvoiceResult`/`parseInvoiceForIngest`.
- **Isoliertes Mutations-Muster:** Der Cleanup-Pfad `assignParsedRunId(null)` (z. B. Ownership-Release ohne Run-Wechsel) mutiert **ausschließlich dieses Feld**. Aktueller Diff erkennt die Änderung nicht → Ownership-Signal bleibt nur im Memory.
- **Folge:** Nach einem isolierten Ownership-Release wird der neue Wert (`null`) nicht in die IDB geschrieben; beim nächsten Reload erscheint der alte Ownership-Zustand.

#### Echtes Leck 2: `parsedPositions`

- **Setzende Pfade:** Heute primär in ingestSlice gebündelt mit `parsedInvoiceResult` (`ingestSlice.ts:781-783`, `791-792`, `801-803`). Reset in `resetRunSensitiveState` (helpers:451) und Rehydrierung via `loadPersistedRun` in persistenceSlice.
- **Warum trotzdem echtes Leck?** Die Kopplung an `parsedInvoiceResult` ist eine **interne Implementierungs-Garantie des ingestSlice**, keine architektonische Zusage. Der Wachhund-Kontrakt darf nicht von Slice-internen Set-Bündeln abhängen. Konkret: Der Rehydrierungs-Pfad `loadPersistedRun` (persistenceSlice) kann `parsedPositions` in Szenarien setzen, in denen `parsedInvoiceResult` in derselben Batch unverändert ist (Rehydrierung aus IDB mit nicht-persistiertem Invoice-Result). Dann läuft der Diff-Vergleich ins Leere.
- **Folge:** Mutationen außerhalb des dokumentierten ingestSlice-Bündels triggern keinen Save.

#### Sicherheitsnetz 1: `parserWarnings`

- **Setzende Pfade:** Heute ausschließlich innerhalb der ingestSlice-Batch-Sets zusammen mit `parsedInvoiceResult` (`ingestSlice.ts:781-783` etc.). Keine isoliert-setzende Action bekannt.
- **Realität:** Heute durch den bestehenden `parsedInvoiceResult`-Diff-Check **bereits vollständig abgedeckt**, weil beide Felder in derselben Batch liegen.
- **Warum trotzdem aufnehmen?** Future-Proofing gegen eine spätere Entkopplung (z. B. separate Parser-Warning-Updates durch Post-Processor, lazy-warning-Pipeline). Die Aufnahme ist billig (1 Referenzvergleich pro Subscribe-Call) und verhindert eine stille Regression, falls die Kopplung in M4/M5 aufgebrochen wird.

#### Sicherheitsnetz 2: `preFilteredSerials`

- **Setzende Pfade:** Step 3 in workflowSlice (`executeMatcherSerialExtract`), co-mutiert typischerweise mit `serialDocument`. Zusätzlich durch den **Hard-Checkpoint-Save** in `executeMatcherSerialExtract` (PROJ-40-ADD-ON-3, awaited `runPersistenceService.saveRun`) explizit abgesichert.
- **Realität:** Heute durch `serialDocument`-Diff-Check + Hard-Checkpoint doppelt abgedeckt.
- **Warum trotzdem aufnehmen?** Future-Proofing gegen Entkopplungs-Refactorings + Konsistenz mit dem Payload-Kongruenz-Prinzip (§12.1). Die Aufnahme dient als Brace-Pattern ohne unmittelbaren Leak-Fix — klar dokumentiert.

#### Ausdrücklich NICHT im Wachhund-Scope (V3-Entscheidung, V4 unverändert)

`orderPool`, `isPaused`, `isWaitingBeforeStep4`, `waitingStep4RunId`, `showStep4WaitingDialog` werden von `buildAutoSavePayload` nicht persistiert. Ihre Aufnahme in den Diff würde IO-Spikes ohne Persistenz-Effekt erzeugen. Eine Persistenz dieser Run-Control-Felder wäre eine M4-Scope-Erweiterung der IDB-Struktur.

### 1.2 Blind Spot 2 — Türsteher lässt `parsedInvoiceResult` ungeprüft durch
`buildAutoSavePayload.ts:51` schreibt `parsedInvoiceResult: current.parsedInvoiceResult ?? null` — unabhängig davon, ob der im Store liegende `parsedInvoiceResult` zum angefragten `runId` gehört. `parsedPositions`/`parserWarnings`/`uploadMetadata` sind bereits über den `owned`-Guard (`current.currentParsedRunId === runId`) abgesichert; `parsedInvoiceResult` nicht.

**Folge:** Nach einem Run-Wechsel kann der Store kurzzeitig `parsedInvoiceResult` vom alten Run halten (Race vor `resetRunSensitiveState()`) — AutoSave persistiert diese fremde Parse-Frucht unter der neuen `runId` → Mixed Snapshot in IDB.

### 1.3 Blind Spot 3 — `lastOrderParserDiagnostics` ist tot, aber verdrahtet
PROJ-28 hat den Diagnose-Kanal auf `latestDiagnostics[4]` migriert; `lastOrderParserDiagnostics` ist per JSDoc als deprecated markiert und in `ownership.md:25` als „entfernt in AP5" vermerkt, steckt aber real noch in **6 Touchpoints / 8 physischen Edits**:

| # | Touchpoint | Datei | Zeile(n) | Edits | Art |
|---|---|---|---|---|---|
| TP1 | Typ-Definition + Obsolete-Kommentar | `src/store/types.ts` | 84–85, 138 | 2 | Typ-Deklaration + JSDoc-Kommentar |
| TP2 | Slice-Ownership (Pick + Initial) | `src/store/slices/runCrudSlice.ts` | 35, 74 | 2 | Pick-Union-Eintrag + Initial-State-Wert |
| TP3 | Reset-Batch (shared Helper) | `src/store/internal/helpers.ts` | 461 | 1 | `set({...})`-Key in `resetRunSensitiveState` |
| TP4 | Format-Pfad Step 4 Legacy | `src/store/internal/helpers.ts` | 597 | 1 | Standalone `set({...})` in `executeStep4Orchestration` |
| TP5 | Transient-Reset Phase 2 | `src/store/slices/ingestSlice.ts` | 556 | 1 | `set({...})`-Key in `startWorkflowPhase2` |
| TP6 | Transient-Reset Reprocess | `src/store/slices/workflowSlice.ts` | 456 | 1 | `set({...})`-Key in `reprocessCurrentRun` |

**Summe:** 6 Touchpoints = 8 physische Zeilen-Edits (2 in TP1 + 2 in TP2 + je 1 in TP3–TP6).

**TS-Fehler-Radar:** Wenn Schritt 3 (TP1 — Typ-Deklaration Zeile 85 gelöscht) durchgelaufen ist, produziert `tsc` **exakt 6 Errors** (Pick:35, Init:74, reset:461, format:597, phase2:556, reprocess:456). Das ist der gewollte Sollbruch-Zähler.

**Folge:** R8 (Primärwriter-Regel) wird aktuell über das Feld umgangen — mehrere Slices schreiben das Feld parallel, obwohl es niemand mehr liest. Größte Gefahr beim Ausbau: Die Reset-Batches sind einheitliche Objekt-Writes — wer eine Zeile schlampig löscht, zerreißt die Batch-Klammer oder hinterlässt ein Baumelkomma.

---

## 2. Impact-Matrix (PFLICHT VOR Plan)

| Geplante Änderung | Betroffene Funktionen | Betroffene Steps/Module | Risiko wenn vergessen | Klassifikation (V4) |
|---|---|---|---|---|
| Diff-Check um `currentParsedRunId` erweitern | `useRunAutoSave` Subscribe-Callback | AutoSave-Pipeline | Dark-Write bei `assignParsedRunId`-Standalone-Pfad | echtes Leck |
| Diff-Check um `parsedPositions` erweitern | `useRunAutoSave` Subscribe-Callback | AutoSave-Pipeline | Dark-Write bei Rehydrierung / zukünftiger Slice-Entkopplung | echtes Leck |
| Diff-Check um `parserWarnings` erweitern | `useRunAutoSave` Subscribe-Callback | AutoSave-Pipeline | Heute kein Leak, aber Brace gegen Entkopplung | Sicherheitsnetz |
| Diff-Check um `preFilteredSerials` erweitern | `useRunAutoSave` Subscribe-Callback | AutoSave-Pipeline | Heute doppelt abgedeckt, aber Payload-Kongruenz-Prinzip | Sicherheitsnetz |
| `parsedInvoiceResult` unter `owned`-Guard | `buildAutoSavePayload` | Run-Isolation, IDB-Snapshot-Integrität | Mixed-Snapshot (fremder `parsedInvoiceResult` unter anderer `runId`) | echtes Leck |
| `lastOrderParserDiagnostics` aus `RunState`-Typ streichen | `RunState` | Typkontrakt Store | TS-Compile-Fehler in 6 Touchpoints — **gewolltes Radar** | R8-Hygiene |
| JSDoc-Kommentar in `types.ts:138` bereinigen | Dokumentation | — | Grep-Rest (V2.3) | Kosmetik/Hygiene |
| Feld aus Pick-Union `RunCrudSlice` entfernen | `runCrudSlice.ts:35` | Slice-Ownership | Orphan-Ownership | R8-Hygiene |
| Feld aus Initial-State entfernen | `runCrudSlice.ts:74` | Initial-Run-State | Undeklariertes Feld im Slice | R8-Hygiene |
| Setter in Legacy-Step-4 entfernen | `executeStep4Orchestration` (helpers.ts:597) | Step 4 Legacy-Pfad | Schreibzugriff auf gestrichenes Feld | R8-Hygiene |
| Key aus 3 Reset-Batches entfernen | `resetRunSensitiveState`, `startWorkflowPhase2`, `reprocessCurrentRun` | Context-Switch + Phase-2-Start + Reprocess | Komma-Salat / zerrissene Batches | R8-Hygiene |

> **Prüffrage (I.md A1 — Drillinge):** `advanceToNextStep`/`retryStep`/`resumeRun` berühren `lastOrderParserDiagnostics` **nicht direkt**, nur indirekt über `executeStep4Orchestration` (von allen drei aufgerufen). Nach Löschung der Setter-Zeile bleibt die Drillings-Konsistenz gewahrt — KEINE der drei Entry-Points liest das Feld.

---

## 3. Circuit & Standards-Check (PFLICHT)

| Datei | Regel / Verbindung | Betroffen? | Schutzmaßnahme |
|---|---|---|---|
| I.md | A1 (Drillinge) | Nein — kein Leser in den 6 Entry-Points. | Globaler Grep-Check in §9 Phase V. |
| I.md | A9 (Kein State-Read ohne verifizierten Write) | Inverse Richtung — wir entfernen Writes, darum: **keine Reads** erlaubt. | Finaler Grep `rg -n lastOrderParserDiagnostics src/` = 0 Treffer. |
| I.md | A10 (Fehlerbehandlung gleichwertig) | Nein — kein try/catch involviert. | — |
| I.md | A12 (Kein Code aus dem Gedächtnis) | Ja — Phase V zitiert jedes Zeilen-Fragment wörtlich (siehe §9.1). | Code-Zitate wörtlich. |
| I.md | A13/A16 (Context-Switching + UI-Lifecycle) | Ja — `parsedInvoiceResult`-Gating darf den `null`-Cleanup-Pfad nicht verschlucken. | Gating ist `owned ? (... ?? null) : null` — `null`-Quelle wird durchgereicht. |
| C.md | A5 (State-Feld-Writer-Landkarte) | Nein — `lastOrderParserDiagnostics` ist in A5 nicht dokumentiert (Pre-PROJ-28 Rest). | Keine Map-Änderung. |
| C.md | A7 (Import-Verdrahtung) | Nein — keine neuen Imports. | — |
| C.md | A15 (reprocessCurrentRun Sonderpfad) | Ja — wir entfernen EINEN Key aus dem Reset-Batch. | Batch-Klammer strikt erhalten. |
| C.md | A4 (Step-4-Orchestrierung) | Ja — Legacy-Pfad in `executeStep4Orchestration`. | Nur Zeile 597 entfernen; `setStepDiagnostics(4, …)` bleibt alleiniger Diagnose-Kanal. |
| S.md | S1–S5 | Nein — keine UI-Arbeit. | — |
| R8 (Primärwriter) | Primärwriter der Reset-Batches = jeweiliger Slice. | Ja | Nur Zeilen löschen, keine neuen Cross-Slice-Writes. |

> **Sektion B:** I.md + C.md + S.md enthalten aktuell keine offenen Vorschläge. Nach diesem Patch: siehe §12.

---

## 4. State-Snapshotting

**Pfad A: `assignParsedRunId(null)` (Wachhund — echtes Leck, `currentParsedRunId`)**
```
VORHER:  assignParsedRunId(null) → set({currentParsedRunId:null}) → diff unverändert → return → KEIN Save → Ownership-Drift nur im Memory
NACHHER: diff erkennt currentParsedRunId-Wechsel → Debounce → saveRun persistiert neuen Ownership-Zustand
```

**Pfad B: Rehydrierung via `loadPersistedRun` (Wachhund — echtes Leck, `parsedPositions`)**
```
VORHER:  loadPersistedRun → set({parsedPositions: rehydrated, ...}) ohne zwingende parsedInvoiceResult-Änderung → diff blind → KEIN Save → Rehydrierter Stand nicht crash-sicher
NACHHER: diff erkennt parsedPositions-Wechsel → Debounce → Save sichert den rehydrierten Stand
```

**Pfad C: Step-1-Parse (Wachhund — Sicherheitsnetz, `parserWarnings`)**
```
HEUTE:   set({parsedInvoiceResult, parsedPositions, parserWarnings, currentParsedRunId}) — alle im selben Batch
AUSGABE: parsedInvoiceResult-Check feuert bereits → Save erfolgt
ZUKUNFT: Falls ein Post-Processor parserWarnings separat updated → neuer Diff fängt das ab (Future-Proofing)
```

**Pfad D: Step-3-Serial (Wachhund — Sicherheitsnetz, `preFilteredSerials`)**
```
HEUTE:   executeMatcherSerialExtract → set({preFilteredSerials, serialDocument}) + Hard-Checkpoint-Save (PROJ-40-ADD-ON-3)
AUSGABE: Doppelabsicherung (serialDocument-Diff + Hard-Checkpoint)
ZUKUNFT: Bei Entkopplung von serialDocument fängt der neue Diff die preFilteredSerials-Mutation separat ab
```

**Pfad E: Run-Wechsel mit stale `parsedInvoiceResult` (Türsteher)**
```
VORHER:  setCurrentRun(newRun) → resetRunSensitiveState → Debounce feuert ZWISCHEN Set und Reset → buildAutoSavePayload liest alten parsedInvoiceResult → IDB.save(newRunId, oldParsedInvoiceResult) = MIXED
NACHHER: buildAutoSavePayload: owned=false → parsedInvoiceResult=null → IDB.save(newRunId, null) = SAUBER (Rehydrierung via loadPersistedRun)
```

**Pfad F: Legacy Step 4 (non-SSOT openWE)**
```
VORHER:  executeStep4Orchestration → parseOrderFile → set({lastOrderParserDiagnostics: ...}) + setStepDiagnostics(4, ...)
NACHHER: executeStep4Orchestration → parseOrderFile → setStepDiagnostics(4, ...) (alleiniger Diagnose-Kanal, PROJ-28 SSOT)
```

**Pfad G: Reset-Batches (resetRunSensitiveState / startWorkflowPhase2 / reprocessCurrentRun)**
```
VORHER:  set({..., lastOrderParserDiagnostics: null, latestDiagnostics: {}, ...}) — 13/6/6 Keys
NACHHER: set({..., latestDiagnostics: {}, ...}) — 12/5/5 Keys — Batch-Klammer und alle anderen Keys exakt unverändert
```

> **Prüffrage:** Kommt am Ende dasselbe Produkt raus? Ja. Das entfernte Feld hatte keine Leser mehr; sein Rücksetzen war No-Op mit Byte-Ballast.

> **Explizit NICHT adressiert:** `orderPool`, `isPaused`, `isWaitingBeforeStep4`, `waitingStep4RunId`, `showStep4WaitingDialog` werden von `buildAutoSavePayload` nicht persistiert. Ihr State geht bei Reload verloren — das ist das bekannte Verhalten und bleibt so. Eine Persistenz-Erweiterung ist M4-Scope.

---

## 5. Transitions-Analyse

### 5a. Datenfluß-Vorbedingungen

| Neuer Code liest | Erwarteter Wert | Wer schreibt | Write im IST | Write im SOLL | Im Payload? | Klassifikation (V4) |
|---|---|---|---|---|---|---|
| `state.currentParsedRunId` (Diff) | `string \| null` | runCrudSlice (`assignParsedRunId`), ingestSlice (Ingest) | Ja | Ja | Ja (`buildAutoSavePayload.ts:44`) | echtes Leck |
| `state.parsedPositions` (Diff) | `ParsedInvoiceLineExtended[]` | ingestSlice + persistenceSlice (Rehydrierung) | Ja | Ja | Ja (`buildAutoSavePayload.ts:49`) | echtes Leck |
| `state.parserWarnings` (Diff) | `InvoiceParserWarning[]` | ingestSlice (immer co-mutiert mit parsedInvoiceResult) | Ja | Ja | Ja (`buildAutoSavePayload.ts:50`) | Sicherheitsnetz |
| `state.preFilteredSerials` (Diff) | `PreFilteredSerialRow[]` | workflowSlice (immer co-mutiert mit serialDocument) / Reset-Helper | Ja | Ja | Ja (`buildAutoSavePayload.ts:53`) | Sicherheitsnetz |
| `current.parsedInvoiceResult` mit `owned`-Gate | `ParsedInvoiceResult \| null` | ingestSlice (`setParsedInvoiceResult`) | Ja | Ja | Ja (`buildAutoSavePayload.ts:51`) | echtes Leck |
| `owned = current.currentParsedRunId === runId` | string-Vergleich | runCrudSlice / ingestSlice | Ja | Ja | — (abgeleitet) | — |

> **Prüffrage 2 (Bypass-Pfade):** Gibt es einen Pfad, der `parsedInvoiceResult` schreibt, ohne `currentParsedRunId` zu aktualisieren? → Phase V verifiziert negativ per Grep (§9.1).

### 5b. Mechanismus-Sicherheit

| Altes Konstrukt | Neues Konstrukt | Fehlerklasse alt | Fehlerklasse neu | Auffangnetz |
|---|---|---|---|---|
| 6-Feld-Diff | 10-Feld-Diff (6 + 4 neue, davon 2 echte Lecks + 2 Sicherheitsnetze) | False-Negative bei echten Lecks; Regressions-Risiko bei Sicherheitsnetz-Feldern | Geringfügig erhöhte Save-Frequenz bei Sicherheitsnetz-Feldern (null oder gering heute, steigt bei Zukunfts-Refactor) | 2 s Debounce dämpft Burst; `buildAutoSavePayload` idempotent |
| `parsedInvoiceResult ?? null` | `owned ? (parsedInvoiceResult ?? null) : null` | Mixed-Snapshot | `null`-Persistenz für fremden Run (unkritisch) | IDB `saveRun` Merge-Schutz (PROJ-49 SSOT) als zweite Linie |
| Obsoletes Feld in Reset-Batches | Kein Feld | Byte-Ballast + R8-Verletzung | — | TS-Compiler fängt jedes übersehene Remnant |

### 5c. Dispatch-Vollständigkeit

| Funktion | Änderung | Werte | Verhalten | Branching spezifiziert? |
|---|---|---|---|---|
| `buildAutoSavePayload` — `parsedInvoiceResult`-Key | Gating via `owned` | true / false | true → `current.parsedInvoiceResult ?? null`; false → `null` | Ja (analog zu `parsedPositions`/`parserWarnings`) |
| Subscribe-Diff | +4 Referenzvergleiche | identisch/neu | alle identisch → skip; einer abweichend → Debounce | Ja (`&&`-Kette, bewährtes Muster) |

> **Prüffrage:** Was passiert bei `undefined`? Alle 4 neuen Diff-Felder haben laut `types.ts` klare Typen (`string | null` oder nicht-optionale Arrays). Keine `?.`-Pfade nötig.

---

## 6. Test-Kriterien

| # | Typ | Beschreibung | Erwartetes Ergebnis |
|---|---|---|---|
| 1 | Happy Path | Run durchläuft Steps 1–5. | `saveRun` feuert nach Step-1-Parse (parsedInvoiceResult-Diff, redundant mit parsedPositions/parserWarnings-Diffs) und nach Step 3 (serialDocument-Diff, redundant mit preFilteredSerials-Diff). Keine regressions. |
| 2 | Echtes Leck 1 (Ownership-Release) | `assignParsedRunId(null)` ohne andere Store-Änderung. | diff erkennt Wechsel → Save getriggert → IDB-Payload enthält `currentParsedRunId: null`. |
| 3 | Echtes Leck 2 (Mixed-Snapshot) | Run A aktiv → parsedInvoice im Memory → schneller Wechsel auf Run B → Debounce feuert zwischen Set und Reset. | IDB.saveRun(B) enthält `parsedInvoiceResult: null` (kein Leak von A). |
| 4 | Sicherheitsnetz-Gegenprobe (Test-Simulation) | Simuliere isolierte `parserWarnings`-Mutation (z. B. per Dev-Tool-Store-Set). | Diff feuert → Save erfolgt. Bestätigt Future-Proofing-Wirksamkeit. |
| 5 | Unmount-Race | Unmount während ausstehendem Timer; mindestens eines der 4 neuen Felder geändert. | Unmount-Flush schreibt vollständigen Payload — keine Doppel-Saves. |
| 6 | Dead-Trigger-Gegenprobe (V3 erhalten) | `pauseRun` → `isPaused=true` ohne andere Änderungen. | **KEIN Save getriggert.** `isPaused` ist bewusst nicht im Diff (nicht im Payload). Dokumentierter Zustand. |
| 7 | Compile-Test | `npx tsc --noEmit` nach Abschluss aller 8 Schritte. | 0 Errors (Exit 0). |
| 8 | Grep-Test | `rg -n lastOrderParserDiagnostics src/` nach Abschluss. | **0 Treffer in `src/`** (inkl. Kommentare). |
| 9 | Drillinge-Regression | Run Step 4 im Legacy-Pfad (non-SSOT openWE). | `setStepDiagnostics(4, …)` schreibt in `latestDiagnostics[4]`; kein Abbruch. |

---

## 7. Umsetzungsplan (Schritt-für-Schritt für Sonnet)

> **Ausführung in einem Rutsch.** Keine Zwischenfreigaben nötig — die Dom-Freigabe liegt am Plan-Status `VALIDATED`.
> **TSC-Policy (V2.1 unverändert, V4-Bestandsschutz):**
> - Nach **Schritt 2**: `tsc` MUSS grün sein (Schritte 1–2 sind isolierte Logik-Erweiterungen ohne Typ-Bruch).
> - Nach **Schritt 3**: `tsc` MUSS rot sein mit **genau 6 Errors** — das ist der **Sollbruch-Radar**. Weniger → Touchpoint übersehen. Mehr → unbekannter Leser → STOP.
> - Nach **Schritt 4–7**: Error-Count sinkt schrittweise (6 → 5 → 4 → 3 → 1).
> - Nach **Schritt 8**: `tsc` MUSS grün sein (Exit 0). Harter Gate.
> - Erst nach grünem `tsc` in Schritt 8 folgen Schritt 9 (Grep-Check + INDEX-Update).

### Schritt 1 — Wachhund erweitern (`src/hooks/useRunAutoSave.ts`)

**Ort:** Skip-Diff-Block innerhalb der `useRunStore.subscribe`-Callback (aktuell Zeilen 48–57: 6 Feld-Vergleiche mit `&&`).

**Aktion (V4-Klassifikation):** Ergänze **exakt 4 Referenzvergleiche** — **2 echte Lecks + 2 Sicherheitsnetze**. Die restlichen Zeilen des Hooks (Ref-Handling, Debounce-Timer, Unmount-Flush) bleiben UNANGETASTET.

**Zu ergänzende Felder (empfohlene Reihenfolge, mit Klassifikation):**
1. `state.currentParsedRunId === prev.currentParsedRunId` — **echtes Leck** (`assignParsedRunId(null)`-Standalone-Pfad)
2. `state.parsedPositions === prev.parsedPositions` — **echtes Leck** (Rehydrierungs-/Refactor-Risiko)
3. `state.parserWarnings === prev.parserWarnings` — **Sicherheitsnetz** (heute co-mutiert mit `parsedInvoiceResult`, Future-Proofing)
4. `state.preFilteredSerials === prev.preFilteredSerials` — **Sicherheitsnetz** (heute co-mutiert mit `serialDocument` + Hard-Checkpoint, Future-Proofing)

**Verbot (V3.1 erhalten):** Nimm KEINE weiteren Felder (`orderPool`, `isPaused`, `isWaitingBeforeStep4`, `waitingStep4RunId`, `showStep4WaitingDialog`) in den Diff auf — diese werden von `buildAutoSavePayload` nicht persistiert → Dead-Trigger.

**Kontrakt:** Referenz-Vergleich (`===`), kein Deep-Equal. Zustand schreibt neue Referenzen bei jeder Mutation — Referenz-Identität genügt.

**Kommentar-Empfehlung:** Bei den 2 Sicherheitsnetz-Feldern ein Einzeiler-Kommentar wie `// safety net — co-mutiert heute mit parsedInvoiceResult, explizit beobachtet für Future-Proofing`. Dom-Entscheidung, ob dieser Kommentar gewünscht ist. KEIN blockierender Gate.

**Abnahme-Gate:** `tsc` grün.

---

### Schritt 2 — Türsteher reparieren (`src/hooks/buildAutoSavePayload.ts`) — **V3-Bestandsschutz, unverändert**

**Ort:** Zeile 51 (aktuell `parsedInvoiceResult: current.parsedInvoiceResult ?? null,`).

**Aktion:** Ersetze den Ausdruck analog zur bestehenden `owned`-Behandlung von `parsedPositions`/`parserWarnings` (Zeilen 49–50): Wenn `owned === false`, schreibe `null`; sonst den aktuellen Wert mit `?? null`-Fallback.

**Exakte Bedingung:** `owned` ist bereits in Zeile 40 als `current.currentParsedRunId === runId` gebunden — NICHT neu berechnen, NICHT umbenennen.

**Nicht anfassen:** Zeilen 42–44 (`id`, `currentParsedRunId`, `run`), 46–48 (`invoiceLines`, `issues`, `auditLog`), 52 (`serialDocument`), 53–54 (`preFilteredSerials`), 55–62 (`uploadMetadata`), 63 (`runLog`).

**Abnahme-Gate:** `tsc` grün. **Letzter grüner Zustand vor der bewussten Rotphase.**

---

### Schritt 3 — Typ-Ausbau + JSDoc-Bereinigung (`src/store/types.ts`) — **V3-Bestandsschutz, unverändert**

**Edit A (Zeilen 84–85):** JSDoc-Deprecated-Block + Feld-Deklaration `lastOrderParserDiagnostics: OrderParserSelectionDiagnostics | null;` — beide Zeilen ersatzlos löschen.

**Edit B (Zeile 138):** Den Klammer-Zusatz `(replaces lastOrderParserDiagnostics for Step 4)` entfernen → `/** PROJ-28: Write step diagnostics after a step completes */`.

**Edit C (prüfen, KEIN Edit):** Typ-Import `OrderParserSelectionDiagnostics` (Zeile 21) bleibt — wird von `helpers.ts` weiterhin genutzt.

**Erwarteter Zustand:** `tsc` zeigt **genau 6 Errors**. Radar-Gate.

---

### Schritt 4 — runCrudSlice bereinigen (`src/store/slices/runCrudSlice.ts`) — **V3-Bestandsschutz, unverändert**

**Edit A (Zeile 35):** `| 'lastOrderParserDiagnostics'` in Pick-Union — Zeile inkl. Pipe löschen.

**Edit B (Zeile 74):** `lastOrderParserDiagnostics: null,` im Initial-State — Zeile löschen.

**Erwarteter Effekt:** 2 TS-Errors geheilt (6 → 4).

---

### Schritt 5 — helpers.ts (Reset-Batch) (`src/store/internal/helpers.ts`) — **V3-Bestandsschutz, unverändert**

**Ort (Zeile 461):** `lastOrderParserDiagnostics: null,` im `set({...})`-Batch in `resetRunSensitiveState` — Zeile löschen.

**Erwarteter Effekt:** 1 TS-Error geheilt (4 → 3).

---

### Schritt 6 — helpers.ts (Format-Pfad Step 4 Legacy) — **V3-Bestandsschutz, unverändert**

**Ort (Zeile 597):** `set({ lastOrderParserDiagnostics: parseResult.diagnostics ?? null });` — Zeile ersatzlos löschen. Der nachfolgende `if (parseResult.diagnostics) { … setStepDiagnostics(4, …) }`-Block bleibt alleiniger Diagnose-Kanal.

**Erwarteter Effekt:** 1 TS-Error geheilt (3 → 2).

---

### Schritt 7 — ingestSlice (Phase-2-Reset) — **V3-Bestandsschutz, unverändert**

**Ort (Zeile 556):** `lastOrderParserDiagnostics: null,` im transienten `set({...})`-Batch von `startWorkflowPhase2` — Zeile löschen.

**Erwarteter Effekt:** 1 TS-Error geheilt (2 → 1).

---

### Schritt 8 — workflowSlice (Reprocess-Reset) — **V3-Bestandsschutz, unverändert**

**Ort (Zeile 456):** `lastOrderParserDiagnostics: null,` im transienten `set({...})`-Batch von `reprocessCurrentRun` — Zeile löschen.

**Erwarteter Effekt:** Letzter TS-Error geheilt (1 → 0).

**Abnahme-Gate:** `tsc` grün (Exit 0). Harter Schluss-Gate der Code-Phase.

---

### Schritt 9 — Globale Verifikation & Abschlussarbeiten

1. `npx tsc --noEmit` → 0 Errors (Exit 0).
2. Globaler Grep: `rg -n lastOrderParserDiagnostics src/` → **0 Treffer in `src/`**.
3. Erweiterter Grep ohne `src/`-Einschränkung zeigt Treffer in `ownership.md` + Plan-Dateien — diese sind Dokumentation.
4. `features/INDEX.md` — Eintrag `PROJ-46-M3.5 Leak-Patch` ergänzen, Status `Done`.
5. `features/Proj-46_M3-5_Leak-Patch.md` — Status oben auf `DONE` setzen, Datum.
6. `ownership.md` Zeile 25 — Dom-Entscheidung (entfernen oder umformulieren).

---

## 8. Hinweise für Coder-LLM (Sonnet)

*Ausführlich unter §11 (Inception-Move) am Ende des Dokuments.*

---

## 9. Phase V — Code-Validierung

**Status:** V4-Validierung.

> **Scope-Validator-Bypass:** Chirurgisches Zeilen-Löschen ohne Control-Flow-Änderung. `npm run scope-check` ist für Funktions-Rewrites konzipiert. Validierung über wörtliche IST-Zitate (§9.1) + Typ-Verifikation (§9.4).

### 9.1 Validierungstabelle (wörtliche IST-Zitate)

| # | Behauptung im Plan | Datei | Zeile | IST-Code (wörtlich) | Stimmt? | CONFI | Korrektur |
|---|---|---|---|---|---|---|---|
| 1 | Diff vergleicht aktuell 6 Felder | `src/hooks/useRunAutoSave.ts` | 48–55 | `if (\n    state.currentRun === prev.currentRun &&\n    state.invoiceLines === prev.invoiceLines &&\n    state.issues === prev.issues &&\n    state.auditLog === prev.auditLog &&\n    state.parsedInvoiceResult === prev.parsedInvoiceResult &&\n    state.serialDocument === prev.serialDocument\n  ) {` | ✅ | 100% | +4 Felder (V3/V4) |
| 2 | `parsedInvoiceResult` NICHT owned-gegated | `src/hooks/buildAutoSavePayload.ts` | 51 | `parsedInvoiceResult: current.parsedInvoiceResult ?? null,` | ✅ | 100% | Gating ergänzen |
| 3 | `owned` existiert bereits | `src/hooks/buildAutoSavePayload.ts` | 40 | `const owned = current.currentParsedRunId === runId;` | ✅ | 100% | — |
| 4 | `currentParsedRunId` im Payload | `src/hooks/buildAutoSavePayload.ts` | 44 | `currentParsedRunId: current.currentParsedRunId,` | ✅ | 100% | — |
| 5 | `parsedPositions` im Payload | `src/hooks/buildAutoSavePayload.ts` | 49 | `parsedPositions: owned ? current.parsedPositions : [],` | ✅ | 100% | — |
| 6 | `parserWarnings` im Payload | `src/hooks/buildAutoSavePayload.ts` | 50 | `parserWarnings: owned ? current.parserWarnings : [],` | ✅ | 100% | — |
| 7 | `preFilteredSerials` im Payload | `src/hooks/buildAutoSavePayload.ts` | 53–54 | `preFilteredSerials: current.preFilteredSerials.length > 0\n      ? current.preFilteredSerials : undefined,` | ✅ | 100% | — |
| 8 | `uploadMetadata` ist Ableitung von `uploadedFiles` (V4-Beleg) | `src/hooks/buildAutoSavePayload.ts` | 60–62 | `uploadMetadata: (owned && current.uploadedFiles.length > 0)\n      ? current.uploadedFiles.map(f => ({ type: f.type, name: f.name, size: f.size, uploadedAt: f.uploadedAt }))\n      : undefined,` | ✅ | 100% | — (Regel-Basis §12) |
| 9 | `assignParsedRunId` ist dedizierte Cross-Slice-Action (V4-Beleg für echtes Leck) | `src/store/types.ts` | 244 | `// Implementierung: runCrudSlice.assignParsedRunId → \`set({ currentParsedRunId })\`.` + `assignParsedRunId: (runId: string \| null) => void;` | ✅ | 100% | — (Regel-Basis §1.1) |
| 10 | `parsedPositions` co-mutiert heute mit `parsedInvoiceResult` im ingestSlice | `src/store/slices/ingestSlice.ts` | 781–783 | `set({\n        parsedInvoiceResult: result,\n        parsedPositions: positions,` | ✅ | 100% | — (Regel-Basis §1.1: rechtfertigt Sicherheitsnetz-Framing für parserWarnings und erklärt warum parsedPositions trotzdem echtes Leck bleibt via Rehydrierungs-Pfad) |
| 11 | Typ-Deklaration | `src/store/types.ts` | 85 | `lastOrderParserDiagnostics: OrderParserSelectionDiagnostics \| null;` | ✅ | 100% | Zeile + JSDoc (84) löschen |
| 12 | JSDoc-Kommentar mit Feldnamen | `src/store/types.ts` | 138 | `/** PROJ-28: Write step diagnostics after a step completes (replaces lastOrderParserDiagnostics for Step 4) */` | ✅ | 100% | Klammer-Zusatz entfernen |
| 13 | Pick-Union | `src/store/slices/runCrudSlice.ts` | 35 | `\| 'lastOrderParserDiagnostics'` | ✅ | 100% | Zeile löschen |
| 14 | Initial-State | `src/store/slices/runCrudSlice.ts` | 74 | `lastOrderParserDiagnostics: null,` | ✅ | 100% | Zeile löschen |
| 15 | Reset-Batch | `src/store/internal/helpers.ts` | 461 | `lastOrderParserDiagnostics: null,` | ✅ | 100% | Zeile löschen |
| 16 | Format-Setter | `src/store/internal/helpers.ts` | 597 | `set({ lastOrderParserDiagnostics: parseResult.diagnostics ?? null });` | ✅ | 100% | Zeile löschen |
| 17 | Transient-Reset (Phase 2) | `src/store/slices/ingestSlice.ts` | 556 | `lastOrderParserDiagnostics: null,` | ✅ | 100% | Zeile löschen |
| 18 | Transient-Reset (Reprocess) | `src/store/slices/workflowSlice.ts` | 456 | `lastOrderParserDiagnostics: null,` | ✅ | 100% | Zeile löschen |
| 19 | Dead-Trigger-Felder NICHT im Payload (V3 erhalten) | `src/hooks/buildAutoSavePayload.ts` | 42–64 | `return { id, currentParsedRunId, run, invoiceLines, issues, auditLog, parsedPositions, parserWarnings, parsedInvoiceResult, serialDocument, preFilteredSerials, uploadMetadata, runLog }` | ✅ | 100% | `orderPool`/`isPaused`/Waiting-Felder fehlen bewusst |

### 9.2 Exit-Pfad-Inventur — nicht anwendbar

Keine Control-Flow-Änderung. Skip-Return unverändert. `buildAutoSavePayload` Early-Return (`!run → null`) unverändert.

### 9.3 Operations-Reihenfolge

- `useRunAutoSave.subscribe`: Reihenfolge identisch — mehr Skip-Diff-Checks, gleiche Nachfolge.
- `buildAutoSavePayload`: Payload-Key-Berechnung unverändert — nur Zeile 51 konsistent mit 49/50.
- 6 Lösch-Edits: idempotent, keine Reihenfolge-Implikation.

### 9.4 Datenstruktur-Verifikation

| Zugriff im Plan | Angenommene Struktur | Typdefinition | Stimmt? |
|---|---|---|---|
| `state.currentParsedRunId` | `string \| null` | `types.ts:102` | ✅ |
| `state.parsedPositions` | `ParsedInvoiceLineExtended[]` | `types.ts:82` | ✅ |
| `state.parserWarnings` | `InvoiceParserWarning[]` | `types.ts:83` | ✅ |
| `state.preFilteredSerials` | `PreFilteredSerialRow[]` | `types.ts:93` | ✅ |
| `current.parsedInvoiceResult` | `ParsedInvoiceResult \| null` | `types.ts:81` | ✅ |
| `current.uploadedFiles` | `UploadedFile[]` | `types.ts:78` (Feld-Teil des RunState) | ✅ |
| `owned = current.currentParsedRunId === runId` | string-Vergleich | `types.ts:102` + `buildAutoSavePayload.ts:40` | ✅ |

### 9.5 Abnahme

- [x] IST-Code wörtlich zitiert (19 Punkte, inkl. V4-Belegen: uploadMetadata-Ableitung + assignParsedRunId-Standalone + parsedPositions-Co-Mutation)
- [x] Keine Code-Rekonstruktion aus dem Gedächtnis
- [x] Alle Typen gegen `types.ts` verifiziert
- [x] Scope-Validator-Bypass dokumentiert
- [x] V2/V3-Korrekturen integriert
- [x] V4-Feinschliff integriert (Klassifikation echt/sicherheitsnetz + Kongruenz-Regel mit Ableitungs-Klausel)
- [x] Wachhund-Felder 1:1 gegen `buildAutoSavePayload`-Payload abgeglichen
- [ ] **Dom-Freigabe:** Status → VALIDATED (manuell durch Dom nach Review)

---

## 10. Abschluss-Checkliste für Sonnet

- [ ] `npx tsc --noEmit` grün (Exit 0) nach Schritt 8.
- [ ] `rg -n lastOrderParserDiagnostics src/` = **0 Treffer**.
- [ ] `features/INDEX.md` — Eintrag `PROJ-46-M3.5 Leak-Patch` ergänzt.
- [ ] `features/Proj-46_M3-5_Leak-Patch.md` — Status auf `DONE`, Datum aktualisiert.
- [ ] I.md — neue Regel? → Sektion B (§12).
- [ ] C.md — neue Verbindung? → Sektion B (§12).
- [ ] S.md — keine UI-Änderung, kein Edit erwartet.
- [ ] `ownership.md` Zeile 25 — Dom-Entscheidung.

---

## 11. Nützliche Hinweise für Sonnet bei der Durchführung

### 11.1 Fallstricke

1. **Wachhund-Liste ist FINAL: exakt 4 Felder mit Klassifikation (V4).**
   - `currentParsedRunId` — echtes Leck (standalone via `assignParsedRunId(null)`).
   - `parsedPositions` — echtes Leck (Rehydrierungs-/Refactor-Risiko).
   - `parserWarnings` — Sicherheitsnetz (co-mutiert heute).
   - `preFilteredSerials` — Sicherheitsnetz (co-mutiert heute + Hard-Checkpoint).
   
   **Keine weiteren Felder hinzufügen** — auch nicht `orderPool`, `isPaused`, `isWaitingBeforeStep4`, `waitingStep4RunId`, `showStep4WaitingDialog`. Diese stehen nicht im Payload → Dead-Trigger (V3-Verbot erhalten).

2. **Reihenfolge IST Pflicht.** Schritt 3 produziert **absichtlich 6 TS-Errors** als Sollbruch-Radar. Widerstehe dem Impuls, zuerst die Setter zu löschen. Der Compiler zählt dir die echten Lösch-Stellen.

3. **TSC-Policy V2 (harte Gates):**
   - Nach Schritt 2: grün.
   - Nach Schritt 3: 6 Errors (Radar).
   - Nach Schritt 8: grün (Exit 0).
   - Zwischen Schritt 3 und 8 ist `tsc`-rot erwartet.

4. **`OrderParserSelectionDiagnostics`-Import NICHT entfernen** (`types.ts:21`). Der Typ bleibt via `helpers.ts` in Gebrauch. Nur das RunState-Feld fliegt.

5. **Batch-Sets sind Sollbruchstellen.** Bei Löschung einer Zeile niemals versehentlich das Komma der Vorgänger-Zeile mit entfernen. IMMER die ganze Zeile mit eigenem Komma löschen. Nachbarzeilen unangetastet.

6. **`executeStep4Orchestration` Zeile 597 ist ein standalone Einzeiler**, KEIN Teil eines Conditionals. Der nachfolgende `if`-Block (598–606) ist eigenständig. Zeile 597 ersatzlos löschen — KEINEN `if`-Wrapper einführen, KEINE Einrückung ändern.

7. **`useRunAutoSave.ts` Skip-Diff ist eine einzige `if (...)`-Condition mit `&&`-Verkettung.** Bei Einfügen neuer Zeilen:
   - Zwischen-Zeilen enden mit `&&`.
   - LETZTE Zeile OHNE `&&` (aktuell `state.serialDocument === prev.serialDocument`).
   - Nach V4-Einfügung (4 neue Zeilen) ist die letzte Zeile EINE der neuen — dort KEIN `&&`.

8. **`buildAutoSavePayload.ts` Zeile 51 — KEIN neues `owned`-Binding.** `owned` existiert Zeile 40. Direkt nutzen: `owned ? (current.parsedInvoiceResult ?? null) : null`.

9. **`types.ts:138` JSDoc-Bereinigung:** Der Name `lastOrderParserDiagnostics` darf **nirgendwo in `src/`** mehr stehen — auch nicht im Kommentar. Finaler Grep ist harter Gate.

### 11.2 Geschützte Verbindungen (Circuit-Check)

- **I.md A17 (6 Entry-Points):** `startWorkflowPhase2` ist einer davon. Nur den transienten Reset-Batch editieren — Signatur/Reihenfolge bleiben exakt unverändert.
- **C.md A15 (reprocessCurrentRun Sonderpfad):** Drei getrennte `set({...})`-Aufrufe. NICHT zusammenfassen. Nur Zeile 456 berühren.
- **C.md A4 (Step-4-Orchestrierung):** `executeStep4Orchestration` ist kanonische Branch-Stelle. Schritt 6 entfernt nur Legacy-Setter — keine SSOT-/Branch-Änderung.
- **R8 (Primärwriter-Regel):** Keine Cross-Slice-Writes. Jede Löschung respektiert den Primärwriter-Slice.
- **PROJ-49 SSOT (Ownership-Guard):** `parsedInvoiceResult`-Gating ist Fortsetzung des `owned`-Konzepts. KEINE neue Semantik.

### 11.3 Datenfluß-Warnungen (V4 präzisiert)

- **`serialDocument` (`buildAutoSavePayload.ts:52`) ist bewusst NICHT im Scope.** Merge-Layer in `runPersistenceService.saveRun`. Mit-gaten würde PROJ-40-ADD-ON-4 brechen.
- **`uploadMetadata` (55–62) ist eine Ableitung:** Sie wird im Payload geschrieben, aber im Wachhund-Diff **nicht direkt** beobachtet. Abgedeckt durch den Payload-Kongruenz-Grundsatz (V4.2): `uploadMetadata` ist eine direkte, verlässliche Projektion von `uploadedFiles` (`current.uploadedFiles.map(...)`). Solange die UI-Seite `uploadedFiles` typischerweise mit beobachteten Feldern (z. B. `currentParsedRunId` via Ingest-Pfad) co-mutiert, greift der Trigger mit. Eine explizite Aufnahme von `uploadedFiles` in den Diff ist M4-Scope (siehe §12.2 Sektion B).
- **`uploadMetadata`-Doppelguard:** `owned && uploadedFiles.length > 0` ist Absicht (PROJ-49 SSOT-Merge-Schutz). Nicht vereinfachen.
- **V4-Scope-Grenze:** Run-Control-Felder (`orderPool`, `isPaused`, Waiting-Trio) werden weder persistiert noch im Wachhund beobachtet. Persistenz = M4-Aufgabe. Kein Scope-Creep hier.

### 11.4 Dispatch-Warnungen (aus 5c)

- Nach Schritt 3 wirft `tsc` an 6 Stellen Error — dein **Radar**:
  - **Weniger als 6:** Touchpoint übersehen, Plan neu scannen.
  - **Genau 6:** Alles erfasst, fortfahren.
  - **Mehr als 6:** Unbekannter Leser existiert → STOP und Dom fragen (I.md §4 Anti-Looping).

### 11.5 Idempotenz & Guards

- Wachhund-Erweiterung (Schritt 1): keine neuen Writes. Idempotenz durch Zustand-Referenzgleichheit.
- Türsteher-Fix (Schritt 2): nur Wert-Änderung, keine Strukturänderung. `runPersistenceService.saveRun` unverändert.

### 11.6 Reihenfolge-Checkliste (Kurzform)

| Schritt | Datei | Aktion | TSC erwartet |
|---|---|---|---|
| 1 | `useRunAutoSave.ts` | +4 Diff-Felder (2 echte Lecks + 2 Sicherheitsnetze) | grün |
| 2 | `buildAutoSavePayload.ts` | `parsedInvoiceResult` gaten | **grün** (harter Gate) |
| 3 | `types.ts` | Feld + JSDoc (2 Edits) löschen | **rot / 6 Errors** (Radar) |
| 4 | `runCrudSlice.ts` | Pick + Initial (2 Edits) | rot / 4 Errors |
| 5 | `helpers.ts:461` | Reset-Batch-Key | rot / 3 Errors |
| 6 | `helpers.ts:597` | Format-Setter | rot / 2 Errors |
| 7 | `ingestSlice.ts` | Phase-2-Reset-Key | rot / 1 Error |
| 8 | `workflowSlice.ts` | Reprocess-Reset-Key | **grün / Exit 0** (harter Gate) |
| 9 | — | Grep + INDEX + Status | Grep = 0 Treffer |

**Summe:** 8 physische Zeilen-Edits + 2 Logik-Erweiterungen + 0 neue Features.

---

## 12. Neue Vorschläge für I.md / C.md / S.md

### 12.1 Kandidat für I.md Sektion B (V4-Formulierung)

> **B-XX. Wachhund-Payload-Kongruenz-Regel**
> `CONFI: HIGH` — Der `Zustand.subscribe`-Skip-Diff eines AutoSave-Hooks MUSS in einer der folgenden Formen jedes Feld abdecken, das der zugehörige Payload-Builder in die IDB schreibt:
> (a) **direkte Beobachtung:** Das Payload-Feld wird mit `===`-Referenzvergleich zwischen `state` und `prev` verglichen.
> (b) **Ableitungs-Abdeckung:** Das Payload-Feld ist eine direkte, verlässliche Projektion eines anderen beobachteten Feldes (z. B. ist `uploadMetadata` eine `.map()`-Projektion von `uploadedFiles`; sobald `uploadedFiles` im Diff beobachtet ist, löst dessen Mutation den Save aus und erzeugt die korrekte `uploadMetadata`-Payload).
>
> Umgekehrt: Ein Feld, das weder Payload-Mitglied noch Ableitungsquelle eines Payload-Feldes ist, hat im Wachhund-Diff nichts zu suchen (Dead-Trigger-Verbot, erzeugt nur IO-Spikes ohne Persistenz-Wirkung).
>
> `QUELLE:` PROJ-46 M3.5 Leak-Patch, V4-Audit
>
> **Prüfpflicht:** Bei jeder Änderung von `buildAutoSavePayload` (oder einem analogen Payload-Builder) ist der zugehörige Subscribe-Diff gegenzuprüfen und anzupassen. Ableitungs-Abdeckung ist explizit zu dokumentieren (Kommentar oder Plan-Eintrag), sonst gilt (a).

### 12.2 Kandidat für C.md Sektion B (V4-Formulierung)

> **B-YY. AutoSave-Payload ↔ Wachhund-Diff-Verdrahtung**
> `CONFI: HIGH` — Der Payload-Builder (`buildAutoSavePayload`) und der AutoSave-Trigger (`useRunAutoSave`-Subscribe-Diff) bilden ein verdrahtetes Paar. Jedes Payload-Feld MUSS entweder direkt beobachtet oder nachweislich aus einem beobachteten Feld abgeleitet sein.
> `QUELLE:` PROJ-46 M3.5 Leak-Patch, V4-Audit
> ```
> buildAutoSavePayload(runId) schreibt in IDB:
>   id                    ← konstant pro Call (kein Diff nötig)
>   currentParsedRunId    ← direkt im Wachhund (PROJ-46 M3.5)
>   run (=currentRun)     ← direkt im Wachhund
>   invoiceLines          ← direkt im Wachhund
>   issues                ← direkt im Wachhund
>   auditLog              ← direkt im Wachhund
>   parsedPositions       ← direkt im Wachhund (PROJ-46 M3.5), owned-gated
>   parserWarnings        ← direkt im Wachhund (PROJ-46 M3.5), owned-gated
>   parsedInvoiceResult   ← direkt im Wachhund, owned-gated ab PROJ-46 M3.5
>   serialDocument        ← direkt im Wachhund (IDB-Merge-Layer gated)
>   preFilteredSerials    ← direkt im Wachhund (PROJ-46 M3.5)
>   uploadMetadata        ← ABLEITUNG aus uploadedFiles (owned-gated)
>                           → uploadedFiles aktuell NICHT direkt im Diff,
>                             Abdeckung über Co-Mutation mit beobachteten
>                             Ingest-Feldern (parsedInvoiceResult,
>                             currentParsedRunId). Explizite Aufnahme
>                             von uploadedFiles = offener Kandidat für M4.
>   runLog                ← extern via logService, kein Store-Feld
>
> NICHT im Payload / NICHT im Wachhund (Run-Control, M4-Scope):
>   orderPool, isPaused, isWaitingBeforeStep4,
>   waitingStep4RunId, showStep4WaitingDialog
> ```
> **Anti-Regel:** Kein Payload-Feld ohne Abdeckung (direkt oder Ableitung). Kein Diff-Feld ohne Payload-Bezug. Jede Asymmetrie ist ein Bug oder ein dokumentationspflichtiger M-Scope.

---

*Plan erstellt: 2026-04-19 | V2 (Prozess-Korrektur): 2026-04-19 | V3 (Payload-Kongruenz): 2026-04-19 | V4 (Klassifikations-Ehrlichkeit + Ableitungs-Klausel): 2026-04-19 | Autor: Opus 4.7 (Planungsmeister) | Verifikation: 100% gegen IST-Code (Phase-V §9.1/§9.4, 19 Validierungspunkte)*
