# PROJ-44 Round 10 Diagnosebericht

Analysierte Hauptdateien:
- `src/store/runStore.ts`
- `src/components/run-detail/IssueDialog.tsx`

Unterstuetzende Belegstellen:
- `src/components/run-detail/PriceCell.tsx`
- `src/components/ui/popover.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/dialog.tsx`
- `src/lib/errorHandlingConfig.ts`
- `src/components/run-detail/IssuesCenter.tsx`

## 1. Workflow stoppt nicht, Hard-Fail wird ignoriert

### Befund
Die Blocker-Logik in `runStore.ts` ist nach Round 9 nicht mehr an die neuen Einzel-Issues gekoppelt. `advanceToNextStep()` erkennt als Blocker nur noch offene/pending `price-mismatch`-Issues in Schritt 2 und markiert den gerade laufenden Schritt danach pauschal als `ok`.

### Exakte Stellen
- `src/store/runStore.ts:1571-1589`
  - Einziger Guard: `runningStep.stepNo === 2 && globalConfig.blockStep2OnPriceMismatch`
  - Geprueft werden ausschliesslich `i.type === 'price-mismatch'` mit Status `open|pending`.
- `src/store/runStore.ts:1591-1592`
  - Danach wird der laufende Schritt immer auf `ok` gesetzt.
- `src/store/runStore.ts:1614-1617`
  - Auto-Advance Step 2 -> 3 laeuft, sobald Step 2 `ok` oder `soft-fail` ist.
- `src/store/runStore.ts:1638-1653`
  - Auto-Advance Step 3 -> 4 laeuft, sobald Step 3 `ok` oder `soft-fail` ist.
- `src/store/runStore.ts:1537-1555`
  - `updateStepStatus(..., 'failed')` setzt den Run-Status nicht auf `failed`, sondern auf `soft-fail`.

### Warum die neuen Einzel-Issues nicht mehr blockieren
- In Step 2 wird der Step-Status nicht aus offenen Error-Issues abgeleitet, sondern nur aus `noMatchCount`.
  - `src/store/runStore.ts:3548-3549`
  - `src/store/runStore.ts:3627-3644`
- Die neu erzeugten per-position `price-mismatch`- und `inactive-article`-Issues werden zwar an `step2Issues` angehaengt, beeinflussen `step2Status` aber nicht.
  - `src/store/runStore.ts:3564-3591`
  - `src/store/runStore.ts:3594-3620`
- In Step 3 wird der Step-Status nur aus dem Checksum-/Mismatch-Gesamtergebnis berechnet, nicht generisch aus offenen Error-Issues.
  - `src/store/runStore.ts:3756-3759`
  - `src/store/runStore.ts:3808-3823`
  - alternativer Pfad: `src/store/runStore.ts:3885-3894`, `src/store/runStore.ts:3908-3922`

### Ursache
Die Architektur ist halb migriert:
- Issues haben seit Round 9 individuelle `severity`/`status`.
- Die Workflow-Fortschaltung benutzt aber weiterhin nur alte Sammelindikatoren (`noMatchCount`, `checksumMatch`) plus einen Spezialfall fuer `price-mismatch`.
- Es fehlt ein generischer "offenes Error-Issue in aktuellem Step = nicht weiterlaufen"-Check.

## 2. Preis wird nicht gespeichert, manuelle Eingabe schliesst das Fenster

### Befund
Im `IssueDialog` wird ein gewaehlter Preis nicht direkt persistiert, sondern nur in den lokalen `pendingPrice`-State geschrieben. Gleichzeitig sitzt `PriceCell` in einem portalierten `Popover` innerhalb eines portalierten `Dialog`; Interaktionen im Popover koennen vom Dialog als Outside-Interaction gewertet werden. Dadurch geht der Dialog zu, `pendingPrice` wird beim naechsten Oeffnen wieder auf `null` gesetzt, und der Eindruck entsteht: Preis "wird nicht gespeichert". Das manuelle Tippen ist besonders anfaellig fuer diesen Dismiss-Pfad.

### Exakte Stellen
- `src/components/run-detail/IssueDialog.tsx:546-555`
  - `PriceCell.onSetPrice` speichert nur lokal in `pendingPrice`.
- `src/components/run-detail/IssueDialog.tsx:682-688`
  - Erst hier wird wirklich `setManualPriceByPosition(...)` aufgerufen.
- `src/components/run-detail/IssueDialog.tsx:397-410`
  - Bei jedem Issue-Wechsel wird `pendingPrice` hart auf `null` zurueckgesetzt.
- `src/components/run-detail/IssueDialog.tsx:456`
  - Der Dialog schliesst bei `onOpenChange(false)` sofort via `onClose()`.
- `src/components/run-detail/PriceCell.tsx:194-200`
  - Manuelle Eingabe laeuft ueber das `Input.onChange` im Popover.
- `src/components/run-detail/PriceCell.tsx:58-64`
  - `handleCustomPrice()` ruft `onSetPrice(...)` auf und schliesst dann das Popover.
- `src/components/ui/popover.tsx:10-25`
  - `PopoverContent` wird in ein `Portal` gerendert.
- `src/components/ui/dialog.tsx:30-50`
  - `DialogContent` ist modal/portaliert; Outside-Interaction fuehrt standardmaessig zum Schliessen.

### Ursache
- Der Preis-Flow ist zweistufig:
  1. `PriceCell` -> `pendingPrice` (nur lokaler Dialog-State)
  2. erst danach `Loesung anwenden` -> Store-Mutation
- Wenn der Dialog vorher schliesst, ist die Auswahl verloren.
- Das Schliessen passiert nicht wegen eines expliziten `onClose()` im `onChange`, sondern wegen der Kombination `Dialog` + portaliertes `Popover`.

## 3. Auswahlbox fehlt beim Re-Open eines geloesten Preisfehlers

### Befund
Die Preis-Auswahlbox haengt nicht am Issue-Status `resolved`, sondern daran, ob unter den `affectedLines` noch mindestens eine Zeile mit `priceCheckStatus === 'mismatch'` existiert. Nach einer Preis-Korrektur ist genau das nicht mehr der Fall. `reopenIssue()` oeffnet nur das Issue wieder, stellt aber den alten Mismatch-Zustand der Zeile nicht wieder her.

### Exakte Stellen
- `src/components/run-detail/IssueDialog.tsx:421-424`
  - `affectedLines` werden aus `issue.affectedLineIds` aufgeloest.
- `src/components/run-detail/IssueDialog.tsx:528-530`
  - Die PriceBox rendert nur, wenn `affectedLines.find(l => l.priceCheckStatus === 'mismatch')` etwas findet.
- `src/store/runStore.ts:2763-2771`
  - `setManualPriceByPosition()` setzt betroffene Zeilen auf `priceCheckStatus: 'custom'`.
- `src/store/runStore.ts:2807-2808`
  - Danach werden die Issues neu bewertet.
- `src/store/runStore.ts:295-312`
  - `autoResolveIssues()` schliesst das Price-Issue automatisch, wenn kein `mismatch` mehr aktiv ist.
- `src/store/runStore.ts:2517-2528`
  - `reopenIssue()` setzt nur `status`, `resolvedAt`, `resolutionNote`, `escalatedAt`, `escalatedTo` zurueck.

### Ursache
Es gibt keine Rueckverkabelung "Issue reopened -> Line wieder in mismatch setzen" und keine gespeicherte Preis-Auswahl pro Issue. Der Render-Guard schaut auf den aktuellen Line-Zustand, nicht auf den Issue-Status.

## 4. "Loesung anwenden" blockiert weiterhin unnoetig

### Befund
Die `disabled`-Logik beruecksichtigt nur den fluechtigen lokalen `pendingPrice`, nicht den echten Store-/Line-Zustand. Sobald `pendingPrice` verloren geht, verlangt der Button wieder zwingend Text im Textfeld.

### Exakte Stellen
- `src/components/run-detail/IssueDialog.tsx:650-665`
  - Die Preis-Bestaetigungsbox im Resolve-Tab erscheint nur bei `pendingPrice`.
- `src/components/run-detail/IssueDialog.tsx:693`
  - `disabled={issue.type === 'price-mismatch' && pendingPrice ? false : !resolutionNote.trim()}`
- `src/components/run-detail/IssueDialog.tsx:403`
  - `pendingPrice` wird beim Issue-Wechsel wieder geloescht.
- `src/store/runStore.ts:2763-2771`
  - Der echte persistierte Zustand liegt auf den Lines (`unitPriceFinal`, `priceCheckStatus: 'custom'`), wird hier aber nicht abgefragt.

### Ursache
Der Button ist an einen ephemeren UI-State gekoppelt statt an den fachlichen Zustand:
- gewaehlt/persistiert ist im Store die Line,
- freigeschaltet wird aber nur ueber `pendingPrice`.

Darum "ignoriert" der Button den gewaelten Preis, sobald die lokale Auswahl durch Close/Reopen/Reset verloren ist.

## 5. E-Mail-Dropdown verschwunden

### Befund
In der aktuellen `IssueDialog.tsx` gibt es keinerlei Verkabelung mehr fuer ein line-/issue-bezogenes Dropdown auf Basis von `selectedLineIds`. Dieser State existiert im aktuellen `src`-Baum gar nicht mehr. `affectedLines` werden zwar noch berechnet, aber im E-Mail-Tab nicht als Auswahlbox gerendert. Die einzige verbliebene Select-Komponente im E-Mail-Tab ist die Empfaenger-Auswahl, und die haengt ausschliesslich an gespeicherten Mail-Adressen.

### Exakte Stellen
- Repo-Suche: `selectedLineIds` kommt in `src` nicht mehr vor.
- `src/components/run-detail/IssueDialog.tsx:421-424`
  - `affectedLines` werden noch berechnet.
- `src/components/run-detail/IssueDialog.tsx:704-774`
  - Im gesamten E-Mail-Tab gibt es keine Nutzung von `affectedLines` fuer Dropdown-Optionen.
- `src/components/run-detail/IssueDialog.tsx:397-400`
  - Der Mail-Body wird direkt aus `buildIssueClipboardText(issue, invoiceLines)` erzeugt.
- `src/components/run-detail/IssueDialog.tsx:711-724`
  - Die einzige Select-Box dort ist `storedEmails`.
- `src/lib/errorHandlingConfig.ts:62-63`
  - `storedEmails` kommen nur aus `localStorage`.

### Ursache
Die alte line-bezogene Dropdown-Logik wurde entfernt und nicht neu an `affectedLines` oder einen Ersatz-State angeschlossen. Der E-Mail-Tab arbeitet jetzt nur noch mit:
- automatischem Volltext (`buildIssueClipboardText(...)`)
- optionalem Empfaenger-Dropdown aus `storedEmails`

Wenn mit "Dropdown" die Empfaenger-Auswahl gemeint ist, verschwindet sie komplett, sobald `storedEmails.length === 0` ist (`IssueDialog.tsx:711-724`).

### Zusatzrisiko
Die Empfaenger-Select rendert ihr Menu ebenfalls in ein Portal:
- `src/components/ui/select.tsx:61-89`

Das ist innerhalb des modalen Dialogs derselbe Overlay-Stil wie beim Preis-Popover und damit ebenfalls ein potentieller Interaktions-Hotspot. Der eigentliche Wegfall des Dropdowns wird im Code aber primaer durch das fehlende State-/Render-Wiring verursacht, nicht durch `affectedLines`.

## 6. Zombie-Popup nach "Loesung anwenden"

### Befund
Im Click-Handler des eigentlichen "Loesung anwenden"-Buttons fehlt `onClose()` nicht. Beide Pfade schliessen den Dialog bereits korrekt. Ein verifizierter fehlender Close-Aufruf existiert aber an anderer Stelle im selben Dialog: im Pending-Tab bei "Als geloest markieren".

### Exakte Stellen
- regulaerer Resolve-Pfad:
  - `src/components/run-detail/IssueDialog.tsx:432-435`
- Preis-Sonderpfad:
  - `src/components/run-detail/IssueDialog.tsx:684-688`
- fehlender Close im Pending-Tab:
  - `src/components/run-detail/IssueDialog.tsx:802-806`

### Ursache
- Fuer den Button `Loesung anwenden` ist `onClose()` vorhanden.
- Wenn das Popup nach diesem Button offen bleibt, liegt die Ursache in diesen Dateien nicht an einem fehlenden Close-Aufruf in diesem Handler.
- Die belastbare Close-Luecke sitzt beim Pending-Tab-Button `Als geloest markieren`, dort wird nur `resolveIssue(...)` ausgefuehrt.

### Wahrscheinlichere Erklaerung fuer das beobachtete Verhalten
Beim Preis-Flow greifen die Punkte 2 und 4 ineinander:
- Preis-Auswahl ist nur lokaler `pendingPrice`
- dieser geht bei Dialog-Dismiss verloren
- dadurch landet man nicht stabil im erwarteten Erfolgs-/Close-Pfad

## Kurzfazit

Die Round-9-Regressionskette ist im Kern:
- Workflow-Blocker wurden nicht von der alten Sammel-Logik auf die neuen Einzel-Issues umgestellt.
- Der Preis-Fix lebt im Dialog nur als fluechtiger UI-State (`pendingPrice`) statt als persistierte, wiederherstellbare Aktion.
- Reopen, Resolve-Button und Mail-Tab sind nicht auf denselben fachlichen Zustand verdrahtet.
