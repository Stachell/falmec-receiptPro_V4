# REPORT: AutoSave/Archiv-Bug (`invoice-lines.json`, `metadata.json`)

## Skill-Status
- Verwendet: `frontend` (geladen, für strukturierte Projektanalyse).
- Angefordert aber nicht verfügbar: `react-dev` (kein `SKILL.md` gefunden), daher Fallback auf direkte Code-Analyse.

## Scope der Analyse
- Primär geprüft:
  - `src/services/archiveService.ts`
  - `src/services/fileSystemService.ts`
- Für End-to-End-Pfad zusätzlich geprüft:
  - `src/store/runStore.ts`
  - `src/hooks/useRunAutoSave.ts`
  - `src/hooks/buildAutoSavePayload.ts`
  - `src/services/runPersistenceService.ts`
  - `src/pages/NewRun.tsx`
  - `src/components/AppFooter.tsx`
  - `src/services/fileStorageService.ts`

## 1) Exakter Save-Pfad beim Auto-Abschluss (Step 5)

1. `advanceToNextStep()` auto-completed Step 5 per Timer (`setTimeout(100)`), wenn Step 5 noch `running` ist (`src/store/runStore.ts:1649-1661`).
2. Danach (alle Steps fertig) wird Run auf `ok` gesetzt und `archiveRun(runId)` fire-and-forget gestartet (`src/store/runStore.ts:1665-1670`).
3. `archiveRun()` ruft `archiveService.writeArchivePackage(run, lines, ...)` auf (`src/store/runStore.ts:2149-2161`).
4. `writeArchivePackage()` schreibt die Archivdateien sequentiell via `fileSystemService.saveToArchive(...)` (`src/services/archiveService.ts:351-535`).

## 2) Speicherpfad von `invoice-lines.json` und `metadata.json`

### `invoice-lines.json`
- Erzeugung/Write:
  - `JSON.stringify(lines, null, 2)` und `saveToArchive(folderName, 'invoice-lines.json', ...)`
  - `src/services/archiveService.ts:377-381`
- Bei `false` von `saveToArchive`:
  - Push in `failedFiles`
  - `src/services/archiveService.ts:381`

### `metadata.json`
- Aufbau `metadata`-Objekt aus Run/Stats/Dateiinfos:
  - `src/services/archiveService.ts:477-509`
- Write:
  - `saveToArchive(folderName, 'metadata.json', JSON.stringify(metadata, null, 2))`
  - `src/services/archiveService.ts:511-514`
- Bei `false`:
  - Push in `failedFiles`
  - `src/services/archiveService.ts:514`

### Tatsächlicher Dateisystem-Write in `fileSystemService.saveToArchive()`
- Harte Vorbedingung:
  - `checkPermission()` muss `true` liefern, sonst sofort `false` (kein Write-Versuch).
  - `src/services/fileSystemService.ts:188-191`
- Danach:
  - `.Archiv/<folderName>/...` wird über Handles geschrieben (`getDirectoryHandle`, `getFileHandle`, `createWritable`).
  - `src/services/fileSystemService.ts:193-217`

## 3) Warum landen genau diese Dateien im `failedFiles` beim Auto-Save?

### Direkte technische Ursache
- `invoice-lines.json` und `metadata.json` sind als **kritische Pflichtdateien** modelliert.
- Sobald `saveToArchive(...)` für diese beiden `false` liefert, landen sie in `failedFiles` und zählen als kritischer Fehler (`src/services/archiveService.ts:517-520`).
- WARN wird genau für diese kritischen Namen geloggt (`src/services/archiveService.ts:527`).

### Warum `saveToArchive(...)` im Auto-Pfad typischerweise `false` liefert
- `saveToArchive()` bricht sofort ab, wenn `checkPermission()` nicht `granted` ist (`src/services/fileSystemService.ts:188-191`, `295-302`).
- `checkPermission()` liefert `false`, wenn:
  - `directoryHandle` fehlt (`src/services/fileSystemService.ts:296-297`), oder
  - Permission nicht `granted` ist (`src/services/fileSystemService.ts:300-301`).

### Hochwahrscheinliches Ausfallmuster im aktuellen Code
- App/Flow akzeptiert "Pfad konfiguriert" bereits über `localStorage` (`getDataPath`) ohne garantierten Live-Handle:
  - `NewRun` lässt Start zu mit `!!fileSystemService.getDataPath()` (`src/pages/NewRun.tsx:39,59`).
  - `ensureFolderStructure()` gibt bei verlorenem Handle bewusst `true` zurück ("workflow nicht blocken") (`src/services/fileSystemService.ts:146-149`).
  - `AppFooter` markiert `isConfigured` ebenfalls nur über gespeicherten Pfad (`src/components/AppFooter.tsx:49-54`).
- Ergebnis: Run kann durchlaufen, aber Auto-Archivierung fällt später am Permission-Gate im `saveToArchive` aus.

### Frage "Browser blockiert wegen fehlender User Activation?"
- Im Auto-Archivpfad wird **kein** `showDirectoryPicker()`/`requestPermission()` aufgerufen.
- Auto-Archiv versucht nur vorhandene Handles zu nutzen und prüft `queryPermission`.
- Daher ist der konkrete Code-Fehlerbildschirm eher: **kein (mehr) gültiger Handle/keine granted-Permission im Moment des Auto-Saves**, nicht ein expliziter "User-Activation-Block" beim Schreiben selbst.
- Re-Permission ist nur über user-initiierte Picker-Wege implementiert (`selectDirectory`/`requestPermission`, `src/services/fileSystemService.ts:48-73, 412-425`).

## 4) Wird IndexedDB trotzdem sicher gespeichert?

## Kurzantwort
- Ja: Der IndexedDB-Run-Save (`runPersistenceService`) ist vom Dateisystem-Archivpfad entkoppelt.

## Begründung
- Globaler AutoSave-Hook läuft in `App` dauerhaft (`src/App.tsx:18-20`).
- Bei relevanten Store-Änderungen wird debounced `runPersistenceService.saveRun(payload)` aufgerufen (`src/hooks/useRunAutoSave.ts:40-75`).
- `saveRun` schreibt in eigene DB `falmec-receiptpro-runs` / Store `runs` (`src/services/runPersistenceService.ts:27-30, 115-145`).
- Dieser Pfad nutzt **kein** `fileSystemService` und kein `saveToArchive`.
- Zusätzlich gibt es Hard-Checkpoint nach Step 3 (`src/store/runStore.ts:3137-3143` und `3236-3242`).

## Interaktion mit Archiv-Fehler
- Wenn `invoice-lines.json`/`metadata.json` fehlschlagen, ist `requiredOk=false` (`src/services/archiveService.ts:517-520`).
- Dann wird `cleanupBrowserData()` **nicht** ausgeführt (`src/services/archiveService.ts:523-527`).
- Somit werden lokale Browser-Daten in diesem Fehlerfall nicht aggressiv gelöscht.
- Selbst bei erfolgreichem Archiv-Cleanup wird nur `fileStorageService` (Upload-Dateien DB `falmec-receiptpro-files`) geleert (`src/services/archiveService.ts:559-562`, `src/services/fileStorageService.ts:10-12`), nicht die Run-Persistenz-DB.

## Fazit (messerscharf)
- Der gemeldete WARN mit `invoice-lines.json, metadata.json` bedeutet: **kritischer Festplatten-Archivsync fehlgeschlagen**.
- Aus Code-Sicht ist der wahrscheinlichste Treiber: **fehlender/ungültiger FS-Handle bzw. nicht-`granted` Permission beim Auto-Save**.
- Der Fehlerpfad im `fileSystemService` korrumpiert **nicht** den separaten IndexedDB-Run-Save (`runPersistenceService`).
- Datenverlust "komplett weg" ist anhand des Codes nicht der Primärmodus; primär betroffen ist der Disk-Sync in `/.Archiv/...`.

## Antwort auf den Auftrag (1-4) in einem Satz je Punkt
- 1: `archiveService.ts` orchestriert die Archiv-Dateien; `fileSystemService.ts` gate-kept jede Datei über Permission + Handle.
- 2: Beide Dateien laufen über `writeArchivePackage -> saveToArchive`; bei `false` werden sie jeweils in `failedFiles` eingetragen.
- 3: Sie fallen beim Auto-Save aus, wenn `checkPermission()`/Handle nicht passt; User-Activation ist im Auto-Pfad nicht aktiv nachgefordert.
- 4: IndexedDB-Run-Persistenz läuft separat weiter; FS-Archivfehler blockiert diesen Save-Pfad nicht.
