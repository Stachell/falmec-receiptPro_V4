# ORDER.MAPPER Details - Ist-Analyse Step 4

> Stand: 2026-02-23
> Scope: Run-Detail Workflow (Step 4), Verbindungen, Logiken, Settings, aktive Parser/Matcher, Kachel-Bezug

## 1. Gepruefte Quellen

- `features/PROJ-22-23-MASTERPLAN.md`
- `features/PROJ-24-run-stability-modular-order-serial.md`
- `features/PARSING-RULES/order-mapper.md` (Soll-Doku)
- `src/store/runStore.ts` (Ist-Workflow-Orchestrierung)
- `src/services/matching/matchingEngine.ts`
- `src/services/matching/runs/run1PerfectMatch.ts`
- `src/services/matching/runs/run2PartialFillup.ts`
- `src/services/matching/runs/run3ExpandFifo.ts`
- `src/services/matching/orderPool.ts`
- `src/services/matching/orderParser.ts`
- `src/services/matching/orderParserProfiles.ts`
- `src/components/SettingsPopup.tsx`
- `src/pages/RunDetail.tsx`
- `features/KACHEL-RULES/Kachel-Rules.md`
- `src/services/parsers/index.ts`
- `src/services/parsers/modules/FatturaParser_Master.ts`
- `src/services/matchers/index.ts`

## 2. Executive Summary

Step 4 wird im produktiven Pfad weiterhin ueber den Config-Wert `activeOrderMapperId = "waterfall-4"` gestartet, fuehrt aber intern **nicht** den alten PROJ-20-Mapper aus. Stattdessen laeuft die PROJ-23-Architektur:

1. `parseOrderFile()` mit Profil/Overrides
2. Quality-Gate (0 Positionen oder low confidence => Step 4 failed)
3. `executeOrderMapping()`
4. `buildOrderPool()` (Article-First)
5. `executeMatchingEngine()` mit Run 1/2/3
6. Expansion auf Einzelzeilen + FIFO-Fill
7. Issues/Stats/Pool im Store persistieren
8. Cache-Cleanup (`preFilteredSerials`, `serialDocument`)
9. Auto-Advance zu Step 5 (nur wenn Step 4 ok/soft-fail)

Der Name `waterfall-4` ist aktuell ein Legacy-Label, technisch ist es die 3-Run-MatchingEngine.

## 3. Timeline - Wann welcher Schritt ausgefuehrt wird

## 3.1 Auto-Workflow bis Step 4

- Step 1 beendet sich in `updateRunWithParsedData()` und triggert nach 500ms `advanceToNextStep()`.
- `advanceToNextStep()` startet Step 2 automatisch nach 100ms.
- Nach Step 2 Erfolg (`ok`/`soft-fail`) Auto-Advance zu Step 3 nach 100ms.
- Step 3 startet nach 100ms.
- Nach Step 3 Erfolg (`ok`/`soft-fail`) Auto-Advance zu Step 4 nach 100ms.
- Step 4 startet nach 100ms (`Auto-Start: Order-Mapping`).

## 3.2 Step 4 Laufzeitpfad (Auto)

T0:
- Guard: Run nicht pausiert.
- Entscheidung via `globalConfig.activeOrderMapperId`.

T0 + 0ms bis Parser-Ende:
- Bei `waterfall-4`: `parseOrderFile(openWE, { profileId, overrides })`.
- Warnings werden geloggt.
- `lastOrderParserDiagnostics` wird gesetzt.

Parser-Gate:
- Falls `positions.length === 0` oder `diagnostics.confidence === "low"`:
  - Step 4 => `failed`
  - Run-Status => `soft-fail`
  - Issue Typ `parser-error`
  - Kein Auto-Advance.

Parser-Gate bestanden:
- `executeOrderMapping(parseResult.positions)`.
- Danach Timer (100ms) fuer Auto-Advance zu Step 5, aber nur wenn Step 4 `ok` oder `soft-fail`.

Sonderfall ohne openWE-Datei:
- Step 4 wird `ok` gesetzt.
- Auto-Advance zu Step 5 nach 100ms.

## 3.3 Retry/Resume Timeline

- `retryStep(stepNo=4)` fuehrt denselben Parse+Gate+Mapping-Pfad erneut aus.
- `resumeRun()` bei laufendem Step 4 triggert denselben Step-4-Block erneut.
- `pauseRun()` stoppt aktive Timer; kein Auto-Advance waehrend Pause.

## 4. Schritt 4 - Verbindungen und Logiken ("Kacheln/Workflow angeschlossen")

## 4.1 Direkt angeschlossene Komponenten/Services

- UI Trigger: `RunDetail.tsx` (Start/Retry-Kachel, Pause/Fortfahren)
- Workflow-Orchestrator: `runStore.advanceToNextStep()`
- Parser openWE: `orderParser.parseOrderFile()`
- Profil/Defaults: `orderParserProfiles.ts`
- Quality-Gate + Issue Builder: `buildOrderParserFailureIssue()` in `runStore.ts`
- Engine Entry: `runStore.executeOrderMapping()`
- Pool: `buildOrderPool()` in `orderPool.ts`
- Matching Runs: `run1PerfectMatch`, `run2PartialFillup`, `run3ExpandFifo`
- Engine-Issues: `buildEngineIssues()` in `matchingEngine.ts`
- Manual UI: `ManualOrderPopup.tsx`
- Manual Pool-Mutationen: `reassignOrder()` in `runStore.ts`

## 4.2 Kernlogik Step 4 (Fachlich)

1. Parse der Bestellliste (CSV/XLSX)
- CSV: ISO-8859-1 + Semikolon
- Score-basierte Spaltenwahl fuer orderNumber
- Tie-break Prioritaet (default `BELEGNUMMER`)
- Diagnostics: Kandidaten + Confidence

2. Quality-Gate
- Blockiert Step 4 bei unbrauchbarem Parse-Ergebnis.

3. Article-First OrderPool
- Nur Orders, deren `artNoDE` in Rechnungsartikeln vorkommt.
- Sortierung: `orderYear ASC`, dann `belegnummer ASC`.
- Consumption Tracking: `remainingQty/consumedQty`.

4. MatchingEngine Run 1/2/3
- Run 1: Perfect Match (Ref + exact qty)
- Run 2: Reference partial fill + Smart Qty
- Run 3: Expansion (qty=1) + FIFO fuer Rest

5. Persistenz und Cleanup
- `run.isExpanded = true`
- `invoiceLines` werden expandiert ersetzt
- `orderPool` bleibt im Store fuer manuelle Zuordnung
- `preFilteredSerials = []`, `serialDocument = null`

## 4.3 Step-4-Issues (Ist-Zustand)

Erzeugt werden:
- `parser-error` (bei Gate-Block)
- `order-no-match` (severity: warning)
- `order-fifo-only` (severity: info)
- `order-multi-split` (severity: info)
- Pool-Soft-Fail wird aktuell als `order-no-match` erzeugt (nicht eigener Typ).

## 4.4 KPI/Kachel-Bezug (Beispiel)

Kachel 5 "Beleg zugeteilt" in `RunDetail.tsx`:
- Zaehler: `currentRun.stats.matchedOrders`
- Nenner: `expandedLineCount || parsedInvoiceLines`
- Warn-Subtext: `notOrderedCount > 0`
- Variante: warning bei `notOrderedCount > 0`, sonst success/default

Diese Werte stammen nach Step 4 aus:
- `MatchingEngine` Stats + `expandedLineCount = result.lines.length`
- plus `computeOrderStats()` bei manuellen Nachkorrekturen

## 5. Einstellungen - was geaendert wird / geaendert werden kann

## 5.1 Direkt im SettingsPopup aenderbar

Tab "Bestellung mappen":
- `activeOrderMapperId`
  - `legacy-3`
  - `waterfall-4` (intern 3-Run Engine)
- `activeOrderParserProfileId`
- `orderParserProfileOverrides` (Alias-Listen)
- Read-only letzte Diagnose (`lastOrderParserDiagnostics`)

Tab "Serial parsen":
- `strictSerialRequiredFailure` (Step-3-Gate)

## 5.2 Indirekte Auswirkungen auf Step 4

- Parserprofil/Overrides aendern Spaltenerkennung, Candidate-Score und Confidence.
- Dadurch kann das Step-4-Gate haeufiger/seltener blockieren.
- `activeOrderMapperId = legacy-3` umgeht den neuen Step-4-Autopfad praktisch (setzt aktuell direkt ok).

## 6. Welche Parser/Matcher sind im Hintergrund aktiv

## 6.1 PDF-Parser (Step 1)

Aktiv in Registry:
- `FatturaParser_Master` ist der einzige lokale Produktiv-Parser (`src/services/parsers/index.ts`).
- `findParserForFile()` waehlt effektiv diesen Parser.

Hinweis:
- `DEFAULT_PARSER_MODE = "typescript"` in `src/services/parsers/config.ts`.
- Devlogic/Python-Struktur ist im Repo vorhanden, aber im aktuellen Frontend-Workflow nicht der aktive Standardpfad.

## 6.2 Matcher (Step 2/3)

Aktiv in Registry:
- `FalmecMatcher_Master` ist aktuell der einzige Matcher (`src/services/matchers/index.ts`).
- `matcherRegistryService` verwaltet Auswahl, default `auto`.

## 6.3 Order-Parser (Step 4)

Aktiv:
- `parseOrderFile()` mit Defaultprofil `sage-openwe-v1`
- Nur ein Profil ist aktuell registriert (`ORDER_PARSER_PROFILES` mit Defaultprofil)
- Overrides koennen per Settings gesetzt werden.

## 7. Abweichungen Soll-Doku vs. Ist-Workflow (wichtig fuer Anpassung)

1. Mapper-Bezeichnung
- Ist: Config-Wert `waterfall-4`, aber Runtime ist PROJ-23 3-Run Engine.

2. Step-4-Issue-Severity
- Ist: `order-no-match` ist `warning` (nicht `error`).

3. Issue-Typ fuer Pool-Validierung
- Ist: Pool-Validierungsfall erzeugt `order-no-match`.
- Doku alt: separater Typ `order-pool-validation`.

4. `order-incomplete`
- Ist: in Step-4-Engine aktuell nicht aktiv erzeugt.
- Doku alt: als Step-4-Standard-Issue aufgefuehrt.

5. Manual-Zuweisung Reason
- Ist: `reassignOrder()` schreibt `manual-ok`.
- Doku alt: teils `manual` als primaerer Output dargestellt.

## 8. Praktische Konsequenzen fuer deine Workflow-Anpassung

- Wenn du Step 4 anpasst, arbeite auf `executeOrderMapping()` + MatchingEngine-Runs, nicht auf `orderMapper.ts` (Legacy).
- Behalte das Parser-Gate im Blick; viele "Mapping-Fehler" sind eigentlich Parse-/Confidence-Themen.
- Wenn du UI-Settings umbenennst (z.B. `waterfall-4`), muss die Store-Branch-Logik synchron angepasst werden.
- Fuer saubere Issues sollte optional ein eigener Typ fuer Pool-Validierung wieder eingefuehrt werden.
