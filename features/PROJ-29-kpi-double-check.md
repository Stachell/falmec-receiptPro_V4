# PROJ-29 – Run-Detail KPI Double-Check Logic & Line 3 Remapping

## Beschreibung

Die 5 KPI-Kacheln im Run-Detail-Cockpit erhalten zwei Ergänzungen:

1. **Line-3-Remapping:** Zeile 3 (subValue) der Kacheln 1, 2, 4 und 5 zeigt neue, inhaltlich reichhaltigere Informationen (Kachel 3 bleibt unverändert).
2. **Double-Check-Logik:** Jede Kachel (1–5) bekommt eine reaktive Prüfbedingung. Wenn diese erfüllt ist, wird die Kachel zart grün eingefärbt und ein `CheckCircle2`-Icon erscheint rechts in Zeile 3 als visuelles Vertrauens-Siegel.

Die Double-Check-Logik ist **ausschließlich UI-Validierung** — sie hat keinen Einfluss auf Workflow-Guards, State-Machines oder den Export-Prozess.

**Kachel 6 (Next-Step-Button) wird nicht angefasst.**

## Abhängigkeiten

- Baut auf: PROJ-18 (Run-Detail UI Refinement), PROJ-20 (SerialFinder/OrderMapper), PROJ-21 (Issue-Center), PROJ-26 (Kachel-Anpassung-Codex)
- Kein nachgelagertes Feature abhängig

---

## User Stories

### US-1: Rechnungssummen-Plausibilisierung (Kachel 1)
**Als** Mitarbeiter im Wareneingang
**möchte ich** auf Kachel 1 sofort sehen, ob die Zeilensumme mit dem aufgedruckten Rechnungsbetrag übereinstimmt,
**damit** ich Parsing-Fehler oder Rundungsdifferenzen sofort erkenne, ohne die PDF-Rechnung manuell zu prüfen.

### US-2: Paket-Anzahl-Plausibilisierung (Kachel 2)
**Als** Lagerarbeiter
**möchte ich** auf Kachel 2 sehen, ob die extrahierte Artikelgesamtmenge mit dem Paketfeld der Rechnung übereinstimmt,
**damit** ich Vollständigkeitsfehler beim Parsen ohne Tab-Wechsel erkenne.

### US-3: Preisabweichungs-Siegel (Kachel 3)
**Als** Einkäufer
**möchte ich**, dass Kachel 3 grün leuchtet wenn alle Preise übereinstimmen,
**damit** ich auf einen Blick sehe, dass kein manueller Eingriff nötig ist.

### US-4: Seriennummern-Vollständigkeits-Siegel (Kachel 4)
**Als** Mitarbeiter im Wareneingang
**möchte ich** auf Kachel 4 die Anzahl der Artikel ohne S/N-Pflicht sehen und ein grünes Siegel erhalten, wenn das S/N-Tracking lückenlos ist,
**damit** ich sofort weiß, ob serialisierungspflichtige und seriennummernfreie Artikel korrekt klassifiziert wurden.

### US-5: Bestellzuteilungs-Siegel (Kachel 5)
**Als** Backoffice-Mitarbeiter
**möchte ich** auf Kachel 5 die Anzahl eindeutig vergebener Beleg-Nummern sehen und ein grünes Siegel erhalten, wenn alle Artikel zugeteilt und alle Beleg-Nummern formatkonform sind,
**damit** ich sicher sein kann, dass der Sage100-Export keine ungültigen Bestellnummern enthält.

### US-6: Reaktive Neu-Berechnung
**Als** Benutzer
**möchte ich**, dass das grüne Siegel sofort verschwindet oder erscheint, wenn ich einen Schritt erneut ausführe oder Daten korrigiere,
**damit** ich stets den aktuellen Stand sehe.

---

## Acceptance Criteria

### AC-1: Kachel 1 — Line 3 & Double-Check
- [ ] Zeile 3 zeigt `"{invoiceTotal} € Gesamtsumme"` (de-DE Locale, 2 Dezimalstellen)
- [ ] Quelle: `currentRun.invoice.invoiceTotal` (Fallback: `parsedInvoiceResult?.header.invoiceTotal`)
- [ ] Wenn `invoiceTotal` null/undefined: Fallback auf bisherigen Text (Fattura-Nr. oder Mismatch-Warnung)
- [ ] `isKachel1Verified = true` wenn: `|Σ(line.totalLineAmount) - invoiceTotal| < 0.10`
- [ ] `isKachel1Verified = false` wenn: `invoiceTotal` null/undefined ODER keine Zeilen vorhanden

### AC-2: Kachel 2 — Line 3 & Double-Check
- [ ] Zeile 3 zeigt `"{packagesCount} Artikel gelistet"`
- [ ] Quelle: `parsedInvoiceResult?.header.packagesCount` (Fallback: `currentRun.invoice.packagesCount`)
- [ ] Wenn `packagesCount` null/undefined: Fallback auf bisherigen expandedLineCount-Text
- [ ] `isKachel2Verified = true` wenn: `Σ(line.qty) === packagesCount`
- [ ] `isKachel2Verified = false` wenn: `packagesCount` null/0/undefined ODER keine Zeilen vorhanden

### AC-3: Kachel 3 — Double-Check (subValue unverändert)
- [ ] Zeile 3 bleibt wie bisher (Abweichungen / fehlen / undefined)
- [ ] `isKachel3Verified = true` wenn: `priceMismatchCount === 0 AND priceOkCount > 0`
- [ ] `isKachel3Verified = false` wenn: Preisabweichungen > 0 ODER noch kein Preis geprüft

### AC-4: Kachel 4 — Line 3 & Double-Check
- [ ] Zeile 3 zeigt `"{serialNotRequiredArticleCount} ART. ohne S/N-PFLICHT"`
  - Ausnahme: Wenn `serialRequiredCount === 0` → zeigt weiterhin `"Keine SN-Pflicht"`
- [ ] `serialNotRequiredArticleCount` = Qty-Summe aller InvoiceLines mit `serialRequired === false`
- [ ] `isKachel4Verified = true` wenn: `serialNotRequiredQtySum + serialRequiredQtySum === totalQty`
  - Wobei `totalQty` = Σ(line.qty) aller Zeilen des Runs
  - Wobei `serialRequiredQtySum` = Qty-Summe aller Zeilen mit `serialRequired === true`
  - Wobei `serialNotRequiredQtySum` = Qty-Summe aller Zeilen mit `serialRequired === false`

### AC-5: Kachel 5 — Line 3 & Double-Check
- [ ] Zeile 3 zeigt `"{allocatedOrderCount} Beleg-Nr. zugeteilt"`
  - Fallback: wenn `allocatedOrderCount === 0` → zeigt `"{notOrderedCount} nicht bestellt"` (wenn > 0)
- [ ] `allocatedOrderCount` = Anzahl eindeutiger Bestellnummern aus allen `line.allocatedOrders[].orderNumber`
- [ ] `isKachel5Verified = true` wenn ALLE folgenden Bedingungen erfüllt:
  1. `matchedOrders === expandedLineCount` (alle Zeilen zugeteilt)
  2. `allocatedOrderCount > 0` (mindestens eine Bestellnummer)
  3. Format-Prüfung: Jede einzigartige Bestellnummer entspricht `YYYY-XXXXX`:
     - `YYYY`: `0000` ODER Jahr zwischen `(currentYear - 20)` und `(currentYear + 100)`
     - `XXXXX`: genau 5 Ziffern, beginnt mit `10`, `11`, `12`, `20`, `97`, `98` oder `99`
  4. Die Format-Prüfung läuft nur auf **einzigartigen** Nummern (eine Bestellnummer darf für mehrere Artikel genutzt werden — das ist kein Fehler)

### AC-6: UI-Verhalten bei isVerified = true
- [ ] Äußerer Container erhält CSS-Klasse `kpi-tile-verified`: Relief-Effekt (inset box-shadow) + Seitenhintergrund mit 40% Grau-Overlay (`hsl(193 32% 36% / 0.6)`), dunklerer Rand (`hsl(193 32% 30%)`)
- [ ] Zeile 1 (Counter/Nenner) wird `text-white` (weiße Schrift auf grünem Grund)
- [ ] Icon neben Zeile 1 wird `text-white/70` (dezent weiß)
- [ ] Label (Zeile 2) erhält `text-emerald-50` (helles Grau/fast-weiß für gute Lesbarkeit)
- [ ] Zeile 3 Text erhält `text-emerald-50` (helles Grau/fast-weiß)
- [ ] `CheckCircle2` Icon (22x22px, `text-[#46cb78]`) erscheint rechts-bündig in Zeile 3
- [ ] Bei `isVerified = true` wird die variant-Border unterdrückt (kein `border-l-4` Restrand)
- [ ] Kein Layout-Shift wenn `isVerified = false`

### AC-7: Reaktivität
- [ ] Alle Verified-Booleans werden via `useMemo` reaktiv berechnet
- [ ] Bei Retry (Step 3 oder 4) werden alle Checks sofort neu berechnet
- [ ] Kein eingefrorener Zustand

### AC-8: Kachel 6 unberührt
- [ ] Kachel 6 (Next-Step-Button-Div) erhält keine Änderungen

---

## Edge Cases

| Szenario | Erwartetes Verhalten |
|---|---|
| `invoiceTotal` ist null (PDF-Parser hat keinen Footer) | Kachel 1: Fallback auf Fattura-Nr., isVerified = false |
| `packagesCount` ist null | Kachel 2: Fallback auf expandedLineCount, isVerified = false |
| Alle Artikel ohne S/N-Pflicht (`serialRequiredCount === 0`) | Kachel 4: Zeigt "Keine SN-Pflicht", isVerified = true (0+totalQty == totalQty) |
| Noch kein Schritt ausgeführt (leere Lines) | Alle 5 isVerified = false |
| Bestellnummer `"0000-10153"` (Jahr = 0000) | Format-Check: valid (year === 0) |
| Bestellnummer `"2025-20001"` (Präfix 20) | Format-Check: valid |
| Bestellnummer `"2025-50001"` (Präfix 50, ungültig) | isKachel5Verified = false |
| Bestellnummer `"25-10153"` (YYYY fehlt) | isKachel5Verified = false |
| Bestellnummer in 2 Zeilen für unterschiedliche Artikel | Kein Fehler — wird korrekt dedupliziert |
| Preis-Mismatch vorhanden, dann manuell korrigiert | isKachel3Verified wechselt live auf true |
| Step 4 via Retry neu ausgeführt, jetzt alle zugeteilt | isKachel5Verified wechselt live auf true |

---

## Technische Hinweise (Implementierung)

- **Kein Store-Eingriff:** `src/types/index.ts` und `src/store/runStore.ts` bleiben unverändert
- **`InvoiceLine.totalLineAmount`** ist der korrekte Feldname (nicht `totalPrice`)
- **`RunStats.serialRequiredCount`** zählt ZEILEN, nicht Qty → neue lokale useMemo-Variable `serialRequiredQtySum` nötig
- **useMemo-Platzierung:** Alle Hooks müssen NACH `useClickLock()` und VOR dem ersten `useEffect` stehen
- **Dependency `currentRun?.id`** (String-Primitiv) statt `currentRun` (Objekt-Referenz) für optimales Memoizing
- **KPITile-Erweiterung:** Neues Prop `isVerified?: boolean`, subValue-Row wird von `<span>` zu flex `<div>` geändert
- **Relief-Add-On:** CSS-Klasse `.kpi-tile-verified` in `src/index.css` — Seitenhintergrund `hsl(193 32% 36% / 0.6)` + inset box-shadow für "gedrückter Button"-Effekt + dunklerer Rand `hsl(193 32% 30%)`
- **Schrift-Add-On:** Bei verified wird Counter/Nenner (Zeile 1) weiß, Zeilen 2+3 helles Grau (`text-emerald-50`), CheckCircle2-Icon weiß

## Changelog

| Datum | Änderung |
|---|---|
| 2026-02-24 | Initiale Implementierung: 13 useMemo-Hooks, KPITile isVerified-Prop, Kachel 1–5 Line-3-Remapping |
| 2026-02-24 | Add-On: Deckkraft `bg-emerald-50/80` → `bg-emerald-300` |
| 2026-02-24 | Add-On: Schrift-Einfärbung bei verified — Counter/Nenner weiß, Zeilen 2+3 helles Grau (`text-emerald-50`), CheckCircle2 weiß |
| 2026-02-24 | Add-On: Hintergrundfarbe `bg-emerald-300` → `bg-[hsl(var(--status-ok))]` |
| 2026-02-25 | Fix: Hintergrundfarbe `bg-[hsl(var(--status-ok))]` → `bg-[#46cb78]` — Stepper-Kreis hat visuell `#46cb78` durch `opacity-70` auf Parent-Button |
| 2026-02-25 | Add-On: Relief-Effekt — `bg-[#46cb78]` → CSS-Klasse `.kpi-tile-verified` (Seitenhintergrund + 40% Grau + inset box-shadow für gedrückten Button-Look) |
| 2026-02-25 | Add-On: CheckCircle2-Icon auf 22x22px (137.5%) vergrößert, Farbe `#46cb78` (Stepper-Grün) |
| 2026-02-25 | Fix: variant-Border bei isVerified unterdrückt — kein `border-l-4` Restrand bei verified Kacheln |

## Status

In Progress
