# Order-Mapper - Parsing-Rules (Ist-Stand)

> Modul: PROJ-23 MatchingEngine (3-Run) mit Article-First OrderPool
> Step: 4 - Bestellungen mappen
> Letztes Review: 2026-02-23

## 1. Aktiver Runtime-Pfad

Der produktive Step-4-Pfad wird aktuell ueber `activeOrderMapperId = "waterfall-4"` gestartet.

Wichtig:
- Das Label `waterfall-4` ist historisch.
- Runtime-seitig wird die PROJ-23 3-Run MatchingEngine ausgefuehrt (`executeOrderMapping()` + `executeMatchingEngine()`).
- Der Legacy-Pfad `legacy-3` wird im Auto-Flow aktuell nicht aktiv gemappt, sondern effektiv uebersprungen (`step4=ok`).

## 2. Ablauf Step 4 (Auto-Run / Retry / Resume)

1. Parse openWE-Datei
- `parseOrderFile(file, { profileId, overrides })`
- CSV: Latin-1 + `;`
- XLSX: first sheet

2. Quality-Gate
- Blockiert Step 4 wenn:
  - `positions.length === 0`
  - `diagnostics.confidence === "low"`
- Ergebnis bei Block:
  - Step 4 => `failed`
  - Run => `soft-fail`
  - Issue Typ `parser-error`
  - kein Auto-Advance zu Step 5

3. Mapping bei Gate-OK
- `executeOrderMapping(parsedOrders)`
- Baut OrderPool und fuehrt 3 Runs aus
- Nach Abschluss Auto-Advance zu Step 5 (wenn Step 4 `ok` oder `soft-fail`)

4. Sonderfall ohne openWE-Datei
- Step 4 wird `ok` gesetzt
- Auto-Advance zu Step 5

## 3. Order-Parser Regeln

## 3.1 Profil

Defaultprofil:
- `id: sage-openwe-v1`
- `orderNumberRegex: ^1\d{4}$`
- `orderYearRegex: ^\d{4}$`
- tie-break priority: `BELEGNUMMER`

## 3.2 Spaltenwahl orderNumber

- Kandidaten ueber Alias-Match auf Header
- Score je Kandidat:
  - `validCount`
  - `validRatio`
  - `nonEmptyCount`
  - `tieBreakRank`
- Sortierung: validCount > validRatio > nonEmptyCount > tieBreakRank > columnIndex
- Confidence:
  - high: ratio>=0.8 und validCount>=3
  - medium: ratio>=0.35 und validCount>=1
  - low: sonst

## 3.3 Feld-/Zeilenfilter

- orderNumber wird aus Rohwert auf letzte 5 Ziffern normalisiert
- orderYear aus Jahrspalte oder Fallback aus Belegnummer-Anfang
- Zeilen werden verworfen wenn:
  - orderNumber regex fail
  - openQuantity <= 0

## 4. Article-First OrderPool

`buildOrderPool(parsedOrders, runLines, masterArticles, runId)`:

- Nur Orders mit `artNoDE` in Rechnungsartikeln werden uebernommen
- Sortierung pro Artikel: `orderYear ASC`, `belegnummer ASC`
- Pool-Mutationen:
  - `consumeFromPool(positionId, qty)`
  - `returnToPool(positionId, qty)`
- Persistierbar (serialize/deserialize) fuer Run-Persistenz

Soft-Validation:
- Fehlende `ean` und `artNoIT` erzeugen Warning-Issue,
- aktuell als Typ `order-no-match` modelliert.

## 5. 3-Run MatchingEngine

## 5.1 Run 1 - Perfect Match (aggregiert)

Bedingung:
- PDF orderCandidate passt auf orderNumber-Rumpf
- `entry.remainingQty === line.qty`

Aktion:
- consume pool qty=line.qty
- setze `allocatedOrders=[{reason:'perfect-match', qty:line.qty}]`

## 5.2 Run 2 - Partial Fillup (aggregiert)

A) Reference Match:
- Kandidatenref passt, aber qty nicht exakt
- zieht Teilmengen aus passenden Eintraegen

B) Smart Qty:
- genau ein Pool-Eintrag mit `remainingQty === remainingQty(line)`

Aktion:
- `allocatedOrders[]` kann mehrere Eintraege enthalten
- reasons: `reference-match`, `smart-qty-match`

## 5.3 Run 3 - Expansion + FIFO

1. Expansion:
- Aggregierte Zeile `qty=N` -> N Einzelzeilen (`qty=1`)
- `lineId: {runId}-line-{positionIndex}-{i}`
- verteilt `serialNumbers[]` und `allocatedOrders[]`

2. FIFO:
- fuer `pending` Einzelzeilen
- consume 1 vom aeltesten verfuegbaren Pool-Eintrag
- reason: `fifo-fallback`
- wenn nichts verfuegbar: `not-ordered`

## 6. Step-4 Stats und Issues (Ist)

## 6.1 Stats

Aus MatchingEngine:
- `perfectMatchCount`
- `referenceMatchCount`
- `smartQtyMatchCount`
- `fifoFallbackCount`
- `matchedOrders`
- `notOrderedCount`
- `expandedLineCount = result.lines.length`

## 6.2 Issues

Engine erzeugt:
- `order-no-match` (severity: warning)
- `order-fifo-only` (severity: info)
- `order-multi-split` (severity: info)

Gate erzeugt:
- `parser-error` (severity: error)

Hinweis:
- `order-incomplete` ist als Typ im System vorhanden, wird im aktuellen Engine-Pfad aber nicht aktiv erzeugt.

## 7. Store-Updates nach Erfolg

`executeOrderMapping()` setzt:
- `run.isExpanded = true`
- `invoiceLines = expanded lines`
- `orderPool = result.pool`
- Step 4 Status:
  - `soft-fail` wenn `notOrderedCount > 0`
  - sonst `ok`

Cache cleanup:
- `preFilteredSerials = []`
- `serialDocument = null`

## 8. Manuelle Nachbearbeitung (A5)

UI:
- `ManualOrderPopup` zeigt verfuegbare Pool-Eintraege pro Artikel
- Option `NEW` fuer Freitext

Store:
- `reassignOrder(lineId, positionId|'NEW', freeText)`
  - alte Zuweisung via `returnToPool`
  - neue Zuweisung via `consumeFromPool`
  - line update + autoResolveIssues
  - reasongruppe wird aktuell auf `manual-ok` gesetzt

## 9. Settings-Bezug

In `SettingsPopup` Tab "Bestellung mappen":
- `activeOrderMapperId`
- `activeOrderParserProfileId`
- `orderParserProfileOverrides`
- read-only `lastOrderParserDiagnostics`

In Tab "Serial parsen":
- `strictSerialRequiredFailure` (beeinflusst Step 3 Gate und damit indirekt den Einstieg in Step 4)

## 10. Legacy-Hinweis

- `src/services/matching/orderMapper.ts` (PROJ-20 Waterfall) bleibt als Referenz.
- Der aktive Step-4-Hauptpfad laeuft ueber MatchingEngine (PROJ-23).
