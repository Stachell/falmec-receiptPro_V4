# PROJ-49 Workflow Time Safety Guard Diagnostic NEW

Stand: 2026-03-28

Hinweis: Dies ist eine erweiterte zweite Analyseversion. Es wurde kein Produktivcode geaendert. Die einzige neue Datei ist dieser Bericht.

## Ziel der Erweiterung

Diese zweite Fassung beantwortet gezielt drei Punkte:

1. Klarstellung zur Rolle der IndexedDB als "Gedaechtnis" und fachliche Quelle.
2. Detailanalyse, wo die Persistenz heute bewusst oder indirekt veraendert wird.
3. Pruefung, wie manuelle Bearbeitungen, `Loesung anwenden`, `reopenIssue` und Archivschreiben im Fix-Plan mitgesichert werden muessen.

## Kurzfazit vorab

Ja: Die IndexedDB muss hier als belastbares Run-Gedaechtnis behandelt werden.

Nein: Die Loesung sollte nicht darin bestehen, "noch mehr Daten blind in die IndexedDB zu schreiben".

Sondern:

- Wenn die IndexedDB die Wahrheit fuer einen Run sein soll, muss der Workflow vor Reprocess/Auto-Step gezielt aus ihr lesen oder die Uebereinstimmung mit dem Memory-State pruefen.
- In die IndexedDB muss nur dann aktiv neu geschrieben werden, wenn sich der autoritative Run-Zustand wirklich aendert.
- Der aktuelle Code mischt aber Live-Memory, globale Upload-Caches, debounced AutoSave und Archivschreiben noch nicht streng genug auf einer Run-ID-Linie.

## 1. Klarstellung zu Punkt 2: Was ich mit "neu laden" meinte

Ich meinte nicht:

- Dateien oder Daten ohne Grund erneut in die IndexedDB schreiben
- doppelte Datensaetze erzeugen
- die IndexedDB als blossen Zwischenspeicher missverstehen

Ich meinte:

- Reprocess und Auto-Workflow muessen vor Start der naechsten Verarbeitung sicherstellen, dass der Memory-State den korrekten Run-Zustand repraesentiert
- Falls der Memory-State unvollstaendig oder stale ist, muss dieser Zustand aus der bereits vorhandenen IndexedDB oder dem run-spezifischen Dateispeicher rehydriert werden

Wenn IndexedDB hier das Gedaechtnis ist, dann ist die richtige Bewegung in vielen Faellen:

- IndexedDB -> Memory

und nicht:

- Memory -> IndexedDB

Neue Schreibvorgaenge in die IndexedDB sind nur dort fachlich noetig, wo der Run-Zustand bewusst veraendert wurde, z. B.:

- manuelle Korrektur bestaetigt
- Issue geloest oder wieder geoeffnet
- Seriennummern manuell nachgetragen
- Archiv-/Export-Metadaten veraendert

## 2. Neue Kernaussage nach der Vertiefung

Das urspruengliche Problem ist nicht nur ein Timing-Fehler.

Es ist ein SSOT-Problem:

- Die App behandelt die IndexedDB noch nicht konsequent als run-spezifische Wahrheit.
- Mehrere wichtige Felder sind global im Store und nicht hart an `runId`/Upload-Herkunft gebunden.
- Reprocess und Archiv arbeiten dadurch teilweise mit "gerade im Store vorhanden" statt mit "diesem Run gehoerende, verifizierte Datenbasis".

Das erklaert auch deinen berechtigten Einwand:

- Wenn IndexedDB das Gedaechtnis ist, dann muss `Neu verarbeiten` genau darauf sauber zugreifen.
- Der aktuelle Code tut das nur teilweise.

## 3. Inventur: Wo der aktuelle Code Persistenz oder kanonischen Run-Zustand veraendert

## 3.1 Direkte Persistenzpfade in IndexedDB

### A. Debounced AutoSave

- `useRunAutoSave()` speichert den aktiven Run debounced bei Aenderungen in `currentRun`, `invoiceLines`, `issues`, `auditLog`, `parsedInvoiceResult`, `serialDocument`: `src/hooks/useRunAutoSave.ts:49-71`
- Unmount-Flush schreibt ebenfalls nochmal: `src/hooks/useRunAutoSave.ts:87-90`

Fachlich:

- Viele State-Aenderungen landen nicht sofort, sondern zeitversetzt in IndexedDB.
- Das ist fuer Komfort gut, aber fuer SSOT-kritische Workflow-Uebergaenge riskant.

### B. Hard Checkpoint fuer Step 3

- `executeMatcherSerialExtract()` schreibt nach Step 3 aktiv nach IndexedDB: `src/store/runStore.ts:4237-4239`, `src/store/runStore.ts:4337-4339`

Fachlich:

- Step 3 hat bereits eine bewusst harte Persistenz.
- Das bestaetigt, dass die App an kritischen Stellen selbst schon zwischen "normalem AutoSave" und "workflowkritischem Commit" unterscheidet.

### C. Hard Persist fuer manuelle Serial-Korrektur

- `updateLineSerialData()` schreibt sofort nach IndexedDB: `src/store/runStore.ts:3382-3385`

Fachlich:

- Der Serial-Fix ist heute bereits als autoritative Run-Aenderung modelliert.
- Das ist ein wichtiger Referenzpunkt fuer den neuen Plan.

## 3.2 Indirekte Persistenzpfade ueber AutoSave

Diese Actions aendern den kanonischen Run-State, verlassen sich aber fuer IndexedDB auf das debounced AutoSave:

- `setManualPriceByPosition()`: `src/store/runStore.ts:3054`
- `setManualArticleByPosition()`: `src/store/runStore.ts:3102`
- `setManualArticleByLine()`: `src/store/runStore.ts:3200+`
- `resolveIssue()`: `src/store/runStore.ts:2219`
- `reopenIssue()`: `src/store/runStore.ts:2632`
- `confirmManualFix()`: `src/store/runStore.ts:2720`
- `bulkConfirmDraftIssues()`: `src/store/runStore.ts:2759`
- `setManualOrder()`: `src/store/runStore.ts:3672`
- `confirmNoOrder()`: `src/store/runStore.ts:3706`
- `reassignOrder()`: `src/store/runStore.ts:3739`
- `updateInvoiceLine()` fuer Lagerort/sonstige Felder: `src/store/runStore.ts:2162`
- `setBookingDate()` / `incrementExportVersion()`: `src/store/runStore.ts:3396`, `src/store/runStore.ts:3418`

Fachlich:

- Diese Aenderungen sind nicht "nur UI".
- Sie veraendern den autoritativen Run-Zustand.
- Wenn IndexedDB das Gedaechtnis ist, ist ihre spaete Debounce-Persistenz ein Risiko fuer Reload/Reprocess/Archivkonsistenz.

## 3.3 Full-Replace-Risiko beim Persistieren

- `saveRun()` speichert per `store.put(persistedData)`: `src/services/runPersistenceService.ts:133`

Fachlich:

- Jeder Save ersetzt den kompletten persistierten Run-Eintrag.
- Das ist nur dann sicher, wenn der Payload vollstaendig, run-konsistent und verifiziert ist.

## 4. Neue Schluesselbeobachtung: Drafts sind heute faktisch schon persistierbar

Die UI sagt im IssueDialog:

- "Folgende Werte werden bei Klick auf `Loesung anwenden` persistent geschrieben": `src/components/run-detail/IssueDialog.tsx:723`, `src/components/run-detail/IssueDialog.tsx:778`

Der Code macht aber Folgendes:

- `setManualPriceByPosition()` schreibt den neuen Preis sofort in `invoiceLines` und setzt `manualStatus: 'draft'`: `src/store/runStore.ts:3054`
- `setManualArticleByPosition()` schreibt Artikeldaten ebenfalls sofort in `invoiceLines` und setzt `manualStatus: 'draft'`: `src/store/runStore.ts:3102`
- Danach kann das generische AutoSave diese Draft-Zustaende bereits persistieren: `src/hooks/useRunAutoSave.ts:49-71`

Das bedeutet:

- Fachlich sind Drafts heute keine rein fluechtigen Dialogwerte.
- Sie sind bereits Teil des kanonischen Run-States.

Das ist fuer den neuen Plan extrem wichtig.

## 4.1 Konsequenz fuer die Architektur

Es gibt hier zwei moegliche Fachmodelle:

### Modell A

Draft ist ein legitimer persistierbarer Arbeitszustand.

Dann gilt:

- Draft darf in IndexedDB stehen
- `Loesung anwenden` bestaetigt diesen schon vorhandenen Zustand nur noch als `confirmed`
- Reopen stuft ihn gezielt wieder zurueck

### Modell B

Nur bestaetigte Loesungen duerfen persistent werden.

Dann gilt:

- Draft darf nicht direkt `invoiceLines` mutieren
- Draft muss in einen separaten transienten Bearbeitungszustand ausgelagert werden

Nach heutigem Code lebt die App klar naeher an Modell A.

Fuer eine sichere und risikoarme Reparatur empfehle ich deshalb:

- Kurzfristig Modell A explizit anerkennen und absichern
- Nicht mitten in diesem Bugfix still auf Modell B umschwenken

Sonst entsteht ein sehr grosser Nebenkriegsschauplatz.

## 5. Manual-Fix-Semantik, die der neue Plan erhalten muss

## 5.1 Confirmed Article/Price duerfen durch Reprocess nicht ueberschrieben werden

Der aktuelle Schutz ist vorhanden:

- bestaetigte manuelle Artikel werden im Matcher nicht ueberschrieben: `src/store/runStore.ts:3930`
- bestaetigte manuelle Preise werden im Matcher geschuetzt: `src/store/runStore.ts:3933`

Fachlich:

- `confirmManualFix()` ist nicht nur UI-Kosmetik.
- Es ist eine Schutzgrenze fuer spaetere automatische Verarbeitungen.

## 5.2 Manuelle Serials duerfen durch Step 3 nicht ueberschrieben werden

- `executeMatcherSerialExtract()` ueberspringt Zeilen mit `serialSource === 'manual'`: `src/store/runStore.ts:4129`

Fachlich:

- Serial-Fixes sind heute bereits "heilig".
- Jeder neue Guard/Reprocess-Fix muss das beibehalten.

## 5.3 Reopen hat bereits fachliche Ruecksetzregeln

- `reopenIssue()` setzt bei Preis-Issues `custom -> mismatch` und `manualStatus` zurueck: `src/store/runStore.ts:2632+`
- Bei Artikel-Issues wird `confirmed -> draft` zurueckgestuft, nicht komplett geloescht: `src/store/runStore.ts:2669-2670`

Fachlich:

- Der Zustand "gruen bestaetigt bis wieder geoeffnet" ist im Code real vorhanden.
- Der neue Plan darf das nicht verwischen.

## 5.4 Order-Manuellogik ist anders modelliert

Order-Aktionen wie:

- `setManualOrder()`: `src/store/runStore.ts:3672`
- `confirmNoOrder()`: `src/store/runStore.ts:3706`
- `reassignOrder()`: `src/store/runStore.ts:3739`

schreiben direkt final in den Run-State. Dort gibt es kein analoges Draft/Confirmed-Modell.

Fachlich:

- Diese Flows muessen im Regressionstest mitlaufen.
- Sonst kann ein Fix fuer Step 2/3 unbeabsichtigt Order-Manuellogik destabilisieren.

## 6. Neue Schluesselbeobachtung zur Archivkonsistenz

Wenn deine Fachregel lautet:

- "Archiv soll aus dem run-konsistenten IndexedDB-Gedaechtnis auf Platte geschrieben werden"

dann ist der aktuelle Code noch nicht streng genug.

## 6.1 Archiv arbeitet aktuell nicht ausschliesslich aus dem persistierten Run-Snapshot

### A. `archiveRun()` nimmt Live-Memory-Lines und globales `preFilteredSerials`

- `archiveRun()` schreibt `lines` aus `state.invoiceLines`: `src/store/runStore.ts:2835+`
- und nimmt `preFilteredSerials` direkt aus `state.preFilteredSerials`: `src/store/runStore.ts:2848`, `src/store/runStore.ts:2858`

### B. Exportpfade machen dasselbe

- `RunDetail` haengt Archivdaten mit `useRunStore.getState().preFilteredSerials` an: `src/pages/RunDetail.tsx:371`
- `ExportPanel` ebenso: `src/components/run-detail/ExportPanel.tsx:102`

Fachlich:

- Das ist nicht run-isoliert.
- Das ist "aktueller globaler Serial-Cache im Store".

Wenn dieser Cache stale oder von einem anderen Upload beeinflusst ist, kann das Archiv fachlich falsch werden.

## 6.2 `writeArchivePackage()` zieht die Invoice-PDF global aus `fileStorageService`

- `writeArchivePackage()` laedt `invoice` global via `fileStorageService.loadFile('invoice')`: `src/services/archiveService.ts:630`

Fachlich:

- Das ist nicht run-spezifisch.
- Sobald mehrere Run-Kontexte zeitlich nacheinander mit geaenderten Uploads existieren, ist das eine Konsistenzluecke.

## 6.3 `uploadMetadata` ist persistiert, aber nicht der eigentliche Blob-Bezug

- `buildAutoSavePayload()` speichert `uploadMetadata`: `src/hooks/buildAutoSavePayload.ts:73`
- `PersistedRunData` hat `uploadMetadata`: `src/services/runPersistenceService.ts:46`

Aber:

- diese Metadaten sind aktuell nur Namen/Typen/Groessen
- sie reichen nicht, um spaeter run-spezifisch die richtigen Dateien fuer Archiv oder Reprocess wiederherzustellen

Fazit:

- Die App hat heute noch kein vollstaendig run-scoped Datei-Gedaechtnis
- sondern ein Mischmodell aus globalem Upload-Store + run-spezifischem JSON-State + Early Archive

## 7. Ueberarbeitete Hauptdiagnose

Die urspruengliche Diagnose bleibt richtig, wird jetzt aber praeziser:

### Primarer Brandherd

Reprocess und Auto-Workflow arbeiten nicht gegen eine verifizierte run-spezifische Arbeitsgrundlage.

### Sekundaerer Brandherd

Persistenz ist an zu vielen Stellen generisch-debounced und nicht ausreichend zwischen:

- Entwurf
- bestaetigtem Arbeitszustand
- run-spezifischer Wahrheit
- globalem Upload-Cache

getrennt.

### Dritter Brandherd

Archiv und Export lesen teilweise aus globalem Live-State statt aus einer run-geprueften Snapshot-Quelle.

## 8. Revidierter Reparaturplan

## Phase 1: IndexedDB explizit als SSOT fuer Run-Zustand festziehen

Architekturregel festziehen:

- PersistedRunData pro `runId` ist die fachliche Wahrheit fuer:
  - `run`
  - `invoiceLines`
  - `issues`
  - `auditLog`
  - `parsedInvoiceResult`
  - `parsedPositions`
  - `serialDocument`
  - `preFilteredSerials`

Memory ist dann:

- aktive Projektion dieser Wahrheit fuer den gerade geoeffneten Run

Wichtig:

- Kein Step darf fortlaufen, wenn der aktive Memory-State nicht verifiziert auf diesen Run zeigt.

## Phase 2: Preflight Guard nicht nur fuer Steps, sondern fuer SSOT-Synchronitaet

Neuer zentraler Guard, z. B.:

- `ensureRunSnapshotReady(runId, targetStep)`

Dieser Guard muss pruefen:

- existiert PersistedRunData fuer `runId`?
- stimmt Memory mit diesem Snapshot ueberein?
- falls nein: Rehydrierung aus PersistedRunData vor Fortsetzung
- sind Artikel-/Serial-Ableitungen fuer diesen Run verifiziert?
- sind benoetigte Upload-Dateien bzw. deren run-spezifische Ableitungen vorhanden?

Wichtig:

- Reprocess darf erst starten, wenn dieser Guard erfolgreich ist.
- Timer allein duerfen keinen Step mehr freischalten.

## Phase 3: Run-scoped Herkunft fuer abgeleitete Caches einfuehren

Fuer Artikel- und Serial-Caches Herkunftsmetadaten ergaenzen:

- `sourceFileName`
- `uploadedAt`
- `size`
- optional `fingerprint/hash`
- `sourceRunId` oder explizite Run-Bindung dort, wo sinnvoll

Ziel:

- nicht nur "Cache ist da"
- sondern "dieser Cache gehoert exakt zu dieser Datei bzw. diesem Run"

## Phase 4: Persistenz-Strategie in autoritative Commits und normale AutoSaves trennen

### Autoritative Commits sofort schreiben

Empfehlung fuer sofortige IndexedDB-Commits bei:

- `confirmManualFix()`
- `reopenIssue()`
- `resolveIssue()` / `escalateIssue()`, wenn fachlich statusrelevant
- `setManualOrder()`
- `confirmNoOrder()`
- `reassignOrder()`
- `updateInvoiceLine()` bei Lagerort, wenn dies Export-/Archiv-Relevanz hat
- `setBookingDate()` / `incrementExportVersion()` falls Archiv-/Revisionssicherheit gefordert ist

### Normales AutoSave behalten fuer:

- nichtkritische Zwischenstaende
- UI-Navigation
- laufende Arbeitsaenderungen

Begruendung:

- Wenn IndexedDB das Gedaechtnis ist, muessen fachlich finale Zustandswechsel nicht erst auf einen Debounce hoffen.

## Phase 5: Draft/Confirmed-Modell explizit sichern, nicht versehentlich umbauen

Empfehlung fuer diesen Bugfix:

- Draft bleibt persistierbarer Arbeitszustand
- Confirmed bleibt Schutzsignal gegen automatische Ueberschreibung
- Reopen behaelt seine gezielte Rueckstufungslogik

Zusatz:

- UI-/Hilfetexte sollten spaeter angepasst werden, wenn sie "persistiert erst bei `Loesung anwenden`" suggerieren
- aber das ist ein getrenntes, nicht blockierendes UX-Thema

## Phase 6: Archiv und Export auf run-spezifische Snapshot-Quelle umstellen

Wenn dein Fachziel wirklich "Archiv aus dem Gedaechtnis" ist, dann muss der Archivpfad auf eine run-spezifische Quelle umgestellt werden.

Empfehlung:

### A. JSON-Zustand

Vor Archiv/Export:

- PersistedRunData fuer `runId` laden oder gegen Memory verifizieren
- Archivdateien fuer `invoice-lines.json`, `run-report.json`, `run-log.json`, `serial-data.json` aus diesem Snapshot erzeugen

### B. Rohdateien

Der heutige globale `fileStorageService` nach Dateityp reicht fuer run-sichere Archivierung nicht dauerhaft aus.

Moegliche Loesungen:

1. Early Archive als verpflichtende Rohdatei-Sicherung beibehalten und final nur noch ergaenzen
2. oder run-scoped Blob-Speicherung in IndexedDB einfuehren, z. B. Schluessel `runId + type`

Kurzfristig risikoaermer ist Option 1.

## Phase 7: Partial-Overwrite-Schutz einbauen

`saveRun()` darf fachlich sensible Felder nicht mit unverifiziert leeren Daten ueberschreiben.

Mindestens schuetzen:

- `parsedInvoiceResult`
- `parsedPositions`
- `serialDocument`
- `preFilteredSerials`
- `uploadMetadata`

Empfehlung:

- vor `put()` bestehenden Run lesen
- sensible Felder nur ersetzen, wenn der neue Zustand verifiziert und run-passend ist

## 9. Erweiterter Test- und Absicherungsplan

## A. Reprocess und SSOT

1. Run mit validen Daten starten, Seite neu laden, `Neu verarbeiten` -> identischer Zustand.
2. Run mit validen Daten starten, Memory kuenstlich leeren, Reprocess -> Rehydrierung aus IndexedDB funktioniert.
3. Reprocess darf nicht mit stale Artikel-/Serial-Caches starten.

## B. Manual Draft / Confirmed / Reopen

1. Preis-Draft setzen -> nach Reload noch sichtbar, Issue offen.
2. `Loesung anwenden` -> `manualStatus=confirmed`, Issue resolved, Reload stabil.
3. `reopenIssue()` -> Preisreset bzw. `confirmed -> draft` exakt wie heute.
4. bestaetigte manuelle Artikel duerfen beim Reprocess nicht vom Matcher ueberschrieben werden.
5. manuelle Serials duerfen beim Reprocess nicht ueberschrieben werden.

## C. Order-Manuallogik

1. `setManualOrder()` -> Reload/Reprocess konsistent.
2. `confirmNoOrder()` -> bleibt erhalten.
3. `reassignOrder()` -> Pool, Issue-Status und Persistenz bleiben konsistent.

## D. Archiv und Export

1. Archiv nach bestaetigter manueller Korrektur -> Archiv spiegelt genau diesen Zustand.
2. Archiv nach Reopen -> Archiv zeigt den rueckgesetzten Zustand, nicht den alten confirmed-State.
3. `serial-data.json` gehoert zum richtigen Run und nicht zum global zuletzt geladenen Serial-Cache.
4. Invoice-PDF im Archiv gehoert zum richtigen Run.

## E. Mehrfachlauf / Stale-Cache-Schutz

1. Neue Artikelliste hochladen, sofort Run starten -> kein Altbestand aus alter Datei.
2. Neue Serialliste hochladen, sofort Run starten -> kein Altbestand aus alter Datei.
3. Zwei Runs nacheinander -> Archiv/Reload von Run A darf nicht Daten aus Run B verwenden.

## 10. Schlussurteil der erweiterten Analyse

Dein Einwand ist richtig: Wenn die IndexedDB das Gedaechtnis ist, muss die Loesung auf sauberer Nutzung dieser IndexedDB beruhen, nicht auf blindem Nachschreiben.

Meine korrigierte, praezise Aussage lautet deshalb:

- Reprocess und Auto-Workflow muessen die IndexedDB als run-spezifische Wahrheit lesen und verifizieren.
- In die IndexedDB soll nur dort aktiv neu geschrieben werden, wo der autoritative Run-Zustand sich fachlich aendert.
- Manual-Fix-, Reopen- und Archivfluesse muessen dabei ausdruecklich mitgeschuetzt werden.

Die wichtigste neue Erkenntnis dieser zweiten Fassung ist:

- Der aktuelle Code persistiert bereits mehr fachliche Zwischenzustaende, als die UI-Formulierung vermuten laesst.
- Gleichzeitig archiviert er noch nicht streng genug aus einem run-geprueften Snapshot.

Darum sollte der Fix nicht nur ein Time Guard sein, sondern eine SSOT-Haertung:

1. IndexedDB als Run-Wahrheit festziehen
2. Reprocess/Workflow gegen diese Wahrheit synchronisieren
3. autoritative Zustandswechsel gezielt committen
4. Archiv/Export aus run-spezifischem Snapshot ableiten

Erst damit wird `Neu verarbeiten`, manuelle Fehlerbearbeitung und Archivsicherung wirklich konsistent.
