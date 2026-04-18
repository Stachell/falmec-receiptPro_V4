# PROJ-49 ADD-ON Guard-Haertung Round 2 Diagnostic

## Kurzfazit

Die Umsetzung ist **architektonisch erkennbar am Plan orientiert**, aber in der harten Code-Realitaet **noch nicht planstabil**. Der erste fruehe Fehler bei der Artikelliste ist kein diffuser Randfall, sondern durch eine **konkrete Feldfehlverdrahtung** in der Phase-1-Validierung direkt erklaerbar.

Der groesste Unterschied zwischen Plan und Wirklichkeit ist aktuell:

- der Hauptpfad ist sichtbar umgebaut auf `Phase 1 -> IDB -> Phase 2`
- aber an mehreren Stellen leben noch **falsche Feldnamen, alte globale Abhaengigkeiten oder tote/unerreichbare Statuspfade**
- dadurch entstehen fruehe Abbrueche, obwohl die Architekturidee selbst grundsaetzlich tragfaehig ist

## Gepruefter Stand

- Plan geprueft: [PROJ-49-ADD-ON-Guard-Haertung.md](C:\0WERKBANK0\falmec-reicptpro_v4\features\PROJ-49-ADD-ON-Guard-Haertung.md)
- Implementierung geprueft in:
  - [runStore.ts](C:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts)
  - [buildAutoSavePayload.ts](C:\0WERKBANK0\falmec-reicptpro_v4\src\hooks\buildAutoSavePayload.ts)
  - [runPersistenceService.ts](C:\0WERKBANK0\falmec-reicptpro_v4\src\services\runPersistenceService.ts)
  - [NewRun.tsx](C:\0WERKBANK0\falmec-reicptpro_v4\src\pages\NewRun.tsx)
  - [RunDetail.tsx](C:\0WERKBANK0\falmec-reicptpro_v4\src\pages\RunDetail.tsx)
  - [stepGuard.ts](C:\0WERKBANK0\falmec-reicptpro_v4\src\services\stepGuard.ts)
  - [masterDataParser.ts](C:\0WERKBANK0\falmec-reicptpro_v4\src\services\masterDataParser.ts)
  - [FalmecMatcher_Master.ts](C:\0WERKBANK0\falmec-reicptpro_v4\src\services\matchers\modules\FalmecMatcher_Master.ts)
  - [logService.ts](C:\0WERKBANK0\falmec-reicptpro_v4\src\services\logService.ts)
- Checks ausgefuehrt:
  - `npx tsc --noEmit` -> gruen
  - `npm run build` -> gruen
  - `npm test` -> 95/95 Tests gruen

Wichtige Einordnung:
Die gruenen Checks bedeuten **nicht**, dass PROJ-49 sauber implementiert ist. Fuer die neuen SSOT-/Phase-1-Pfade gibt es aktuell praktisch keine direkte Testabdeckung.

## Findings

### 1. Hoch: Die Artikellisten-Validierung ist im Hauptpfad fachlich kaputt verdrahtet

Die erste echte Ursache fuer den beobachteten Fruehfehler sitzt hier:

- In [runStore.ts](C:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts) wird in `ingestAndPersistRunData()` die Gueltigkeit der Artikelliste ueber
  `result.articles.filter(a => a.artNo && a.storageLocation && a.supplierId != null)`
  geprueft.
- Das Datenmodell `ArticleMaster` hat aber **kein** Feld `artNo`, sondern `falmecArticleNo`:
  [index.ts](C:\0WERKBANK0\falmec-reicptpro_v4\src\types\index.ts)
- Der Parser schreibt ebenfalls `falmecArticleNo`:
  [masterDataParser.ts](C:\0WERKBANK0\falmec-reicptpro_v4\src\services\masterDataParser.ts)

Folge:

- `a.artNo` ist im Validierungspfad fachlich leer/falsch
- dadurch kippt `validRows.length` auf `0`
- die Artikelliste wird als `invalid` markiert
- der Run bricht schon in Phase 1 ab, obwohl Daten in der Datei vorhanden sind

Das erklaert den von dir beobachteten Fehler **direkt**.

### 2. Mittel-Hoch: Die Optional-Logik fuer `serialList` und `openWE` ist im Startbildschirm funktional nicht erreichbar

Der Plan definiert `serialList` und `openWE` als optional mit `not_provided`-Pfad:
[PROJ-49-ADD-ON-Guard-Haertung.md](C:\0WERKBANK0\falmec-reicptpro_v4\features\PROJ-49-ADD-ON-Guard-Haertung.md)

Der aktuelle Einstieg in [NewRun.tsx](C:\0WERKBANK0\falmec-reicptpro_v4\src\pages\NewRun.tsx) verlangt aber weiterhin **alle vier Uploads**:

- `invoice`
- `articleList`
- `serialList`
- `openWE`

Folge:

- die im Plan sauber beschriebene `not_provided`-Logik ist im primaeren UI-Pfad faktisch tot
- Phase 1 kann diese Optionalitaet zwar intern verarbeiten
- der User kommt aber aus dem Startscreen nicht in diesen Zustand hinein

Das ist kein kosmetisches Thema, sondern ein echter Unterschied zwischen Sollzustand und realem Nutzerfluss.

### 3. Mittel: Step-2-Guard haengt weiter an globalem `masterDataStore`, obwohl Step 2 fuer SSOT-Runs aus `parsedArticlePool` arbeitet

Die eigentliche Step-2-Ausfuehrung fuer SSOT-Runs zieht die Artikel korrekt aus `parsedArticlePool` aus IDB:
[runStore.ts](C:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts)

Der vorgeschaltete Guard in [stepGuard.ts](C:\0WERKBANK0\falmec-reicptpro_v4\src\services\stepGuard.ts) verlangt aber weiter `masterArticles` aus `masterDataStore` und repariert fehlende Daten ueber `useMasterDataStore.load()`.

Folge:

- Step 2 hat weiterhin eine unnoetige globale Nebenabhaengigkeit
- fuer SSOT-Runs kann der Guard false-negative werden, obwohl `parsedArticlePool` in IDB vorhanden ist
- dadurch bleibt eine alte globale Logik an einer Stelle aktiv, die laut Sollbild run-spezifisch sein sollte

Das ist keine sofortige Hauptursache des ersten Bugs, aber eine strukturelle Restschwaeche der Umsetzung.

### 4. Mittel-Niedrig: `startWorkflowPhase2()` schreibt bei Fehlern in einen kuenstlichen Run-Log `sys`

In [runStore.ts](C:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts) wird in `startWorkflowPhase2()` bei Fehlern mit `{ runId: 'sys' }` geloggt.

In [logService.ts](C:\0WERKBANK0\falmec-reicptpro_v4\src\services\logService.ts) bedeutet **jedes** gesetzte `runId`, dass ein run-spezifischer Log in `localStorage` geschrieben wird.

Folge:

- es entsteht ein kuenstlicher Run-Log-Bucket `falmec-run-log-sys`
- das ist kein Hauptworkflow-Breaker
- aber es ist wieder dieselbe Fehlerklasse wie bei den zuvor diskutierten Run-Log-Resten: System-Logging wird wie Run-Logging behandelt

### 5. Mittel: Die Testabdeckung bestaetigt die neue SSOT-Logik noch nicht

Build, TypeScript und Bestandstests sind gruen, aber es gibt aktuell keine echte Testabdeckung fuer die neuen Kernpfade wie:

- `createRunSkeleton()`
- `parseInvoiceForIngest()`
- `ingestAndPersistRunData()`
- `startWorkflowPhase2()`
- `cleanupFailedIngest()`
- `loadPersistedRun()` Ghost-Run-Erkennung
- `reprocessCurrentRun()`

Folge:

- der Gruenstatus der Suite ist beruhigend fuer Altverhalten
- aber praktisch kein Beweis dafuer, dass die PROJ-49-Umsetzung selbst stabil ist

## Bewertung der Umsetzung gegen Plan und Soll-Zustand

### Was gut umgesetzt wirkt

- Der neue 4-Phasen-Schnitt ist real in der App angekommen:
  - `createRunSkeleton()`
  - `parseInvoiceForIngest()`
  - `ingestAndPersistRunData()`
  - `startWorkflowPhase2()`
- `fileSnapshot` ist tatsaechlich vor dem Reset eingezogen
- `cleanupFailedIngest()` ist als eigener Pfad vorhanden
- `loadPersistedRun()` hat Ghost-Run-Erkennung
- `buildAutoSavePayload()` und `runPersistenceService.saveRun()` tragen sichtbar SSOT-/Overwrite-Schutz
- Step 4 nutzt fuer SSOT-Runs tatsaechlich `parsedOrderPool` und `parsedArticlePool`

### Wo die Umsetzung noch hinter dem Soll-Zustand liegt

- Phase-1-Validierung ist nicht robust genug verdrahtet und bricht schon an einem falschen Property-Namen
- Optionalitaet von `serialList`/`openWE` ist im realen New-Run-Flow nicht nutzbar
- Step-2-Guard ist noch nicht voll auf SSOT umgestellt
- einige Nebenpfade tragen noch globale/logische Altlasten (`masterDataStore`, `runId: 'sys'`)

## Confidence-Werte

- **Confidence zur Umsetzung des Plans:** `0.68 / 1.00`
- **Confidence zum erreichten Soll-Zustand:** `0.56 / 1.00`

Begruendung:

- Der strukturelle Umbau ist sichtbar und ernsthaft erfolgt
- aber der erste Testfehler kommt aus einem **echten Kernpfad**
- dazu kommen mehrere Restverdrahtungen, die zeigen, dass die Umsetzung noch nicht durchgaengig “SSOT-first” denkt
- die fehlende direkte Testabdeckung fuer PROJ-49 drueckt die Sicherheit weiter

## Vorschlagsliste zur Behebung

### Sofort beheben

1. Die Artikellisten-Validierung in Phase 1 auf das reale Feldmodell korrigieren.
   - Der Check muss auf `falmecArticleNo` statt `artNo` gehen.
   - Danach den gesamten Phase-1-Artikelpfad mit realen Testdateien erneut pruefen.

2. Fuer PROJ-49 gezielte Tests nachziehen.
   - Minimum:
     - Phase-1-Artikelvalidierung positiv
     - Phase-1-Artikelvalidierung negativ
     - Ghost-Run-Erkennung
     - Reprocess `load -> reset -> save -> advance`
     - Step 2 und Step 4 auf IDB-Pools

3. Den New-Run-Einstieg gegen den gewuenschten Sollzustand entscheiden.
   - Entweder `serialList`/`openWE` im Startscreen wirklich optional machen
   - oder den Plan an die harte Produktregel anpassen
   - aktuell sind Plan und UI hier nicht deckungsgleich

### Danach gezielt haerten

4. Step-2-Guard auf SSOT ausrichten.
   - Fuer SSOT-Runs sollte `parsedArticlePool` der autoritative Readiness-Indikator sein
   - nicht `masterDataStore`

5. Systemlogs ohne pseudo-Run-ID schreiben.
   - `runId: 'sys'` sollte nicht als Run-Log behandelt werden
   - sonst erzeugt die Umsetzung neue Log-Nebenpfade, obwohl sie genau diese Klasse eigentlich haerten wollte

6. Einen expliziten Test fuer die tatsaechliche New-Run-Startsequenz bauen.
   - `fileSnapshot`
   - `createRunSkeleton`
   - `parseInvoiceForIngest`
   - `ingestAndPersistRunData`
   - `startWorkflowPhase2`

## Ergaenzung: Phase-1-Validierung und Parser-/Alias-Kopplung

Ja: Die Phase-1-Validierung der Artikelliste haengt **direkt** an der Parser- und Alias-Logik.

Die Kette ist aktuell:

1. `parseMasterDataFile()` liest die Excel-Datei.
2. Die Spalten werden ueber `FALMEC_SCHEMA` und dessen Aliaslisten auf Felder gemappt.
3. Aus den gemappten Spalten wird `ArticleMaster[]` gebaut.
4. Erst **danach** bewertet `ingestAndPersistRunData()` die Liste als `ready` oder `invalid`.

Das bedeutet:

- Wenn Alias-Matching eine Spalte nicht erkennt, kommt im Parser einfach `''` oder `null` an.
- Phase 1 validiert **nicht die Originalspalten**, sondern nur das Parser-Ergebnis.
- Wenn also die Alias-/Schema-Zuordnung schiefgeht, sieht Phase 1 nur noch "fehlende Felder" und meckert an der Artikelliste.

### Konkreter technischer Befund

In [masterDataParser.ts](C:\0WERKBANK0\falmec-reicptpro_v4\src\services\masterDataParser.ts) gilt:

- `artNoDE`, `artNoIT`, `ean`, `price` sind im Schema `required: true`
- `storageLocation` und `supplierId` sind im Schema dagegen `required: false`
- fehlende Pflichtfelder erzeugen nur `warnings`
- der Parser liefert trotzdem ein `ArticleMaster[]` zurueck

In [runStore.ts](C:\0WERKBANK0\falmec-reicptpro_v4\src\store\runStore.ts) verlangt Phase 1 spaeter aber mindestens eine Zeile mit:

- `artNo` (fachlich gemeint: `falmecArticleNo`)
- `storageLocation`
- `supplierId`

Damit entsteht aktuell ein **Vertragsbruch zwischen Parser und Validator**:

- Der Parser behandelt `storageLocation` und `supplierId` als optional.
- Die Phase-1-Validierung behandelt sie faktisch als Pflicht.
- Die Parser-`warnings`, `columnMap` und `collisions` werden fuer die Freigabe nicht ausgewertet.

### Praktische Folge

Wenn die Artikelliste zwar Daten enthaelt, aber z. B.:

- der Header fuer `Hauptlager` nicht ueber Alias erkannt wird
- der Header fuer `Hauptlieferant` nicht ueber Alias erkannt wird
- `artNoDE` wegen Regex/Override leer normalisiert wird

dann entsteht **kein klarer Parserfehler**, sondern nur ein spaeteres `invalid` in Phase 1.

Das macht die Fehlerklasse gefaehrlich:

- Der User sieht "Artikelliste ungueltig"
- die eigentliche Ursache kann aber in der Alias-Erkennung, im Regex-Override oder im Parservertrag liegen

### Zusatzbewertung

Die aktuelle Implementierung koppelt Phase 1 also nicht nur an den Parser allgemein, sondern ganz konkret an:

- `FALMEC_SCHEMA` Aliasdefinitionen
- die Spaltenwahl-Logik (`electColumns`)
- `artNoDeRegex` bzw. `matcherProfileOverrides`
- die stillen Defaultwerte des Parsers bei nicht erkannten Spalten

Kurz:

**Ja, wenn diese Kette nicht stabil ist, entsteht hier eine weitere echte Fehlerquelle.**

### Ergaenzende Empfehlung

Fuer diese Kette sollte die Behebung nicht nur den falschen Feldnamen korrigieren, sondern zusaetzlich:

1. Parser-`columnMap`, `warnings` und `collisions` in die Diagnose der Phase 1 mit aufnehmen.
2. Klar entscheiden, ob `storageLocation` und `supplierId` parserseitig wirklich optional bleiben duerfen, wenn Phase 1 sie fachlich als Pflicht betrachtet.
3. Einen Testfall aufsetzen fuer:
   - korrekte Alias-Zuordnung von `Hauptlager`
   - korrekte Alias-Zuordnung von `Hauptlieferant`
   - Regex-Override bei `artNoDE`
   - Phase-1-Freigabe auf Basis realer Parser-Ausgabe statt angenommener Feldnamen

## Schlussbewertung

Die Umsetzung ist **nicht gescheitert**, aber sie ist aktuell **nicht vertrauenswuerdig genug fuer den behaupteten “felsenfesten” SSOT-Zustand**.

Das Wichtigste:

- Die Architekturidee ist im Code angekommen.
- Der erste fruehe Fehler ist aber real und direkt im Kernpfad verankert.
- Damit ist der aktuelle Stand eher:
  - **guter struktureller Umbau**
  - aber **noch keine belastbar durchverdrahtete Ausfuehrung**

Kurz:

**Der Plan wurde sichtbar ernsthaft umgesetzt, aber die Implementierung ist noch nicht planstabil.**
