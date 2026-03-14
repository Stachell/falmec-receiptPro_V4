# PROJ-46 - NEW RUN KLICK-TO-MIND Diagnostic

Datum: 2026-03-14
Scope: Read-only Architektur-Analyse (kein Code).

## 1) Sperr-System (Button-Enable/Disable) und sichere OR-Einhaengung

Aktuelle Logik:
- Der Start-Button auf der New-Run-Seite ist aktuell an `allFilesUploaded` gekoppelt:
  - `allFilesUploaded = invoiceFile && openWEFile && serialListFile && articleListFile`
  - Quelle: `src/pages/NewRun.tsx:31-37`
- Der eigentliche Disable-Guard lautet:
  - `disabled={!allFilesUploaded || isLocked('start')}`
  - Quelle: `src/pages/NewRun.tsx:217`
- `isLocked('start')` kommt aus `useClickLock` (Mehrfachklick-Sperre mit Timeout), nicht aus Upload-Validitaet:
  - Quelle: `src/hooks/useClickLock.ts:14-15, 25-35, 40-42`
- Hinweis: `canStartProcessing` prueft zusaetzlich nur das Datenverzeichnis, wird aber nicht im `disabled` verwendet, sondern nur fuer Hinweistexte:
  - Berechnung: `src/pages/NewRun.tsx:39`
  - UI-Hinweis: `src/pages/NewRun.tsx:206-211`

Wichtig fuer dein Zielbild:
- Es gibt aktuell keine Trennung in `isFreshlyUploaded` vs. `isRestoredAndGreen`.
- Beide Faelle landen identisch in `uploadedFiles`.
  - NewRun laedt beim Mount: `src/pages/NewRun.tsx:41-50`
  - Store-Hydration: `src/store/runStore.ts:744-757`

Sicherste OR-Strategie (ohne alte Logik zu zerstoeren):
- Alte Bedingung als Branch A unveraendert lassen (`allFilesUploaded`).
- Neuen Branch B als explizites Derived Flag addieren (`isRestoredAndGreen`).
- Finales Gate nur auf UI-Ebene zusammensetzen: `isStartEligible = branchA || branchB`.
- Danach nur den Button-Guard und optional den Hint-Text auf `isStartEligible` umstellen.
- Vorteil: Keine invasive Aenderung in `runStore`/Parsing-Pipeline, keine Regression der bisherigen Upload-Checks.

Ergaenzender Fund zur "gruen"-Semantik:
- Die Gruen-Logik existiert heute in der Sidebar als Upload-Ampel (`ready/missing/warning/critical`) auf Basis von `uploadedAt`.
  - Farbzuordnung: `src/components/AppSidebar.tsx:24-29`
  - Statusberechnung: `src/components/AppSidebar.tsx:58-82`
  - Verwendung pro Upload-Modul: `src/components/AppSidebar.tsx:173-229`
- Empfehlung fuer Konsistenz: Diese Semantik nicht neu erfinden, sondern zentral wiederverwenden.

## 2) Datei-Speicher: Wo liegen Handles/Metadaten (inkl. Dateigroesse)?

Kurzantwort:
- Upload-Dateien werden aktuell nicht als File Handles gespeichert, sondern als Binary (ArrayBuffer) in IndexedDB.
- Dateigroesse ist mehrfach vorhanden (IndexedDB + localStorage-Metadaten + run autosave metadata).

A) Primaerer Upload-Speicher (IndexedDB, mit Binary)
- DB: `falmec-receiptpro-files`, Store: `uploadedFiles` (keyPath `type`)
  - Quelle: `src/services/fileStorageService.ts:12-14, 49`
- Persistiertes Objekt `StoredFile`:
  - `{ type, name, size, mimeType, data:ArrayBuffer, uploadedAt }`
  - Quelle: `src/services/fileStorageService.ts:19-26`
- Speichern:
  - Quelle: `src/services/fileStorageService.ts:69-76, 79-82`
- Laden/Hydrieren:
  - Rekonstruktion `File` aus `Blob` und Rueckgabe als `UploadedFile`
  - Quelle: `src/services/fileStorageService.ts:175-189`

B) Zusatz-Metadaten in localStorage
- Key: `falmec-uploaded-files`
  - Quelle: `src/store/runStore.ts:64`
- Format (ohne Binary): `{ name, size, type, uploadedAt }[]`
  - Quelle: `src/store/runStore.ts:69-75, 89-94, 96`
- Wird bei Add/Remove/Load synchronisiert:
  - Quelle: `src/store/runStore.ts:712, 727, 756`

C) Run-Persistenz-Metadaten (AutoSave)
- In runPersistence: `uploadMetadata[]` mit `{ type, name, size, uploadedAt }`
  - Typdefinition: `src/services/runPersistenceService.ts:46, 54-59`
  - Payload-Build: `src/hooks/buildAutoSavePayload.ts:48-50`

D) Zu "File Handle" konkret
- Fuer Upload-Dateien existiert aktuell kein persistiertes `FileSystemFileHandle`.
- Im Dateisystem-Service gibt es nur Directory-Handle-Logik fuer Archiv/Logs.
  - In-memory Handle-Feld: `src/services/fileSystemService.ts:23-24`
  - `DIRECTORY_HANDLE_KEY` ist zwar deklariert, aber im Code nicht verwendet.
  - Deklaration: `src/services/fileSystemService.ts:12`

## 3) Start-Trigger: exakter Einsprungpunkt fuer verify/request Permission

Aktuelle Trigger-Kette:
- Button klickt `wrap('start', handleStartProcessing)`.
  - Quelle: `src/pages/NewRun.tsx:218`
- `handleStartProcessing()` macht:
  1. Verzeichnis-Guard (`dirConfigured`), ggf. Dialog.
     - Quelle: `src/pages/NewRun.tsx:59-63`
  2. Fire-and-forget `ensureFolderStructure()`.
     - Quelle: `src/pages/NewRun.tsx:67-72`
  3. Start via `createNewRunWithParsing()`.
     - Quelle: `src/pages/NewRun.tsx:75`
- Alternativpfad (Dialog-Action) startet ebenfalls direkt:
  - `handleSelectDirectory()` -> `createNewRunWithParsing()`
  - Quelle: `src/pages/NewRun.tsx:87-93, 242`

Store-Einstieg danach:
- `createNewRunWithParsing` in `runStore`.
  - Quelle: `src/store/runStore.ts:841`
- Parsing nutzt `uploadedFiles.find(type==='invoice')` und braucht `invoiceFile.file`.
  - Quelle: `src/store/runStore.ts:846-847, 907-910, 1135-1137`

Sicherster Einsprungpunkt fuer deine Permission-Vorschaltung:
- Primaer in `handleStartProcessing`, direkt nach dem Verzeichnis-Guard und vor `ensureFolderStructure()/createNewRunWithParsing`.
  - Konkret zwischen `src/pages/NewRun.tsx:65` und `:67`.
- Zwingend denselben Guard auch im Dialogpfad vor `createNewRunWithParsing` setzen.
  - Konkret vor `src/pages/NewRun.tsx:93`.
- Begruendung:
  - Vor `createNewRunWithParsing` gibt es noch keine Run-Erzeugung/Navigation/Side-Effects.
  - Permission-Fehler oder Groessen-Mismatch koennen sauber abgefangen werden, bevor ein halber Run entsteht.

Zusatzbefund:
- Es gibt bereits `checkPermission()`/`requestPermission()` fuer Directory-Handles (Archiv), nicht fuer Upload-Dateien.
  - `checkPermission`: `src/services/fileSystemService.ts:295-305`
  - `requestPermission`: `src/services/fileSystemService.ts:412-430`
- Eine Upload-Handle-Permissionpruefung (`verifyPermission/requestPermission` auf FileHandle) ist im aktuellen Stand noch nicht vorhanden.

## Kurze Einschaetzung

Machbarkeit: hoch, wenn die OR-Logik strikt als additive UI-Gate-Erweiterung umgesetzt wird und die Permission-Vorschaltung zentral vor dem Store-Start liegt.

Haupt-Risiko: Der aktuelle Zustand kennt keine harte Provenienz (`fresh` vs. `restored`) im `uploadedFiles`-Modell. Ohne ein klares Herkunfts-Flag ist "OR mit Gruen" semantisch unscharf und kann zu False-Positives fuehren.
