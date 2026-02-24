# Kachel Rules - Run-Detail

## Scope

Dokumentiert die Pruef- und Zaehlerlogik der KPI-Kacheln:

- Positionen erhalten
- Artikel extrahiert
- Preise checken
- Serials geparst
- Beleg zugeteilt (vormals Bestellungen mappen)

## Datenquellen

- Parser-Output: `parsedInvoiceResult.header`, `parsedInvoiceResult.lines`
- Run-Stats: `currentRun.stats`
- Invoice-Lines (aggregiert/expandiert je Pipelinephase): `invoiceLines` in `runStore`
- Step-spezifische Stats-Funktionen:
  - `computeMatchStats()` fuer Step 2/3 Preis/Artikel-Grundlage
  - `computeOrderStats()` bzw. `MatchingEngine`-Stats fuer Step 4

## Kachel-Regeln im Detail

### 1) Positionen erhalten

- Anzeige (`RunDetail.tsx`):
  - Zaehler: `currentRun.stats.parsedInvoiceLines`
  - Nenner: `parsedInvoiceResult?.header.pzCount ?? parsedInvoiceResult?.header.parsedPositionsCount ?? '?'`
- 3. Zeile (`subValue`):
  - `qtyValidationStatus === 'mismatch'` -> `Fehler: Anzahl stimmt nicht`
  - sonst -> `parsedInvoiceResult?.header.fatturaNumber`
  - fallback -> `n/a`
- Parser-Abhaengigkeit:
  - `pzCount` = gezaehlte PZ-Positionen
  - `parsedPositionsCount` = geparste Positionsanzahl
  - `qtyValidationStatus` steuert Warn-/Success-Variante
- Hinweis:
  - Die Kachel vergleicht Positionszahl gegen Positionszahl (PZ/parsed count), nicht gegen `totalQty` (Mengen-Summe).

### 2) Artikel extrahiert

- Anzeige:
  - Zaehler: `articleMatchedCount`
  - Nenner: `expandedLineCount || parsedInvoiceLines`
- 3. Zeile (`subValue`):
  - `noMatchCount > 0` -> `{expandedLineCount} Artikel ({noMatchCount} ohne Match)`
  - sonst wenn `expandedLineCount > 0` -> `{expandedLineCount} Artikel`
  - sonst -> keine 3. Zeile
- Hintergrundlogik:
  - `articleMatchedCount` aus `computeMatchStats()`:
    - Alle Zeilen mit `matchStatus != pending && != no-match`
  - `expandedLineCount`:
    - Vor Step 4: Summe der aggregierten Mengen (`qty`) aus Step 1
    - Nach Step 4 (Run 3): tatsaechlich expandierte Einzelzeilen
- Risiko/Interpretation:
  - Nenner ist mengenbasiert (Einzelartikel), nicht positionsbasiert.

### 3) Preise checken

- Anzeige:
  - Zaehler: `priceOkCount`
  - Nenner: `expandedLineCount || parsedInvoiceLines`
  - Sub-Info: `priceMismatchCount` bzw. `priceMissingCount`
- 3. Zeile (`subValue`):
  - `priceMismatchCount > 0` -> `{priceMismatchCount} Abweichungen`
  - sonst wenn `priceMissingCount > 0` -> `{priceMissingCount} fehlen`
  - sonst -> keine 3. Zeile
- Hintergrundlogik:
  - Werte aus `computeMatchStats()` auf Basis `priceCheckStatus` pro Zeile
- Abhaengigkeit:
  - Sinnvoll erst nach Preisabgleich (Step 3), Zaehler kann davor `0` sein.

### 4) Serials geparst

- Anzeige:
  - Zaehler: `serialMatchedCount`
  - Nenner: `serialRequiredCount || '?'`
  - Wenn `serialRequiredCount === 0`: Sub-Text `Keine SN-Pflicht`
- 3. Zeile (`subValue`):
  - `serialRequiredCount === 0` -> `Keine SN-Pflicht`
  - sonst -> keine 3. Zeile
- Hintergrundlogik:
  - `serialRequiredCount` aus Match-/Artikelphase
  - `serialMatchedCount` wird in Step 3 (Serial-Finder) gesetzt
- Abhaengigkeit:
  - Strikt von `serialRequired`-Kennzeichnung je Zeile + erkannte S/N abhaengig.

### 5) Beleg zugeteilt (Step 4)

- Anzeige:
  - Zaehler: `matchedOrders`
  - Nenner: `expandedLineCount || parsedInvoiceLines`
  - Sub-Info: `notOrderedCount`
- 3. Zeile (`subValue`):
  - `notOrderedCount > 0` -> `{notOrderedCount} nicht bestellt`
  - sonst -> keine 3. Zeile
- Hintergrundlogik:
  - `computeOrderStats()`:
    - `matchedOrders`: alle Zeilen mit `orderAssignmentReason` ungleich `pending/not-ordered`
    - `notOrderedCount`: `orderAssignmentReason === not-ordered`
  - In neuer Matching-Engine kommen Stats aus `result.stats` plus `expandedLineCount = result.lines.length`
- Abhaengigkeit:
  - Ergebnis wird stark von Expansion (Run 3), OrderPool und Mappingstrategie beeinflusst.

## Rechnungssumme (Parser-Flow)

- Extraktion:
  - `FatturaParser_Master.extractFooter()` liest `invoiceTotal` aus Footer-Region.
- Bisheriger Bruch:
  - `ParsedInvoiceHeader.invoiceTotal` war vorhanden, aber nicht in App-`InvoiceHeader` gemappt.
- Status nach Fix:
  - Durchgereicht bis `run.invoice.invoiceTotal` und in `OverviewPanel` + `InvoicePreview` sichtbar.

## Erweiterungsvorschlag fuer kuenftige Counter/Nenner

- Einheitliche Konfiguration je Kachel (Counter-Key, Denominator-Key, Fallback, Severity-Regel) in einer zentralen Datei.
- Optional getrennte Nennerstrategie:
  - positionsbasiert (Parserpositionen)
  - mengenbasiert (expandierte Einzelartikel)
- Vorteil:
  - Schnellere Anpassung neuer Pruefmechanismen ohne UI-Logik in `RunDetail.tsx` anfassen zu muessen.

## Technischer Hinweis zur 3. Zeile

- Kachel 1-5: 3. Zeile wird technisch ueber `subValue` in `KPITile` gerendert.
- Kachel 6 (dynamische Start/Retry/Export-Kachel): eigene Renderlogik in `RunDetail.tsx`, nicht ueber `KPITile`.
