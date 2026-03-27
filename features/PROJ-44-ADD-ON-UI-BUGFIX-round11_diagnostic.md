# PROJ-44 ADD-ON UI BUGFIX Round 11 - Diagnosebericht

Stand: 2026-03-22

Ziel dieses Dokuments ist reine Lageanalyse. Es wurden keine Produktivdateien geändert.

## Kurzfazit

Die sechs Brandherde hängen an drei architektonischen Sollbruchstellen:

1. Der Workflow-Guard trennt nicht sauber zwischen `severity` und fachlicher Blocker-Definition.
2. Store-Actions mischen Datensatz-Update und Issue-Lifecycle, wodurch KISS-Workflows sofort auto-resolven.
3. Die UI verdrahtet Popover/Dialog/Tab-Routing an den falschen Stellen, besonders nach dem Ausrollen.

Wichtiger Kontext vom User:
Der einzige explizit usergesteuerte Workflow-Stop ist der Schieberegler oben rechts im `RunDetail`, der auf denselben Persistenzwert wie der Schalter in den Einstellungen zeigt. Dieser STOP ist also ein bewusster User-Modus und kein Issue-Blocker. Alle anderen Workflow-Blockaden sollen ausschließlich durch echte fachliche Fehler bzw. explizit konfigurierte Issue-Blocker entstehen.

---

## 1. Workflow-Guard ignoriert Warnungen

### Befund

Die aktuelle Guard-Logik in [`src/store/runStore.ts`](../src/store/runStore.ts) ist zweigeteilt:

- Spezifischer Preis-Guard: `advanceToNextStep()` in Zeile 1578-1588 blockiert Step 2 nur für `price-mismatch`, wenn `globalConfig.blockStep2OnPriceMismatch` aktiv ist.
- Generischer Guard: Zeile 1591-1605 blockiert nur `severity === 'error'`.

Relevante Stellen:

- `src/store/runStore.ts:1560-1605`
- `src/store/runStore.ts:1578-1581`
- `src/store/runStore.ts:1593-1598`
- `src/store/runStore.ts:3628-3654`
- `src/types/index.ts:150-170`

Der Widerspruch ist fachlich klar:

- `price-mismatch` wird in Step 2 absichtlich als `severity: 'warning'` erzeugt, siehe `runStore.ts:3642`.
- Gleichzeitig existiert mit `blockStep2OnPriceMismatch` bereits eine fachliche Blocker-Definition im Config-Typ, siehe `types/index.ts:163-166`.
- Der generische Guard kennt diese Blocker-Semantik nicht und fällt wieder auf Severity zurück.

Zusatzfund:

- `blockStep4OnMissingOrder` ist bereits im `RunConfig` vorhanden (`types/index.ts:165-166`), wird aber im Workflow-Guard nirgends ausgewertet. Das bestätigt, dass das Blocking-Modell derzeit unvollständig verdrahtet ist.

### Root Cause

Die Architektur vermischt zwei Ebenen:

- Diagnose-Schweregrad: `error | warning | info`
- Workflow-Blocker: "darf User den Schritt verlassen?"

Das sind nicht dieselben Konzepte. `price-mismatch` ist das Gegenbeispiel: fachlich blockerfähig, aber bewusst nur `warning`.

### Architektur-Lösung

Der Guard sollte nicht mehr auf `severity` prüfen, sondern auf eine zentrale Blocker-Matrix.

KISS-SSOT:

- Neue Helper-Funktion im Store, z. B. `isIssueBlockingStep(issue, stepNo, config)`.
- Diese Funktion entscheidet typbasiert und statusbasiert.
- `advanceToNextStep()` filtert dann auf:
  - gleicher `runId`
  - gleicher `stepNo`
  - `status === 'open' || status === 'pending'`
  - `isIssueBlockingStep(...) === true`

Empfohlene Matrix:

- Step 2:
  - `price-mismatch` nur wenn `config.blockStep2OnPriceMismatch`
  - `no-article-match`, `match-artno-not-found`, `match-ean-not-found`, `match-conflict-id` immer blocker
- Step 4:
  - `order-no-match`, `order-incomplete`, `order-assignment` nur wenn `config.blockStep4OnMissingOrder`
- Step 5:
  - `missing-storage-location`, `export-no-lines` immer blocker
- Step 1:
  - Parser-/Validierungsfehler blockerfähig, aber nicht über Severity allein

Wichtig für Step 4:

- Der STOP vor Step 4 darf ausschließlich über den User-Schieberegler kommen.
- Dieser Pfad ist bereits separat modelliert über `autoStartStep4` in `RunConfig` (`types/index.ts:169-170`) und die Waiting-Dialog-Logik in `runStore.ts:1657-1665` sowie `2408-2416`.
- Er darf deshalb nicht mit Severity-/Issue-Guards vermischt werden.

Damit bleibt das Arbeitsfenster in `RE-Positionen` vor dem Ausrollen exakt der bewusst gewählte User-Modus, während echte Workflow-Blockaden weiter über Issue-Guards laufen.

---

## 2. 2-Step KISS-Flow statt Auto-Resolve

### Befund

Mehrere Store-Actions schließen Issues unmittelbar nach dem Datenupdate:

- `setManualPrice()` ruft `refreshIssues()` in Zeile 2819-2823.
- `setManualPriceByPosition()` ruft `refreshIssues()` in Zeile 2871-2872.
- `setManualArticleByPosition()` ruft `refreshIssues()` in Zeile 2989-2990 und kann danach sogar auto-advancen (`2992-2997`).
- `updateInvoiceLine()` auto-resolved direkt via `autoResolveIssues()` in `2082-2087`.
- `updatePositionLines()` auto-resolved direkt via `autoResolveIssues()` in `2115-2117`.

Relevante Stellen:

- `src/store/runStore.ts:2781-2823`
- `src/store/runStore.ts:2827-2872`
- `src/store/runStore.ts:2876-2997`
- `src/store/runStore.ts:2076-2117`
- `src/components/run-detail/IssueDialog.tsx:381-386`
- `src/components/run-detail/IssueDialog.tsx:552-559`
- `src/components/run-detail/IssueDialog.tsx:653-676`
- `src/components/run-detail/IssueDialog.tsx:694-703`
- `src/components/run-detail/IssuesCenter.tsx:204-215`
- `src/components/run-detail/IssuesCenter.tsx:599-601`

`IssueDialog` hat die gewünschte 2-Step-Mechanik bereits halb eingebaut:

- Im Uebersicht-Tab wird die Auswahl nur in `pendingPrice` gemerkt (`IssueDialog.tsx:552-559`).
- Im Resolve-Tab wird dieser Wert sichtbar angezeigt (`653-676`).
- Beim Klick auf "Loesung anwenden" wird aber `setManualPriceByPosition()` aufgerufen (`696-699`).
- Diese Store-Action triggert sofort `refreshIssues()`, wodurch das Issue implizit geschlossen wird, noch bevor ein expliziter manueller Resolve-Pfad sauber abgeschlossen ist.

Zusatzfund:

- Das Fehlercenter umgeht den 2-Step-Flow komplett. `IssueCard` ruft bei Preisabweichungen direkt `onBulkSetPrice` auf (`IssuesCenter.tsx:208-213`), was in `IssuesCenter.tsx:599-601` direkt auf `setManualPriceByPosition()` verdrahtet ist.

### Root Cause

Die Store-Actions sind nicht sauber getrennt in:

- "Fachdaten ändern"
- "Issue offiziell schließen"

Dadurch ist der UI-Flow nur scheinbar 2-stufig, technisch aber weiterhin 1-stufig.

### Architektur-Lösung

Für KISS braucht es zwei getrennte Ebenen:

1. Persist-only Action
   - schreibt Preis/Artikel in `invoiceLines`
   - aktualisiert Stats
   - resolvt keine Issues
   - startet keinen Auto-Advance

2. Finalize/Resolve Action
   - ruft nach User-Bestätigung `resolveIssue(issue.id, note)` auf
   - optional danach `refreshIssues(runId)` nur zur Re-Synchronisierung anderer Issues

Empfohlene Zielstruktur:

- `setManualPrice()`:
  - bottom-up/local
  - kein `refreshIssues()` mehr, wenn aus KISS-Issue-Flow genutzt
- `setManualPriceByPosition()`:
  - top-down/global
  - ebenfalls ohne Auto-Resolve
- neuer expliziter Abschluss im `IssueDialog`:
  - zuerst Daten schreiben
  - dann `resolveIssue(issue.id, ...)`
  - dann Dialog schließen

Für den Preis-Flow ist fast alles schon vorbereitet:

- `pendingPrice` in `IssueDialog` ist die korrekte Zwischenablage.
- Der Resolve-Tab zeigt den gewählten Wert schon an.
- Es fehlt nur die Entkopplung vom Auto-Resolve im Store.

Für den Artikel-Flow gilt exakt dasselbe Muster:

- `setManualArticleByPosition()` darf im KISS-Issue-Flow nicht sofort `refreshIssues()` und `advanceToNextStep()` auslösen.
- Erst "Wert gewählt", dann "Loesung anwenden".

Empfehlung für die UI:

- `IssueDialog` bleibt der einzige Ort, der einen Preis-/Artikel-Issue final schließt.
- `IssuesCenter` sollte Preis-Fixes nicht mehr direkt committen, sondern den Dialog öffnen oder denselben Pending-Mechanismus nutzen.

---

## 3. Pop-Up-Crash beim Tippen und CSS-Bugs in PriceCell

### Befund

Der eigentliche `PriceCell`-Popover ist in Ordnung verdrahtet:

- `handleCustomPrice()` existiert in `PriceCell.tsx:58-65`.
- Der manuelle OK-Button hat einen `onClick` in `PriceCell.tsx:202-204`.

Der akute Schließ-Bug entsteht nicht im Button selbst, sondern durch die Hülle im `IssueDialog`:

- Der Wrapper um `PriceCell` in `IssueDialog.tsx:539-548` delegiert jeden Klick auf den inneren Trigger-Button.
- `PriceCell` rendert sein `PopoverContent` über ein Radix-Portal (`src/components/ui/popover.tsx:14-24`).
- React-Events aus Portals bubblen durch den React-Tree weiter zum Wrapper.
- Ein Klick in das Input-Feld oder auf den inneren OK-Button des Popovers landet damit wieder im Wrapper und feuert `btn.click()` erneut.
- Ergebnis: Der Popover toggelt sich beim Interagieren selbst wieder zu.

Relevante Stellen:

- `src/components/run-detail/IssueDialog.tsx:539-548`
- `src/components/run-detail/PriceCell.tsx:141-208`
- `src/components/ui/popover.tsx:10-24`

### Warum sich das wie "Fokus-/Radix-Crash" anfühlt

Im UI wirkt es wie ein Fokusproblem zwischen Dialog und Popover, tatsächlich ist es eine Kombination aus:

- Radix Portal
- React Event Bubbling über Portal-Grenzen
- Click-Delegation im `IssueDialog`

Das ist kein klassischer fehlender `onClick` in `PriceCell`.

### CSS-Befunde

In `PriceCell` selbst ist die manuelle Input-Zeile nur mit `className="flex-1 text-sm"` versehen (`PriceCell.tsx:199`).
Dadurch ist die Textfarbe implizit und theme-abhängig.

Die gemeinsame `Input`-Basis setzt keine explizite Vordergrundfarbe, siehe:

- `src/components/ui/input.tsx:10-13`

Zusatzfund außerhalb von `PriceCell`, aber im selben Bedienpfad:

- Im inneren Serial-Dialog von `IssueDialog` werden auf weißem shadcn-Dialog mehrere Inputs und sogar der Titel mit `text-white` gerendert (`IssueDialog.tsx:318`, `338`).
- Das ist ein separater, realer Lesbarkeitsfehler.

### Architektur-Lösung

1. Den Click-Delegations-Wrapper in `IssueDialog.tsx:539-548` entfernen oder strikt auf Trigger-Klicks begrenzen.
2. `PriceCell` nicht über einen outer-wrapper "fernbedienen", sondern den Trigger direkt klickbar lassen.
3. Für verschachtelte Overlays defensiv absichern:
   - `PopoverContent` mit Fokus-/Outside-Handlern nur dort ergänzen, wo nötig
   - aber zuerst den Wrapper-Bug entfernen, das ist hier die Primärursache
4. Eingabefelder mit expliziter Textfarbe versehen:
   - `PriceCell` Input explizit `text-foreground`
   - weiße Texte auf weißem Dialog-Hintergrund im `IssueDialog` entfernen

### Präzises Urteil zum OK-Button

Der OK-Button in `PriceCell.tsx:202-204` hat bereits einen Handler.
Wenn er "nicht reagiert", ist das Symptom sekundär und wird durch das vorzeitige Popover-Toggling ausgelöst.

---

## 4. Routing bei "Wieder öffnen" aus der Tabelle

### Befund

Nach dem Ausrollen verhalten sich beide Tabellen falsch für bereits manuell gelöste Preisfelder:

1. `ItemsTable`
   - Die `PriceCell` bleibt im Expanded-Zustand aktiv editierbar.
   - Verdrahtung: `ItemsTable.tsx:453-459`
   - `handleSetPrice()` schreibt lokal via `setManualPrice()` in `ItemsTable.tsx:193-197`
   - Ergebnis: Ein Klick auf ein bereits manuell gesetztes Feld öffnet wieder direkt das Preis-Popup.

2. `InvoicePreview` / RE-Positionen
   - Nach dem Ausrollen springt die Preiszelle immer zur Artikelliste.
   - Verdrahtung: `InvoicePreview.tsx:252-258` und `582-590`
   - Das ist für offene Korrekturarbeit okay, aber für bereits gelöste/manuelle Felder laut Zielbild falsch.

Relevante Stellen:

- `src/components/run-detail/ItemsTable.tsx:191-197`
- `src/components/run-detail/ItemsTable.tsx:453-459`
- `src/components/run-detail/InvoicePreview.tsx:252-258`
- `src/components/run-detail/InvoicePreview.tsx:582-590`
- `src/components/run-detail/IssuesCenter.tsx:660-669`

### Root Cause

Die Tabellen wissen nur:

- "darf ich editieren?"
- "soll ich zur Artikelliste springen?"

Sie wissen nicht:

- "dieses Feld wurde manuell gesetzt und der passende Issue ist bereits resolved"
- "der einzige offizielle Rückweg ist jetzt Fehlercenter -> Wieder öffnen"

### Architektur-Lösung

Der Routing-Umbau muss an den `PriceCell`-Call-Sites passieren, nicht tief im Store:

1. `ItemsTable`
   - In `ItemsTable.tsx:453-459` bei `currentRun.isExpanded && line.priceCheckStatus === 'custom'` kein aktives Popover mehr öffnen.
   - Stattdessen auf Tab `issues` routen.

2. `InvoicePreview`
   - In `InvoicePreview.tsx:586-589` die Post-Expansion-Navigation verzweigen:
     - offene/nicht korrigierte Felder: weiter wie bisher
     - bereits manuell korrigierte/resolved Felder: Tab `issues`

3. Optional saubere API in `PriceCell`
   - Statt `onJumpToArticleList` ein generisches `onBadgeClick` oder `interactionMode`
   - dann entscheiden die Tabellen bewusst:
     - `edit`
     - `jump-to-items`
     - `jump-to-issues`

Wichtig:

- Das betrifft nur den Zustand nach dem Ausrollen bzw. bereits manuell gelöste Felder.
- Das Step-4-Arbeitsfenster in `RE-Positionen` vor dem Ausrollen bleibt ausschließlich an den persistierten STOP-Schalter gebunden und wird nicht über Tabellenklicks oder Issue-Routing nachgebildet.

---

## 5. PDF-Datensatz weg nach "Neu verarbeiten"

### Befund

`reprocessCurrentRun()` selbst löscht die Parse-Daten nicht direkt:

- In `runStore.ts:2059-2068` werden nur `runs`, `currentRun`, `issues`, `latestDiagnostics` gesetzt.
- `parsedInvoiceResult`, `parsedPositions`, `parserWarnings` werden dort nicht aktiv auf `null` oder `[]` gesetzt.

Der eigentliche Datenverlustpfad ist indirekt und hängt an `currentParsedRunId`:

- `setCurrentRun` setzt nur `currentRun` und synchronisiert den Parse-Owner nicht, siehe `runStore.ts:653`.
- `loadPersistedRun()` setzt dagegen bewusst `currentParsedRunId: runId`, siehe `runStore.ts:4073-4079`.
- `buildAutoSavePayload()` speichert `parsedPositions` und `parserWarnings` nur, wenn `current.currentParsedRunId === runId`, siehe `buildAutoSavePayload.ts:42-43`.

Wenn ein Run also im Memory aktiv ist, aber `currentParsedRunId` nicht auf diesen Run zeigt, passiert beim nächsten Auto-Save:

- `parsedPositions: []`
- `parserWarnings: []`

Relevante Stellen:

- `src/store/runStore.ts:653`
- `src/store/runStore.ts:2042-2073`
- `src/store/runStore.ts:4073-4079`
- `src/hooks/buildAutoSavePayload.ts:42-45`
- `src/pages/RunDetail.tsx:386-393`
- `src/pages/RunDetail.tsx:930-950`

### Root Cause

Nicht `parsedInvoiceResult` wird in `reprocessCurrentRun()` resettet.
Das eigentliche Problem ist:

- `currentParsedRunId` wird beim Aktivieren/Neu-Verarbeiten des Runs nicht sicher auf `runId` zurückgeführt.
- Dadurch wird beim Debounce-AutoSave die PDF-Positionsmenge als leer persistiert.
- Nach Rehydrate oder Reload fehlt dann der PDF-Datensatz in der UI, besonders sichtbar in `RunDetail` -> `InvoicePreview`, das `parsedPositions` und `parsedInvoiceResult` direkt rendert.

### Welches Feld ist der eigentliche Schuldige?

Primär schuldiges Feld:

- `currentParsedRunId`

Direkt sichtbarer Folgeschaden:

- `parsedPositions` wird leer gespeichert
- `parserWarnings` ebenfalls

Sekundär:

- `latestDiagnostics: {}` in `reprocessCurrentRun()` löscht Step-Diagnostics, aber nicht den PDF-Datensatz

### Architektur-Lösung

Beim Start von `reprocessCurrentRun(runId)` muss die Parse-Ownership explizit mitgeführt werden:

- `currentParsedRunId` auf `runId` setzen
- falls vorhanden, `parsedInvoiceResult`, `parsedPositions`, `parserWarnings` bewusst beibehalten

Zusätzlich sollte `setCurrentRun(run)` denselben Ownership-Pointer synchronisieren, sonst bleibt das Problem auch außerhalb von Reprocess latent bestehen.

---

## 6. KISS-Update-Mechanik: Top-Down vs. Bottom-Up

### Aktueller Stand im Store

Bereits sauber getrennt bei Preis:

- lokal/single-line:
  - `setManualPrice(lineId, price)` in `runStore.ts:2781-2823`
- global/by-position:
  - `setManualPriceByPosition(positionIndex, price, runId)` in `runStore.ts:2827-2872`

Noch nicht sauber getrennt bei Artikel:

- global/by-position:
  - `setManualArticleByPosition(positionIndex, data, runId)` in `runStore.ts:2876-2997`
- lokal/single-line:
  - fehlt als business-aware Action

Vorhandene generische Alternativen reichen dafür nicht:

- `updateInvoiceLine()` (`2076-2087`) ist zu generisch und kennt keine Match-/Preis-/Storage-/Serial-Regeln.
- `updatePositionLines()` (`2090-2117`) ist ebenfalls generisch und schreibt immer kaskadierend auf alle Zeilen der Position.

Zusatzbeleg:

- `SerialFixPopup` dokumentiert bereits explizit das Muster "chirurgische Spezial-Action statt falscher Bulk-Action", siehe `src/components/run-detail/SerialFixPopup.tsx:7-8`.

### UI-Bindings heute

Preis:

- `InvoicePreview` vor Expansion:
  - `setManualPrice()` via `InvoicePreview.tsx:244-249`
  - fachlich okay, weil hier pro Position nur die aggregierte RE-Zeile existiert
- `InvoicePreview` nach Expansion:
  - keine Persistierung mehr, nur Jump-Mode (`582-590`)
- `ItemsTable`:
  - `setManualPrice()` via `ItemsTable.tsx:193-197`
  - das ist der korrekte bottom-up/local Pfad
- `IssuesCenter`:
  - `setManualPriceByPosition()` via `IssuesCenter.tsx:599-601`
  - das ist der korrekte top-down/global Pfad
- `IssueDialog`:
  - `setManualPriceByPosition()` via `IssueDialog.tsx:696-699`
  - ebenfalls top-down/global

Artikel:

- `IssueDialog`:
  - `setManualArticleByPosition()` via `IssueDialog.tsx:163-175`
  - top-down/global
- `ItemsTable`:
  - zeigt nur den Marker `articleSource === 'manual'` in `ItemsTable.tsx:407-409`
  - es existiert aktuell kein lokaler Artikel-Edit-Trigger

### Diagnose

Die Preisarchitektur ist grundsätzlich schon nah am Zielbild.

Das Artikelmodell ist es noch nicht:

- top-down vorhanden
- bottom-up fehlt

### Zielarchitektur

Top-Down/Global:

- Trigger-Quellen:
  - `RE-Positionen`
  - `IssueDialog`
  - `IssuesCenter`
- Verhalten:
  - repräsentative `InvoiceLine` ändern
  - danach alle bereits ausgerollten Zeilen derselben `positionIndex` mitziehen
- Actions:
  - Preis: `setManualPriceByPosition`
  - Artikel: `setManualArticleByPosition`

Bottom-Up/Lokal:

- Trigger-Quelle:
  - `Artikelliste` nach dem Ausrollen
- Verhalten:
  - nur die gezielte konkrete Zeile ändern
  - keine Geschwister überschreiben
- Actions:
  - Preis: `setManualPrice` ist bereits passend
  - Artikel: neue line-scoped Spezialaction nötig, z. B. `setManualArticleByLine(lineId, data, runId)`

### Konkrete Bindungsempfehlung

1. `InvoicePreview` vor Step 4 / vor Expansion bleibt der Arbeitsort für RE-Positions-Korrekturen.
2. Ob der Workflow vor Step 4 stoppt, entscheidet nur der persistierte STOP-Schalter (`RunDetail` oben rechts / Einstellungen), nicht ein Issue.
3. `InvoicePreview`, `IssueDialog`, `IssuesCenter` verwenden für post-expansion globale Korrekturen immer die by-position-Varianten.
4. `ItemsTable` verwendet für lokale Eingriffe immer line-scoped Actions.
5. Keine Artikellisten-UI darf künftig `setManualArticleByPosition()` wiederverwenden, wenn nur eine einzelne ausgerollte Zeile gemeint ist.

---

## Schlussbild

Die eigentliche Regression ist kein Einzelbug, sondern ein SSOT-Bruch zwischen:

- Workflow-Blocking
- Datenmutation
- Issue-Lifecycle
- UI-Interaktionsmodus vor/nach Expansion

Wenn Round 11 nur diese vier Schichten wieder sauber trennt, stabilisieren sich alle sechs Brandherde gleichzeitig:

- Blocker typbasiert statt severity-basiert
- Persist-only statt Auto-Resolve in Store-Actions
- Routing an den Tabellen-Call-Sites statt implizit in `PriceCell`
- getrennte Global-/Local-Actions auch für Artikel
