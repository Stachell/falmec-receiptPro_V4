# PROJ-49 Soll-Zustand der Workflow-Architektur

## Zusammenfassung
Die App soll nach PROJ-49 so arbeiten, dass die `IndexedDB` die eindeutige, run-spezifische Wahrheit fuer alle workflowrelevanten Daten ist. Der bisherige globale In-Memory-State dient nur noch als Arbeitskopie der Daten des aktuell aktiven Runs. Ein Workflow darf erst starten, wenn die benoetigten Datenquellen in einer vorgeschalteten Ingest-Phase erfolgreich geparst, minimal validiert und unter der finalen `runId` persistiert wurden.

Ziel ist ein reproduzierbarer, run-isolierter Ablauf ohne Datenvermischung zwischen Runs, ohne Abhaengigkeit von zufaelligen Restdaten im Speicher und ohne stilles Nachladen aus globalen Upload-Quellen waehrend der eigentlichen Verarbeitung.

## Zielbild der Datenverantwortung
- Die `IndexedDB` ist die Single Source of Truth fuer alle workflowkritischen Run-Daten.
- Jeder Run hat einen eigenen persistierten Snapshot mit allen fuer die Verarbeitung noetigen Pools, Statusfeldern und Metadaten.
- Der aktive In-Memory-Store enthaelt nur die aktuell geoeffnete Arbeitskopie eines Runs.
- Globale Upload-Daten, `fileStorageService`, `uploadedFiles` und globale Hilfsstores sind keine Wahrheitsquelle fuer SSOT-Runs.
- Legacy-Runs ohne `ingestStatus` duerfen uebergangsweise Fallbacks nutzen. Neu erzeugte SSOT-Runs duerfen das nicht.

## Run-Isolation
- Daten duerfen nie run-uebergreifend sichtbar, nutzbar oder versehentlich persistiert werden.
- Beim Wechsel zwischen Runs werden alle run-sensitiven globalen Felder geleert.
- Danach wird der aktive Zustand ausschliesslich durch `loadPersistedRun(runId)` neu aufgebaut.
- AutoSave darf in Umschaltmomenten keine Fremddaten in den Ziel-Run schreiben.
- Alle Persistenzschritte nach der PDF-Analyse arbeiten nur noch unter der finalen `runId`.
- Es darf keinen gueltigen SSOT-Zustand geben, in dem relevante Pools oder Snapshots unter einer temporären Run-ID verbleiben.

## Soll-Ablauf fuer New Run
### Phase 1 - Ingest und Validierung
- Der User laedt die Dateien im `New-Run`-Screen hoch und startet die Verarbeitung.
- Zuerst wird ein Run-Skeleton erzeugt.
- Danach wird die Rechnung geparst und die finale `runId` festgelegt.
- Erst danach werden alle weiteren Quellen geparst, minimal validiert und run-spezifisch persistiert.
- Jede Quelle erhaelt einen eindeutigen Status:
  - `ready`
  - `not_provided`
  - `invalid`
  - optional intern `pending` waehrend des Ingests
- Der Ladebildschirm bleibt aktiv, bis die Ingest-Phase abgeschlossen ist.
- Der Workflow startet nur, wenn die Freigaberegel vollstaendig erfuellt ist.

### Freigaberegel
- `pdf = ready`
- `articleList = ready`
- `serialList = ready` oder `not_provided`
- `openWE = ready` oder `not_provided`

### Hard-Fail-Verhalten
- Wird eine hochgeladene Pflichtquelle oder optionale Quelle als `invalid` erkannt, wird der Run nicht in Phase 2 gestartet.
- Der User bekommt eine klare Fehlermeldung mit Quellbezug.
- Nach Bestaetigung landet der User wieder im `New-Run`-Screen und kann die betroffene Datei neu hochladen.

## Datenquellen und Minimalvalidierung
### PDF
- Pflichtquelle.
- Muss mindestens eine gueltige Rechnungsnummer und `numberOfPackages` liefern.
- Die Rechnung bildet die fachliche Identitaet des Runs.
- Step 1 bleibt die fachliche Referenz fuer die restliche Verarbeitung.

### Artikelliste
- Pflichtquelle.
- Die Liste ist nur dann `ready`, wenn mindestens ein Datensatz die workflowkritischen Pflichtfelder traegt:
  - `artNo`
  - `storageLocation`
  - `supplierId`
  - `serialRequirement` muss im Parsergebnis vorhanden sein
- Ein bloss nicht-leeres Parsergebnis reicht nicht.
- Konfigurierbare Regex- und Matcher-Einstellungen muessen weiterhin wirksam bleiben.

### Seriallist
- Optionale Quelle.
- Ist sie nicht hochgeladen, ist `not_provided` ein gueltiger Zustand.
- Ist sie hochgeladen, muss mindestens eine verwertbare Seriennummer erkannt werden.
- Bei `ready` muss der daraus gebildete Serialpool im Run-Snapshot vorhanden sein.
- Bei `not_provided` ist ein leerer Zustand korrekt und kein Fehler.

### openWE
- Optionale Quelle.
- Ist sie nicht hochgeladen, ist `not_provided` ein gueltiger Zustand.
- Ist sie hochgeladen, muss mindestens ein verwertbarer Datensatz mit Artikelbezug und Bestellnummer entstehen.
- Bei `ready` muss der daraus gebildete Orderpool im Run-Snapshot vorhanden sein.
- Bei `not_provided` ist ein leerer Zustand korrekt und kein Fehler.

## Soll-Ablauf fuer Phase 2
- Phase 2 startet erst nach erfolgreicher Ingest-Freigabe.
- Phase 2 arbeitet nur auf den persistierten Run-Daten.
- Phase 2 darf keine Parser erneut gegen Upload-Dateien ausfuehren.
- Phase 2 darf nicht aus globalen Upload-Stores, `fileStorageService` oder `uploadedFiles` lesen.
- Phase 2 darf keine globale Rehydrierungs- oder Reparaturlogik fuer SSOT-Runs enthalten.
- `startWorkflowPhase2(runId, startFromStep)` ist die einzige Eintrittsstelle in den eigentlichen Workflow.

## Soll-Zustand der Workflowschritte
### Step 1
- Liest und bewertet die Rechnungsdaten.
- Ist nach erfolgreichem Ingest fuer New Runs bereits fachlich vorhanden.
- Bei Reprocess wird Step 1 nicht erneut ausgefuehrt.

### Step 2
- Nutzt nur den run-spezifischen `parsedArticlePool`.
- Fuer SSOT-Runs ist ein fehlender oder leerer Pflicht-Pool ein Integritaetsfehler.
- In diesem Fall wird der Step blockiert bzw. auf `failed` gesetzt.
- Fuer Legacy-Runs darf ein Fallback auf den alten globalen Artikelpfad bestehen.

### Step 3
- Nutzt den run-spezifischen Serialzustand und die run-spezifischen Serialdaten.
- `serialList = not_provided` fuehrt zu einem sauberen Skip, nicht zu einem Fehler.
- `serialList = ready`, aber fehlende Daten, ist ein Integritaetsfehler.
- `!idbData` oder `idbData ohne ingestStatus` bleibt aus Rueckwaertskompatibilitaet ein Legacy-/Diagnosepfad, nicht der Normalfall fuer SSOT-Runs.

### Step 4
- Nutzt nur den run-spezifischen `parsedOrderPool`.
- Fuer SSOT-Runs ist `openWE` ausschliesslich ueber `ingestStatus.openWE` autoritativ.
- `openWE = not_provided` bedeutet leerer, gueltiger Zustand.
- `openWE = ready`, aber fehlender Orderpool, ist ein Integritaetsfehler.
- `invalid`, `pending` oder unbekannte SSOT-Zustaende blockieren den Step.
- Es darf keinen Legacy-Fallback auf `uploadedFiles` fuer SSOT-Runs geben.

### Step 5
- Arbeitet auf den Ergebnissen der vorherigen Schritte.
- Darf keine fehlenden Vorstufen mehr verdeckt reparieren.
- Exportfaehigkeit basiert auf dem konsistenten Snapshot des Runs.

## Reprocess Soll-Zustand
- Reprocess ist kein neuer Upload-Lauf und kein partielles Neulesen von Dateien.
- Reprocess arbeitet bei geleertem globalem Speicher allein aus dem Run-Snapshot der `IndexedDB`.
- Der Ablauf ist:
  - run-sensitive globale Felder leeren
  - step-abhaengige Artefakte aus Steps 2 bis 5 bereinigen
  - Steps 2 bis 5 auf `not-started` setzen
  - `startWorkflowPhase2(runId, 2)` aufrufen
- Step 1 bleibt erhalten und wird nicht erneut ausgefuehrt.
- Vor Reprocess muessen bereinigt werden:
  - Issues aus Steps 2 bis 5
  - step-abhaengige Stats ausser den Step-1-Grunddaten
  - `orphanSerials`
  - alle Match-, Preis-, Serial- und Order-Ergebnisse auf `invoiceLines`
  - Step-Status und step-bezogene `issuesCount`
  - step-bezogene Diagnosen
- Fehlt bei einem SSOT-Run der benoetigte Snapshot oder `ingestStatus`, ist Reprocess ein Integritaetsfehler und darf nicht still weiterlaufen.

## Archiv Soll-Zustand
- Das Archiv schreibt fuer SSOT-Runs ausschliesslich auf Basis des Run-Snapshots.
- `archiveRun()` darf fuer SSOT-Runs keine globalen Pools verwenden.
- `serialList = not_provided` ist ein gueltiger leerer Archivzustand.
- `serialList = ready`, aber fehlende Serialdaten, ist ein Integritaetsfehler und fuehrt zum Abbruch der Archivierung.
- Das Archiv darf keine unvollstaendigen SSOT-Runs still als scheinbar gueltig sichern.

## AutoSave und Persistenzschutz
- AutoSave darf nur die Daten des aktuell aktiven Runs persistieren.
- Persistenzschutz muss verhindern, dass geleerte oder run-fremde Felder gueltige Snapshots ueberschreiben.
- Das gilt insbesondere fuer:
  - `parsedInvoiceResult`
  - `parsedPositions`
  - `parserWarnings`
  - `serialDocument`
  - `preFilteredSerials`
  - `uploadMetadata`
- Run-Wechsel, Unmount und Rehydrierung duerfen keinen ungewollten Save mit falscher Ownership ausloesen.

## UI- und Zustandsinvarianten
- Transiente Workflow-Zustaende duerfen nicht run-uebergreifend weiterleben.
- Beim Run-Wechsel oder Reprocess muessen auch nicht-persistierte Steuerzustaende sauber behandelt werden:
  - `autoAdvanceTimer`
  - `isPaused`
  - `isWaitingBeforeStep4`
  - `waitingStep4RunId`
  - `showStep4WaitingDialog`
  - step-bezogene Diagnosen
  - parserbezogene Hilfsdiagnostik
- Der User soll nach Run-Wechsel, Reload und Reprocess immer einen konsistenten Zustand sehen, der nur zum aktiven Run gehoert.

## Legacy-Verhalten
- Alte Runs ohne `ingestStatus` bleiben lesbar und sollen nicht unnoetig brechen.
- Legacy-Fallbacks sind nur fuer diese alten Runs erlaubt.
- Legacy-Fallbacks sind Uebergangsverhalten, keine Quelle der Wahrheit fuer neue Runs.
- Alle neuen Runs nach Einfuehrung von PROJ-49 muessen den SSOT-Regeln folgen.

## KISS-Zielbild
- Keine doppelte Parserarchitektur.
- Bestehende Parser bleiben Fachmodule.
- Die neue Logik lebt in einer klaren Orchestrierung:
  - `createRunSkeleton()`
  - `parseInvoiceForIngest()`
  - `ingestAndPersistRunData()`
  - `startWorkflowPhase2()`
- Guards sind nur noch Schutzschicht und Diagnosewerkzeug, nicht mehr die eigentliche Datenrettung.
- Die App soll dadurch einfacher nachvollziehbar werden:
  - zuerst persistieren
  - dann aus dem Snapshot arbeiten
  - niemals aus zufaelligen Restdaten weiterprozessieren

## Explizite Restthemen, die nicht Teil des Soll-Zustands von Stufe A sind
- stabile technische `runId` ohne Rechnungsnummer-Rename
- run-spezifische Speicherung von Rohdatei-Blobs
- vollständige Entkopplung von `fileStorageService` und `loadStoredFiles()` aus dem globalen Verhalten
- Sichtbarmachung optionaler Uploads im `New-Run`-UI
- fachliche Entscheidung, ob bei geaenderten Einstellungen spaeter ein Reparse aus Rohdatei oder die Wiederverwendung des gespeicherten Pools gewuenscht ist

## Endzustand in einem Satz
Die App soll nach PROJ-49 so arbeiten, dass jeder Run zuerst vollstaendig und run-spezifisch in der `IndexedDB` aufgebaut wird und danach der gesamte Workflow, inklusive Reprocess und Archiv, ausschliesslich auf diesem Snapshot laeuft, ohne dass globale Restdaten den Ablauf beeinflussen koennen.
