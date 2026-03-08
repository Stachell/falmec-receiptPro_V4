# Archiv/Speicher Diagnostic

## Info-Passage (User-Prompt)
"Ich brauche dich als Detektiv / Schnueffler, du erstellst keinen Code.
Deine Aufgabe ist es die in den Einstellungen > Speicher / Cache > die Funktion des Buttons zu analysieren und einen Bericht zu erstellen ob diese funktional ist und welche Dateien in welcher Art gespeichert werden als Aufgabe 1. Als Aufgabe 2 wertest du aus, ob bei Auswahl des Datenverzeichnises die Moeglichkeit besteht, dass falls ein Datenverzeichnis gewaehlt wird in dem eine fuer das System bekannte Ordnerstruktur vorhanden ist so dass er ggf. die Datein im lokal gepeicherten Archiv wieder einlesen kann. Speichere den Bericht lokal ab, erstelle dazu im Ordner \"features\" die .md-Datei \"Archiv-Speicher_diagnostic.md.\" Danke."

Zusatz:
"bitte ebenfalls meinen Prompt also Info-Passage in die Datei ... damit dein Bericht besser nachvollziehbar ist."

## Methodik
- Statische Code-Analyse (kein Runtime-Clicktest im Browser).
- Fokusdateien: `SettingsPopup.tsx`, `AppFooter.tsx`, `fileSystemService.ts`, `archiveService.ts`, `runStore.ts`, `runPersistenceService.ts`.

## Aufgabe 1: Funktion des Buttons "Speicher / Cache leeren" + Speicherarten

### 1) Ist der Button funktional?
Befund: **Ja, technisch funktional**.

Ablauf:
1. Klick auf `Speicher / Cache leeren` oeffnet Confirm-Dialog (`src/components/SettingsPopup.tsx:563`, `:1060-1077`).
2. Bestaetigung `Leeren` ruft `handleClearCache()` auf (`src/components/SettingsPopup.tsx:417`).
3. Handler fuehrt `localStorage.clear()` aus und reloadet die Seite nach 800ms (`src/components/SettingsPopup.tsx:420-423`).

### 2) Was wird dadurch wirklich geloescht?
Nur **localStorage**.

Typische betroffene Keys (aus dem Code):
- `falmec-data-path` (`src/services/fileSystemService.ts:11,33,38`)
- `falmec-uploaded-files`, `falmec-parsed-invoice` (`src/store/runStore.ts:64,67,80,96,111,116`)
- `falmec-system-log`, `falmec-run-log-*`, `falmec-log-snapshots` (`src/services/logService.ts:20-22,120-144`)
- `falmec-archive-runs`, `falmec-archive-file-*` (`src/services/archiveService.ts:38-39,64,155,236`)
- Export-Config Keys `exportColumnConfig`, `exportDiagnostics`, `exportCsvDelimiter` (`src/store/exportConfigStore.ts:11-13,52,71,80,114,123,129`)
- `falmec-master-data-meta` (`src/store/masterDataStore.ts:73,83,92`)

### 3) Was wird **nicht** geloescht?
- **IndexedDB bleibt bestehen**, z.B.:
- `falmec-receiptpro-files` (`src/services/fileStorageService.ts:12`)
- `falmec-receiptpro-runs` (`src/services/runPersistenceService.ts:27`)
- `falmec-master-data` (`src/store/masterDataStore.ts:22`)
- **Dateisystem (Datenverzeichnis) bleibt bestehen**.

Hinweis zur UX-Formulierung:
- Der Dialogtext sagt, Runs/Einstellungen/Protokolle gehen verloren (`src/components/SettingsPopup.tsx:1065`).
- Faktisch werden nur localStorage-Daten geloescht; persistierte Runs in IndexedDB koennen danach weiterhin vorhanden sein und wieder geladen werden (`src/store/runStore.ts:3275-3283`, `src/pages/Index.tsx:122-133`).

### 4) Welche Dateien werden wo und wie gespeichert?

#### A) Im gewaehlten Datenverzeichnis (File System Access API)
Ordnerstruktur:
- `<Auswahlordner>/falmec receiptPro/.Archiv`
- `<Auswahlordner>/falmec receiptPro/.logs`

Erzeugung: `src/services/fileSystemService.ts:6-9,102-112`.

Archivpaket je Run in `.Archiv/<folderName>/` (`src/services/archiveService.ts:351-520`):
- `run-log.json` (wenn vorhanden)
- `invoice-lines.json`
- Original-Rechnungsdatei (PDF-Dateiname wie Upload)
- optional `export.xml`
- optional `export.csv`
- optional `serial-data.json`
- optional `run-report.json`
- `metadata.json`

Logs auf Platte:
- Logdateien in `.logs` ueber `saveLogFile`/`saveRunLog` (`src/services/fileSystemService.ts:228-255`, `:307-310`).

Root-JSON im Datenordner (nicht in `.Archiv`):
- `parser-registry.json` (`src/services/parserRegistryService.ts:35,78,94`)
- `matcher-registry.json` (`src/services/matcherRegistryService.ts:30,60,74`)

#### B) Browser-Speicher
- localStorage: Konfiguration, Logs, Archiv-Index, leichte Metadaten.
- IndexedDB: groessere Nutzdaten (Dateibinaerdaten, persistierte Runs, Artikelstamm).

## Aufgabe 2: Kann bei Auswahl eines Datenverzeichnisses ein vorhandenes lokales Archiv wieder eingelesen werden?

Befund: **Aktuell nein (nicht implementiert fuer Run-Archive)**.

### Belege
1. Bei Verzeichniswahl wird Struktur erstellt/geoeffnet, aber kein Archiv-Scan ausgefuehrt:
- `selectDirectory()` -> `createFolderStructure()` (`src/services/fileSystemService.ts:48-79`, `:102-127`).

2. Es existiert keine Funktion, die `.Archiv`-Unterordner iteriert und `metadata.json`/`invoice-lines.json` zurueck in den App-State importiert.
- `fileSystemService` hat Schreibpfade (`saveToArchive`) und nur generisches `readJsonFile` im Root (`src/services/fileSystemService.ts:183-226`, `:380-390`), aber kein Archive-Importflow.

3. Dashboard/Archivansicht liest aus Browserpersistenz, nicht aus Disk-Archiv:
- Persisted Runs aus IndexedDB (`src/store/runStore.ts:3275-3283`, `src/pages/Index.tsx:122-133`)
- Archive-Detail aus `archiveService.getArchivedRun()` (localStorage-basiert) (`src/pages/Index.tsx:178-180`, `src/services/archiveService.ts:61-84`).

4. `runPersistenceService.exportToDirectory()` exportiert nur auf Platte; es gibt keine Gegenfunktion `importFromDirectory` (`src/services/runPersistenceService.ts:351-420`).

### Einschraenkung / Teilaspekt
- Bereits vorhandene Ordnerstruktur wird beim Auswaehlen nicht zerstoert; neue Archive koennen in dieselbe Struktur geschrieben werden (inkl. Duplicate-Suffix `_vN`, `src/services/archiveService.ts:315-341`).
- Das ist aber **kein** Wiedereinlesen bestehender Archivlaeufe in die UI.

## Kurzfazit
- Aufgabe 1: Button ist funktional, loescht aber nur localStorage (nicht IndexedDB, nicht Dateisystem).
- Aufgabe 2: Automatisches Wieder-Einlesen vorhandener lokaler Archivstruktur nach Datenverzeichnis-Auswahl ist derzeit nicht implementiert.

## Ergaenzung: Relevante Projektdateien in `features` (fuer ADD-ON)

### A) Punkt 1 (Speicher/Cache-Button + Datenverzeichnis-UI)
- `features/PROJ-27-site-settings-einstellungen.md`
  - Reiter `Speicher/Cache` Umbenennung und Struktur (`P3`, `P11`).
  - Platzierung `Archiv synchronisieren` im Reiter `Speicher/Cache` (`P4`).
  - Datenverzeichnis-UI/Styling, Logik unveraendert (`P18`, `P19`, `P27`).
- `features/PROJ-22-23-MASTERPLAN.md`
  - Frontend-Paket mit `SettingsPopup` und `Speicher/Cache leeren` in B4.

### B) Punkt 2 (Archiv/Dateisystem/Persistenz)
- `features/PROJ-12-Advanced-Logging.md`
  - Zielbild Archivpaket (`/.Archiv/...`), Dateiliste, Cleanup-Regeln.
  - Definiert, was nach Archivierung wohin wandert (localStorage -> Disk).
- `features/PROJ-22-23-MASTERPLAN.md`
  - Phase A2: IndexedDB-Persistenz + `runPersistenceService` als Basis fuer Load/Hydration.
- `features/PROJ-40_IndexedDB_Architekturplan.md`
  - Rehydrierungspfade und Persistenzfelder fuer stabile Run-Wiederherstellung.
- `features/PROJ-15-run-detail-fixes.md`
  - `archivePath` im Run + Link auf Archiv-Unterordner (Explorer-Bridge).
- `features/INDEX.md`
  - Status/Einordnung von PROJ-12/23/27 als Referenz fuer Scope und Abhaengigkeiten.

## Finaler ADD-ON-Plan (gespeichert)

### Ziel
ADD-ON fuer zwei Luecken:
1. Speicher/Cache-Clear differenzieren (nicht nur globales `localStorage.clear()`).
2. Bestehende Disk-Archive bei Datenverzeichnis-Auswahl erkennbar machen und optional importieren.

### Vorschlag Add-on Name
- `PROJ-43-ADD-ON: Archiv-Import + Speicher-Reset 2.0`

### Umsetzung in 5 Schritten
1. Scope-Fix im Settings-Tab (aufbauend auf PROJ-27)
- Ersetze harte Global-Loeschung durch selektive Aktionen:
- `Nur localStorage`
- `Nur IndexedDB-Runs`
- `Nur Upload-Dateien`
- `Alles zuruecksetzen`
- Ergebnis: keine unbeabsichtigte Inkonsistenz zwischen LocalStorage und IndexedDB.

2. Datenverzeichnis-Analyse beim Auswaehlen (aufbauend auf PROJ-12/PROJ-9)
- Nach `selectDirectory()` pruefen:
- Existiert `falmec receiptPro/.Archiv`?
- Existieren bekannte Archiv-Unterordner mit `metadata.json`?
- UI-Hinweis: `X Archive erkannt` direkt am Datenverzeichnis-Feld oder in Settings.

3. Disk-Archiv-Import-Service (neu, aufbauend auf PROJ-23 A2)
- Neuer Importpfad: liest `metadata.json` (+ optional `invoice-lines.json`) aus `.Archiv/*`.
- Erzeugt daraus `PersistedRunSummary`-kompatible Eintraege fuer Dashboard.
- Wichtig: read-only Import (keine Veraenderung der Original-Archive).

4. Dashboard-Integration (aufbauend auf PROJ-23/Index-Flow)
- In Archivliste unterscheiden:
- `IndexedDB-Runs`
- `Disk-Archiv (importiert)`
- Aktion `In Lauf laden` nur wenn genug Daten vorhanden sind; sonst `Nur ansehen`.

5. QA/Abnahmekriterien
- AC1: Nach Datenverzeichnis-Wechsel mit vorhandener Struktur werden Archive erkannt.
- AC2: Kein Datenverlust bei Cache-Clear (jede Option loescht nur ihren Scope).
- AC3: Archiv-Import funktioniert ohne bestehende localStorage-Archivindizes.
- AC4: Reload stabil: importierte Archiv-Referenzen bleiben sichtbar (ueber Persistenzstrategie festlegen).

### Reihenfolge fuer Start (empfohlen)
1. `PROJ-27-site-settings-einstellungen.md` (UI-Einstiegspunkt)
2. `PROJ-12-Advanced-Logging.md` (Archivmodell/Cleanup-Regeln)
3. `PROJ-22-23-MASTERPLAN.md` + `PROJ-40_IndexedDB_Architekturplan.md` (Persistenz/Load-Pfade)
4. Danach Implementierungs-ADD-ON als eigenes Feature-Dokument anlegen.
