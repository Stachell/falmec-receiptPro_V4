# PROJ-44-ADD-ON Round 9 — Post-Mortem Diagnostic

**Stand:** 2026-03-31
**Ausloeser:** "Neu verarbeiten" startet Workflow, verliert aber Rechnungsdaten und stoppt bei Artikelzuweisung
**Methode:** Vollstaendiger virtueller Workflow-Durchlauf mit Testdaten + Code-Trace aller Step-Execution-Funktionen

---

## Kontext: Was ist seit Round 9 passiert?

Die Round-9-Implementierung von `reprocessCurrentRun` wurde durch **PROJ-49 SSOT** (Single Source of Truth) komplett ueberschrieben. Die neue Version ist deutlich elaborierter (IDB-Load -> Reset -> Save -> Advance), aber es wurden dabei **3 Bugs eingebaut** und ein **architekturelles Defizit** nicht adressiert.

**Round-9-Guards (articleSource/priceCheckStatus) sind erhalten** — PROJ-46 hat sie korrekt um `manualStatus === 'confirmed'` erweitert.

---

## Bug-Katalog

### BUG 1 — BEHOBEN: Aeusserer Catch ohne Step-Status-Setzung

**Datei:** `src/store/runStore.ts` ~Zeile 4893
**Schwere:** KRITISCH
**Status:** GEFIXT (diese Session)

**Problem:** Der aeussere `.catch()` von `runAsyncStep2()` loggte nur den Fehler, setzte aber `updateStepStatus(runId, 2, 'failed')` NICHT. Wenn ein Fehler VOR dem inneren `try/catch` auftrat (IDB-Load, Artikel-Validierung, SSOT-Check), blieb Step 2 ewig auf `'running'`.

**Fix:**
```typescript
// ALT:
runAsyncStep2().catch(err =>
  logService.error(...)
);

// NEU:
runAsyncStep2().catch(err => {
  logService.error(...);
  get().updateStepStatus(runId, 2, 'failed');
});
```

---

### BUG 2 — OFFEN: Timer-Race-Condition bei Auto-Advance

**Datei:** `src/store/runStore.ts`, `advanceToNextStep()` ~Zeile 2226
**Schwere:** HOCH
**Status:** OFFEN — erfordert Architektur-Entscheidung

**Problem:** Nach dem Aufruf von `executeMatcherCrossMatch()` (fire-and-forget) startet ein fester 100ms-Timer, der prueft ob Step 2 fertig ist. `executeMatcherCrossMatch` ist intern async (IDB-Load ~Zeile 4640: `await runPersistenceService.loadRun(runId)`). Wenn der IDB-Read + Matcher-Logik > 100ms dauert, ist Step 2 noch `'running'` wenn der Timer feuert.

**Betroffene Steps:**
| Step | Setup-Timer | Advance-Timer | Risiko |
|------|-------------|---------------|--------|
| Step 2 | 100ms (Zeile 2212) | 100ms (Zeile 2226) | HOCH — IDB-Load async |
| Step 3 | 100ms (Zeile 2244) | 100ms (Zeile 2264) | MITTEL — preFilteredSerials meist schnell |
| Step 4 | 100ms (Zeile 2293) | 100ms (variabel) | HOCH — OrderParser async |

**Konsequenz:** Workflow bleibt auf `'running'` haengen. Kein Observer/Subscription-Pattern vorhanden, kein Recovery-Mechanismus ausser manuelles Pause/Resume.

**KISS-Loesung (empfohlen):** Self-Advance-Pattern: Jede Step-Execution-Funktion ruft am Ende selbst `advanceToNextStep` auf. Die bestehenden Timer werden zum idempotenten Fallback:

```typescript
// Am Ende von executeMatcherCrossMatch (nach set() + Diagnostics):
if (step2Status === 'ok' || step2Status === 'soft-fail') {
  setTimeout(() => get().advanceToNextStep(runId), 50);
}

// Am Ende von executeMatcherSerialExtract (nach Hard-Checkpoint):
if (step3Status === 'ok' || step3Status === 'soft-fail') {
  setTimeout(() => get().advanceToNextStep(runId), 50);
}
```

**Warum idempotent:** `advanceToNextStep` sucht einen Step mit `status === 'running'`, setzt ihn auf `'ok'`, dann findet es den naechsten `'not-started'` Step. Wenn Step 2 bereits `'ok'` ist (weil der Self-Advance schneller war als der Timer), findet es keinen Running-Step, setzt nichts auf `'ok'`, und geht direkt zum naechsten `'not-started'` — kein Doppel-Advance.

---

### BUG 3 — OFFEN: retryStep hat keinen Auto-Advance-Timer

**Datei:** `src/store/runStore.ts`, `retryStep()` ~Zeile 2553
**Schwere:** HOCH
**Status:** OFFEN

**Problem:** `retryStep` ruft z.B. `executeMatcherCrossMatch()` auf (Zeile 2577), setzt aber KEINEN Auto-Advance-Timer danach. Im Gegensatz zu `advanceToNextStep`, das fuer jeden Step einen Timer-Chain aufbaut, fehlt bei `retryStep` dieser komplett.

**Konsequenz:** Nach einem Retry von Step 2 matcht er die Artikel korrekt, aber Step 3 startet nie. Der User muss manuell Pause/Resume druecken oder die Seite neu laden.

**KISS-Loesung:** Selbes Self-Advance-Pattern wie Bug 2 — wenn die Step-Execution-Funktionen am Ende selbst `advanceToNextStep` aufrufen, wird `retryStep` automatisch mitgeloest.

---

### DEFIZIT 4 — ARCHITEKTURELL: Fire-and-Forget ohne Completion-Signal

**Schwere:** DESIGN-SCHULD (kein akuter Bug, aber Quelle fuer Bug 2 + 3)
**Status:** OFFEN — Dokumentiert fuer zukuenftige Referenz

**Problem:** Alle Step-Execution-Funktionen (`executeMatcherCrossMatch`, `executeMatcherSerialExtract`, `executeOrderMapping`) sind "fire-and-forget": Sie werden aufgerufen, laufen async, und signalisieren Completion nur ueber State-Mutation (`set()` mit neuem Step-Status). Es gibt keinen Promise-Return, kein Event, kein Observer-Pattern.

Der einzige Fortschrittsmechanismus sind feste Timer (100ms), die den State pollen. Dieses Pattern ist fragil und hat bewiesene Race Conditions.

**Langfristige Loesung (NICHT fuer diesen Round):** Promise-basierte Step-Pipeline:
```typescript
// Konzept (NICHT implementieren — nur Dokumentation):
await executeMatcherCrossMatch();    // returns Promise<void>
advanceToNextStep(runId);            // deterministisch, kein Timer
```

Dies wuerde `advanceToNextStep` von der Timer-Kette befreien und alle Race Conditions eliminieren. Ist aber ein grosser Refactor aller 4 Step-Execution-Funktionen + advanceToNextStep + retryStep.

---

## Virtueller Workflow-Durchlauf

### Szenario 1: Normaler Erstlauf (PDF hochladen -> Steps 1-5)

**Testdaten:** 15 Rechnungspositionen, 3 ohne Match, 1 Preisabweichung

| Schritt | Erwartung | Ist-Zustand | Status |
|---------|-----------|-------------|--------|
| Step 1: PDF parsen | 15 Lines erzeugt, Step 1 'ok' | OK — updateRunWithParsedData schreibt Lines korrekt | PASS |
| Auto-Advance 1→2 | advanceToNextStep findet Step 2 'not-started' | OK — 100ms Timer startet Step 2 | PASS |
| Step 2: Artikel matchen | 12 full-match, 3 no-match | OK — matcher.crossMatch synchron | PASS (wenn <100ms) |
| Auto-Advance 2→3 | Timer prueft step2.status | RACE — Timer kann zu frueh feuern (Bug 2) | RISK |
| Step 3: Serial parsen | S/N-Zuweisung | OK — executeMatcherSerialExtract async mit eigenem Error-Handling | PASS |
| Auto-Advance 3→4 | Timer prueft step3.status | RACE — gleicher Timer-Bug wie Step 2 | RISK |
| Step 4: Bestellung mappen | Order-Zuordnung | OK — executeOrderMapping ist synchron | PASS |
| Auto-Advance 4→5 | Timer + Step-5-Guard | OK — Step 5 hat eigenen Guard | PASS |
| Step 5: Export | Step auf 'ok' | OK — generateStep5Issues + Auto-Complete | PASS |

**Ergebnis:** Erstlauf funktioniert MEISTENS, da `matcher.crossMatch()` und `executeOrderMapping()` synchron sind und typischerweise <100ms brauchen. Aber der IDB-Read in der async-Wrapper-Schicht kann gelegentlich >100ms dauern.

### Szenario 2: Reprocess nach manuellem Artikel-Fix

**Testdaten:** Run mit 1 geloestem price-mismatch Issue (manualStatus: 'confirmed', articleSource: 'manual')

| Schritt | Erwartung | Ist-Zustand | Status |
|---------|-----------|-------------|--------|
| Button-Klick "Neu verarbeiten" | reprocessCurrentRun startet | OK — RunDetail.tsx ruft korrekt reprocessCurrentRun(currentRun.id) auf | PASS |
| Phase 1: Timer killen | autoAdvanceTimer cleared | OK — Zeile 2767-2769 | PASS |
| Phase 2: IDB laden | loadPersistedRun holt Snapshot | OK — Zeile 2772 | PASS |
| Phase 3a: Issues Step 2-5 loeschen | Nur Step-1-Issues bleiben | OK — Zeile 2794 Filter korrekt | PASS |
| Phase 3b: Stats reset | parsedInvoiceLines bleibt | OK — Zeile 2798 explizit beibehalten | PASS |
| Phase 3e: Lines reset | confirmed Lines bleiben, Rest auf 'pending' | OK — manualStatus-Guard Zeile 2823 | PASS |
| Phase 3e: articleSource reset | articleSource auf undefined fuer nicht-confirmed | OK — Zeile 2835 | PASS |
| Phase 4: IDB persistieren | Bereinigter Zustand in IDB | OK — buildAutoSavePayload + saveRun | PASS |
| Phase 5: Transiente States raeumen | Diagnostics etc. zurueckgesetzt | OK — Zeile 2867-2874 | PASS |
| Phase 6: advanceToNextStep | Findet Step 2 als 'not-started' | **HIER BEGINNT DAS PROBLEM** | RISK |
| Step 2 Execution | executeMatcherCrossMatch() | async IDB-Load (2. Mal!) + Matcher | RACE (Bug 2) |
| Aeusserer Catch | Bei Fehler: Step 2 auf 'failed' | **GEFIXT** (Bug 1) | FIXED |
| Auto-Advance 2→3 | 100ms Timer | RACE — kann zu frueh feuern | RISK (Bug 2) |
| Protected Lines | confirmed manuelle Lines unberuehrt | OK — PROJ-46 Guards Zeile 4738-4742 | PASS |

**Ergebnis:** Der Reprocess-Pfad selbst ist korrekt implementiert (PROJ-49 hat gute Arbeit geleistet). Das Problem sitzt in der Timer-basierten Auto-Advance-Kette, die fuer ALLE Pfade gilt (Erstlauf, Reprocess, Retry).

---

## Zusammenfassung: Was ist zu tun?

| # | Bug | Fix | Aufwand | Status |
|---|-----|-----|---------|--------|
| 1 | Aeusserer Catch ohne Step-Status | `updateStepStatus(runId, 2, 'failed')` im Catch | 1 Zeile | DONE |
| 2 | Timer-Race bei Auto-Advance | Self-Advance am Ende jeder Step-Execution | ~6 Zeilen (2 pro Step) | OFFEN |
| 3 | retryStep ohne Auto-Advance | Wird durch Fix 2 automatisch mitgeloest | 0 Zeilen (wenn Fix 2 implementiert) | OFFEN |
| 4 | Fire-and-Forget Architektur | Dokumentiert, kein Immediate Fix | - | AKZEPTIERT |

**Empfehlung:** Bug 2 + 3 in einem separaten Round 10 ADD-ON fixen. Das Self-Advance-Pattern ist chirurgisch, KISS-konform, und loest beide Bugs gleichzeitig.

---

## NACHTRAG — Verifikation am realen lokalen Code (Workspace-Stand, nicht Commit-Stand)

**Pruefbasis:** lokaler Arbeitsbaum mit uncommitteten Aenderungen in u.a. `src/store/runStore.ts`, `src/pages/RunDetail.tsx`, `src/services/runPersistenceService.ts`, `src/hooks/buildAutoSavePayload.ts`, `src/services/stepGuard.ts`

### Bestaetigt am echten Code

1. **BUG 1 ist real gefixt.**  
   In `executeMatcherCrossMatch()` setzt der aeussere Catch inzwischen korrekt `updateStepStatus(runId, 2, 'failed')` (`src/store/runStore.ts` ~4893-4895).  
   Konsequenz: Step 2 bleibt bei Fehlern vor dem inneren `try/catch` nicht mehr endlos auf `'running'`.

2. **Die Timer-Race-Condition in `advanceToNextStep()` ist real vorhanden.**  
   Step 2, 3 und 4 werden ueber feste `setTimeout(..., 100)`-Ketten gestartet und weitergeschoben (`src/store/runStore.ts` ~2212ff, ~2244ff, ~2293ff).  
   Da Step 2 (`runPersistenceService.loadRun(runId)`) und Teile von Step 4 asynchron sind, kann der Advance-Timer feuern, waehrend der Step noch `'running'` ist.  
   Konsequenz: Workflow kann im echten Lauf auf einem Running-Step stehenbleiben.

3. **`retryStep()` hat im realen Code tatsaechlich keine Auto-Advance-Kette.**  
   In `src/store/runStore.ts` ~2553ff werden Step 2, 3 und 4 zwar neu gestartet, aber danach wird kein analoger Advance-Timer aufgebaut.  
   Konsequenz: Ein Retry kann fachlich erfolgreich sein und trotzdem nicht in den naechsten Step springen.

4. **Der Reprocess-Pfad selbst ist im echten Code im Kern sauber verdrahtet.**  
   `reprocessCurrentRun()` laedt aus IDB, resetet Steps 2-5, persistiert den bereinigten Zustand und startet wieder ueber `advanceToNextStep()` (`src/store/runStore.ts` ~2761ff).  
   Bestaetigt ist auch der Schutz bestaetigter manueller Korrekturen:
   - Reset-Guard: `manualStatus === 'confirmed'` bleibt unveraendert (`~2823`)
   - Step-2-Rewrite-Guard fuer manuelle Artikel (`~4739`)
   - Preis-Guard fuer bestaetigte Custom-Preise (`~4742`)

5. **Die UI-Verkabelung fuer Reprocess/Retry/Advance ist real korrekt angebunden.**  
   `RunDetail.tsx` ruft:
   - `reprocessCurrentRun(currentRun.id)` (`~689`)
   - `retryStep(currentRun.id, nextStep.stepNo)` (`~772`)
   - `advanceToNextStep(currentRun.id)` (`~774`)

### Zusatzbefunde aus dem realen Code

1. **`resumeRun()` ist kein stabiler Recovery-Mechanismus, sondern dupliziert denselben Timer-Ansatz.**  
   In `src/store/runStore.ts` ~3011ff wird beim Fortsetzen erneut mit festen 100ms-Timern gearbeitet.  
   Konsequenz: Pause/Fortfahren ist kein belastbarer Architektur-Bypass, sondern reproduziert die gleiche Race-Klasse.

2. **Die im Hauptbericht empfohlene Self-Advance-Loesung ist in der aktuellen Engine-Semantik NICHT nachgewiesen idempotent.**  
   `advanceToNextStep()` markiert immer den aktuell `running` Step als `'ok'`, bevor der naechste `not-started` Step gesucht wird (`src/store/runStore.ts` ~2174ff).  
   Wenn ein verspaeteter Self-Advance aus Step 2 erst feuert, waehrend Step 3 bereits `'running'` ist, wuerde genau dieser Step 3 auf `'ok'` gesetzt und potenziell uebersprungen.  
   Konsequenz: Das vorgeschlagene Pattern ist nicht automatisch sicher und braucht entweder:
   - step-spezifische Completion-Signale, oder
   - eine zielgerichtete `advanceFromStep(stepNo)`-Semantik, oder
   - eine zusaetzliche Guard-Bedingung vor dem Advance.

3. **Step-3-Guard hat im realen Code eine Inkonsistenz.**  
   In `src/services/stepGuard.ts` existiert eine asynchrone SSOT-aware Variante `validateStep3Async()`, verwendet wird im echten Ablauf aber die synchrone Funktion `validateStep3()`.  
   Konsequenz: Die feinere `ingestStatus`-/IDB-Pruefung fuer Step 3 ist vorhanden, aber aktuell nicht im aktiven Guard-Pfad verdrahtet.

### Aktualisierte Bewertung

- **Bug 1:** bestaetigt behoben
- **Bug 2:** bestaetigt offen
- **Bug 3:** bestaetigt offen
- **Defizit 4 (fire-and-forget + Polling):** bestaetigt als reale Design-Schuld
- **Neue Zusatzbewertung:** Die vorgeschlagene Self-Advance-KISS-Loesung ist auf Basis des echten Codes nicht ohne weiteres freigabefaehig, weil die aktuelle `advanceToNextStep()`-Logik Running-Steps aktiv auf `'ok'` setzt.

### Kurzfazit zum realen Code

Der lokale Code bestaetigt die Grunddiagnose des Berichts weitgehend: Der eigentliche Reprocess-Reset ist sauber, der Workflow haengt an der Timer-basierten Advance-Mechanik.  
Ergaenzend zeigt der echte Code aber zwei wichtige Punkte:

- `resumeRun()` teilt denselben strukturellen Fehler
- das vorgeschlagene Self-Advance-Pattern ist in der aktuellen Implementierung nicht sauber idempotent und kann zu Step-Skips fuehren

**Technischer Gesamtbefund:** Der Problemkern liegt nicht in `reprocessCurrentRun()`, sondern in der allgemeinen Step-Orchestrierung von `advanceToNextStep()`, `retryStep()` und `resumeRun()`.
