# PROJ-48 - Anpassung Export: Diagnose, Lagebild und Umsetzungsplan

Stand: 2026-03-27
Status: Analyse ohne Codeaenderung
Scope: Kachel 6, Run-Detail > Export, Export-Einstellungen, Archivierung, Schutzmechaniken Step 5

## Kurzfazit

- Die fachliche Basis ist bereits gut vorbereitet: CSV und XML laufen heute ueber eine zentrale Export-Logik in `src/services/exportService.ts`.
- Kachel 6 erzeugt aktuell direkt eine CSV-Datei und umgeht dabei nicht die bestehenden Schutzmechaniken. Genau dieser Pfad ist der primaere Umstellkandidat auf XLSX.
- Der Export-Tab ist bereits an die Export-Einstellungen angeschlossen: Feldreihenfolge wirkt schon heute auf CSV und XML, Headerzeile und Delimiter wirken auf CSV.
- XLSX ist technisch ohne neues Paket machbar, weil `xlsx` bereits im Projekt vorhanden und an mehreren Stellen aktiv genutzt wird.
- Das groesste Regressionsrisiko liegt nicht im Schreiben der XLSX-Datei selbst, sondern in Seiteneffekten bei Archiv-Metadaten, Dateianzeigen und einer moeglichen Verdopplung der Feld-Mapping-Logik.

## Arbeitsannahmen fuer den Plan

- Kachel 6 soll kuenftig statt CSV eine XLSX-Datei herunterladen.
- Der Export-Tab im Run-Detail soll CSV und XML weiterhin getrennt anbieten.
- Die Export-Einstellungen bleiben die fachliche Single Source of Truth fuer die Spaltenreihenfolge.
- Der CSV-Delimiter bleibt ausschliesslich fuer CSV relevant.
- Die Header-Option wird fuer CSV weiter genutzt und sollte fuer den neuen XLSX-Kachel-Export ebenfalls beruecksichtigt werden.
- XML soll keine "Headerzeile" im Tabellen-Sinn erhalten; dort bleibt nur die Feldreihenfolge relevant.

## Lagebild

### 1. Zentrale Export-Logik ist bereits vorhanden

- `src/services/exportService.ts:20-117` ist heute die technische SSOT fuer Export-Feldmapping und Dateiinhalte.
- `resolveColumnValue(...)` in `src/services/exportService.ts:38-57` bildet alle 15 Exportfelder auf konkrete Run-/Line-Werte ab.
- `generateXML(...)` in `src/services/exportService.ts:63-88` nutzt `columnOrder` bereits fuer die Tag-Reihenfolge.
- `generateCSV(...)` in `src/services/exportService.ts:92-108` nutzt ebenfalls `columnOrder` und beachtet zusaetzlich Delimiter und Header-Flag.
- `buildExportFileName(...)` in `src/services/exportService.ts:115-118` ist bereits generisch genug, um auch `.xlsx` Dateinamen zu erzeugen.

Bewertung:
- Sehr gute Ausgangslage. Ein XLSX-Pfad sollte in derselben zentralen Service-Datei entstehen und nicht als dritte, separate Mapping-Implementierung in einer UI-Komponente.

### 2. Kachel 6 ist aktuell hart auf CSV verdrahtet

- Der Sofort-Export der Kachel 6 lebt in `src/pages/RunDetail.tsx:328-386`.
- Dort wird explizit `generateCSV(...)` aufgerufen (`src/pages/RunDetail.tsx:350`).
- Der Dateiname wird mit `.csv` gebaut (`src/pages/RunDetail.tsx:352`).
- Die Kachel-UI spricht ebenfalls explizit von `CSV herunterladen` (`src/pages/RunDetail.tsx:781-798`).
- Der Exportpfad setzt aber bereits die wichtigen Begleitwerte korrekt:
  - einmaliges `bookingDate`
  - `exportVersion`
  - Archiv-Anhang
  - Run-Log
  - Audit-Log
  - Export-Diagnostik

Bewertung:
- Die Umstellung auf XLSX ist hier klar lokalisiert.
- Der eigentliche Exportpfad ist stabil und wertvoll. Er sollte nicht neu erfunden, sondern nur formatseitig erweitert werden.

### 3. Der Export-Tab ist bereits sauber verdrahtet

- `src/components/run-detail/ExportPanel.tsx:57-137` bedient heute beide Buttons fuer CSV und XML.
- CSV und XML greifen beide auf dieselbe Service-Schicht zu (`src/components/run-detail/ExportPanel.tsx:79-82`).
- Die CSV-Schaltflaeche bleibt fachlich wichtig und soll laut SOLL bestehen bleiben (`src/components/run-detail/ExportPanel.tsx:259-263`).
- Die XML-Schaltflaeche bleibt ebenfalls bestehen (`src/components/run-detail/ExportPanel.tsx:268-272`).
- Die XML-Vorschau wird direkt aus `generateXML(...)` erzeugt (`src/components/run-detail/ExportPanel.tsx:52`).

Bewertung:
- Der Export-Tab ist inhaltlich weitgehend SOLL-konform.
- Fuer PROJ-48 muss er nicht ersetzt werden, sondern nur gegen Seiteneffekte abgesichert bleiben.

### 4. Die Export-Einstellungen sind produktiv angeschlossen

- Die Konfiguration liegt im Zustand-Store `src/store/exportConfigStore.ts:37-148`.
- Standardreihenfolge der 15 Felder ist in `src/store/exportConfigStore.ts:17-32` hinterlegt.
- Persistenz erfolgt ueber LocalStorage.
- Im Settings-Tab "Export" koennen Nutzer heute bereits:
  - die Spaltenreihenfolge sortieren (`src/components/SettingsPopup.tsx:177-216`)
  - das CSV-Trennzeichen waehlen (`src/components/SettingsPopup.tsx:249-259`)
  - eine Headerzeile aktivieren (`src/components/SettingsPopup.tsx:262-271`)

Bewertung:
- Die Fachlogik fuer Reihenfolge/Header existiert schon.
- Fuer XLSX muss diese Konfiguration wiederverwendet werden, nicht parallel neu modelliert.

### 5. Step-5-Schutzmechaniken sind real vorhanden und relevant

- Export-Readiness im Export-Tab blockiert bei:
  - offenen/pending Error-Issues
  - fehlenden Lagerorten
  - fehlenden Rechnungszeilen
  - siehe `src/components/run-detail/ExportPanel.tsx:38-40`
- Die Kachel 6 nutzt denselben Grundgedanken ueber `isExportReady` in `src/pages/RunDetail.tsx:267-275`.
- Step-5-Issues werden zentral erzeugt und auto-resolved in `src/store/runStore.ts:2522-2609`.
- Harte Export-Blocker sind in der Blocker-Matrix hinterlegt:
  - `missing-storage-location`
  - `export-no-lines`
  - siehe `src/store/runStore.ts:339`
- Step 5 wird automatisch als "bereit" abgeschlossen, die Dateierzeugung selbst bleibt aber bewusst an den UI-Klick gebunden (`src/store/runStore.ts:1930-1941`).

Bewertung:
- Diese Mechaniken duerfen beim XLSX-Einbau nicht umgangen werden.
- Jede Umstellung, die einen neuen Downloadpfad ausserhalb dieser Guards einfuehrt, waere fachlich gefaehrlich.

### 6. Archivierung ist teilweise generisch, aber metadata-seitig noch CSV/XML-zentriert

- Exporte werden heute ueber `extraFiles` an das Archiv gehaengt:
  - `src/services/archiveService.ts:225-350`
  - `src/services/archiveService.ts:589-743`
- Physisch kann der Archiv-Service bereits beliebige Dateinamen mitschreiben, also auch `.xlsx`.
- Die Archive-Metadaten kennen aktuell aber nur:
  - `exportXml`
  - `exportCsv`
  - siehe `src/types/index.ts:559-560`
- Gleiches Mapping findet sich im Archiv-Service bei der Dateierkennung:
  - `src/services/archiveService.ts:349-350`
  - `src/services/archiveService.ts:742-743`

Bewertung:
- Eine XLSX-Datei koennte ohne Compiler-Fehler archiviert werden, waere aber metadata-seitig unsichtbar.
- Das ist der wichtigste verdeckte Funktionsbruch fuer PROJ-48.

### 7. XLSX-Infrastruktur ist im Projekt bereits vorhanden

- Paket bereits installiert: `package.json:69`
- Aktive XLSX-Nutzung existiert bereits in:
  - `src/services/serialFinder.ts:19`
  - `src/services/masterDataParser.ts:23`
  - `src/services/matching/orderParser.ts:1`
- Ein valider Schreibpfad ist im Testcode bereits belegt:
  - `src/services/masterDataParser.test.ts:18-21`
  - dort werden `aoa_to_sheet`, `book_new`, `book_append_sheet` und `XLSX.write(..., { type: 'array', bookType: 'xlsx' })` bereits verwendet.

Bewertung:
- Kein neues Abhaengigkeitspaket noetig.
- Das reduziert das Integrationsrisiko deutlich.

### 8. Testlage ist fuer Export derzeit duerftig

- Im Repo gibt es keine dedizierten Tests fuer `generateXML`, `generateCSV` oder fuer den Kachel-6-Exportpfad.
- Die Suche nach Export-spezifischen Tests in `src/**/*.test.ts`, `tests/`, `e2e/` liefert fuer die eigentliche Export-Logik keine belastbare Abdeckung.

Bewertung:
- PROJ-48 sollte nicht ohne neue Export-Regressionstests umgesetzt werden.

## Soll-Abgleich

### Bereits erfuellt

- Export-Tab bietet getrennte Buttons fuer CSV und XML.
- Export-Einstellungen bestimmen bereits die Feldreihenfolge.
- CSV-Header-Schalter ist bereits produktiv angeschlossen.
- CSV-Delimiter ist bereits produktiv angeschlossen.
- Kachel 6 haengt bereits an den Export-Schutzmechaniken und an der Archiv-/Log-Pipeline.

### Noch nicht erfuellt

- Kachel 6 liefert noch CSV statt XLSX.
- Es gibt keinen zentralen XLSX-Generator.
- Archiv-Metadaten koennen XLSX derzeit nicht sauber referenzieren.
- UI-Texte und Labels rund um Kachel 6 sprechen noch von CSV.
- Es gibt keine dedizierte Testabdeckung fuer die Export-Pipeline.

## Risiko- und Regressionsbewertung

### Hoch

- Doppelte Feldlogik
  - Wenn XLSX nicht auf `resolveColumnValue(...)` basiert, drohen unterschiedliche Inhalte zwischen CSV, XML und XLSX.
  - Folge: Inkonsistente Buchungsdaten, falsche Feldreihenfolge, abweichende Werte pro Format.

- Archiv-Metadaten bleiben blind fuer XLSX
  - Wenn nur die Datei geschrieben wird, aber `ArchiveMetadata` nicht erweitert wird, wird die neue Hauptausgabe nicht sauber dokumentiert.
  - Folge: Diagnose, Nachvollziehbarkeit und spaetere Archiv-Auswertung werden untergraben.

- Umgehung der Step-5-Blocker
  - Ein neuer XLSX-Downloadpfad ausserhalb von `isExportReady` oder `generateStep5Issues(...)` waere fachlich riskant.
  - Folge: Export trotz fehlender Lagerorte oder trotz relevanter Fehler.

### Mittel

- Header-Regel fuer XLSX fachlich nicht explizit im Code definiert
  - CSV nutzt den Header-Schalter heute bereits.
  - Fuer XLSX muss diese Regel bewusst entschieden und dann einheitlich umgesetzt werden.
  - Meine Empfehlung: Header-Schalter fuer XLSX ebenfalls anwenden.

- Versionierung / bookingDate werden vergessen
  - Die Exportpfade setzen heute `bookingDate` und `exportVersion` explizit.
  - Wenn ein neuer XLSX-Pfad das nicht uebernimmt, entstehen inkonsistente Dateinamen und Metadaten.

- Uebersehener Nebenscope im Dashboard
  - `src/pages/Index.tsx` bietet aktuell Schnell-Downloads fuer XML und CSV.
  - Das ist nicht direkt Kachel 6, aber eine moegliche Erwartungsfalle, falls "Export" spaeter global als XLSX verstanden wird.

### Niedrig bis mittel

- Footer-Status "Export"
  - `src/components/AppFooter.tsx:174-177` bewertet aktuell nur die Spaltenreihenfolge als "konfiguriert", nicht Header/Delimiter.
  - Kein blocker, aber als UX-Asymmetrie bekannt.

## Pruefung auf moegliche Code-Beschaedigung oder untergrabene Funktionen

Aktueller Befund:

- Ich sehe keinen Hinweis darauf, dass die heutige Exportfunktion fundamental beschaedigt ist.
- Die bestehende Architektur ist fuer PROJ-48 eher "vorbereitet, aber unvollstaendig" als defekt.
- Kritisch waere nicht die Erweiterung selbst, sondern eine unsaubere Erweiterung an den falschen Stellen.

Was auf keinen Fall kaputt gemacht werden darf:

- `resolveColumnValue(...)` als gemeinsame Feldquelle
- die Step-5-Blocker `missing-storage-location` und `export-no-lines`
- die bestehende CSV-Funktion im Export-Tab
- die XML-Vorschau und den XML-Download
- `bookingDate` und `exportVersion`
- Archiv-Anhang, Run-Log, Audit-Log und Export-Diagnostik

## Empfohlener Umsetzungsplan

### Phase 1 - Zentrale Export-Service-Erweiterung

- `src/services/exportService.ts` um eine XLSX-Erzeugung erweitern.
- Empfehlung:
  - gemeinsamen tabellarischen Zwischenschritt einfuehren, z. B. `buildExportMatrix(...)`
  - daraus CSV und XLSX speisen
  - XML weiter auf `resolveColumnValue(...)` lassen oder ebenfalls aus einer gemeinsamen Struktur ableiten
- XLSX technisch ueber SheetJS:
  - Headerzeile optional anhand des Settings-Schalters
  - Datenzeilen in exakt derselben Feldreihenfolge wie CSV/XML
  - `XLSX.write(..., { type: 'array', bookType: 'xlsx' })`

Ziel:
- Keine doppelte Business-Logik fuer Feldmapping.

### Phase 2 - Kachel 6 von CSV auf XLSX umstellen

- In `src/pages/RunDetail.tsx:328-386` den Kachel-6-Download von CSV auf XLSX umstellen.
- Unveraendert beibehalten:
  - `setBookingDate(...)`
  - `incrementExportVersion(...)`
  - Archiv-Aufruf
  - Run-Log
  - Audit-Log
  - Export-Diagnostik
- UI-Texte anpassen:
  - Subtext von `CSV herunterladen` auf `XLSX herunterladen`
  - ggf. Details/Toasts/Logtexte entsprechend anpassen

Ziel:
- Nur das Format der Kachel 6 aendert sich, nicht ihr Schutzverhalten.

### Phase 3 - Export-Tab bewusst stabil halten

- `src/components/run-detail/ExportPanel.tsx` fuer CSV und XML unveraendert im Verhalten erhalten.
- Pruefen, ob Diagnostik-Nachrichten deutlicher zwischen CSV/XML/XLSX differenzieren sollen.
- Optional:
  - Anzeige im Info-Block ergaenzen, dass Kachel 6 den XLSX-Sofortdownload liefert.

Ziel:
- SOLL einhalten: Export-Tab behaelt CSV und XML.

### Phase 4 - Archiv-Metadaten fuer XLSX ergaenzen

- `src/types/index.ts` um eine explizite Referenz `exportXlsx` erweitern.
- `src/services/archiveService.ts` in beiden Pfaden (`appendToArchive`, `writeArchivePackage`) um `.xlsx` Dateierkennung ergaenzen.
- Nicht nur Datei schreiben, sondern die XLSX-Datei auch in `metadata.json` referenzieren.

Empfehlung:
- Lieber explizites `exportXlsx` als sofortige Vollverallgemeinerung auf eine komplett neue Metadatenstruktur.
- Das haelt die Aenderung klein und minimiert Seiteneffekte.

Ziel:
- Nachvollziehbare Archivierung ohne "blinde" Hauptdatei.

### Phase 5 - Nebenscope bewusst entscheiden

- `src/pages/Index.tsx` derzeit nicht automatisch mitumstellen.
- Empfehlung fuer PROJ-48:
  - Dashboard-Schnell-Downloads vorerst ausser Scope lassen
  - nur dann anpassen, wenn fachlich explizit gewuenscht

Begruendung:
- Die User-Anforderung zielt konkret auf Kachel 6 und den Export-Tab im Run-Detail.
- Eine globale Umstellung aller Downloadpfade vergroessert das Regressionsrisiko unnoetig.

### Phase 6 - Tests und Absicherung

- Neue Unit-Tests fuer Export-Service:
  - Feldreihenfolge nach `columnOrder`
  - Header an/aus
  - CSV-Delimiter unveraendert nur fuer CSV
  - XLSX-Zellenwerte entsprechen exakt den CSV-Werten
  - `bookingDate` und `fattura` korrekt enthalten
- Komponentennahe Tests oder Integrations-Tests:
  - Kachel 6 erzeugt `.xlsx`
  - Export-Tab erzeugt weiter `.csv` und `.xml`
  - Archiv-Metadaten enthalten `exportXlsx`
- Manuelle Fachtests:
  - Lagerort fehlt -> kein Export
  - Error-Issue offen -> kein Export
  - keine Zeilen -> kein Export
  - Header aus -> XLSX ohne Kopfzeile
  - Header an -> XLSX mit Kopfzeile
  - Reihenfolge im Settings-Tab geaendert -> Reihenfolge in CSV, XML und XLSX korrekt

## Konkrete Dateiliste fuer die spaetere Umsetzung

Pflichtkandidaten:

- `src/services/exportService.ts`
- `src/pages/RunDetail.tsx`
- `src/services/archiveService.ts`
- `src/types/index.ts`

Sehr wahrscheinlich zusaetzlich:

- neue oder erweiterte Testdatei fuer den Export-Service

Optional, nur falls UX mitgezogen werden soll:

- `src/components/run-detail/ExportPanel.tsx`
- `src/pages/Index.tsx`

## Empfehlung zur fachlichen Umsetzung

Empfohlene Loesung:

- Kachel 6 auf XLSX umstellen
- Export-Tab CSV und XML unveraendert lassen
- Spaltenreihenfolge fuer alle Exportformate aus derselben SSOT ableiten
- Header-Flag fuer CSV und XLSX anwenden
- Delimiter strikt nur fuer CSV anwenden
- Archiv-Metadaten explizit um XLSX erweitern
- erst nach Testabsicherung umsetzen

## Endbewertung

PROJ-48 ist technisch gut machbar und muss kein riskanter Umbau werden. Die vorhandene Exportarchitektur ist stabil genug, wenn die Umstellung zentral im Export-Service erfolgt und die bestehenden Step-5-Schutzmechaniken unangetastet bleiben. Das einzige echte rote Tuch ist eine "schnelle" XLSX-Einfuegung in der UI ohne Archiv- und SSOT-Anbindung. Genau das sollte vermieden werden.
