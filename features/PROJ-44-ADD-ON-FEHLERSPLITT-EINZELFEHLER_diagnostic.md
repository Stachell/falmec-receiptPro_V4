# Diagnosebericht PROJ-44 ADD-ON Fehler-Splitt auf Einzel-Fehler

Stand: 2026-03-22
Scope: reine Ist-Analyse, kein Code geschrieben

## Kurzfazit

Die Codebase ist heute klar auf ein Hybridmodell gebaut:

1. Die Generatoren erzeugen mehrere fachliche Bulk-Issues, die viele Zeilen in `relatedLineIds`/`affectedLineIds` sammeln.
2. Der Store enthaelt bereits Kompensationslogik fuer dieses Bulkmodell (`splitIssue`, `resolveIssueLines`, `autoResolveIssues`, position-basierte Bulk-Setter).
3. Das Frontend rendert an mehreren Stellen bewusst Listen mehrerer betroffener Zeilen, inkl. Overflow-Texten, Multi-Formularen und Checkbox-Splitting.
4. Das groesste Architektur-Risiko ist nicht die absolute Anzahl von 50 Issues, sondern die heutige Vermischung von:
   - aggregierter Rechnungsposition,
   - expandierter Einzelzeile,
   - UI-only `affectedLineIds`,
   - fachlich relevanten `relatedLineIds`.

Wenn ihr auf "1 Rechnungszeile/Position = 1 Issue" umstellt, koennen grosse Teile der Altlogik entfallen. Vorher muss aber sauber entschieden werden, was "eine Zeile" in eurem System exakt bedeutet:

- eine originale Rechnungsposition (`positionIndex` / aggregiert), oder
- eine expandierte physische Zeile (`lineId` nach Expansion).

Der aktuelle Code mischt beides.

## 1. Quellen der Sammel-Fehler

### 1.1 Step 2 Artikel-Issues

#### A. Aktiver Step-2-Pfad: `executeMatcherCrossMatch()` in `src/store/runStore.ts`

Referenz:
- `src/store/runStore.ts:3423-3639`
- Auto-Start Step 2 geht auf diesen Pfad: `src/store/runStore.ts:1600-1606`

Dieser Pfad ist aktuell der relevante produktive Step-2-Generator.

##### A1. Matcher-seitig gebuendelte Artikel-Issues in `FalmecMatcher_Master.crossMatch()`

Datei:
- `src/services/matchers/modules/FalmecMatcher_Master.ts:266-300`

Bulk-Issues:

- `match-artno-not-found`
  - `relatedLineIds: noMatchNoConflict.map(r => r.line.lineId)`
  - `affectedLineIds: noMatchNoConflict.map(r => r.line.lineId)`
  - bundelt alle "kein Artikel gefunden"-Zeilen in EIN Issue

- `match-conflict-id`
  - `relatedLineIds: conflictResults.map(r => r.line.lineId)`
  - `affectedLineIds: conflictResults.map(r => r.line.lineId)`
  - bundelt alle Konflikt-Zeilen in EIN Issue

Zusaetzlich, ebenfalls Bulk in Step 2:

- `supplier-missing`
  - `src/services/matchers/modules/FalmecMatcher_Master.ts:229-243`
  - bundelt alle gematchten Artikel mit fehlender/ungueltiger Lieferantennummer

Bewertung:
- Diese Stelle ist eine der Hauptquellen des Bulkmodells in Step 2.
- Fuer euren Zielzustand muesste hier pro betroffener Position/Zeile genau ein eigenes Issue erzeugt werden.

##### A2. Store-seitig gebuendeltes Preis-Issue in `executeMatcherCrossMatch()`

Datei:
- `src/store/runStore.ts:3553-3580`

Bulk-Issue:

- `price-mismatch`
  - `relatedLineIds: priceMismatchLines.map(l => l.lineId)`
  - `affectedLineIds: priceMismatchLines.map(l => l.lineId)`
  - Message/Details sind positionsbasiert dedupliziert
  - die gespeicherten IDs sind aber NICHT dedupliziert, sondern enthalten alle betroffenen Zeilen

Wichtige Beobachtung:

- `uniquePriceMismatch` dedupliziert nur fuer `message`/`details`.
- Das eigentliche Issue bleibt trotzdem ein Sammel-Issue ueber alle `priceMismatchLines`.
- Das ist genau die fachliche Schere, die euch spaeter zu Splitting/First-unresolved-Line-Workarounds zwingt.

##### A3. Store-seitiges weiteres Bulk-Issue in Step 2

Datei:
- `src/store/runStore.ts:3584-3609`

Bulk-Issue:

- `inactive-article`
  - nicht im Kern eurer Anfrage, aber dieselbe Sammellogik
  - ebenfalls alle betroffenen Zeilen in einem Issue

#### B. Legacy Step-2-Pfad: `executeArticleMatching()` in `src/store/runStore.ts`

Referenzen:
- Generator: `src/store/runStore.ts:353-370`
- Verwendung: `src/store/runStore.ts:2642-2679`
- In-Tree-Aufrufer per `rg`: keine gefunden, Stand 2026-03-22

Bulk-Issue:

- `no-article-match`
  - `buildArticleMatchIssues()`
  - `relatedLineIds: noMatchLines.map(l => l.lineId)`
  - KEIN `affectedLineIds`
  - erzeugt genau EIN Issue fuer alle No-Match-Zeilen

Bewertung:

- Dieser Pfad wirkt derzeit dormant/legacy.
- Er ist trotzdem relevant, weil er ein altes Bulk-Issue-Modell im Store konserviert.
- Besonders heikel: das Issue verletzt die heutige UI-Erwartung, weil `affectedLineIds` fehlt, obwohl `Issue` das Feld laut Typ verlangt.

#### C. Sonderfall Step 2: run-level Blocker, nicht line-basiert

Datei:
- `src/store/runStore.ts:3445-3458`

Issue:

- `no-article-match` bei fehlenden Stammdaten
  - `relatedLineIds: []`
  - kein `affectedLineIds`

Bewertung:

- Das ist kein Kandidat fuer euer 1:1-Zeilenschema.
- Das ist ein systemischer Run-Blocker, kein Zeilenproblem.
- Der sollte im Zielmodell separat als run-level/system issue bestehen bleiben.

### 1.2 Preis-Checks

Die einzige relevante Bulk-Erzeugung fuer Preisabweichungen liegt aktuell im Store:

- `src/store/runStore.ts:3553-3580`

Issue:

- `price-mismatch`
  - EIN Sammel-Issue fuer alle Preisabweichungen des Runs
  - Details sind zusammengezogen
  - IDs enthalten alle betroffenen Zeilen

Technisch auffaellig:

- Die UI muss spaeter aus diesem Bulk-Issue "die naechste noch offene Preisposition" herauspicken.
- Genau dafuer existieren heute die Zusatzkomplexitaeten in `IssuesCenter` und `IssueDialog`.

### 1.3 Step 3 Serial-Issues

#### A. Aktiver Step-3-Pfad: preFiltered SerialFinder-Branch in `executeMatcherSerialExtract()`

Referenzen:
- Branch-Auswahl: `src/store/runStore.ts:3683-3684`
- Bulk-Issue-Erzeugung: `src/store/runStore.ts:3752-3774`

Bulk-Issue:

- `serial-mismatch`
  - `relatedLineIds: underServedLines.map(l => l.lineId)`
  - `affectedLineIds: underServedLines.map(l => l.lineId)`
  - EIN Issue fuer alle unterversorgten S/N-Pflicht-Zeilen

Wichtige Beobachtung:

- Auch hier werden alle betroffenen Positionen/Zeilen in einem Issue gesammelt.
- Message/Details sind aggregiert.

#### B. Legacy Step-3-Pfad: matcher-basierte `serialExtract()`

Referenzen:
- Aufruf des Matchers: `src/store/runStore.ts:3871-3882`
- Issue-Merge in den Store: `src/store/runStore.ts:3908-3910`
- Bulk-Issue im Matcher: `src/services/matchers/modules/FalmecMatcher_Master.ts:597-609`

Bulk-Issue:

- `sn-insufficient-count`
  - `relatedLineIds: unassignedLineIds`
  - `affectedLineIds: unassignedLineIds`
  - EIN Issue fuer alle Zeilen ohne ausreichende Seriennummern

Bewertung:

- Step 3 hat also heute ZWEI Bulk-Quellen:
  - aktiver preFiltered-Pfad -> `serial-mismatch`
  - legacy Matcher-Pfad -> `sn-insufficient-count`

## 2. Splitting-Altlasten im Store

### 2.1 Explizites Partial-Splitting: `splitIssue()`

Datei:
- `src/store/runStore.ts:2474-2512`

Was passiert:

1. `resolvedLineIds` werden aus der UI uebergeben.
2. `remainingLineIds` werden nur gegen `original.affectedLineIds` berechnet.
3. Es werden zwei Issues gebaut:
   - ein geklontes `resolvedClone`
   - ein reduziertes `updatedOriginal`
4. `relatedLineIds` bleiben absichtlich auf dem kompletten Originalsatz stehen.

Warum das eine Altlast ist:

- `affectedLineIds` sind hier nur noch UI-Sicht.
- `relatedLineIds` bleiben fachlich "bulk".
- Damit entstehen zwei Wahrheiten:
  - UI zeigt Teilloesung ueber `affectedLineIds`
  - Auto-Resolve/Jump-Logik arbeitet weiter auf dem vollen `relatedLineIds`-Satz

Das ist genau die Komplexitaet, die der Einzel-Issue-Ansatz eliminieren soll.

### 2.2 UI-getriebenes Splitten im `IssueDialog`

Datei:
- `src/components/run-detail/IssueDialog.tsx:430-438`
- Checkbox-Auswahl: `src/components/run-detail/IssueDialog.tsx:683-723`

Was passiert:

- Wenn nur ein Teil der `affectedLines` angehakt ist, ruft das Dialog `splitIssue(issue.id, selectedLineIds, ...)`.

Warum das heikel ist:

- Die Teilauflosung existiert NUR, weil ein Issue heute mehrere Zeilen enthaelt.
- Im Zielmodell waere das komplett ueberfluessig.

### 2.3 Resolver-Kompatibilitaet fuer gemischte ID-Welten: `resolveIssueLines()`

Datei:
- `src/store/runStore.ts:207-239`

Was der Helper kompensiert:

1. direkte `lineId`-Matches
2. falls das nicht klappt: position-basierter Fallback via Regex auf alte aggregierte IDs

Warum das eine Altlast ist:

- Der Helper existiert nur, weil Issues historisch mal aggregierte IDs und mal expandierte IDs referenzieren.
- Das ist ein starker Hinweis, dass das Issue-Modell schon heute semantisch unsauber ist.

### 2.4 Auto-Resolve als Bulk-Kompensation: `checkIssueStillActive()` + `autoResolveIssues()` + `refreshIssues()`

Referenzen:
- `checkIssueStillActive()`: `src/store/runStore.ts:246-270`
- `autoResolveIssues()`: `src/store/runStore.ts:295-312`
- `refreshIssues()`: `src/store/runStore.ts:2465-2471`

Was passiert:

- Der Store prueft bei einer manuellen Korrektur, ob ein Bulk-Issue ueberhaupt noch irgendwo aktiv ist.
- Erst wenn KEINE der referenzierten Zeilen mehr fehlerhaft ist, wird das gesamte Issue automatisch resolved.

Konsequenz:

- Ein Bulk-Issue bleibt offen, obwohl der User einzelne Positionen bereits korrigiert hat.
- Das ist exakt die Ursache fuer das Splitting-Problem: Teilfortschritt laesst sich mit dem jetzigen Modell nicht sauber abbilden.

### 2.5 Position-basierte Bulk-Setter als Workaround fuer Bulk-Issues

#### A. `setManualPriceByPosition()`

Datei:
- `src/store/runStore.ts:2767-2812`

Verhalten:

- aendert ALLE expandierten Zeilen derselben Position
- feuert anschliessend `refreshIssues(runId)`

Warum Altlast:

- Die Action ist bereits ein direkter Workaround fuer ein Sammel-Issue ueber mehrere Preiszeilen.
- Sie ist nicht fachlich "ein Issue -> eine Zeile", sondern "eine UI-Aktion -> viele Zeilen, damit das Sammel-Issue irgendwann verschwindet".

#### B. `setManualArticleByPosition()`

Datei:
- `src/store/runStore.ts:2816-2928`

Verhalten:

- schreibt den manuellen Artikelfix auf alle expandierten Zeilen derselben Position
- feuert anschliessend `refreshIssues(runId)`

Warum Altlast:

- identisches Muster wie beim Preis
- besonders sichtbar, weil ein Bulk-Artikel-Issue im Dialog mehrere `ArticleMatchCard`s unter EINEM Issue rendert

#### C. `setManualPrice()` (single-line) als all-or-nothing Auto-Resolve

Datei:
- `src/store/runStore.ts:2721-2763`

Verhalten:

- korrigiert nur eine Zeile
- `refreshIssues()` resolved das Sammel-Issue aber erst, wenn keine referenzierte Zeile mehr `mismatch` ist

Auch das ist Bulk-Kompatibilitaet, kein sauberes Einzel-Issue-Modell.

### 2.6 Store-Loch bei Serials: `updateLineSerialData()` refresht Issues NICHT

Datei:
- `src/store/runStore.ts:2941-3009`
- UI-Aufrufer: `src/components/run-detail/SerialFixPopup.tsx:54-63`

Befund:

- Die Serial-Fix-Action bearbeitet eine Position lokal.
- Im Gegensatz zu Preis/Artikel ruft sie danach KEIN `refreshIssues()` und auch kein `autoResolveIssues()`.

Folge:

- Ein Serial-Issue kann nach manueller Korrektur im Store stehenbleiben, bis ein anderer Flow oder manuelles Refresh greift.

Relevanz fuer PROJ-44:

- Das zeigt, dass das aktuelle Bulkmodell selbst heute nicht mehr konsequent beherrscht wird.
- Der geplante Einzel-Issue-Schnitt wuerde solche Inkonsistenzen deutlich reduzieren.

## 3. UI-Abhaengigkeiten und Stolpersteine

### 3.1 `IssuesCenter` / `IssueCard` ist klar auf Mehrfach-Zeilen gebaut

Referenzen:
- Resolver im Card-Body: `src/components/run-detail/IssuesCenter.tsx:143-146`
- PriceCell pickt erste noch offene Mismatch-Zeile: `src/components/run-detail/IssuesCenter.tsx:203-215`
- Isolieren arbeitet mit Array: `src/components/run-detail/IssuesCenter.tsx:217-227`
- Body rendert mehrere Zeilen + Overflow: `src/components/run-detail/IssuesCenter.tsx:285-296`
- Isolate-Handler nimmt `string[]`: `src/components/run-detail/IssuesCenter.tsx:421-427`

Konkrete Mehrfach-Annahmen:

- `affectedLines` ist eine Liste, kein Einzelobjekt.
- UI zeigt mehrere betroffene Positionen untereinander.
- "Zeilen isolieren" erwartet eine Menge von IDs.
- `price-mismatch` waehlt per `affectedLines.find(...)` die naechste noch offene Zeile aus einem Bulk-Issue.

Anpassungsbedarf im Einzel-Issue-Modell:

- `affectedLines` kann zu `affectedLine` vereinfacht werden.
- Overflow-Text und Mehrzeilen-Body werden ueberfluessig.
- `onIsolate` kann auf eine einzelne ID oder einen klaren Singular-Wrapper reduziert werden.
- Der Sonderfall "erste noch offene Preisposition finden" kann entfallen.

### 3.2 `IssueDialog` ist an mehreren Stellen explizit multi-line

#### A. Overview-Tab

Referenzen:
- Resolver: `src/components/run-detail/IssueDialog.tsx:418-420`
- Liste betroffener Positionen: `src/components/run-detail/IssueDialog.tsx:525-539`

Mehrfach-Annahme:

- Anzeige ist explizit auf eine Liste mit Limit 5 + Overflowtext gebaut.

#### B. Artikel-Matching unter EINEM Issue

Referenz:
- `src/components/run-detail/IssueDialog.tsx:578-590`

Mehrfach-Annahme:

- Fuer ein Bulk-Artikel-Issue rendert das Dialog `ArticleMatchCard` fuer JEDE `affectedLine`.
- Das ist einer der sichtbarsten Bulk-Effekte im UI.

Im Zielmodell:

- Ein Issue -> genau eine `ArticleMatchCard`
- keine eingebettete Miniliste mehr

#### C. Loesung-erzwingen-Tab / Split-UI

Referenzen:
- `selectedLineIds` State: `src/components/run-detail/IssueDialog.tsx:378`
- Split-Entscheidung: `src/components/run-detail/IssueDialog.tsx:430-438`
- Checkbox-Liste: `src/components/run-detail/IssueDialog.tsx:683-723`

Mehrfach-Annahme:

- Checkbox-Liste fuer betroffene Zeilen
- "Alle auswaehlen / Alle abwaehlen"
- Text "X von Y Zeilen ausgewaehlt - Issue wird gesplittet"

Im Zielmodell:

- dieser gesamte UI-Block kann entfallen
- `splitIssue` faellt fachlich weg
- "Loesung erzwingen" wird zu einem simplen Resolve fuer genau ein Issue

#### D. Price-Mismatch Workflow im Dialog

Referenzen:
- erste Mismatch-Zeile in Overview: `src/components/run-detail/IssueDialog.tsx:543-575`
- Confirm-Block in Resolve-Tab: `src/components/run-detail/IssueDialog.tsx:665-680`
- Apply-Action: `src/components/run-detail/IssueDialog.tsx:743-757`

Mehrfach-Annahme:

- auch hier wird nur deshalb die "naechste passende Zeile" gesucht, weil das Issue viele Zeilen enthalten kann

### 3.3 `issueLineFormatter.ts` rendert bewusst Mehrfach-Positionen

Referenzen:
- Mailto-Aufbau mit `affectedLines.slice(...)`: `src/lib/issueLineFormatter.ts:52-72`
- Clipboard-Text mit Mehrzeilenblock: `src/lib/issueLineFormatter.ts:156-185`

Mehrfach-Annahme:

- "Betroffene Positionen:"
- Liste mehrerer Zeilen
- Overflowtexte wie "... und X weitere Positionen"

Im Zielmodell:

- diese Ausgaben koennen stark vereinfacht werden
- sie sind aber auch eine Backward-Compat-Frage fuer alte persistierte Bulk-Issues

### 3.4 Step-/Dashboard-Counter werden sich semantisch aendern

Referenzen:
- Workflow-Stepper zeigt `issuesCount`: `src/components/WorkflowStepper.tsx:71-74`
- RunDetail summiert `issuesCount`: `src/pages/RunDetail.tsx:558`
- Index/Home zeigt `row.totalIssues`: `src/pages/Index.tsx:72-76`, `src/pages/Index.tsx:356-366`

Wichtige Folge:

- Heute zaehlen diese Stellen grob "Problembloecke".
- Nach dem Umbau zaehlen sie "offene Einzelaufgaben".
- Das ist vermutlich gewollt, aber UI-semantisch ein echter Shift.

## 4. Performance und technische Risiken

## 4.1 Risiko 1: Das groesste Problem ist semantisch, nicht roh-performant

Der kritischste Punkt ist die unklare Ziel-Entitaet:

- Generatoren fuellen heute oft expandierte `lineId`s in Arrays
- Messages/Details reden gleichzeitig ueber deduplizierte Positionen
- `resolveIssueLines()` kompensiert alte aggregierte IDs per Regex/Fallback

Belege:
- `resolveIssueLines()`: `src/store/runStore.ts:207-239`
- `price-mismatch` dedupliziert nur fuer Text, nicht fuer IDs: `src/store/runStore.ts:3554-3575`

Wenn ihr "Einzel-Fehler" einfuehrt, muesst ihr VOR dem Umbau festziehen:

1. Issue pro originale Rechnungsposition?
2. Issue pro expandierte Einzelzeile?

Solange das nicht geklaert ist, verschiebt ihr die heutige Mehrdeutigkeit nur in kleinere Objekte.

## 4.2 Risiko 2: `resolveIssueLines()` wird bei vielen Issues zum Render-Hotspot

Belege:
- Helper baut jedes Mal `new Map(lines.map(...))`: `src/store/runStore.ts:214-217`
- Aufruf pro `IssueCard`: `src/components/run-detail/IssuesCenter.tsx:143-146`
- Aufruf im `IssueDialog`: `src/components/run-detail/IssueDialog.tsx:418-420`
- weitere Aufrufe im Formatter: `src/lib/issueLineFormatter.ts:52-55`, `src/lib/issueLineFormatter.ts:170-174`

Bewertung:

- 50 Issues sind fuer sich noch kein Problem.
- Aber heute wird die Line-Aufloesung mehrfach pro Render pro Issue neu gerechnet.
- Mit mehr Issues skaliert das ungefaehr in Richtung `issueCount * lineCount`.

Praxisurteil:

- 50 statt 3 Issues ist fuer React/Zustand noch nicht kritisch.
- Aber genau dieser Helper wird im neuen Modell der erste sinnvolle Optimierungskandidat.

## 4.3 Risiko 3: Breite Zustand-Subscriptions verursachen unnoetige Komplett-Render

Belege:
- `IssuesCenter` subscribed breit auf den Store: `src/components/run-detail/IssuesCenter.tsx:325-335`
- `IssueDialog` ebenso: `src/components/run-detail/IssueDialog.tsx:365-374`

Bewertung:

- Beide Komponenten nutzen `useRunStore()` ohne feingranulare Selector-Isolation.
- Jede relevante Aenderung an `issues`, `invoiceLines`, `currentRun` etc. zieht den ganzen Baum mit.
- Mehr Issues bedeuten mehr `IssueCard`s und damit mehr Arbeit pro Update.

Praxisurteil:

- kein Blocker fuer 50 Issues
- aber in Summe mit `resolveIssueLines()` ein realer Render-Kosten-Treiber

## 4.4 Risiko 4: IndexedDB-/Autosave-Kosten steigen linear mit der Anzahl der Issues

Belege:
- Save-Payload enthaelt alle Run-Issues: `src/hooks/buildAutoSavePayload.ts:36-52`
- Debounced AutoSave feuert bei jeder relevanten Issue-Aenderung: `src/hooks/useRunAutoSave.ts:40-75`
- Persistenz serialisiert das komplette Payload via `JSON.stringify(data)`: `src/services/runPersistenceService.ts:120-128`

Bewertung:

- 50 Einzel-Issues statt 3 Bulk-Issues vergroessern Payload und Stringify-Kosten linear.
- Fuer eure lokale SPA ist das wahrscheinlich immer noch unkritisch.
- Der Effekt wird eher in haeufigen Saves und groesseren Archiv-/IndexedDB-Payloads sichtbar als in einer harten Laufzeitgrenze.

Praxisurteil:

- technisch beherrschbar
- kein Hauptargument gegen den Umbau

## 4.5 Risiko 5: Persistierte Alt-Runs bleiben Bulk und werden ungefiltert geladen

Beleg:
- `loadPersistedRun()` merged persistierte Issues direkt zurueck in den Store: `src/store/runStore.ts:3992-3997`

Konsequenz:

- Selbst wenn neue Runs nur noch Einzel-Issues erzeugen, koennen alte persistierte Runs weiterhin Bulk-Issues enthalten.
- Das betrifft:
  - IndexedDB
  - Archiv-Rehydration
  - evtl. alte UI-/Clipboard-/Mail-Pfade

Empfehlung fuer die Architekturentscheidung:

- Entweder Bulk-Issues beim Laden migrieren
- oder UI/Store fuer eine Uebergangszeit dual-read-faehig halten

## 4.6 Risiko 6: Step-/Home-Counter springen sichtbar nach oben

Belege:
- Stepper/RunDetail/Index siehe Abschnitt 3.4

Bewertung:

- kein technischer Fehler
- aber klarer UX-Effekt

Beispiel:

- heute: 3 Bulk-Issues
- nach Umbau: 50 Einzel-Issues

Die App wird dadurch "ehrlicher", aber auch lauter in Counter/Badges.

## 5. Messerscharfe Haupt-Stolpersteine fuer den Architektur-Shift

### Stolperstein A: Heute sind `relatedLineIds` fachlich und `affectedLineIds` UI-seitig entkoppelt

Beleg:
- `splitIssue()` laesst `relatedLineIds` absichtlich vollstaendig stehen und splittet nur `affectedLineIds`
  - `src/store/runStore.ts:2495-2507`

Das ist der staerkste Hinweis, dass das Datenmodell selbst der Kern des Problems ist.

### Stolperstein B: Price- und Serial-Issues sind bereits tief in "erste offene Zeile aus Bulk-Issue ziehen" verdrahtet

Belege:
- `IssuesCenter` PriceCell: `src/components/run-detail/IssuesCenter.tsx:203-215`
- `IssueDialog` PriceCell: `src/components/run-detail/IssueDialog.tsx:543-575`
- Step 3 Bulk-Issue-Erzeugung: `src/store/runStore.ts:3755-3769`

Diese Workarounds koennen im Einzel-Issue-Modell entfallen, muessen aber gezielt aus UI und Store entfernt werden.

### Stolperstein C: Artikel-Issues existieren aktuell in mehreren Dialekten

Heute parallel vorhanden:

- `no-article-match` (legacy, bulk, teils ohne `affectedLineIds`)
- `match-artno-not-found` (matcher, bulk)
- `match-conflict-id` (matcher, bulk)
- run-level `no-article-match` ohne Zeilenreferenzen bei fehlenden Stammdaten

Belege:
- `src/store/runStore.ts:353-370`
- `src/store/runStore.ts:3445-3458`
- `src/services/matchers/modules/FalmecMatcher_Master.ts:266-300`

Das bedeutet:

- Der Umbau ist nicht nur "Issue count hochsetzen".
- Er braucht auch eine Normalisierung der Step-2-Issue-Taxonomie.

### Stolperstein D: Serial-Fix ist heute nicht sauber an das Issue-System zurueckgebunden

Belege:
- `updateLineSerialData()`: `src/store/runStore.ts:2941-3009`
- Aufruf aus Popup: `src/components/run-detail/SerialFixPopup.tsx:54-63`

Das ist ein klares Zeichen, dass Bulk-Issues in Step 3 heute schon operational auf Sand stehen.

## 6. Fazit fuer die naechste Architekturphase

Der Wechsel auf Einzel-Issues ist fachlich absolut konsistent mit dem, was der Code heute schon indirekt erzwingt.

Die groessten Rueckbauziele sind:

1. Sammel-Generatoren in Step 2 und Step 3 eliminieren.
2. `splitIssue` vollstaendig ueberfluessig machen.
3. `IssueDialog` vom Multi-Select-/Checkbox-Splitting befreien.
4. `IssuesCenter`/Formatter von Mehrzeilen-Body und Overflowtexten verschlanken.
5. Vor dem Umbau eine eindeutige SSOT fuer "Issue bezieht sich auf genau eine..." festlegen:
   - Position
   - oder expandierte Zeile

Mein fachlicher Befund:

- Der Umbau ist nicht nur sinnvoll, sondern technisch der sauberere Zustand.
- Die aktuelle Codebase enthaelt bereits mehrere Reparaturschichten, die nur wegen Bulk-Issues existieren.
- Genau diese Schichten sind euer Migrationsziel.
