# PROJ-41: UI- & Log-Verkabelung — Implementierungsplan

## Context

Step 3 (Seriennummern) und Step 4 (Bestellungen mappen) haben abgerissene Kabel zwischen Business-Logik, UI (Fehlercenter/Settings) und Logging. Issues werden gebaut, aber ohne `affectedLineIds` → Fehlercenter zeigt leere Karten. Diagnostics werden nicht gesetzt → Settings "Letzte Diagnose" bleibt leer. Parser-Issues werden stillschweigend verworfen. Manuelle Aktionen sind audit-blind. Run-Logs gehen bei Page-Refresh verloren.

Dieser Plan lötet die Kabel chirurgisch an und dient als Blaupause für künftige Steps.

---

## Betroffene Dateien

| Datei | Änderungen |
|-------|-----------|
| `src/store/runStore.ts` | Befund A/B/D/F/G/H, Audit-Wiring, Console-Cleanup |
| `src/components/SettingsPopup.tsx` | Befund D: Toggle entfernen |
| `src/services/logService.ts` | `restoreRunBuffer()` hinzufügen |
| `src/services/runPersistenceService.ts` | `runLog` Feld in `PersistedRunData` |
| `src/hooks/useRunAutoSave.ts` | `runLog` in Save-Payload aufnehmen |
| `src/services/matching/matchingEngine.ts` | `console.log` → `logService.debug` |

---

## Phase 1 — Business-Logik & UI-Wiring

### 1A: `affectedLineIds` auf serial-mismatch (Befund A)

**Datei:** `runStore.ts` Zeilen 2980-2998

Das Issue-Objekt im preFilteredSerials-Pfad setzt `relatedLineIds` (Zeile 2992) aber kein `affectedLineIds`. Das IssuesCenter rendert Zeilen ausschließlich über `affectedLineIds`.

**Fix:** Eine Zeile nach `relatedLineIds` (Zeile 2992) einfügen:

```typescript
relatedLineIds: underServedLines.map(l => l.lineId),
affectedLineIds: underServedLines.map(l => l.lineId),  // PROJ-41: Fehlercenter-Rendering
```

---

### 1B: Step-3 Diagnostics für preFilteredSerials (Befund B)

**Datei:** `runStore.ts` Zeile 3033

Nach dem `logService.info(...)` Aufruf (Zeile 3030-3033), **vor** dem `return;` (Zeile 3034):

```typescript
// PROJ-41: Step-3 Diagnostics für Settings "Letzte Diagnose"
get().setStepDiagnostics(3, {
  stepNo: 3,
  moduleName: 'SerialFinder (preFiltered)',
  confidence: checksumMatch ? 'high' : (assignedCount > 0 ? 'medium' : 'low'),
  summary: requiredCount === 0
    ? 'Keine S/N-Pflicht'
    : `${assignedCount}/${requiredCount} S/N zugewiesen`,
  timestamp: new Date().toISOString(),
});
```

Alle Variablen (`checksumMatch`, `assignedCount`, `requiredCount`) sind bereits im Scope (Zeilen 2968-2972). Muster analog zum Legacy-Pfad (Zeile 3112).

---

### 1C: Anti-Cheat Toggle entfernen (Befund D)

3 Stellen:

1. **`SettingsPopup.tsx` Zeilen 967-979:** Gesamten Block `{/* [F] Block-Toggle Step 4 */}` bis zum schließenden `</div>` löschen (13 Zeilen).

2. **`SettingsPopup.tsx` Zeile 491:** Zeile `const blockStep4OnMissingOrder = ...` löschen (wird nirgends mehr referenziert).

3. **`runStore.ts` Zeilen 1410-1421:** Den gesamten `if (runningStep.stepNo === 4 && globalConfig.blockStep4OnMissingOrder)` Block löschen (12 Zeilen).

**Bewusst beibehalten:** Das Feld `blockStep4OnMissingOrder` im `GlobalConfig`-Interface und den Default `false` im Initial-State — alte persisted Configs sollen nicht brechen.

---

### 1D: Parser-Issues durchleiten (Befund F)

**Datei:** `runStore.ts` — 3 identische Call-Sites

| Call-Site | Zeile (`.then` Beginn) | Nach Zeile (Warnings-Loop Ende) |
|-----------|------------------------|---------------------------------|
| advanceToNextStep | 1502 | 1505 |
| retryStep | 1695 | 1698 |
| resumeRun | 1980 | 1983 |

**Fix (identisch an allen 3 Stellen):** Nach der `for (const w of parseResult.warnings)` Schleife einfügen:

```typescript
// PROJ-41: Strukturierte Parser-Issues in State übernehmen
if (parseResult.issues && parseResult.issues.length > 0) {
  set((state) => ({
    issues: [
      ...state.issues.filter(i => !(i.runId === runId && i.stepNo === 4 && i.type === 'parser-error')),
      ...parseResult.issues!.map(issue => ({ ...issue, runId })),
    ],
  }));
}
```

Der Filter `type === 'parser-error'` verhindert Duplikate bei Re-Runs (orderParser.ts erzeugt Issues vom Typ `'parser-error'`, Zeile 428). `runId` wird explizit gesetzt, da der Parser ihn nicht kennt.

---

### 1E: Log-Qualität Step-3 + Upload-runId (Befund G & H)

**Befund G — `runStore.ts` Zeilen 2978-2999:**
Im `if (!checksumMatch)` Block, nach dem `step3Issues.push(...)` (nach Zeile 2998):

```typescript
// PROJ-41: Mismatch als WARN/ERROR loggen
const logFn = shouldHardFail ? logService.error : logService.warn;
logFn(
  `S/N-Mismatch: ${assignedCount}/${requiredCount} zugewiesen (${underServedLines.length} Positionen betroffen)`,
  { runId, step: 'Seriennummer anfuegen' },
);
```

**Befund H — `runStore.ts` Zeilen 641-653:**
`runId` an die 3 logService-Aufrufe im Pre-Filter-Upload-Handler übergeben:

```typescript
// Zeile 643: { step: 'Seriennummer anfuegen' }
// wird zu:
{ runId: get().currentRun?.id, step: 'Seriennummer anfuegen' }
```

Gleiches für Zeile 646 und 651-653. `runId` kann `undefined` sein (Upload vor Run-Start) — logService toleriert das.

---

## Phase 2 — Audit- & Log-Verkabelung

### 2A: Manuelle Aktionen tracken

6 Methoden in `runStore.ts` erhalten je einen `logService`- und `addAuditEntry`-Aufruf:

#### `setManualPrice` (Zeile 2273)
Nach dem `set(...)` Aufruf, vor der Stats-Berechnung (Zeile 2284/2285):
```typescript
const runId = get().currentRun?.id;
if (runId) {
  logService.info(`Manueller Preis: ${price}`, { runId, step: 'Artikel extrahieren', details: `lineId=${lineId}` });
  get().addAuditEntry({ runId, action: 'setManualPrice', details: `lineId=${lineId}, price=${price}`, userId: 'system' });
}
```

#### `setManualOrder` (Zeile 2517)
Nach dem `set(...)` Aufruf (Zeile 2530), vor Stats-Berechnung:
```typescript
const runId = get().currentRun?.id;
if (runId) {
  logService.info(`Manuelle Bestellung: ${orderYear}-${orderCode}`, { runId, step: 'Bestellungen mappen', details: `lineId=${lineId}` });
  get().addAuditEntry({ runId, action: 'setManualOrder', details: `lineId=${lineId}, order=${orderYear}-${orderCode}`, userId: 'system' });
}
```

#### `confirmNoOrder` (Zeile 2547)
Nach dem `set(...)` Aufruf (Zeile 2557):
```typescript
const runId = get().currentRun?.id;
if (runId) {
  logService.info('Keine Bestellung bestätigt', { runId, step: 'Bestellungen mappen', details: `lineId=${lineId}` });
  get().addAuditEntry({ runId, action: 'confirmNoOrder', details: `lineId=${lineId}`, userId: 'system' });
}
```

#### `reassignOrder` (Zeile 2576)
`runId` ist bereits in Scope (Zeile 2582). Nach dem finalen `set(...)` (Zeile 2649):
```typescript
logService.info(`Bestellung umgewiesen`, { runId, step: 'Bestellungen mappen', details: `lineId=${lineId}, target=${newOrderPositionId ?? freeText ?? 'none'}` });
get().addAuditEntry({ runId, action: 'reassignOrder', details: `lineId=${lineId}, target=${newOrderPositionId ?? freeText ?? 'none'}`, userId: 'system' });
```

#### `resolveIssue` (Zeile 1851)
Von Arrow-Expression zu Function-Body umbauen:
```typescript
resolveIssue: (issueId, resolutionNote) => {
  set((state) => ({
    issues: state.issues.map(issue =>
      issue.id === issueId
        ? { ...issue, status: 'resolved' as const, resolvedAt: new Date().toISOString(), resolutionNote }
        : issue
    ),
  }));
  const runId = get().issues.find(i => i.id === issueId)?.runId ?? get().currentRun?.id;
  if (runId) {
    logService.info(`Issue gelöst: ${issueId}`, { runId, step: 'Issues', details: resolutionNote ?? '' });
    get().addAuditEntry({ runId, action: 'resolveIssue', details: `issueId=${issueId}, note=${resolutionNote ?? ''}`, userId: 'system' });
  }
},
```

#### `escalateIssue` (Zeile 1865)
Gleicher Umbau:
```typescript
escalateIssue: (issueId, recipientEmail) => {
  set((state) => ({
    issues: state.issues.map(issue =>
      issue.id === issueId
        ? { ...issue, escalatedAt: new Date().toISOString(), escalatedTo: recipientEmail }
        : issue
    ),
  }));
  const runId = get().issues.find(i => i.id === issueId)?.runId ?? get().currentRun?.id;
  if (runId) {
    logService.info(`Issue eskaliert an ${recipientEmail}`, { runId, step: 'Issues', details: `issueId=${issueId}` });
    get().addAuditEntry({ runId, action: 'escalateIssue', details: `issueId=${issueId}, to=${recipientEmail}`, userId: 'system' });
  }
},
```

---

### 2B: Run-Log Persistenz

4 koordinierte Änderungen:

#### 1. Neues Feld in `PersistedRunData`
**Datei:** `runPersistenceService.ts` Zeilen 33-47

```typescript
export interface PersistedRunData {
  // ... bestehende Felder ...
  runLog?: LogEntry[];           // PROJ-41: Run-Log für IndexedDB-Persistenz
  savedAt: string;
  sizeEstimateBytes: number;
}
```

Import hinzufügen: `import type { LogEntry } from '@/services/logService';`

#### 2. `restoreRunBuffer` in logService
**Datei:** `logService.ts` — nach `getRunBuffer` (Zeile 273):

```typescript
/** PROJ-41: Restore run buffer from IndexedDB persistence */
restoreRunBuffer(runId: string, entries: LogEntry[]): void {
  this.runBuffers.set(runId, [...entries]);
}
```

#### 3. Save-Payload erweitern
**Datei:** `useRunAutoSave.ts` Zeilen 73-89

Import hinzufügen: `import { logService } from '@/services/logService';`

Im `saveRun()` Payload (nach Zeile 88, vor dem schließenden `})`):
```typescript
runLog: logService.getRunBuffer(runId),
```

#### 4. Restore bei Load
**Datei:** `runStore.ts` Zeile 3175 — nach dem `set(...)` in `loadPersistedRun`:

```typescript
// PROJ-41: Run-Log aus IndexedDB wiederherstellen
if (data.runLog && data.runLog.length > 0) {
  logService.restoreRunBuffer(runId, data.runLog);
}
```

---

### 2C: Console Cleanup

#### matchingEngine.ts — 5× `console.log` → `logService.debug`
**Datei:** `matchingEngine.ts`

Import hinzufügen: `import { logService } from '@/services/logService';`

| Zeile | Ersetzen |
|-------|----------|
| 167 | `logService.debug('[MatchingEngine] Starting 3-Run pipeline...', { runId, step: 'Bestellungen mappen' })` |
| 171 | `logService.debug('[MatchingEngine] Run 1 complete...', { runId, step: 'Bestellungen mappen' })` |
| 175 | `logService.debug('[MatchingEngine] Run 2 complete...', { runId, step: 'Bestellungen mappen' })` |
| 179 | `logService.debug('[MatchingEngine] Run 3 complete...', { runId, step: 'Bestellungen mappen' })` |
| 199 | `logService.debug('[MatchingEngine] Pipeline result...', { runId, step: 'Bestellungen mappen' })` |

**Hinweis:** `runId` muss als Parameter in `executeMatchingEngine` verfügbar sein — prüfen ob bereits vorhanden, ggf. aus dem Aufrufer durchreichen.

#### runStore.ts — Gezielte `console.error` → `logService.error`

Nur Catch-Blöcke wo `runId` in Scope ist:

| Zeile | Kontext |
|-------|---------|
| 2262 | `executeArticleMatching` catch |
| 2364 | `executeOrderMatching` catch |
| 2508 | `executeOrderMapping` catch |
| 2896 | `executeMatcherCrossMatch` catch |
| 3042 | `executeMatcherSerialExtract` matcher-not-found |

Guard-Clause `console.warn` Aufrufe (Zeilen 2196, 2203, 2579, 2585, 2668, etc.) **bleiben** — dort existiert kein `runId`.

---

## Reihenfolge & Abhängigkeiten

```
Phase 1 (alle unabhängig voneinander):
  1A → affectedLineIds             [runStore.ts]
  1B → Step-3 Diagnostics          [runStore.ts]
  1C → Toggle entfernen            [SettingsPopup.tsx + runStore.ts]
  1D → Parser-Issues durchleiten   [runStore.ts, 3 Stellen]
  1E → Log-Qualität G+H            [runStore.ts]

Phase 2 (nach Phase 1):
  2A → Manual Action Audit/Log     [runStore.ts, 6 Methoden]
  2B → Run-Log Persistenz          [4 Dateien koordiniert]
  2C → Console Cleanup             [matchingEngine.ts + runStore.ts]
```

---

## Verifikation

| # | Test | Erwartung |
|---|------|-----------|
| 1 | Run mit weniger S/N als benötigt → IssuesCenter öffnen | `serial-mismatch` Issue zeigt betroffene Zeilen |
| 2 | preFilteredSerials-Pfad → Settings > Step 3 | "Letzte Diagnose" zeigt SerialFinder-Diagnostics |
| 3 | Settings öffnen | Kein "blockStep4" Toggle sichtbar |
| 4 | openWE mit ungültigem Vorgang → IssuesCenter | Parser-Error Issue erscheint |
| 5 | S/N-Mismatch → Run-Log prüfen | WARN oder ERROR Eintrag vorhanden |
| 6 | Manuelle Aktion ausführen (z.B. Preis setzen) | Log + AuditLog Eintrag vorhanden |
| 7 | Run auto-saven → Page Refresh → Resume | Run-Log enthält Einträge von vor dem Refresh |
| 8 | Voller Pipeline-Run Steps 1-5 | Kein Hänger, kein Crash, TypeScript kompiliert |
| 9 | `npx tsc --noEmit` | Keine TypeScript-Fehler |
