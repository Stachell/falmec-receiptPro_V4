# ADD-ON - Step 4 Waiting Point Switch

## Ziel

Vor dem automatischen Start von Step 4 ("Beleg zuordnen" / Order Mapping) soll ein optionaler Waiting Point eingefuehrt werden.

Der User bekommt damit die Wahl:

- Standardfall: Workflow laeuft wie bisher vollautomatisch bis inklusive Step 4 weiter.
- Optionaler Stopp: Workflow haelt exakt VOR Step 4 an, damit Rechnungspositionen noch bearbeitet werden koennen.

Wichtig: Der bestehende Workflow darf ausserhalb dieses neuen Waiting Points funktional nicht veraendert werden.

## Hintergrund

Nach dem Ausrollen der Artikelliste in Step 4 koennen die zugrunde liegenden Invoicelines nicht mehr sinnvoll bearbeitet werden. Der Waiting Point muss daher technisch vor dem Step-4-Autostart greifen, nicht danach.

## Ist-Analyse aus dem Projekt

### 1. Bestehender Autolauf von Step 3 nach Step 4

In `src/store/runStore.ts` wird Step 4 aktuell automatisch gestartet, sobald Step 3 erfolgreich abgeschlossen ist.

Relevantes Ist-Verhalten:

- `advanceToNextStep(runId)` startet bei `nextStep.stepNo === 4` per Timer sofort den Order-Mapping-Lauf.
- Nach erfolgreichem Step 4 wird ebenfalls automatisch nach Step 5 weitergeschaltet.
- Die bestehende Automatik ist damit heute "Step 3 -> Step 4 -> Step 5", sofern kein Fehler blockiert.

### 2. Bestehende Pause/Fortfahren-Logik ist NICHT passend fuer den neuen Waiting Point

In `src/pages/RunDetail.tsx` und `src/store/runStore.ts` existiert bereits PROJ-25 (`pauseRun` / `resumeRun`).

Warum diese Mechanik fuer das neue Add-on nicht direkt wiederverwendet werden darf:

- Bei `isPaused === true` zeigt Kachel 6 "pausiert".
- Kachel 6 fuehrt in diesem Zustand den Workflow nicht weiter aus.
- Der Userwunsch lautet aber explizit: Nach STOP vor Step 4 soll der User spaeter ueber Kachel 6 weiterlaufen koennen.

Schlussfolgerung:

- Der neue Waiting Point darf nicht als normaler PROJ-25-Pausezustand modelliert werden.
- Stattdessen muss der Workflow vor Step 4 in einem eigenen "wartet auf Userentscheidung"-Zustand bleiben, bei dem Step 4 noch `not-started` ist und Kachel 6 weiterhin als Fortsetzungs-Trigger verwendet werden kann.

### 3. Bestehendes Schloss-Icon fuer den Artikellisten-Status ist bereits vorhanden

In `src/components/run-detail/ItemsTable.tsx` sind die SSOT-Assets und die Statuslogik bereits vorhanden:

- `src/assets/icons/Lock_CLOSE_STEP4.ico`
- `src/assets/icons/Lock_OPEN_STEP4.ico`

Die aktuelle Logik:

- geschlossenes Schloss solange Step 4 nicht abgeschlossen ist
- offenes Schloss sobald Step 4 `ok` oder `soft-fail` ist

Diese bestehende Anzeige soll fuer das neue Header-Control wiederverwendet werden.

### 4. Bestehende Popup-Darstellung

Im Projekt werden bestaetigende Pop-ups bereits konsistent ueber `AlertDialog` gerendert, z. B.:

- `src/components/SettingsPopup.tsx`
- `src/pages/NewRun.tsx`
- `src/components/AppSidebar.tsx`

Die neue Abfrage vor Step 4 soll dieselbe Darstellungslogik verwenden:

- vorhandenes `AlertDialog`
- gleiche Farb-/Panel-Linie wie vorhandene Pop-ups
- keine eigene Sonder-Modal-Komponente mit abweichender Optik

### 5. Bestehende Zielpositionen fuer den Switch

Die beiden geforderten UI-Positionen sind bereits klar lokalisierbar:

- `src/pages/RunDetail.tsx`
  - Header-Button-Zeile rechts
  - der neue Schieberegler soll rechtsbuendig direkt VOR dem Pause-Button sitzen
- `src/components/SettingsPopup.tsx`
  - Reiter `Allgemein`
  - neuer letzter Eintrag im Body, eigener Separator, Label links / Switch rechts

## Soll-Verhalten

### A. Schalter-Funktion

Es wird ein neuer boolescher Schalter eingefuehrt:

- `true` = Workflow laeuft wie bisher automatisch in Step 4 hinein
- `false` = Workflow stoppt automatisch vor Step 4 und fragt den User per Pop-up

Default muss `true` bleiben, damit der bestehende Workflow standardmaessig unveraendert bleibt.

### B. Trigger-Zeitpunkt

Der Eingriffspunkt liegt exakt zwischen:

- erfolgreichem Abschluss von Step 3
- automatischem Start von Step 4

Das bedeutet:

- Step 3 darf normal zu Ende laufen
- Step 4 darf noch NICHT gestartet sein
- die Artikelliste darf noch NICHT ausgerollt sein
- die Invoicelines bleiben damit bearbeitbar

### C. Verhalten bei aktiviertem Schalter

Wenn der Schalter aktiv ist:

- keine Popup-Abfrage
- Workflow laeuft unveraendert automatisch weiter
- bestehendes Verhalten bleibt erhalten

### D. Verhalten bei deaktiviertem Schalter

Wenn der Schalter deaktiviert ist und der Workflow Step 3 abgeschlossen hat:

- der automatische Uebergang in Step 4 wird abgefangen
- ein Pop-up oeffnet sich sofort
- Text des Pop-ups:

`Moechten Sie den Schritt Beleg zuordnen ausfuehren oder moechten Sie den Workflow anhalten um Aenderungen in den z.B. in den Rechnungspositionen durchfuehren?`

Buttons:

- `STOP`
- `DURCHFUEHREN`

Button-Verhalten:

- `STOP`
  - Pop-up schliesst
  - Workflow bleibt vor Step 4 stehen
  - Step 4 bleibt `not-started`
  - User kann Invoicelines bearbeiten
  - spaeter kann der User ueber Kachel 6 den Workflow weiterlaufen lassen
- `DURCHFUEHREN`
  - Pop-up schliesst
  - Step 4 wird unmittelbar gestartet
  - danach laeuft der Workflow wieder in der bestehenden Automatik weiter

## UI-Anforderungen

### 1. Run-Detail Header

Location:

- `Run-Detail > Ueberschriftenzeile`
- rechtsbuendig direkt VOR dem `Pause`-Button

Aufbau des Controls:

- links das vorhandene Schloss-Icon aus PROJ-31
- rechts daneben der eigentliche Switch

Wichtig:

- das Icon zeigt den Status der Artikelliste, nicht den Status des Schalters
- solange Step 4 noch nicht abgeschlossen ist: geschlossenes Schloss
- sobald Step 4 abgeschlossen ist: offenes Schloss

Funktionslogik des Icons:

- exakt dieselbe Asset-/Statuslogik wie in `ItemsTable.tsx`
- keine neue Icon-Interpretation

Funktionslogik des Schalters:

- zeigt, ob Step 4 automatisch ausgerollt werden soll
- ist waehrend Step 4 noch nicht gelaufen umschaltbar
- nach bereits abgeschlossenem Step 4 bleibt die Anzeige konsistent; keine Rueckwirkung auf den bereits gelaufenen Step

### 2. Settings Popup - Allgemein

Location:

- `Sidebar Footer > Einstellungen > Allgemein`
- letzter Punkt im Body
- eigener Separator oberhalb

Aufbau:

- Label linksbuendig
- Switch rechtsbuendig in derselben Zeile
- davor das Schloss-Icon aus Punkt 1, aber ausschliesslich als statisch geschlossenes Schloss

Label:

`Artikelliste mit Step 4 ausrollen?`

Wichtig:

- Icon in den Settings hat dort keine Statusfunktion
- es ist nur die visuelle Referenz auf den gleichen Feature-Kontext

## Technische Leitplanken

### 1. Bestehende Workflow-Mechanik bleibt intakt

Nicht aendern:

- Step-1 bis Step-3 Ablauf
- eigentliche Step-4 Mapping-Logik
- Step-4 nach Step-5 Auto-Advance
- bestehende Pause/Fortfahren-Funktion aus PROJ-25

Es wird nur ein Guard vor dem Step-4-Autostart eingefuegt.

### 2. Eigener State fuer den Waiting Point

Empfohlene Modellierung:

- eigener boolescher Config-Wert fuer den Auto-Step-4-Schalter
- eigener UI-/Run-State fuer "wartet vor Step 4 auf Userentscheidung"
- kein Missbrauch von `isPaused`

Begruendung:

- `isPaused` wuerde die Kachel-6-Fortsetzung blockieren
- der User soll nach STOP explizit ueber Kachel 6 weiterarbeiten koennen

### 3. Run-spezifisches Verhalten plus zentrale Einstellung

Da es zwei Kontrollpunkte gibt, wird folgende Trennung empfohlen:

- `globalConfig`: persistierter Default fuer neue Runs
- `run.config`: effektiver Wert fuer den aktuellen Run

Anforderung an die Synchronisierung:

- Settings in `Allgemein` aendern den Default
- Header-Switch im Run-Detail aendert den effektiven Wert fuer den aktuellen Run
- wenn der User waehrend eines aktiven Runs im Settings-Popup denselben Schalter aendert, muss die Aenderung auch fuer den aktiven Run sichtbar wirksam sein

Damit ist sichergestellt, dass beide UI-Positionen dieselbe Funktion repraesentieren und nicht auseinanderlaufen.

## Betroffene Dateien

Primar:

- `src/pages/RunDetail.tsx`
- `src/store/runStore.ts`
- `src/components/SettingsPopup.tsx`
- `src/components/AppFooter.tsx`
- `src/types/index.ts`

Wahrscheinlich zusaetzlich:

- neuer kleiner Dialog/Control-Wrapper falls zur Entkopplung sinnvoll
- ggf. SSOT-Helfer fuer das Schloss-Icon, damit Header und `ItemsTable.tsx` dieselbe Logik verwenden

Bestehende Referenzen:

- `src/components/run-detail/ItemsTable.tsx`
- `src/assets/icons/Lock_CLOSE_STEP4.ico`
- `src/assets/icons/Lock_OPEN_STEP4.ico`
- `src/components/ui/alert-dialog.tsx`

## Umsetzungsvorschlag in Phasen

### Phase 1 - State und Typen

- neuen Config-Key in `RunConfig` aufnehmen
- Default in `globalConfig` auf `true`
- effektiven Run-Wert fuer aktive Runs verfuegbar machen
- separaten Waiting-Point-State vor Step 4 einfuehren

### Phase 2 - Workflow Guard

- Auto-Advance zwischen Step 3 und Step 4 abfangen
- bei deaktiviertem Schalter Pop-up oeffnen statt Step 4 direkt zu starten
- bei `STOP` keine weitere Aktion
- bei `DURCHFUEHREN` exakt den bisherigen Step-4-Startpfad ausloesen

### Phase 3 - Run-Detail Header UI

- neues Control vor dem Pause-Button platzieren
- bestehende Lock-Assets wiederverwenden
- Statusanzeige des Schlosses an Step-4-Status koppeln
- Switch an den neuen Config-Wert koppeln

### Phase 4 - Settings UI

- neuen letzten Separator-Block in `Allgemein` einfuegen
- statisches geschlossenes Schloss links am Label
- denselben Switch-Wert anzeigen und veraendern

### Phase 5 - Verifikation

- Vollautomatik bei aktivem Switch unveraendert
- STOP-Fall vor Step 4 pruefen
- Kachel-6-Fortsetzung pruefen
- Popup-Optik gegen bestehende Pop-ups gegenpruefen
- kein Regressionsverhalten bei Pause/Fortfahren

## Akzeptanzkriterien

- [ ] Im Run-Detail gibt es vor dem Pause-Button einen neuen rechtsbuendigen Switch mit vorgeschaltetem Schloss-Icon.
- [ ] Das Schloss-Icon im Run-Detail nutzt exakt die bestehenden Assets aus PROJ-31.
- [ ] Das Schloss zeigt geschlossen solange Step 4 nicht abgeschlossen ist.
- [ ] Das Schloss zeigt offen sobald Step 4 abgeschlossen ist und die Artikelliste ausgerollt wurde.
- [ ] Im Settings-Popup unter `Allgemein` gibt es als letzten Eintrag mit eigenem Separator einen weiteren Switch.
- [ ] Das Settings-Label lautet exakt: `Artikelliste mit Step 4 ausrollen?`
- [ ] Im Settings-Eintrag steht links das geschlossene Schloss-Icon als rein statisches Symbol.
- [ ] Ist der Switch aktiv, laeuft der Workflow wie bisher automatisch durch Step 4.
- [ ] Ist der Switch deaktiviert, stoppt der Workflow automatisch vor Step 4.
- [ ] Vor Step 4 erscheint ein Pop-up im bestehenden AlertDialog-Stil.
- [ ] Der Pop-up-Text lautet exakt wie vom User vorgegeben.
- [ ] Das Pop-up enthaelt genau die Buttons `STOP` und `DURCHFUEHREN`.
- [ ] `STOP` schliesst das Pop-up und laesst den Run vor Step 4 stehen.
- [ ] Nach `STOP` koennen Invoicelines weiter bearbeitet werden.
- [ ] Nach `STOP` kann der User ueber Kachel 6 den Workflow fortsetzen.
- [ ] `DURCHFUEHREN` startet Step 4 sofort und der restliche Workflow laeuft wie gehabt weiter.
- [ ] Die bestehende PROJ-25 Pause/Fortfahren-Funktion bleibt unveraendert nutzbar.
- [ ] Die bestehende Step-4-Logik und das bestehende Step-4->Step-5-Verhalten bleiben unveraendert.

## Nicht-Ziele

- keine Aenderung an der fachlichen Order-Mapping-Logik von Step 4
- keine Aenderung an der bestehenden Kachel-Logik ausser der benoetigten Fortsetzungsnutzung nach STOP
- keine Aenderung am Bearbeitungsmodell nach bereits abgeschlossenem Step 4
- keine neue, abweichende Dialog-Designsprache

## Offene Implementierungsnotiz

Der Text des Pop-ups wird bewusst 1:1 aus der Anforderung uebernommen, obwohl sprachlich noch gestrafft werden koennte. Falls spaeter UX-Feinschliff gewuenscht ist, sollte das separat und nicht implizit in diesem Add-on geschehen.
