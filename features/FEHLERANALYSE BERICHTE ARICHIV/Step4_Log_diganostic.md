# Step4 Log Diagnostic

Datum: 2026-03-03  
Autor: Codex (Analyse, keine produktive Codeaenderung)

Scope:
- Run-Log-System (run-spezifisch)
- Allgemeines Log-System (Settings > Allgemein > "Logfile")

Methodik:
- Statische Code-Analyse der relevanten Pfade.
- Keine Laufzeit-Simulation im Browser und keine E2E-Tests in diesem Bericht.

---

## Teil 1 - Run-Log-System

## 1. IST-Architektur (technisch)

1. Kernservice ist `logService` mit einem einheitlichen `LogEntry`.
   - Datenmodell: `src/services/logService.ts:3-10`
   - Schreiben: `logService.log()` schreibt immer ins System-Log und zusaetzlich ins Run-Log, falls `runId` gesetzt ist: `src/services/logService.ts:51-79`
   - Keys: `falmec-system-log`, `falmec-run-log-<runId>`: `src/services/logService.ts:20-23`

2. Run-spezifische Speicherung ist zweigleisig:
   - localStorage pro Run (`falmec-run-log-<runId>`): `src/services/logService.ts:118-127`
   - In-Memory-Buffer pro aktiven Run (`runBuffers`): `src/services/logService.ts:26-27`, `src/services/logService.ts:265-273`

3. Run-Lifecycle Verdrahtung:
   - Start: `startRunLogging(runId)` in `createNewRunWithParsing`: `src/store/runStore.ts:857-858`
   - Run-ID Rename nach erfolgreichem Parsing + Buffer/Key-Rename: `src/store/runStore.ts:904-905`, `src/store/runStore.ts:935-936`, `src/services/logService.ts:275-292`
   - Export: `exportRunLog(runId)` schreibt `run-log.json`: `src/services/logService.ts:295-327`

4. UI-Pfade fuer Run-Logs:
   - Run-Detail Log-Tab (live): `src/pages/RunDetail.tsx` (Tab `value="log"`), `src/components/run-detail/RunLogTab.tsx:44-58`
   - Dashboard "Logfile oeffnen": `src/pages/Index.tsx:181-195`
   - Archiv-Dialog "Run-Log anzeigen": `src/components/ArchiveDetailDialog.tsx:83-98`

5. Persistenz-Interaktion:
   - IndexedDB Run-Persistenz speichert `auditLog`, nicht `LogEntry[]`: `src/services/runPersistenceService.ts:33-40`
   - AutoSave uebernimmt `auditLog` run-spezifisch: `src/hooks/useRunAutoSave.ts:70-79`

## 2. Funktionspruefung (IST)

| Pruefpunkt | Ergebnis | Evidenz |
|---|---|---|
| Run-Log kann live angezeigt werden | Erfuellt | `RunLogTab` pollt Buffer und faellt auf localStorage zurueck: `src/components/run-detail/RunLogTab.tsx:48-53` |
| Run-Log kann aus Dashboard geoeffnet werden | Erfuellt | `handleViewRunLog`: `src/pages/Index.tsx:181-195` |
| Run-ID-Wechsel nach Parsing verliert Logs nicht | Erfuellt | `renameRunBuffer` wird aufgerufen: `src/store/runStore.ts:904-905`, `src/store/runStore.ts:935-936` |
| Run-Log wird beim Archivieren auf Platte geschrieben | Teilweise erfuellt | `writeArchivePackage` schreibt `run-log.json`: `src/services/archiveService.ts:367-375` |
| Run-Log ist sauber mit Run-Daten im Persistenzmodell verknuepft | Nicht erfuellt | Persistenzmodell hat `auditLog`, aber kein `LogEntry[]`: `src/services/runPersistenceService.ts:33-40` |
| Audit-Trail wird aktiv befellt | Nicht erfuellt | `addAuditEntry` existiert, aber keine Aufrufe im Code: `src/store/runStore.ts:2180-2189`, Trefferanalyse |

## 3. Tiefenbefunde (Luecken)

### Befund R1 (hoch): `auditLog`-Subsystem ist de facto inaktiv

- `AuditLogEntry` ist definiert (`runId`, `action`, `details`, `userId`), wird persistiert, aber nicht befuellt.
  - Typ: `src/types/index.ts:378-385`
  - Action: `src/store/runStore.ts:2180-2189`
  - Kein Aufrufer im Repo (nur Definitionstreffer).

Auswirkung:
- Run-spezifischer Audit-Trail fuer User-Eingriffe fehlt komplett.
- Persistierte Runs enthalten praktisch kein echtes Audit.

### Befund R2 (hoch): Wichtige manuelle Eingriffe werden nicht geloggt

Betroffen:
- `setManualPrice`: `src/store/runStore.ts:2273-2304`
- `setManualOrder`: `src/store/runStore.ts:2517-2545`
- `confirmNoOrder`: `src/store/runStore.ts:2547-2572`
- `reassignOrder`: `src/store/runStore.ts:2576-2661`
- `resolveIssue` / `escalateIssue`: `src/store/runStore.ts:1851-1875`
- `updateInvoiceLine` / `updatePositionLines`: `src/store/runStore.ts:1807-1849`

Auswirkung:
- Fachlich kritische Entscheidungen sind im Run-Log nicht nachvollziehbar.
- Nachtraegliche Analyse "wer hat was wann entschieden" ist lueckenhaft.

### Befund R3 (hoch): Archiv- und Persistenz-Run-Logs sind nicht robust verfuergbar

1. `ArchiveDetailDialog` liest Run-Log aus localStorage (`mode="archive"`), nicht aus Archivdatei.
   - `src/components/ArchiveDetailDialog.tsx:97`
   - `RunLogTab archive`: `src/components/run-detail/RunLogTab.tsx:61-65`

2. Beim erfolgreichen Archivieren wird localStorage-Run-Log geloescht.
   - `src/services/archiveService.ts:523-526`

3. Gleichzeitig wird der localStorage-Archiv-Eintrag entfernt.
   - `src/services/archiveService.ts:527-538`

Auswirkung:
- Nach erfolgreichem Cleanup ist Run-Log im Dialog oft nicht mehr verfuegbar.
- Persisted-only Runs haben keine direkte Run-Log-Rehydrierung.

### Befund R4 (mittel): Doppelte/inkonsistente Run-Log-Exportpfade

1. `writeArchivePackage()` schreibt `run-log.json` in `folderName`.
   - `src/services/archiveService.ts:360-375`
2. Danach triggert `archiveRun()` zusaetzlich `logService.exportRunLog(runId)`.
   - `src/store/runStore.ts:2132-2137`
3. `exportRunLog()` schreibt in Unterordner `runId` (nicht `folderName`).
   - `src/services/fileSystemService.ts:307-310`

Auswirkung:
- Zwei moegliche `run-log.json`-Orte fuer denselben Lauf.
- Erhoehte Fehler-/Verwechslungsgefahr bei spaeterer Nachverfolgung.

### Befund R5 (mittel): Umfangreiche `console.*`-Pfadnutzung umgeht Run-Log

- Gesamtbefund: `logService`-Aufrufe = 147, `console.*`-Aufrufe = 124.
- Besonders in `runStore` (52), `matchingEngine` (5), `pdfTextExtractor` (7), `runPersistenceService` (16).

Beispiele:
- `matchingEngine` nur `console.log`: `src/services/matching/matchingEngine.ts:167-199`
- PDF-Extraction-Progress nur `console.*`: `src/services/parsers/utils/pdfTextExtractor.ts:57-62`, `95`, `112`

Auswirkung:
- Kritische Diagnosen erscheinen nicht im Run-Log (und oft auch nicht im allgemeinen Log).

### Befund R6 (mittel): Run-Log-Reihenfolge ist je nach Quelle inkonsistent

- Buffer schreibt mit `push` (alt -> neu): `src/services/logService.ts:75-78`
- localStorage schreibt mit `unshift` (neu -> alt): `src/services/logService.ts:121-123`
- `RunLogTab` zeigt Quelle ungeaendert.

Auswirkung:
- In `live` und `archive` kann dieselbe Loghistorie in umgekehrter Reihenfolge erscheinen.

## 4. Was bereits gut funktioniert

- Step-Orchestrierung ist im Run-Log grundsaetzlich gut instrumentiert (Start, Auto-Advance, Retry, Pause/Resume, Abschluss).
  - z. B. `src/store/runStore.ts:1439-1490`, `1650`, `1668`, `1897`, `1906`
- Run-ID-Rename nach Parsing wird auch fuer Logpuffer korrekt behandelt.
- Doppellogging Run -> Allgemein ist technisch bereits gegeben und sinnvoll.

## 5. Vorschlaege fuer Vervollstaendigung (Run-Log)

### Prioritaet A (zwingend)

1. `auditLog` aktiv nutzen.
   - Bei allen manuellen Eingriffen `addAuditEntry(...)` aufrufen.
   - Begruendung: persistierbarer, fachlicher Audit-Trail je Run.

2. Pflicht-Logpunkte fuer manuelle Aktionen einfuehren (Run-Log + Allgemein):
   - Preis manuell gesetzt (alt/neu, lineId, reason)
   - Bestellzuweisung manuell gesetzt/entfernt
   - `confirmNoOrder`
   - `reassignOrder` inkl. alter/neuer Beleg
   - Issue resolve/escalate inkl. Grund/Empfaenger

3. Run-Log-Verfuegbarkeit nach Archivierung stabilisieren.
   - Entweder: ArchiveDialog liest `run-log.json` aus Archivpaket.
   - Oder: Run-Log als Feld in `PersistedRunData` aufnehmen.

### Prioritaet B (soll)

4. Konsolidierung des Exportpfads.
   - Ein einziger kanonischer Speicherort fuer `run-log.json`.
   - Doppelpfad (`folderName` vs `runId`) entfernen.

5. `console.*` in kritischen Fachpfaden durch `logService` ersetzen.
   - Mindestens `matchingEngine`, `pdfTextExtractor`, zentrale `runStore`-Fehlerpfade.

6. Reihenfolge im Run-Log vereinheitlichen.
   - Entweder immer chronologisch oder immer reverse-chronologisch.

---

## Teil 2 - Allgemeiner Log

## 1. IST-Architektur (technisch)

1. Allgemeines Log = localStorage-Key `falmec-system-log`.
   - Quelle: `src/services/logService.ts:20`, `101-116`, `130-137`

2. UI-Einstieg laut Benutzerpfad:
   - Footer -> Settings -> Allgemein -> Button `Logfile`.
   - `handleShowLogfile`: `src/components/SettingsPopup.tsx:397-400`
   - UI-Button: `src/components/SettingsPopup.tsx:574-577`

3. Anzeige-Mechanik:
   - `viewLogWithSnapshot()` erzeugt Snapshot + oeffnet Text-Tab.
   - `src/services/logService.ts:193-209`, `258-261`

4. Dateisystemseite:
   - `.logs`-Ordner und `saveLogFile(...)` existieren.
   - `src/services/fileSystemService.ts:228-255`
   - Rotation am App-Start aktiv: `src/App.tsx:23-25`

## 2. Funktionspruefung (IST)

| Pruefpunkt | Ergebnis | Evidenz |
|---|---|---|
| Globales Log aus Settings oeffnbar | Erfuellt | `src/components/SettingsPopup.tsx:397-400`, `574-577` |
| Globales Log sammelt auch Run-Events | Erfuellt | `log()` schreibt immer in System-Log: `src/services/logService.ts:67-69` |
| Begrenzung der System-Log-Eintraege | Erfuellt | `MAX_SYSTEM_LOG_ENTRIES = 10000`, Trim: `src/services/logService.ts:23`, `107-109` |
| Snapshot-Historie vorhanden | Erfuellt | `src/services/logService.ts:193-206`, `212-218` |
| Persistente Tages-Logdateien in `.logs` | Nicht erfuellt | `saveLogFile` definiert, aber ungenutzt; Rotation laeuft ohne Writer: `src/services/fileSystemService.ts:228-255`, `313-365`, `src/App.tsx:23-25` |

## 3. Tiefenbefunde (Luecken)

### Befund G1 (hoch): `.logs`-Dateikonzept ist unvollstaendig

- Es gibt Rotation fuer `system-YYYY-MM-DD.log.json`, aber keinen aktiven Schreibpfad, der solche Dateien erzeugt.
  - Regex-Rotation: `src/services/fileSystemService.ts:320`
  - Kein Aufrufer fuer `saveLogFile(...)` im Repo.

Auswirkung:
- Erwartetes "allgemeines Logfile auf Datentraeger" findet faktisch nicht statt.
- Rotationslogik ist aktuell fast wirkungslos.

### Befund G2 (mittel): Snapshot-Speicher ungebremst

- `createLogSnapshot()` speichert bei jedem Anzeigen den kompletten System-Logzustand.
  - `src/services/logService.ts:193-206`
- Keine Begrenzung fuer Snapshot-Anzahl oder Snapshot-Groesse.

Auswirkung:
- Zusatzauslastung localStorage, Risiko fuer Quota-Probleme.

### Befund G3 (mittel): "Speicher/Cache leeren" loescht Logs hart

- `localStorage.clear()` in Settings.
  - `src/components/SettingsPopup.tsx:402-407`

Auswirkung:
- System-Logs, Run-Logs, Snapshots werden ohne Backup entfernt.
- Fuer Diagnose in produktiven Fehlerfaellen riskant.

### Befund G4 (mittel): Bedeutende Infrastrukturfehler landen nur in `console.*`

- u. a. `runPersistenceService`, `fileStorageService`, Teile Parser/Matcher.
- Diese Eintraege fehlen im allgemeinen Log.

Auswirkung:
- "Allgemeiner Log" ist nicht vollstaendig als zentrale Fehlerquelle.

## 4. Vorschlaege fuer Vervollstaendigung (Allgemeiner Log)

### Prioritaet A (zwingend)

1. Tatsaechliches Datei-Logging in `.logs` aktivieren.
   - Tagesdatei-Schema mit `saveLogFile(...)` einhalten.
   - Rotation dann real wirksam.

2. Kritische `console.*`-Pfade an `logService` anbinden.
   - Besonders Persistenz, Parser/Matcher-Engine, Dateispeicher.

3. Snapshot-Limits einfuehren.
   - z. B. max Snapshot-Anzahl + groesseres Cleanup bei Quota.

### Prioritaet B (soll)

4. Vor `localStorage.clear()` optionalen Log-Export anbieten.
5. Basisfilter fuer allgemeines Log (Level, Zeitraum, runId vorhanden/leer).
6. Event-Korrelation verbessern (sessionId, actionId, source).

---

## Abschluss: Zielbild fuer beide Log-Systeme

1. Run-Log = vollstaendiger fachlicher Verlauf eines einzelnen Runs.
   - inklusive manueller Entscheidungen, Issue-Statusaenderungen, Step-Gates, Archivstatus.

2. Allgemeiner Log = technische und organisatorische Gesamtspur.
   - App-Start, Konfiguration, Registry, Datei-/Berechtigungsfehler, Laufzeitfehler.

3. Doppeltes Logging zwischen beiden Systemen bleibt ausdruecklich sinnvoll.
   - Fuer Run-Analyse (lokal) und Systemdiagnose (global) gleichzeitig.

4. Aktueller IST-Stand ist funktionsfaehig, aber fuer forensische Nachvollziehbarkeit noch nicht vollstaendig.
   - Hauptluecken: inaktiver Audit-Log, unvollstaendige Instrumentierung manueller Aktionen, unvollstaendiger `.logs`-Dateipfad.

