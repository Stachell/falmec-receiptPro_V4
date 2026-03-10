# PROJ-44: Step 4 Waiting Point Switch — Architektur-Plan

## Context

Nach dem Ausrollen der Artikelliste in Step 4 (Order Mapping) sind die Invoicelines hart gesperrt. Aktuell laeuft der Workflow vollautomatisch von Step 3 nach Step 4 durch — ohne Kontrollpunkt. Dieses Feature fuegt einen optionalen "Waiting Point" ein, der dem User die letzte Kontrolle gibt, BEVOR Daten festgeschrieben werden. Im Standard-Modus (Schalter aktiv = `true`) bleibt der Workflow unveraendert.

**Feature-Spec:** `features/Step4_Waiting_point_switch.md` (bereits vorhanden, 330 Zeilen)

---

## Phase 1: Types & State

### 1A — RunConfig erweitern
**Datei:** `src/types/index.ts` (nach Zeile ~165, nach `blockStep4OnMissingOrder`)

```typescript
/** Step 4 Waiting Point: true = Auto-Start (Default), false = Stopp vor Step 4 */
autoStartStep4: boolean;
```

### 1B — Store-State erweitern
**Datei:** `src/store/runStore.ts`

**Interface** (nach `autoAdvanceTimer`, ~Zeile 415):
```typescript
/** Step 4 Waiting Point: true solange Workflow vor Step 4 auf User wartet */
isWaitingBeforeStep4: boolean;
/** Step 4 Waiting Point: RunId des wartenden Runs */
waitingStep4RunId: string | null;
/** Step 4 Waiting Point: Steuert AlertDialog-Sichtbarkeit */
showStep4WaitingDialog: boolean;
```

**Actions im Interface** (nach `resumeRun`, ~Zeile 458):
```typescript
/** Step 4 Waiting Point: User waehlt STOP */
dismissStep4WaitingDialog: () => void;
/** Step 4 Waiting Point: User waehlt DURCHFUEHREN */
proceedStep4FromWaiting: () => void;
```

**Defaults** (~Zeile 545, globalConfig):
```typescript
autoStartStep4: true,
```

**Defaults** (~Zeile 555, UI-State):
```typescript
isWaitingBeforeStep4: false,
waitingStep4RunId: null,
showStep4WaitingDialog: false,
```

### 1C — Action-Implementierungen
**Datei:** `src/store/runStore.ts` (nach `resumeRun` Implementation)

**dismissStep4WaitingDialog** (STOP):
- `set({ isWaitingBeforeStep4: false, waitingStep4RunId: null, showStep4WaitingDialog: false })`
- Log: `logService.info('Step 4 Waiting Point: STOP', { runId, step: 'System' })`
- Step 4 bleibt `not-started` → Kachel 6 kann spaeter fortsetzen

**proceedStep4FromWaiting** (DURCHFUEHREN):
- RunId aus `waitingStep4RunId` lesen BEVOR State zurueckgesetzt wird
- `set({ isWaitingBeforeStep4: false, waitingStep4RunId: null, showStep4WaitingDialog: false })`
- `get().advanceToNextStep(runId)` aufrufen → triggert Step 4 sofort
- Log: `logService.info('Step 4 Waiting Point: DURCHFUEHREN', { runId, step: 'System' })`

---

## Phase 2: Workflow Guard

### 2A — Guard in Step 3→4 Auto-Advance
**Datei:** `src/store/runStore.ts` (~Zeilen 1498-1508)

**Bestehender Code** (innerhalb `t3adv` Timer-Callback):
```typescript
if (step3 && (step3.status === 'ok' || step3.status === 'soft-fail')) {
  logService.info('Auto-Advance: Step 3 → Step 4', ...);
  afterSerial.advanceToNextStep(runId);  // ← HIER Guard einsetzen
}
```

**Neuer Code:**
```typescript
if (step3 && (step3.status === 'ok' || step3.status === 'soft-fail')) {
  // --- Step 4 Waiting Point Guard ---
  const effectiveConfig = updatedRun?.config ?? afterSerial.globalConfig;
  if (!effectiveConfig.autoStartStep4) {
    logService.info('Step 4 Waiting Point: Workflow angehalten', { runId, step: 'System' });
    set({
      isWaitingBeforeStep4: true,
      waitingStep4RunId: runId,
      showStep4WaitingDialog: true,
    });
    return; // NICHT advanceToNextStep aufrufen
  }
  // --- Ende Guard ---
  logService.info('Auto-Advance: Step 3 → Step 4', { runId, step: 'System' });
  afterSerial.advanceToNextStep(runId);
}
```

**Warum genau hier:** Der Timer feuert NACH Step 3 Completion (Status-Check bestanden) aber VOR `advanceToNextStep` (das Step 4 auf `running` setzen wuerde). Step 4 bleibt `not-started` → Kachel 6 funktioniert als Fortsetzer.

### 2B — Kachel 6 nach STOP (Kein Eingriff noetig!)
Der Guard liegt NUR im `t3adv`-Timer (Auto-Advance Step 3→4). Die `nextStep.stepNo === 4` Logik in `advanceToNextStep` selbst hat KEINEN Guard — daher triggert Kachel 6 via `advanceToNextStep(runId)` den Step 4 direkt ohne erneutes Popup. ✓

---

## Phase 3: Config-Synchronisation

### 3A — setGlobalConfig erweitern
**Datei:** `src/store/runStore.ts` (~Zeile 583)

Wenn `autoStartStep4` geaendert wird, soll die Aenderung auch auf den aktuell aktiven Run durchschlagen (Spec-Anforderung: "Settings-Aenderung muss fuer aktiven Run sichtbar wirksam sein"):

```typescript
setGlobalConfig: (config) => set((state) => {
  const newGlobalConfig = { ...state.globalConfig, ...config };
  // Sync autoStartStep4 zum aktiven Run
  let newCurrentRun = state.currentRun;
  let newRuns = state.runs;
  if ('autoStartStep4' in config && state.currentRun) {
    const updatedRunConfig = { ...state.currentRun.config, autoStartStep4: config.autoStartStep4 };
    newCurrentRun = { ...state.currentRun, config: updatedRunConfig };
    newRuns = state.runs.map(r =>
      r.id === state.currentRun!.id ? { ...r, config: updatedRunConfig } : r
    );
  }
  return { globalConfig: newGlobalConfig, currentRun: newCurrentRun, runs: newRuns };
}),
```

### 3B — RunDetail Switch (nur Run-Level)
Der Switch im RunDetail Header schreibt NUR auf `currentRun.config.autoStartStep4` und `runs[].config`, NICHT auf `globalConfig`. Damit aendert er nur den aktuellen Run.

---

## Phase 4: UI — RunDetail Header

### 4A — Lock-Icon + Switch Control
**Datei:** `src/pages/RunDetail.tsx`

**Neue Imports:**
```typescript
import { Switch } from '@/components/ui/switch';
import lockClosedIcon from '@/assets/icons/Lock_CLOSE_STEP4.ico';
import lockOpenIcon from '@/assets/icons/Lock_OPEN_STEP4.ico';
```

**AlertDialog Imports** (falls nicht schon vorhanden):
```typescript
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
```

**Store-Selektoren erweitern** (~Zeile 63):
```typescript
const {
  // ... bestehend ...
  isWaitingBeforeStep4, showStep4WaitingDialog,
  dismissStep4WaitingDialog, proceedStep4FromWaiting,
  globalConfig,
} = useRunStore();
```

**Derived Values:**
```typescript
const step4Status = currentRun?.steps.find(s => s.stepNo === 4)?.status;
const isStep4Complete = step4Status === 'ok' || step4Status === 'soft-fail';
const autoStartStep4 = currentRun?.config?.autoStartStep4 ?? globalConfig.autoStartStep4 ?? true;
```

**JSX — Lock + Switch** direkt VOR dem Pause-Button (~Zeile 613):
```tsx
{/* Step 4 Waiting Point: Lock Icon + Switch */}
<div className="flex items-center gap-1.5 mr-2">
  <img
    src={isStep4Complete ? lockOpenIcon : lockClosedIcon}
    alt={isStep4Complete ? 'Artikelliste freigegeben' : 'Artikelliste gesperrt'}
    className="w-5 h-5"
  />
  <Switch
    checked={autoStartStep4}
    onCheckedChange={(checked) => {
      if (!currentRun) return;
      const updatedConfig = { ...currentRun.config, autoStartStep4: checked };
      useRunStore.setState((state) => ({
        currentRun: state.currentRun?.id === currentRun.id
          ? { ...state.currentRun, config: updatedConfig } : state.currentRun,
        runs: state.runs.map(r =>
          r.id === currentRun.id ? { ...r, config: updatedConfig } : r),
      }));
    }}
    className="scale-75"
  />
</div>
```

**Icon-Logik:** Exakt gleiche Logik wie `ItemsTable.tsx` — geschlossen solange Step 4 nicht `ok`/`soft-fail`, offen danach. Das Icon zeigt den Status der Artikelliste, NICHT den Status des Schalters.

### 4B — AlertDialog
**Datei:** `src/pages/RunDetail.tsx` (am Ende des JSX-Returns, neben anderen Dialogen)

```tsx
<AlertDialog open={showStep4WaitingDialog}
  onOpenChange={(open) => { if (!open) dismissStep4WaitingDialog(); }}>
  <AlertDialogContent style={{ backgroundColor: '#D8E6E7' }}>
    <AlertDialogHeader>
      <AlertDialogTitle>Beleg zuordnen</AlertDialogTitle>
      <AlertDialogDescription>
        Moechten Sie den Schritt Beleg zuordnen ausfuehren oder moechten Sie den
        Workflow anhalten um Aenderungen in den z.B. in den Rechnungspositionen durchfuehren?
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel onClick={() => dismissStep4WaitingDialog()}>STOP</AlertDialogCancel>
      <AlertDialogAction onClick={() => proceedStep4FromWaiting()}>DURCHFUEHREN</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## Phase 5: UI — Settings Popup

### 5A — Neuer Abschnitt in "Allgemein"
**Datei:** `src/components/SettingsPopup.tsx`

**Neuer Import:**
```typescript
import lockClosedIcon from '@/assets/icons/Lock_CLOSE_STEP4.ico';
```

**JSX** — nach dem Toleranz-Block (~Zeile 932), vor `</TabsContent>`:

```tsx
{/* Step 4 Waiting Point */}
<div className="border-t border-border pt-3">
  <div className="flex items-center justify-between gap-4">
    <div className="flex items-center gap-2">
      <img src={lockClosedIcon} alt="Lock" className="w-5 h-5" />
      <Label className="text-sm whitespace-nowrap">Artikelliste mit Step 4 ausrollen?</Label>
    </div>
    <Switch
      checked={globalConfig.autoStartStep4}
      onCheckedChange={(checked) => setGlobalConfig({ autoStartStep4: checked })}
    />
  </div>
</div>
```

Icon ist hier STATISCH geschlossen (keine Statusfunktion, nur visuelle Referenz).

---

## Phase 6: Defensive Massnahmen

### 6A — pauseRun Cleanup
**Datei:** `src/store/runStore.ts` (in `pauseRun`, ~Zeile 1962)

Wenn der User pausiert waehrend das Dialog offen ist, muss der Dialog geschlossen werden:
```typescript
// Am Anfang von pauseRun, nach Timer-Cleanup:
if (get().isWaitingBeforeStep4) {
  set({ isWaitingBeforeStep4: false, waitingStep4RunId: null, showStep4WaitingDialog: false });
}
```

### 6B — createNewRun Default
**Datei:** `src/store/runStore.ts` (~Zeile 758, in `createNewRun`)

Sicherstellen, dass neue Runs `autoStartStep4` aus `globalConfig` erben:
```typescript
config: { ...get().globalConfig },  // bereits so implementiert ✓
```

---

## Betroffene Dateien (Zusammenfassung)

| Datei | Aenderung |
|-------|-----------|
| `src/types/index.ts` | `autoStartStep4: boolean` in RunConfig |
| `src/store/runStore.ts` | State, Actions, Guard, Config-Sync, pauseRun-Cleanup |
| `src/pages/RunDetail.tsx` | Lock+Switch Header-Control, AlertDialog |
| `src/components/SettingsPopup.tsx` | Neuer Abschnitt in "Allgemein" |

**Wiederverwendete Patterns:**
- Lock-Icons aus `src/assets/icons/Lock_CLOSE_STEP4.ico` / `Lock_OPEN_STEP4.ico`
- Switch aus `src/components/ui/switch.tsx`
- AlertDialog aus `src/components/ui/alert-dialog.tsx`
- `setGlobalConfig` Pattern aus bestehenden blockStep-Toggles

---

## Verifikation

1. **Default-Verhalten unveraendert:** Switch=ON → Workflow laeuft automatisch Steps 1-5 durch, kein Dialog
2. **STOP-Pfad:** Switch=OFF → nach Step 3 erscheint Dialog → STOP → Step 4 bleibt `not-started` → Invoicelines bearbeitbar → Kachel 6 → Step 4 startet
3. **DURCHFUEHREN-Pfad:** Switch=OFF → Dialog → DURCHFUEHREN → Step 4 startet sofort, Rest laeuft normal
4. **Settings-Sync:** Settings-Aenderung schlaegt auf aktiven Run durch
5. **RunDetail-Switch:** Aendert nur den aktuellen Run, NICHT den globalen Default
6. **Lock-Icon:** Geschlossen vor Step 4, offen nach Step 4
7. **Pause-Interaktion:** PROJ-25 Pause/Fortfahren bleibt voll funktional
8. **TypeScript:** `npx tsc --noEmit` → 0 Errors

---

## Nuetzliche Hinweise fuer Sonnet bei der Durchfuehrung des Plans um Fehler zu vermeiden

### Fallstrick 1: Timer-Sequenz im Guard
Der Guard liegt INNERHALB des `t3adv` Timer-Callbacks. Das `set({ autoAdvanceTimer: t3adv })` auf ~Zeile 1508 wurde bereits VOR dem Timer-Feuern ausgefuehrt. Nach dem `return` im Guard wird KEIN neuer Timer gesetzt — das ist korrekt. Wenn `proceedStep4FromWaiting` spaeter `advanceToNextStep(runId)` ruft, setzt dieser selbst den neuen `t4`-Timer fuer Step 4.

### Fallstrick 2: isPaused vs isWaitingBeforeStep4
Diese beiden States sind KOMPLETT unabhaengig. `isPaused` blockiert Kachel 6, `isWaitingBeforeStep4` blockiert sie NICHT. Niemals `isPaused` im Waiting-Point-Kontext setzen! Wenn der User waehrend des Wartens pausiert, muss der Dialog geschlossen werden (Phase 6A).

### Fallstrick 3: proceedStep4FromWaiting — RunId VORHER lesen
In `proceedStep4FromWaiting` ZUERST `waitingStep4RunId` aus State lesen, DANN State zuruecksetzen, DANN `advanceToNextStep` aufrufen. Sonst ist die RunId bereits `null`.

### Fallstrick 4: AlertDialog onOpenChange
shadcn AlertDialog feuert `onOpenChange(false)` wenn der User Escape drueckt oder ausserhalb klickt. Der Handler muss `dismissStep4WaitingDialog()` aufrufen (= STOP-Verhalten), nicht das Dialog einfach nur schliessen.

### Fallstrick 5: setGlobalConfig Sync-Scope
Die Sync-Logik in `setGlobalConfig` darf NUR `autoStartStep4` synchronisieren, NICHT alle Config-Keys. Andere Keys (tolerance, priceBasis etc.) sind Snapshots vom Erstellungszeitpunkt und duerfen nicht rueckwirkend geaendert werden. Der Check `if ('autoStartStep4' in config)` stellt das sicher.

### Fallstrick 6: Kachel 6 nach STOP — KEIN zweiter Guard
Der Guard liegt NUR im `t3adv`-Timer. Die `nextStep.stepNo === 4` Logik in `advanceToNextStep` hat KEINEN Guard. Wenn Sonnet versehentlich dort auch einen Guard einfuegt, wuerde Kachel 6 nach STOP nicht mehr funktionieren. **Auf keinen Fall** einen zweiten Guard in den Step-4-Block von `advanceToNextStep` einbauen!

### Fallstrick 7: Switch-Skalierung
Der Switch im RunDetail-Header sollte `className="scale-75"` erhalten, damit er proportional zu den umgebenden Buttons passt. In den Settings ist volle Groesse korrekt.

### Fallstrick 8: Transiente States nicht persistieren
`isWaitingBeforeStep4`, `waitingStep4RunId`, `showStep4WaitingDialog` sind reiner UI-State. Sie gehoeren NICHT in IndexedDB oder localStorage. Bei Page-Reload setzt sich alles zurueck — der Run steht dann einfach bei Step 3=ok / Step 4=not-started, und Kachel 6 setzt fort.

### Fallstrick 9: run.config Initialwert
Neue Runs erben `config` aus `globalConfig` via Spread (`{ ...get().globalConfig }`). Sicherstellen, dass `autoStartStep4: true` im globalConfig-Default steht, damit bestehende Runs (ohne das Feld) den Fallback `?? true` nutzen.

### Fallstrick 10: Switch Import in SettingsPopup
`Switch` aus `@/components/ui/switch` ist moeglicherweise NOCH NICHT in SettingsPopup importiert. Vor dem Einfuegen pruefen und ggf. ergaenzen. (Bestehende Toggles im Settings nutzen teilweise andere Patterns.)

---

## QA Test Results

**QA-Datum:** 2026-03-10
**Tester:** QA Engineer (Claude)
**TypeScript-Check:** `npx tsc --noEmit` → **0 Errors** ✓

---

### Acceptance Criteria — Ergebnis

| # | Kriterium | Status | Anmerkung |
|---|-----------|--------|-----------|
| P1 | `autoStartStep4: boolean` in `RunConfig` (types/index.ts) | PASS | Z.168 |
| P2 | State: `isWaitingBeforeStep4`, `waitingStep4RunId`, `showStep4WaitingDialog` | PASS | `runStore.ts` Z.417-421, 578-580 |
| P2 | Actions: `dismissStep4WaitingDialog`, `proceedStep4FromWaiting` | PASS | Z.466+468, 2249-2266 |
| P2 | Default: `autoStartStep4: true` in globalConfig | PASS | Z.564 |
| P2 | Transiente States NICHT persistiert (nur UI-State) | PASS | Nicht in buildAutoSavePayload |
| P3 | Guard in `t3adv`-Timer (nicht in `advanceToNextStep`) | PASS | Z.1541-1551 |
| P3 | Kein zweiter Guard in `advanceToNextStep` — Kachel 6 nach STOP funktioniert | PASS | Geprueft |
| P3 | `proceedStep4FromWaiting`: runId BEVOR State-Reset gelesen | PASS | Z.2260, dann Z.2261 |
| P4 | RunDetail: Lock-Icon (isStep4Complete → open/close) | PASS | Z.640-641 |
| P4 | RunDetail: Switch im Header, `scale-75` | PASS | Z.644-656 |
| P4 | RunDetail: AlertDialog mit STOP/DURCHFUEHREN | PASS | Z.1010-1023 |
| P4 | AlertDialog `onOpenChange` → `dismissStep4WaitingDialog()` | PASS | Z.1011 |
| P5 | SettingsPopup: Neuer Abschnitt mit Switch fuer `autoStartStep4` | PASS | Z.966-981 |
| P5 | SettingsPopup: Switch importiert (`@/components/ui/switch`) | PASS | Z.17 |
| P6 | `pauseRun` schliesst Dialog wenn `isWaitingBeforeStep4` | PASS | Z.2024-2026 |
| P6 | `setGlobalConfig`: Sync NUR fuer `autoStartStep4`, nicht alle Keys | PASS | `if ('autoStartStep4' in config)` Z.612 |
| P6 | `createNewRun` erbt `autoStartStep4` aus `globalConfig` via Spread | PASS | Z.771 `config: globalConfig` |
| V1 | Default-Verhalten unveraendert (autoStartStep4=true → kein Dialog) | PASS | Guard: `if (!autoStartStep4)` → bei true kein Guard |
| V2 | STOP-Pfad: Step 4 bleibt `not-started` | PASS | `dismissStep4WaitingDialog` setzt nur UI-State zurueck, kein advanceToNextStep |
| V3 | DURCHFUEHREN-Pfad: `advanceToNextStep(runId)` wird aufgerufen | PASS | Z.2264 |
| V4 | Settings-Sync: Aenderung schlaegt auf aktiven Run durch | PASS | `setGlobalConfig` mit Run-Sync |
| V5 | RunDetail-Switch: Aendert NUR den aktuellen Run, nicht globalConfig | PASS | `useRunStore.setState` ohne setGlobalConfig |
| V6 | Lock-Icon: Geschlossen vor Step 4, offen nach Step 4 | PASS | `isStep4Complete = ok\|soft-fail` |
| V7 | Pause-Interaktion: Dialog wird geschlossen beim Pausieren | PASS | `pauseRun` Z.2024-2026 |

---

### Gefundene Bugs

#### Bug #2 — LOW: SettingsPopup Lock-Icon — statischer Pfad `/icons/...` statt Vite-Asset-Import
- **Datei:** `src/components/SettingsPopup.tsx` Z.970
- **Code:** `<img src="/icons/Lock_CLOSE_STEP4.ico" ...>`
- **Problem:** Das Icon liegt in `src/assets/icons/Lock_CLOSE_STEP4.ico`, nicht in `public/icons/`. Der statische Pfad `/icons/...` funktioniert in einer Vite-App nur fuer Dateien im `public/`-Verzeichnis. Das Icon wird im Browser NICHT angezeigt.
- **Korrekte Loesung:** `import lockClosedIcon from '@/assets/icons/Lock_CLOSE_STEP4.ico'` (wie in `RunDetail.tsx` Z.16 bereits korrekt implementiert), dann `src={lockClosedIcon}`.
- **Workaround:** `onError`-Handler versteckt das kaputte Bild (`style.display='none'`), sodass der Switch allein erscheint — keine Funktionalitaet beeintraechtigt.
- **Impact:** Nur kosmetisch. Switch und Label zeigen korrekt. Kein Funktionsverlust.
- **Reproduktion:** Settings oeffnen → Tab "Allgemein" → Lock-Icon neben "Artikelliste mit Step 4 ausrollen?" ist unsichtbar.

---

### Fallstrick-Verifizierung (alle 10 dokumentierten Fallstricke)

| Fallstrick | Geprueft | Ergebnis |
|------------|----------|---------|
| 1: Timer-Sequenz korrekt — Guard im t3adv, nicht ausserhalb | PASS | Guard liegt in t3adv-Callback Z.1541 |
| 2: isPaused und isWaitingBeforeStep4 unabhaengig — kein isPaused im Waiting-Kontext | PASS | Verifiziert |
| 3: proceedStep4FromWaiting liest runId VOR State-Reset | PASS | Z.2260 vor Z.2261 |
| 4: AlertDialog onOpenChange ruft dismissStep4WaitingDialog | PASS | Z.1011 |
| 5: setGlobalConfig sync NUR autoStartStep4 | PASS | `if ('autoStartStep4' in config)` |
| 6: Kein zweiter Guard in advanceToNextStep | PASS | advanceToNextStep hat keinen neuen Guard |
| 7: Switch im RunDetail `scale-75` | PASS | Z.656 |
| 8: Transiente States nicht persistiert | PASS | Nicht in buildAutoSavePayload |
| 9: autoStartStep4:true als globalConfig-Default | PASS | Z.564 |
| 10: Switch in SettingsPopup importiert | PASS | Z.17 |

---

### Regressionstest

| Pruefpunkt | Status |
|------------|--------|
| PROJ-31 Lock-Icon in ItemsTable unbeeintraechtigt | PASS — eigene Datei, unveraendert |
| PROJ-28 blockStep4OnMissingOrder Guard unbeeintraechtigt | PASS — unveraendert |
| PROJ-25 Pause/Fortfahren weiterhin funktional | PASS — pauseRun nur erweitert, nicht umgebaut |
| autoStartStep4 aus globalConfig auf neue Runs vererbt | PASS — `config: globalConfig` |

---

### Sicherheits-Audit

- Keine neuen Angriffsvektoren — reine UI-State-Erweiterung
- `autoStartStep4` wird ueber dieselben sicheren Pfade persistiert wie alle anderen RunConfig-Felder
- Transiente States (`isWaitingBeforeStep4` etc.) nicht in localStorage oder IndexedDB

---

### Entscheidung

**PRODUCTION READY: JA**

Begruendung: Alle 24 Acceptance Criteria bestehen. 1 Low-Bug gefunden (SettingsPopup-Icon unsichtbar wegen fehlerhaftem statischen Pfad — kein Funktionsverlust). Keine Critical/High-Bugs. TypeScript: 0 Errors.
