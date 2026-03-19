# PROJ-44 Add-on: Step-3 Serial Parser Fehler-Management Diagnose

Stand: 2026-03-19

## Kurzfazit

Der aktuelle Step-3-Stand ist zweigeteilt:

- **Hauptpfad**: `SerialFinder` + `runStore.executeMatcherSerialExtract()` auf aggregierten `InvoiceLine`s mit `serialNumbers[]`.
- **Legacy-Pfad**: `FalmecMatcher_Master.serialExtract()` auf dem alten, zeilenorientierten Modell mit `serialNumber`.

Die beiden Pfade behandeln Seriennummernfehler **nicht gleich**. Der neue Pfad ist EAN-basiert und aggregiert, der Legacy-Pfad ist referenz- und regex-basiert, aber strukturell noch auf das alte Einzelsatz-Modell ausgelegt.

---

## 1. S/N-Format: Gibt es Regex/Validierung? Was passiert bei zufaelligem Barcode-Muell?

### Hauptpfad

Ja. Der neue Upload-/Pre-Filter nutzt hart die Regex:

- `SN_REGEX = /K[0-2][0-9]{10}K/` in `src/services/serialFinder.ts` (`:22`)
- Beim Upload werden nur Treffer uebernommen: `const match = SN_REGEX.exec(serialRaw); if (!match) continue;` (`src/services/serialFinder.ts:138-139`)

Konsequenz:

- Ein zufaellig gelesener Barcode-String, der **nicht** auf die Regex passt, fliegt **sofort raus**.
- Er landet **weder** in `preFilteredSerials` **noch** als Orphan **noch** als sichtbares Issue.
- Auf Upload-Ebene wird also **still verworfen**, nicht als Problem materialisiert.

Zusaetzlich wird beim Upload aus `filteredRows` noch ein `serialDocument` gebaut, aber nur aus bereits gueltigen Treffern:

- `src/store/runStore.ts:734-750`

### Legacy-Pfad

Auch der Legacy-Matcher nutzt dieselbe Regex:

- `SN_REGEX = /K[0-2][0-9]{10}K/` in `src/services/matchers/modules/FalmecMatcher_Master.ts:33`

Wenn eine Zeile im `serialDocument` landet und noch kein `serialCandidate` hat, wird im Legacy-Pfad nochmal extrahiert:

- `src/services/matchers/modules/FalmecMatcher_Master.ts:528-530`

Wenn der Regex-Treffer ausbleibt:

- es wird **nur ein Warning** `SN_REGEX_FAILED` erzeugt (`src/services/matchers/modules/FalmecMatcher_Master.ts:533-536`)
- die Zeile wird **nicht zugewiesen**
- sie wird **nicht** als Orphan im State gespeichert
- es wird **kein Issue** `sn-regex-failed` erzeugt, obwohl der `IssueType` existiert (`src/types/index.ts:23-25`) und im UI gelabelt ist (`src/components/run-detail/IssueDialog.tsx:78-80`)

### Antwort

- **Ja**, es gibt Regex-Validierung.
- **Hauptpfad**: ungueltige Strings werden **frueh verworfen**.
- **Legacy-Pfad**: ungueltige Strings bleiben als unconsumed Rohzeile uebrig, erzeugen aber **nur Log-Warnungen**, **kein sichtbares Issue** und **keine Orphan-Struktur**.

---

## 2. Unterdeckung: Wie entstehen Issues bei zu wenig S/N?

### Hauptpfad

Der neue Pfad arbeitet auf aggregierten Positionen:

- Nur `serialRequired === true` wird betrachtet (`src/store/runStore.ts:3627-3630`)
- `requiredCount` wird **nach Menge** gerechnet: `requiredCount += line.qty` (`src/store/runStore.ts:3630`)
- Pro EAN werden Serien aus einem Pool gezogen und als `serialNumbers[]` auf die aggregierte Position geschrieben (`src/store/runStore.ts:3614-3620`, `:3645`)

Fehlererzeugung:

- Unterversorgung wird erkannt ueber `line.serialNumbers.length < line.qty` (`src/store/runStore.ts:3659`)
- Es wird **ein einziges Rollup-Issue** erzeugt:
  - `type: 'serial-mismatch'` (`src/store/runStore.ts:3665`)
  - mit `relatedLineIds` und `affectedLineIds` aller betroffenen Positionen (`src/store/runStore.ts:3672-3673`)
  - plus `context` mit `field: 'serialNumbers'`, `expectedValue: 'qty'`, `actualValue: assignedCount/requiredCount` (`src/store/runStore.ts:3678`)

Das ist **nicht pro Zeile**, sondern **ein Sammel-Issue** fuer alle unterversorgten Positionen des Runs.

### Legacy-Pfad

Der Legacy-Matcher rechnet noch zeilenorientiert:

- `requiredCount = lines.filter(l => l.serialRequired && l.serialSource !== 'manual').length` (`src/services/matchers/modules/FalmecMatcher_Master.ts:565`)
- also **pro Zeile**, **nicht nach qty**

Wenn zu wenig S/N zugewiesen wurden:

- `mismatchCount > 0` (`src/services/matchers/modules/FalmecMatcher_Master.ts:578`)
- dann ein **einziges Rollup-Issue**
  - `type: 'sn-insufficient-count'` (`src/services/matchers/modules/FalmecMatcher_Master.ts:586`)
  - mit allen unassigned `lineId`s (`src/services/matchers/modules/FalmecMatcher_Master.ts:580-589`)

### Antwort

- **Hauptpfad**: Rollup-Issue `serial-mismatch`, mengenbasiert, nicht pro Einzelzeile.
- **Legacy-Pfad**: Rollup-Issue `sn-insufficient-count`, aber noch auf **Zeilenanzahl** statt `qty`.

---

## 3. Ueberdeckung / Orphans: Was passiert mit zu vielen gefundenen S/N?

### Hauptpfad

Der neue Pfad baut erst `ean -> string[]` Pools (`src/store/runStore.ts:3614-3620`) und nimmt pro Rechnungslinie bis `qty` weg (`src/store/runStore.ts:3635-3641`).

Was uebrig bleibt:

- verbleibt nur lokal in den Restarrays der `eanToSerials`-Map
- wird **nirgendwo persistiert**
- wird **nirgendwo als Orphan-Objekt gespeichert**
- erzeugt **kein Issue**
- taucht im Fehler-Center **nicht sichtbar** auf

Wichtig: Der Hauptpfad setzt `checksumMatch = assignedCount === requiredCount` (`src/store/runStore.ts:3651-3653`).
Das bedeutet:

- wenn alle Pflichtmengen bedient wurden, ist Step 3 **OK**
- selbst wenn auf dem Dokument **mehr** gueltige S/N gefunden wurden als benoetigt

### Legacy-Pfad

Hier bleiben ueberzaehlige Treffer als `SerialDocumentRow` mit `consumed === false` liegen:

- Auswahl nur ueber `matchingRows.find(r => r.serialCandidate !== null && !r.consumed)` (`src/services/matchers/modules/FalmecMatcher_Master.ts:552-555`)

Die Legacy-Checksumme ist strenger:

- `checksumMatch = regexHits === assignedCount` (im Return-Objekt; ablesbar ueber `regexHits`/`assignedCount`-Vergleich im Legacy-Resultat, genutzt in `runStore` fuer den Step-Status, `src/store/runStore.ts:3777-3779`)

Folge bei Ueberdeckung:

- alle Pflichtzeilen koennen versorgt sein
- trotzdem ist `regexHits > assignedCount`
- damit Step 3 im Legacy-Pfad `soft-fail` oder `failed`
- **aber ohne eigenes Issue**, weil `sn-insufficient-count` nur bei Unterdeckung erzeugt wird (`src/services/matchers/modules/FalmecMatcher_Master.ts:578-589`)

### Antwort

- Ein echtes **Orphan-Modell existiert aktuell nicht**.
- **Hauptpfad**: Extra-S/N sind komplett unsichtbar.
- **Legacy-Pfad**: Extra-S/N fuehren hoechstens zu einem Checksum-/Statusproblem, aber **nicht** zu einem sichtbaren Fehler-Center-Issue fuer Orphans.

---

## 4. Late-Fix fuer S/N-Pflicht: Kann man bei Step-3-Issues `serialRequired` auf NEIN setzen?

### Store-Faehigkeit

Ja, technisch gibt es eine Store-Aktion, die `serialRequired` nachtraeglich aendern kann:

- `setManualArticleByPosition(...)` in `src/store/runStore.ts:2805`
- dort gewinnt `data.serialRequired` explizit ueber den bisherigen Wert (`src/store/runStore.ts:2842`, `:2864`)

### Aktuelle UI fuer Step-3-Issues

Im `IssueDialog` gibt es die editierbare `ArticleMatchCard` mit `S/N-Pflicht Ja/Nein`:

- Formular-Feld `serialRequired` (`src/components/run-detail/IssueDialog.tsx:116-123`)
- Select `ja/nein` (`src/components/run-detail/IssueDialog.tsx:213-216`)
- Submit geht in `setManualArticleByPosition(...)` (`src/components/run-detail/IssueDialog.tsx:164-175`)

Aber: Diese Card wird **nur** fuer Artikel-Match-Issues gerendert:

- `issue.type === 'no-article-match' || issue.type === 'match-artno-not-found'` (`src/components/run-detail/IssueDialog.tsx:566-576`)

Fuer Step-3-Issues wie:

- `serial-mismatch`
- `sn-insufficient-count`

gibt es **kein** entsprechendes Bearbeitungsformular. Tab `Loesung erzwingen` kann nur:

- Zeilen markieren
- Begruendung erfassen
- Issue resolve/splitten

aber **nicht** `serialRequired` inhaltlich umstellen (`src/components/run-detail/IssueDialog.tsx:644 ff.`).

### Antwort

- **Nein, im aktuellen Step-3-IssueDialog nicht.**
- Die technische Store-Funktion existiert, aber sie ist fuer Step-3-Fehler **nicht freigeschaltet**.

---

## 5. Der S/N-Datenfluss: Wer beruehrt die Nummern wann?

## 5.1 PDF lesen / Rechnung parsen

1. `parseInvoicePDF(...)` liest die Rechnungs-PDF (`src/store/runStore.ts:1272`).
2. Danach baut `createAggregatedInvoiceLines(...)` die initialen Store-Zeilen (`src/store/runStore.ts:1425`, `src/services/invoiceParserService.ts:121`).
3. Dabei sind Serienfelder noch leer:
   - `serialNumber: null` (`src/services/invoiceParserService.ts:166`)
   - `serialRequired: false` (`src/services/invoiceParserService.ts:177`)
   - `serialNumbers: []` (`src/services/invoiceParserService.ts:183`)

Wichtig:

- Der PDF-Parser extrahiert **keine** Seriennummern aus der Rechnung.
- Step 1 initialisiert nur die Datenstruktur.

## 5.2 Artikelliste / S/N-Pflicht kommt erst in Step 2

4. In Step 2 setzt `FalmecMatcher_Master.crossMatch()` die S/N-Pflicht aus dem Artikelstamm:
   - `serialRequired: matchedArticle.serialRequirement ?? false` (`src/services/matchers/modules/FalmecMatcher_Master.ts:442`)

Damit ist `serialRequired` **kein Parser-Ergebnis aus der Rechnung**, sondern ein Match-Ergebnis gegen Stammdaten.

## 5.3 Serienliste-Upload (vor Step 3)

5. Beim Upload der Datei `serialList` startet sofort `preFilterSerialExcel(...)` (`src/store/runStore.ts:734-736`).
6. `SerialFinder` scannt Excel-Zeilen und behaelt nur Regex-Treffer (`src/services/serialFinder.ts:93`, `:138-139`).
7. Diese Treffer werden als `preFilteredSerials` gespeichert und gleichzeitig in ein minimales `serialDocument` umgebaut:
   - `invoiceRef` aus `invoiceReference` (`src/store/runStore.ts:738-740`)
   - `serialRaw = row.serialNumber` (`src/store/runStore.ts:741`)
   - `serialCandidate = row.serialNumber` (`src/store/runStore.ts:742`)
   - `consumed = false` (`src/store/runStore.ts:743`)

Wichtig:

- Im heutigen Code stammt auch das `serialDocument` bereits aus **vorvalidierten** `filteredRows`.
- Ein separater alter Serial-XLS-Parser ist im aktiven Pfad nicht mehr sichtbar; der Legacy-Pfad lebt hauptsaechlich als Fallback auf bereits vorhandenes `serialDocument`.

## 5.4 Step 3 Hauptpfad: SerialFinder-Assignment

8. `executeMatcherSerialExtract()` nimmt zuerst den neuen Pfad, **wenn `preFilteredSerials.length > 0`** (`src/store/runStore.ts:3600`).
9. `validateAgainstInvoice(...)` filtert auf die 5-stellige Rechnungsreferenz aus `currentRun.invoice.fattura` (`src/store/runStore.ts:3603-3604`, `src/services/serialFinder.ts:166-176`).
10. Aus den validen Zeilen wird eine `ean -> serial[]` Map gebaut (`src/store/runStore.ts:3614-3620`).
11. Fuer jede aggregierte Rechnungsposition mit `serialRequired === true` werden bis `qty` S/N gezogen:
    - `serialNumbers: assigned`
    - `serialNumber: assigned[0] ?? null`
    - `serialSource: 'serialList'`
    (`src/store/runStore.ts:3627-3647`)
12. Danach werden Run/Issues/Stats aktualisiert und sofort persistiert:
    - Hard checkpoint via `runPersistenceService.saveRun(...)` (`src/store/runStore.ts:3723-3724`)
    - Payload enthaelt `serialDocument` und `preFilteredSerials` (`src/hooks/buildAutoSavePayload.ts:45-46`)

## 5.5 Step 3 Legacy-Pfad: Matcher-Fallback

13. Wenn `preFilteredSerials` leer sind, faellt der Code auf `matcher.serialExtract(...)` zurueck (`src/store/runStore.ts:3768-3775`).
14. Vorher werden `consumed`-Flags resetet (`src/store/runStore.ts:3770-3772`).
15. Im Matcher:
    - Filter auf `invoiceRef` (`src/services/matchers/modules/FalmecMatcher_Master.ts:490`)
    - ggf. Regex aus `serialRaw` nachziehen (`src/services/matchers/modules/FalmecMatcher_Master.ts:528-530`)
    - dann naechste unconsumed Seriennummer sequentiell auf naechste `serialRequired`-Zeile (`src/services/matchers/modules/FalmecMatcher_Master.ts:552-560`)

Wichtige Altlast:

- Der Legacy-Pfad schreibt nur `serialNumber`/`serialSource`, **nicht** `serialNumbers[]`.
- Er rechnet auch `requiredCount` noch zeilenbasiert statt mengenbasiert (`src/services/matchers/modules/FalmecMatcher_Master.ts:565`).
- Das ist strukturell ein Rest des alten, expandierten Modells.

## 5.6 Nach Step 3: Expansion / Anzeige / Archiv

16. Fuer Anzeige/Matching-Engine werden aggregierte Positionen spaeter expandiert:
    - `expandForDisplay(...)` nimmt `line.serialNumbers[i]` (`src/services/invoiceParserService.ts:343`, `:359`)
    - `run3ExpandFifo(...)` verteilt `serialNumbers[]` auf Einzelzeilen (`src/services/matching/runs/run3ExpandFifo.ts:98-109`)

17. Beim Rehydrieren eines Runs werden `serialDocument` und `preFilteredSerials` wieder geladen:
    - `src/store/runStore.ts:3900-3901`

18. Beim Archivieren geht nur der Lean-Serial-Bestand aus `preFilteredSerials` nach `serial-data.json`:
    - `buildLeanArchive(...)` (`src/services/serialFinder.ts:190`)
    - Schreiben in `archiveService` (`src/services/archiveService.ts:281-288`, `:672-681`)

Wichtig:

- Archiviert wird die **vorvalidierte Upload-Sicht**, nicht ein explizites Orphan-/Assignment-Modell.

---

## Endbild pro Frage

1. **S/N-Format**: Ja, Regex existiert. Im neuen Pfad werden ungueltige Werte still verworfen; im Legacy-Pfad nur gewarnt, nicht als Orphan oder sichtbares Issue gespeichert.
2. **Unterdeckung**: Neues Sammel-Issue `serial-mismatch` (mengenbasiert), altes Sammel-Issue `sn-insufficient-count` (zeilenbasiert).
3. **Ueberdeckung / Orphans**: Kein Orphan-Modell. Neuer Pfad verschluckt Extras still; Legacy kann Step-Status kippen, aber ohne sichtbares Orphan-Issue.
4. **Late-Fix `serialRequired`**: Technisch im Store vorhanden, aber im Step-3-IssueDialog derzeit **nicht** angeboten.
5. **Pipeline**: PDF-Parser initialisiert nur leere Serial-Felder; `serialRequired` kommt aus Step 2; S/N selbst kommen aus dem Upload-PreFilter bzw. Legacy-`serialDocument`; finale Verteilung auf Einzelzeilen passiert erst spaeter ueber `serialNumbers[]` bei Expansion.

---

## Relevante Risiken fuer das geplante Fehlerhandling-Feature

- `sn-regex-failed` ist als Typ/UI vorhanden, wird aber aktuell nicht als echtes Issue instanziert.
- Der Hauptpfad hat **keine** Orphan-Sicht.
- Der Legacy-Pfad kann bei Ueberdeckung `failed/soft-fail` werden, obwohl kein konkretes Issue im Fehler-Center erscheint.
- Hauptpfad und Legacy-Pfad rechnen Unterdeckung unterschiedlich (`qty` vs. Zeilenanzahl).
- Der Legacy-Pfad schreibt noch ins alte Einzelwert-Modell (`serialNumber`) statt ins aktuelle Aggregat-Modell (`serialNumbers[]`).
