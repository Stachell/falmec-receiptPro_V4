# INDEXED / ARCHIV BERICHT (26.02.2026)

## Ziel und Rahmen
Dieser Bericht analysiert die IST-Struktur fuer Persistenz und Archivierung im Projekt `falmec receiptPro`.
Fokus:
- Welche Daten wann in die INDEX-Persistenz geschrieben werden.
- Welche Daten wann wieder geladen werden.
- Warum Runs nachtraeglich teils nicht vollstaendig oeffnen.
- Gesonderte Analyse der lokalen Archiv-Speicherung.

Hinweis zur Begrifflichkeit:
- Im Code gibt es keine einzelne "INDEX-Datei" fuer Run-Daten.
- Es gibt eine INDEX-Seite (`src/pages/Index.tsx`) und mehrere Speicher-Layer (IndexedDB, localStorage, Dateisystem).

## Quellenbasis (Code)
- `src/hooks/useRunAutoSave.ts`
- `src/services/runPersistenceService.ts`
- `src/store/runStore.ts`
- `src/pages/Index.tsx`
- `src/pages/RunDetail.tsx`
- `src/pages/NewRun.tsx`
- `src/services/archiveService.ts`
- `src/services/fileStorageService.ts`
- `src/services/fileSystemService.ts`
- `src/services/logService.ts`
- `src/types/index.ts`

---

## TEIL A: INDEX / RUN-PERSISTENZ

## A1. Speicherorte und Datenstruktur

### A1.1 IndexedDB: Run-Persistenz (INDEX-DB)
- DB: `falmec-receiptpro-runs` (`src/services/runPersistenceService.ts:24`)
- Stores:
  - `runs` (`keyPath: id`) (`src/services/runPersistenceService.ts:26,81`)
  - `metadata` (`keyPath: key`) (`src/services/runPersistenceService.ts:27,86-88`)
- Persistierter Datensatz je Run (`PersistedRunData`):
  - `id`, `run`, `invoiceLines`, `issues`, `auditLog`, `parsedPositions`, `parserWarnings`, `savedAt`, `sizeEstimateBytes`
  - Quelle: `src/services/runPersistenceService.ts:31-41`

### A1.2 IndexedDB: Upload-Dateien
- DB: `falmec-receiptpro-files` (`src/services/fileStorageService.ts:12`)
- Store: `uploadedFiles` (`src/services/fileStorageService.ts:14`)
- Key: Dateityp (`invoice|openWE|serialList|articleList`) (`src/services/fileStorageService.ts:20,49`)

### A1.3 localStorage (run-relevante Keys)
- `falmec-uploaded-files` (nur Metadaten) (`src/store/runStore.ts:63,87-96`)
- `falmec-parsed-invoice` (globaler Parser-Cache) (`src/store/runStore.ts:66,107-133`)
- `falmec-run-log-*` pro Run (`src/services/logService.ts:21,120-126`)
- `falmec-system-log`, `falmec-log-snapshots` (`src/services/logService.ts:20-23`)

## A2. Schreibzeitpunkte in die INDEX-Persistenz

### A2.1 Auto-Save Trigger
- Hook `useRunAutoSave()` wird global in `App.tsx` aktiviert (`src/App.tsx:19`).
- Debounce: 2000 ms (`src/hooks/useRunAutoSave.ts:16,47,70`).
- Speichert nur wenn sich relevante Run-Daten geaendert haben (`currentRun`, `invoiceLines`, `issues`, `auditLog`) (`src/hooks/useRunAutoSave.ts:31-39`).

### A2.2 Was pro Save geschrieben wird
- Pro aktivem `currentRun` wird gespeichert:
  - `run`
  - `invoiceLines` gefiltert auf Run-ID-Praefix `${runId}-line-`
  - `issues` gefiltert auf `issue.runId === runId`
  - `auditLog` gefiltert auf `audit.runId === runId`
  - globale `parsedPositions`
  - globale `parserWarnings`
- Quelle: `src/hooks/useRunAutoSave.ts:51-67`

### A2.3 Wann konkret gespeichert wird (Lifecycle)
- Nach `createNewRunWithParsing` sofort, sobald Zustand sich aendert (`src/store/runStore.ts:819-824` + AutoSave Hook).
- Nach jeder Step-Aenderung (Step 1-5), da `run`, `issues` und `invoiceLines` laufend mutieren.
- Nach `archivePath`-Setzung bei erfolgreichem Archiv (`src/store/runStore.ts:1967-1977`).

## A3. Lesezeitpunkte aus der INDEX-Persistenz

### A3.1 Uebersicht (Summaries)
- Beim Mount der Index-Seite: `loadPersistedRunList()` (`src/pages/Index.tsx:125-128`).
- Quelle in Store: `runPersistenceService.loadRunList()` (`src/store/runStore.ts:3029-3033`).

### A3.2 Voller Run-Datensatz
- Nur bei Klick auf "oeffnen" fuer persisted-only Zeile:
  - `handleOpenPersistedRun()` -> `loadPersistedRun(runId)` -> Navigation (`src/pages/Index.tsx:207-212,421-429`).
- `loadPersistedRun` merged Run, Lines, Issues, Audit in den Store (`src/store/runStore.ts:2985-3018`).

## A4. Datenkarte: Wann wird was geschrieben / gelesen

| Zeitpunkt | Aktion | Schreiben | Lesen |
|---|---|---|---|
| App-Start | Hook init | kein direkter Run-Write | AutoSave-Hook aktiv (`src/App.tsx:19`) |
| NewRun-Page Mount | Load Uploads | optional `falmec-uploaded-files` Meta refresh | `fileStorageService.loadAllFiles()` (`src/pages/NewRun.tsx:48-50`) |
| Upload Datei | addUploadedFile | IndexedDB `uploadedFiles`, localStorage `falmec-uploaded-files` | - |
| Run-Start | createNewRunWithParsing | `runs/currentRun` im Zustand | - |
| Parse Step 1 | setParsedInvoiceResult | localStorage `falmec-parsed-invoice`, Store parsedPositions/parserWarnings | localStorage parse cache beim App-Start |
| Laufende Steps | Matching/Issues/Lines Aenderung | IndexedDB `falmec-receiptpro-runs.runs` (debounced AutoSave) | - |
| Index-Page | Persisted Liste anzeigen | - | `loadRunList()` aus IndexedDB |
| Persisted Run oeffnen | Run laden | Store wird mit geladenen Daten gemerged | `loadRun(runId)` aus IndexedDB |
| Run-Ende + Archiv | `archivePath` in Run | AutoSave persistiert spaeter aktualisierten Run | - |

## A5. Hauptbefunde (Ursachen fuer "Run nicht vollstaendig oeffnbar")

### Befund A (kritisch): `parsedInvoiceResult` wird nicht pro Run persistiert
- Persistiert werden nur `parsedPositions` + `parserWarnings`, nicht `parsedInvoiceResult`.
  - Save: `src/hooks/useRunAutoSave.ts:59-67`
  - Schema: `src/services/runPersistenceService.ts:31-41`
- `RunDetail` zeigt die Rechnungsansicht nur, wenn `parsedInvoiceResult` vorhanden ist (`src/pages/RunDetail.tsx:774-799`).
- Folge: Run kann geladen sein, aber RE-Preview bleibt leer.

### Befund B (kritisch): `parsedPositions/parserWarnings` sind global statt run-scoped
- Im Store existieren diese Felder nur einmal global (`src/store/runStore.ts:493-494`).
- Beim Run-Wechsel in `RunDetail` wird nur `currentRun` gesetzt, keine run-spezifische Rehydrierung dieser Parserdaten (`src/pages/RunDetail.tsx:262-269`).
- Folge: Parserdaten koennen run-fremd sein und bei AutoSave in falschen Run geschrieben werden.

### Befund C (hoch): Direktaufruf `/run/:id` laedt Persisted Run nicht
- `RunDetail` sucht nur in `runs` (plus `mockRuns`) (`src/pages/RunDetail.tsx:264`).
- Kein automatischer Fallback auf `loadPersistedRun`.
- Folge: Nach Reload auf Detail-URL oft "Lauf nicht gefunden" (`src/pages/RunDetail.tsx:383-404`).

### Befund D (hoch): Run-ID-Rename erzeugt moegliche Alt-Eintraege in IndexedDB
- Run startet mit `run-<timestamp>` (`src/store/runStore.ts:780,785`) und wird spaeter auf Fattura-ID umbenannt (`src/store/runStore.ts:848-876`).
- AutoSave kann vor Rename bereits alten Datensatz schreiben (2s Debounce).
- Kein explizites Delete der alten ID in `runPersistenceService`.
- Folge: Duplikate / halbfertige Runs in Persisted-Liste moeglich.

### Befund E (mittel): Dashboard-Delete loescht Persisted Run nicht
- `deleteRun` entfernt nur In-Memory + local archive (`src/store/runStore.ts:1760-1768`).
- Kein `runPersistenceService.deleteRun` in diesem Flow.
- Folge: Persisted-only Eintraege bleiben erhalten.

### Befund F (mittel): Prefix-Filter teilweise unscharf (`startsWith(runId)`)
- Mehrfach genutzt z.B. `archiveRun` Lines-Filter (`src/store/runStore.ts:1961`) und `RunDetail` line filter (`src/pages/RunDetail.tsx:72`).
- Risiko bei IDs mit gleichem Prefix.

## A6. Zusatzbeobachtungen zur INDEX-Persistenz
- `loadPersistedFiles()` ist definiert, aber nicht verwendet (`src/store/runStore.ts:77`).
- Store `metadata` in `falmec-receiptpro-runs` wird erstellt, aber nicht genutzt (`src/services/runPersistenceService.ts:27,86-88`).

---

## TEIL B: GESONDERTER BERICHT LOKALES ARCHIV

## B1. Zwei Archiv-Systeme parallel

### B1.1 Virtuelles Archiv in localStorage
- Key: `falmec-archive-runs` (`src/services/archiveService.ts:38,64`)
- Dateibloecke: `falmec-archive-file-*` (`src/services/archiveService.ts:39,155-157`)
- Nutzung in UI: `ArchiveDetailDialog` ueber `archiveService.getArchivedRun()` (`src/pages/Index.tsx:168-170`, `src/components/ArchiveDetailDialog.tsx`).

### B1.2 Physisches Archiv auf Dateisystem (`falmec receiptPro/.Archiv/...`)
- Schreiben ueber `archiveService.writeArchivePackage()` (`src/services/archiveService.ts:350-520`)
- Dateioperationen ueber `fileSystemService.saveToArchive()` (`src/services/fileSystemService.ts:183-225`)

## B2. Was wird wann ins lokale Archiv geschrieben

### B2.1 Virtuelles Archiv (localStorage)
- Beim Run-Start/Parse-Ende wird `createArchiveEntry(...)` aufgerufen (`src/store/runStore.ts:740-745`, `971-976`).
- Enthalten: Ordner `00_Uploads`, Konfig-Metadaten, Dateimetadaten.
- Dateiinhalt wird nur fuer Dateien <1MB als DataURL gespeichert (`src/services/archiveService.ts:152-159`).

### B2.2 Dateisystem-Archiv (Disk)
Beim Abschluss oder Abbruch (`archiveRun`) wird geschrieben:
- `run-log.json` (`src/services/archiveService.ts:367-375`)
- `invoice-lines.json` (`src/services/archiveService.ts:377-381`)
- Original-PDF aus IndexedDB (`src/services/archiveService.ts:383-397`)
- optional `export.xml`, `export.csv` (`src/services/archiveService.ts:399-418`)
- optional `serial-data.json` (`src/services/archiveService.ts:421-432`)
- optional `run-report.json` (`src/services/archiveService.ts:434-462`)
- `metadata.json` (`src/services/archiveService.ts:464-501`)

## B3. Was wird wann aus lokalem Archiv gelesen

### B3.1 Virtuelles Archiv
- Index-Dialog: `getArchivedRun(run.id)` (`src/pages/Index.tsx:168-170`).
- Datei-Download in Dialog ueber localStorage-Dateibloecke (`src/services/archiveService.ts:234-267`).

### B3.2 Dateisystem-Archiv
- Kein generischer Reader im Dashboard fuer `.Archiv`-Inhalt.
- Es gibt nur einen Link-Call `fetch('/api/dev/open-folder...')` in OverviewPanel (`src/components/run-detail/OverviewPanel.tsx:137-142`).

## B4. Kritische Archiv-Befunde

### Befund G (kritisch): Erfolgreiches Archiv entfernt virtuelles Archiv wieder
- Nach erfolgreichem `writeArchivePackage` ruft Service `cleanupBrowserData` auf (`src/services/archiveService.ts:507-509`).
- Dabei wird `falmec-archive-runs`-Eintrag des Runs entfernt (`src/services/archiveService.ts:528-538`).
- Folge: ArchiveDetailDialog findet haeufig keinen Eintrag mehr.

### Befund H (hoch): Ohne aktiven Directory-Handle scheitert Dateisystem-Archiv
- `saveToArchive` verlangt `checkPermission()` (`src/services/fileSystemService.ts:188-191,295-304`).
- Nach Reload ist Handle i.d.R. weg, obwohl Pfad in localStorage bleibt (`src/services/fileSystemService.ts:31-39,146-149`).
- NewRun laesst Start dennoch zu, wenn nur Pfad gesetzt ist (`src/pages/NewRun.tsx:39,57-63`).
- Folge: Run laeuft, Archiv-Write kann komplett fehlschlagen.

### Befund I (hoch): Virtuelles Archiv speichert grosse Upload-Dateien nicht
- `addFileToFolder` speichert Daten nur bei `< 1MB` (`src/services/archiveService.ts:152-159`).
- Folge: Download aus ArchiveDetailDialog fuer grosse Dateien nicht moeglich.

### Befund J (mittel): Doppelter Run-Log-Write in zwei Ordnerstrukturen
- `writeArchivePackage` schreibt `run-log.json` unter `folderName` (`src/services/archiveService.ts:367-373`).
- Danach `logService.exportRunLog` schreibt erneut nach `.Archiv/<runId>/run-log.json` (`src/services/logService.ts:295-317`, `src/services/fileSystemService.ts:308-309`).
- Folge: Inkonsistente Ablage (folderName vs runId).

### Befund K (mittel): `ArchiveMetadata.status` kennt `aborted`, Mapping liefert es nie
- Typ: `completed|aborted|failed` (`src/types/index.ts:460`).
- Mapping: nur `completed` oder `failed` (`src/services/archiveService.ts:345-348`).

### Befund L (niedrig): Legacy-Archivfunktionen ungenutzt
- `createStepFolder`, `addDataToStepFolder`, `updateRunStatus` im ArchiveService sind im aktuellen RunFlow nicht angebunden.

---

## C. Fundament fuer Anpassungen (Priorisiert)

## Prioritaet 1 (sofort)
1. Run-spezifische Persistenz fuer Invoice-Preview vervollstaendigen.
2. `RunDetail` bei URL-Aufruf um Persisted-Fallback erweitern.
3. Beim Run-ID-Rename alten Persisted-Datensatz explizit bereinigen.

## Prioritaet 2
1. Parserdaten (`parsedInvoiceResult/positions/warnings`) run-scoped machen.
2. Delete-Flow vereinheitlichen: Dashboard-Delete inkl. Persisted-Delete.
3. Prefix-Filter auf strenges `${runId}-line-` normalisieren.

## Prioritaet 3
1. Archiv-Permission-Flow robust machen (Handle-Reacquire vor Archiv-Write).
2. Virtuelles Archiv-Konzept klaeren: entweder bewusst ephemer oder dauerhaft fuer UI.
3. Log-Ablage auf ein konsistentes Ziel vereinheitlichen.

---

## D. Kurzfazit
Die aktuelle Architektur speichert bereits viele Kerninformationen korrekt, aber sie mischt run-spezifische und globale Zustandsdaten in kritischen Pfaden.
Das fuehrt dazu, dass ein Run zwar in der INDEX-Persistenz existiert, beim spaeteren Oeffnen aber nicht vollstaendig rekonstruierbar ist.
Besonders relevant sind die fehlende Persistenz von `parsedInvoiceResult`, die globale Parserdatenhaltung und der fehlende Persisted-Fallback in `RunDetail`.

Im lokalen Archiv bestehen zusaetzlich zwei parallele Modelle (localStorage vs Dateisystem), die nach erfolgreichem Archivieren nicht konsistent fuer die UI verfuegbar bleiben.
