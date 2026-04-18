# PROJ-49 ADD-ON Guard-Haertung - Round 3 Diagnostic

> Erstellt: 2026-03-30
> Rolle: Codex Bug-Search / Profischnueffler
> Scope: Diagnose der bereits umgesetzten PROJ-49-ADD-ON-Aenderungen gegen harte Code-Realitaet
> Ziel: Lagebericht zum defekten Workflow, Beziehungspruefung, Verdrahtungspruefung, Fix-Vorschlag
> WICHTIG: Dieses Dokument beschreibt Diagnose und Fix-Richtung. Es fuehrt keine Codeaenderungen aus.

---

## Kurzfazit

Der Workflow ist aktuell nicht primaer an einem Parser- oder Typfehler zerbrochen, sondern sehr wahrscheinlich an einer **Verdrahtungskollision zwischen Phase-2-Start und RunDetail-Rehydrierung**.

Der staerkste Defektpfad ist:

1. `NewRun.tsx` startet `startWorkflowPhase2(finalRunId)`
2. `startWorkflowPhase2()` laedt den Run aus IDB und startet `advanceToNextStep(runId)`
3. dadurch wird Step 2 im Memory auf `running` gesetzt und der Auto-Start-Timer geplant
4. direkt danach navigiert die App nach `/run/:id`
5. `RunDetail.tsx` mounted und ruft **immer** erneut `loadPersistedRun(decodedRunId)` auf
6. `loadPersistedRun()` ersetzt `runs`, `currentRun`, `invoiceLines`, `issues`, `auditLog` erneut mit dem IDB-Snapshot
7. dieser Snapshot enthaelt weiterhin Step 2 bis 5 auf `not-started`

Ergebnis:
- der frisch gestartete Live-Workflowzustand wird wieder ueberfahren
- die UI zeigt genau das Bild aus dem Screenshot:
  - Step 1 ok
  - Artikelstammdaten sichtbar
  - Runstatus "In Bearbeitung"
  - aber Step 2 steht effektiv wieder am Startpunkt

Das ist ein echter Integrationsfehler zwischen zwei an sich "richtigen" Bausteinen.

---

## Symptomlage

### Beobachtet

Im Screenshot ist zu sehen:

- Step 1 (`Rechnung auslesen`) ist gruen abgeschlossen
- Kachel 1 zeigt `90 / 90` Positionen eingelesen
- Artikelliste ist vorhanden (`532`)
- Step 2 zeigt `0/90`
- Button `Start` fuer `Artikel extrahieren` ist sichtbar
- Runstatus oben steht trotzdem auf `In Bearbeitung`

### Interpretation

Das spricht nicht fuer einen kompletten Ingest-Abbruch, sondern fuer einen **verlorenen Workflow-Fortschritt direkt nach Step 1**.

Wenn Step 2 fachlich blockiert waere, wuerde eher eines der folgenden Muster erwartet:

- Step 2 auf `failed`
- expliziter Guard-Blocker
- Hard-Fail-Dialog vor Navigation
- gar kein Run-Screen

Das konkrete Bild passt deutlich besser zu:

- Phase 2 wurde initial gestartet
- der Live-Zustand wurde danach wieder mit einem aelteren Snapshot ueberschrieben

---

## Hauptbefund

### Befund A - RunDetail ueberschreibt frisch gestartete Phase 2

**Betroffene Dateien**

- `src/pages/NewRun.tsx`
- `src/store/runStore.ts`
- `src/pages/RunDetail.tsx`

### Codekette

#### 1. New-Run startet Phase 2 vor Navigation

In `NewRun.tsx`:

- `createRunSkeleton()`
- `parseInvoiceForIngest()`
- `ingestAndPersistRunData()`
- `startWorkflowPhase2(finalRunId)`
- `navigate(/run/:id)`

Das ist fuer sich logisch.

#### 2. startWorkflowPhase2 laedt erst aus IDB und startet dann Step 2

In `runStore.ts`:

- `startWorkflowPhase2(runId)` raeumt Timer/Waiting-State
- ruft `loadPersistedRun(runId)` auf
- prueft Step 1 Status
- ruft `advanceToNextStep(runId)` auf

`advanceToNextStep(runId)` setzt:

- Step 2 auf `running`
- plant danach per Timer den Auto-Start von `executeMatcherCrossMatch()`

Auch das ist fuer sich logisch.

#### 3. RunDetail mounted und laedt den gleichen Run sofort erneut aus IDB

In `RunDetail.tsx` existiert ein Effect, der **immer** laeuft:

```ts
useRunStore.getState().loadPersistedRun(decodedRunId)
```

Der Kommentar dort sagt sogar explizit, dass dies "immer" passieren soll, um globale Felder nachzuladen.

#### 4. loadPersistedRun ersetzt den aktiven Live-Zustand erneut

`loadPersistedRun()` merged nicht nur kleine Hilfsfelder, sondern ersetzt aktiv:

- `runs`
- `currentRun`
- `invoiceLines`
- `issues`
- `auditLog`
- `parsedPositions`
- `parsedInvoiceResult`
- `serialDocument`
- `preFilteredSerials`

Damit wird der gerade von `startWorkflowPhase2()` in Memory vorbereitete Step-Status wieder vom alten IDB-Snapshot ueberdeckt.

### Warum das sehr wahrscheinlich der Hauptbug ist

Der IDB-Snapshot nach Phase 1 enthaelt typischerweise:

- Step 1 = `ok` oder `soft-fail`
- Step 2-5 = `not-started`

`advanceToNextStep()` macht daraus im Live-State:

- Step 2 = `running`

Wenn dann direkt wieder `loadPersistedRun()` kommt, wird wieder zurueckgesetzt auf:

- Step 2 = `not-started`

Das erklaert das aktuelle UI-Bild nahezu perfekt.

### Schwere

**KRITISCH**

Das ist kein kosmetischer Fehler, sondern ein Hauptpfad-Bruch zwischen:

- Phase-2-Orchestrierung
- Run-Seite
- Rehydrierungslogik

---

## Nebenbefunde

### Befund B - Der Plan hat das Routing-/Mount-Verhalten nicht ausreichend abgesichert

Der Round-2-Plan haertet:

- Phase 1
- SSOT-Persistenz
- Step-2-Guard
- Logging

Er schliesst aber den Pfad

- `startWorkflowPhase2()`
- `navigate()`
- `RunDetail mount`
- erneutes `loadPersistedRun()`

nicht hart aus.

Das ist kein kleiner Randfall, sondern genau der Pfad eines normalen neuen Runs.

### Schwere

**HOCH**

---

### Befund C - Parser-/Validierungsvertrag der Artikelliste bleibt ein eigenes Risiko

Die Round-2-Umsetzung hat bereits:

- `a.artNo` zu `a.falmecArticleNo` korrigiert
- `storageLocation` und `supplierId` im Schema auf `required: true` gesetzt
- `missingRequiredFields` aus dem Parser exponiert

Das ist deutlich besser als davor.

Trotzdem bleibt hier ein reales Restrisiko:

- Phase 1 ist jetzt strenger als frueher
- Aliase muessen fuer `storageLocation` und `supplierId` wirklich sauber greifen
- wenn die Datei diese Spalten semantisch traegt, aber nicht unter einem der bekannten Aliasnamen, gibt es jetzt einen sauberen Hard-Fail

Das ist nicht zwingend falsch, aber es ist ein **bewusstes Produktverhalten** und keine rein technische "Korrektur".

Wenn der User sagt "frueher lief der Workflow mit Fehlern bis Export", dann ist genau diese neue Haerte eine moegliche zusaetzliche Reibungsstelle.

### Schwere

**MITTEL**

### Bewertung

Kein Hauptgrund fuer den gezeigten Screenshot, aber ein valider Zweitbefund.

---

### Befund D - Tests sind gruen, decken den defekten Pfad aber praktisch nicht ab

Durchgefuehrte Checks:

- `npx tsc --noEmit` -> grün
- `npm test` -> grün (`95/95`)

Das ist gut, aber fuer den aktuellen Defekt nur begrenzt aussagekraeftig.

Es fehlen direkte Abdeckungen fuer:

- `NewRun -> startWorkflowPhase2 -> navigate -> RunDetail`
- Live-Status nach `advanceToNextStep()`
- erneutes `loadPersistedRun()` direkt nach Workflowstart
- SSOT-Live-State vs. IDB-Snapshot-Kollision

### Schwere

**MITTEL**

---

## Beziehungspruefung

### Was weiterhin funktional wirkt

- `fileSnapshot` vor Reset ist plausibel und sauber
- `updateRunWithParsedData(runId, result, false)` verhindert den alten Step-1-Auto-Timer
- `ingestAndPersistRunData()` schreibt strukturiert nach IDB
- `startWorkflowPhase2()` ist fuer sich schluessig
- `stepGuard.ts` ist fuer Step 2 jetzt SSOT-naeher
- `runId: 'sys'`-Logmuster wurde sauber entschaerft

### Wo die Beziehung bricht

Die groesste gebrochene Beziehung ist:

**"Der Run wurde gerade frisch aus IDB geladen und im Live-State weiterbewegt"**

gegen

**"Beim Mount der Detailseite laden wir denselben Run vorsichtshalber nochmal komplett aus IDB"**

Diese beiden Regeln koennen nicht gleichzeitig immer wahr sein.

Entweder:

- `startWorkflowPhase2()` besitzt den Rehydrierungszeitpunkt

oder

- `RunDetail` besitzt ihn

Aber nicht beide direkt nacheinander fuer denselben frischen Run.

---

## Wahrscheinlichste Root Cause Chain

Die aktuell plausibelste Root-Cause-Kette ist:

1. Phase 1 laeuft korrekt durch
2. `startWorkflowPhase2()` laedt IDB-Snapshot korrekt
3. Step 2 wird im Memory auf `running` gesetzt
4. `navigate()` oeffnet RunDetail
5. `RunDetail` ruft erneut `loadPersistedRun()`
6. Snapshot aus IDB setzt Step 2 wieder auf `not-started`
7. UI zeigt Start-Button statt laufenden Step-2-Workflow

Diese Kette passt besser zum Istbild als:

- Parserfehler
- Guardfehler
- fehlende Artikeldaten
- kaputte Tests

---

## KISS-Bewertung

Die aktuelle Umsetzung ist **architektonisch nicht komplett gescheitert**, aber die Verdrahtung ist an einer Stelle nicht KISS:

- zwei verschiedene Stellen beanspruchen dieselbe Rehydrierungsverantwortung

KISS-sauber waere:

- genau **eine** Stelle entscheidet, wann der komplette Run-Snapshot geladen wird
- alle anderen Stellen duerfen dann nur noch gezielt kleine Hilfsfelder nachziehen oder gar nichts mehr laden

Das Problem ist also nicht "zu wenig Logik", sondern eher:

- **eine Rehydrierung zu viel am falschen Ort**

---

## Fix-Vorschlag

## Ziel

Den frischen Phase-2-Start **nicht mehr beim Wechsel auf die Run-Seite ueberfahren**.

## KISS-Fix - bevorzugt

### Vorschlag 1 - RunDetail nur noch bedingt aus IDB laden

`RunDetail.tsx` soll `loadPersistedRun(decodedRunId)` **nicht mehr immer** beim Mount aufrufen.

Stattdessen:

- Wenn der Run bereits in `runs`/`currentRun` im Memory vorhanden ist und zum angeforderten `decodedRunId` gehoert:
  - **kein erneutes volles `loadPersistedRun()`**
- Nur wenn der Run im Memory fehlt:
  - `loadPersistedRun(decodedRunId)` aufrufen

### Warum das der beste KISS-Fix ist

- kleinster Eingriff
- kein Umbau der Phase-1-/Phase-2-Architektur
- keine neue Persistenzform
- kein Risiko, `startWorkflowPhase2()` zu verbiegen
- direkte Behebung genau des vermuteten Hauptfehlers

### Was dabei beachtet werden muss

Der bestehende Kommentar in `RunDetail.tsx`, dass globale Felder "immer" nachgeladen werden sollen, ist dann zu stark.

Stattdessen braucht es die sauberere Regel:

- **Direktzugriff / Reload / frischer Tab** -> `loadPersistedRun()` noetig
- **Navigation aus `NewRun` mit bereits aktivem Run im Memory** -> kein erneutes Komplettladen

---

## Alternative - wenn gezielte Rehydrierung wirklich noetig ist

### Vorschlag 2 - kleine Hydrationsfunktion statt volles loadPersistedRun

Falls `RunDetail` wirklich bestimmte globale Felder nachziehen muss, dann nicht ueber das volle `loadPersistedRun()`, sondern ueber einen kleinen, separaten Hydrator, der nur setzt:

- `parsedInvoiceResult`
- `parsedPositions`
- `preFilteredSerials`
- `serialDocument`

aber **nicht**:

- `runs`
- `currentRun`
- `invoiceLines`
- `issues`
- `auditLog`
- `steps`

### Bewertung

Sauber, aber schon groesserer Eingriff als Vorschlag 1.

Fuer KISS wuerde ich **Vorschlag 1 zuerst** bevorzugen.

---

## Was ich NICHT als ersten Fix empfehlen wuerde

- `startWorkflowPhase2()` noch komplexer machen
- sofort neue Flags fuer "frisch gestartet" einfuehren
- den Workflowstatus aggressiv nach jedem Step-Start in IDB persistieren, nur um das Re-Mount-Problem zu kaschieren
- `loadPersistedRun()` fuer Spezialfaelle intern partiell mutieren lassen

Das wuerde leicht neue Nebenwirkungen oeffnen.

---

## Konkrete Fix-Reihenfolge

1. `RunDetail.tsx`: den unbedingten `loadPersistedRun(decodedRunId)`-Effect auf direkten Bedarf begrenzen
2. danach manueller Test:
   - New Run starten
   - Phase 1 erfolgreich
   - Navigation in RunDetail
   - Step 2 muss sichtbar `running`/auto-start sein
3. Reload-Test:
   - Browser auf RunDetail hart neu laden
   - jetzt muss `loadPersistedRun()` wieder greifen
   - Step-Zustand darf konsistent aus Snapshot kommen
4. erst danach Zusatzthemen pruefen:
   - Artikellisten-Hard-Fail-Verhalten
   - Alias-Konfiguration
   - Legacy-/SSOT-Verhalten in Step 2

---

## Empfohlene Tests nach Fix

### Manueller Kernfall

- Rechnung + Artikelliste + openWE hochladen
- Serialliste optional weglassen oder mitgeben
- Start
- Erwartung:
  - kein Hard-Fail
  - Navigation auf RunDetail
  - Step 2 startet automatisch
  - kein sichtbarer Rueckfall auf "Start"

### Regressionsfall

- RunDetail direkt per URL aufrufen
- Erwartung:
  - `loadPersistedRun()` laedt den Run korrekt
  - keine leeren Globalfelder

### Reload-Fall

- Waehrend laufendem oder halb abgeschlossenem Run Browser neu laden
- Erwartung:
  - Run laedt reproduzierbar
  - kein Run-Verlust
  - keine Cross-Run-Daten

### SSOT-Sicherheitsfall

- zwei Runs nacheinander anlegen
- sicherstellen, dass Run B nicht durch Reload von Run A-Daten beeinflusst wird

---

## Confidence

### Fuer den Hauptbefund

`0.84 / 1.00`

Der Verdacht auf die Rehydrierungskollision ist aus Code-Sicht stark und passt sehr gut zum gezeigten Fehlerbild.

### Fuer die aktuelle Gesamtumsetzung gegen den Soll-Zustand

`0.61 / 1.00`

Warum nicht hoeher:

- Hauptworkflow aktuell sichtbar defekt
- zentrale Live-State-/IDB-Beziehung ist gebrochen
- Tests decken diesen Pfad nicht ab
- Parser-/Pflichtfeld-Haerte bleibt zusaetzliche Reibungsquelle

---

## Schlussbewertung

Die grosse PROJ-49-ADD-ON-Umsetzung ist nicht wertlos und auch nicht nur Flickwerk. Die Architekturidee bleibt grundsaetzlich stark:

- Phase 1
- SSOT in IDB
- Phase 2
- Reprocess aus IDB

Der aktuell sichtbarste Defekt ist aber sehr wahrscheinlich eine **Ueberschreibung des frischen Live-Workflows durch ein zweites komplettes `loadPersistedRun()` beim Mount von `RunDetail`**.

Das ist gut fuer uns:

- klar lokalisierbar
- KISS-kompatibel behebbar
- kein Zeichen dafuer, dass die gesamte Architektur verworfen werden muss

Der naechste Schritt sollte deshalb **kein grosser Umbau** sein, sondern ein chirurgischer Fix der Rehydrierungsverantwortung im RunDetail-Pfad.
