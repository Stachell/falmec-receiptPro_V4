# PROJ-25 — Pause / Fortfahren im Run-Detail

## Beschreibung

Der automatische Verarbeitungsfluss (Steps 1–5) soll pausierbar sein. Der Nutzer kann einen laufenden Run jederzeit anhalten und später von der unterbrochenen Stelle aus fortfahren.

## Motivation

Bisher gab es keine Möglichkeit, einen laufenden Run kontrolliert zu unterbrechen ohne ihn abzubrechen (`abortRun`). Die Pause-Funktion erlaubt es, z. B. fehlende Stammdaten nachzupflegen oder externe Systeme vorzubereiten, ohne den Run neu starten zu müssen.

---

## Akzeptanzkriterien

- [x] In Run-Detail erscheint ein **"Pause"-Button** links neben "Neu verarbeiten"
- [x] Der Button ist nur sichtbar wenn `run.status === 'running'` oder `run.status === 'paused'`
- [x] Bei Klick auf Pause:
  - [x] Aktiver Auto-Advance-Timer wird gecancelt (kein Deadlock)
  - [x] `run.status` wechselt auf `'paused'`
  - [x] Button zeigt **Play-Icon + "Fortfahren"** mit Hintergrund `#FD7C6E` und weißer Schrift
  - [x] WorkflowStepper: laufende Step-Kugel wechselt zu **Pause-Icon** (Farbe `#FD7C6E`)
  - [x] Status-Chip im Header zeigt **"Pausiert"** in Farbe `#FD7C6E`
  - [x] KPI-Kachel "Nächster Schritt" zeigt **"pausiert"-Badge** mit Pause-Icon
- [x] Bei Klick auf "Fortfahren":
  - [x] `isPaused` wird zurückgesetzt
  - [x] `run.status` wechselt zurück auf `'running'`
  - [x] `advanceToNextStep()` wird neu angestoßen — Run läuft weiter
  - [x] Alle UI-Elemente kehren in den Normalzustand zurück
- [x] Run-Liste (Index.tsx):
  - [x] `StatusChip` zeigt für `status === 'paused'` die Beschriftung **"Pausiert"** in `#FD7C6E`
  - [x] Status-Filter-Dropdown enthält Eintrag **"Pausiert"**
- [x] Hover-Effekt vereinheitlicht (Referenz: Log-Tab-Buttons):
  - [x] Button "Zurück": Hover → `#008C99` Hintergrund / `#E3E0CF` Text
  - [x] Button "Neu verarbeiten": gleicher Hover
  - [x] Button "Pause" (Normalzustand): gleicher Hover
  - [x] KPI-Kachel "Export/Start/Retry": Hover → `#008C99` / `#E3E0CF`

---

## Implementierungs-Checkliste

### Typen
- [x] `src/types/index.ts` — `StepStatus` um `'paused'` erweitert

### Store
- [x] `src/store/runStore.ts` — State: `isPaused: boolean`, `autoAdvanceTimer: ReturnType<typeof setTimeout> | null`
- [x] `src/store/runStore.ts` — `pauseRun(runId)`: Timer canceln, `isPaused: true`, `Run.status: 'paused'`
- [x] `src/store/runStore.ts` — `resumeRun(runId)`: `isPaused: false`, `Run.status: 'running'`, `advanceToNextStep()` auslösen
- [x] `src/store/runStore.ts` — `advanceToNextStep`: Pause-Guard `if (get().isPaused) return;` am Anfang
- [x] `src/store/runStore.ts` — Alle `setTimeout`-Callbacks: Pause-Guard + `set({ autoAdvanceTimer: ... })`

### WorkflowStepper
- [x] `src/components/WorkflowStepper.tsx` — `isPaused` Prop hinzugefügt
- [x] `src/components/WorkflowStepper.tsx` — `running`-Step zeigt Pause-Icon wenn `isPaused === true`
- [x] `src/index.css` — `.stepper-circle-paused` CSS-Klasse ergänzt

### Run-Detail
- [x] `src/pages/RunDetail.tsx` — `isPaused`, `pauseRun`, `resumeRun` aus Store
- [x] `src/pages/RunDetail.tsx` — Pause/Fortfahren-Button
- [x] `src/pages/RunDetail.tsx` — `isPaused` an WorkflowStepper übergeben
- [x] `src/pages/RunDetail.tsx` — Status-Chip `'paused'` Case
- [x] `src/pages/RunDetail.tsx` — KPI-Kachel "pausiert"-Badge
- [x] `src/pages/RunDetail.tsx` — Hover vereinheitlicht: Zurück, Neu verarbeiten, Pause, KPI-Kachel

### Run-Liste
- [x] `src/components/StatusChip.tsx` — `'paused'` in `statusConfig`
- [x] `src/index.css` — `.status-chip-paused` CSS-Klasse
- [x] `src/pages/Index.tsx` — Status-Filter-Eintrag "Pausiert"

### Add-on Bugfixes (nach Erstimplementierung)
- [x] `src/store/runStore.ts` — **BUGFIX**: `resumeRun()` ruft nicht mehr `advanceToNextStep()` auf (verhindert Step-Skip)
- [x] `src/store/runStore.ts` — `resumeRun()` triggert stattdessen Step-spezifische Re-Execution (Step 2/3/4)
- [x] `src/pages/RunDetail.tsx` — Hover-Effekt auf alle 7 `TabsTrigger` angewendet (`hover:bg-[#008C99] hover:text-[#E3E0CF] transition-colors`)

---

## Technische Entscheidungen

| Thema | Entscheidung |
|-------|-------------|
| Timer-Deadlock | `clearTimeout(autoAdvanceTimer)` in `pauseRun()` — verhindert, dass auslaufende Timers den Workflow fortsetzen |
| Step-Status-Integrität | Steps bleiben technisch `'running'`. Nur `Run.status` wird `'paused'`. UI liest Pausezustand aus `isPaused`. |
| Hover-Implementierung | Ausschließlich Tailwind `hover:` Klassen — kein `onMouseEnter`/`onMouseLeave` |
| Persistierung | `isPaused` ist reiner UI-State, nicht persistiert — bei Page-Reload zurückgesetzt |
| resumeRun-Bugfix | `advanceToNextStep()` würde den laufenden Step als 'ok' markieren und überspringen. Stattdessen wird die Step-spezifische Ausführungslogik direkt neu angestoßen (Steps 2/3/4). Steps 1 und 5 benötigen keinen Re-trigger. |
