# CIRCUIT.md — Verdrahtungsplan (Funktionen & Beziehungen)

> **Was ist das hier?** Der Schaltplan der Codebasis. Zeigt welche Funktionen wie zusammenhängen
> und welche Verbindungen ZWINGEND erhalten bleiben müssen.
> **Wer muss das lesen?** Jeder Agent (Opus, Sonnet, Codex) BEVOR er plant oder codet.
> **Zusammenspiel:** INVARIANTS.md (Gesetze) + CIRCUIT.md (Verdrahtung) + STANDARDS.md (Design/UI).
> **Wichtig:** Nur Verbindungen in Sektion A sind bestätigt. Sektion B enthält Vorschläge.
> **Version:** 1.8 (Nach Slice-Split M3 & Leak-Patch M3.5)

---

## A. Bestätigte Verbindungen (verbindlich)

### A1. Control-Flow-Eintrittspunkte in die Phase-2-/Re-Entry-Engine

Diese 6 Funktionen sind die einzigen legalen **externen Control-Flow-Eintrittspunkte** in
die Workflow-Engine **ab Phase 2 bzw. beim Wiedereinstieg in laufende/angehaltene Steps**:

```
advanceToNextStep(runId, completedStepNo?)  → Normaler Workflow-Fortschritt
retryStep(runId, stepNo)                     → Retry eines fehlgeschlagenen Steps
resumeRun(runId)                             → Fortsetzen nach Pause
proceedStep4FromWaiting()                    → User gibt Step 4 frei
reprocessCurrentRun()                        → Kompletter Neustart ab Step 2
startWorkflowPhase2(runId)                   → Phase-2-Controller (lädt Snapshot, validiert Step 1, delegiert an advanceToNextStep)
```

Jeder andere externe Weg, diese Engine zu starten oder fortzusetzen, ist ein Bug.

**Scope-Klarstellung:** A1 regelt den Control-Flow-Einstieg, NICHT die exklusive
Schreibhoheit über `run.steps[].status`. Execute-Funktionen (`executeMatcherCrossMatch`,
`executeMatcherSerialExtract`, `executeOrderMapping`) setzen ihre eigenen finalen
Step-Status innerhalb des dokumentierten Flows via direktem `set()` — das ist legitim und
Teil der Kette (siehe A3). Ebenso schreiben dokumentierte Reset-/Bypass-Pfade Step-Status
direkt. Verboten sind inoffizielle externe Control-Flow-Einstiege sowie manuelle
Statussprünge außerhalb der in A3 dokumentierten Pfade.

**Nicht Scope von A1:** Phase-1-Erzeugung/Initialisierung (`createNewRun`,
`createNewRunWithParsing`, `createRunSkeleton`, `ingestAndPersistRunData`). Diese Pfade
bringen den Run in Step 1 (`running`), gehören aber nicht zur hier dokumentierten
Phase-2-/Re-Entry-Engine.

### A2. Guard → Execute → Self-Advance Kette (Grundmuster + dokumentierte Ausnahmen)

**Grundmuster — verbindlich für Steps 2, 3 und 4:**

```
Eintrittspunkt
  → runStepGuard(stepNo, runId, get, set)       // Prüft ob Step starten darf
    → [bei Step 3: validateStep3Async]           // MUSS async sein für SSOT
    → [bei Block: updateStepStatus(stepNo,'failed') + return]
    → [bei Skip: updateStepStatus(stepNo,'ok') + advanceToNextStep(runId)]
  → Execute-Funktion                             // Führt die eigentliche Arbeit aus
    → advanceToNextStep(runId, stepNo)           // MUSS am Ende stehen (bei ok/soft-fail)
```

**Dokumentierte Ausnahmen von der Kette:**

*Step 5 — keine Execute-Funktion, kein `runStepGuard`:*
Step 5 läuft synchron über einen eigenen Pfad in `advanceToNextStep`:
`validateStepPrerequisites(5, ...)` direkt (kein Guard-Repair) → `generateStep5Issues(runId)`
→ `advanceToNextStep(runId)` (Auto-Complete). Details → A10.

*Skip-Pfade sind NICHT einheitlich (Targeted- vs. Legacy-Mode):*
- Retry-Skip (`retryStep`) und Resume-Skip (`resumeRun`) rufen
  `advanceToNextStep(runId, stepNo)` im Targeted-Mode auf → Waiting-Point-Check greift.
- Der normale Step-3-Skip in `advanceToNextStep` (Wrapper-Guard sagt „überspringen") ruft
  bewusst `advanceToNextStep(runId)` im Legacy-Mode auf → Waiting-Point wird umgangen.
  Details → A16.

*Step 1 (`createNewRunWithParsing`) nutzt Timer-basierten Auto-Advance:*
Bekannte Legacy-Schuld, KEIN Vorbild. Siehe INVARIANTS A4/A5-Warnhinweis.

### A3. Execute-Funktionen und ihre Pflicht-Ausgänge

Jede Execute-Funktion muss einen dieser realen Ausgänge nehmen. **Self-Advance läuft
genau dann, wenn der gesetzte Step-Status `ok` ODER `soft-fail` ist — niemals bei
`failed`:**

```
executeMatcherCrossMatch()                 — Step 2
  ├─ noMatchCount === 0: set() step2Status='ok'        → advanceToNextStep(runId, 2)
  └─ noMatchCount  >  0: set() step2Status='failed'    → KEIN Advance
  (Step 2 endet NICHT in 'soft-fail' — noMatchCount > 0 ist absichtlich hard-fail,
   um Auto-Advance zu blockieren. PROJ-45-ADD-ON-round4.)

executeMatcherSerialExtract()              — Step 3
  ├─ checksumMatch === true:
  │                     set() step3Status='ok'         → advanceToNextStep(runId, 3)
  ├─ !checksumMatch, nicht hard-fail:
  │                     set() step3Status='soft-fail'  → advanceToNextStep(runId, 3)
  └─ !checksumMatch, shouldHardFail:
                        set() step3Status='failed'     → KEIN Advance
  (Gilt für preFiltered- UND Legacy-Pfad gleichermaßen.)

executeOrderMapping()                      — Step 4
  ├─ notOrderedCount === 0: set() step4Status='ok'        → advanceToNextStep(runId, 4)
  ├─ notOrderedCount  >  0: set() step4Status='soft-fail' → advanceToNextStep(runId, 4)
  └─ Empty-Pool-Blocker:    set() step4Status='failed'    → KEIN Advance → return
```

**Zusätzliche updateStepStatus-Exits (nicht aus der Execute-Funktion selbst):**

```
Guard-/Wrapper-Ebene (async-Wrapper in advanceToNextStep):
  Guard-Block / Wrapper-Exception → updateStepStatus(runId, N, 'failed') → KEIN Advance

Skip-/Bypass-Pfade (Guard sagt „überspringen"):
  Step 3 Guard-Skip              → updateStepStatus(runId, 3, 'ok') → advanceToNextStep(runId) [Legacy]
  Step 4 Pre-Branch-Skips        → updateStepStatus(runId, 4, 'ok') → advanceToNextStep(runId, 4)
    (SSOT openWE='not_provided', Legacy ohne openWE-Datei — siehe A4.)
```

**Hinweis:** Erfolgs- und Soft-Fail-Status werden innerhalb der Execute-Funktionen
ueberwiegend via direktem `set()` geschrieben. **Dokumentierte Ausnahme:** interne
No-Data-/Skip-Pfade innerhalb einer Execute-Funktion koennen `updateStepStatus(..., 'ok')`
nutzen (z. B. Step 3 Legacy ohne `serialDocument`, Step 4 ohne `runLines`). Guard-/
Wrapper-/Pre-Branch-Skip-Pfade nutzen ebenfalls `updateStepStatus()` (uneinheitliche
Schreibwege — bekannte technische Schuld).

**Self-Advance-Bedingung:** Status `ok` ODER `soft-fail` → Advance. Status `failed` →
KEIN Advance. Wenn ein Exit-Pfad weder Advance noch einen finalen Status setzt → Workflow
hängt.

### A4. Step-4-Orchestrierung (drei Pfade, eine Einheit)

Step 4 hat eine Verzweigungslogik die VOR der Execute-Funktion liegt:

```
Step 4 Start
  → autoStartStep4 prüfen (VOR async Block!)
    → false: Waiting Point → proceedStep4FromWaiting() entscheidet
    → true: weiter
  → activeOrderMapperId prüfen
    → 'engine-proj-23':
        → IDB laden (runPersistenceService.loadRun)
        → isSSoTRun?
          ├─ JA → ingestStatus.openWE prüfen
          │    ├─ 'not_provided': Step 4 skip → advanceToNextStep(runId, 4)
          │    ├─ 'ready': executeOrderMapping(parsedOrderPool)
          │    └─ andere: status='failed'
          └─ NEIN (Legacy)
               → openWE File vorhanden?
                 ├─ JA: parseOrderFile → executeOrderMapping(positions)
                 └─ NEIN: Step 4 skip → advanceToNextStep(runId, 4)
    → andere: Legacy OrderMatcher → Step 4 skip
```

### A5. State-Felder — primäre Writer, zusätzliche Writer, Konsumenten

Diese Feldlandkarte unterscheidet bewusst zwischen **primärem Writer** (kanonischer
Schreibpfad), **zusätzlichen legitimen Writern** (Setup/Reset/Bypass im dokumentierten
Flow) und **Konsumenten**:

```
run.steps[].status
  Primärer Writer:      updateStepStatus(runId, stepNo, status)
                        → genutzt von Wrapper-Guards (async-IIFE in advanceToNextStep),
                          Guard-Block-/Skip-Pfaden und Step-4-Pre-Branches
  Zusätzliche Writer    (direktes set() im dokumentierten Flow):
                        → Step-1-Abschluss (createNewRunWithParsing)
                        → executeMatcherCrossMatch  (Step 2)
                        → executeMatcherSerialExtract (Step 3)
                        → executeOrderMapping        (Step 4)
                        → Reset-/Bypass-Pfade (reprocessCurrentRun, dokumentierte Skip-/No-Data-Pfade)
  Konsumenten:          advanceToNextStep (findet running/not-started)
                        retryStep         (prüft status === 'failed')
                        resumeRun         (findet running step)
                        UI                (Fortschrittsanzeige)

isPaused
  Primäre Writer:       pauseRun (→ true), resumeRun (→ false)
  Zusätzliche Writer    (Setup-/Reset-Pfade):
                        → startWorkflowPhase2    (→ false bei Phase-2-Start)
                        → reprocessCurrentRun    (→ false bei Reprocess-Reset)
                        → initialer Store-State  (false)
  Konsumenten:          advanceToNextStep       (bail out wenn true)
                        alle async-Wrapper      (bail out wenn true, vor UND nach Guard)

isWaitingBeforeStep4
  Setter   (→ true):    advanceToNextStep  (Targeted-Mode, completedStepNo === 3,
                                             autoStartStep4 === false)
  Clearer  (→ false):   proceedStep4FromWaiting      (User „Weiter")
                        dismissStep4WaitingDialog    (User „Stop")
                        pauseRun                     (beim Pausieren)
                        reprocessCurrentRun          (Reset)
                        initialer Store-State
  Konsumenten:          UI (zeigt Waiting-Dialog)

issues[]
  Writer:               buildStep1ParserIssues → updateRunWithParsedData (Step 1)
                        Execute-Funktionen (Step 2/3/4)
                        generateStep5Issues           (Step 5 Auto-Complete)
                        manuelle Repair-/Resolve-Actions
                        reprocessCurrentRun           (filtert Steps 2–5 Issues)
  Konsumenten:          Block-Guard in advanceToNextStep (via isIssueBlockingStep)
                        UI (Issue-Anzeige)
```

**Hinweis:** Diese Feldlandkarte ist keine Vollständigkeits-Garantie für jeden einzelnen
`set()`-Aufruf (Initial-State, Store-Rehydration etc.), sondern dokumentiert die
architektonisch relevanten Schreib-/Leseverantwortlichkeiten.

### A6. Idempotenz-Schutz

```
advanceToNextStep (Targeted Mode):
  → Prüft: completedStep.status === 'ok' || 'soft-fail'  → sonst bail out
  → Prüft: kein anderer Step ist 'running'                → sonst bail out
  → Prüft: keine blockierenden Issues                     → sonst bail out

Alle drei Guards MÜSSEN bestehen bevor der nächste Step startet.
Reihenfolge ist relevant — Status vor Running vor Issues.
```

### A7. Import-Verdrahtung: Store Slices & Helpers → Services

Seit dem Slice-Split (M3) ist `runStore.ts` nur noch der Aggregator. Die echten Importe aus den Services finden in den Slices (`src/store/slices/`) und in `internal/helpers.ts` statt:

  ├─ @/services/stepGuard
  │    → validateStepPrerequisites (sync) / validateStep3Async (async)
  │    → applyStepRepairs (async, Side-Effects)
  │
  ├─ @/services/matching/matchingEngine
  │    → executeMatchingEngine  // Aufgerufen aus workflowSlice (Step 4)
  │
  ├─ @/services/matching/orderPool
  │    → buildOrderPool         // Aufgerufen aus ingestSlice / workflowSlice
  │    → consumeFromPool / returnToPool  // Aufgerufen aus mutationSlice
  │
  ├─ @/services/matching/orderParser
  │    → parseOrderFile         // Aufgerufen aus helpers.ts (Legacy Step 4)
  │
  ├─ @/services/runPersistenceService
  │    → loadRun / saveRun      // Aufgerufen aus persistenceSlice & helpers.ts
  │
  ├─ @/hooks/buildAutoSavePayload
  │    → buildAutoSavePayload   // SSOT für IDB-Payload (vernetzt mit useRunAutoSave)
  │
  └─ @/store/masterDataStore
       → useMasterDataStore.getState().articles  // Legacy-Fallback ArtikelstammState().load()     // Guard-Repair: masterData nachladen
```

### A8. runStepGuard-Kette (interne Verdrahtung)

```
runStepGuard(stepNo, runId, get, set)     // internal/helpers.ts (exportiert an stepRunner)
  → buildGuardInput(state)                 // extrahiert 7 Felder aus RunState
  → validateStepPrerequisites(stepNo, runId, guardInput)   // stepGuard.ts, sync
    ├─ Step 2: validateStep2 → prüft parsedInvoiceResult, invoiceLines, masterArticles
    ├─ Step 3: validateStep3 → sync Wrapper (Legacy-Fallback)
    │          validateStep3Async → async, liest IDB, prüft ingestStatus.serialList
    ├─ Step 4: validateStep4 → prüft parsedPositions, falmecArticleNo
    └─ Step 5: validateStep5 → prüft isExpanded, step4.status
  → [bei !canProceed]: applyStepRepairs(result, stepNo, runId, guardInput, set)
    ├─ parsedArticlePool → IDB (SSOT) oder masterDataStore.load() (Legacy)
    ├─ serialData → IDB preFilteredSerials/serialDocument
    └─ parsedPositions → Store-Rekonstruktion oder IDB-Rehydrierung

Aufrufer von runStepGuard: advanceToNextStep, retryStep, resumeRun
Step 5 Guard: direkt validateStepPrerequisites (kein Repair)
reprocessCurrentRun: KEIN Guard — eigener Pfad (load→reset→save→advance)
```

### A9. isIssueBlockingStep — Block-Guard Regeln

```
isIssueBlockingStep(issue, stepNo, config)
  Nur offene/pending Issues UND issue.stepNo === stepNo
  ├─ Step 1: parser-error → IMMER blockiert
  ├─ Step 2: no-article-match, match-artno-not-found, match-ean-not-found,
  │          match-conflict-id, match-ambiguous → IMMER blockiert
  │          price-mismatch → NUR wenn config.blockStep2OnPriceMismatch === true
  ├─ Step 4: order-no-match, order-incomplete, order-assignment
  │          → NUR wenn config.blockStep4OnMissingOrder === true
  └─ Step 5: missing-storage-location, export-no-lines → IMMER blockiert

Aufrufer: advanceToNextStep (vor Status-Transition, nach updateStepStatus 'ok')
```

### A10. Step 5 Sonderbehandlung + Run-Abschluss

```
advanceToNextStep → nextStep.stepNo === 5:
  → validateStepPrerequisites(5, ...) direkt (KEIN runStepGuard, KEIN Repair)
  → generateStep5Issues(runId)              // Issues erzeugen BEVOR auto-complete
  → advanceToNextStep(runId)                // Auto-Complete Step 5 (synchron, kein Timer)

advanceToNextStep → KEIN nextStep (alle Steps fertig):
  → updateRunStatus(runId, 'ok')            // Run abgeschlossen
  → archiveService.cleanupBrowserData(runId) // Browser-Cleanup (async, fire-and-forget)
```

### A11. resumeRun — Re-Trigger-Logik (Guard + Execute, KEIN advanceToNextStep)

```
resumeRun(runId):
  → isPaused = false
  → updateRunStatus(runId, 'running')
  → Findet running Step
  → await runStepGuard(stepNo, runId, get, set)   // PFLICHT (INVARIANTS A8)
    // Guard ist nötig weil: Browser kann während Pause geschlossen worden sein
    // → Zustand-Store ist leer → applyStepRepairs rehydriert aus IDB
  → if (isPaused) return                           // Zweiter Pause-Check nach async Guard
  → re-triggert Execute-Funktion:
    ├─ Step 2: executeMatcherCrossMatch() → Self-Advance nach Erfolg
    ├─ Step 3: executeMatcherSerialExtract() → Self-Advance nach Erfolg
    ├─ Step 4: gleiche SSOT/Legacy-Verzweigung wie advanceToNextStep
    └─ KEIN advanceToNextStep als Einstieg (würde Step als 'ok' markieren)

WICHTIG: resumeRun ruft NICHT advanceToNextStep direkt auf —
         es feuert Guard + Execute, die Execute-Funktion advanced dann selbst.
```

### A12. Kanonisierung am Vergleichspunkt

`orderParser.ts` produziert `orderNumber` bewusst im Originalformat (z. B. `"20.007"`
oder `"RE-20007"`). `extractOrderNumber()` trimmt den Rohwert und gibt ihn unverändert
zurück — es findet KEIN destruktives Normalisieren als Speicher-/Transformationsschritt
im Parser statt. Die destruktive Kanonisierung `replace(/\D/g, '').slice(-5)` ist
ausschließlich Aufgabe des jeweiligen Vergleichspunkts.

```
Eingabe (roh, z. B. "20.007" oder "RE-20007")
  → Parser: extractOrderNumber() trimmt nur, speichert Originalformat
  → Vergleichspunkt: digitsOnly = value.replace(/\D/g, '')   // → "20007"
  → Vergleichspunkt: compareValue = digitsOnly.slice(-5)      // → "20007"
  → DANN ERST: Validierung, IDB-Persistenz, Pool-Matching gegen PDF-Kandidaten
```

**Zwei getrennte Verantwortungen:**

*Parser (`orderParser.ts`) — tolerantes Regex auf Rohwerten:*
`orderNumberRegex` wird direkt auf den (trimmed) Rohwert angewendet, und zwar sowohl beim
Spalten-Scoring (`scoreOrderNumberCandidates`) als auch beim Row-Filter. Das Profil-Regex
MUSS deshalb tolerant formuliert sein und beide Schreibweisen akzeptieren
(`"20.007"` und `"20007"`). Der Parser macht selbst keine destruktive Kanonisierung — er
ist der Entry-Point, der beide Formen durchlassen muss.

*Vergleichspunkte — alle MÜSSEN explizit destruktiv kanonisieren:*

```
orderMapper.ts                           → stagePerfectMatch + stageReferenceMatch
run1PerfectMatch.ts                      → Kandidaten-Loop
run2PartialFillup.ts                     → Kandidaten-Loop
validateAgainstInvoice()                 → Step-3-Smart-Validation
FalmecMatcher_Master.serialExtract()     → Step-3-Matcher
```

**Architektur-Anti-Regel (Vergleichspunkte):** `.slice(-5)` allein reicht nicht mehr.
Sobald `orderNumber` Originalformat enthalten darf, liefert ein roher `.slice(-5)` auf
`"20.007"` den Wert `"0.007"` statt `"20007"`. Jeder Vergleich, der `orderNumber` gegen
einen PDF-Kandidaten stellt, MUSS zuerst `replace(/\D/g, '')` anwenden und erst danach
`.slice(-5)` nehmen.

**Parser-Regel (Profil-Verantwortung):** Verantwortlich für Datenverlust-Vermeidung im
Parser ist NICHT ein Verbot von Regex-auf-Rohwerten, sondern die tolerante
Profil-Formulierung. Ein zu enges Profil-Regex (z. B. `^1\d{4}$`) würde `"20.007"` direkt
verwerfen — korrekt ist ein tolerantes Muster, das beide Schreibweisen durchlässt, damit
der Wert überhaupt bis zum kanonisierenden Vergleichspunkt gelangt.

### A13. Pool-seitige Kanonisierung in der Matching-Engine (PFLICHT ab PROJ-45)

Nach PROJ-45 enthält `orderNumber` in `ParsedOrderPosition` das Originalformat mit optionalem
Tausenderpunkt (z. B. "20.007"). Jede Stelle die `orderNumber` für einen Referenzvergleich nutzt,
MUSS explizit kanonisieren — `replace(/\D/g, '').slice(-5)` — bevor sie mit einem PDF-Kandidaten
vergleicht. `.slice(-5)` allein reicht nicht mehr (ergibt "0.007" statt "20007").

```
Pool-seitige Kanonisierung (PFLICHT):
  orderMapper.ts       stagePerfectMatch   → op.orderNumber.replace(/\D/g, '').slice(-5)
  orderMapper.ts       stageReferenceMatch → op.orderNumber.replace(/\D/g, '').slice(-5)
  run1PerfectMatch.ts  Kandidaten-Loop     → entry.position.orderNumber.replace(/\D/g, '').slice(-5)
  run2PartialFillup.ts Kandidaten-Loop     → entry.position.orderNumber.replace(/\D/g, '').slice(-5)

PDF-Seite (bereits korrekt):
  orderMapper.ts       stagePerfectMatch   → candidateRef.replace(/\D/g, '').slice(-5)
  orderMapper.ts       stageReferenceMatch → candidateRef.replace(/\D/g, '').slice(-5)
  run1PerfectMatch.ts  Kandidaten-Loop     → candidateRef.replace(/\D/g, '').slice(-5)
  run2PartialFillup.ts Kandidaten-Loop     → candidateRef.replace(/\D/g, '').slice(-5)
```

**Warum?** Vor PROJ-45 normalisierte `extractOrderNumber` destruktiv (entfernte Punkte). Diese
implizite Vorbedingung ist entfernt. Die Kanonisierung muss jetzt explizit am Vergleichspunkt erfolgen.
`QUELLE:` PROJ-45-RE-REGEX

### A14. Pause-Guard-Hazard in Execute-Funktionen (Dangling-Step)

Pause wird ausschließlich an Wrapper-/Entry-Stellen geprüft (Entry von `advanceToNextStep`
sowie in den async-Wrappern vor dem Execute-Aufruf). Die Execute-Funktionen selbst sind
intern NICHT pause-aware — sie sind nicht unterbrechbar.

Ein Pause-Signal kann ein bereits laufendes Execute nicht stoppen; der Step wird zu Ende
finalisiert, während der anschließende Self-Advance am Pause-Guard hängen bleibt:

```
Hazard-Sequenz (Dangling-Step):
  Step N = 'running' — Execute läuft
  → User pausiert → isPaused = true
  → Execute läuft durch bis zum Ende (nicht unterbrechbar)
  → Execute schreibt Step-Status = 'ok' via set()
  → Execute ruft Self-Advance: advanceToNextStep(runId, N)
  → advanceToNextStep sieht isPaused → bail out (kein neuer Step-Start)

Ergebnis:
  Step N = 'ok', Step N+1 = 'not-started', KEIN Step ist 'running'
  → resumeRun() findet keinen laufenden Step → Workflow bleibt hängen
```

Architektur-Lage der `isPaused`-Prüfung:

```
advanceToNextStep           → Entry ✓
async-Wrapper               → vor Execute-Aufruf ✓ (vor UND nach Guard)
executeMatcherCrossMatch    → intern ✗ (nicht unterbrechbar)
executeMatcherSerialExtract → intern ✗ (nicht unterbrechbar)
executeOrderMapping         → intern ✗ (nicht unterbrechbar)
```

Wer Execute-Funktionen anfasst, muss diesen Hazard mitdenken: Entweder interne
Pause-Awareness ergänzen oder den Self-Advance so absichern, dass kein Dangling-Step
entsteht.

### A15. reprocessCurrentRun — eigener Pfad, Guard-Bypass (Absicht)

`reprocessCurrentRun` ist ein dokumentierter Sonderpfad und nutzt bewusst KEINEN
`runStepGuard`. Der eigene Integritätscheck ist **SSOT-spezifisch** und greift nur, wenn
der geladene Run ein `ingestStatus`-Objekt hat.

```
reprocessCurrentRun(runId):
  → loadPersistedRun(runId)                           // IDB laden (In-Memory-Snapshot)
  → runPersistenceService.loadRun(runId) → idbData
  → SSOT-spezifischer Integritätscheck:
      if (idbData?.ingestStatus) {
        // Nur für SSOT-Runs — Legacy-Runs haben kein ingestStatus
        if (pdf !== 'ready' || articleList !== 'ready') → Abbruch
      }
  → Reset Steps 2–5 auf 'not-started'
  → buildAutoSavePayload → saveRun                    // IDB persist
  → advanceToNextStep(runId)                          // Legacy-Mode (kein completedStepNo)
    → runStepGuard für Step 2 greift hier             // normaler Guard-Flow übernimmt ab Step 2
```

Kein `runStepGuard` an dieser Stelle ist Absicht — der eigene Integritätscheck ist der
Ersatz, aber NUR für SSOT-Runs (Runs mit `idbData.ingestStatus`). Für Legacy-Runs ohne
`ingestStatus` existiert dieser spezifische SSOT-Check so nicht; sie laufen ohne eigenen
Pre-Check weiter in Richtung `advanceToNextStep`. Danach übernimmt
`advanceToNextStep(runId)` in beiden Fällen wieder den normalen Guard-Flow ab Step 2.

Wer `reprocessCurrentRun` berührt, muss den Guard-Ersatz mitdenken — NICHT als Bug
behandeln.

### A16. Step-4-Waiting-Point — Verdrahtung und Skip-Differenzierung

Der Waiting-Point sitzt im Targeted-Mode von `advanceToNextStep` bei
`completedStepNo === 3`. `dismissStep4WaitingDialog` ist der Stop-Pfad.
`proceedStep4FromWaiting()` führt über Legacy-Mode weiter.

```
Step 3 → Step 4 Transition (Targeted-Mode, completedStepNo === 3):
  step3.status === 'ok' || 'soft-fail'
    → config.autoStartStep4 === false?
      ├─ JA: set(isWaitingBeforeStep4, waitingStep4RunId, showStep4WaitingDialog)
      │       → STOP (kein Advance)
      │       → User STOP:   dismissStep4WaitingDialog() → State-Reset, kein Advance
      │       → User WEITER: proceedStep4FromWaiting() → advanceToNextStep(runId) [Legacy]
      └─ NEIN: normaler Step-4-Start (Targeted-Mode läuft weiter)
```

**Skip-Differenzierung (PFLICHT beachten):**

```
Normaler Step-3-Skip in advanceToNextStep:
  → ruft advanceToNextStep(runId) auf [Legacy-Mode — kein completedStepNo]
  → Waiting-Point-Check wird NICHT ausgelöst (completedStepNo === undefined)
  → Waiting-Point wird bewusst umgangen

Retry-Skip (retryStep):
  → ruft advanceToNextStep(runId, 3) auf [Targeted-Mode]
  → completedStepNo === 3 → Waiting-Point-Check wird ausgeführt

Resume-Skip (resumeRun):
  → ruft advanceToNextStep(runId, 3) auf [Targeted-Mode]
  → completedStepNo === 3 → Waiting-Point-Check wird ausgeführt
```

Ort: `advanceToNextStep`, Targeted-Mode, `completedStepNo === 3`.
NICHT im Step-Guard-System — rein konfigurationsgesteuertes UI-Gate.

### A17. Destruktiver UI-Cleanup kann In-Flight-Step-Start und Folgepfade zerstören

Ein destruktiver UI-Cleanup (Unmount/Re-Mount) kann `setCurrentRun(null)` bzw.
`resetRunSensitiveState()` auslösen und dadurch run-sensitive Felder leeren, die
für Guard-Reparaturen, Step-Start, Skip-/Fallback-Verzweigung oder den Eintritt in eine
Execute-Funktion benötigt werden.

```
Gefahrenbeziehung:
  Destruktiver UI-Cleanup
    → setCurrentRun(null)
    → resetRunSensitiveState()
      ├─ preFilteredSerials = []   ← beeinflusst Step-3-Startpfad / Smart-Validation
      ├─ serialDocument = null     ← beeinflusst Legacy-Skip-/Fallback-Verzweigung in Step 3
      ├─ parsedPositions = []      ← beeinflusst Step-4-Guard-Reparatur und Execute-Einstieg
      └─ parsedInvoiceResult       ← run-sensitives Kontextfeld für Rekonstruktion/Rehydrierung
```

**Wichtige Präzisierung:** Die Execute-Funktionen snapshotten diese Store-Felder typischerweise
beim Eintritt. Das Haupt-Risiko ist daher NICHT ein beliebiges Mid-Function-Live-Read, sondern
ein destruktiver Reset kurz VOR dem Guard/Execute-Start, zwischen Re-Mount und Re-Entry oder
zwischen Status-Übergabe und nachfolgendem Step-Start.

**Folgen (stilles Fehlverhalten, keine Exception):**
- Step 3: Reset vor `executeMatcherSerialExtract()` bzw. vor dessen Branch-Entscheidung kann
  `preFilteredSerials`/`serialDocument` leeren → Legacy-/No-Document-Pfad → Step endet `ok`
  OHNE S/N-Zuweisung.
- Step 4: Reset vor Guard-Reparatur oder vor `executeOrderMapping()` kann `parsedPositions`
  leeren → Rehydrierungs-/Blockerpfad, leerer Pool oder `step failed`.

**Felder, die während `status='running'` erhalten bleiben MÜSSEN:**
`preFilteredSerials`, `serialDocument`, `parsedPositions`, `parsedInvoiceResult`.

**Nicht betroffen** (kein Cleanup-Risiko): `invoiceLines` (Snapshot in lokaler Variable),
`runs[]` (Schreibpfad läuft runId-Closure-sicher), `orderPool` als Step-4-Input der
Matching-Engine selbst (wird in `executeOrderMapping` nicht als Eingang gelesen, sondern
erst als Ergebnis persistiert).

Ein koordinierter symmetrischer Cleanup ist zulässig, sofern er durch Store-First-Guard
und Abo-/Subscription-Pattern abgesichert ist. Verboten ist der unkoordiniert-destruktive
Cleanup während laufender Workflows.

### A18. IDB-First Datenfluss für Guards (R4)
Der `stepGuard` (und alle untergeordneten Validierungen) darf für seine Prüfungen AUSSCHLIESSLICH aus der indizierten Datenbank (`runPersistenceService`) oder dem `masterDataStore` lesen. 
Ein direkter Lesezugriff auf flüchtige UI-State-Felder wie `uploadedFiles` oder ein "Live-Parsing" während des Guards ist strengstens verboten.
*AUSNAHME-KLAUSEL:* Wenn eine neue Datenquelle zwingend aus dem RAM gelesen werden muss, weil sie nicht persistierbar ist, gilt HARTER STOPP. Dom fragen!

**A19. Entkopplung von UI-Interaktion und Workflow-Logik**
UI-Komponenten rufen fachliche Actions auf, anstatt Workflow-Status-Übergänge direkt zu steuern. Die Engine entscheidet autonom basierend auf dem Resultat einer Action über den Folgezustand. Dies sichert die Architektur gegen unvorhergesehene State-Sprünge aus der View-Ebene ab.
*AUSNAHME-KLAUSEL:* Wenn eine neue Datenquelle zwingend aus dem RAM gelesen werden muss, weil sie nicht persistierbar ist, gilt HARTER STOPP. Dom fragen!

---

## B. Vorgeschlagene Verbindungen (noch nicht bestätigt — NICHT verbindlich)

> Hier landen neue Erkenntnisse über Funktionsbeziehungen aus Bugfixes und Features.
> **Agenten:** Nur Sektion A ist bindend. Sektion B ist rein informativ — befolge diese NICHT als Regeln.
> **Dom:** Prüfe diese Vorschläge wenn du Zeit hast:
> - Markiere mit `[✓]` → Agent verschiebt nach Sektion A beim nächsten Task.
> - Markiere mit `[✗]` → Agent löscht den Eintrag beim nächsten Task.
> - Ändere den Text direkt inline falls die Verbindung angepasst werden soll.

### Format für neue Vorschläge:

> **B[Nr]. [Titel]**
> `CONFI: HIGH | MID | LOW` — [Einzeiler-Begründung]
> `QUELLE:` [Ticket/Projektdatei]
> ```
> [Verdrahtung in Schaltplan-Notation]
> ```

überführt: A12 überschrieben, A14–A17 neu angelegt.)*


> **B1. AutoSave-Payload ↔ Wachhund-Diff-Verdrahtung**
> `CONFI: HIGH` — Der Payload-Builder (`buildAutoSavePayload`) und der AutoSave-Trigger (`useRunAutoSave`-Subscribe-Diff) bilden ein verdrahtetes Paar. Jedes Payload-Feld MUSS im Zustand-Diff entweder direkt beobachtet (`===`) oder nachweislich aus einem beobachteten Feld abgeleitet sein (z.B. `uploadMetadata` wird nur indirekt über co-mutierende Ingest-Felder abgedeckt).
> `QUELLE:` PROJ-46 M3.5 Leak-Patch, V4-Audit
> ```
> NICHT im Payload / NICHT im Wachhund (Run-Control):
>   orderPool, isPaused, isWaitingBeforeStep4, waitingStep4RunId, showStep4WaitingDialog
> 
> WICHTIG: Die Erweiterung der IDB-Persistenz auf diese flüchtigen Run-Control-Felder 
> ist exklusiver Architektur-Scope ab M4.


> ```


---

*Letzte Aktualisierung: 2026-04-20 | Quelle: Audit_M3.5_Execution.md*
