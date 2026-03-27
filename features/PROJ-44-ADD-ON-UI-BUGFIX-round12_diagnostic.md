# PROJ-44-ADD-ON-UI-BUGFIX Round 12: Diagnose- und Tiefenbefund

Stand: 2026-03-24

Dieser Bericht ist reine Code-Analyse. Es wurde kein Produktivcode geändert. Der Maßstab ist der definierte SOLL-Zustand:

- Regel 1: Preisabweichungen blockieren im Standard-Setup hart.
- Regel 2: 2-Step-KISS-Flow. Wertwahl ändert nur Daten oder `pendingPrice`; erst "Lösung anwenden" resolved final.
- Regel 3: Popup-Buttons dürfen keine Dead Clicks erzeugen.
- Regel 4: Reprocess darf die PDF-Datenbasis nie verlieren.

## Executive Summary

Die harte Code-Realität weicht an allen vier Stellen vom SOLL-Zustand ab:

1. Der Preis-Guard ist standardmäßig wirklich auf `false` verdrahtet und wird zusätzlich durch alte `run.config`-Snapshots neutralisiert.
2. Das `IssuesCenter` verletzt den 2-Step-KISS-Flow direkt durch ein eigenmächtiges `resolveIssue(...)` im Bulk-Preis-Shortcut.
3. In `PriceCell` fehlen keine Button-Handler; der Bruch sitzt im Spezialfall `IssueDialog` an der Grenze aus modalem `Dialog` plus portalisiertem `Popover`.
4. `reprocessCurrentRun()` löscht Parserdaten nicht direkt, aber `parsedInvoiceResult` bleibt im Persistenzpfad ungeschützt und `currentParsedRunId` kann über den `RunDetail`-Lifecycle asynchron flackern.

## 1. Brandherd: Workflow rennt trotz Preisabweichung durch

### SOLL-Zustand

Preisabweichungen müssen standardmäßig blockieren. Der Toggle `blockStep2OnPriceMismatch` muss ab Werk `true` sein. Der "Pause"-Schalter (`autoStartStep4`) ist fachlich ein komplett anderes Feature und darf mit der Step-2-Blockade nicht vermischt werden.

### Harte Code-Realität

#### 1A. Der Werk-Default steht aktuell auf `false`

- [`src/store/runStore.ts:670`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L670) bis [`src/store/runStore.ts:688`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L688)
  - `globalConfig` wird initialisiert.
  - Konkreter Verstoß: [`src/store/runStore.ts:683`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L683) setzt `blockStep2OnPriceMismatch: false`.

- [`src/types/index.ts:162`](c:\0WERKBANK0\falmec-reicptpro_v4\src\types\index.ts#L162) bis [`src/types/index.ts:166`](c:\0WERKBANK0\falmec-reicptpro_v4\src\types\index.ts#L166)
  - Der Typvertrag dokumentiert denselben Default.
  - Konkrete Stelle: [`src/types/index.ts:164`](c:\0WERKBANK0\falmec-reicptpro_v4\src\types\index.ts#L164) kommentiert `// Default: false`.

- [`src/components/SettingsPopup.tsx:789`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\SettingsPopup.tsx#L789)
  - Auch die UI fällt bei fehlendem Feld auf `false` zurück:
  - `const blockStep2OnPriceMismatch = globalConfig.blockStep2OnPriceMismatch ?? false;`

#### 1B. Der Guard selbst ist korrekt typbasiert, aber auf literal `true` verdrahtet

- [`src/store/runStore.ts:295`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L295) bis [`src/store/runStore.ts:319`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L319)
  - `isIssueBlockingStep()` behandelt `price-mismatch` nur als Blocker, wenn `config.blockStep2OnPriceMismatch === true`.
  - Konkrete Stelle: [`src/store/runStore.ts:317`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L317) bis [`src/store/runStore.ts:318`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L318).

#### 1C. Bestehende Runs lesen ihren alten Snapshot, nicht die aktuelle UI-Einstellung

- [`src/store/runStore.ts:1629`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L1629) bis [`src/store/runStore.ts:1634`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L1634)
  - `advanceToNextStep()` nutzt:
  - `const effectiveConfig = run.config ?? globalConfig;`
  - Das heißt: Sobald ein Run eine eigene `config` trägt, gewinnt dieser Run-Snapshot gegen `globalConfig`.

- [`src/store/runStore.ts:898`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L898) bis [`src/store/runStore.ts:904`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L904)
- [`src/store/runStore.ts:987`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L987) bis [`src/store/runStore.ts:991`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L991)
  - Neue Runs übernehmen `config: globalConfig` als Snapshot.

- [`src/store/runStore.ts:735`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L735) bis [`src/store/runStore.ts:747`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L747)
  - `setGlobalConfig()` synchronisiert nur `autoStartStep4` in den aktiven Run.
  - Für `blockStep2OnPriceMismatch` fehlt jeglicher Sync.

- [`src/components/SettingsPopup.tsx:1236`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\SettingsPopup.tsx#L1236) bis [`src/components/SettingsPopup.tsx:1238`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\SettingsPopup.tsx#L1238)
  - Der UI-Switch schreibt nur `setGlobalConfig({ blockStep2OnPriceMismatch: checked })`.
  - Weil `advanceToNextStep()` aber `run.config` bevorzugt, kann der Workflow trotz aktivem Schalter weiterlaufen.

#### 1D. Der "Pause"-Schalter ist fachlich getrennt, aber genau diese Sonderbehandlung fehlt dem Preis-Guard

- [`src/types/index.ts:169`](c:\0WERKBANK0\falmec-reicptpro_v4\src\types\index.ts#L169) bis [`src/types/index.ts:170`](c:\0WERKBANK0\falmec-reicptpro_v4\src\types\index.ts#L170)
  - `autoStartStep4` ist ausdrücklich der Step-4-Wartepunkt.

- [`src/store/runStore.ts:686`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L686) bis [`src/store/runStore.ts:687`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L687)
  - Dieser Toggle startet default auf `true`.

- [`src/store/runStore.ts:737`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L737) bis [`src/store/runStore.ts:745`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L737)
  - Genau dieses Feld wird sofort in den aktiven Run gespiegelt.

Damit ist die fachliche Trennung im Code erkennbar. Der Architekturbruch ist nicht Verwechslung mit "Pause", sondern dass der Preis-Guard nicht dieselbe Priorität und nicht dieselbe Run-Sync-Behandlung bekommen hat.

### Verstoß gegen den SOLL-Zustand

- Regel 1 verletzt:
  - Default ist falsch (`false` statt `true`).
  - Bestehende Runs bleiben auf alten Snapshots hängen.

### Nötige Architektur-Lösung

Um den SOLL-Zustand wirklich zu erzwingen, reicht es nicht, nur den Initialwert zu drehen. Notwendig sind vier Schichten:

1. Default-Dokumentation und Initialwert auf `true`:
   - [`src/types/index.ts:164`](c:\0WERKBANK0\falmec-reicptpro_v4\src\types\index.ts#L164)
   - [`src/store/runStore.ts:683`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L683)
   - sinnvoll auch UI-Fallback:
     - [`src/components/SettingsPopup.tsx:789`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\SettingsPopup.tsx#L789)

2. `setGlobalConfig()` muss `blockStep2OnPriceMismatch` genau wie `autoStartStep4` in `currentRun.config` spiegeln.

3. `advanceToNextStep()` darf bei diesem Guard nicht blind an alten Snapshots kleben; fehlende oder veraltete Run-Werte müssen defensiv mit `globalConfig` gemerged werden.

4. Für Alt-Runs braucht es eine Migrationsstrategie oder ein Nullish-Fallback. Sonst laufen bereits persistierte Runs mit `false` weiter durch.

## 2. Brandherd: Sabotage des 2-Step-KISS-Flows in `IssuesCenter.tsx`

### SOLL-Zustand

- Klick auf RE-Preis oder Sage-Preis:
  - ändert nur Daten oder setzt `pendingPrice`
  - resolved nichts
  - refresht nichts
- Erst "Lösung anwenden" im `IssueDialog` schließt das Issue.

### Harte Code-Realität

#### 2A. Im offenen Issue-Block wird sofort resolved

- [`src/components/run-detail/IssuesCenter.tsx:599`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\IssuesCenter.tsx#L599) bis [`src/components/run-detail/IssuesCenter.tsx:605`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\IssuesCenter.tsx#L605)
  - `onBulkSetPrice={(positionIndex, price) => { ... }}`

- Konkrete Sabotage:
  - [`src/components/run-detail/IssuesCenter.tsx:603`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\IssuesCenter.tsx#L603)
    - `setManualPriceByPosition(positionIndex, price, currentRun.id);`
  - [`src/components/run-detail/IssuesCenter.tsx:604`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\IssuesCenter.tsx#L604)
    - `resolveIssue(issue.id, \`Manueller Preis: ...\`);`

#### 2B. Derselbe File zeigt den Widerspruch selbst

- [`src/components/run-detail/IssuesCenter.tsx:631`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\IssuesCenter.tsx#L631) bis [`src/components/run-detail/IssuesCenter.tsx:632`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\IssuesCenter.tsx#L632)
  - Im Pending-Bereich wird nur `setManualPriceByPosition(...)` ausgeführt.
  - Dort fehlt das zusätzliche `resolveIssue(...)`.

### Verstoß gegen den SOLL-Zustand

- Regel 2 verletzt:
  - Der erste Klick löst nicht nur Datenänderung aus.
  - Der erste Klick schließt den Fehler direkt.

### Nötige Architektur-Lösung

Der offene Bulk-Shortcut im `IssuesCenter` darf exakt nur den Datenpfad triggern. Das `resolveIssue(...)` an [`src/components/run-detail/IssuesCenter.tsx:604`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\IssuesCenter.tsx#L604) muss restlos verschwinden. Sonst bleibt der KISS-Flow fachlich kaputt, selbst wenn Store und `IssueDialog` korrekt wären.

## 3. Brandherd: Dead Clicks in `PriceCell.tsx` und `IssueDialog.tsx`

### SOLL-Zustand

Popup-Buttons müssen zuverlässig durchkommen. Ein Klick auf "Rechnungspreis" oder "Sage-Preis" darf nicht im Nirwana enden. Bei Preis-Issues muss danach mindestens `pendingPrice` gesetzt sein oder die Datenänderung sichtbar sein.

### Harte Code-Realität

#### 3A. In `PriceCell.tsx` fehlen keine inneren Button-Handler

- [`src/components/run-detail/PriceCell.tsx:46`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\PriceCell.tsx#L46) bis [`src/components/run-detail/PriceCell.tsx:64`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\PriceCell.tsx#L64)
  - `handleInvoicePrice()`
  - `handleSagePrice()`
  - `handleCustomPrice()`
  - Alle rufen `onSetPrice(...)`.

- [`src/components/run-detail/PriceCell.tsx:168`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\PriceCell.tsx#L168) bis [`src/components/run-detail/PriceCell.tsx:183`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\PriceCell.tsx#L183)
  - Die Buttons im Popover sind korrekt verdrahtet.

- [`src/components/run-detail/PriceCell.tsx:202`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\PriceCell.tsx#L202) bis [`src/components/run-detail/PriceCell.tsx:204`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\PriceCell.tsx#L202)
  - Auch der manuelle OK-Button hat einen Handler.

Ergebnis: Die These "Es fehlt ein Handler auf dem inneren Button" ist durch den Code klar widerlegt.

#### 3B. `IssueDialog.tsx` hat den Empfangs-Callback ebenfalls korrekt

- [`src/components/run-detail/IssueDialog.tsx:543`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\IssueDialog.tsx#L543) bis [`src/components/run-detail/IssueDialog.tsx:552`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\IssueDialog.tsx#L552)
  - `PriceCell` bekommt ein `onSetPrice`-Callback.
  - Dieses Callback setzt `pendingPrice`.

Wenn der Popover-Click dort ankäme, wäre `pendingPrice` nicht leer.

#### 3C. Der kaputte Spezialfall ist die Kombination aus modalem Dialog und portalisiertem Popover

- [`src/components/ui/popover.tsx:14`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\ui\popover.tsx#L14) bis [`src/components/ui/popover.tsx:25`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\ui\popover.tsx#L25)
  - `PopoverContent` wird in ein `Portal` gerendert, also außerhalb des Dialog-Contents.

- [`src/components/run-detail/IssueDialog.tsx:458`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\IssueDialog.tsx#L458) bis [`src/components/run-detail/IssueDialog.tsx:462`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\IssueDialog.tsx#L462)
  - Das `DialogContent` blockiert jede Outside-Interaktion mit `onInteractOutside={(e) => e.preventDefault()}`.

- [`src/components/run-detail/IssuesCenter.tsx:208`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\IssuesCenter.tsx#L208) bis [`src/components/run-detail/IssuesCenter.tsx:213`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\IssuesCenter.tsx#L208)
  - Dieselbe `PriceCell` funktioniert außerhalb des Dialog-Kontexts mit einem simplen Callback.

Damit bleibt als unique failure surface nur der Dialog/Portal-Stack.

#### 3D. Round 11 hat den Wrapper entfernt und damit jeden Fallback aus dem Dialog-Tree entfernt

- Aktueller Zustand:
  - [`src/components/run-detail/IssueDialog.tsx:540`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\IssueDialog.tsx#L540) bis [`src/components/run-detail/IssueDialog.tsx:542`](c:\0WERKBANK0\falmec-reicptpro_v4\src\components\run-detail\IssueDialog.tsx#L540)
  - Der Wrapper um `PriceCell` ist jetzt reines Layout ohne `onClick`.

- Historischer Round-11-Plan:
  - [`features/PROJ-44-ADD-ON-UI-BUGFIX-round11.md:398`](c:\0WERKBANK0\falmec-reicptpro_v4\features\PROJ-44-ADD-ON-UI-BUGFIX-round11.md#L398) bis [`features/PROJ-44-ADD-ON-UI-BUGFIX-round11.md:425`](c:\0WERKBANK0\falmec-reicptpro_v4\features\PROJ-44-ADD-ON-UI-BUGFIX-round11.md#L425)
  - Dort ist dokumentiert, dass der Delegations-Wrapper bewusst entfernt wurde, weil React-Portal-Events zum Wrapper zurückbubblen und `btn.click()` erneut triggern.

### Diagnose

Es gibt zwei harte Aussagen und eine belastbare Inferenz:

#### Harte Aussage 1

Die Click-Handler in `PriceCell` existieren.

#### Harte Aussage 2

Das `IssueDialog` hat einen gültigen Empfängerpfad (`setPendingPrice`).

#### Belastbare Inferenz

Die Clicks werden nicht in `PriceCell` verloren, sondern vorher im modalen Dialogkontext abgefangen:

- `PopoverContent` lebt DOM-seitig außerhalb des `DialogContent`.
- `IssueDialog` markiert solche Interaktionen als "outside".
- Nach Entfernen des Wrappers existiert kein alternativer In-Dialog-Fallback mehr.

Das erklärt exakt das beobachtete Fehlerbild:

- Popover ist sichtbar.
- Button-Klick "tut nichts".
- `pendingPrice` bleibt leer.
- "Lösung anwenden" bleibt disabled.

### Verstoß gegen den SOLL-Zustand

- Regel 3 verletzt:
  - Popup-Interaktion ist architektonisch nicht robust.

### Nötige Architektur-Lösung

Der KISS-konforme Fix liegt nicht im Nachrüsten fehlender Button-Handler, sondern in der Interaktionsarchitektur:

1. `PriceCell` muss im `IssueDialog` in einem Kontext laufen, in dem portalierte Menu-Clicks nicht als fremde Outside-Interaktionen geschluckt werden.
2. Der Dialog darf Popup-Interaktionen nicht global mit einem pauschalen Outside-Intercept abwürgen.
3. Es braucht genau einen klaren Commit-Pfad:
   - Klick im Popover setzt nur `pendingPrice`
   - "Lösung anwenden" resolved final

## 4. Brandherd: PDF-Datenverlust bei `reprocessCurrentRun`

### SOLL-Zustand

`parsedPositions` und `parsedInvoiceResult` müssen Reprocess sicher überleben. Weder Auto-Save noch UI-Lifecycle dürfen die PDF-Basis leeren.

### Harte Code-Realität

#### 4A. `reprocessCurrentRun()` löscht Parserdaten nicht direkt

- [`src/store/runStore.ts:2079`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L2079) bis [`src/store/runStore.ts:2113`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L2113)
  - Reprocess resetet Steps 2-5, Issues und Status.
  - Parserdaten werden dort nicht direkt genullt.
  - Round-11-Fix: [`src/store/runStore.ts:2105`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L2105) bis [`src/store/runStore.ts:2107`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L2107) setzt `currentParsedRunId = runId`.

#### 4B. Die einzigen expliziten Reset-Stellen sitzen anderswo

- [`src/store/runStore.ts:1445`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L1445) bis [`src/store/runStore.ts:1450`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L1450)
  - `setParsedInvoiceResult(null)` leert Preview plus Positionen.

- [`src/store/runStore.ts:1455`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L1455) bis [`src/store/runStore.ts:1461`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L1455)
  - `clearParsedInvoice()` macht denselben Reset.

- [`src/store/runStore.ts:761`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L761) bis [`src/store/runStore.ts:765`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L761)
  - Diese Löschung hängt am Upload einer neuen Rechnung, nicht an Reprocess.

#### 4C. Die sichtbare UI-Fehlermeldung hängt konkret an `parsedInvoiceResult`

- [`src/pages/RunDetail.tsx:930`](c:\0WERKBANK0\falmec-reicptpro_v4\src\pages\RunDetail.tsx#L930) bis [`src/pages/RunDetail.tsx:950`](c:\0WERKBANK0\falmec-reicptpro_v4\src\pages\RunDetail.tsx#L930)
  - Die Meldung "Keine Parsing-Daten verfügbar" erscheint nur, wenn `parsedInvoiceResult` falsy ist.
  - Leere `parsedPositions` allein reichen für genau diesen UI-Text nicht.

Damit ist klar: Das sichtbare Endsymptom ist primär ein `parsedInvoiceResult`-Problem.

#### 4D. `buildAutoSavePayload()` schützt `parsedPositions`, aber nicht `parsedInvoiceResult`

- [`src/hooks/buildAutoSavePayload.ts:36`](c:\0WERKBANK0\falmec-reicptpro_v4\src\hooks\buildAutoSavePayload.ts#L36) bis [`src/hooks/buildAutoSavePayload.ts:44`](c:\0WERKBANK0\falmec-reicptpro_v4\src\hooks\buildAutoSavePayload.ts#L36)
  - `parsedPositions` und `parserWarnings` sind an `currentParsedRunId === runId` gebunden.
  - `parsedInvoiceResult` wird jedoch unguarded immer als `current.parsedInvoiceResult ?? null` gespeichert.

Das ist der zentrale Restschaden von Round 11:

- Ownership-Fix nur für Positionsdaten.
- Keine Ownership-Absicherung für die eigentliche PDF-Preview.

#### 4E. `currentParsedRunId` kann über den `RunDetail`-Lifecycle asynchron überschrieben werden

- [`src/pages/RunDetail.tsx:386`](c:\0WERKBANK0\falmec-reicptpro_v4\src\pages\RunDetail.tsx#L386) bis [`src/pages/RunDetail.tsx:393`](c:\0WERKBANK0\falmec-reicptpro_v4\src\pages\RunDetail.tsx#L386)
  - `useEffect(() => { ...; return () => setCurrentRun(null); }, [decodedRunId, runs, setCurrentRun])`

Wichtig:

- Dieser Cleanup läuft nicht nur beim echten Unmount.
- Er läuft auch bei jeder Änderung von `runs`.
- Reprocess verändert `runs` mehrfach.

- [`src/store/runStore.ts:706`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L706) bis [`src/store/runStore.ts:711`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L706)
  - `setCurrentRun(null)` setzt zugleich `currentParsedRunId: null`.
  - Danach setzt der nächste Effektlauf den Run wieder und schreibt `currentParsedRunId` zurück.

Die User-Vermutung eines asynchronen Ownership-Flatterns ist also fachlich berechtigt: Es gibt einen realen Codepfad, auf dem `currentParsedRunId` während normaler `runs`-Updates kurzzeitig auf `null` fällt.

#### 4F. Rehydrierung ist nicht garantiert, wenn der Run schon in Memory ist

- [`src/pages/RunDetail.tsx:397`](c:\0WERKBANK0\falmec-reicptpro_v4\src\pages\RunDetail.tsx#L397) bis [`src/pages/RunDetail.tsx:408`](c:\0WERKBANK0\falmec-reicptpro_v4\src\pages\RunDetail.tsx#L397)
  - `loadPersistedRun(decodedRunId)` wird nur aufgerufen, wenn der Run nicht schon in Memory ist.

- [`src/store/runStore.ts:4188`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L4188) bis [`src/store/runStore.ts:4200`](c:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts#L4188)
  - Genau dieser Pfad würde `parsedPositions`, `parserWarnings` und `parsedInvoiceResult` korrekt rehydrieren.

Wenn ein Run also bereits in Memory existiert, aber seine Parserdaten unvollständig sind, repariert `RunDetail` das nicht automatisch.

### Diagnose

Der PDF-Verlust kommt nicht aus einem simplen "Reprocess setzt parsedPositions auf []".

Die harte Architektur-Ursache ist eine Dreifach-Lücke:

1. `currentParsedRunId` kann über den `RunDetail`-Cleanup auf `null` flackern.
2. `buildAutoSavePayload()` schützt `parsedInvoiceResult` nicht run-spezifisch.
3. Die Rehydrierung aus IndexedDB wird übersprungen, sobald ein Run-Objekt schon im Memory liegt.

### Verstoß gegen den SOLL-Zustand

- Regel 4 verletzt:
  - Die PDF-Basis ist nicht belastbar gegenüber Reprocess plus UI-/AutoSave-Lifecycle.

### Nötige Architektur-Lösung

Um Reprocess upload-sicher zu machen, braucht es drei harte Garantien:

1. `parsedInvoiceResult` muss denselben Run-Ownership-Guard bekommen wie `parsedPositions`.
2. `currentParsedRunId` darf nicht über einen generischen `setCurrentRun(null)`-Cleanup bei jedem `runs`-Change flackern.
3. Vor oder während `reprocessCurrentRun()` muss die Parserbasis explizit für den Ziel-Run rehydriert oder verifiziert werden, statt still auf den zufälligen Memory-Zustand zu vertrauen.

## Schlussurteil

Round 11 hat zwar die Typen und Kompilierung sauber gehalten, aber fachlich drei KISS-Prinzipien und eine Persistenz-Grundregel verletzt:

- Der Hard-Guard ist nicht wirklich "default-on".
- Der erste Preis-Klick resolved im `IssuesCenter` bereits final.
- Die Popup-Interaktion im `IssueDialog` ist nicht robust.
- Reprocess verlässt sich auf instabile Ownership- und Rehydrierungslogik.

Für den SOLL-Zustand reicht deshalb kein kosmetischer Bugfix. Es braucht eine klare Rückkehr zu diesen Architekturregeln:

1. Hard-Guard default-on und run-sicher.
2. Wertwahl ohne Resolve.
3. Finales Resolve nur über "Lösung anwenden".
4. Parserbasis run-spezifisch, stabil und reprocess-fest.
