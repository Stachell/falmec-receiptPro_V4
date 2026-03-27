# PROJ-44 ADD-ON Round 9 Diagnostic

Stand: 2026-03-22

Scope:
- `src/components/run-detail/IssueDialog.tsx`
- `src/components/run-detail/IssuesCenter.tsx`
- `src/lib/issueLineFormatter.ts`
- relevante Store-Actions in `src/store/runStore.ts`
- punktuell `src/types/index.ts` und Issue-Erzeuger zur Einordnung

## Kurzfazit

Das Backend ist bereits auf `1 Issue = 1 originale Rechnungsposition` umgestellt, das UI denkt aber an mehreren Stellen noch in alten Bulk-Mustern:

- Der Dialog hält alte UI-Zustände über mehrere Issues hinweg fest.
- Der "Lösung erzwingen"-Tab ist strukturell noch ein Split-/Checkbox-Workflow.
- `splitIssue` ist im UI weiterhin verkabelt und semantisch obsolet.
- `price-mismatch` hat aktuell einen Sonderworkflow mit Auto-Jump + Sonderbuttontext.
- `no-article-match` rendert weiterhin potenziell mehrere komplette `ArticleMatchCard`s.
- Mehrere generische `.map()`-Renderings sind jetzt redundant, auch wenn sie mit den neuen 1:1-Issues technisch meist nur noch 1 Eintrag zeigen.

---

## 1. Routing-Mechanik und "Fehler wieder öffnen"

### 1.1 Aktuelle UI-Routing-/Statuslage

`IssuesCenter.tsx` trennt rein nach `status`:

- offen: `src/components/run-detail/IssuesCenter.tsx:373`
- pending: `src/components/run-detail/IssuesCenter.tsx:375`
- resolved: `src/components/run-detail/IssuesCenter.tsx:376`

Der Dialog wird nur über `selectedIssue` geöffnet:

- State: `src/components/run-detail/IssuesCenter.tsx:346`
- setzen bei offenen/pending Issues: `src/components/run-detail/IssuesCenter.tsx:594`, `src/components/run-detail/IssuesCenter.tsx:596`, `src/components/run-detail/IssuesCenter.tsx:621`, `src/components/run-detail/IssuesCenter.tsx:623`
- Dialog-Mount: `src/components/run-detail/IssuesCenter.tsx:669`

Wichtig:
- Erledigte Issues werden in `IssuesCenter.tsx:639-660` nur passiv gerendert.
- Es gibt dort aktuell keinen Button "Wieder öffnen" und auch keinen Weg, ein resolved Issue in den Dialog zu laden.
- Einziger aktueller UI-Aufruf von `reopenIssue(...)` ist im Pending-Tab des Dialogs: `src/components/run-detail/IssueDialog.tsx:884`

### 1.2 Store-Aktion `reopenIssue`

Die Store-Aktion ist technisch bereits vorhanden:

- Interface: `src/store/runStore.ts:540`
- Implementierung: `src/store/runStore.ts:2535-2548`

Aktuelles Verhalten:
- setzt nur `status: 'open'`
- schreibt Audit-Log
- räumt **nicht** auf:
  - `resolvedAt`
  - `resolutionNote`
  - `escalatedAt`
  - `escalatedTo`

Beleg:
- `Issue`-Shape: `src/types/index.ts:366-390`
- `reopenIssue`: `src/store/runStore.ts:2535-2548`

Folge:
- technisch kann dieselbe Action auch resolved Issues wieder öffnen
- aber Metadaten des alten Zustands bleiben am Objekt hängen
- das ist für Audit/Revision nicht komplett falsch, aber UI-seitig unsauber, weil ein "wieder offenes" Issue noch Altlasten des vorigen Status trägt

### 1.3 Versteckte Routing-/State-Lecks im Dialog

`IssueDialog` resetet bei Issue-Wechsel nur:

- `storedEmails`
- `emailBody`
- `pendingPrice`

Beleg: `src/components/run-detail/IssueDialog.tsx:400-408`

Nicht resetet werden:

- `activeTab` aus `src/components/run-detail/IssueDialog.tsx:376`
- `resolutionNote` aus `src/components/run-detail/IssueDialog.tsx:377`
- `selectedLineIds` aus `src/components/run-detail/IssueDialog.tsx:378`
- `selectedEmail` aus `src/components/run-detail/IssueDialog.tsx:379`
- `manualEmail` aus `src/components/run-detail/IssueDialog.tsx:380`

Da der Dialog bei `issue === null` nur `return null` macht (`src/components/run-detail/IssueDialog.tsx:424`) und nicht hart unmountet wird, bleiben diese States zwischen zwei geöffneten Issues erhalten.

Das ist für "wieder öffnen" relevant:
- nächstes Issue kann auf falschem Tab starten
- alte Lösungsnotiz kann im neuen Issue stehen
- alte Checkbox-Auswahl kann mitschleppen

### 1.4 Beste KISS-Integration für "Fehler wieder öffnen"

Diagnose-Empfehlung:

1. Minimal und robust:
   In `IssuesCenter.tsx:639-660` direkt bei den erledigten Problemen einen Button "Wieder öffnen" ergänzen.

2. Warum dort:
   - resolved Issues sind aktuell nur dort sichtbar
   - kein zusätzlicher Routing-Pfad nötig
   - kein Öffnen des Dialogs erforderlich
   - geringstes Risiko, weil vorhandene `reopenIssue(...)`-Action direkt wiederverwendet werden kann

3. Falls Dialog-basierter Reopen gewünscht:
   - zuerst resolved Cards anklickbar machen
   - danach `IssueDialog` bei Issue-Wechsel sauber reseten
   - sonst landet der User in alten Tabs/Notizen

### 1.5 Sind die Store-Actions bereits sicher für `positionIndex` vs. expandierte Artikelliste?

#### Sicher / bereits passend für 1:1 + pre/post Step 4

`resolveIssueLines(...)` ist die zentrale Brücke zwischen alten aggregierten IDs und expandierten Zeilen:
- `src/store/runStore.ts:207-239`
- Stufe 1: direkte `lineId`
- Stufe 2: Fallback über `positionIndex`

Dadurch funktionieren UI-Auflösung und Auto-Resolve bereits pre/post Expansion.

Folgende Actions sind bereits `positionIndex`-basiert und damit für aggregiert + expandiert geeignet:

- `setManualPriceByPosition`: `src/store/runStore.ts:2774-2820`
  - matcht `line.positionIndex === positionIndex`
  - zusätzlich auf `runId`
  - wirkt auf alle Zeilen dieser Position
  - danach `refreshIssues(runId)` in `src/store/runStore.ts:2818-2819`

- `setManualArticleByPosition`: `src/store/runStore.ts:2823-2935`
  - gleiches Muster über `positionIndex + runId`
  - wirkt auf alle Zeilen dieser Position
  - danach `refreshIssues(runId)` in `src/store/runStore.ts:2934-2935`

- `updateLineSerialData`: `src/store/runStore.ts:2948-3019`
  - gleiches Muster über `positionIndex + runId`
  - wirkt auf alle Zeilen dieser Position
  - danach `refreshIssues(targetRunId)` in `src/store/runStore.ts:3017-3018`

#### Legacy / nicht positionIndex-basiert

Diese Actions arbeiten weiter nur auf einer `lineId`:

- `setManualPrice`: `src/store/runStore.ts:2728-2770`
- `setManualOrder`: `src/store/runStore.ts:3274-3306`
- `confirmNoOrder`: `src/store/runStore.ts:3308-3336`
- `reassignOrder`: `src/store/runStore.ts:3341-3429`

Bewertung:
- `setManualPrice` ist Altpfad, nicht ideal für das neue Positionsmodell.
- Die Order-Actions sind aktuell **nicht** auf `positionIndex` normiert.
- Für ein künftiges KISS-UI auf Basis "1 Issue = 1 Originalposition" sind die Order-Actions daher der schwächere Teil des Stores.
- Solange das UI dort nur generisch resolved/escalated und keine echte positionsweite Order-Korrektur im Dialog anbietet, ist das noch nicht akut kaputt.
- Wenn Order-Issues später analog zu Preis/Artikel/Serial direkt im Dialog gelöst werden sollen, braucht dieser Bereich höchstwahrscheinlich positionsbasierte Pendants.

---

## 2. Text-Kosmetik: "RE" zu "PDF-Rechnung"

Der exakte String `Preis: RE: 275.00 EUR / Sage: 470.00 EUR` wird hier gebaut:

- `src/lib/issueLineFormatter.ts:110-117`

Konkret:
- `src/lib/issueLineFormatter.ts:115` erzeugt `RE: ... EUR`
- `src/lib/issueLineFormatter.ts:116` erzeugt `Sage: ... EUR`
- `src/lib/issueLineFormatter.ts:117` baut daraus `Preis: ... / ...`

Das läuft sichtbar in:

- `IssuesCenter.tsx` Body via `formatLineForDisplay`: `src/components/run-detail/IssuesCenter.tsx:295`
- Clipboard / Fehlerbericht / Mailtext via `buildIssueClipboardText(...)`: `src/lib/issueLineFormatter.ts:174`

Zusätzliche zweite Preis-Textstelle:

- `src/components/run-detail/IssueDialog.tsx:93-95`

Dort baut `getLineLabel(...)` für `price-mismatch` aktuell:
- `Pos. X: ... — RE ... EUR vs. Sage ... EUR`

Wenn das Wording konsistent auf "PDF-Rechnung" umgestellt werden soll, müssen realistisch **beide** Stellen angepasst werden:

- `issueLineFormatter.ts:115-117`
- `IssueDialog.tsx:93-95`

---

## 3. Abriss-Karte für Checkboxen und Splitting

### 3.1 Checkbox-Liste im "Lösung erzwingen"-Tab

Die komplette Bulk-/Checkbox-Sektion sitzt in:

- Start des Blocks: `src/components/run-detail/IssueDialog.tsx:683`
- "Alle auswählen": `src/components/run-detail/IssueDialog.tsx:686-699`
- einzelne Zeilen mit Checkbox: `src/components/run-detail/IssueDialog.tsx:701-717`
- Split-Hinweistext: `src/components/run-detail/IssueDialog.tsx:719-723`

Zugehöriger State:

- `selectedLineIds`: `src/components/run-detail/IssueDialog.tsx:378`
- Toggle-Funktion: `src/components/run-detail/IssueDialog.tsx:457-461`

### 3.2 UI-Aufruf von `splitIssue`

`splitIssue` wird im Dialog-Handler aufgerufen:

- `src/components/run-detail/IssueDialog.tsx:430-438`
- konkreter Call: `src/components/run-detail/IssueDialog.tsx:432-433`

Store-Wiring im Dialog:

- Destructure: `src/components/run-detail/IssueDialog.tsx:371`

Store-Implementierung:

- Interface: `src/store/runStore.ts:538`
- Implementierung: `src/store/runStore.ts:2481-2532`

### 3.3 Bewertung

Mit dem neuen 1:1-Modell ist dieser komplette Pfad Altlast:

- Checkbox-Mehrfachauswahl ist fachlich nicht mehr nötig.
- "Alle auswählen" ist für 1 Zeile sinnlos.
- Split-Hinweistext ist veraltet.
- `splitIssue` ist semantisch obsolet.

Zusatzproblem:
- `splitIssue` arbeitet weiter auf `affectedLineIds`-Vergleich (`src/store/runStore.ts:2487-2488`)
- das ist historisch ein Bulk-/UI-Display-Konstrukt, nicht das stabile fachliche Routing-Feld

Für Round 9 ist das ein klarer Löschkandidat:

- UI-Checkboxblock raus
- `selectedLineIds` raus
- `toggleLine(...)` raus
- `splitIssue(...)`-Call aus `handleResolve()` raus
- Store-Action `splitIssue` danach ebenfalls entsorgbar

---

## 4. KISS-Workflow für `price-mismatch`

### 4.1 Aktueller Workflow im Dialog

#### Übersicht-Tab

Betroffene Positionen:
- `src/components/run-detail/IssueDialog.tsx:525-540`

Prominenter PriceCell-Block:
- `src/components/run-detail/IssueDialog.tsx:542-575`

Der eigentliche Auto-Jump sitzt hier:

- `src/components/run-detail/IssueDialog.tsx:570`

Kontext:
- `PriceCell` callback setzt erst `pendingPrice`: `src/components/run-detail/IssueDialog.tsx:563-569`
- danach sofort `setActiveTab('resolve')`: `src/components/run-detail/IssueDialog.tsx:570`

Warntext:
- `src/components/run-detail/IssueDialog.tsx:595-600`

Manueller Wechsel in den Resolve-Tab:
- Shortcut-Button `Loesung erzwingen`: `src/components/run-detail/IssueDialog.tsx:622-630`

#### Resolve-Tab

Anzeige des gewählten Pending-Preises:
- `src/components/run-detail/IssueDialog.tsx:665-681`

Button unten:
- `src/components/run-detail/IssueDialog.tsx:740-758`

Der Preis-Sonderpfad sitzt hier:

- `src/components/run-detail/IssueDialog.tsx:743-748`

Sonderlogik:
- wenn `price-mismatch && pendingPrice && currentRun`
- dann `setManualPriceByPosition(...)`
- danach `setPendingPrice(null)` und `onClose()`

Button-Label:
- `"Preis uebernehmen"` bei Pending-Preis: `src/components/run-detail/IssueDialog.tsx:757`
- sonst `"Loesung anwenden"`: `src/components/run-detail/IssueDialog.tsx:757`

Textarea-Zwang:
- Pflichtfeldblock: `src/components/run-detail/IssueDialog.tsx:727-737`
- Disable-Logik: `src/components/run-detail/IssueDialog.tsx:753`

Heutiges Verhalten:
- ohne `pendingPrice` ist der Button weiter an `resolutionNote.trim()` gebunden
- nur der Preis-Sonderpfad darf ohne Textarea feuern

### 4.2 Zusätzlicher Bypass im IssuesCenter

Es gibt außerdem noch einen zweiten Preis-Sofortpfad außerhalb des Dialogs:

- `IssuesCenter.tsx` `IssueCard` PriceCell: `src/components/run-detail/IssuesCenter.tsx:203-215`
- Parent-Wiring auf `setManualPriceByPosition(...)`: `src/components/run-detail/IssuesCenter.tsx:598-600`, `src/components/run-detail/IssuesCenter.tsx:625-627`

Das ist relevant, wenn künftig wirklich ein einheitlicher KISS-Dialog-Workflow gewollt ist:
- aktuell kann Preisabweichung bereits direkt aus der Card erledigt werden
- das unterläuft den gewünschten "Issue öffnen -> Übersicht -> ggf. Preis wählen -> Resolve-Tab -> Lösung anwenden"-Pfad

### 4.3 Abweichung zum Zielbild

Ziel laut Vorgabe:
- Issue öffnen
- Übersicht sehen
- Preis ggf. wählen
- User klickt selbst auf Tab "Lösung erzwingen"
- dort steht immer der aktuell gewählte Wert
- ein generischer Button "Lösung anwenden"
- kein Textarea-Zwang

Ist-Zustand:

- Auto-Jump vorhanden: `IssueDialog.tsx:570`
- Resolve-Ansicht zeigt Preis nur, wenn vorher tatsächlich `pendingPrice` gesetzt wurde
- Button-Text ist Sonderfall `"Preis uebernehmen"` statt generisch
- Textarea ist weiterhin Pflicht für alle Nicht-`pendingPrice`-Fälle

### 4.4 Diagnose

Für den gewünschten KISS-Pfad müssen im UI weg:

- Auto-Jump `setActiveTab('resolve')`
- Sonderbuttontext `"Preis uebernehmen"`
- Textarea-Pflicht als generelles Resolve-Gate für Preisfälle

Und im Bestand muss beachtet werden:

- Es existiert ein zweiter Sofort-Fix-Pfad im `IssuesCenter`, der sonst dieselbe Vereinfachung unterläuft.

---

## 5. Erweiterte Prüfung: alle anderen Fehlertypen

## 5.1 Zentrale Multi-Render-Stellen im UI

### A. `IssueDialog` Übersicht

Generische Mehrfachanzeige der betroffenen Zeilen:
- `src/components/run-detail/IssueDialog.tsx:525-540`
- konkret `.slice(0, 5).map(...)` in `src/components/run-detail/IssueDialog.tsx:530`

Bewertung:
- betrifft faktisch alle line-bezogenen Issue-Typen
- unter 1:1 meist nur noch 1 Zeile
- strukturell aber noch altes Multi-Listen-UI

### B. `IssueDialog` Spezialfall `no-article-match`

Mehrere komplette Form-Karten:
- `src/components/run-detail/IssueDialog.tsx:578-590`
- konkrete Multi-Render-Stelle: `src/components/run-detail/IssueDialog.tsx:588`

Betroffene Typen:
- `no-article-match`
- `match-artno-not-found`

Bewertung:
- das ist die härteste verbleibende 1:n-Altlast im Dialog
- hier wird nicht nur Text mehrfach gerendert, sondern eine komplette Editier-UI pro Zeile

### C. `IssueDialog` Resolve-Tab

Mehrfach-Checkbox-Rendering:
- `src/components/run-detail/IssueDialog.tsx:683-725`
- `affectedLines.map(...)` in `src/components/run-detail/IssueDialog.tsx:702`

Bewertung:
- gilt generisch für alle Issue-Typen mit betroffenen Zeilen
- unter 1:1 nur noch Scheingerüst
- semantisch direkt mit `splitIssue` verknüpft

### D. `IssuesCenter` IssueCard Body

Mehrfach-Textanzeige:
- `src/components/run-detail/IssuesCenter.tsx:143-150`
- `src/components/run-detail/IssuesCenter.tsx:285-299`
- konkrete Zeilenliste via `displayLines.map(formatLineForDisplay).join('\n')` in `src/components/run-detail/IssuesCenter.tsx:295`

Bewertung:
- generisch für alle line-bezogenen Typen
- technisch noch okay
- für harte KISS-Auslegung später auf Einzeiler umstellbar

### E. `issueLineFormatter.ts` Mail/Clipboard/Report

Mehrfach-Zeilen im Textoutput:
- Mailbody: `src/lib/issueLineFormatter.ts:53-66`
- konkretes Mapping: `src/lib/issueLineFormatter.ts:65`
- Fehlerbericht/Clipboard: `src/lib/issueLineFormatter.ts:169-181`
- konkretes Mapping: `src/lib/issueLineFormatter.ts:174`

Bewertung:
- kein React-Rendering, aber dieselbe Multi-Logik im Text
- unter 1:1 meist nur noch 1 Zeile

## 5.2 Typenscan: wie rendern die anderen Fehlertypen aktuell?

### `no-article-match`

Renderpfade:
- generische betroffene Positionen: `IssueDialog.tsx:525-540`
- Spezialformular: `IssueDialog.tsx:578-590`
- generische Resolve-Checkboxen: `IssueDialog.tsx:683-725`
- IssuesCenter-Body: `IssuesCenter.tsx:285-299`

Umbauziel:
- `ArticleMatchCard` nicht mehr über `affectedLines.map(...)`
- stattdessen nur noch 1 Karte für die eine betroffene Position

### `match-artno-not-found`

Gleicher Spezialpfad wie `no-article-match`:
- `IssueDialog.tsx:579`
- `IssueDialog.tsx:588-590`

Umbauziel:
- gleiches Single-Card-Prinzip

### `match-ean-not-found`

Kein Spezialformular im Dialog.
Aktuell nur generische Listen:
- `IssueDialog.tsx:525-540`
- `IssueDialog.tsx:683-725`
- `IssuesCenter.tsx:285-299`

### `match-conflict-id`

Kein Spezialformular im Dialog.
Aktuell nur generische Listen:
- `IssueDialog.tsx:525-540`
- `IssueDialog.tsx:683-725`
- `IssuesCenter.tsx:285-299`

### `price-mismatch`

Spezialpfade:
- Übersichtsliste: `IssueDialog.tsx:525-540`
- PriceCell-Sonderblock: `IssueDialog.tsx:542-575`
- Resolve-Tab-Pending-Preisblock: `IssueDialog.tsx:665-681`
- generische Resolve-Checkboxen: `IssueDialog.tsx:683-725`
- IssuesCenter Header-PriceCell: `IssuesCenter.tsx:203-215`
- IssuesCenter Body: `IssuesCenter.tsx:285-299`

Bewertung:
- Spezial-UI rendert bereits nur 1 `mismatchLine` via `.find(...)`, nicht per `.map()`
- der Bulk-Altrest sitzt hier primär in Checkbox/Split und im Sonderworkflow, nicht im Spezialblock

### `serial-mismatch`

Kein Spezialformular im Dialog.
Aktuell nur:
- `getLineLabel(...)`: `src/components/run-detail/IssueDialog.tsx:99-101`
- Übersichtsliste: `IssueDialog.tsx:525-540`
- generische Resolve-Checkboxen: `IssueDialog.tsx:683-725`
- IssuesCenter Body: `IssuesCenter.tsx:285-299`

Wichtig:
- Es gibt in `IssueDialog` **keinen** aktuellen `.map()`-Block, der mehrere Seriennummern-Formulare pro `affectedLineIds` rendert.
- Die einzige mehrfache S/N-Eingabe ist der Mengen-Dialog in `ArticleMatchCard`:
  - `IssueDialog.tsx:324-342`
  - das ist mengenbasiert innerhalb **einer** Position, kein Bulk-Issue-Altpfad

### `sn-insufficient-count`

Im UI kein eigener Spezialblock.
Läuft wie `serial-mismatch` über die generischen Listen:
- `IssueDialog.tsx:525-540`
- `IssueDialog.tsx:683-725`
- `IssuesCenter.tsx:285-299`

### `order-no-match`

Kein Spezialformular im Dialog.
Aktuell nur generische Listen:
- `IssueDialog.tsx:525-540`
- `IssueDialog.tsx:683-725`
- `IssuesCenter.tsx:285-299`

Store-seitig relevant:
- UI würde für echte manuelle Order-Reparatur aktuell nur auf lineId-basierte Actions treffen:
  - `setManualOrder`: `runStore.ts:3274-3306`
  - `confirmNoOrder`: `runStore.ts:3308-3336`
  - `reassignOrder`: `runStore.ts:3341-3429`

### `order-incomplete`

Kein Spezialformular.
Nur generische Listen:
- `IssueDialog.tsx:525-540`
- `IssueDialog.tsx:683-725`
- `IssuesCenter.tsx:285-299`

### `order-multi-split`

Kein Spezialformular.
Nur generische Listen:
- `IssueDialog.tsx:525-540`
- `IssueDialog.tsx:683-725`
- `IssuesCenter.tsx:285-299`

### `order-fifo-only`

Kein Spezialformular.
Nur generische Listen:
- `IssueDialog.tsx:525-540`
- `IssueDialog.tsx:683-725`
- `IssuesCenter.tsx:285-299`

### `missing-storage-location`

Kein Spezialformular.
Nur generische Listen:
- `getLineLabel(...)`: `IssueDialog.tsx:102-103`
- `IssueDialog.tsx:525-540`
- `IssueDialog.tsx:683-725`
- `IssuesCenter.tsx:285-299`

### `inactive-article`

Kein Spezialformular.
Nur generische Listen:
- `IssueDialog.tsx:525-540`
- `IssueDialog.tsx:683-725`
- `IssuesCenter.tsx:285-299`

### `parser-error`, `supplier-missing`, `export-no-lines`, run-level Sonderfälle

Diese Typen können ganz ohne Positionsbezug kommen.
Belege:

- `Issue` erlaubt leere `affectedLineIds`: `src/types/index.ts:374-375`
- beispielhafter run-level `no-article-match` ohne Positionsbezug: `src/store/runStore.ts:3455-3468`
- Service-Issues mit leeren Arrays existieren ebenfalls

Bewertung:
- Beim Umbau auf Einzel-Rendering darf nicht blind `affectedLines[0]` vorausgesetzt werden.
- Es bleiben Sonderfälle ohne Zeile, die weiter nur Message/Details rendern können.

## 5.3 Abrissliste: wo genau auf Single-Rendering umbauen?

Pflichtumbauten:

1. `IssueDialog.tsx:588-590`
   - `affectedLines.map(...)` auf genau 1 `ArticleMatchCard` reduzieren

2. `IssueDialog.tsx:683-725`
   - kompletter Checkbox-/Mehrfachauswahl-/Split-Block löschen

3. `IssueDialog.tsx:430-438`
   - `handleResolve()` von Split-Branch befreien

4. `IssuesCenter.tsx:295`
   - generisches Mehrzeilen-Rendering evaluieren; für 1:1 fachlich nur noch Einzeile nötig

5. `IssueDialog.tsx:530`
   - Übersichtsliste evaluieren; Slice/Overflow-Logik ist unter 1:1 redundant

6. `issueLineFormatter.ts:65` und `issueLineFormatter.ts:174`
   - Multi-Line-Textausgaben evaluieren, wenn Mail/Clipboard ebenfalls KISS-einzeilig werden sollen

## 5.4 Was ist bereits faktisch Single-Render?

- `price-mismatch` Spezial-PriceCell im Dialog: `IssueDialog.tsx:543-575`
- `price-mismatch` PriceCell in der Card: `IssuesCenter.tsx:204-215`

Beide arbeiten bereits auf einer einzelnen `mismatchLine` via `.find(...)`.

---

## Schlussbewertung

Die kritischen Frontend-Reste des alten Bulk-Modells sind klar eingrenzbar:

1. der Split-/Checkbox-Block im Resolve-Tab
2. das `splitIssue`-Wiring
3. das Multi-`ArticleMatchCard`-Rendering
4. der Sonderworkflow für `price-mismatch`
5. fehlender Reopen-Einstieg bei erledigten Issues
6. persistente Dialog-States über Issue-Wechsel hinweg

Store-seitig ist der Positionspfad für Preis/Artikel/Serial bereits tragfähig. Die Order-Actions sind dagegen noch lineId-zentriert und damit der Bereich, der bei künftiger Dialog-Vereinfachung am ehesten nachgezogen werden muss.
