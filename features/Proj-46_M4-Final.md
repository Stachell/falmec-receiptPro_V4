# PROJ-46 — Milestone 4 (Final): UI-Sync, Timing & Mutation-Guards

**Status:** INIT (Manuelle Baseline)
**Datum:** 2026-04-19
**Kontext:** Sektor 3 (Slice-Split) und M3.5 (Leak-Patch) sind abgeschlossen. Der Monolith (`runStore.ts`) ist aufgelöst. Wir arbeiten ausschließlich in `src/store/slices/`. Das alte AP5 (`lastOrderParserDiagnostics` löschen) ist BEREITS ERLEDIGT.

## BIG PICTURE
Das Ziel von M4 ist die Härtung der Frontend-Schnittstellen (Hooks) und der manuellen Mutationen. Wir müssen verhindern, dass UI-Aktionen den Zustand korrumpieren (Guards) und sicherstellen, dass Berechnungen nach manuellen Eingriffen zentral und atomar ablaufen.

---

## SEKTION A: Die harten Arbeitspakete (M4 Scope)

### AP6: `renameRun` konsolidieren
- **Ziel-Datei:** `src/store/slices/runCrudSlice.ts`
- **Aufgabe:** Das Setzen der neuen ID und das Reseten des Zustands (`resetRunSensitiveState` aus `helpers.ts`) müssen sauber und atomar orchestriert werden. Die R8-Regel (Primärwriter) muss strikt gewahrt bleiben.

### AP7: Zentraler Fix-Hub `recalculateRunAfterMutation`
- **Ziel-Datei:** `src/store/slices/mutationSlice.ts`
- **Aufgabe:** Etablierung eines zentralen Helpers, der IMMER aufgerufen wird, wenn die UI Daten mutiert (KISS-Prinzip).
- **Ablauf (strikt):**
  1. Aggregates neu rechnen (`computeMatchStats`, `computeOrderStats`, `expandedLineCount`).
  2. Bestehenden SSOT `autoResolveIssues(issues, runLines, runId)` aufrufen.
  3. Step-5-Issues regenerieren: `generateStep5Issues(runId)`.
  4. **WICHTIG:** Step-Status NICHT automatisch ändern! KEIN `advanceToNextStep`!

### AP8: Action-Guards in Mutations-Actions (ehemals B.1)
- **Ziel-Datei:** `src/store/slices/mutationSlice.ts`
- **Aufgabe:** Schutz vor UI-Race-Conditions. Jede Mutation braucht am Anfang einen Early-Return-Guard:
  - lineId-basiert: `lineId.startsWith(\`${currentRun.id}-line-\`)`
  - explizit runId-parametrisiert: `runId === currentRun.id`
  - dual parametrisiert: `runId === currentRun.id && lineId.startsWith(\`${runId}-line-\`)`
  - issueId-basiert: `state.issues.find(i => i.id === issueId)?.runId === currentRun.id`

### AP9: Pause-Check in `retryStep` (ehemals B.2)
- **Ziel-Datei:** `src/store/slices/workflowSlice.ts`
- **Aufgabe:** Ergänze einen `isPaused`-Check im Retry-Pfad, damit ein pausierter Run nicht durch einen "Retry"-Klick aus der UI unbemerkt weiterläuft.

### AP10: UI-Sync / AutoSave-Timing
- **Ziel-Datei:** `src/hooks/useRunAutoSave.ts`
- **Aufgabe:** Härtung des Lifecycle-Timings (Debounce & Flush bei Unmount), damit der gesicherte M3.5-Payload auch verlässlich beim Schließen der Komponente gespeichert wird.