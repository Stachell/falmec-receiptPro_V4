# PROJ-40 ADD-ON-3: Serial-Persistenz Finalisierung

**Status:** Planungsphase
**Datum:** 2026-03-07
**Vorgaenger:** PROJ-40-ADD-ON-2 (Step-3-Serienpersistenz)
**Betroffene Dateien:** 4 (1 neu, 3 modifiziert)

---

## Problem

ADD-ON-2 hat die Seriennummern-Daten korrekt aufbereitet (Fix A/B/C), aber die Persistierung in die IndexedDB haengt ausschliesslich am `useRunAutoSave`-Hook mit 2-Sekunden-Debounce. Wenn der User nach Step 3 sofort wegnavigiert oder archiviert:

1. RunDetail.tsx unmounted → `setCurrentRun(null)` wird aufgerufen
2. useRunAutoSave Cleanup → `clearTimeout(timerRef)` bricht den noch wartenden Save ab
3. Der Debounce-Callback prueft `if (!current.currentRun) return` → Guard schlaegt zu
4. **Ergebnis:** Seriennummern, serialDocument und preFilteredSerials landen NIE in der IndexedDB

## Loesung: Zwei Pfeiler

### Pfeiler 1: Hard Checkpoint (Workflow-Blocker)

Am Ende von `executeMatcherSerialExtract` in `runStore.ts` wird nach dem `set()` (State-Update) ein **direkter, awaited** `runPersistenceService.saveRun()` Aufruf eingefuegt. Dieser schreibt den aktuellen Store-State (inkl. serialDocument und serialNumbers auf den InvoiceLines) sofort in die IndexedDB. Der Step-Status ist zu diesem Zeitpunkt bereits gesetzt — der Hard Checkpoint stellt sicher, dass dieser Status auch persistiert ist, bevor die Funktion returnt.

**Wo genau:**
- Nach dem SerialFinder-Pfad `set()` (runStore.ts ~Zeile 3072)
- Nach dem Legacy-Pfad `set()` (runStore.ts ~Zeile 3157)
- Beide Stellen: identischer Code-Block

### Pfeiler 2: Unmount-Flush (Sicherheitsnetz)

In `useRunAutoSave.ts` wird die Cleanup-Funktion erweitert: Wenn ein laufender Debounce-Timer existiert, wird er nicht nur geloescht, sondern der Save wird **sofort ausgefuehrt** (Flush). Eine `lastRunIdRef` trackt die zuletzt bekannte Run-ID, damit der Flush auch funktioniert, wenn `currentRun` durch RunDetail.tsx bereits auf `null` gesetzt wurde.

---

## Implementierungsplan (4 Schritte)

### Schritt 1: Shared Helper `buildAutoSavePayload.ts` (NEU)

**Datei:** `src/hooks/buildAutoSavePayload.ts`

Extrahiert die Save-Payload-Konstruktion (aktuell Zeilen 58-91 in useRunAutoSave.ts) in eine wiederverwendbare Funktion. Wird von drei Stellen genutzt:
- useRunAutoSave Debounce-Callback
- useRunAutoSave Unmount-Flush
- executeMatcherSerialExtract Hard Checkpoint

```typescript
import { useRunStore } from '@/store/runStore';
import { logService } from '@/services/logService';

export function buildAutoSavePayload(runId: string) {
  const current = useRunStore.getState();

  // Fallback: wenn currentRun bereits null (Unmount-Race), Run aus runs-Array holen
  const run = current.currentRun?.id === runId
    ? current.currentRun
    : current.runs.find(r => r.id === runId);
  if (!run) return null;

  const linePrefix = `${runId}-line-`;
  const runLines = current.invoiceLines
    .filter(l => l.lineId.startsWith(linePrefix))
    .map(l => ({
      ...l,
      descriptionIT: l.descriptionIT ? l.descriptionIT.substring(0, 10) : l.descriptionIT,
    }));

  return {
    id: runId,
    run,
    invoiceLines: runLines,
    issues: current.issues.filter(i => i.runId === runId),
    auditLog: current.auditLog.filter(a => a.runId === runId),
    parsedPositions: current.currentParsedRunId === runId ? current.parsedPositions : [],
    parserWarnings: current.currentParsedRunId === runId ? current.parserWarnings : [],
    parsedInvoiceResult: current.parsedInvoiceResult ?? null,
    serialDocument: current.serialDocument ?? null,
    uploadMetadata: current.uploadedFiles.map(f => ({
      type: f.type, name: f.name, size: f.size, uploadedAt: f.uploadedAt,
    })),
    runLog: logService.getRunBuffer(runId),
  };
}
```

**Wichtig:** Die Funktion gibt `null` zurueck, wenn weder `currentRun` noch ein Run im `runs`-Array gefunden wird. Alle Aufrufer muessen diesen Fall pruefen.

---

### Schritt 2: Pfeiler 1 — Hard Checkpoint in `runStore.ts`

**Datei:** `src/store/runStore.ts`

#### 2a. Import hinzufuegen (bei den bestehenden Imports)
```typescript
import { buildAutoSavePayload } from '@/hooks/buildAutoSavePayload';
```

#### 2b. Funktionssignatur aendern
```typescript
// Vorher (Interface ~Zeile 473):
executeMatcherSerialExtract: () => void;
// Nachher:
executeMatcherSerialExtract: () => Promise<void>;

// Vorher (Implementation Zeile 2943):
executeMatcherSerialExtract: () => {
// Nachher:
executeMatcherSerialExtract: async () => {
```

#### 2c. Hard Checkpoint nach SerialFinder-Pfad (nach Zeile ~3072, VOR logService.info)
```typescript
// PROJ-40 ADD-ON-3: Hard Checkpoint — S/N-Daten sofort persistieren
if (runPersistenceService.isAvailable()) {
  try {
    const payload = buildAutoSavePayload(runId);
    if (payload) {
      await runPersistenceService.saveRun(payload);
      logService.info('Hard-Checkpoint: S/N-Daten nach Step 3 persistiert',
        { runId, step: 'Seriennummer anfuegen' });
    }
  } catch (err) {
    console.error('[RunStore] Step 3 hard checkpoint failed:', err);
  }
}
```

#### 2d. Hard Checkpoint nach Legacy-Pfad (nach Zeile ~3157, VOR logService.info)
Identischer Code-Block wie 2c.

#### Auswirkung auf Aufrufer
Alle drei Aufrufer (`setTimeout` fire-and-forget) ignorieren den Return-Value. `() => void` → `() => Promise<void>` ist abwaertskompatibel, da das Promise einfach nicht awaited wird. **Innerhalb** der Funktion sorgt das `await` dafuer, dass der IndexedDB-Write abgeschlossen ist, bevor die Funktion returnt.

---

### Schritt 3: Pfeiler 2 — Unmount-Flush in `useRunAutoSave.ts`

**Datei:** `src/hooks/useRunAutoSave.ts`

#### 3a. Import hinzufuegen
```typescript
import { buildAutoSavePayload } from './buildAutoSavePayload';
```

#### 3b. `lastRunIdRef` hinzufuegen (nach Zeile 24)
```typescript
const lastRunIdRef = useRef<string | null>(null);
```

#### 3c. RunId tracken (nach dem Guard `if (!state.currentRun) return;` in Zeile 34)
```typescript
lastRunIdRef.current = state.currentRun.id;
```

#### 3d. Debounce-Callback refactoren (Zeilen 54-95)
Inline-Payload durch Helper ersetzen:
```typescript
timerRef.current = setTimeout(() => {
  const current = useRunStore.getState();
  if (!current.currentRun) return;

  const payload = buildAutoSavePayload(current.currentRun.id);
  if (payload) {
    runPersistenceService.saveRun(payload).catch(err => {
      console.error('[AutoSave] Failed to save run:', err);
    });
  }
}, DEBOUNCE_MS);
```

#### 3e. Cleanup-Funktion mit Flush ersetzen (Zeilen 98-103)
```typescript
return () => {
  unsubscribe();
  if (timerRef.current) {
    clearTimeout(timerRef.current);
    timerRef.current = null;

    // PROJ-40 ADD-ON-3: Flush — pending Save sofort ausfuehren
    const runId = lastRunIdRef.current;
    if (runId) {
      const payload = buildAutoSavePayload(runId);
      if (payload) {
        runPersistenceService.saveRun(payload).catch(err => {
          console.error('[AutoSave] Flush on unmount failed:', err);
        });
      }
    }
  }
};
```

**Warum Fire-and-Forget hier sicher ist:** IndexedDB-Transaktionen sind Browser-Level und ueberleben das React-Unmounting. Der `put()` wird vom Browser abgeschlossen, auch wenn die React-Komponente bereits zerstoert ist. Pfeiler 1 (Hard Checkpoint) garantiert zusaetzlich, dass die Daten bereits gespeichert sind — der Flush ist nur ein Sicherheitsnetz fuer Aenderungen nach Step 3.

---

### Schritt 4: RunDetail.tsx — KEINE Aenderung noetig

Das Timing-Problem (`setCurrentRun(null)` vor Flush) wird durch zwei Mechanismen geloest:
1. `lastRunIdRef` in useRunAutoSave speichert die Run-ID unabhaengig von `currentRun`
2. `buildAutoSavePayload` faellt auf `runs.find(r => r.id === runId)` zurueck, wenn `currentRun` bereits `null` ist
3. Das `runs`-Array wird durch `setCurrentRun(null)` NICHT geleert — nur `currentRun` wird null

---

## NICHT anfassen (explizite Ausschlussregel)

- `archiveService.ts` — keine Aenderungen an Dateiloeschung/`clearAllFiles()`
- `loadStoredFiles()` — kein Rebuild fuer `preFilteredSerials`
- `RunDetail.tsx` — keine Aenderungen am Mount/Unmount-Lifecycle

---

## Verifizierung / Testplan

| Test | Szenario | Erwartetes Ergebnis |
|------|----------|---------------------|
| **T1: Hard Checkpoint** | Step 3 ausfuehren, sofort Browser-Tab schliessen | IndexedDB enthaelt serialNumbers + serialDocument |
| **T2: Unmount Flush** | Step 3 ausfuehren, <2s wegnavigieren (Dashboard) | Run bei Rueckkehr hat vollstaendige Seriennummern |
| **T3: Normaler Debounce** | Step 3 ausfuehren, 3+ Sekunden auf Seite bleiben | Regression-Test: Persistierung funktioniert wie bisher |
| **T4: Kein Serial-Dokument** | Step 3 ohne S/N-Datei ausfuehren | Step wird als 'ok' markiert, kein Fehler im Checkpoint |
| **T5: Doppel-Write** | Step 3 ausfuehren, auf Seite bleiben | Hard Checkpoint schreibt sofort, Debounce schreibt ~2s spaeter. Idempotent (gleicher Key), nur `savedAt` aendert sich |

---

## Risikobewertung

| Risiko | Bewertung | Begruendung |
|--------|-----------|-------------|
| Async-Signatur-Aenderung | Niedrig | Alle 3 Aufrufer sind fire-and-forget in `setTimeout` |
| Doppel-Write IndexedDB | Kein Risiko | `store.put()` ist idempotent auf gleichem Key |
| Flush Fire-and-Forget | Niedrig | IDB-Transaktionen ueberleben React-Lifecycle; Pfeiler 1 ist primaere Sicherung |
| `buildAutoSavePayload` null-Return | Niedrig | Nur bei komplett geloeschtem Run moeglich — defensive Pruefung eingebaut |

---

## Parameter fuer Projektdaten & Workflow (Regeln fuer Sonnet)

1. **Plan-Modus zuerst:** Du gehst IMMER zuerst in den Plan-Modus, bevor du Code schreibst. Lies diesen Plan vollstaendig und erstelle einen ausfuehrbaren Implementierungsplan.

2. **Projektdaten-Update:** Du schreibst IMMER in die Projektdaten (MEMORY.md / relevante Memory-Dateien), um den aktuellen Stand des Projekts zu dokumentieren.

3. **TypeScript-Pruefung:** Du musst nach Abschluss deiner Code-Aenderungen zwingend und selbststaendig `npx tsc --noEmit` ueber dein Bash-Terminal ausfuehren und eventuelle Fehler direkt fixen. Keine Abgabe mit offenen Type-Errors.

4. **INDEX.md Update:** Du aktualisierst GANZ AM ENDE die `features/INDEX.md`, um das Add-On als erledigt zu markieren. Formatierung analog zu bestehenden Eintraegen (Pipe-Table, Status "Done", einzeilige Beschreibung).

5. **Kein Over-Engineering:** Halte dich exakt an die 4 Schritte in diesem Plan. Keine zusaetzlichen Refactorings, keine neuen Features, keine Aenderungen an Dateien die nicht explizit genannt sind.

6. **Ausschlussregel beachten:** KEINE Aenderungen an `archiveService.ts`, `clearAllFiles()`, `loadStoredFiles()` oder `RunDetail.tsx`.