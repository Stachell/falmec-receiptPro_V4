# PROJ-46-2 NEW-RUN KLICK-TO-MIND - Diagnostic Round 2

Datum: 2026-03-14
Scope: Reine Analyse, kein Code.

## Executive Summary

1. Early Archive ist laut Doku NICHT tot. Tot ist nur das alte Step-5-Auto-Disk-Write.
2. Der Step-2-Crash kommt nicht von `uploadedFiles` selbst, sondern von einer getrennten State-Quelle: `masterDataStore.articles` ist leer.
3. Der LINK-Button sitzt nicht in `RunDetail.tsx` direkt, sondern in `OverviewPanel.tsx` (Details-Tab). Der graue String hat exakt 44 Zeichen (inkl. Leerzeichen), ohne den dynamischen `archivePath`-Suffix.

---

## PHASE 1 - Archiv-Wahrheit (features-Scan)

### Frage: Ist "Early Archive" dokumentiert als tot/abgeloest?

Kurzantwort: Nein.

Dokumentierter Stand laut Features:
- `features/INDEX.md:54` beschreibt explizit ein 3-Saeulen-Modell mit aktivem Early Archive in Step 1 (`writeEarlyArchive`), KEIN Disk-Write in Step 5, und finalem Schreiben bei Kachel-6-Klick (`appendToArchive`).
- `features/PROJ-27-ADDON-2_Early_Archive.md:21-23` dokumentiert genau dieses Modell im Detail.
- `features/PROJ-27-ADDON-2_Early_Archive.md:227` und `:389` formulieren die absolute Regel: In Step 5 darf nichts auf Festplatte geschrieben werden.

Wichtiges Praezisierungsdetail:
- "Ablösung" betrifft den frueheren Auto-Archiv-Pfad von Step 5, nicht das Early Archive selbst.
- `features/PROJ-27-ADDON-2_Early_Archive.md:9-11` begruendet das mit User-Activation-Grenzen der File System Access API.

### Dokumentierter Ist-Zustand der Speicherarchitektur

Aus den Features ergibt sich ein hybrides Modell (nicht entweder/oder):
- Upload-Dateien/Binaerdaten im Browser (IndexedDB) als Laufzeit-Gedaechtnis.
  - Referenz: `features/PROJ-40_IndexedDB_Architekturplan.md:90`
- Run-Persistenz in IndexedDB (A2/AutoSave etc.) fuer Reload/Weiterarbeit.
  - Referenz: `features/INDEX.md:25`, `features/INDEX.md:43`
- Early Archive (Disk) in Step 1 fuer PDFs/Basis-Metadata (user activation gebunden).
  - Referenz: `features/PROJ-27-ADDON-2_Early_Archive.md:21`, `:33-40`
- Manueller/regelmaessiger Export aus IndexedDB ueber Settings "Archiv ablegen" + Importpfade.
  - Referenz: `features/PROJ-27-ADDON_Archiv_Speicher_Hygiene.md:133-137`, `:153-160`, `:276-281`, `:433-436`

Schluss fuer Phase 1:
- Keine dokumentierte "Early Archive ist Restleiche"-Regel.
- Dokumentiert ist: koexistierende Pfade mit klarer Trennung der Zeitpunkte und Rechte.

---

## PHASE 2 - Aufgabe 1: Step-2-Crash beim Start aus Gedaechtnis

### Beweiskette im Code (wo reisst es?)

1. NewRun laedt gespeicherte Upload-Dateien in `uploadedFiles`:
- `src/pages/NewRun.tsx:41-50`
- `src/store/runStore.ts:744-757`

2. UI zeigt "gruen/Haken", sobald `currentFile` existiert:
- `src/components/FileUploadZone.tsx:63-70`

3. Step 1 nutzt nur `invoiceFile` aus `uploadedFiles` und kann dadurch erfolgreich laufen:
- `src/store/runStore.ts:843-847`, `:907-910`

4. Nach Step 1 kommt Auto-Start Step 2:
- `src/store/runStore.ts:1397-1410` (Auto-Advance Trigger)
- `src/store/runStore.ts:1501-1508` (Auto-Start `executeMatcherCrossMatch`)

5. Step 2 liest NICHT `articleListFile` aus `uploadedFiles`, sondern nur `useMasterDataStore.getState().articles`:
- `src/store/runStore.ts:3087-3089`
- Bei leerem Array: exakter Fehlertext + Step 2 `failed`:
- `src/store/runStore.ts:3090-3094`, `:3112`

### Warum kann das trotz "gruen" passieren?

Zentraler Architekturbruch:
- `loadStoredFiles()` setzt nur `uploadedFiles`, triggert aber KEINE erneute Artikel-Parser-Pipeline.
  - `src/store/runStore.ts:744-757`
- Die Befuellung von `masterDataStore` aus `articleList` passiert nur im Upload-Pfad `addUploadedFile(file.type === 'articleList')`.
  - `src/store/runStore.ts:639-644`
- Das bedeutet: Sichtbarer Upload-Status und Step-2-Matcher-Datenquelle sind entkoppelt.

Zusatzrisiko (Race):
- Boot-Hydration der Stammdaten laeuft asynchron in `App.tsx` und wird nicht auf Run-Start synchronisiert/gegated.
  - `src/App.tsx:27-30`
- Wenn `masterDataStore.load()` noch nicht fertig ist (oder leer), startet Step 2 trotzdem und faellt in den no-master-Branch.

### Direkte Antwort auf deine Frage

- Die Kette reisst beim Uebergang von UI-/Upload-State (`uploadedFiles`) zur fachlichen Matcher-Quelle (`masterDataStore.articles`).
- `articleListFile` muss fuer den Crash nicht `undefined` sein. Es kann vorhanden und "gruen" sein.
- Der konkrete Fail kommt, weil Step 2 nicht auf `articleListFile.file` arbeitet, sondern auf einem separaten Store (`masterDataStore`), der in diesem Moment leer ist.

---

## PHASE 3 - UI-Vermessung (Details-Tab, LINK)

### Wo ist die LINK-Sektion?

- Details-Tab rendert `OverviewPanel`:
  - `src/pages/RunDetail.tsx:872-876`, `:934-936`
- LINK-Sektion selbst sitzt in:
  - `src/components/run-detail/OverviewPanel.tsx:130-151`

### Frage 1: Exakte Struktur des Buttons "Oeffnet die Original-Rechnung"

Quelle: `src/components/run-detail/OverviewPanel.tsx:133-146`

Struktur (JSX/HTML-Tailwind):
- `<Button variant="outline" style={{ backgroundColor: '#c9c3b6', borderColor: '#666666', color: '#666666' }} onClick={...}>`
- innerhalb:
  - `<FolderOpen className="w-4 h-4 mr-2" />`
  - Textnode: `Öffnet die Original-Rechnung`
- `onClick` baut URL `/api/dev/open-folder` mit optionalem `?subfolder=${encodeURIComponent(run.archivePath)}` und ruft `fetch(url)`.
  - Referenz: `src/components/run-detail/OverviewPanel.tsx:136-142`

### Frage 2: Exakte Zeichenanzahl des grauen Beschreibungstexts

Statischer String in der grauen `<p>`-Zeile:
- `Öffnet den Archiv-Ordner im Windows Explorer`
- Quelle: `src/components/run-detail/OverviewPanel.tsx:147-149`

Exakte Laenge (inkl. Leerzeichen):
- **44 Zeichen**

Hinweis zur Layout-Relevanz:
- Direkt dahinter wird dynamisch ` (archivePath)` angehaengt, falls vorhanden.
  - `src/components/run-detail/OverviewPanel.tsx:149`
- Das 44-Zeichen-Limit gilt daher nur fuer den statischen Basistext.

---

## Schaerfste Kernaussage

Der beobachtete Step-2-Absturz ist ein State-Entkopplungsfehler zwischen Upload-Indikator und Matcher-Datenquelle, nicht primaer ein Datei-Handle-Lesefehler in Step 2.
