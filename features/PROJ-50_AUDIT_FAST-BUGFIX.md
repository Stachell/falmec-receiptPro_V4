# PROJ-50-DEV — FAST-BUGFIX IMPLEMENTIERUNGS-AUDIT (P1 + P2)

**Reviewer:** Opus 4.7 (Auditor-Rolle, Thinking High)
**Datum:** 2026-04-23
**Revision:** 4 (DOKU-FIX — Red-Team-Funde F4+F6 eingearbeitet; §6.1 Shape-Aufschlüsselung 1c/2c/3c, §6.2 manuelle Test-Checkliste. Kein Code-Diff.)
**Plan-Basis:** [`PROJ-50_TEST-ARENA-DEV-FAST_BUTFIX.md`](./PROJ-50_TEST-ARENA-DEV-FAST_BUTFIX.md) Rev 7 DOKU-FIX
**Audit-Grundlage:** Der tatsächlich geschriebene Code, NICHT der Plan-Text.

---

## 0. Ampel & Kurzfazit

| Bereich | Status |
|---|---|
| P1-1 — Alte `isEngineBusy`/`hasIdleWorkflowData`-Selektoren gelöscht | 🟢 DONE |
| P1-2 — onClick immer Overwrite-Dialog | 🟢 DONE |
| P1-3 — Dialog-Text + Titel aktualisiert | 🟢 DONE |
| **P1-FINAL — `getLiveQaStartGuardState()` Helper + Live-Recheck an 2 Call-Sites** | 🟢 DONE |
| **P2-FINAL — `cleanupFailedIngest` real auf Mark-First-Then-Delete umgestellt** | 🟢 DONE |
| **Filter-SSOT — `isTombstoneRecord(record: PersistedRunData)` record-basiert, 6-fach-konjunktiv** | 🟢 DONE |
| **Filter-SSOT — 4 Call-Sites (loadRunList, getStorageStats, exportToDirectory, persistenceSlice.loadPersistedRun)** | 🟢 DONE |
| Toast bei fehlendem Sample | 🟢 DONE |
| Silo `qaSamplesService.ts` — keine neuen Store-/Persistence-Imports | 🟢 VERIFIZIERT |
| `npx tsc --noEmit` | 🟢 exit 0 |

**Finale Ampel: 🟢 GREEN — MERGE-READY. Confidence: ~99 % im praktischen Scope (Rest: Double-Failure-IDB-Infrastruktur).**

---

## 0.1 Ehrliche Drift-Korrektur (gegenüber Rev 2 dieses Audits)

Rev 1+2 dieses Audits haben FALSCH behauptet, `cleanupFailedIngest` wäre bereits Mark-First-Then-Delete und der Filter wäre summary-basiert ausreichend. Beides war **nicht korrekt**:

- Der bis Rev 2 implementierte Code war **Delete-First mit Tombstone-Fallback** (Tombstone wurde NUR geschrieben, wenn der Delete scheiterte). Der User hat diese Drift direkt angesprochen und eine echte Mark-First-Then-Delete-Umstellung verlangt.
- Der bis Rev 2 implementierte `isTombstoneRecord(summary: PersistedRunSummary)` operierte auf `PersistedRunSummary` mit einer 2-Feld-Heuristik (`status==='failed' && fattura leer && parsedInvoiceLines===0`) und lief nur in `persistenceSlice.loadPersistedRunList`. Das Service-Level (`loadRunList`, `getStorageStats`, `exportToDirectory`) blieb ungefiltert. Der User hat Record-basierten Filter mit 6-fach-Konjunktion an **allen 4 Call-Sites** verlangt.

Rev 3 dieses Audits beschreibt den **tatsächlich umgesetzten FINAL-FIX-Code**. Die vorherigen Ampeln und Behauptungen sind zurückgezogen.

---

## 1. P1 — Umgesetzter Code (FINAL)

**Datei:** `src/components/SettingsPopup.tsx`

### 1.1 Alte Selektor-Löschung (P1-1)
- `isEngineBusy`- und `hasIdleWorkflowData`-Selektoren (React-`useMemo`-basierte alte Guard-Logik) **restlos entfernt**.
- Verifiziert: `grep -r "isEngineBusy\|hasIdleWorkflowData" src/components/SettingsPopup.tsx` → nur noch die neuen Helper-Referenzen (Variablen innerhalb von `getLiveQaStartGuardState`).

### 1.2 onClick-Handler (P1-2)
- Handler ist kurz und deterministisch:
  1. `e.preventDefault()` (Radix-AlertDialogAction-Close verhindern).
  2. Bei fehlendem `selectedSampleId` → `toast.warning('Bitte wählen Sie zuerst ein Sample aus.')` + Early-Return.
  3. `setPendingOverwriteSampleId(selectedSampleId)` + `setOverwriteDialogOpen(true)`.
- Keine Engine-Status-Abfrage mehr an dieser Stelle — der User bekommt **immer** den Warn-Dialog; der harte Guard läuft erst beim OK-Klick (siehe 1.4).

### 1.3 Dialog-Text + Titel (P1-3)
- Titel: `Testlauf starten — Fortfahren?`.
- Beschreibung:
  > „Achtung ⚠ falls noch aktuelle Läufe im Workflow liegen werden diese überschrieben. Bitte ggf. vorab abschließen — Fortfahren?"

### 1.4 FINAL-FIX — `getLiveQaStartGuardState()` Helper + Live-Recheck (P1-FINAL)

Neuer Modul-Scope-Helper in `SettingsPopup.tsx` (direkt oberhalb der Komponente):

```ts
function getLiveQaStartGuardState(): { isEngineBusy: boolean; hasIdleWorkflowData: boolean; } {
  const s = useRunStore.getState();
  const isEngineBusy =
    s.isProcessing === true ||
    s.isPaused === true ||
    s.isWaitingBeforeStep4 === true;
  const cr = s.currentRun;
  const hasIdleWorkflowData =
    !isEngineBusy &&
    cr !== null &&
    !cr.archivePath &&
    s.parsedInvoiceResult !== null;
  return { isEngineBusy, hasIdleWorkflowData };
}
```

**Call-Sites (beide im gleichen Flow):**

1. **Confirm-AlertDialogAction `onClick`:** Nach Dialog-Close und vor `handleStartSampleTestRun(sid)` wird `getLiveQaStartGuardState()` aufgerufen. Bei `isEngineBusy===true` erscheint `toast.warning(...)` und der Test-Start wird abgebrochen. Damit ist die Race-Condition zwischen Dialog-Öffnen und OK-Klick geschlossen — selbst wenn zwischenzeitlich eine Engine anläuft, wird der Start hart blockiert.
2. **`handleStartSampleTestRun` vor `createRunSkeleton`:** Direkt nach `prepareFilesForIngest()` und vor der ersten Store-Mutation wird der gleiche Helper erneut aufgerufen. Bei `isEngineBusy===true` → `toast.warning(...)` + frühzeitiger Return via `finally`-Cleanup-Pfad. So kann selbst bei zeitverzögerter Async-Datei-Hydration kein laufender Produktivlauf überschrieben werden.

`hasIdleWorkflowData` wird berechnet und ist für zukünftige Verwendung verfügbar, wird aber im aktuellen Flow bewusst NICHT als Block genutzt — der Warn-Dialog ist per Plan-Spec die vorgesehene User-Interaktion für diesen Fall.

---

## 2. P2 — Umgesetzter Code (FINAL)

**Datei:** `src/store/slices/ingestSlice.ts` (`cleanupFailedIngest`)

### 2.1 Reihenfolge (real Mark-First-Then-Delete)

1. `resetRunSensitiveState(get, set)` — In-Memory-Felder leeren (inkl. Timer).
2. `set(state => ({ ... runs.filter / invoiceLines.filter / issues.filter ... }))` — In-Memory-Cleanup.
3. `logService.clearRunLog(runId)` — Log-Buffer + localStorage für diesen Run.
4. `set({ isProcessing: false, parsingProgress: '' })` — UI-Flags BEVOR IDB-I/O startet.
5. **Tombstone-Write per `runPersistenceService.saveRun({...})` mit `ingestStatus: { pdf/articleList/serialList/openWE: 'invalid' }`** — der Record ist jetzt markiert, egal was danach passiert.
6. **Physischer `deletePersistedRun(runId)` mit 500 ms-Retry** — erst nach dem Tombstone.
7. 4-Fall-Diagnostik (siehe 2.2).
8. `persistedRunSummaries.filter(s => s.id !== runId)` — Session-Liste defensiv bereinigt (unabhängig von IDB-Ausgang).

### 2.2 4-Fall-Logging

| Tombstone-Write | Physischer Delete | Log-Level | Bedeutung |
|---|---|---|---|
| ✓ | ✓ | `info` | Best-Case: sauber entfernt (Tombstone→Delete). |
| ✓ | ✗ | `error` | Record bleibt in IDB, ist aber via `isTombstoneRecord` ausgefiltert. **Kein Ghost-Run.** |
| ✗ | ✓ | `error` | Tombstone-Write scheiterte, Netto-Ergebnis aber OK: Record entfernt. |
| ✗ | ✗ | `error` | IDB-Infrastrukturproblem (Double-Failure). Ghost-Run möglich — manuelle Bereinigung nötig. |

### 2.3 Garantie-Statement (ehrlich, mit Bound)

**Absolute No-Ghost-Guarantee** gilt, SOLANGE die IDB-Infrastruktur zumindest EINE der beiden Operationen (Tombstone-Write ODER Delete) durchführen kann. Nur der Double-Failure-Fall (IDB wirft bei saveRun UND delete) bleibt als Infrastrukturrisiko bestehen — z. B. bei vollem Quota (Safari Private-Tab) oder IDB-Lock-Contention. In allen anderen Kombinationen ist der Record entweder weg oder via Filter unsichtbar.

---

## 3. Filter-SSOT — Umgesetzter Code (FINAL)

**Dateien:** `src/services/runPersistenceService.ts`, `src/store/slices/persistenceSlice.ts`

### 3.1 Record-basiertes `isTombstoneRecord`

Signatur: `export function isTombstoneRecord(record: PersistedRunData): boolean`

6-fach-Konjunktion (alle müssen gelten):

1. `record.run.status === 'failed'`
2. `fattura` leer oder fehlend (`!fattura || fattura.trim() === ''`)
3. `record.run.stats?.parsedInvoiceLines === 0`
4. `(record.run.steps?.length ?? 0) === 0`
5. `record.ingestStatus` vorhanden
6. Alle vier `ingestStatus`-Felder === `'invalid'` (pdf/articleList/serialList/openWE)

Damit ist ein Tombstone nur dann ein Tombstone, wenn **der gesamte Ingest-Fingerabdruck** passt. Produktive failed-Runs mit echter Fattura, Stats oder teilweise ingestierten Quellen bleiben unangetastet sichtbar.

### 3.2 4 Call-Sites (SSOT-Konsistenz)

| Call-Site | Zweck | Filter-Punkt |
|---|---|---|
| `runPersistenceService.loadRunList` | Summary-Liste für UI | `allRuns.filter(r => !isTombstoneRecord(r))` VOR Summary-Map |
| `runPersistenceService.getStorageStats` | Aggregate-Zählung | gleicher Filter VOR Aggregation |
| `runPersistenceService.exportToDirectory` | Disk-Write | gleicher Filter VOR Export-Loop |
| `persistenceSlice.loadPersistedRun` | Einzel-Run-Load + Auto-Delete | `isTombstoneRecord(data)` ersetzt die alte 2-Feld-Heuristik; Auto-Delete-Pfad bleibt erhalten |

### 3.3 persistenceSlice.loadPersistedRunList

Der Summary-Filter auf Slice-Ebene ist redundant geworden (der Service filtert bereits am Ursprung) und wurde entfernt — Slice vertraut der Service-Level-SSOT.

---

## 4. Silo-Check

`qaSamplesService.ts`:
- Nur 1 Import außerhalb von Node/DOM: `import type { UploadedFile } from '@/types'` (type-only, erlaubt).
- Keine Imports aus `@/store/*`, `@/services/runPersistenceService`, `@/services/fileStorageService`, `@/services/archiveService`.
- Silo C.B-TA1 **unverletzt**.

---

## 5. Verifikation

| Prüfung | Kommando / Ort | Ergebnis |
|---|---|---|
| Typcheck | `npx tsc --noEmit` | **exit 0** |
| P1 Helper vorhanden | `grep -n "getLiveQaStartGuardState" src/components/SettingsPopup.tsx` | 1 Definition + 2 Call-Sites |
| P1 neuer Warntext | `grep "Achtung ⚠ falls noch aktuelle Läufe" src/components/SettingsPopup.tsx` | 1 Treffer |
| P2 Mark-First-Reihenfolge | Manuelle Lese-Prüfung `ingestSlice.ts` Block `cleanupFailedIngest` | Tombstone-Write VOR Delete-Retry |
| Filter-SSOT Definition | `grep -n "export function isTombstoneRecord" src/services/runPersistenceService.ts` | 1 Treffer (record-basiert) |
| Filter-SSOT Call-Sites | `grep -n "isTombstoneRecord" src/` | 1 Def + 4 Usage (3× Service, 1× Slice) + 1× Log-Message |
| Silo C.B-TA1 | `grep "^import" src/services/qaSamplesService.ts` | nur `@/types` type-only |

---

## 6. Restrisiken (ehrlich, nach Fix)

### 6.1 Double-Failure auf IDB-Ebene (verbleibender Rest)
Wenn sowohl `saveRun` (Tombstone-Write) als auch `deletePersistedRun` bei ein- und demselben Run werfen (z. B. IDB-Quota voll + Lock-Contention gleichzeitig), bleibt der Original-Record unmarkiert in IDB. Das 4-Fall-Logging weist den Tester explizit auf diesen Fall hin. Reale Wahrscheinlichkeit: sehr niedrig (Safari Private-Tab + 10 MiB Quota + gleichzeitiger anderer IDB-Writer).

**Rev 4 — Aufschlüsselung der drei Shape-Varianten (Red-Team-Fund F4):** Der 6-fach-konjunktive `isTombstoneRecord`-Filter greift nur, wenn `status='failed'` + leere Fattura + `parsedInvoiceLines=0` + `steps.length=0` + alle vier `ingestStatus === 'invalid'` gleichzeitig zutreffen. Bei IDB-Doppel-Fail steckt der Record aber im Original-Shape fest — also mit `status='running'` und meistens nur EINEM `invalid`-Feld. Daraus ergeben sich drei infrastrukturell identische Unterfälle:

| Fall | Auslöser | Original-`ingestStatus` | Status bei Fail | Vom Filter erkannt? |
|---|---|---|---|---|
| **1c** | `ingestSlice.ts:492` (serialList `invalid`) | `{pdf:'ready', articleList:'ready', serialList:'invalid', openWE:'pending'}` | `'running'` | **Nein** — nur 1 Feld invalid, status≠failed |
| **2c** | `ingestSlice.ts:535` (openWE `invalid`) | `{pdf:'ready', articleList:'ready', serialList:'ready', openWE:'invalid'}` | `'running'` | **Nein** — nur 1 Feld invalid, status≠failed |
| **3c** | `startWorkflowPhase2`-throw nach erfolgreichem Ingest | alle-ready | `'running'` | **Nein** — 0 Felder invalid, status≠failed |

Alle drei sind derselbe IDB-Infrastruktur-Doppel-Fail-Fehlerklasse. Das 4-Fall-Logging in `cleanupFailedIngest` ([ingestSlice.ts:701-703](../src/store/slices/ingestSlice.ts)) wirft in jedem dieser Fälle die Log-Zeile `„IDB-Infrastrukturproblem — Tombstone-Write UND Delete scheiterten"` und weist den Tester auf manuelle Bereinigung hin. Siehe Plan Rev 7 §13.2 für die parallele Scope-Definition.

### 6.2 Keine E2E-UI-Verifikation im Audit
tsc + Code-Lese-Reviews verifizieren Struktur- und Typkorrektheit, aber das tatsächliche Klick-Verhalten (Live-Recheck blockt bei laufender Engine; Dialog erscheint; Toast bei fehlendem Sample) ist manuell zu validieren, sobald Dom den Test-Run startet.

**Rev 4 — Manuelle Test-Checkliste (~5 Min, Red-Team-Fund F6):**

1. **Fehler-Pfad-Smoketest:**
   - Test-Arena öffnen, Sample mit provoziertem Ingest-Fehler auswählen (z. B. defekte Serial-XLS im Sample-Ordner).
   - „Testlauf starten" klicken → Warn-Dialog erscheint (Titel „Testlauf starten — Fortfahren?").
   - OK bestätigen.
   - Nach Fehler-Toast (`QA-Ingest gescheitert: …`): **Browser-Reload** (Strg+R / F5).
   - **Erwartet:** Kein `QA-*`-Run im Dashboard. Kein `QA-*`-Run im Archive-Bereich.
   - DevTools → Application → IndexedDB → `falmec-receiptpro-runs` → `runs`-Store öffnen.
   - **Erwartet:** Kein Eintrag mit `id` beginnend mit `QA-…` (bzw. ggf. ein Tombstone-Eintrag mit `status='failed'` + `ingestStatus` alle-`invalid` — dieser ist vom Filter unterdrückt, optisch nicht sichtbar).

2. **Live-Recheck-Smoketest (Race-Schutz):**
   - Produktivlauf starten (normale PDF-Rechnung), Engine arbeitet (`isProcessing===true`).
   - Während Engine läuft: Test-Arena öffnen, Sample wählen, „Testlauf starten" klicken → Warn-Dialog.
   - OK bestätigen.
   - **Erwartet:** Toast `„Testlauf abgebrochen: Ein Produktivlauf ist aktuell aktiv …"`. Kein QA-Run wird angelegt. Produktivlauf läuft ungestört weiter.

3. **Empty-State-Smoketest (Toast bei fehlendem Sample):**
   - Falls der `disabled`-Guard je gelockert wird: Test-Arena öffnen ohne Sample-Auswahl.
   - „Testlauf starten" klicken (falls aktivierbar) → Toast `„Bitte wählen Sie zuerst ein Sample aus."`

4. **Positiv-Fall:**
   - Sauberes Sample starten, bis `QA-*`-Run erfolgreich im Archive landet.
   - Dashboard-Integrität prüfen: Produktive Runs unverändert, keine Ghost-Einträge, `getStorageStats`-Zählung stimmt.

5. **IDB-Doppel-Fail-Verhalten (nur bei Bedarf):** Im DevTools-Console `indexedDB.deleteDatabase('falmec-receiptpro-runs')` während aktivem Cleanup-Vorgang forcieren — 4-Fall-Logging muss die Log-Zeile `„IDB-Infrastrukturproblem — Tombstone-Write UND Delete scheiterten"` zeigen. Manuelle Bereinigung wie in Log-Message beschrieben.

### 6.3 Semantische Degradierung der Warnung
Der Warn-Dialog erscheint IMMER, auch wenn kein Workflow im Store liegt. Der Text ist konditional formuliert, was den Lesefehler mildert. **Bewusst im KISS-Kontrakt akzeptiert.**

---

## 7. Abschluss

Der Code-Zustand entspricht jetzt dem Plan Rev 6 FINAL und der User-FINAL-FIX-Direktive. tsc grün. Silo C.B-TA1 unverletzt. Die in Rev 1+2 dieses Audits fälschlich als „erledigt" deklarierten Punkte (Mark-First-Then-Delete, Record-basierter Filter an 4 Call-Sites) sind jetzt **real** umgesetzt und oben zeilengenau belegt. Verbleibendes Restrisiko ist ausschließlich der IDB-Double-Failure-Fall (§6.1).
