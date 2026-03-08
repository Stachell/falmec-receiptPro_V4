# PROJ-27-ADDON-2: Early Archive Move

## Status: Open

---

## Motivation / Problem

Die bisherige Auto-Archivierung am Ende von Step 5 scheitert an der Browser-Sicherheitsblockade: Die File System Access API erfordert eine aktive **User Activation** (Klick/Tastendruck). Zum Zeitpunkt des Step-5-Abschlusses ist die User Activation vom initiierenden "Run Starten"-Klick längst abgelaufen. Der Browser blockiert den Schreibzugriff **still** — das Archiv auf der Festplatte wird nie geschrieben.

**Kernregel:** Festplatten-Schreibzugriffe (File System Access API) sind NUR möglich, wenn ein direkter User-Klick im Fahrwasser liegt. Automatisierte Steps (Step 2-5) haben KEINE User Activation.

---

## Lösung: Early Archive Move

### Das neue Archivierungs-Modell (3 Säulen)

| Zeitpunkt | Was passiert | User Activation? |
|-----------|-------------|-------------------|
| **Step 1** (nach PDF-Parsing) | Original-PDFs + Upload-Dokumente werden sofort in `.Archiv/Fattura-XXX_DATUM/` gesichert + Basis-`metadata.json` | ✅ JA — "Run Starten"-Klick |
| **Step 5** (Workflow-Abschluss) | Run-Status auf `'ok'` setzen (IndexedDB) + `cleanupBrowserData()`. **KEIN Festplatten-Schreibzugriff!** | ❌ NEIN — keine User Activation |
| **Kachel 6** (manueller Export-Klick) | CSV/XML-Export-Download + finale Metadaten (`invoice-lines.json`, `run-log.json`, `serial-data.json`, `run-report.json`, aktualisierte `metadata.json`) werden ins bestehende Archiv geschrieben | ✅ JA — Export-Button-Klick |

### Architektur-Diagramm

```
VORHER:
  Step 1 (Parse) → Step 2-4 (Auto) → Step 5 → archiveRun() → writeArchivePackage() ✗ BLOCKED
                                                     ↳ PDF + Metadata + Logs → .Archiv/

NACHHER:
  Step 1 (Parse) → writeEarlyArchive() ✓ USER ACTIVATION
                 ↳ PDF + Upload-Docs + Basis-Metadata → .Archiv/Fattura-XXX/
                 → Step 2-4 (Auto)
                 → Step 5 → updateRunStatus('ok') + cleanupBrowserData()
                           ↳ NUR IndexedDB + localStorage — KEIN Disk-Write!

  Kachel 6 (Klick) → appendToArchive() ✓ USER ACTIVATION
                    ↳ CSV/XML + invoice-lines + run-log + serials + metadata → .Archiv/Fattura-XXX/
```

---

## Betroffene Call-Sites (IST-Zustand → SOLL)

| Stelle | Datei:Zeile | IST | SOLL |
|--------|------------|-----|------|
| Step 5 Auto-Archive | `runStore.ts:1669` | `archiveRun()` (Disk-Write) | **ENTFERNEN** — nur `updateRunStatus('ok')` + `cleanupBrowserData()` |
| ExportPanel (Kachel 6) | `ExportPanel.tsx:94` | `writeArchivePackage()` (neuer Ordner!) | `appendToArchive()` in bestehenden Ordner |
| RunDetail Kachel-6 CSV | `RunDetail.tsx:336` | `writeArchivePackage()` (neuer Ordner!) | `appendToArchive()` in bestehenden Ordner |
| Abort-Button | `runStore.ts:2218` | `archiveRun()` | Bleibt — Abort hat User Activation vom Klick |
| createArchiveEntry | `runStore.ts:1006` | localStorage-Eintrag | **ENTFERNEN** — ersetzt durch `writeEarlyArchive()` |

---

## Implementierungsschritte

### Schritt 1: `src/services/archiveService.ts` — Neue Methode `writeEarlyArchive()`

**Einfügeort:** Nach `createArchiveEntry()` (ca. Zeile 133)

**Signatur:**
```typescript
async writeEarlyArchive(
  run: Run,
  uploadedFiles: UploadedFile[],
  config: RunConfig
): Promise<{ success: boolean; folderName: string }>
```

**Was wird geschrieben (in `.Archiv/Fattura-XXX_DATUM/`):**
- Alle Upload-Dateien: Invoice PDF (`type === 'invoice'`), Warenbegleitschein (`type === 'openWE'`), Serienliste (`type === 'serialList'`), Artikelstamm (`type === 'articleList'`) — direkt aus den in-memory `File`-Objekten in `uploadedFiles[]`
- `metadata.json` mit Status `'running'` und Basis-Infos:
  - `version`, `runId`, `fattura`, `invoiceDate`, `createdAt`, `archivedAt`
  - `config` (eingangsart, tolerance, currency, preisbasis)
  - `files`-Manifest (welche Dateien archiviert wurden, Name + Größe)
  - `stats`: nur `parsedPositions` und `expandedLines` (was nach Step 1 verfügbar ist)

**Was wird NICHT geschrieben:**
- `invoice-lines.json` (noch nicht final — kommt erst beim Export-Klick)
- `run-log.json` (noch nicht komplett — kommt erst beim Export-Klick)
- `serial-data.json`, `run-report.json` (noch nicht vorhanden)
- CSV/XML-Exports (kommen erst bei manuellem Export)

**Ordnername:** Nutzt die bestehende `generateArchiveFolderName(fattura, invoiceDate)` intern (gleiche Klasse, kein Sichtbarkeits-Problem).

**Datei-Schreib-Quelle:** In-memory `File`-Objekte aus `uploadedFiles[]` — NICHT `fileStorageService.loadFile()` aus IndexedDB. Vermeidet Race-Conditions und ist direkter.

---

### Schritt 2: `src/services/archiveService.ts` — Neue Methode `appendToArchive()`

**Einfügeort:** Nach `writeEarlyArchive()`

**Signatur:**
```typescript
async appendToArchive(
  folderName: string,
  run: Run,
  lines: InvoiceLine[],
  options?: {
    extraFiles?: Record<string, string>;
    preFilteredSerials?: PreFilteredSerialRow[];
    issues?: Issue[];
  }
): Promise<{ success: boolean; failedFiles: string[] }>
```

**Zweck:** Wird NUR bei manuellem User-Klick aufgerufen (Kachel 6 Export oder Abort-Button). Schreibt nachträgliche Dateien in den EXISTIERENDEN Archiv-Ordner:

| Datei | Bedingung |
|-------|-----------|
| `invoice-lines.json` | Immer (finaler Stand) |
| `run-log.json` | Immer (finaler Stand aus logService-Buffer) |
| `serial-data.json` | Wenn `preFilteredSerials` vorhanden |
| `run-report.json` | Wenn `issues` vorhanden |
| Versionierte Exports (z.B. `export_v1.csv`) | Wenn `extraFiles` übergeben |
| `metadata.json` | Immer — **überschreibt** die Basis-Metadata mit finalem Status + Stats |

**Kein** `cleanupBrowserData()` — das wird separat gesteuert.
**Kein** `generateArchiveFolderName()` — Ordner existiert bereits.
**Kein** PDF-Schreiben — bereits im Early Archive vorhanden.

---

### Schritt 3: `src/store/runStore.ts` — Early Archive in `createNewRunWithParsing()`

**Einfügeort 1:** Nach Zeile 910 (`runId = newRunId;`) im **Success-Pfad**
**Einfügeort 2:** Nach Zeile 941 (`runId = newRunId;`) im **Partial-Success-Pfad**

**Code (identisch an beiden Stellen):**
```typescript
// PROJ-27-ADDON-2: Early Archive — PDFs sichern solange User Activation gültig
try {
  const earlyRun = get().runs.find(r => r.id === runId);
  if (earlyRun) {
    const earlyResult = await archiveService.writeEarlyArchive(
      earlyRun, uploadedFiles, globalConfig
    );
    if (earlyResult.success) {
      set((state) => ({
        runs: state.runs.map(r =>
          r.id === runId ? { ...r, archivePath: earlyResult.folderName } : r
        ),
        currentRun: state.currentRun?.id === runId
          ? { ...state.currentRun, archivePath: earlyResult.folderName }
          : state.currentRun,
      }));
      logService.info(`Early Archive erstellt: ${earlyResult.folderName}`, {
        runId, step: 'Archiv',
      });
    }
  }
} catch (err) {
  logService.warn(
    `Early Archive fehlgeschlagen: ${err instanceof Error ? err.message : err}`,
    { runId, step: 'Archiv' }
  );
}
```

**Warum `await` (nicht fire-and-forget):**
1. Wir brauchen `folderName` für `archivePath` im State
2. User Activation bleibt über `await`-Chains in modernen Browsern erhalten
3. Fehler werden gefangen → Step 2 läuft trotzdem weiter

---

### Schritt 4: `src/store/runStore.ts` — `createArchiveEntry()` entfernen

**Zeilen 1002-1018:** Den gesamten Block entfernen:
```typescript
// ENTFERNEN: Gesamter Block
// Create archive entry
const finalRun = get().currentRun;
if (finalRun) {
  try {
    archiveService.createArchiveEntry(
      finalRun.id,
      finalRun.invoice.fattura,
      globalConfig,
      uploadedFiles
    );
  } catch (error) {
    ...
  }
}
```

**Begründung:** `writeEarlyArchive()` (Schritt 3) ersetzt diese Funktionalität komplett — schreibt direkt auf Disk statt nur in localStorage (das bei PDFs >1MB ohnehin versagt).

---

### Schritt 5: `src/store/runStore.ts` — Step 5 Auto-Archive komplett entfernen

**Zeilen 1663-1672 ersetzen:**

```typescript
// VORHER (ENTFERNEN):
} else {
  // All steps completed → mark run as finished and auto-archive
  get().updateRunStatus(runId, 'ok');
  logService.info('Run abgeschlossen – alle Schritte fertig', { runId, step: 'System' });

  // Fire-and-forget archive
  get().archiveRun(runId).catch(err =>
    logService.error(`Auto-Archivierung fehlgeschlagen: ${err instanceof Error ? err.message : err}`, { runId, step: 'Archiv' })
  );
}

// NACHHER:
} else {
  // PROJ-27-ADDON-2: All steps completed → mark run as finished
  // KEIN Disk-Write hier! PDFs wurden in Step 1 archiviert,
  // finale Metadaten werden erst beim manuellen Export-Klick (Kachel 6) geschrieben.
  get().updateRunStatus(runId, 'ok');
  logService.info('Run abgeschlossen – alle Schritte fertig', { runId, step: 'System' });

  // Browser-Cleanup: localStorage + IndexedDB bereinigen (kein Disk-Zugriff nötig)
  archiveService.cleanupBrowserData(runId).catch(err =>
    logService.warn(`Browser-Cleanup fehlgeschlagen: ${err instanceof Error ? err.message : err}`, { runId, step: 'Archiv' })
  );
}
```

**Kritisch:** KEIN `archiveRun()`, KEIN `appendToArchive()`, KEIN `writeArchivePackage()`. Step 5 hat KEINE User Activation — jeder Versuch eines Disk-Writes würde fehlschlagen.

---

### Schritt 6: `src/store/runStore.ts` — `archiveRun()` aktualisieren

**Zeilen 2149-2184:** Anpassen für `appendToArchive` wenn `archivePath` existiert:

```typescript
archiveRun: async (runId) => {
  const state = get();
  const run = state.runs.find(r => r.id === runId);
  if (!run) {
    logService.warn('archiveRun: Run nicht gefunden', { runId, step: 'Archiv' });
    return { success: false, folderName: '' };
  }

  const lines = state.invoiceLines.filter(l => l.lineId.startsWith(runId));

  if (run.archivePath) {
    // PROJ-27-ADDON-2: Early Archive existiert → nur finale Daten anhängen
    const result = await archiveService.appendToArchive(run.archivePath, run, lines, {
      preFilteredSerials: state.preFilteredSerials,
      issues: state.issues,
    });
    if (result.success) {
      logService.exportRunLog(runId).catch(() => {});
    }
    return { success: result.success, folderName: run.archivePath };
  } else {
    // Legacy-Fallback: Kein Early Archive → volles Paket schreiben
    const result = await archiveService.writeArchivePackage(run, lines, {
      preFilteredSerials: state.preFilteredSerials,
      issues: state.issues,
    });

    if (result.success && result.folderName) {
      set((s) => ({
        runs: s.runs.map(r =>
          r.id === runId ? { ...r, archivePath: result.folderName } : r
        ),
        currentRun: s.currentRun?.id === runId
          ? { ...s.currentRun, archivePath: result.folderName }
          : s.currentRun,
      }));
    }
    if (result.cleanedUp) {
      logService.exportRunLog(runId).catch(() => {});
    }
    return { success: result.success, folderName: result.folderName };
  }
},
```

**Hinweis:** `archiveRun()` wird jetzt NUR noch von `abortRun()` (Zeile 2218) aufgerufen — dort hat der User den Abort-Button geklickt → User Activation vorhanden.

---

### Schritt 7: `src/components/run-detail/ExportPanel.tsx` — `appendToArchive` statt `writeArchivePackage`

**Zeilen 93-98 ersetzen:**

```typescript
// VORHER:
archiveService.writeArchivePackage(effectiveRun, invoiceLines, {
  extraFiles: { [fileName]: content },
}).catch(() => {});

// NACHHER:
// PROJ-27-ADDON-2: Finale Metadaten + Export in bestehenden Archiv-Ordner
const archiveFolder = effectiveRun.archivePath;
if (archiveFolder) {
  archiveService.appendToArchive(archiveFolder, effectiveRun, invoiceLines, {
    extraFiles: { [fileName]: content },
    preFilteredSerials: useRunStore.getState().preFilteredSerials,
    issues: useRunStore.getState().issues,
  }).catch(() => {});
} else {
  // Fallback: Kein Early Archive → volles Paket (neuer Ordner)
  archiveService.writeArchivePackage(effectiveRun, invoiceLines, {
    extraFiles: { [fileName]: content },
  }).catch(() => {});
}
```

**Wichtig:** Beim ersten Export-Klick werden ALLE finalen Daten geschrieben (invoice-lines, run-log, serials, issues, metadata). Weitere Klicks fügen nur die neuen Export-Dateien hinzu und überschreiben die Metadaten.

---

### Schritt 8: `src/pages/RunDetail.tsx` — Kachel-6 CSV-Export analog anpassen

**Zeilen 335-338:** Identisches Pattern wie ExportPanel:

```typescript
// VORHER:
archiveService.writeArchivePackage(effectiveRun, currentRunLines, {
  extraFiles: { [csvFileName]: csvContent },
}).catch(() => {});

// NACHHER:
const archiveFolder = effectiveRun.archivePath;
if (archiveFolder) {
  archiveService.appendToArchive(archiveFolder, effectiveRun, currentRunLines, {
    extraFiles: { [csvFileName]: csvContent },
    preFilteredSerials: useRunStore.getState().preFilteredSerials,
    issues: useRunStore.getState().issues,
  }).catch(() => {});
} else {
  archiveService.writeArchivePackage(effectiveRun, currentRunLines, {
    extraFiles: { [csvFileName]: csvContent },
  }).catch(() => {});
}
```

---

### Schritt 9: TypeScript-Check + INDEX.md

1. `npx tsc --noEmit` — 0 Errors erforderlich
2. `features/INDEX.md` — Neuen Eintrag hinzufügen

---

## Dateien-Übersicht

| Datei | Aktion | Umfang |
|-------|--------|--------|
| `src/services/archiveService.ts` | 2 neue Methoden (`writeEarlyArchive`, `appendToArchive`) | ~120 Zeilen neu |
| `src/store/runStore.ts` | Early Archive einfügen (2×), Step 5 vereinfachen, `archiveRun` anpassen, `createArchiveEntry`-Call entfernen | ~50 Zeilen geändert |
| `src/components/run-detail/ExportPanel.tsx` | Archive-Call auf `appendToArchive` umstellen | ~10 Zeilen geändert |
| `src/pages/RunDetail.tsx` | Kachel-6 Archive-Call anpassen | ~10 Zeilen geändert |
| `features/INDEX.md` | Eintrag hinzufügen | 1 Zeile |

**NICHT angefasst (Ausschlussregeln):**
- `src/services/fileSystemService.ts` — keine Änderungen
- `src/types/index.ts` — `archivePath` existiert bereits auf `Run`
- `clearAllFiles()`, `loadStoredFiles()` — per Ausschlussregel tabu

---

## Verifikation

1. **Happy Path:** Run starten → Step 1 parst PDF → `.Archiv/Fattura-XXX/` enthält PDF + metadata.json (Status: `'running'`) → Steps 2-5 laufen durch → Step 5 setzt nur IndexedDB-Status + Cleanup → Kachel 6 klicken → Archiv-Ordner enthält jetzt zusätzlich invoice-lines.json, run-log.json, serial-data.json, run-report.json, export.csv/xml, aktualisierte metadata.json (Status: `'completed'`)
2. **Kein Export-Klick:** Run läuft durch → Step 5 → Cleanup → Archiv-Ordner enthält nur PDFs + Basis-Metadata — das ist korrekt, die finalen Daten leben in IndexedDB
3. **Abort:** Run abbrechen → `abortRun()` → `archiveRun()` → `appendToArchive()` mit Status `'failed'` — User Activation vom Abort-Klick vorhanden
4. **Kein Disk-Zugriff:** File System Access API nicht verfügbar → Early Archive schlägt fehl (geloggt) → Run läuft trotzdem → `archivePath` bleibt leer → Export-Klick nutzt `writeArchivePackage`-Fallback
5. **tsc-Check:** `npx tsc --noEmit` = 0 Errors

---

## Nützliche Hinweise für Sonnet bei der Durchführung des Plans um Fehler zu vermeiden

### Timing-Verständnis: Wann hat der Browser User Activation?

| Aktion | User Activation? | Disk-Write erlaubt? |
|--------|------------------|---------------------|
| "Run Starten" geklickt → Step 1 → `writeEarlyArchive()` | ✅ JA | ✅ JA |
| Step 2-4 (automatisiert, via `setTimeout`) | ❌ NEIN | ❌ NEIN |
| Step 5 (auto-complete via `setTimeout`) | ❌ NEIN | ❌ NEIN |
| Kachel 6 "Export" geklickt → `appendToArchive()` | ✅ JA | ✅ JA |
| "Abbrechen" geklickt → `abortRun()` → `archiveRun()` | ✅ JA | ✅ JA |

**ABSOLUTE REGEL:** In Step 5 darf NICHTS auf die Festplatte geschrieben werden. Kein `archiveRun()`, kein `appendToArchive()`, kein `writeArchivePackage()`, kein `fileSystemService.saveToArchive()`. NUR `updateRunStatus()` (IndexedDB) und `cleanupBrowserData()` (localStorage/IndexedDB).

### Fallstricke

1. **`generateArchiveFolderName` ist `private`:** Da `writeEarlyArchive()` eine Methode der gleichen `ArchiveService`-Klasse ist, kann sie `this.generateArchiveFolderName()` direkt aufrufen — kein Sichtbarkeits-Problem.

2. **`uploadedFiles` Variable in `createNewRunWithParsing()`:** An Zeile 810 wird `const { uploadedFiles, ... } = get()` destrukturiert. Diese Variable enthält die in-memory `File`-Objekte. Nutze DIESE Variable für `writeEarlyArchive()`, nicht erneut `get().uploadedFiles` — der State kann sich zwischen `set()`-Aufrufen ändern.

3. **Run-ID-Rename beachten:** Das Early Archive wird NACH dem Run-ID-Rename eingefügt (nach Zeile 910 bzw. 941). Der `runId` ist zu diesem Zeitpunkt bereits die finale `Fattura-XXXXX`-basierte ID. Der Run im Store hat ebenfalls die neue ID.

4. **Zwei Einfügepunkte, NICHT drei:** Der Code hat zwei Pfade wo ein Early Archive sinnvoll ist:
   - **Success-Pfad** (nach Zeile 910) — Parsing erfolgreich
   - **Partial-Success-Pfad** (nach Zeile 941) — Parsing mit Warnungen, aber Fattura-Nummer vorhanden
   - Der dritte Pfad (**Complete Failure**, ab Zeile 943) braucht KEIN Early Archive — keine Fattura-Nummer vorhanden.

5. **`writeArchivePackage()` NICHT löschen:** Die Funktion bleibt als Legacy-Fallback bestehen (für `archiveRun()` wenn kein `archivePath` existiert, und als Fallback in ExportPanel/RunDetail).

6. **`appendToArchive` darf KEIN PDF schreiben:** Das PDF liegt bereits im Ordner (Early Archive). Ein erneutes Schreiben wäre redundant und könnte fehlschlagen, wenn IndexedDB-Daten bereits gelöscht wurden.

7. **`metadata.json` Überschreiben ist gewollt:** `appendToArchive` überschreibt die `metadata.json` vom Early Archive mit dem finalen Stand. `fileSystemService.saveToArchive()` überschreibt bestehende Dateien via `getFileHandle(name, { create: true })`.

8. **`cleanupBrowserData()` in Step 5 ist KEIN Disk-Write:** Diese Methode löscht nur `localStorage`-Einträge und `IndexedDB`-Daten. Sie nutzt KEINE File System Access API. Daher ist sie in Step 5 sicher aufrufbar.

9. **`preFilteredSerials` und `issues` an ExportPanel/RunDetail:** Beide Komponenten müssen `useRunStore.getState().preFilteredSerials` und `useRunStore.getState().issues` an `appendToArchive()` weitergeben, damit beim ersten Export-Klick die finalen Serial- und Issue-Daten ins Archiv geschrieben werden.

### Pflichtregeln für den ausführenden Agenten (Sonnet)

1. **IMMER** vorher in den Plan-Modus gehen (`/plan`).
2. **IMMER** in die Projektdaten schreiben (MEMORY.md aktualisieren).
3. Am Ende selbstständig `npx tsc --noEmit` über das Bash-Terminal ausführen und Fehler fixen.
4. Die Datei `features/INDEX.md` aktualisieren (neuen Eintrag für PROJ-27-ADDON-2 hinzufügen).

---

## Post-Implementation Bugfix: Race-Condition in `createNewRunWithParsing`

**Datum:** 2026-03-08
**Symptom:** Step 1 läuft an → Keine Invoice-Lines → Step 2 bricht ab → UI: "Lauf nicht gefunden"

### Root Cause

Der ursprüngliche Code verwendete `await archiveService.writeEarlyArchive(...)` direkt in `createNewRunWithParsing()`. Diese Disk-IO-Operation blockierte die Promise-Auflösung der Funktion für mehrere Sekunden.

**Timeline des Fehlers:**
1. ID-Rename (`runId → newRunId`) triggert `useEffect` in `RunDetail.tsx` (dep: `runs`)
2. Cleanup des Effects: `setCurrentRun(null)` → Store: `currentRun = null`
3. Effect-Body: `runs.find(r => r.id === decodedRunId)` sucht nach altem URL-Param → nicht gefunden → `currentRun` bleibt `null`
4. 500ms-Timer feuert während `await writeEarlyArchive` noch läuft:
   - `const activeRunId = currentState.currentRun?.id` → `undefined`
   - `if (activeRunId)` → **false** → `advanceToNextStep` wird nie aufgerufen
5. Steps 2-5 starten nie → Run hängt nach Step 1

### Fix (`src/store/runStore.ts`, 2 Stellen)

`await writeEarlyArchive(...)` wurde durch fire-and-forget `.then()/.catch()` ersetzt:

```typescript
// PROJ-27-ADDON-2 BUGFIX: fire-and-forget — kein await verhindert Race-Condition
const earlyRun = get().runs.find(r => r.id === runId);
if (earlyRun) {
  const capturedRunId = runId; // let-Variable einfangen (hat bereits newRunId-Wert)
  archiveService.writeEarlyArchive(earlyRun, uploadedFiles, globalConfig)
    .then(earlyResult => {
      if (earlyResult.success) {
        set((state) => ({ ... }));
        logService.info(...);
      }
    })
    .catch(err => { logService.warn(...) });
}
```

**Warum sicher:**
- `File`-Objekte sind In-Memory (JavaScript Browser-Native) — bleiben gültig in der Promise-Closure, unabhängig von IndexedDB-Cleanup
- `capturedRunId` fängt den aktuellen `newRunId`-Wert ein (keine stale `let`-Variable)
- `set((state) => ...)` empfängt immer den aktuellen Store-Stand
- User Activation bleibt erhalten: `writeEarlyArchive` wird im selben Microtask-Frame gestartet

**Ergebnis:** `createNewRunWithParsing()` resolved sofort nach dem Parsing → `parsingPromise.then(navigate)` feuert → URL auf `newRunId` → `currentRun` korrekt → 500ms-Timer findet `currentRun` → Steps 2-5 laufen normal durch.
