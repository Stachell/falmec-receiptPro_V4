# Export CSV Diagnostic Report

Datum: 2026-03-06
Scope: Analyse ohne Codeaenderung. Fokus auf Kachel 6 (Export), CSV-Download, Verknuepfung zu "Einstellungen > Export > Export-Spaltenreihenfolge" und Archivierung (IndexedDB/Archivpaket).

## Kurzfazit

1. Der erwartete CSV-Export in Kachel 6 ist aktuell nicht implementiert.
2. Die Export-Kachel in RunDetail loest keinen Datei-Download aus, sondern nur Workflow-Navigation/Step-Advance.
3. Die Einstellung "Export-Spaltenreihenfolge" ist technisch an den XML-Export gekoppelt (nicht an CSV).
4. Es wird keine Export-Datei in IndexedDB archiviert.
5. Auch im Archivpaket wird export.csv/export.xml aktuell nicht geschrieben, weil runStore keine Export-Inhalte uebergibt.

## Befunde (mit Referenzen)

### Befund A (kritisch): Kein CSV-Exporter im Export-Panel
- In `src/components/run-detail/ExportPanel.tsx` wird ein XML-String gebaut (`xmlPreview`) und als XML heruntergeladen.
- Referenzen:
  - `exportFileName` endet auf `.xml` (`ExportPanel.tsx:38`)
  - XML-Builder (`ExportPanel.tsx:65`)
  - Blob-Typ `application/xml` (`ExportPanel.tsx:93`)
  - Download-Button Text `XML exportieren` (`ExportPanel.tsx:223`)
- Es gibt dort keinen CSV-Builder und keinen CSV-Downloadpfad.

### Befund B (kritisch): Kachel 6 klickt nicht auf Export-Download
- Die "Kachel 6" (Dynamic Next Step Button) in RunDetail macht bei Klick:
  - falls alle Steps fertig: nur `setActiveTab('export')`
  - sonst: `advanceToNextStep(...)`
- Referenzen:
  - Handler in `RunDetail.tsx:651-660`
  - Bei `allStepsComplete` nur Tabwechsel (`RunDetail.tsx:653-654`)
- Damit wird kein Download gestartet.

### Befund C (hoch): Step 5 hat keine Ausfuehrungslogik fuer Export
- `advanceToNextStep` setzt Step-Status, aber hat nur Auto-Execution fuer Steps 2-4.
- Kommentar bestaetigt explizit: `Steps 1 and 5 have no auto-execution logic to re-trigger`.
- Referenzen:
  - Abschluss/Auto-Archivierung (`runStore.ts:1643-1651`)
  - Kommentar (`runStore.ts:2125`)

### Befund D (hoch): Export-Spaltenreihenfolge ist an XML gebunden
- Die Einstellung wird aus `useExportConfigStore().columnOrder` gelesen und direkt beim XML-Feldaufbau verwendet.
- Referenzen:
  - Lesen der Reihenfolge (`ExportPanel.tsx:41`)
  - Feld-Mapping (`ExportPanel.tsx:44-60`)
  - Anwendung der Reihenfolge im Builder (`ExportPanel.tsx:77`)
- Die Settings-UI aendert nur `columnOrder` (move up/down + save), kein CSV-spezifischer Pfad.
- Referenzen:
  - UI Tab `Export-Spaltenreihenfolge` (`SettingsPopup.tsx:172`)
  - Move-Buttons (`SettingsPopup.tsx:192`, `SettingsPopup.tsx:201`)
  - Persistierung in localStorage (`exportConfigStore.ts:11-12`, `exportConfigStore.ts:98-101`)

### Befund E (hoch): Archivpaket kann CSV/XML aufnehmen, bekommt aber nichts
- `archiveService.writeArchivePackage(...)` hat optionale Felder `exportXml`/`exportCsv` und schreibt nur wenn vorhanden.
- Referenzen:
  - Options-Signatur (`archiveService.ts:351-354`)
  - `if (options?.exportXml)` (`archiveService.ts:400-408`)
  - `if (options?.exportCsv)` (`archiveService.ts:410-417`)
- In `runStore.archiveRun(...)` werden aber nur `preFilteredSerials` und `issues` uebergeben.
- Referenz: `runStore.ts:2138-2141`
- Folge: `metadata.files.exportXml/exportCsv` bleibt `null`.
- Referenz: `archiveService.ts:486-490`

### Befund F (hoch): IndexedDB speichert Run-Daten, aber keine Export-Dateien
- Persistenz in DB `falmec-receiptpro-runs` umfasst Run/Lines/Issues/Logs etc., keine Export-Datei-Bytes.
- Referenzen:
  - DB-Name (`runPersistenceService.ts:27`)
  - PersistedRunData Felder (`runPersistenceService.ts:35-48`)
  - AutoSave Payload (`useRunAutoSave.ts:74-91`)
- Ergebnis: CSV wird nicht in IndexedDB als Export-Artefakt archiviert.

### Befund G (mittel): `exportReady` wird initialisiert, aber nicht auf `true` gesetzt
- Vorkommen in `runStore.ts` nur Initialwerte `exportReady: false`.
- Referenzen (Treffer): `runStore.ts:747`, `runStore.ts:834`
- Gleichzeitig sind Download-Elemente davon abhaengig:
  - RunDetail Header XML-Button (`RunDetail.tsx:579-583`)
  - Dashboard Downloads (`Index.tsx:356`)
- Dadurch bleiben diese Wege praktisch deaktiviert.

### Befund H (mittel): Es existiert CSV-Download nur fuer andere Zwecke
- `IssuesCenter` hat `Export CSV`, das aber nur Issue-Liste exportiert.
- Referenz: `IssuesCenter.tsx:486-507`
- `Index.tsx` hat XML/CSV Download, aber mit stark vereinfachtem Inhalt (nicht line-basierter Ziel-Export).
- Referenzen:
  - Generator (`Index.tsx:45-52`)
  - Download (`Index.tsx:160-173`)

## Verknuepfung "Einstellungen > Export > Export-Spaltenreihenfolge"

Aktuelle technische Zuordnung (columnKey -> ExportPanel resolveColumn):
- `manufacturerArticleNo` -> `line.manufacturerArticleNo` (`ExportPanel.tsx:46`)
- `ean` -> `line.ean` (`ExportPanel.tsx:47`)
- `falmecArticleNo` -> `line.falmecArticleNo` (`ExportPanel.tsx:48`)
- `descriptionDE` -> `line.descriptionDE` (`ExportPanel.tsx:49`)
- `descriptionIT` -> `line.descriptionIT` (`ExportPanel.tsx:50`)
- `supplierId` -> `line.supplierId` (`ExportPanel.tsx:51`)
- `unitPriceInvoice` -> `line.unitPriceInvoice` (`ExportPanel.tsx:52`)
- `unitPriceOrder` -> `line.unitPriceSage` (`ExportPanel.tsx:53`)
- `totalPrice` -> `line.totalLineAmount` (`ExportPanel.tsx:54`)
- `orderNumberAssigned` -> `line.orderNumberAssigned` (`ExportPanel.tsx:55`)
- `orderDate` -> `line.orderYear` (`ExportPanel.tsx:56`)
- `serialNumber` -> `line.serialNumber` (`ExportPanel.tsx:57`)
- `storageLocation` -> `line.storageLocation` (`ExportPanel.tsx:58`)
- `orderVorgang` -> `line.orderVorgang` (`ExportPanel.tsx:59`)
- `fattura` -> `run.invoice.fattura` (`ExportPanel.tsx:60`)

Hinweis: Diese Reihenfolge wird derzeit fuer XML-Felder verwendet, nicht fuer CSV.

## Ursache (Root Cause)

Die Kernursache ist ein Architektur-/Wiring-Mismatch:
- Erwartung: Kachel 6 Klick => CSV erzeugen + herunterladen + archivieren.
- Ist-Zustand:
  - Kachel 6 steuert nur Workflow-Status/Tabwechsel.
  - ExportPanel erzeugt nur XML.
  - Archiv-Service koennte CSV speichern, bekommt aber keine CSV-Daten.
  - IndexedDB-Persistenz speichert Runs, nicht Exportdateien.

## Plan zur Erledigung (ohne Umsetzung in diesem Bericht)

1. CSV-Exporter im Export-Kontext definieren
- Eine dedizierte CSV-Erzeugung fuer RunDetail-Export bauen (ohne Header, Komma-separiert, Reihenfolge aus `columnOrder`).
- Wertebezug 1:1 aus bestehendem `resolveColumn` ableiten (oder gemeinsame Value-Resolver-Funktion).

2. Kachel-6-Verhalten korrigieren
- Klickpfad fuer finalen Export explizit trennen:
  - `Step abschliessen`
  - `CSV exportieren`
- Akzeptanz: Klick auf Export-Aktion startet realen CSV-Download im Browser.

3. ExportPanel erweitern
- Neben XML-Pfad einen CSV-Pfad anbieten (CSV als primaerer Download fuer Kachel 6).
- XML bleibt als separater Body/Preview darunter erhalten.

4. Archivierung verdrahten
- Beim finalen Export `archiveRun` mit `exportCsv` (und optional `exportXml`) aufrufen.
- Validieren, dass `metadata.files.exportCsv` gesetzt ist.

5. IndexedDB-Anforderung klaeren und umsetzen
- Wenn wirklich gefordert: Export-Artefakt(e) in PersistedRunData aufnehmen (z. B. `exportCsv?: string` oder Blob-Referenz).
- Alternativ klar dokumentieren: Exportdateien liegen nur im Archivpaket auf Disk, nicht in IndexedDB.

6. `exportReady` sauber setzen
- Regel definieren (z. B. nach Step 4 + keine Blocker + Lagerorte vorhanden) und zentral in Stats aktualisieren.
- Dadurch funktionieren Dashboard-Downloads/Statusanzeigen konsistent.

7. Tests
- Unit-Test fuer CSV-Reihenfolge (Settings-Reorder -> Ausgabe-Reihenfolge).
- Integrationstest fuer End-to-End: Step 5/Kachel 6 -> CSV-Download ausgeloest -> Archiv-Metadaten enthalten `exportCsv`.

## Verifizierung nach Umsetzung (Checkliste)

1. In RunDetail, Kachel 6 klick erzeugt sofort eine `.csv` Datei.
2. CSV ist ohne Header, mit Komma getrennt.
3. Reihenfolge entspricht exakt `Einstellungen > Export > Export-Spaltenreihenfolge`.
4. XML bleibt separat im unteren Body (Preview/optionaler Download).
5. Archiv-Metadaten enthalten `files.exportCsv != null`.
6. Falls gefordert: IndexedDB-Eintrag enthaelt Export-Artefakt.
