# Sonnet Execution Plan - Dual Log Completion

Date: 2026-03-03  
Target: Vollstaendige und belastbare Logging-Abdeckung fuer
- Run-Log-System
- Allgemeines Log-System

Hinweis:
- Dieses Dokument ist ein Umsetzungsplan fuer einen Sonnet-Agenten.
- Es beschreibt Felder, Kontext, Workflow, Reihenfolge, Akzeptanzkriterien.

---

## 1. Mission und harte Ziele

1. Run-Log muss jeden fachlich relevanten Eingriff je Run nachvollziehbar abbilden.
2. Allgemeines Log muss als zentrale technische Diagnosespur funktionieren.
3. Doppellogging ist erlaubt und gewuenscht, wenn fachlich sinnvoll.
4. Nach Archivierung und nach Reload duerfen Logs nicht "verschwinden".

Nicht-Ziele:
- Kein Redesign der kompletten UI.
- Kein Wechsel des gesamten Persistenz-Stacks.
- Kein Bruch der bestehenden `LogEntry`-Kompatibilitaet.

---

## 2. Aktueller Kontext (Pflichtwissen fuer Agent)

## 2.1 Zwei aktive Logsysteme

1. Run-Log:
- Speicher: `falmec-run-log-<runId>` in localStorage (`src/services/logService.ts`)
- Live-Buffer: `runBuffers` (`src/services/logService.ts`)
- UI: Run-Tab + Dashboard-Button + ArchiveDialog (`RunLogTab`)

2. Allgemeiner Log:
- Speicher: `falmec-system-log` in localStorage
- UI: Settings -> Allgemein -> `Logfile`
- Snapshot-Key: `falmec-log-snapshots`

## 2.2 Kritische Luecken aus IST

1. `auditLog` vorhanden, aber praktisch ungenutzt (`addAuditEntry` ohne Aufrufer).
2. Viele manuelle Aktionen ohne Logeintrag (Preis, Order, Issue resolve/escalate).
3. Viele `console.*` statt `logService` in Kernmodulen.
4. `.logs`-Dateiablage existiert technisch, wird aber nicht aktiv befuellt.
5. Run-Log-Verfuegbarkeit nach Archivierung ist nicht robust.

---

## 3. Datenmodell und Felder

## 3.1 Bestehendes Pflichtmodell (nicht brechen)

`LogEntry` (`src/services/logService.ts`):
- `id`
- `timestamp`
- `level` (`INFO|WARN|ERROR|DEBUG`)
- `runId?`
- `step?`
- `message`
- `details?`

## 3.2 Empfohlene Erweiterung (abwaertskompatibel)

Optionale Felder ergaenzen:
- `eventType?: string` (z. B. `MANUAL_PRICE_SET`)
- `source?: string` (z. B. `runStore.setManualPrice`)
- `context?: Record<string, unknown>` (strukturierte Zusatzdaten)

Regel:
- `message` bleibt menschenlesbar.
- Strukturierte Daten nur in `context`, nicht als unstrukturierter String.

## 3.3 AuditLogEntry verbindlich nutzen

`AuditLogEntry` (`src/types/index.ts`):
- `runId`, `action`, `details`, `userId`, `timestamp`

Regel fuer Agent:
- Bei allen manuellen Fachaktionen immer beides schreiben:
  - `logService` (Run + Allgemein)
  - `addAuditEntry` (persistierter Audit-Trail im Run)

---

## 4. Workflow-Matrix (was muss geloggt werden)

## 4.1 Run-Log Pflicht-Events

Lifecycle:
- Run erstellt
- Run-ID umbenannt
- Step Start / Step Ende / Step Gate blockiert
- Pause / Resume / Retry / Abort / Delete
- Archivierung gestartet / abgeschlossen / fehlgeschlagen

Manuelle Eingriffe:
- Preis manuell gesetzt
- Order manuell gesetzt
- `confirmNoOrder`
- `reassignOrder` (alt -> neu)
- Issue resolved
- Issue escalated
- Zeilen-/Positionsupdate, falls fachlich relevant

Parser/Matcher Kernereignisse:
- Parserwahl
- Parser-Validierungsfehler
- Matcherwahl
- MatchingEngine Run1/2/3 Summary
- Serial mismatch (severity korrekt: WARN/ERROR je nach Hard/Soft fail)

## 4.2 Allgemeiner Log Pflicht-Events

System/Infra:
- App-Boot Hooks
- Registry-Aenderungen (Parser/Matcher)
- Dateisystemberechtigung/Folder-Fehler
- Persistenzfehler (IndexedDB, fileStorage, runPersistence)
- Snapshot-Erzeugung
- Cache-Clear Aktion

Datei-Logging:
- Tagesdatei erzeugt/aktualisiert
- Rotationsergebnis
- Rotationfehler

---

## 5. Umsetzungsplan (phasenweise)

## Phase A - Baseline Instrumentierung

Ziel:
- Keine blinden Stellen bei manuellen Aktionen.

Dateien:
- `src/store/runStore.ts`
- optional UI-Actions in `IssuesCenter` nur falls store-seitig nicht ausreichend.

Tasks:
1. Bei `setManualPrice`, `setManualOrder`, `confirmNoOrder`, `reassignOrder`:
   - `logService.info` mit `runId`, `step`, klarer `message`, Details alt/neu.
   - `addAuditEntry` mit passender `action`.
2. Bei `resolveIssue`, `escalateIssue`:
   - Log + Audit mit issueId, reason/recipient.
3. Bei `updateInvoiceLine` / `updatePositionLines`:
   - Nur loggen, wenn fachlich kritische Felder geaendert wurden (kein Log-Spam).

Akzeptanz:
- Jede manuelle Entscheidung ist im Run-Log und AuditLog nachvollziehbar.

## Phase B - Konsolidierung `console.*` -> `logService`

Ziel:
- Wichtige Diagnosen gehen nicht mehr an den Logsystemen vorbei.

Dateien (Prioritaet):
1. `src/services/matching/matchingEngine.ts`
2. `src/services/parsers/utils/pdfTextExtractor.ts`
3. `src/services/runPersistenceService.ts`
4. `src/services/fileStorageService.ts`
5. verbleibende zentrale `runStore`-`console.*`

Regeln:
- Fehler -> `ERROR`
- Recoverable Unsauberkeit -> `WARN`
- Pipeline-Fortschritt -> `INFO`/`DEBUG`
- Bei Run-Kontext immer `runId` mitschicken

Akzeptanz:
- Signifikante Reduktion von `console.*` in fachkritischen Pfaden.
- Keine Regression im Verhalten.

## Phase C - Run-Log Persistenz robust machen

Ziel:
- Run-Logs auch nach Archivierung/Reload verfuegbar.

Option 1 (bevorzugt):
- Run-Log als Feld in `PersistedRunData` aufnehmen.
- Beim `loadPersistedRun` in localStorage-Key zurueckspiegeln oder direkt UI-seitig lesen.

Option 2:
- ArchiveDialog liest `run-log.json` aus Archivpaket statt nur localStorage.

Zusatz:
- Doppelpfad fuer `run-log.json` bereinigen (`folderName` vs `runId`).

Akzeptanz:
- Persisted-only Run kann Log oeffnen.
- Archivierter Run verliert Log nicht.

## Phase D - Allgemeiner Dateilog (`.logs`) aktivieren

Ziel:
- Allgemeines Log auch ausserhalb localStorage verfuegbar.

Dateien:
- `src/services/logService.ts`
- `src/services/fileSystemService.ts`
- ggf. App-Boot Hook in `src/App.tsx`

Tasks:
1. Writer fuer Tagesdatei implementieren (Schema `system-YYYY-MM-DD.log.json`).
2. Auf definierte Trigger schreiben:
   - zyklisch
   - bei Snapshot
   - bei kritischem Fehler
3. Rotation beibehalten und testen.

Akzeptanz:
- `.logs` enthaelt echte Tagesdateien.
- Rotation loescht alte Tage korrekt.

## Phase E - Snapshot und Retention Hygiene

Ziel:
- Kein unkontrolliertes localStorage-Wachstum.

Tasks:
1. Maximalanzahl fuer Snapshots definieren.
2. Optional max-bytes je Snapshot.
3. Fallback bei Quota mit dokumentiertem Verhalten.

Akzeptanz:
- Snapshot-Feature bleibt nutzbar ohne Speicherkollaps.

---

## 6. File-by-File Arbeitsanweisungen

1. `src/store/runStore.ts`
- Instrumentiere manuelle Aktionen und Issue-Statuswechsel.
- Nutze bestehendes `runId` aus `currentRun`.
- Trenne technische Debuglogs (`DEBUG`) von fachlichem Audit (`INFO`).

2. `src/services/logService.ts`
- Optional Felder `eventType/source/context`.
- Snapshot-Retention.
- Optional Helper `logEvent(...)` fuer konsistente Struktur.

3. `src/services/fileSystemService.ts`
- Nutze `saveLogFile(...)` aktiv fuer Tageslog.
- Rotationskontrakt nicht aendern (bestehendes Dateimuster respektieren).

4. `src/components/run-detail/RunLogTab.tsx`
- Sortierung vereinheitlichen (live/archive).
- Optional Label fuer Datenquelle (buffer/localStorage/persisted).

5. `src/services/archiveService.ts` + `src/store/runStore.ts`
- Ein kanonischer Speicherpfad fuer `run-log.json`.
- Keine doppelte/inkonsistente Ablage.

6. `src/services/runPersistenceService.ts`
- Falls Option 1 gewaehlt: Run-Log Feld aufnehmen + laden/speichern.

---

## 7. Test- und Abnahmeszenarien

## 7.1 Manuelle Fachtests

1. Preis manuell setzen -> Run-Log + AuditLog Eintrag vorhanden.
2. Issue resolve/escalate -> Run-Log + AuditLog vorhanden.
3. Order manuell zuweisen/umhaengen -> alte/neue Zuordnung nachvollziehbar.
4. Run archivieren -> Run-Log danach weiterhin aufrufbar.
5. Persisted-only Run laden -> Run-Log verfuegbar.

## 7.2 Technische Checks

1. Zaehlung vor/nach Umstellung:
```powershell
rg -c "console\\.(log|warn|error|info)\\(" src
rg -c "logService\\.(info|warn|error|debug)\\(" src
```

2. Schluesselpfade:
```powershell
rg -n "addAuditEntry\\(|setManualPrice|setManualOrder|confirmNoOrder|reassignOrder|resolveIssue|escalateIssue" src/store/runStore.ts
rg -n "saveLogFile\\(|rotateHomeLogs\\(" src/services/fileSystemService.ts src/App.tsx
```

3. Build/Test (wenn vorhanden):
```powershell
npm run test
npm run build
```

---

## 8. Definition of Done

1. Jeder manuelle Fachentscheid ist im Run-Log und AuditLog sichtbar.
2. Kritische Fachpfade nutzen `logService` statt nur `console.*`.
3. Allgemeines Log existiert nicht nur in localStorage, sondern auch als `.logs` Tagesdatei.
4. Run-Logs bleiben nach Archivierung und Reload verfuegbar.
5. Snapshot/Retention fuehrt nicht zu unkontrolliertem Speicherwachstum.
6. Kein Regressionseffekt auf bestehenden Workflow (Step 1-5).

---

## 9. Empfohlene Ausfuehrungsreihenfolge fuer Sonnet-Agent

1. Phase A (manuelle Aktionen + Audit)
2. Phase B (console-Migration in Kernpfaden)
3. Phase C (Run-Log Persistenz/Archiv)
4. Phase D (allgemeiner Datei-Log)
5. Phase E (Retention)
6. Tests + Dokumentation in `features/INDEX.md` und projektspezifischen PROJ-Notizen

