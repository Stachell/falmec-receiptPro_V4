# RUN-DETAIL-SURFACE_CAHTGPT

## Ziel
Dieses Dokument beschreibt die Ist-Oberflaeche der Seite `RunDetail` so, dass sie direkt mit der Workflow-Logik abgeglichen werden kann.

Fokus:
- Welche UI-Elemente sichtbar sind
- Welche Store-/Funktionsdaten dahinter liegen
- Wo UI und Workflow aktuell nicht deckungsgleich sind
- Welche Checkbox-Fenster (Checklisten) sinnvoll ergaenzt werden koennen

## Referenzdateien
- `src/pages/RunDetail.tsx:38`
- `src/components/WorkflowStepper.tsx:39`
- `src/components/run-detail/OverviewPanel.tsx:13`
- `src/components/run-detail/InvoicePreview.tsx:83`
- `src/components/run-detail/ItemsTable.tsx:29`
- `src/components/run-detail/IssuesCenter.tsx:35`
- `src/components/run-detail/WarehouseLocations.tsx:18`
- `src/components/run-detail/ExportPanel.tsx:16`
- `src/store/runStore.ts:615`
- `src/store/runStore.ts:690`

## Seitenaufbau RunDetail (von oben nach unten)

### 1) Header-Bereich
Position: ganz oben in `RunDetail`.

Sichtbare Elemente:
- Zurueck-Button zur Uebersicht (`/`).
- Zeitstempel `createdAt` + optional `deliveryDate`.
- Laufkennung (`currentRun.id`).
- Status-Chip (In Bearbeitung / Erfolgreich / Fehlgeschlagen / Warnung / Nicht gestartet).
- Aktion `Neu verarbeiten`.
- Optionaler Button `XML Export` nur wenn `currentRun.stats.exportReady === true`.

Technische Wirkung:
- `Neu verarbeiten` startet **immer einen neuen Lauf** via `createNewRunWithParsing()` und navigiert danach auf den neuen Run.

### 2) Workflow-Stepper
Position: unter dem Header.

Sichtbare Elemente:
- 6 Schritte mit Name + Icon je nach Status.
- Statusfarben fuer `ok`, `running`, `failed`, `soft-fail`, `not-started`.
- Issue-Anzahl pro Schritt (`issuesCount`).

Technische Wirkung:
- In der aktuellen Einbindung ist kein `onStepClick` verdrahtet.
- Stepper zeigt Status an, steuert den Ablauf selbst aber nicht.

### 3) KPI-Kachelbereich
Position: unter dem Stepper.
+++ ANPASSUNG NOTWENDIG
	+ [LLM_ÄNDERUNGEN] Kachelgruppen:
	- Rechnungspositionen
	> [LLM-NOTE] Anpassung des Counters, die gefundenen Rechnungspositionen beziehen sich INNERHALB DIESER KACHEL rein auf die Zeilenanzahl im Body, die geparst wurde, der Counter soll also vor dem "/" anzeigen, wieviele Rechnungspositionen bzw. Rechnungszeilen ausgelesen wurden, der Wert nach dem Counter, die Prüfziffer soll die Summe der Regel "Prüfung der im Feld Q.TY und Einzelpreis kumulierten Einträge" als Prüfziffer.
	> [LLM-NOTE] Alle weiteren Kacheln sollen ebenfalls Counter, allerdings soll abgesehen von der Kachel "Rechnungspositionen" und "Export" (Export ist dynamisch hinterlegt, kein Counter) für alle weiteren der Nennner der Artikelanzahl sein.

	- Bestellungen zugeordnet
	> [LLM-NOTE] Anpassung der Feldbezeichnung in "Bestellungen mappen" 
	> [LLM-NOTE] Anpassung des Counters, Nenner die Gesamtzahl der Artikel (Arikel, nicht Artikelpositionen), als Nenner die erfolgreich gemappten Bestellungen JE ARTIKEL. 

	- Seriennummern
	> [LLM-NOTE] Anpassung der Feldbezeichnung in "Seriennummern anfügen" 
	> [LLM-NOTE] Anpassung des Counters, Nenner die Gesamtzahl der Artikel in der Datei "offene Warenlieferungen" gefundenen Zeilen MIT einer Seriennummern als Nenner und die erfolgreich zugeordneten Seriennummern als Counter, gezählt wird jede Seriennummer und jeder Artikel mit . 

	- Artikel zugeordnet
	> [LLM-NOTE] Anpassung der Feldbezeichnung in "Artikel extrahieren" 
	> [LLM-NOTE] Anpassung des Counters, Nenner die Gesamtzahl der Artikel (Arikel, nicht Artikelpositionen), als Nenner die erfolgreich gemappten Bestellungen JE ARTIKEL. 

	- Preise OK
	> [LLM-NOTE] Anpassung der Feldbezeichnung in "Preise checken" 
	> [LLM-NOTE] Anpassung des Counters, Nenner die Gesamtzahl der Artikel mit einem Preis wenn auch 0 Euro (also alle), als Counter die Anzahl der Artikel deren Einzelpreis mit der Preisliste verglichen wurden und übereinstimmen. 

	- Aktionskachel (`naechster Schritt` oder `Exportdatei herunterladen`)

+++ ANPASSUNG NOTWENDIG
	+ [LLM-NOTE] REIHENFOLGE DER KACHEL DEM WORKFLOW ANPASSEN:
	1. Rechnungspositionen
	2. Artikel extrahieren
	3. Seriennummern anfügen
	4. Preise checken
	5. Bestellung mappen
	6. Export


Technische Wirkung der Aktionskachel:
- Wenn alle Schritte `ok` oder `soft-fail`: wechselt auf Tab `export`.
- Sonst: ruft `advanceToNextStep(runId)` auf.
- `advanceToNextStep` schaltet aktuell nur Status um (kein fachlicher Schritt-Job).

### 4) Tab-Leiste
Position: unter den KPI-Kacheln.

Tabs:
- `Uebersicht`
- `Rechnung` (Badge mit Anzahl geparster Zeilen)
- `Positionen`
- `Issues` (Badge mit Gesamtissues)
- `Lagerorte`
- `Export`

Technische Wirkung:
- Gesteuert ueber `activeTab` im Store.

### 5) Tab-Inhalte

#### Tab `Uebersicht`
Zeigt:
- Rechnungsdetails
- Konfiguration
- Verarbeitungsinfos
- Aktivitaetsprotokoll

Wichtig:
- Aktivitaetsprotokoll kommt aktuell aus `mockAuditLog`, nicht aus den echten Lauf-Logs.

#### Tab `Rechnung`
Zeigt:
- Parser-Status (erfolgreich/fehlgeschlagen)
- Headerdaten (Fattura, Datum, Pakete, Gesamtmenge)
- Parser-Hinweise/Warnungen
- Tabelle der geparsten Positionen

Datenquelle:
- `parsedInvoiceResult`, `parsedPositions`, `parserWarnings` aus Store.

#### Tab `Positionen`
Zeigt:
- Operative Tabelle fuer `invoiceLines` mit Suche/Filter.

Wichtig:
- `invoiceLines` sind global im Store, nicht strikt run-gekapselt.

#### Tab `Issues`
Zeigt:
- Open/Resolved-Listen, Filter, CSV-Export, Dialog fuer Resolve.

Wichtig:
- Quelle ist globales `issues` Array; initial mit Mockdaten befuellt.

#### Tab `Lagerorte`
Zeigt:
- Globale Zuweisung (WE/KDD)
- Detailtabelle je Position
- Editiermodus zur Lagerortpflege

Technische Wirkung:
- Updates gehen direkt in `invoiceLines`.

#### Tab `Export`
Zeigt:
- Export-Bereitschaftscheck
- Dateiname
- XML-Vorschau
- Export-Button

Bereitschaft aktuell:
- Keine offenen blocking issues
- Keine Position ohne Lagerort

## Datenbindung: UI zu Logik

1. Seite laden (`/run/:runId`):
- `useEffect` sucht Run erst in `runs`, dann in `mockRuns`.
- Ergebnis wird nach `currentRun` gesetzt.

2. Schrittanzeige:
- Anzeige basiert auf `currentRun.steps`.
- Fachlogik fuer Step 2-6 fehlt derzeit.

3. Schritt-1-Ergebnis in UI:
- `updateRunWithParsedData` setzt Schritt 1, Header, Stats und `invoiceLines`.
- `Rechnung`-Tab zeigt die Parse-Details direkt an.

4. Naechster-Schritt-Button:
- `advanceToNextStep` = reine Status-Fortschaltung.

## Inkonsistenzen Ist-Oberflaeche vs Ist-Workflow

1. UI suggeriert kompletten 6-Schritt-Workflow, aber nur Schritt 1 hat echte Verarbeitung.
2. `Issues`, `Audit`, teils Runliste enthalten Mock-/globale Daten, nicht strikt laufbezogene Runtime-Daten.
3. Export-Bereitschaft basiert auf globalen `issues` und globalen `invoiceLines`; bei mehreren Runs kann es zu Vermischung kommen.
4. `Neu verarbeiten` erzeugt neuen Lauf statt aktuellen Lauf zu resetten/fortzusetzen.

## Checkbox-Fenster: Soll-Ableitung fuer den Umbau

Hinweis: Aktuell existieren in `RunDetail` keine echten Checkbox-Fenster fuer Gatekeeping.

Fuer einen robusten Workflow sollten 4 Checklisten-Fenster ergaenzt werden:

1. Schritt-Freigabe je Workflowstep
- Platzierung: rechts neben/unter Stepper.
- Inhalt: technische und fachliche Preconditions als Checkboxen.
- Regel: `advanceToNextStep` nur wenn alle Pflicht-Checkboxen true.

2. Parse-Qualitaet (Schritt 1)
- Platzierung: im Tab `Rechnung` oberhalb Warnungen.
- Inhalt: z.B. Fattura erkannt, Datum erkannt, Positionen > 0, Qty plausibel.
- Regel: Schritt 1 wird nur `ok`, wenn Pflichtpunkte erfuellt oder begruendet uebersteuert.

3. Issue-Resolution-Gate
- Platzierung: im Tab `Issues` als Gruppencheckliste.
- Inhalt: blocking erledigt, soft-fail bewertet, Verantwortlicher + Notiz gesetzt.
- Regel: Exportstep erst freigegeben, wenn blocking vollständig erledigt.

4. Export-Freigabe
- Platzierung: im Tab `Export` oberhalb Downloadbutton.
- Inhalt: Pflichtfelder, Lagerorte, Serienregeln, Preisregel, finale Freigabe.
- Regel: Downloadbutton aktiv nur bei kompletter Freigabe.

## Prompt-Bausteine fuer deinen Arbeitsplan

Wenn du daraus den naechsten Prompt baust, sollten diese Anforderungen enthalten sein:

1. Run-spezifischer State
- `parsedInvoiceResult`, `invoiceLines`, `issues`, `audit` pro `runId` kapseln.

2. Echte Schrittlogik
- Step 2-6 als echte Processing-Actions statt Status-Switch.

3. UI-Gates
- Checkbox-Fenster als verbindliche Freigaben pro Schritt implementieren.

4. Verlaessliche Datenquellen
- Mockquellen aus produktiven Panels entfernen.

5. Transparenz
- Pro Schritt: Input, Output, Warnings, Decision (Checkbox/Freigabe), Log.

## Kurzfazit
Die Run-Detail-Oberflaeche ist visuell bereits nah an einem Endworkflow, aber funktional aktuell nur bei Schritt 1 vollstaendig. Fuer einen einsetzbaren Prozess muessen Schrittlogik, run-spezifische Datenhaltung und Checkbox-Gates synchronisiert werden.
