# Step 3 Indexed Persistenz Diagnose (PROJ-40 + ADD-ON)

Erstellt am: 2026-03-02
Projekt: falmec-reicptpro_v3
Scope: Analyse ohne Codeaenderung (nur Befund + Plan)

## 1) Kurzfazit
Die Persistenz der bereits zugewiesenen Seriennummern in `invoiceLines.serialNumbers[]` ist grundsaetzlich vorhanden.
Der eigentliche Fehler liegt im Reprocess-/Archiv-Flow: Die Quelle fuer eine erneute SN-Zuordnung geht verloren (oder wird nie rehydriert), dadurch laeuft Step 3 spaeter ohne Datenquelle und ueberspringt die Zuteilung.

## 2) Sollbild vs. Istbild
Soll:
- Zugewiesene Seriennummern bleiben pro Run persistent.
- Bei "Neu verarbeiten" (inkl. aus Archiv geoeffnetem Run) steht die SN-Quelle wieder zur Verfuegung.
- Archivpaket uebernimmt Serial-Daten konsistent.

Ist:
- Persistierte Run-Lines enthalten die zugewiesenen Seriennummern.
- Reprocess verliert die SN-Quelle in mehreren Pfaden.
- Archivfluss leert globale Upload-Daten und kann SN-Reprocess danach nicht mehr bedienen.

## 3) Technischer Datenfluss (relevant fuer SN)
1. Upload `serialList`:
- Pre-Filter wird nur beim aktiven Upload ausgefuehrt (`addUploadedFile`) und schreibt in `preFilteredSerials` (Memory).
- Referenz: `src/store/runStore.ts:623-644`, `:628`

2. Step 3 Zuteilung:
- Primar aus `preFilteredSerials`.
- Fallback legacy: `serialDocument`.
- Wenn beides leer ist, wird Step 3 als "ok/uebersprungen" behandelt.
- Referenz: `src/store/runStore.ts:2913-3027`, `:3039-3043`

3. Persistenz:
- AutoSave schreibt `invoiceLines` inkl. `serialNumbers[]` in IndexedDB.
- Referenz: `src/hooks/useRunAutoSave.ts:73-90`
- Persisted Shape enthaelt auch `serialDocument` + `uploadMetadata`.
- Referenz: `src/services/runPersistenceService.ts:33-45`

4. Rehydrierung Run:
- `loadPersistedRun` laedt `invoiceLines` + `serialDocument`.
- Referenz: `src/store/runStore.ts:3152-3161`

## 4) Befunde (Root-Cause Kette)

### Befund A (kritisch): `preFilteredSerials` ist nur Memory und wird nicht rehydriert
- Aufbau nur bei manuellem Upload (`addUploadedFile`).
- `loadStoredFiles` laedt Dateien, berechnet aber `preFilteredSerials` nicht neu.
- Referenz: Aufbau `src/store/runStore.ts:623-644`; Laden ohne Rebuild `:692-705`
- Folge: Nach Reload/Archiv-Open fehlt die aktive SN-Zuordnungsquelle fuer Step 3.

### Befund B (kritisch): `serialDocument` ist als Fallback praktisch tot
- `serialDocument` wird im Store deklariert und in Persistenz geschrieben/geladen.
- Es gibt aber keinen aktiven Pfad, der `serialDocument` aus Uploads befuellt.
- Referenz Suche: einzige Schreibstelle ist faktisch nur Clear/Load, keine Build-Logik.
- Referenz: `src/store/runStore.ts:510`, `:2490`, `:3160`; `src/hooks/useRunAutoSave.ts:83`
- Folge: Legacy-Fallback greift real nicht.

### Befund C (kritisch): Cache-Cleanup loescht SN-Quelle vor spaeteren Flows
- Nach erfolgreichem Step 4 wird `preFilteredSerials` (und `serialDocument`) aktiv geleert.
- Referenz: `src/store/runStore.ts:2490-2491`
- Folge: "Neu verarbeiten" im selben Kontext kann Step 3 ohne Neu-Upload nicht mehr vollstaendig ausfuehren.

### Befund D (hoch): Auto-Archivierung triggert globales Datei-Cleanup
- Nach Abschluss wird `archiveRun()` automatisch angestossen.
- Referenz: `src/store/runStore.ts:1636-1643`
- Bei erfolgreichem Archiv schreibt `cleanupBrowserData()` u.a. `fileStorageService.clearAllFiles()`.
- Referenz: `src/services/archiveService.ts:507-509`, `:543-546`
- Folge: Nach Archiv/Reload fehlen Upload-Dateien global; Reprocess aus Archiv hat keine sichere Dateibasis.

### Befund E (hoch): `uploadMetadata` wird gespeichert, aber nicht genutzt
- AutoSave schreibt `uploadMetadata`.
- Referenz: `src/hooks/useRunAutoSave.ts:84-89`
- `loadPersistedRun` verwendet `uploadMetadata` nicht fuer eine Run-spezifische Rehydrierung.
- Referenz: `src/store/runStore.ts:3126-3163`
- Folge: Erwarteter Mehrwert (run-spezifische Wiederherstellung/Transparenz) bleibt aus.

### Befund F (hoch): Archiv-Serial-Export kann leer laufen
- Archiv nutzt `options.preFilteredSerials` fuer `serial-data.json`.
- Referenz: `src/services/archiveService.ts:421-432`
- Da `preFilteredSerials` zuvor geleert wurde (Befund C), ist die Datei oft nicht vorhanden.
- Folge: Archivseitige SN-Nachvollziehbarkeit unvollstaendig.

## 5) Warum der User-Effekt genau so entsteht

### Fall 1: "Neu verarbeiten"
- Reprocess startet neuen Lauf ueber `createNewRunWithParsing`.
- Referenz: `src/pages/RunDetail.tsx:563-574`, `src/store/runStore.ts:789-1037`
- Step 3 benoetigt `preFilteredSerials` oder `serialDocument`.
- Diese sind nach Step 4-Cleanup/Reload typischerweise leer.
- Ergebnis: Keine erneute SN-Zuteilung trotz vorhandener Historie.

### Fall 2: "vom Archiv aus oeffnen"
- Persistierter Run wird geladen, die alten `invoiceLines` koennen da sein.
- Referenz: `src/pages/Index.tsx:215-219`, `src/store/runStore.ts:3126-3167`
- Fuer erneute Verarbeitung fehlt aber die run-spezifische SN-Quelle (siehe Befund A/B/D/E).
- Ergebnis: Reprocess aus Archivkontext verliert SN-Zuteilung bzw. kann sie nicht reproduzieren.

## 6) Wichtig: Was funktioniert bereits
- Das Speichern der Run-Lines in IndexedDB inkl. `serialNumbers[]` ist implementiert.
- Referenz: `src/hooks/useRunAutoSave.ts:73-90`, `src/services/runPersistenceService.ts:113-129`
- Das Problem ist primar Rehydrierung/Quelle fuer erneutes Step-3-Matching, nicht das reine Feld `serialNumbers[]` im Persisted Record.

## 7) Plan zur Behebung (ohne Umsetzung in diesem Schritt)

### Phase 1 (Sofort-Hotfix, geringes Risiko)
1. Serial-Quelle nicht vorzeitig entsorgen:
- `preFilteredSerials`/`serialDocument` nicht pauschal nach Step 4 leeren oder erst nach expliziter Session-Bereinigung.
2. Rebuild bei Datei-Rehydrierung:
- Nach `loadStoredFiles()` fuer vorhandene `serialList` den Pre-Filter erneut aufbauen.
3. Reprocess-Guard:
- Wenn Step 3 ohne SN-Quelle starten wuerde, klaren Blocker/Warnhinweis anzeigen statt stilles Ueberspringen.

### Phase 2 (Strukturell sauber)
1. Run-spezifische Persistenz der SN-Quelle:
- Entweder `preFilteredSerials` pro Run persistieren oder `serialDocument` wieder real befuellen und konsequent nutzen.
2. `uploadMetadata` nutzbar machen:
- Beim Laden eines Runs als Rehydrierungs-/Integritaetscheck verwenden.
3. Archiv-Cleanup entkoppeln:
- Kein globales `clearAllFiles()` direkt nach erfolgreichem Archiv, sondern kontrollierter/optionaler Cleanup.

### Phase 3 (Abnahme)
1. E2E-Testfall A:
- Run komplett -> Neu verarbeiten ohne Neu-Upload -> Step 3 muss identische SN-Deckung liefern.
2. E2E-Testfall B:
- App neu laden -> Run aus Archiv/Index oeffnen -> Neu verarbeiten -> Step 3 darf nicht ohne Quelle laufen.
3. E2E-Testfall C:
- Archivpaket muss konsistent `invoice-lines.json` + `serial-data.json` enthalten (falls SN-Daten vorhanden).

## 8) Risikobewertung
- Betrieblich: hoch (Reprocess liefert fachlich andere Ergebnisse).
- Datenintegritaet: mittel-hoch (SN-Reproduzierbarkeit nicht garantiert).
- Supportaufwand: hoch (inkonsistente Ergebnisse zwischen Erstlauf und Reprocess).

## 9) Prioritaet
Empfohlene Prioritaet: P1 (sofort), da Kernworkflow "Neu verarbeiten" und Archiv-zu-Run-Reproduktion direkt betroffen sind.
