# PROJ-44 ADD-ON UI Bugfix Round 12: Diagnosebericht

Stand: 2026-03-24

Ziel dieses Berichts: reine Code-Analyse der vier gemeldeten Regressionen. Es wurden keine Produktivdateien geändert. Alle Zeilenangaben beziehen sich auf den aktuellen Workspace-Stand.

## 1. Workflow-Guard: `blockStep2OnPriceMismatch` blockiert nicht verlässlich

### Befund A: Der harte Default steht aktuell auf `false`

- [`src/store/runStore.ts:670`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L670) bis [`src/store/runStore.ts:688`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L688)
  - `globalConfig.blockStep2OnPriceMismatch` wird in der Initialisierung explizit auf `false` gesetzt.
  - Konkrete Stelle: [`src/store/runStore.ts:683`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L683)

- [`src/types/index.ts:162`](c:\0WERKBANK0\falmec-reicptpro_v4\src\types\index.ts#L162) bis [`src/types/index.ts:166`](c:\0WERKBANK0\falmec-reicptpro_v4\src\types\index.ts#L166)
  - Der Typvertrag dokumentiert denselben Zustand.
  - Konkrete Stelle: [`src/types/index.ts:164`](c:\0WERKBANK0\falmec-reicptpro_v4\src\types\index.ts#L164) kommentiert `// Default: false`.

- [`src/components/SettingsPopup.tsx:789`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\SettingsPopup.tsx#L789)
  - Auch das UI fällt bei fehlendem Feld auf `false` zurück:
  - `const blockStep2OnPriceMismatch = globalConfig.blockStep2OnPriceMismatch ?? false;`

### Befund B: Der Guard selbst ist korrekt verdrahtet, liest aber die falsche Konfig-Quelle für bestehende Runs

- [`src/store/runStore.ts:295`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L295) bis [`src/store/runStore.ts:319`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L319)
  - `isIssueBlockingStep()` blockiert `price-mismatch` nur dann, wenn `config.blockStep2OnPriceMismatch === true`.
  - Konkrete Stelle: [`src/store/runStore.ts:317`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L317) bis [`src/store/runStore.ts:318`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L318)

- [`src/store/runStore.ts:1629`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L1629) bis [`src/store/runStore.ts:1634`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L1634)
  - `advanceToNextStep()` nimmt `const effectiveConfig = run.config ?? globalConfig;`
  - Das bedeutet: Sobald ein Run eine eigene `config` trägt, gewinnt die Run-Snapshot-Konfiguration gegen die aktuelle globale UI-Einstellung.

- [`src/store/runStore.ts:898`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L898) bis [`src/store/runStore.ts:904`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L904)
- [`src/store/runStore.ts:987`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L987) bis [`src/store/runStore.ts:991`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L991)
  - Neue Runs übernehmen `config: globalConfig` als Snapshot zum Erstellungszeitpunkt.

- [`src/store/runStore.ts:735`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L735) bis [`src/store/runStore.ts:747`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L747)
  - `setGlobalConfig()` synchronisiert nur `autoStartStep4` in `currentRun.config`.
  - Für `blockStep2OnPriceMismatch` gibt es keinerlei Sync in den aktiven Run.

- [`src/components/SettingsPopup.tsx:1236`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\SettingsPopup.tsx#L1236) bis [`src/components/SettingsPopup.tsx:1238`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\SettingsPopup.tsx#L1238)
  - Der Switch schreibt nur `setGlobalConfig({ blockStep2OnPriceMismatch: checked })`.
  - Weil `advanceToNextStep()` aber bevorzugt `run.config` liest, kann der Step trotz aktivem Toggle weiterlaufen.

### Diagnose

Der Bug hat zwei Ebenen:

1. Der Werk-Default ist tatsächlich `false`.
2. Selbst wenn der User den Toggle im UI auf `true` setzt, liest der Workflow-Guard bei bestehenden Runs weiterhin den alten `run.config`-Snapshot.

### Was für "ab Werk blockierend" notwendig ist

- Den dokumentierten und initialen Default von `false` auf `true` drehen:
  - [`src/types/index.ts:164`](c:\0WERKBANK0\falmec-reicptpro_v4\src\types\index.ts#L164)
  - [`src/store/runStore.ts:683`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L683)
  - sinnvoll zusätzlich UI-Fallback:
    - [`src/components/SettingsPopup.tsx:789`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\SettingsPopup.tsx#L789)

- Wichtiger als der Default:
  - `setGlobalConfig()` muss den Toggle auch in `currentRun.config` spiegeln, nicht nur `autoStartStep4`.
  - Alternativ muss `advanceToNextStep()` bei diesem Feld fehlende/alte Run-Snapshots defensiv mergen statt stumpf `run.config` zu priorisieren.

Ohne diese zweite Korrektur bleiben bestehende Runs mit altem `false`-Snapshot ungebremst.

## 2. KISS-Flow sabotiert: `IssuesCenter.tsx` resolved eigenmächtig beim Preis-Setzen

### Exakte Stelle

- [`src/components/run-detail/IssuesCenter.tsx:599`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\IssuesCenter.tsx#L599) bis [`src/components/run-detail/IssuesCenter.tsx:605`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\IssuesCenter.tsx#L605)
  - Offene Issues rendern `onBulkSetPrice={(positionIndex, price) => { ... }}`
  - Darin passiert aktuell:
    - [`src/components/run-detail/IssuesCenter.tsx:603`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\IssuesCenter.tsx#L603): `setManualPriceByPosition(...)`
    - [`src/components/run-detail/IssuesCenter.tsx:604`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\IssuesCenter.tsx#L604): `resolveIssue(issue.id, ...)`

### Vergleich im selben File

- [`src/components/run-detail/IssuesCenter.tsx:631`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\IssuesCenter.tsx#L631) bis [`src/components/run-detail/IssuesCenter.tsx:632`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\IssuesCenter.tsx#L632)
  - Im Pending-Block wird nur `setManualPriceByPosition(...)` ausgeführt.
  - Dort gibt es kein zusätzliches `resolveIssue(...)`.

### Diagnose

Der offene Bereich des `IssuesCenter` verletzt den geforderten 2-Step-KISS-Flow direkt im UI:

- Auswahl eines Werts ändert nicht nur das Feld.
- Dieselbe Aktion schließt das Issue sofort.

Das widerspricht exakt der Vorgabe "Wert wählen ändert nur das Feld, der Fehler bleibt OFFEN!".

### Klare Konsequenz

Das `resolveIssue(issue.id, ...)` an [`src/components/run-detail/IssuesCenter.tsx:604`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\IssuesCenter.tsx#L604) muss dort restlos entfernt werden, wenn der KISS-Flow wiederhergestellt werden soll.

## 3. Tote Klick-Logik im `IssueDialog`: innerer Handler fehlt nicht, Problem sitzt an Dialog/Portal-Grenze

### Befund A: In `PriceCell.tsx` sind die inneren Click-Handler vorhanden

- [`src/components/run-detail/PriceCell.tsx:46`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\PriceCell.tsx#L46) bis [`src/components/run-detail/PriceCell.tsx:64`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\PriceCell.tsx#L64)
  - `handleInvoicePrice()`
  - `handleSagePrice()`
  - `handleCustomPrice()`
  - Alle drei rufen `onSetPrice(...)`.

- [`src/components/run-detail/PriceCell.tsx:168`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\PriceCell.tsx#L168) bis [`src/components/run-detail/PriceCell.tsx:183`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\PriceCell.tsx#L183)
  - Die Buttons "Rechnungspreis" und "Sage-Preis (ERP)" sind direkt an diese Handler gebunden.

- [`src/components/run-detail/PriceCell.tsx:202`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\PriceCell.tsx#L202) bis [`src/components/run-detail/PriceCell.tsx:204`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\PriceCell.tsx#L202)
  - Auch der manuelle OK-Button ist verdrahtet.

Ergebnis: Die Hypothese "Fehlt ein Handler auf den inneren Buttons?" ist nach statischer Analyse klar zu verneinen.

### Befund B: `IssueDialog.tsx` hat den `pendingPrice`-Setter korrekt verdrahtet

- [`src/components/run-detail/IssueDialog.tsx:543`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\IssueDialog.tsx#L543) bis [`src/components/run-detail/IssueDialog.tsx:552`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\IssueDialog.tsx#L552)
  - `PriceCell` bekommt im `IssueDialog` ein `onSetPrice`-Callback, das `setPendingPrice(...)` aufruft.

Wenn ein Menüpunkt wirklich durchkommt, müsste `pendingPrice` gesetzt werden.

### Befund C: Der einzige technische Sonderfall des `IssueDialog` ist die Kombination aus modalem Dialog und portalisiertem Popover

- [`src/components/ui/popover.tsx:14`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\ui\popover.tsx#L14) bis [`src/components/ui/popover.tsx:25`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\ui\popover.tsx#L25)
  - `PopoverContent` wird über `PopoverPrimitive.Portal` aus dem Dialog-DOM heraus in ein Portal gerendert.

- [`src/components/run-detail/IssueDialog.tsx:458`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\IssueDialog.tsx#L458) bis [`src/components/run-detail/IssueDialog.tsx:462`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\IssueDialog.tsx#L462)
  - Das modale `DialogContent` blockiert Outside-Interaktionen via `onInteractOutside={(e) => e.preventDefault()}`.

- [`src/components/run-detail/IssuesCenter.tsx:208`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\IssuesCenter.tsx#L208) bis [`src/components/run-detail/IssuesCenter.tsx:213`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\IssuesCenter.tsx#L213)
  - Dieselbe `PriceCell` funktioniert außerhalb des Dialogs mit einem simplen Callback.

### Befund D: Der Wrapper im `IssueDialog` ist nur noch Layout, keinerlei Click-Fallback existiert mehr

- [`src/components/run-detail/IssueDialog.tsx:540`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\IssueDialog.tsx#L540) bis [`src/components/run-detail/IssueDialog.tsx:542`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\IssueDialog.tsx#L540)
  - Der Container um die `PriceCell` ist jetzt rein optisches Layout.
  - Es gibt dort keinen `onClick`, kein `role="button"`, kein Delegations-Fallback mehr.

### Diagnose

Statisch ist Folgendes gesichert:

- `PriceCell` selbst ist verdrahtet.
- `IssueDialog` setzt `pendingPrice`, falls `onSetPrice` ankommt.
- Der Fehler ist auf den `IssueDialog` beschränkt, nicht auf `PriceCell` allgemein.

Daraus folgt als belastbare Schlussfolgerung:

- Die Regression sitzt nicht in einem fehlenden Handler innerhalb von `PriceCell`.
- Die Bruchstelle liegt an der Interaktionskette `DialogContent (modal)` plus `PopoverContent (Portal)`.
- Nach Entfernen des Delegations-Wrappers hängt der gesamte Preis-Commit im `IssueDialog` ausschließlich daran, dass der Click im portalisierten Popover den `PriceCell`-Handler sauber erreicht.

### Bewertung

Das ist eine strukturelle Dialog/Portal-Regression, keine fehlende Button-Verdrahtung. Die aktuelle Codebasis enthält im `IssueDialog` keinen alternativen Pfad mehr, der `pendingPrice` setzen könnte, falls die portalierten Clicks vom Dialog-Kontext geschluckt werden.

Hinweis: Der letzte Satz ist eine Inferenz aus der Struktur der Komponenten. Ein fehlender Inner-Button-Handler ist dagegen direkt widerlegt.

## 4. PDF-Datenverlust bei `reprocessCurrentRun`: kein direkter Reset im Reprocess, aber Persistenz-/Rehydrierungslücke bleibt offen

### Befund A: `reprocessCurrentRun()` setzt Parserdaten nicht direkt zurück

- [`src/store/runStore.ts:2079`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L2079) bis [`src/store/runStore.ts:2113`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L2113)
  - Der Reprocess-Handler:
    - setzt Steps 2-5 zurück
    - entfernt Issues 2-5
    - setzt `currentParsedRunId = runId`
    - startet Step 2 neu
  - Er fasst `parsedInvoiceResult` und `parsedPositions` selbst nicht an.

### Befund B: Die einzigen expliziten Reset-Stellen liegen woanders

- [`src/store/runStore.ts:1445`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L1445) bis [`src/store/runStore.ts:1450`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L1450)
  - `setParsedInvoiceResult(null)` setzt `parsedInvoiceResult = null` und `parsedPositions = []`.

- [`src/store/runStore.ts:1455`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L1455) bis [`src/store/runStore.ts:1461`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L1461)
  - `clearParsedInvoice()` macht dasselbe.

- [`src/store/runStore.ts:761`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L761) bis [`src/store/runStore.ts:765`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L765)
  - Diese Löschung wird beim Upload einer neuen Invoice-Datei ausgelöst, nicht beim Reprocess.

### Befund C: Die UI-Meldung "Keine Parsing-Daten verfügbar" hängt konkret an `parsedInvoiceResult === null`

- [`src/pages/RunDetail.tsx:930`](c:\0WERKBANK0\falmec-reicptpro_v4\src\pages\RunDetail.tsx#L930) bis [`src/pages/RunDetail.tsx:950`](c:\0WERKBANK0\falmec-reicptpro_v4\src\pages\RunDetail.tsx#L950)
  - Der Preview-Zweig rendert nur, wenn `parsedInvoiceResult` truthy ist.
  - Der Text "Keine Parsing-Daten verfügbar" kommt also nicht schon bei leeren `parsedPositions`, sondern konkret bei fehlendem `parsedInvoiceResult`.

### Befund D: Der Round-11-Fix schützt nur `parsedPositions`, nicht `parsedInvoiceResult`

- [`src/hooks/buildAutoSavePayload.ts:42`](c:\0WERKBANK0\falmec-reicptpro_v4\src\hooks\buildAutoSavePayload.ts#L42) bis [`src/hooks/buildAutoSavePayload.ts:44`](c:\0WERKBANK0\falmec-reicptpro_v4\src\hooks\buildAutoSavePayload.ts#L44)
  - `parsedPositions` und `parserWarnings` werden korrekt an `currentParsedRunId === runId` gebunden.
  - `parsedInvoiceResult` wird aber unguarded immer als `current.parsedInvoiceResult ?? null` gespeichert.

Das ist der verbliebene Datenleck-Punkt: Ownership ist für Positionsdaten gelöst, für die eigentliche PDF-Preview aber nicht.

### Befund E: Reprocess lädt fehlende Parserdaten nicht aktiv aus IndexedDB nach

- [`src/store/runStore.ts:706`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L706) bis [`src/store/runStore.ts:711`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L711)
  - `setCurrentRun()` synchronisiert nur `currentParsedRunId`, lädt aber keine Parserdaten.

- [`src/pages/RunDetail.tsx:397`](c:\0WERKBANK0\falmec-reicptpro_v4\src\pages\RunDetail.tsx#L397) bis [`src/pages/RunDetail.tsx:408`](c:\0WERKBANK0\falmec-reicptpro_v4\src\pages\RunDetail.tsx#L408)
  - `loadPersistedRun(decodedRunId)` wird nur aufgerufen, wenn der Run nicht in Memory ist.
  - Ist ein Run-Objekt bereits vorhanden, findet keine Rehydrierung der Parserdaten statt.

- [`src/store/runStore.ts:4188`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L4188) bis [`src/store/runStore.ts:4200`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L4200)
  - Genau hier würden `parsedPositions`, `parserWarnings` und `parsedInvoiceResult` korrekt aus IndexedDB zurück in den Store geladen.
  - `reprocessCurrentRun()` nutzt diesen Pfad aber nicht.

### Diagnose

Ich finde keinen `useEffect` und keinen Reprocess-Zweig, der `parsedPositions` während des Reprocess selbst aktiv auf `[]` zurücksetzt.

Das verbleibende Problem ist stattdessen:

1. `reprocessCurrentRun()` setzt nur die Ownership (`currentParsedRunId`), nicht die eigentlichen Parserdaten.
2. `buildAutoSavePayload()` behandelt `parsedInvoiceResult` weiterhin global und unguarded.
3. Fehlt `parsedInvoiceResult` bereits im Memory-State, wird dieser leere Zustand beim Reprocess nicht repariert und kann per Auto-Save dauerhaft in IndexedDB festgeschrieben werden.
4. `RunDetail` rehydriert Parserdaten nur dann, wenn der Run komplett aus Memory fehlt.

### Kurzurteil

Der Round-11-Fix war unvollständig:

- `currentParsedRunId` repariert nur `parsedPositions`/`parserWarnings`.
- Der eigentliche PDF-Preview-Träger `parsedInvoiceResult` bleibt anfällig.
- Deshalb ist der Fehlerbild-Trigger eher eine Persistenz-/Rehydrierungslücke als ein direkter Reset im Reprocess-Handler.

## Gesamtfazit

Die vier Brandherde sind real und voneinander getrennt:

1. `blockStep2OnPriceMismatch` ist standardmäßig `false` und der Guard liest bei bestehenden Runs den alten `run.config`-Snapshot.
2. `IssuesCenter.tsx` verletzt den KISS-Flow durch ein hartes `resolveIssue(...)` im offenen Bulk-Preis-Shortcut.
3. `PriceCell.tsx` hat keine fehlenden Inner-Handler; die Regression sitzt im `IssueDialog`-Spezialfall Dialog plus portalisiertem Popover.
4. `reprocessCurrentRun()` resettet Parserdaten nicht direkt, aber `parsedInvoiceResult` bleibt in Auto-Save/Rehydrierung unzureichend abgesichert.
