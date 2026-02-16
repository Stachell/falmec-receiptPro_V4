# WORKFLOWABLAUF_CHATGPT

## Ziel
Dieses Dokument beschreibt den echten Ablauf im Projekt `falmec receiptPro` mit Fokus auf:
- Start eines neuen Laufs
- Schritt 1 (`Rechnung auslesen`)
- Verhalten der Seite `RunDetail`
- Stellen im Code, an denen du gezielt anpassen kannst

Scope: React/TypeScript-Workflow im aktuellen Frontend-Code.

## Relevante Dateien
- `src/pages/NewRun.tsx:52`
- `src/store/runStore.ts:313`
- `src/store/runStore.ts:496`
- `src/store/runStore.ts:615`
- `src/services/invoiceParserService.ts:26`
- `src/services/parsers/index.ts:71`
- `src/services/parslogic/modules/fattura/parser.ts:90`
- `src/services/parslogic/base/OrderBlockTracker.ts:75`
- `src/pages/RunDetail.tsx:38`
- `src/pages/RunDetail.tsx:77`
- `src/services/fileSystemService.ts:130`

## Ablauf Ende-zu-Ende (was passiert zuerst)
1. User geht auf `Neuer Verarbeitungslauf` (`/new-run`) und laedt 4 Pflichtdateien hoch.
2. Uploads werden im Store gehalten und zusaetzlich in IndexedDB persistiert (`addUploadedFile`).
3. Bei Klick auf `Verarbeitung starten` startet `handleStartProcessing`.
4. Es wird geprueft, ob ein Datenverzeichnis gesetzt ist (`isDirectoryConfigured`).
5. Falls kein Verzeichnis gesetzt ist: Dialog zur Ordnerauswahl.
6. Falls gesetzt: `ensureFolderStructure()` prueft/erstellt `falmec receiptPro/.Archiv` und `.logs`.
7. Danach startet `createNewRunWithParsing()`.
8. Der Store legt sofort einen neuen Run mit Platzhalterwerten an:
   - `status: running`
   - Schritt 1 = `running`
   - Schritte 2-6 = `not-started`
9. Danach wird Schritt 1 technisch ausgefuehrt (`parseInvoice`).
10. Parsing-Ergebnis wird in den Store geschrieben und Run-Daten werden aktualisiert.
11. Run-ID wird von `run-<timestamp>` auf `Fattura-...` umgestellt, wenn Rechnungsnummer vorhanden.
12. Archiv-Eintrag wird erstellt.
13. UI navigiert nach `/run/<runId>` in die Run-Detail-Ansicht.

## Schritt 1 im Detail (`Rechnung auslesen`)

### 1) Einstieg
- `createNewRunWithParsing` in `src/store/runStore.ts:313`.
- Sucht Invoice-Datei aus `uploadedFiles`.
- Setzt `isProcessing=true` und `parsingProgress='Initialisiere...'`.

### 2) Parsing-Aufruf mit Timeout
- `parseInvoice` in `src/store/runStore.ts:496`.
- Timeout ist hart auf 30 Sekunden gesetzt (`PARSING_TIMEOUT_MS = 30000`).
- `Promise.race(parseInvoicePDF(...), timeout)`.

### 3) Parser-Auswahl
- `parseInvoicePDF` in `src/services/invoiceParserService.ts:26`.
- Nutzt `findParserForFile` in `src/services/parsers/index.ts:71`.
- Prioritaet:
  1. `FatturaParserV3` (parslogic)
  2. Legacy `InvoiceParser_Fattura`
  3. Ultimate fallback ebenfalls Legacy

### 4) Was der V3-Parser macht
- Einstieg: `src/services/parslogic/modules/fattura/parser.ts:90`.
- Liest PDF-Text inkl. Koordinaten (`extractTextFromPDF`).
- Liest Header (Fattura-Nr, Datum), Paketanzahl, dann Positionen.
- Zentrale Logik: Order-Block-Persistenz mit `OrderBlockTracker`.
- `Vs. ORDINE` startet neuen Block, der fuer alle folgenden Positionen gilt, bis neuer Block kommt.
- Position wird beim Preis-Treffer `PZ qty price total` committed.
- Falls Preiszeile aufgespalten ist, gibt es Lookahead-Logik (`PARTIAL_PZ_PATTERN`).

### 5) Rueckgabe und Status-Mapping
- Ergebnis wird via `setParsedInvoiceResult` gespeichert (`src/store/runStore.ts:561`).
- Run-Update erfolgt in `updateRunWithParsedData` (`src/store/runStore.ts:615`).
- Statuslogik Schritt 1:
  - `ok`: parse success ohne Fehler-Warnings
  - `soft-fail`: parse success mit Fehler-Warnings
  - `failed`: parse nicht erfolgreich
- Wichtig: Bei `stepStatus === 'failed'` setzt der Run aktuell `status: 'soft-fail'` (nicht `failed`) in `updateRunWithParsedData`.

### 6) Run-ID-Neubildung
- Nach Parsing: `generateRunId(...)` in `src/services/invoiceParserService.ts:196`.
- Format: `Fattura-<nummer>-YYYYMMDD-HHMMSS`.

### 7) Fehlerfaelle
- Keine Invoice-Datei: Run wird auf `failed`, Schritt 1 auf `failed` gesetzt.
- Parsing komplett fehlgeschlagen: ebenfalls `failed` in `createNewRunWithParsing`.
- Teilweise Daten + Rechnungsnummer: Lauf kann trotzdem fortgesetzt werden.

## Run-Detail: Anzeige- und Steuerlogik

### Laden eines Runs
- `RunDetail` setzt `currentRun` per `runId` aus Store-Runs, sonst Fallback auf `mockRuns`.
- Code: `src/pages/RunDetail.tsx:38`.

### Naechster Schritt
- `getNextStep` sucht den ersten Step mit `not-started` oder `running`.
- Code: `src/pages/RunDetail.tsx:77`.
- KPI-Kachel `naechster Schritt` ruft `advanceToNextStep(runId)` auf.
- `advanceToNextStep` macht nur Statusumschaltung:
  - laufenden Step auf `ok`
  - ersten `not-started` Step auf `running`
- Es gibt aktuell keine echte Fachlogik fuer Schritt 2-6 im Store.

### Tabs / Datenquellen
- `Rechnung`-Tab nutzt `parsedInvoiceResult` + `parsedPositions` aus Store.
- `Positionen`-Tab nutzt `invoiceLines` aus Store.
- `Issues`-Tab nutzt globales `issues` Array.
- `Overview` zeigt Aktivitaetslog derzeit aus `mockAuditLog`.

## Wichtig fuer Fehleranalyse und Anpassung
1. Parsing-Daten sind global im Store, nicht pro Run versioniert.
   - Schluessel: `PARSED_INVOICE_KEY` in `src/store/runStore.ts`.
2. `invoiceLines` sind ebenfalls global und nicht streng run-spezifisch segmentiert.
3. `issues` sind global und stammen initial aus Mockdaten (`mockIssues`).
4. Aktivitaetsprotokoll in `OverviewPanel` verwendet `mockAuditLog`, nicht die laufenden Store-Logs.
5. Schritt 2-6 sind aktuell nur UI-/Status-Simulation ueber `advanceToNextStep`.

## Wenn du gezielt Start-Logik 1 anpassen willst
1. Einstieg/Orchestrierung: `src/store/runStore.ts:313`.
2. Timeout/Fortschritt/Fehlerpfade: `src/store/runStore.ts:496`.
3. Status-Mapping und Run-Aktualisierung: `src/store/runStore.ts:615`.
4. Parser-Auswahl: `src/services/parsers/index.ts:71`.
5. Parsing-Regeln Fattura V3: `src/services/parslogic/modules/fattura/parser.ts:244`.
6. Order-Block-Verhalten: `src/services/parslogic/base/OrderBlockTracker.ts:75`.

## Kurzfazit
Der erste echte Fachschritt ist `createNewRunWithParsing -> parseInvoice -> parseInvoicePDF -> FatturaParserV3.parseInvoice`. Alles danach in Run-Detail (Schritt 2-6) ist aktuell hauptsaechlich Statusfortschaltung/Anzeige und noch keine durchgaengige Backend-Workflow-Engine.
