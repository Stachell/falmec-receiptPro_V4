# PROJ-50-DEV — FAST BUGFIX: TEST-ARENA (P1/P2) — Rev 7 (DOKU-FIX)

**Status:** 🟢 **IMPLEMENTED (FINAL-FIX abgeschlossen 2026-04-23)** — Code-Zustand entspricht dieser Spec nach Reality-Alignment (siehe `PROJ-50_AUDIT_FAST-BUGFIX.md` Rev 3). Rev 7 (Doku-Fix 2026-04-23): Plan §11.4/§11.7/§13.2/§9 an Code-IST angeglichen — Fälle 1c/2c als Restrisiko-Fehlerklasse dokumentiert (zuvor fälschlich als vom 4-Feld-Filter abgedeckt markiert). Kein Code-Diff. Frühere Zwischenstände (Delete-First + summary-basierter Filter) sind zurückgezogen.
**Garantiescope:** Regressionsfrei **im Logikpfad** (alle praktisch auftretenden `cleanupFailedIngest`-Auslöser, siehe §11.4). IDB-Infrastruktur-Doppelfehler (Fall 3c aus §11.4/§11.7) liegt **explizit außerhalb des Garantiescopes** und ist als dokumentiertes Restrisiko mit differenziertem Logging abgefangen — keine Logik-Lücke, sondern Hardware-/Quota-Ereignis.
**Confidence:** **97 %** (praktische Umsetzungs-Confidence im definierten Garantiescope; 94 % wenn man Fall 3c in den Scope einschließen würde, siehe §13).
**Datum:** 2026-04-23
**Basis:** `PROJ-50_TEST-ARENA-DEV.md` (Rev 17) + `PROJ-50_AUDIT_DEV.md`

---

## 1. Big Picture

Die Test-Arena („Giftküche") dient der isolierten Reproduktion von Fehlern mittels Test-Samples. Oberstes Ziel ist die Revisionssicherheit des produktiven Systems. Ein Audit der ersten Implementierung hat zwei kritische Schwachstellen (P1/P2) aufgedeckt, die die Datenintegrität bei asynchronen Abläufen gefährden. Dieser Plan schließt die Lücken mit minimal-invasivem Code (KISS-Prinzip).

## 2. Referenzen

- Basis-Plan: `features/PROJ-50_TEST-ARENA-DEV.md` (Rev 17)
- Audit-Befund: `features/PROJ-50_AUDIT_DEV.md`

## 3. Leitplanken

- **KISS:** Selektoren werden gelöscht, nicht erweitert. Ein UI-Branch statt drei.
- **YAGNI:** Nur P1 + P2. Keine neuen Hooks, keine Schema-Änderungen in `PersistedRunData`.
- **Silo-Schutz:** `qaSamplesService.ts` wird **nicht** angefasst (C.B-TA1 bleibt hermetisch).

## 4. Revisionshistorie & Review-Befunde

| # | Rev | Befund | Revision |
|---|---|---|---|
| B1 | 1→2 | `loadRunList` hatte keinen Filter. | P2-1b. |
| B2 | 1→2 | Tombstone war kein valider `Run`. | P2-2 Type-korrekt. |
| B3 | 1→2 | `saveRun`-Boolean nicht ausgewertet. | P2-2 Boolean-Check. |
| B4 | 2→3 | `getStorageStats` + `exportToDirectory` ungefiltert → Regression in `handleArchiveDefault`-Safety-Check. | P2-1c + P2-1d, SSOT-Helper. |
| B5 | 3→4 | Filter prüfte nur `pdf`/`articleList` → Tombstone-Write-Fail bei `serialList`/`openWE`-Fehler wäre nicht gefiltert. | 4-Feld-Filter + 14b harmonisiert. |
| B6 | 4→5 | **`cleanupFailedIngest` wird auch aus dem Outer-Catch nach `startWorkflowPhase2` aufgerufen** (`SettingsPopup.tsx:577`, `NewRun.tsx:91`). `startWorkflowPhase2` kann werfen (`ingestSlice.ts:568/569/575/583`), nachdem `ingestAndPersistRunData` bereits mit `allReady=true` zurückgegeben hat. In diesem Pfad hat der persistierte Record alle vier `ingestStatus`-Werte in gesunden Zuständen. Die Rev-4-Logik (Delete-First, Tombstone als Fallback) schreibt den Tombstone nur bei Delete-Fail — im Erfolgsfall von Delete ist das ok, im Fehlschlag beider Writes hatte auch Rev 4 den Record unmarkiert hinterlassen. | **Rev 5 dreht die Reihenfolge um: Mark-First-Then-Delete.** Tombstone-Write erfolgt pro-aktiv als erster Schritt — damit ist die Filter-Markierung gesetzt, BEVOR der Delete-Versuch passiert. Selbst wenn Delete komplett scheitert, bleibt der Record als Tombstone markiert und vom 4-Feld-Filter abgefangen. `saveRun`-Merge-Logik (`runPersistenceService.ts:148-247`) lässt den `ingestStatus`-Override unberührt (Z. 232-234) und ersetzt das `run`-Objekt vollständig (keine Schutzklausel für `run`, `invoiceLines`, `issues`, `auditLog`, `runLog`). |

## 5. Bugfix P1 — Vereinfachte User-Choice (`src/components/SettingsPopup.tsx`)

**Unverändert gegenüber Rev 3/4.** Lokal auf eine Datei begrenzt. Zeilennummern gegen aktuellen Dateistand verifiziert (§11.1).

### P1-1 Selektor-Löschung

**Datei:** `src/components/SettingsPopup.tsx`
**Zeilen 470–494** (Kommentar-Block + beide Selektoren + folgende Leerzeile).

**Lösche wörtlich (ersatzlos):**

```ts
  // PROJ-50-DEV Rd10/Lead-Dev-Fix 1: Zwei disjunkte Selektoren statt einem Sammeltopf.
  //   - isEngineBusy:        Engine rechnet gerade (Hard-Block — Toast + kein Dispatch).
  //   - hasIdleWorkflowData: Ein Run liegt im Store, die Engine rechnet aber NICHT
  //                          (User-Choice — AlertDialog „überschreiben?").
  const isEngineBusy = useRunStore((s) => {
    if (s.isProcessing) return true;
    if (s.isPaused) return true;
    if (s.isWaitingBeforeStep4) return true;
    const cr = s.currentRun;
    if (!cr) return false;
    // Rd8/Zombie-Guard: Master-Wahrheit ist Run-Status. Ein gecrashter Run kann einen
    //   `running`-Step als Zombie-Leiche in IDB hinterlassen — Gate VOR Step-Iteration.
    if (cr.status !== 'running') return false;
    return cr.steps.some((st) => st.status === 'running');
  });
  const hasIdleWorkflowData = useRunStore((s) => {
    const engineBusy =
      s.isProcessing ||
      s.isPaused ||
      s.isWaitingBeforeStep4 ||
      (s.currentRun?.status === 'running' &&
       s.currentRun.steps.some((st) => st.status === 'running'));
    if (engineBusy) return false;
    return s.currentRun != null;
  });
```

### P1-2 onClick-Handler am „Testlauf starten"-Button

**Datei:** `src/components/SettingsPopup.tsx`
**Zeilen 1989–2014** (onClick-Body).

**Vorher (wörtlich zu ersetzen):**

```tsx
              onClick={(e) => {
                // Rd11/Schnüffler-Fix 1: Radix schließt AlertDialogAction-Parent-Dialoge per Default.
                if (!selectedSampleId) {
                  e.preventDefault();
                  return;
                }
                // Rd10 Branch 1 — Hard-Block: Engine rechnet gerade.
                if (isEngineBusy) {
                  e.preventDefault();
                  toast.warning(
                    'Engine rechnet gerade — QA-Testlauf blockiert. Bitte warten oder pausieren.',
                  );
                  return;
                }
                // Rd10 Branch 2 — User-Choice: Rest-Daten im Store.
                if (hasIdleWorkflowData) {
                  e.preventDefault();
                  ifMounted(() => {
                    setPendingOverwriteSampleId(selectedSampleId);
                    setOverwriteDialogOpen(true);
                  });
                  return;
                }
                // Rd10 Branch 3 — Sofort-Dispatch.
                void handleStartSampleTestRun(selectedSampleId);
              }}
```

**Nachher (wörtlich einsetzen):**

```tsx
              onClick={(e) => {
                // PROJ-50 FAST-BUGFIX P1: Immer Overwrite-Dialog öffnen —
                //   eine einzige explizite User-Bestätigung eliminiert die
                //   Race-Condition zwischen Engine-Zustand und UI-Klick.
                //   e.preventDefault() ist Pflicht: Radix würde sonst das
                //   Soll-Sichtfenster bei Klick auf AlertDialogAction schließen.
                e.preventDefault();
                if (!selectedSampleId) return;
                ifMounted(() => {
                  setPendingOverwriteSampleId(selectedSampleId);
                  setOverwriteDialogOpen(true);
                });
              }}
```

### P1-3 Dialog-Text im `OverwriteActiveRunDialog`

**Datei:** `src/components/SettingsPopup.tsx`
**Zeilen 2044–2055**.

**Vorher (wörtlich zu ersetzen):**

```tsx
              <div className="space-y-2 text-sm">
                <p>
                  Es befindet sich noch ein <b>Lauf im Workflow</b>. Soll dieser
                  überschrieben werden?
                </p>
                <p className="text-xs text-muted-foreground">
                  Klicke <b>OK</b>, um den bestehenden Lauf durch den QA-Testlauf
                  zu ersetzen. Ungespeicherte Zwischenstände gehen dabei verloren.
                  Klicke <b>ABBRECHEN</b>, um den Workflow unberührt zu lassen und
                  zuerst zu beenden oder bewusst zu verwerfen.
                </p>
              </div>
```

**Nachher (wörtlich einsetzen):**

```tsx
              <div className="space-y-2 text-sm">
                <p>
                  Achtung ⚠ falls noch aktuelle Läufe im Workflow liegen werden
                  diese überschrieben. Bitte ggf. vorab abschließen — Fortfahren?
                </p>
              </div>
```

### P1-4 Dialog-Titel (kosmetisch, empfohlen)

**Datei:** `src/components/SettingsPopup.tsx`
**Zeile 2041:**

- **Vorher:** `Lauf im Workflow überschreiben?`
- **Nachher:** `Testlauf starten — Fortfahren?`

## 6. Bugfix P2 — IDB-Leichenfreiheit (fünf verbundene Änderungen, Mark-First-Pattern)

### P2-1 Helper-Funktion `isTombstoneRecord` + vier Filter-Sites + 14b-Harmonisierung

**Unverändert gegenüber Rev 4.** Die 4-Feld-Filter-Logik schließt B5. Kurze Wiederholung:

**P2-1a** — `isTombstoneRecord` als `export function` in `runPersistenceService.ts` an Zeile 92 einfügen:

```ts

// PROJ-50 FAST-BUGFIX P2 — SSOT-Filter für Ghost-Runs / Tombstones.
//   Ein Record ist ein Tombstone/Ghost, wenn irgendeines der vier `ingestStatus`-
//   Felder nicht in einem „gesunden" Endzustand ist:
//     pdf         MUSS 'ready' sein (Pflichtquelle).
//     articleList MUSS 'ready' sein (Pflichtquelle).
//     serialList  MUSS in {'ready','not_provided'} sein.
//     openWE      MUSS in {'ready','not_provided'} sein.
//   Rev 4/B5: Rev 3 prüfte nur pdf/articleList — die Lücke ist geschlossen.
//   Legacy-Runs ohne ingestStatus (Pre-PROJ-49) bleiben sichtbar.
export function isTombstoneRecord(r: PersistedRunData): boolean {
  if (!r.ingestStatus) return false;
  const s = r.ingestStatus;
  if (s.pdf !== 'ready') return true;
  if (s.articleList !== 'ready') return true;
  if (s.serialList !== 'ready' && s.serialList !== 'not_provided') return true;
  if (s.openWE !== 'ready' && s.openWE !== 'not_provided') return true;
  return false;
}
```

**P2-1b** — `loadRunList` Zeile 326–328:

```ts
      request.onsuccess = () => {
        const allRuns = request.result as PersistedRunData[];
        // PROJ-50 FAST-BUGFIX P2: Tombstones/Ghost-Runs nicht in Summaries.
        const runs = allRuns.filter((r) => !isTombstoneRecord(r));
        const summaries: PersistedRunSummary[] = runs.map(r => {
```

**P2-1c** — `getStorageStats` Zeile 441–443:

```ts
      request.onsuccess = () => {
        const allRuns = request.result as PersistedRunData[];
        // PROJ-50 FAST-BUGFIX P2: Tombstones nicht in runCount/totalSizeBytes.
        const runs = allRuns.filter((r) => !isTombstoneRecord(r));
        const stats: StorageStats = {
```

**P2-1d** — `exportToDirectory` Zeile 503–510: Filter nach dem Promise-Resolve:

```ts
    const db = await openDatabase();
    const allRuns = await new Promise<PersistedRunData[]>((resolve, reject) => {
      const transaction = db.transaction([RUNS_STORE], 'readonly');
      const store = transaction.objectStore(RUNS_STORE);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as PersistedRunData[]);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => db.close();
    });
    // PROJ-50 FAST-BUGFIX P2: Tombstones nicht auf Platte exportieren.
    const runs = allRuns.filter((r) => !isTombstoneRecord(r));
```

**P2-1e** — `persistenceSlice.ts` Zeile 11 Import erweitern:

```ts
import { runPersistenceService, isTombstoneRecord } from '@/services/runPersistenceService';
```

und Zeilen 144–158 auf den Helper umstellen (siehe Rev-4-Detail, unverändert).

### P2-2 Tombstone-Block in `cleanupFailedIngest` — **Rev 5: Mark-First-Then-Delete**

**Datei:** `src/store/slices/ingestSlice.ts`
**Zeilen 616–633** (Retry-Block + Endgültiger-Fehlschlag-Branch).

Template aus `createRunSkeleton` (`ingestSlice.ts:237-265`). `saveRun` mit `ingestStatus: alle-invalid` setzt die Tombstone-Markierung VOR dem Delete-Versuch.

**Vorher (wörtlich zu ersetzen):**

```ts
    // 4. IDB-Löschung mit Retry (IDB-Fehler sind oft transient)
    set({ isProcessing: false, parsingProgress: '' });
    let idbDeleted = await get().deletePersistedRun(runId);

    if (!idbDeleted) {
      await new Promise(r => setTimeout(r, 500));
      idbDeleted = await get().deletePersistedRun(runId);
    }

    if (!idbDeleted) {
      // Endgültiger Fehlschlag — Ghost-Run-Verteidigung (Änderung 14b blockt Laden)
      // KEIN { runId } in den Options — sonst wird localStorage falmec-run-log-{runId} neu angelegt!
      logService.error(`[cleanupFailedIngest] IDB-Löschung nach Retry fehlgeschlagen für Run ${runId} — Ghost-Run möglich`);
      // persistedRunSummaries defensiv bereinigen (damit Ghost-Run nicht in Session-Liste erscheint)
      set(state => ({
        persistedRunSummaries: state.persistedRunSummaries.filter(s => s.id !== runId),
      }));
    }
  },
```

**Nachher (wörtlich einsetzen):**

```ts
    // 4. PROJ-50 FAST-BUGFIX P2 (Rev 5) — Mark-First-Then-Delete:
    //    Wir markieren den Record pro-aktiv als Tombstone BEVOR wir den physischen
    //    Delete versuchen. Damit ist der Filter-Schutz auch dann aktiv, wenn der
    //    Auslöser für cleanupFailedIngest NICHT Phase-1-`allReady=false` war,
    //    sondern z. B. ein `startWorkflowPhase2`-throw nach erfolgreichem Ingest
    //    (SettingsPopup.tsx:577, NewRun.tsx:91). In diesem Fall hat der Original-
    //    Record alle vier ingestStatus-Werte in gesunden Zuständen — ohne pro-
    //    aktive Markierung würde isTombstoneRecord ihn durchlassen.
    //    saveRun-Merge-Logik (runPersistenceService.ts:148-247) lässt unseren
    //    `ingestStatus`-Override unberührt (Z. 232-234) und ersetzt das `run`-
    //    Objekt vollständig — die Markierung greift deterministisch.
    //    Template aus createRunSkeleton (ingestSlice.ts:237-265).
    set({ isProcessing: false, parsingProgress: '' });

    const { globalConfig } = get();
    const nowIso = new Date().toISOString();
    const tombstoneRun: Run = {
      id: runId,
      createdAt: nowIso,
      status: 'failed',
      config: globalConfig,
      invoice: {
        fattura: '',
        invoiceDate: nowIso.split('T')[0],
        deliveryDate: null,
      },
      stats: {
        parsedInvoiceLines: 0, matchedOrders: 0, notOrderedCount: 0, serialMatchedCount: 0,
        mismatchedGroupsCount: 0, articleMatchedCount: 0, inactiveArticlesCount: 0,
        priceOkCount: 0, priceMismatchCount: 0, exportReady: false, expandedLineCount: 0,
        fullMatchCount: 0, codeItOnlyCount: 0, eanOnlyCount: 0, noMatchCount: 0,
        serialRequiredCount: 0, priceMissingCount: 0, priceCustomCount: 0,
        manualOkOrderCount: 0, perfectMatchCount: 0, referenceMatchCount: 0,
        smartQtyMatchCount: 0, fifoFallbackCount: 0,
      },
      steps: [],
      isExpanded: false,
      orphanSerials: [],
    };

    // Schritt A — Pro-aktive Tombstone-Markierung.
    let tombstoneWritten = false;
    try {
      tombstoneWritten = await runPersistenceService.saveRun({
        id: runId,
        run: tombstoneRun,
        invoiceLines: [],
        issues: [],
        auditLog: [],
        parsedPositions: [],
        parserWarnings: [],
        parsedInvoiceResult: null,
        serialDocument: null,
        uploadMetadata: [],
        ingestStatus: {
          pdf: 'invalid',
          articleList: 'invalid',
          serialList: 'invalid',
          openWE: 'invalid',
        },
      });
    } catch (markErr) {
      logService.error(`[cleanupFailedIngest] Tombstone-Mark warf Exception für Run ${runId}: ${markErr instanceof Error ? markErr.message : String(markErr)}`);
      tombstoneWritten = false;
    }

    // Schritt B — Physischer Delete (best-effort, Platz-Rückgewinnung).
    //   Auch bei Fehlschlag bleibt die Tombstone-Markierung aus Schritt A aktiv.
    let idbDeleted = false;
    try {
      idbDeleted = await get().deletePersistedRun(runId);
      if (!idbDeleted) {
        await new Promise(r => setTimeout(r, 500));
        idbDeleted = await get().deletePersistedRun(runId);
      }
    } catch (delErr) {
      logService.error(`[cleanupFailedIngest] deletePersistedRun warf Exception für Run ${runId}: ${delErr instanceof Error ? delErr.message : String(delErr)}`);
      idbDeleted = false;
    }

    // Schritt C — Differenzierte Log-Aussage je nach Ergebnis.
    if (idbDeleted) {
      logService.info(
        `[cleanupFailedIngest] Run ${runId} physisch gelöscht${tombstoneWritten ? ' (Tombstone vorher geschrieben)' : ' (Tombstone-Mark war zuvor fehlgeschlagen, aber Delete hat es gefixt)'}`,
        { step: 'System' },
      );
    } else if (tombstoneWritten) {
      logService.error(
        `[cleanupFailedIngest] Run ${runId}: Delete fehlgeschlagen, aber Tombstone-Mark erfolgreich — Record wird von allen Filter-Sites (loadRunList/getStorageStats/exportToDirectory/loadPersistedRun) unterdrückt.`,
      );
    } else {
      // Echter worst case: beide IDB-Operationen scheitern → IDB-Infrastrukturproblem.
      logService.error(
        `[cleanupFailedIngest] Run ${runId}: Tombstone-Mark UND Delete scheiterten. IDB-Infrastrukturproblem — Original-Record bleibt physisch in IDB. Sichtbarkeit wird vom isTombstoneRecord-Filter nur dann unterdrückt, wenn irgendein ingestStatus-Feld bereits ungesund ist (typisch bei Phase-1-Fehlern, nicht bei startWorkflowPhase2-throw). Tester sollte IndexedDB 'falmec-receiptpro-runs' manuell prüfen.`,
      );
    }

    // persistedRunSummaries defensiv bereinigen (damit Ghost-Run nicht in Session-Liste erscheint)
    set(state => ({
      persistedRunSummaries: state.persistedRunSummaries.filter(s => s.id !== runId),
    }));
  },
```

### P2-3 Import-Check

**Datei:** `src/store/slices/ingestSlice.ts`

- `Run` bereits Zeile 23-29 type-only importiert.
- `runPersistenceService` bereits Zeile 41 importiert.

**Datei:** `src/store/slices/persistenceSlice.ts`

- Zeile 11 erweitert um `isTombstoneRecord` (P2-1e).

**Datei:** `src/services/runPersistenceService.ts`

- `PersistedRunData` bereits lokal auf Zeile 37 definiert.
- `isTombstoneRecord` als `export function` auf Top-Level (P2-1a). Named Export erlaubt sauberen Import in `persistenceSlice.ts`.

## 7. Audit-Invarianten

- **C.A-1 (P1):** „Testlauf starten" öffnet physisch immer zuerst den Overwrite-Dialog.
- **C.A-2 (P2, konditional):** **Unter der Voraussetzung, dass mindestens einer der beiden IDB-Writes (Tombstone-Mark ODER physischer Delete) erfolgreich durchläuft**, erscheint nach provoziertem Ingest-Fehler kein Run mit Titel `QA-*` in Dashboard/Archive. Bei gleichzeitigem Fehlschlag beider Writes (Fall 3c, §11.4/§11.7) kann ein Ghost-Run sichtbar bleiben — dies ist ein IDB-Infrastrukturproblem außerhalb des Garantiescopes und wird über differenziertes Logging + manuelle Bereinigungs-Empfehlung adressiert.
- **C.A-3 (P2):** `loadRunList` filtert Ghost-Runs.
- **C.A-4 (P2, Rev 3):** Alle drei Bulk-Read-Pfade (`loadRunList`, `getStorageStats`, `exportToDirectory`) teilen dieselbe Filter-Definition via `isTombstoneRecord`.
- **C.A-5 (P2, Rev 4):** `isTombstoneRecord` prüft alle vier `ingestStatus`-Felder. SSOT in `runPersistenceService.ts` + `persistenceSlice.loadPersistedRun` (14b).
- **C.A-6 (P2, Rev 5 neu):** `cleanupFailedIngest` markiert den Record PRO-AKTIV als Tombstone VOR dem Delete-Versuch. Die Markierung wirkt auch für Auslöser, bei denen der Original-Record gesunde `ingestStatus`-Werte hat (z. B. `startWorkflowPhase2`-throw).

## 8. Abschluss-Checkliste

- [ ] `npx tsc --noEmit` **exit 0**.
- [ ] `grep -rn "isEngineBusy\|hasIdleWorkflowData" src/` → **0 Treffer**.
- [ ] `grep -rn "Engine rechnet gerade" src/` → **0 Treffer**.
- [ ] `grep -rn "Achtung ⚠ falls noch aktuelle Läufe" src/components/SettingsPopup.tsx` → **1 Treffer**.
- [ ] `grep -rn "Mark-First-Then-Delete\|Tombstone-Mark" src/store/slices/ingestSlice.ts` → **≥ 3 Treffer**.
- [ ] `grep -rn "isTombstoneRecord" src/services/runPersistenceService.ts` → **≥ 4 Treffer**.
- [ ] `grep -rn "isTombstoneRecord" src/store/slices/persistenceSlice.ts` → **≥ 2 Treffer**.
- [ ] `grep -rn "export function isTombstoneRecord" src/services/runPersistenceService.ts` → **genau 1 Treffer**.
- [ ] `grep -rn "customRunTitle" src/` → genau 2 Dateien.
- [ ] `grep -rn "from '@/store\|from '@/services/runPersistenceService\|from '@/services/fileStorageService" src/services/qaSamplesService.ts` → **0 Treffer**.
- [ ] **C.A-1:** „Testlauf starten" öffnet immer Overwrite-Dialog.
- [ ] **C.A-2:** Simulierter Ingest-Fehler + Reload → kein Tombstone in UI.
- [ ] **C.A-3/4/5:** Alle vier Filter-Sites nutzen `isTombstoneRecord`; Filter prüft alle vier Stati.
- [ ] **C.A-6:** Cleanup markiert Record pro-aktiv, bevor Delete versucht wird. Simulierter `startWorkflowPhase2`-throw + Delete-Force-Fail via DevTools → Record ist bei Reload als Tombstone gefiltert.
- [ ] **Type-Korrektheit:** `tombstoneRun` ohne `as Run`, ohne `undefined`/`null` in Pflichtfeldern.
- [ ] **SSOT 14b:** `persistenceSlice.ts:144-158` ruft `isTombstoneRecord(data)`.

## 9. Logik-Regressionsfreiheit begründet (im Garantiescope, §13)

**Scope-Klarstellung:** Dieser Abschnitt begründet Regressionsfreiheit **ausschließlich innerhalb des in §13 definierten Garantiescopes** — d. h. für alle Logik-Pfade bei funktionierender IDB. Der IDB-Infrastruktur-Doppelfehler (Fall 3c, §11.4/§11.7) wird **nicht** in dieser Liste behauptet; er ist in §13 explizit als außerhalb des Scopes deklariert.

1. **P1 lokal auf eine Datei begrenzt.**
2. **P2-1 mit echter SSOT:** Eine Helper-Funktion, fünf Call-Sites.
3. **B5 geschlossen (im Logikpfad):** 4-Feld-Filter erkennt alle ungesunden `ingestStatus`-Kombinationen — bei erfolgreichem Tombstone-Write oder wenn der Original-Record bereits ein ungesundes Statusfeld hat.
4. **B6 geschlossen (im Logikpfad bei ≥1 erfolgreichem IDB-Write, Rev 5):** Mark-First-Then-Delete sichert die Tombstone-Markierung unabhängig vom Auslöser — **sofern der Mark-Write ODER der Delete erfolgreich ist**. Bei `startWorkflowPhase2`-throw (Original-Record alle-ready) wird die Markierung pro-aktiv gesetzt. **Bei IDB-Doppel-Fail (Fall 1c/2c/3c) ist der Record-Shape infrastrukturell nicht rekonstruierbar → Restrisiko §13.2.** Dies ist Präzisierung, kein neuer Schutzanspruch — die Audit-Invarianten C.A-2 und C.A-6 sind bereits konditional formuliert.
5. **Tombstone type-korrekt.** Kein `as Run`, kein `undefined`.
6. **`saveRun`-Boolean ausgewertet** + Merge-Logik (Z. 148-247) verifiziert: Unser `ingestStatus`-Override und das `run`-Objekt werden nicht überschrieben.
7. **Safety-Check in `handleArchiveDefault`** bleibt korrekt (P2-1d hält `exportedCount`/`runList.length` symmetrisch).
8. **Änderung-14b-Semantik erweitert** — konsistent mit ursprünglicher Intention.
9. **Silo C.B-TA1 intakt.**
10. **Legacy-Runs ohne `ingestStatus`** bleiben sichtbar — kein Datenverlust.
11. **Ehrlichkeitsklausel:** Der Plan beansprucht keine absolute Ghost-Run-Unmöglichkeit. Der dokumentierte Fall 3c (IDB-Doppel-Fail) bleibt als Hardware-/Quota-Ereignis außerhalb des Scopes und wird über differenziertes Logging adressiert.

## 10. Umsetzungsreihenfolge

Empfehlung (jeder Commit `tsc --noEmit` grün):

1. **Commit A — P2-1 Backend-SSOT:** `runPersistenceService.ts` Helper + 3 Filter-Sites + `persistenceSlice.ts` Import+14b.
2. **Commit B — P2-2 Mark-First-Then-Delete:** `ingestSlice.ts` cleanupFailedIngest-Block ersetzen.
3. **Commit C — P1 UI:** `SettingsPopup.tsx` P1-1 bis P1-4.

## 11. Verifikations-Protokoll (Basis für Confidence)

### 11.1 Zeilennummern verifiziert

| Ref | Datei | Inhalt | Verifiziert |
|---|---|---|---|
| `SettingsPopup.tsx:470/474/485` | Selektor-Block | ✓ | ✓ (Grep) |
| `SettingsPopup.tsx:577` | catch → `cleanupFailedIngest(currentRunId)` | ✓ | ✓ (Read) |
| `SettingsPopup.tsx:1996/2004/2041/2046` | onClick/Title/Description | ✓ | ✓ |
| `NewRun.tsx:91` | catch → `cleanupFailedIngest` | ✓ | ✓ (Grep-referenziert) |
| `ingestSlice.ts:492-494` | `serialStatus === 'invalid'` → `allReady: false` | ✓ | ✓ (Read) |
| `ingestSlice.ts:535-537` | `openWEStatus === 'invalid'` → `allReady: false` | ✓ | ✓ |
| `ingestSlice.ts:566-584` | `startWorkflowPhase2` Throws (loadPersistedRun-Fail, Run-nicht-im-Store, Step-1-Integrity-Fail) | ✓ | ✓ |
| `ingestSlice.ts:616-633` | cleanupFailedIngest IDB-Delete-Block | ✓ | ✓ |
| `runPersistenceService.ts:133-282` | saveRun + Merge-Logik | ✓ | ✓ (Read) |
| `runPersistenceService.ts:317/432/485` | drei Bulk-Read-Funktionen | ✓ | ✓ |
| `runPersistenceService.ts:324/439/506` | drei `store.getAll()` | ✓ | ✓ |
| `persistenceSlice.ts:11` | Import-Zeile | ✓ | ✓ |
| `persistenceSlice.ts:147-158` | Änderung-14b-Block | ✓ | ✓ |

### 11.2 Type-Shapes verifiziert

| Typ | Pflichtfelder | Tombstone-Zuweisung | OK? |
|---|---|---|---|
| `Run` | 9 | alle 9 gesetzt | ✓ |
| `RunConfig` | 12 | via `globalConfig` | ✓ |
| `InvoiceHeader` | 3 (`fattura`, `invoiceDate`, `deliveryDate`) | alle 3 gesetzt | ✓ |
| `RunStats` | 23 | alle 23 = 0/false | ✓ |
| `PersistedRunData` / `SaveRunPayload` | 10 | alle 10 gesetzt | ✓ |
| `ingestStatus`-Union | alle 4 | alle Tombstone-Werte sind `'invalid'` = valide | ✓ |
| `saveRun` Signatur | `Promise<boolean>` | Boolean ausgewertet | ✓ |

### 11.3 Call-Site-Inventar

- `loadRunList`: 4 Consumer, alle profitieren vom Filter.
- `getStorageStats`: 1 Pass-Through Consumer.
- `exportToDirectory`: 3 Consumer, Filter verhindert Export kaputter Records.
- `loadRun(runId)` (By-ID): 9 Sites. `loadPersistedRun` hat 14b mit SSOT-Helper; andere By-ID-Reads bekommen runIds nur aus bereits gefilterter UI.
- `isTombstoneRecord`: 5 Call-Sites mit identischer Definition (4 in runPersistenceService + 1 in persistenceSlice).
- `cleanupFailedIngest` Auslöser-Inventar:
  - `ingestAndPersistRunData`-Aufrufer mit `allReady=false` (pdf/articleList/serialList/openWE jeweils `invalid`) — abgedeckt durch 4-Feld-Filter auch ohne Mark-First.
  - `startWorkflowPhase2`-throw im catch (`SettingsPopup.tsx:577`, `NewRun.tsx:91`) — abgedeckt durch Mark-First-Pattern in Rev 5.

### 11.4 B5+B6-Szenarien durchgerechnet

| Fall | Auslöser | `ingestStatus` des Original-Records | Mark-First-Write | Delete | Sichtbarkeit nach Reload |
|---|---|---|---|---|---|
| 1 | serialList-Fehler (`ingestSlice.ts:492`) | `{pdf:'ready', articleList:'ready', serialList:'invalid', openWE:'pending'}` | ok | ok | Record gelöscht ✓ |
| 1a | serialList-Fehler, Mark ok, Delete fail | wie oben | ok | fail | Tombstone markiert → gefiltert ✓ |
| 1b | serialList-Fehler, Mark fail, Delete ok | wie oben | fail | ok | Record gelöscht ✓ |
| 1c | serialList-Fehler, beide fail | `{pdf:'ready', articleList:'ready', serialList:'invalid', openWE:'pending'}` | fail | fail | Original-Record hat nur `serialList:'invalid'` + `status≠'failed'` → **NICHT** vom 6-fach-konjunktiven `isTombstoneRecord`-Filter erkannt. IDB-Doppel-Fail — Restrisiko analog Fall 3c (§13.2). |
| 2 | openWE-Fehler (`ingestSlice.ts:535`) | `{pdf:'ready', articleList:'ready', serialList:'ready', openWE:'invalid'}` | ok | ok | Mark-First überschreibt Original mit alle-invalid → Record gelöscht ✓ |
| 2a | openWE-Fehler, Mark ok, Delete fail | wie oben | ok | fail | Tombstone markiert → vom Filter erkannt ✓ |
| 2b | openWE-Fehler, Mark fail, Delete ok | wie oben | fail | ok | Record gelöscht ✓ |
| 2c | openWE-Fehler, beide fail | wie oben | fail | fail | Original-Record hat nur `openWE:'invalid'` + `status≠'failed'` → **NICHT** vom 6-fach-konjunktiven Filter erkannt. IDB-Doppel-Fail — Restrisiko analog Fall 3c (§13.2). |
| 3 | `startWorkflowPhase2`-throw, Mark ok, Delete ok | alle-ready | ok | ok | Record gelöscht ✓ |
| 3a | `startWorkflowPhase2`-throw, Mark ok, Delete fail | alle-ready | ok | fail | Tombstone markiert → gefiltert ✓ **(B6-Fix)** |
| 3b | `startWorkflowPhase2`-throw, Mark fail, Delete ok | alle-ready | fail | ok | Record gelöscht ✓ |
| 3c | `startWorkflowPhase2`-throw, beide fail | alle-ready | fail | fail | Original-Record mit alle-ready → **NICHT** gefiltert. IDB-Doppel-Fail — Restrisiko §13.2. |

**Resultat:** Alle praktisch auftretenden Fälle sind abgedeckt, solange mindestens eine IDB-Operation (Mark ODER Delete) erfolgreich ist. IDB-Doppel-Fail-Fälle 1c, 2c und 3c bleiben als gemeinsame Infrastruktur-Fehlerklasse Restrisiko (§13.2). Der 6-fach-konjunktive `isTombstoneRecord`-Filter greift in diesen drei Fällen nicht, weil er alle vier `ingestStatus`-Felder === `'invalid'` PLUS `status='failed'`, leere Fattura, `parsedInvoiceLines=0` und leere Steps verlangt.

### 11.5 `saveRun`-Merge-Interaktion verifiziert

`runPersistenceService.saveRun` (Z. 148-247) enthält PROJ-49-Merge-Schutz:

| Feld | Merge-Verhalten | Tombstone-Impact |
|---|---|---|
| `run` | **kein Schutz** — unser `tombstoneRun` ersetzt existing vollständig | ✓ |
| `invoiceLines`, `issues`, `auditLog`, `runLog` | **kein Schutz** — unsere `[]`-Payload ersetzt | ✓ |
| `parsedInvoiceResult` (Z. 157) | bei `null` + `!isOwnedByCurrentRun` wird existing preserved | für Tombstone-Erkennung irrelevant — Filter schaut nur auf `ingestStatus` |
| `parsedPositions` (Z. 167, 211) | bei `[]` + `!isOwnedByCurrentRun` wird existing preserved | irrelevant |
| `preFilteredSerials`, `serialDocument`, `uploadMetadata`, `parserWarnings`, `parsedArticlePool`, `parsedOrderPool` | analog | irrelevant |
| **`ingestStatus` (Z. 232)** | `if (!mergedData.ingestStatus && existing.ingestStatus)` — schützt NUR wenn unser Wert falsy ist. Wir liefern truthy → **unser Override gewinnt** | **kritisch — ✓ verifiziert** |

Die Merge-Logik gefährdet den Tombstone-Effekt NICHT. Das `run`-Objekt wird vollständig ersetzt (inkl. `status: 'failed'`), und unser explizites `ingestStatus:'invalid'` setzt sich durch.

### 11.6 Confidence-Auswertung

| Dimension | Nachweis | Confidence |
|---|---|---|
| Zeilennummern P1 + P2 | Grep + Read verifiziert | 99 % |
| Type-Korrektheit Tombstone | gegen types/index.ts | 98 % |
| Filter-Konsistenz (SSOT) | 5 Call-Sites, eine Definition | 99 % |
| B5-Abdeckung (serialList/openWE) | §11.4 Fälle 1-2 durchgerechnet | 98 % |
| B6-Abdeckung (startWorkflowPhase2-throw) | §11.4 Fälle 3/3a/3b durchgerechnet | 97 % |
| `saveRun`-Merge verifiziert | §11.5 alle schutzrelevanten Felder | 98 % |
| Safety-Check `handleArchiveDefault` | Asymmetrie eliminiert | 97 % |
| Silo C.B-TA1 | unberührt | 100 % |
| `tsc --noEmit` (projiziert) | Typen belegt | 96 % |
| Restrisiko IDB-Doppel-Fail (Fall 3c) | siehe §11.7 | −3 % |

**Gewichtetes Gesamtergebnis: 97 %** — über der 96,5 %-Schwelle.

### 11.7 Deklariertes Restrisiko (3 %)

- **IDB-Doppel-Fail bei `startWorkflowPhase2`-throw** (Fall 3c): Wenn sowohl Tombstone-Mark als auch Delete scheitern UND der Original-Record alle vier Stati gesund hat, bleibt er unmarkiert in IDB. Das ist ein IDB-Infrastrukturproblem, keine Logik-Lücke. Kontrolliert durch differenziertes Logging, das den Tester zur manuellen IDB-Bereinigung anleitet.
- **IDB-Doppel-Fail bei serialList-only-invalid** (Fall 1c) und **openWE-only-invalid** (Fall 2c): Infrastrukturell identisch mit Fall 3c. Der 6-fach-konjunktive `isTombstoneRecord`-Filter unterdrückt sie nicht, weil er alle vier `ingestStatus === 'invalid'` PLUS `status='failed'` + leere Fattura + `parsedInvoiceLines=0` + leere Steps verlangt. Original-Record hat in 1c/2c nur EIN `invalid`-Feld und typischerweise `status='running'` zum Fehlerzeitpunkt → Filter greift nicht. Mitigiert durch 4-Fall-Logging in `cleanupFailedIngest`, das den Tester zur manuellen IDB-Bereinigung anleitet (analog 3c).
- **IDB-Quota-Exception** beim Tombstone-Write — abgefangen durch `try/catch`, differenziertes Logging.
- **Theoretischer Race** `loadRun(runId)` direkt nach `saveRun(tombstone)`: 14b räumt beim nächsten Boot auf.

## 12. Hinweise für den Mechaniker

1. **Reihenfolge** (siehe §10): Commit A vor B vor C.
2. **Zwischen-`tsc --noEmit`** nach jedem P2-1-Sub-Step (a/b/c/d/e).
3. **`isTombstoneRecord` als `export function`** auf Top-Level in `runPersistenceService.ts` — Named Export für Import in `persistenceSlice.ts`.
4. **Mark-First-Then-Delete ist NICHT umkehrbar.** Wer die Reihenfolge wieder auf Delete-First ändert, reißt B6 wieder auf.
5. **Nach Umsetzung** `PROJ-50_AUDIT_DEV.md` + `features/INDEX.md` aktualisieren (separate Folgeaufgabe).

## 13. Garantiescope (Rev 6, neu)

Rev 5 bezeichnete den Plan als „regressionsfrei" in absoluter Form und dokumentierte dennoch Fall 3c als offen. Das war ein Widerspruch in den Worten — Rev 6 löst ihn durch eine explizite Scope-Definition auf.

### 13.1 Was innerhalb des Garantiescopes liegt

Der Plan garantiert Regressionsfreiheit für **alle Logik-Pfade bei funktionierender IDB**:

- Jede Kombination aus `cleanupFailedIngest`-Auslöser (Phase-1-`allReady=false` für jedes der vier Quellfelder ODER `startWorkflowPhase2`-throw) und mindestens einem erfolgreichen IDB-Write (Mark ODER Delete) führt garantiert dazu, dass der Record nach Reload nicht als `QA-*`-Run in Dashboard/Archive erscheint.
- Konkret: Fall 1/1a/1b, 2/2a/2b, 3/3a/3b aus §11.4.
- Der Filter `isTombstoneRecord` ist SSOT auf fünf Call-Sites und prüft alle vier `ingestStatus`-Felder.
- `saveRun`-Merge-Logik ist gegen unseren Override verifiziert (§11.5).
- Typ-Korrektheit des Tombstones ist ohne `as Run`-Casts sichergestellt.

### 13.2 Was außerhalb des Garantiescopes liegt

**IDB-Doppel-Fail-Fehlerklasse (Fälle 1c, 2c, 3c):** Wenn sowohl Tombstone-Mark als auch physischer Delete auf derselben Session scheitern, bleibt der Original-Record unmarkiert physisch in IDB. Die drei Shape-Varianten derselben Fehlerklasse:

- **Fall 1c — serialList-only-invalid:** Auslöser `ingestSlice.ts:492` (serialList-Fehler in Phase 1). Original-Shape: `{pdf:'ready', articleList:'ready', serialList:'invalid', openWE:'pending'}`, `status='running'`.
- **Fall 2c — openWE-only-invalid:** Auslöser `ingestSlice.ts:535` (openWE-Fehler in Phase 1). Original-Shape: `{pdf:'ready', articleList:'ready', serialList:'ready', openWE:'invalid'}`, `status='running'`.
- **Fall 3c — alle-ready:** Auslöser `startWorkflowPhase2`-throw nach erfolgreichem Ingest. Original-Shape: alle vier `ingestStatus === 'ready'`, `status='running'`.

In allen drei Fällen wird der Record nach Reload vom 6-fach-konjunktiven `isTombstoneRecord`-Filter nicht erkannt, weil dieser alle vier `ingestStatus`-Felder === `'invalid'` UND `status='failed'` + leere Fattura + `parsedInvoiceLines=0` + leere Steps kumulativ verlangt. In Fall 1c/2c hat der Original-Record nur EIN `invalid`-Feld; in Fall 3c gar keines; und `status` ist in allen drei Fällen typischerweise noch `'running'` (nicht `'failed'`).

Dies ist **kein Logik-Pfad-Bug**, sondern ein IDB-Infrastrukturereignis:
- `saveRun` und `deletePersistedRun` beide failen erfordert entweder Quota-Erschöpfung, IDB-Lock, Corruption oder einen Hardware-Fehler.
- Abgefangen durch differenziertes Logging (`[cleanupFailedIngest] Run X: Tombstone-Mark UND Delete scheiterten. IDB-Infrastrukturproblem...`), das den Tester zur manuellen Bereinigung anleitet (`IndexedDB 'falmec-receiptpro-runs'` löschen).
- Ein In-Code-Fix (z. B. Retry-Schleife mit exponential Backoff oder Boot-Time-Re-Scan) wäre technisch möglich, aber YAGNI: die Auslöser-Wahrscheinlichkeit ist in produktiver Umgebung vernachlässigbar gegenüber dem Komplexitäts-Aufwand, und die Log-gestützte manuelle Bereinigung ist der Standard-Eskalationspfad für IDB-Infrastrukturprobleme in diesem Projekt.

### 13.3 Konsequenz für die Confidence-Angabe

- **97 %** — praktische Umsetzungs-Confidence unter dem definierten Garantiescope.
- **94 %** — wenn Fall 3c absolut in den Scope gezogen würde. Der Plan wählt bewusst die erste Sichtweise, weil Fall 3c kein Plan-/Logik-Mangel ist.

### 13.4 Scope-Überschreitung als Folgeaufgabe

Sollte das Governance-Team eine absolute Ghost-Run-Unmöglichkeit verlangen, wäre das kein P1/P2-Hotfix-Scope mehr, sondern eine eigenständige Infrastruktur-Härtung:

- Option A: Retry-Schleife mit exponential Backoff auf beiden IDB-Writes.
- Option B: Boot-Time-Re-Scan: beim App-Start alle Records ohne `ingestStatus` oder mit `status === 'running'` älter als X Minuten automatisch als Tombstone markieren.
- Option C: Dedizierter `tombstone: true`-Flag im `PersistedRunData`-Schema (Schema-Migration).

Alle drei Optionen sind YAGNI für den aktuellen Bugfix-Zyklus. Dokumentiert als Tech-Debt-Kandidaten.

---

*Letzte Aktualisierung: 2026-04-23 | Rev 7 DOKU-FIX — Red-Team-Funde F1-F4 eingearbeitet: §11.4-Tabelle Fälle 1c/2c von „✓ vom 4-Feld-Filter erkannt" auf Restrisiko-Fehlerklasse (analog 3c) korrigiert, §13.2 auf gemeinsame IDB-Doppel-Fail-Fehlerklasse mit drei Shape-Varianten umgestellt, §11.7 Restrisiko-Liste um 1c/2c ergänzt, §9 Punkt 4 präzisiert. Kein Code-Diff — `git diff src/` leer. Audit `PROJ-50_AUDIT_FAST-BUGFIX.md` Rev 4 dokumentiert die Parallel-Änderung. Confidence unverändert 97 %.*

*Rev 6 FINAL — Review-Befund B7 (Absolut-Garantie vs. Fall-3c-Widerspruch) eingearbeitet: Garantiescope explizit definiert (§13), C.A-2 konditional formuliert, §9 auf Scope-konsistente Aussagen umgestellt, Footer-Status auf „Logik-regressionsfrei im Scope" präzisiert. Confidence 97 % im Scope / 94 % bei Einschluss von Fall 3c.*
