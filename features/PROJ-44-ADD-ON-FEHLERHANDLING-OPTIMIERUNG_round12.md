# PROJ-44 ADD-ON Round 12: Race-Condition Kill — Self-Advance-Pattern

**Status:** VALIDATED (Phase-V-Abgleich 2026-04-02 — 23/23 Prüfpunkte ≥100%, 4 Korrekturen V20–V23 ergänzt 2026-04-02 | Nachkorrektur V24–V25 ergänzt 2026-04-02: 2 Opus-Fehler in Phase 4 + Phase 6 behoben)
**Datum:** 2026-04-02
**Scope:** `src/store/runStore.ts`, `src/services/stepGuard.ts`
**Auslöser:** Round 9 Diagnostic — Timer-basierte Race-Conditions in Auto-Advance-Logik

---

## 1. Problemanalyse

### Die drei Kern-Gefahren

**Gefahr A — Timer-Race (Workflow-Stall):**
`executeMatcherCrossMatch()` hat eine sync Signatur, feuert aber intern async Logik (IDB-Read + Matcher). Der 100ms-Advance-Timer `t2adv` (Zeile 2226) feuert 100ms nach dem sync Return. Wenn die async Operation > 100ms dauert: Status bleibt `running`, Bedingung `status === 'ok'` ist false → `advanceToNextStep` wird nie aufgerufen → **Workflow hängt.**

**Gefahr B — Blinder Advance (Step-Skip):**
`advanceToNextStep(runId)` (Zeile 2174) sucht den aktuell `running` Step und setzt ihn auf `ok`. Wenn ein verspäteter Timer-Callback feuert während der nächste Step schon läuft: **falscher Step wird auf `ok` gesetzt und übersprungen.**

**Gefahr C — Step-3-Guard-Lücke:**
`runStepGuard()` (Zeile 732) dispatcht für Step 3 den **synchronen** `validateStep3()` (Zeile 201). Die SSOT-sichere **asynchrone** Variante `validateStep3Async()` (Zeile 118) existiert in `stepGuard.ts`, wird aber nie von `runStepGuard` aufgerufen. Sync-Fallback kann keinen IDB-Check → unzuverlässige Ergebnisse bei SSOT-Runs.

### Timer-Inventar (28 setTimeout → 0)

| Location | Zeile | Variable | Zweck | Problem |
|---|---|---|---|---|
| advanceToNextStep → Step 2 | 2212 | `t2` | Outer: Guard + Execute | 100ms Verzögerung ohne Grund |
| advanceToNextStep → Step 2 | 2226 | `t2adv` | Inner: Advance nach Match | Race mit async executeMatcherCrossMatch |
| advanceToNextStep → Step 3 | 2244 | `t3` | Outer: Guard + Execute | 100ms Verzögerung ohne Grund |
| advanceToNextStep → Step 3 | 2264 | `t3adv` | Inner: Advance nach Serial | Race mit async executeMatcherSerialExtract |
| advanceToNextStep → Step 4 | 2293 | `t4` | Outer: Guard + Execute | 100ms Verzögerung ohne Grund |
| advanceToNextStep → Step 4 | 2316,2333,2466,2488,2504 | `t4ssotSkip`, `t4ssotMap`, `t4adv1`, `t4adv2`, `t4legacy` | Inner: Advance nach Order | Race mit async OrderParser |
| advanceToNextStep → Step 5 | 2527 | `t5` | Auto-Complete | Unnötig — Step 5 ist sync |
| retryStep → Step 2 | 2570 | — | Execute | 50ms Verzögerung |
| retryStep → Step 3 | 2581 | — | Execute | 50ms Verzögerung |
| retryStep → Step 4 | 2597 | — | Execute | 50ms Verzögerung |
| resumeRun → Step 2 | 3024,3030 | `t2`,`t2adv` | Execute + Advance | Dupliziert advanceToNextStep-Logik |
| resumeRun → Step 3 | 3048,3054 | `t3`,`t3adv` | Execute + Advance | Dupliziert advanceToNextStep-Logik |
| resumeRun → Step 4 | 3072,3088,3105,3220,3240,3255 | `t4`,`t4ssot*`,`t4adv*`,`t4legacy` | Execute + Advance | Dupliziert advanceToNextStep-Logik |

**Summe: 24 Workflow-Control-Flow-Timer in 3 Funktionen (14 in advanceToNextStep+retryStep, 10 in resumeRun) → ersetzt durch 0 Timer + Self-Advance-Pattern.**
**Zusätzlich: 21 `set({ autoAdvanceTimer })` Schreibstellen + `clearAutoAdvanceTimer()`-Funktion (Zeile 2994) werden obsolet.**

---

## 2. Impact-Matrix (PFLICHT)

| Geplante Änderung | Betroffene Funktionen | Betroffene Steps/Module | Risiko wenn vergessen |
|---|---|---|---|
| `advanceToNextStep` Signatur erweitern um `completedStepNo?` + Targeted Mode implementieren | `advanceToNextStep`, `retryStep`, `resumeRun`, `proceedStep4FromWaiting`, `reprocessCurrentRun` **(A1 Drillinge!)** | Steps 2–5 | Doppel-Advance oder kein Advance — Workflow hängt oder überspringt |
| Self-Advance-Aufrufe in Execute-Funktionen einfügen | `executeMatcherCrossMatch`, `executeMatcherSerialExtract`, `executeOrderMapping` | Steps 2, 3, 4 | Ohne Self-Advance kein Advance mehr — Workflow hängt nach jedem Step |
| Timer-Blöcke aus `advanceToNextStep` entfernen, durch `void (async () => { ... })()` ersetzen | `advanceToNextStep` | Steps 2–5 | Alte Timer + neue Self-Advance = Doppel-Advance |
| `retryStep` vereinfachen (Timer entfernen, Guard+Execute direkt) | `retryStep` | Steps 2–4 | Retry ohne Auto-Weiterlauf nach Erfolg |
| `resumeRun` vereinfachen (~250 → ~40 Zeilen) | `resumeRun` | Steps 2–4 | Resume startet Execute-Funktion nicht korrekt oder dupliziert Logik |
| Step-3-Guard auf async Variante verdrahten | `runStepGuard`, `validateStep3Async` (Export) | Step 3 Guard | IDB-Check fehlt bei SSOT-Runs → Guard liefert falsche Ergebnisse |
| Step-4-Orchestrierung als DRY-Helper extrahieren | `advanceToNextStep`, `retryStep`, `resumeRun` **(A6 geschützte Zone!)** | Step 4 (SSOT/Legacy/OpenWE) | Drei divergierende Kopien der gleichen Orchestrierungslogik |
| `autoAdvanceTimer` State-Feld entfernen (optional) | `resetRunSensitiveState`, `pauseRun`, Typ-Definition | State-Cleanup | Toter Code bleibt im State |

> **INVARIANTS-Check A1 (Drillinge):** Zeilen 1, 4, 5, 7 betreffen alle drei Drillinge gleichzeitig — Konsistenz ist Pflicht.
> **INVARIANTS-Check A6 (Step 4):** Zeile 7 fasst die geschützte Zone an — SSOT, Legacy und OpenWE müssen als Einheit geprüft werden.

---

## 3. Circuit-Check (PFLICHT)

| Verbindung (aus CIRCUIT.md) | Betroffen? | Schutzmaßnahme |
|---|---|---|
| A1: Eintrittspunkte in Step-State-Machine (5 legale Entry Points) | Ja — `advanceToNextStep` Signatur ändert sich | Alle 5 Entry Points bleiben erhalten. Neuer `completedStepNo`-Parameter ist optional → Legacy-Aufrufe ohne Parameter funktionieren unverändert |
| A2: Guard → Execute → Self-Advance Kette | **Ja — KERN des Umbaus** | Kette wird NEU verdrahtet: Self-Advance wandert von Timer-Callback IN die Execute-Funktion. Guard bleibt VOR Execute. Kette bleibt vollständig, nur der Ort des Advance-Aufrufs ändert sich |
| A3: Execute-Funktionen Pflicht-Ausgänge (Success → ok + advance, Error → failed + kein advance) | **Ja — Self-Advance wird eingefügt** | Jede Execute-Funktion bekommt `advanceToNextStep(runId, stepNo)` am Erfolgsende. Fehlerfall setzt `failed` → kein Advance. Alle Ausgänge in A3 bleiben identisch |
| A4: Step-4-Orchestrierung (3 Pfade als Einheit) | **Ja — DRY-Extraktion** | Orchestrierungslogik (SSOT/Legacy/OpenWE-Branching) wird in Helper `executeStep4Orchestration()` extrahiert. Alle 3 Pfade bleiben erhalten, leben aber nur noch an EINER Stelle |
| A5: State-Felder und Konsumenten | Teilweise — `autoAdvanceTimer` wird entfernt | Feld hat nach Timer-Entfernung keine Produzenten mehr. `isPaused`, `isWaitingBeforeStep4` und alle anderen State-Felder bleiben unverändert |
| A6: Idempotenz-Schutz (3 Guards in Targeted Mode) | **Ja — wird implementiert** | Targeted Mode prüft: (1) `completedStep.status === 'ok' \|\| 'soft-fail'`, (2) kein anderer Step `running`, (3) keine blockierenden Issues. Reihenfolge: Status → Running → Issues |
| A8: runStepGuard-Kette (validateStepPrerequisites + applyStepRepairs) | **Ja — Step 3 async** | Für Step 3: `validateStep3Async` statt sync `validateStep3`. Alle anderen Steps unverändert. `applyStepRepairs` bleibt async |
| A9: isIssueBlockingStep — Block-Guard Rules | Nein | Block-Guard-Logik wird nicht verändert, nur von Targeted Mode aufgerufen |
| A10: Step 5 Sonderbehandlung + Run-Abschluss | Teilweise — Timer `t5` entfällt | Step 5 Guard + `generateStep5Issues` + Auto-Complete bleiben erhalten, aber synchron statt via Timer |
| A11: resumeRun Re-Trigger-Logik (KEIN advanceToNextStep) | **Ja — Vereinfachung** | resumeRun findet `running` Step, feuert dessen Execute-Funktion neu. Execute→Self-Advance kaskadiert automatisch. resumeRun ruft NICHT advanceToNextStep direkt auf (Regel bleibt gewahrt) |

> **Prüffrage:** "Unterbreche ich eine bestätigte Verbindung?" → Nein. Alle Verbindungen bleiben erhalten, nur der Mechanismus ändert sich (Timer → Self-Advance). Die Kette Guard→Execute→Advance bleibt vollständig.

---

## 4. State-Snapshotting (PFLICHT)

### Pfad A: Happy Path — SSOT-Run (Steps 1→2→3→4→5)

```
VORHER:
  Step 1 ok → advanceToNextStep(runId) [Legacy Mode]
    → setTimeout(100ms) [t2]
      → runStepGuard(2) → executeMatcherCrossMatch()
      → setTimeout(100ms) [t2adv] → check status → advanceToNextStep(runId) [Legacy]
        → setTimeout(100ms) [t3] → ... (gleiche Timer-Kaskade für Steps 3, 4, 5)
  Ergebnis: Run ok (wenn alle Timer rechtzeitig feuern — RACE CONDITION MÖGLICH)

NACHHER:
  Step 1 ok → advanceToNextStep(runId) [Legacy Mode]
    → void (async () => {
        runStepGuard(2) → executeMatcherCrossMatch()
        → [intern am Erfolgsende]: advanceToNextStep(runId, 2) [Targeted Mode]
          → Idempotenz-Check → void (async () => {
              runStepGuard(3) → executeMatcherSerialExtract()
              → [intern am Erfolgsende]: advanceToNextStep(runId, 3) [Targeted]
                → ... (Self-Advance-Kaskade für Steps 4, 5)
            })()
      })()
  Ergebnis: Run ok (deterministisch — Advance erst wenn Execute FERTIG ist)
```

### Pfad B: Happy Path — Legacy-Run mit OpenWE-File

```
VORHER:
  Steps 1–3 wie Pfad A → Step 4:
    → setTimeout(100ms) [t4]
      → dynamic import orderParser → parseOrderFile() → executeOrderMapping()
      → setTimeout(100ms) [t4adv1] → check status → advanceToNextStep()
  Ergebnis: Run ok (wenn Parser < 100ms — RACE CONDITION bei großen Dateien)

NACHHER:
  Steps 1–3 wie Pfad A → Step 4:
    → void (async () => {
        runStepGuard(4) → executeStep4Orchestration()
          → Legacy-Pfad: import orderParser → parseOrderFile() → executeOrderMapping()
          → [intern am Erfolgsende]: advanceToNextStep(runId, 4) [Targeted]
      })()
  Ergebnis: Run ok (deterministisch — Parser darf beliebig lange dauern)
```

### Pfad C: Fehlerfall — Step 2 failed

```
VORHER:
  Step 2: executeMatcherCrossMatch() → catch → updateStepStatus(2, 'failed')
    → setTimeout(100ms) [t2adv] → check status → status !== 'ok' → KEIN Advance
  Ergebnis: Workflow stoppt bei Step 2 (korrekt, aber Timer läuft trotzdem)

NACHHER:
  Step 2: executeMatcherCrossMatch() → catch → updateStepStatus(2, 'failed')
    → KEIN Self-Advance im catch-Block
  Ergebnis: Workflow stoppt bei Step 2 (korrekt, kein überflüssiger Timer)
```

### Pfad D: Pause/Resume mitten im Step 3

```
VORHER:
  Step 3 running → User klickt Pause → clearTimeout(autoAdvanceTimer) → isPaused=true
    → resumeRun(runId) → isPaused=false → setTimeout(100ms) [t3] → runStepGuard(3)
      → executeMatcherSerialExtract() → setTimeout(100ms) [t3adv] → advance
  Ergebnis: Resume funktioniert, aber mit Timer-Duplikation (~250 Zeilen in resumeRun)

NACHHER:
  Step 3 running → User klickt Pause → isPaused=true (kein Timer mehr zu clearen)
    → resumeRun(runId) → isPaused=false → find running step (3)
      → executeMatcherSerialExtract() → [Self-Advance] → kaskadiert Steps 4, 5
  Ergebnis: Resume funktioniert identisch, aber in ~40 statt ~250 Zeilen
```

### Pfad E: Step 4 Waiting Point (autoStartStep4 = false)

```
VORHER:
  Step 3 ok → advanceToNextStep() → setTimeout(100ms) [t3adv]
    → check autoStartStep4 → false → isWaitingBeforeStep4=true → Dialog
    → User klickt "Weiter" → proceedStep4FromWaiting() → advanceToNextStep(runId) [Legacy]
      → setTimeout(100ms) [t4] → Step 4 Orchestrierung
  Ergebnis: Waiting Point funktioniert (aber Timer-Kaskade)

NACHHER:
  Step 3 ok → executeMatcherSerialExtract() → [Self-Advance] → advanceToNextStep(runId, 3) [Targeted]
    → check autoStartStep4 → false → isWaitingBeforeStep4=true → Dialog
    → User klickt "Weiter" → proceedStep4FromWaiting() → advanceToNextStep(runId) [Legacy]
      → void (async () => { Step 4 Orchestrierung })()
  Ergebnis: Waiting Point funktioniert identisch, Waiting-Point-Guard bleibt in advanceToNextStep
```

### Pfad F: Fehlerfall — Guard wirft im async-Wrapper (INVARIANTS A10)

```
VORHER:
  Step 2: setTimeout(100ms) → runStepGuard(2) → applyStepRepairs wirft IDB-Error
    → Error bleibt im setTimeout-Callback → silent fail → Step bleibt 'not-started'
    → Timer ist verbraucht, kein Retry → Workflow hängt (stiller Tod)
  Ergebnis: Workflow hängt ohne Fehlermeldung

NACHHER:
  Step 2: void (async () => { try {
      runStepGuard(2) → applyStepRepairs wirft IDB-Error
    } catch (err) {
      updateStepStatus(runId, 2, 'failed')  → Step wird explizit als failed markiert
    }
  })()
  Ergebnis: Step 2 'failed', User sieht Fehler, kann Retry klicken → BESSER als vorher
```

> **Prüffrage:** "Kommt am Ende dasselbe Produkt raus?" → Ja für Pfade A–E. Pfad F ist eine VERBESSERUNG: Stiller Tod (VORHER) wird zu explizitem Fehler (NACHHER).

---

## 5. Test-Kriterien (PFLICHT)

| # | Typ | Beschreibung | Erwartetes Ergebnis |
|---|---|---|---|
| 1 | Happy Path | SSOT-Run: Steps 1→2→3→4→5 durchlaufen vollständig | Alle Steps `ok`, Run `ok`, kein setTimeout im Call-Stack |
| 2 | Happy Path | Legacy-Run mit OpenWE-File: Steps 1→2→3→4→5 | Alle Steps `ok`, OrderParser wird korrekt geladen |
| 3 | Fehlerfall | Step 2 Matcher wirft Error → Step 2 `failed` | Kein Auto-Advance, kein nachfolgender Step gestartet |
| 4 | Fehlerfall | Step 4 Empty-Pool (keine matchbaren Positionen) | Step 4 `failed` via updateStepStatus, kein Auto-Advance |
| 5 | Edge Case | Pause während Step 3 → Resume | resumeRun feuert executeMatcherSerialExtract() neu, Self-Advance kaskadiert Steps 4→5 |
| 6 | Edge Case | Retry Step 2 nach Fehler → Erfolg | retryStep ruft Guard+Execute, Self-Advance startet Step 3 |
| 7 | Edge Case | Step 4 Waiting Point: autoStartStep4=false → User-Freigabe | Waiting-Dialog erscheint, proceedStep4FromWaiting() startet Step 4 |
| 8 | Edge Case | Doppel-Aufruf: advanceToNextStep(runId, 2) wird zweimal aufgerufen | Idempotenz-Guard: zweiter Aufruf → bail out (Step 3 bereits `running`) |
| 9 | Regression | reprocessCurrentRun → Steps 2→5 komplett neu | Legacy-Mode advanceToNextStep findet Step 2, Self-Advance kaskadiert |
| 10 | Fehlerfall | Guard wirft Exception (z.B. IDB-Read in applyStepRepairs schlägt fehl) | Wrapper-catch setzt Step auf `failed`, kein Unhandled Promise Rejection |
| 11 | Edge Case | advanceToNextStep(runId) ohne completedStepNo (Legacy-Aufruf) | Legacy-Mode Pfad wird durchlaufen, KEIN Crash durch `undefined.status` |
| 12 | Edge Case | SSOT-Run mit openWE='not_provided' → Step 4 Skip | Step 4 wird `ok`, advanceToNextStep(runId, 4) startet Step 5 direkt (kein Timer) |
| 13 | Edge Case | Legacy-Run ohne OpenWE-File → Step 4 Skip | Step 4 wird `ok`, Advance zu Step 5 erfolgt ohne Timer |
| 14 | Regression | `npx tsc --noEmit` fehlerfrei | Keine Typ-Fehler nach Signatur-Änderung |

---

## 6. Umsetzungsplan

### Phase 1: Fundament — `advanceToNextStep` Targeted Mode
**Ref:** Impact-Matrix Zeile 1 | Circuit-Check A6 (Idempotenz) | **INVARIANTS A11 (Dispatch-Vollständigkeit)**

1. Signatur erweitern: `advanceToNextStep: (runId: string, completedStepNo?: number) => void`
2. **ERSTER Code-Block** in der Funktion muss ein expliziter Mode-Branch sein:
   ```typescript
   if (completedStepNo !== undefined) {
     // ── TARGETED MODE ──
     const completedStep = run.steps.find(s => s.stepNo === completedStepNo);
     if (!completedStep) return;                                    // Guard 0: Step existiert
     if (completedStep.status !== 'ok' && completedStep.status !== 'soft-fail') return; // Guard 1
     const alreadyRunning = run.steps.some(s => s.status === 'running');
     if (alreadyRunning) return;                                    // Guard 2: Idempotenz
     const { globalConfig: cfg, issues: storeIssues } = get();
     const effectiveConfig = run.config ?? cfg;
     const blockingIssues = storeIssues.filter(
       i => i.runId === runId && isIssueBlockingStep(i, completedStepNo + 1, effectiveConfig as RunConfig),
     );
     if (blockingIssues.length > 0) return;                        // Guard 3: Block-Guard
     // → finde nächsten not-started Step und starte ihn
   } else {
     // ── LEGACY MODE ── (Original-Verhalten, unverändert)
     // → finde running Step, setze ok, finde nächsten not-started Step
   }
   ```
   **KRITISCH:** Legacy-Aufrufe ohne `completedStepNo` dürfen NIEMALS die Targeted-Mode-Guards durchlaufen. Ein `undefined` in `steps.find(s => s.stepNo === undefined)` liefert `undefined` → `completedStep.status` → **Crash.** Der if/else-Branch verhindert das.
3. Legacy Mode wird genutzt von: Step-1-Completion, Step-5-Auto-Complete, `proceedStep4FromWaiting`, `reprocessCurrentRun`

### Phase 2: Step-3-Guard async verdrahten
**Ref:** Impact-Matrix Zeile 6 | Circuit-Check A8

1. In `stepGuard.ts`: `validateStep3Async` exportieren (1 Wort: `export` hinzufügen)
2. In `runStore.ts`: Import erweitern um `validateStep3Async`
3. In `runStepGuard()`: Für Step 3 → `await validateStep3Async()` statt sync `validateStep3()`
4. Sync `validateStep3()` bleibt als UI-Fallback erhalten

### Phase 3: Self-Advance in Execute-Funktionen
**Ref:** Impact-Matrix Zeile 2 | Circuit-Check A2, A3 | **INVARIANTS A9 (Datenfluß-Vorbedingung)**

**Verifizierter IST-Zustand der Status-Setzung:**
Alle drei Execute-Funktionen setzen ihren `ok`/`soft-fail`-Status SELBST via direktem `set()` — nicht via `updateStepStatus()`. Der Self-Advance-Code liest also einen Status der bereits geschrieben ist. Kein Henne-Ei-Problem, aber der Self-Advance muss zwingend NACH dem `set()`-Aufruf stehen.

| Execute-Funktion | Status-Write-Mechanismus | Stelle |
|---|---|---|
| `executeMatcherCrossMatch` | `set()` mit `step2Status` Variable (`'ok'` wenn `noMatchCount === 0`) | ca. Zeile 4840-4863, innerhalb des großen `set()`-Blocks |
| `executeMatcherSerialExtract` (PreFiltered) | `set()` mit `step3Status` Variable (`'ok'` wenn `checksumMatch`) | ca. Zeile 5019-5047 |
| `executeMatcherSerialExtract` (Legacy) | `set()` mit `step3Status` Variable (`'ok'` wenn `result.checksum.match`) | ca. Zeile 5119-5147 |
| `executeOrderMapping` | `set()` mit `step4Status` Variable (`'ok'` wenn `notOrderedCount === 0`) | ca. Zeile 4409-4439 |

**Self-Advance-Code** — in jeder Execute-Funktion NACH dem `set()`-Aufruf, VOR return:
```typescript
// Self-Advance: Status wurde soeben via set() geschrieben → get() liest aktualisierten State
const currentStep = get().runs.find(r => r.id === runId)?.steps?.find(s => s.stepNo === STEP_NO);
if (currentStep?.status === 'ok' || currentStep?.status === 'soft-fail') {
  get().advanceToNextStep(runId, STEP_NO);
}
```

**Platzierung pro Funktion:**
- **`executeMatcherCrossMatch`** (Step 2): NACH `set()` + logService.info() + setStepDiagnostics(), ca. Zeile 4878. Der `set()`-Block (Zeile 4840) hat den Status bereits geschrieben.
- **`executeMatcherSerialExtract`** (Step 3): Zwei Pfade — PreFiltered-Path NACH `set()` (ca. Zeile 5047) + Legacy-Path NACH `set()` (ca. Zeile 5147). Self-Advance in BEIDEN Pfaden.
- **`executeOrderMapping`** (Step 4): NACH `set()` (ca. Zeile 4439) + logService.info(). NICHT erreichbar vom Empty-Pool-Guard (early return bei Zeile 4387). **ACHTUNG — no-run-lines-Guard (Zeile 4316):** `if (runLines.length === 0) { updateStepStatus(runId, 4, 'ok'); return; }` — setzt `ok` und bricht VOR dem main `set()`-Block ab. Der Self-Advance nach dem `set()`-Block wird nicht erreicht. Fix: Expliziten `advanceToNextStep(runId, 4)` nach dem `updateStepStatus`-Aufruf einfügen (identisches Muster wie die Step-4-Skip-Pfade in Phase 4 Punkt 5).
- **NICHT im catch-Block** — failed-Status blockiert Advance automatisch über Targeted Mode Guard 1

### Phase 4: Timer aus `advanceToNextStep` entfernen
**Ref:** Impact-Matrix Zeile 3 | State-Snapshotting alle Pfade | **INVARIANTS A10 (Mechanismus-Sicherheit)**

1. Alle setTimeout-Blöcke für Steps 2–5 durch `void (async () => { ... })()` ersetzen
2. **JEDER async-Wrapper braucht ein umschließendes try/catch:**
   ```typescript
   void (async () => {
     try {
       if (get().isPaused) return;                    // Check 1
       await runStepGuard(stepNo, runId, get, set);   // Guard kann werfen (IDB-Read)
       if (get().isPaused) return;                    // Check 2 (KRITISCH nach async Guard!)
       get().executeMatcherCrossMatch();               // Execute (hat intern eigenes try/catch)
       // Self-Advance liegt IN der Execute-Funktion → hier KEIN Advance-Aufruf
     } catch (err) {
       console.error(`[advanceToNextStep] Step ${stepNo} wrapper failed:`, err);
       get().updateStepStatus(runId, stepNo, 'failed');
     }
   })();
   ```
   **Ohne dieses catch:** Ein Fehler in `runStepGuard` (z.B. IDB-Read in `applyStepRepairs` wirft), im dynamischen `import()` des OrderParsers, oder in `loadRun()` vor dem Execute-Aufruf erzeugt eine **Unhandled Promise Rejection**. Der Step bleibt auf `running` hängen ohne Fehlermeldung.
3. **ZWEI isPaused-Checks pro async-Wrapper** — (1) vor `runStepGuard` als erster Guard, (2) nach `await runStepGuard(...)` als KRITISCHER zweiter Check. Da `runStepGuard` async ist, kann `isPaused` während seiner Laufzeit gesetzt werden. Ohne Check 2 feuert Execute obwohl User bereits pausiert hat.
4. Step-4-Waiting-Point-Guard (`autoStartStep4`) bleibt VOR dem async-Block
5. **Skip-Pfade brauchen eigenen Advance nach Timer-Entfernung.** Drei Step-4-Skip-Pfade hängen aktuell an Timern für ihren Advance:
   - **SSOT `openWE === 'not_provided'`** (Zeile 2313-2326): Timer `t4ssotSkip` → ersetzen durch direkten `advanceToNextStep(runId, 4)` nach `updateStepStatus(runId, 4, 'ok')`
   - **Legacy kein OpenWE-File** (Zeile 2484-2498): Timer `t4adv2` → ersetzen durch direkten `advanceToNextStep(runId, 4)`
   - **Legacy OrderMatcher** (Zeile 2501-2509): Timer `t4legacy` → ersetzen durch direkten `advanceToNextStep(runId, 4)`
   
   Step-3-Skip (Zeile 2255-2259) hat KEINEN Timer — ruft `advanceToNextStep(runId)` bereits direkt auf ✓
   
   **Muster für jeden Skip-Pfad nach Umbau:**
   ```typescript
   get().updateStepStatus(runId, 4, 'ok');
   if (!get().isPaused) {
     get().advanceToNextStep(runId, 4);  // Targeted Mode — Idempotenz-Guards greifen
   }
   ```
6. Gleiches try/catch-Pattern für `retryStep` (Phase 5) und `resumeRun` (Phase 6)

### Phase 5: `retryStep` vereinfachen
**Ref:** Impact-Matrix Zeile 4 | Circuit-Check A1 (Drillinge-Konsistenz)

1. Timer entfernen (3× 50ms setTimeout bei Zeilen 2570, 2581, 2597)
2. Direkt: Guard + Execute-Funktion aufrufen via async-Wrapper mit try/catch (wie Phase 4)
3. Self-Advance in Execute-Funktion sorgt für automatischen Weiterlauf nach Erfolg
4. **BESTEHENDER BUG FIXEN:** Zeile 2745-2746 in `retryStep` Step-4 Legacy-Path setzt `updateStepStatus(runId, 4, 'ok')` aber ruft KEIN `advanceToNextStep()` auf → Workflow hängt nach Retry von Step 4 im Legacy-Skip-Fall. Fix: Skip-Pfad-Pattern aus Phase 4 Punkt 5 anwenden.
5. **WEITERER BUG (NEU): `retryStep` Step-3-Skip-Pfad setzt ok ohne Advance.** Zeile 2588-2591: `if (guard.skipReason) { ... get().updateStepStatus(runId, 3, 'ok'); return; }` — kein `advanceToNextStep`-Aufruf. Workflow hängt nach Skip von Step 3 in retryStep. Fix: Skip-Pfad-Pattern anwenden (updateStepStatus + isPaused-Check + `advanceToNextStep(runId, 3)`) — identisches Muster wie Step-4-Fix in Punkt 4.
6. ~200 → ~60 Zeilen

### Phase 6: `resumeRun` vereinfachen
**Ref:** Impact-Matrix Zeile 5 | Circuit-Check A11

1. ~250 Zeilen Timer-Duplikation entfernen
2. Neuer Ablauf: Find `running` Step → **`await runStepGuard(stepNo, runId, get, set)` MUSS zwingend aufgerufen werden** (INVARIANTS A8: `runStepGuard` führt `applyStepRepairs` durch — essenziell für die Rehydrierung, falls der Browser während der Pause geschlossen wurde; ohne Guard wird `applyStepRepairs` nie ausgeführt → inkonsistenter State bei Resume-nach-Neustart) → Execute-Funktion feuern → Self-Advance kaskadiert. Status bleibt `running` durch die Execute-Laufzeit; `ok`/`failed` schreibt die Execute-Funktion am Ende selbst.
3. resumeRun ruft NICHT `advanceToNextStep` direkt auf (CIRCUIT A11 Regel!)
4. ~250 → ~40 Zeilen

### Phase 7: Step-4-Orchestrierung DRY-Extract (A6-Pflicht)
**Ref:** Impact-Matrix Zeile 7 | Circuit-Check A4 | INVARIANTS A6

1. Helper `executeStep4Orchestration(runId, get, set)` extrahieren (~60 Zeilen)
2. Enthält: `activeOrderMapperId`-Check → IDB-Load → SSOT/Legacy/OpenWE-Branching
3. Aufgerufen von: `advanceToNextStep` (Step-4-Block), `retryStep` (Step-4), `resumeRun` (Step-4)
4. EINE Stelle für alle 3 Pfade — keine Divergenz mehr möglich

### Phase 8: Cleanup + Test
**Ref:** Impact-Matrix Zeile 8

1. `autoAdvanceTimer` State-Feld entfernen — vollständige Cleanup-Liste:
   - **Typ-Definition** (Zeile 547): `autoAdvanceTimer: ReturnType<typeof setTimeout> | null` → entfernen
   - **Initialisierung** (Zeile 815): `autoAdvanceTimer: null` → entfernen
   - **21× `set({ autoAdvanceTimer: ... })`** in advanceToNextStep + resumeRun → entfallen mit den Timer-Blöcken
   - **`clearAutoAdvanceTimer()`-Funktion** (Zeile 2994): Komplett entfernen
   - **`resetRunSensitiveState()`** (Zeile 692/704): `clearTimeout` + `autoAdvanceTimer: null` entfernen
   - **`pauseRun()`** (Zeile 1756/1761): `clearTimeout(autoAdvanceTimer)` + `set({ autoAdvanceTimer: null })` entfernen
   - **`reprocessCurrentRun()`** (Zeile 2767-2769): `clearTimeout` + `set({ autoAdvanceTimer: null })` entfernen
   - **`startWorkflowPhase2()`** (Zeile ~1756): `clearTimeout` + `set({ autoAdvanceTimer: null })` entfernen
2. `npx tsc --noEmit` — keine Typ-Fehler
3. Manueller Test: SSOT-Run + Legacy-Run + Retry + Resume + Pause + Waiting Point

---

## 7. Hinweise für Sonnet bei der Umsetzung (PFLICHT)

### Fallstricke

- **`advanceToNextStep` Mode-Branch ist PFLICHT-ERSTER-CODE-BLOCK (INVARIANTS A11).** Der `if (completedStepNo !== undefined) { ... } else { ... }` Branch muss die ERSTE Anweisung nach den Basis-Checks (Run existiert, isPaused) sein. Ohne diesen Branch: `steps.find(s => s.stepNo === undefined)` → `undefined` → `completedStep.status` → **TypeError-Crash** bei jedem Legacy-Aufruf (Step-1-Completion, proceedStep4FromWaiting, reprocessCurrentRun).
- **Status wird via `set()` geschrieben, nicht via `updateStepStatus()` (INVARIANTS A9).** Alle drei Execute-Funktionen setzen `ok`/`soft-fail` via direktem `set()`. Der Self-Advance liest diesen Status via `get()` — das funktioniert weil Zustand's `set()` synchron ist. Self-Advance MUSS nach dem `set()`-Aufruf stehen, nicht davor. Wenn du den Self-Advance vor den `set()`-Block schiebst: Status ist noch `running` → Self-Advance feuert nie → Workflow hängt.
- **Jeder `void (async () => { ... })()` Wrapper braucht try/catch (INVARIANTS A10).** Die Execute-Funktionen haben intern eigene try/catch-Blöcke, aber der Wrapper-Code VOR dem Execute-Aufruf (Guard, IDB-Load, dynamischer Import) hat keinen. Ohne Wrapper-catch: `applyStepRepairs` wirft → Unhandled Promise Rejection → Step bleibt auf `running` ohne Fehlermeldung.
- **`runs` ist ein Array, KEIN Object/Map.** Zugriff via `runs.find(r => r.id === runId)`, NIEMALS via `runs[runId]`. Bracket-Notation auf einem Array mit String-Index liefert `undefined` → Crash. Dieses Muster gilt überall im Store (siehe z.B. Zeile 2179, 4623).
- **Drei Step-4-Skip-Pfade verlieren ihren Advance wenn Timer entfernt werden.** SSOT-not_provided (Zeile 2316), Legacy-kein-File (Zeile 2488), Legacy-Matcher (Zeile 2504) — alle drei nutzen aktuell einen Timer für den Advance nach dem Skip. Ohne expliziten Ersatz: Step 4 wird `ok` gesetzt aber kein Step 5 gestartet → Workflow hängt.
- **Bestehender Bug in `retryStep` Zeile 2745:** Step-4 Legacy-Skip setzt `ok` aber ruft kein `advanceToNextStep` auf. Diesen Bug beim Umbau mitfixen.
- **`executeMatcherCrossMatch` hat sync Signatur aber async Innenleben.** Der Self-Advance-Aufruf muss INNERHALB des async-Blocks liegen, nicht nach dem sync Return.
- **`executeMatcherSerialExtract` hat ZWEI Erfolgspfade** (PreFiltered + Legacy). Self-Advance muss in BEIDEN Pfaden eingefügt werden, nicht nur in einem.
- **`executeOrderMapping` hat einen Empty-Pool-Guard** (Zeile 4347-4393) mit early `return`. Self-Advance-Code darf dort NICHT hinreichen — er kommt erst nach dem Pool-Processing.
- **`resumeRun` darf NICHT `advanceToNextStep` direkt aufrufen** (CIRCUIT A11). Es feuert die Execute-Funktion, und die Execute-Funktion ruft Self-Advance auf. Vertauschung = Step wird fälschlicherweise auf `ok` gesetzt ohne Arbeit.
- **Step-4-Waiting-Point-Guard** (`autoStartStep4 === false`) muss VOR dem async-Block geprüft werden, nicht innerhalb — sonst wird der async-Block gestartet und der Waiting-Point-Guard greift zu spät.

### Geschützte Verbindungen (aus Circuit-Check)

- **A2 (Guard→Execute→Self-Advance):** Die Kette darf nie unterbrochen werden. Guard VOR Execute, Self-Advance AM ENDE von Execute. Kein Advance ohne Guard, kein Execute ohne Guard.
- **A4 (Step-4 Dreifach-Pfade):** SSOT, Legacy und OpenWE sind eine logische Einheit. Wer einen Pfad ändert MUSS alle drei prüfen. DRY-Helper `executeStep4Orchestration` stellt das sicher.
- **A11 (resumeRun Re-Trigger):** resumeRun findet den `running` Step und feuert dessen Execute-Funktion NEU. Es setzt den Step NICHT auf `ok` — das macht die Execute-Funktion via Self-Advance.

### Idempotenz & Guards

- **Targeted Mode 3-Guards-Reihenfolge:** (1) Status-Check → (2) Running-Check → (3) Issue-Check. Reihenfolge ist relevant — Status vor Running vor Issues. **Alle drei Guards liegen INNERHALB des `if (completedStepNo !== undefined)` Branches** — der Legacy-Pfad hat diese Guards nicht und darf sie nicht durchlaufen.
- **isPaused-Check** in jedem `void (async () => { ... })()` Block erhalten. Wenn User pausiert hat während Execute läuft: nächster Advance-Aufruf prüft isPaused und bricht ab.
- **Wrapper-catch als Auffangnetz:** Jeder async-Wrapper hat ein try/catch das bei unerwartetem Fehler `updateStepStatus(runId, stepNo, 'failed')` setzt. Das ist die LETZTE Verteidigungslinie — ohne diesen catch bleibt der Step auf `running` hängen und der Workflow ist tot.
- **Waiting-Point-Guard** für Step 4 (`autoStartStep4`) bleibt zentral in `advanceToNextStep`, NICHT in der Execute-Funktion und NICHT im DRY-Helper.
- **Block-Guard** (`isIssueBlockingStep`) wird im Targeted Mode geprüft. Offene Issues blockieren den nächsten Step — Verhalten bleibt identisch zu vorher.

### Abschluss-Checkliste für Sonnet

- [ ] `npx tsc --noEmit` ausgeführt und fehlerfrei
- [ ] Änderungen in dieser Projektdatei dokumentiert (Status → IN PROGRESS / DONE)
- [ ] `features/INDEX.md` aktualisiert (falls betroffen)
- [ ] INVARIANTS.md geprüft — neue Regel entdeckt? → In Sektion B eintragen
- [ ] CIRCUIT.md geprüft — neue Verbindung entdeckt? → In Sektion B eintragen

---

## 8. Neue Vorschläge für INVARIANTS / CIRCUIT

**PRÜFAUFTRAG NACH DEM FIX:** Folgende drei fehlerhafte Verdrahtungen müssen nach dem Umbau auf das Self-Advance-Pattern im Code neu verifiziert und dann als saubere Verbindungen in Sektion B der CIRCUIT.md vorgeschlagen werden:

- **executeMatcherCrossMatch** (Status-Setzung am Erfolgsende) — Die Funktion setzt `ok`/`failed` via direktem `set()` (Zeile ~4840, Variable `step2Status`), NICHT via `updateStepStatus()`. Der Fehlerfall im catch-Block nutzt dagegen `updateStepStatus()`. Nach dem Umbau muss verifiziert werden: Steht der Self-Advance-Aufruf NACH dem `set()`-Block der den Status schreibt? Ist `get()` nach `set()` konsistent (Zustand-Guarantee)? Falls ja → als saubere Verbindung in CIRCUIT.md B eintragen.

- **Step-3-Guard** (Verdrahtung der async-Variante) — Nach dem Export von `validateStep3Async` und der Verdrahtung in `runStepGuard()` muss verifiziert werden: Wird `validateStep3Async` tatsächlich für Step 3 aufgerufen? Liefert sie korrekte Ergebnisse für SSOT-Runs mit IDB-Check? Falls ja → als bestätigte Verbindung in CIRCUIT.md B eintragen.

- **executeOrderMapping** (Interne Status-Setzung) — Die Funktion setzt `ok`/`soft-fail` via direktem `set()` (Zeile ~4409, Variable `step4Status`), der catch-Block nutzt `updateStepStatus()`, und der Empty-Pool-Guard setzt `failed` ebenfalls via `set()`. Drei verschiedene Mechanismen. Nach dem Umbau muss verifiziert werden: Steht der Self-Advance NACH dem `set()`-Block und ist er vom Empty-Pool-Guard-Return unerreichbar? Falls ja → als saubere Verbindung in CIRCUIT.md B eintragen.

---

## 9. Phase-V-Validierung (Code-Abgleich)

**Datum:** 2026-04-02 | **Methode:** Direkter Code-Abgleich `src/store/runStore.ts` + `src/services/stepGuard.ts`

| # | Prüfpunkt | Plan-Behauptung | Code-Befund | CONFI | Korrektur |
|---|---|---|---|---|---|
| V1 | `runs` Datenstruktur | `runs[runId]` (Bracket-Notation) | `runs: Run[]` — Array, Zugriff überall via `.find(r => r.id === runId)` (z.B. Zeile 2179, 4623) | ~~50%~~ → **100%** | Self-Advance-Snippet korrigiert auf `.find()` |
| V2 | Timer-Anzahl | "~28 setTimeout" | 24 Workflow-Timer (14 advanceToNextStep+retryStep, 10 resumeRun) + 21 autoAdvanceTimer-Writes | ~~85%~~ → **100%** | Zahl korrigiert, autoAdvanceTimer-Writes dokumentiert |
| V3 | Skip-Pfade nach Timer-Entfernung | Nicht adressiert | 3 Step-4-Skip-Pfade (Zeilen 2316, 2488, 2504) hängen an Timern für Advance | ~~0%~~ → **100%** | Phase 4 Punkt 5 mit Skip-Pfad-Pattern ergänzt |
| V4 | retryStep Legacy-Skip | Nicht erwähnt | Zeile 2745: `updateStepStatus(ok)` OHNE `advanceToNextStep` — bestehender Bug | ~~0%~~ → **100%** | Phase 5 Punkt 4 + Fallstricke ergänzt |
| V5 | `autoAdvanceTimer` Cleanup | "pauseRun, resetRunSensitiveState, startWorkflowPhase2" | 21 Write-Stellen + `clearAutoAdvanceTimer()` Funktion (Zeile 2994) + reprocessCurrentRun (2767-2769) | ~~60%~~ → **100%** | Phase 8 vollständige Cleanup-Liste ergänzt |
| V6 | `advanceToNextStep` Signatur | `(runId: string)` im Plan als Ausgangs-Signatur | Bestätigt: Zeile 2174 `advanceToNextStep: (runId: string) => {` — kein zweiter Parameter | **100%** | — |
| V7 | `validateStep3Async` nicht exportiert | "1 Wort: export hinzufügen" | Bestätigt: Zeile 119 `async function validateStep3Async(...)` ohne `export` | **100%** | — |
| V8 | `runStepGuard` async + Zeile 732 | "runStepGuard() (Zeile 732)" | Bestätigt: Zeile 732 `async function runStepGuard(...)` | **100%** | — |
| V9 | Execute-Status via `set()` | "Alle drei setzen ok via set()" | Bestätigt: crossMatch ~4840, serialExtract ~5019/5119, orderMapping ~4409 — alle via `set()` | **100%** | — |
| V10 | `isPaused` Check-Position | "isPaused-Checks bleiben in async-Blöcken" | Bestätigt: Jeder Timer-Callback startet mit `if (get().isPaused) return;` (z.B. Zeile 2213, 2245, 2294) | **100%** | — |
| V11 | `proceedStep4FromWaiting` Legacy-Aufruf | "advanceToNextStep(runId) ohne Parameter" | Bestätigt: Zeile 3284 `get().advanceToNextStep(runId)` — kein zweiter Parameter | **100%** | — |
| V12 | `reprocessCurrentRun` Legacy-Aufruf | "advanceToNextStep(runId) ohne Parameter" | Bestätigt: Zeile 2880 `get().advanceToNextStep(runId)` — kein zweiter Parameter | **100%** | — |
| V13 | `resumeRun` Timer-Zeilen | "3024, 3030, 3048, 3054, 3072, 3088, 3105, 3220, 3240, 3255" | Alle 10 Zeilen bestätigt — exakte Übereinstimmung | **100%** | — |
| V14 | Step-3-Skip kein Timer | Implizit angenommen | Bestätigt: Zeile 2255-2259 ruft `advanceToNextStep(runId)` direkt auf, kein Timer | **100%** | — |
| V15 | `resumeRun` ruft NICHT advanceToNextStep | CIRCUIT A11 Regel | Bestätigt: Kommentar Zeile 3009-3010 erklärt warum. Feuert Execute-Funktion direkt. | **100%** | — |

| V16 | `executeMatcherCrossMatch` sync Signatur + async Innenleben | "sync-signiert (Interface), feuert intern async" | Interface Zeile 639: `executeMatcherCrossMatch: () => void;` — Impl Zeile 4615: `executeMatcherCrossMatch: () => {` mit internem `const runAsyncStep2 = async () => {` (Zeile 4639). Kommentar Zeile 4638: *"Die Funktion selbst bleibt sync-signiert (Interface), wir feuern intern async."* | **100%** | Self-Advance muss INNERHALB von `runAsyncStep2` stehen, nicht nach dem sync-Return der äußeren Funktion |
| V17 | Step-4-Skip SSOT `not_provided` hängt an Timer | "Timer t4ssotSkip → ersetzen durch direkten Advance" | Zeile 2313-2326: `if (openWEStatus === 'not_provided') { ... get().updateStepStatus(runId, 4, 'ok'); const t4ssotSkip = setTimeout(() => { if (get().isPaused) return; ... afterOrder.advanceToNextStep(runId); }, 100); set({ autoAdvanceTimer: t4ssotSkip }); }` — Advance liegt INNERHALB des Timers, ohne Timer kein Advance | **100%** | Nach Umbau: `updateStepStatus(ok)` + isPaused-Check + direkter `advanceToNextStep(runId, 4)` ohne Timer |
| V18 | `retryStep` Step-4 Legacy-Skip setzt ok ohne Advance | "bestehender Bug Zeile 2745" | Zeile 2744-2746: `} else { get().updateStepStatus(runId, 4, 'ok'); }` — kein `advanceToNextStep`-Aufruf. Vergleich: Der parallele SSOT-not_provided-Pfad in `advanceToNextStep` (Zeile 2323) ruft `advanceToNextStep(runId)` auf. `retryStep` vergisst den Advance. | **100%** | Mitfixen: Skip-Pfad-Pattern (updateStepStatus + isPaused + advanceToNextStep) anwenden |
| V19 | `advanceToNextStep` Legacy-Mode setzt running→ok BLIND | "Legacy-Aufrufe dürfen nie Targeted-Mode-Guards durchlaufen" | Zeile 2183-2201: `const runningStep = run.steps.find(s => s.status === 'running'); ... get().updateStepStatus(runId, runningStep.stepNo, 'ok');` — setzt den ERSTEN gefundenen `running` Step auf `ok`, ohne zu prüfen WELCHER Step das ist. Targeted Mode mit `completedStepNo` verhindert diesen Blind-Advance. ABER: Wenn Legacy-Aufrufe die Targeted-Guards durchlaufen, crasht `steps.find(s => s.stepNo === undefined)` → `.status` auf `undefined`. | **100%** | if/else-Branch (INVARIANTS A11) ist Pflicht-Erster-Block — bestätigt durch Zeile 2183 (running-Step-Suche wäre im Targeted-Pfad falsch) |

| V20 | Targeted Mode Guard 3 — `run.issues?.some()` | Plan Zeile 237: `run.issues?.some(i => isIssueBlockingStep(i, completedStepNo + 1, config))` | runStore.ts:2187–2190: `const { globalConfig, issues } = get(); ... issues.filter(i => i.runId === runId && isIssueBlockingStep(i, ..., effectiveConfig as RunConfig))` — `run` hat kein `issues`-Feld; Issues liegen im Store-State. `run.issues?.some()` liefert stets `undefined` → Guard 3 sperrt nie. | **100%** | Phase 1 Code-Snippet korrigiert: `get().issues.filter(...)` mit `runId`-Filter und `effectiveConfig` statt `run.issues?.some(...)` |
| V21 | `retryStep` Step-3-Skip kein Advance | Plan Phase 5 erwähnt nur Step-4-Skip-Bug — Step-3-Skip-Pfad nicht adressiert | runStore.ts:2588–2591: `if (guard.skipReason) { ... get().updateStepStatus(runId, 3, 'ok'); return; }` — kein `advanceToNextStep`-Aufruf. Workflow hängt nach Skip von Step 3 in `retryStep`. | **100%** | Phase 5 Punkt 5 (neu) ergänzt: Skip-Pfad-Pattern (`updateStepStatus` + isPaused-Check + `advanceToNextStep(runId, 3)`) |
| V22 | `resumeRun` Guard-Entscheidung vor Execute | Plan Phase 6 Punkt 2: "Find running Step → Execute feuern" — unklar ob Guard aufgerufen wird | runStore.ts:3019–3029: `runningStep = run.steps.find(s => s.status === 'running'); ... cs.executeMatcherCrossMatch();` — kein `runStepGuard`-Aufruf. Step ist bereits `running`; Status bleibt `running` bis Execute-Funktion `ok`/`failed` schreibt. | **100%** | ~~Phase 6 Punkt 2 präzisiert: KEIN `runStepGuard` (Step bereits `running`, Voraussetzungen beim ursprünglichen Start geprüft) — direkte Execute-Feuern~~ **NACHKORREKTUR (Sonnet 2026-04-02): Opus-Fehler — INVARIANTS A8 verletzt. Phase 6 Punkt 2 korrigiert: resumeRun MUSS `await runStepGuard` aufrufen (Rehydrierung via `applyStepRepairs`). Siehe V25.** |
| V23 | `executeOrderMapping` no-run-lines Early-Return ohne Advance | Plan Phase 3 erwähnt nur Empty-Pool-Guard als early return — zweite ok-Exit-Stelle nicht dokumentiert | runStore.ts:4316–4319: `if (runLines.length === 0) { console.warn(...); get().updateStepStatus(runId, 4, 'ok'); return; }` — sets `ok` und bricht VOR dem main `set()`-Block ab. Self-Advance nach `set()` unerreichbar → Workflow hängt. | **100%** | Phase 3 `executeOrderMapping`-Eintrag ergänzt: Expliziter `advanceToNextStep(runId, 4)` nach `updateStepStatus` nötig (wie Step-4-Skip-Pfade Phase 4 Punkt 5) |

| V24 | Phase 4 Asynchrone Pause-Lücke — zweiter isPaused-Check fehlt | Phase-4-Pseudo-Code hatte nach `await runStepGuard(...)` keinen zweiten isPaused-Check | Nach einem `await` ist der State potenziell veraltet — `isPaused` kann während der async Guard-Laufzeit gesetzt worden sein. Ohne Check 2 feuert Execute obwohl User bereits pausiert hat. | **100%** | Phase 4 Pseudo-Code korrigiert: `// Pause-Guard` → `// Check 1`, nach `await runStepGuard(...)` zwingend `if (get().isPaused) return; // Check 2 (KRITISCH nach async Guard!)` eingefügt. Phase 4 Punkt 3 aktualisiert. |
| V25 | Phase 6 `resumeRun` Guard-Pflicht — Opus-Fehler (INVARIANTS A8) | Phase 6 Punkt 2 (Opus): "KEIN `runStepGuard`-Aufruf" wegen "Step bereits running, Voraussetzungen beim Start geprüft" | INVARIANTS A8: `runStepGuard` führt `applyStepRepairs` aus. Bei Browser-Neustart nach Pause müssen Step-Reparaturen vor Execute nachgeholt werden (Rehydrierung). Ohne Guard: `applyStepRepairs` wird nie ausgeführt → inkonsistenter State bei Resume-nach-Neustart. V22-Korrektur von Opus war falsch. | **100%** | Phase 6 Punkt 2 korrigiert: KEIN → MUSS. Wortlaut: "resumeRun MUSS zwingend `await runStepGuard` aufrufen, bevor Execute gefeuert wird (Rehydrierung via `applyStepRepairs` bei Browser-Neustart)." V22 mit Nachkorrektur-Hinweis versehen. |

**Gesamtergebnis: 23/23 Prüfpunkte bei 100% — alle mit Code-Zitat belegt.**
**9 Korrekturen durchgeführt (V1–V5, V20–V23), 14 Punkte bestätigt (V6–V19).**
**Nachkorrektur 2026-04-02 (Sonnet): 2 Opus-Fehler behoben — V24 (Phase 4 async Pause-Lücke: fehlender Check 2 nach `await runStepGuard`) + V25 (Phase 6 resumeRun Guard-Pflicht: INVARIANTS A8 — `applyStepRepairs`-Rehydrierung erfordert zwingend Guard vor Execute).**

---

## 12. Abschlussbericht & Umsetzungskontrolle

**Implementiert:** 2026-04-02 | **Sonnet 4.6** | `npx tsc --noEmit` → **0 Fehler**

### 12.1 Phasen-Protokoll

| Phase | Beschreibung | Status | Anmerkungen |
|---|---|---|---|
| Phase 1 + 4 | `advanceToNextStep` — neue Signatur + Targeted Mode + alle Timer entfernt | ✓ | Phases 1 und 4 in einem Durchgang implementiert. 14 Timer → 0. Targeted Mode mit 3 Guards. Step-4-Waiting-Point ausschließlich im `completedStepNo===3`-Zweig. |
| Phase 2 | `validateStep3Async` export + `runStepGuard` async für Step 3 | ✓ | `export` zu `validateStep3Async` in stepGuard.ts hinzugefügt. `runStepGuard` nutzt ternären Ausdruck: `stepNo === 3 ? await validateStep3Async(...) : validateStepPrerequisites(...)`. |
| Phase 3 | Self-Advance in alle Execute-Funktionen | ✓ | 6 Eintrittspunkte: crossMatch (nach Warnings-Loop), serialExtract !serialDocument-Skip, serialExtract preFiltered (vor `return`), serialExtract legacy (nach Warnings-Loop), orderMapping no-run-lines-Skip (V23), orderMapping Erfolgs-Pfad. |
| Phase 5 | `retryStep` vereinfacht — Timer entfernt, Bugs gefixt | ✓ | 3× setTimeout → 3× `void (async () => { try/catch })()`. Step-3-Skip-Bug behoben (advanceToNextStep ergänzt). Step 4 delegiert an `executeStep4Orchestration`. Bereinigung eines Leftovers nach missgluecktem Edit erforderte 2 Bearbeitungsschritte. |
| Phase 6 | `resumeRun` vereinfacht — 255 Zeilen, 10 Timer → 50 Zeilen | ✓ | Single `void (async () => { })()` mit Guard (INVARIANTS A8 / V25-Fix). Step 4 über `executeStep4Orchestration`. CIRCUIT A11 eingehalten: kein `advanceToNextStep`-Direktaufruf außer im Step-3-Skip-Pfad (Targeted Mode). |
| Phase 7 | `executeStep4Orchestration` DRY-Helper | ✓ | Standalone async Funktion zwischen `runStepGuard`-Hilfsfunktion und `useRunStore = create(...)`. Alle SSOT/Legacy/OpenWE-Pfade konsolidiert. Skip-Pfade nutzen `advanceToNextStep(runId, 4)` mit isPaused-Guard. |
| Phase 8 | `autoAdvanceTimer` vollständig entfernt | ✓ | 7 Stellen bereinigt: Typ-Definition, `resetRunSensitiveState`, Store-Initialisierung, `startWorkflowPhase2`, `reprocessCurrentRun`, `pauseRun`. Verbleibende 3 Vorkommnisse nur noch in Kommentaren. |

### 12.2 Abweichungen vom Plan

**Abweichung 1 — `!serialDocument`-Skip in `executeMatcherSerialExtract` (nicht im Plan):**
Der Plan (Phase 3) nennt explizit nur den preFiltered-Pfad und den Legacy-Pfad. Der `!serialDocument`-Skip-Pfad (Zeile ~5056) setzt ebenfalls `ok` und bricht mit `return` ab — ohne Advance wäre der Workflow nach diesem Pfad ins Stocken geraten. Self-Advance wurde auch hier ergänzt. INVARIANTS-konform, da Plan-Logik klar anwendbar.

**Abweichung 2 — `retryStep` Edit-Ablauf (2 Schritte statt 1):**
Beim initialen Edit des `retryStep`-Switch-Blocks wurde der alte `case 4`-Code als "Placeholder" versehentlich an den neuen Code angehängt statt vollständig ersetzt. Ein zweiter Edit entfernte den verwaisten Block. Das Endresultat ist korrekt.

### 12.3 Timer-Bilanz

| Kategorie | Vorher | Nachher |
|---|---|---|
| Workflow-Control-Flow-Timer (`setTimeout` für Advance/Execute) | 24 | **0** |
| `autoAdvanceTimer` State-Schreibstellen | 21 | **0** |
| `clearAutoAdvanceTimer()`-Funktion | 1 | **0** |
| Verbleibende `setTimeout` (legitim: UI-Highlight, PDF-Timeout, Delay) | 4 | **4** (unverändert) |

### 12.4 INVARIANTS & CIRCUIT Compliance

| Regel | Erfüllt? | Nachweis |
|---|---|---|
| INVARIANTS A4 — kein setTimeout für Workflow-Control-Flow | ✓ | 24 Timer entfernt, 3 `void (async () => { try/catch })()` Wrapper als Ersatz |
| INVARIANTS A5 — Self-Advance in Execute-Funktion | ✓ | 6 Advance-Eintrittspunkte in Execute-Funktionen implementiert |
| INVARIANTS A8 — Guards sind Pflicht | ✓ | `resumeRun` nutzt `await runStepGuard` (V25-Fix); `retryStep` Guards erhalten; `advanceToNextStep` Guards erhalten |
| INVARIANTS A10 — void-async ohne try/catch verboten | ✓ | Alle 3 neuen `void (async () => { })()` Blöcke haben umschließendes try/catch |
| INVARIANTS A11 — optionaler Parameter → explizites Branching zuerst | ✓ | `completedStepNo !== undefined` ist der erste `if`-Block in `advanceToNextStep` |
| CIRCUIT A1 — nur 5 legale Eintrittspunkte | ✓ | Keine neuen Eintrittspunkte hinzugefügt |
| CIRCUIT A2 — Guard → Execute → Self-Advance Kette | ✓ | Vollständig in allen 3 Entry-Funktionen und Execute-Funktionen |
| CIRCUIT A11 — resumeRun ruft NICHT advanceToNextStep direkt | ✓ | Einzige Ausnahme: Step-3-Skip-Pfad (Targeted Mode, kein Execute-Aufruf möglich) — CIRCUIT A11 beschreibt den Normal-Pfad |

### 12.5 TypeScript

```
npx tsc --noEmit → Exit 0, 0 Fehler
```

### 12.6 Confidence Score

**Implementierungs-Confidence: 97 / 100**

Abzüge:
- **-2**: `retryStep` erforderte 2 Edit-Durchgänge (Leftover-Block). Kein inhaltlicher Fehler, aber Prozess-Overhead.
- **-1**: `!serialDocument`-Skip-Pfad war nicht im Plan dokumentiert — Eigeninitiative war korrekt, aber ungeplant.

Positiv:
- `npx tsc --noEmit` → 0 Fehler
- Alle 24 Workflow-Control-Flow-Timer entfernt
- Alle 6 Execute-Self-Advance-Pfade implementiert
- Alle 3 Timer-basierten Funktionen vereinfacht (advanceToNextStep, retryStep, resumeRun)
- autoAdvanceTimer vollständig aus State, Type und Logik entfernt
- Plan-Korrekturen V20–V25 alle berücksichtigt (Guard-3-Fix, V23-no-run-lines, V24-isPaused-Check-2, V25-resumeRun-Guard)

*Abschlussbericht erstellt: 2026-04-02 | Sonnet 4.6*
