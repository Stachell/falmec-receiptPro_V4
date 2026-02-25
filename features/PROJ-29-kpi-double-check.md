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

---

## ADD-ON: Bugfix First-Check-Prerequisite & Checkpoint-Queue (2026-02-25)

### ADD-ON 1: BUGFIX — Double-Check braucht First-Check als Voraussetzung

**Problem:**
1. Die `isKachelXVerified`-Logik aktiviert sich, ohne dass der "First Check" (grüner Balken links = `variant='success'`) bestanden ist. Beispiel: Kachel 4 "Serials geparst" kann verified werden, obwohl noch keine Seriennummern zugeordnet sind.
2. Wenn `isVerified=true`, verschwindet der grüne Balken links, weil `!isVerified && variantStyles[variant]` die Border unterdrückt. Beides (grüner Balken + Relief) soll gleichzeitig sichtbar sein.

**Lösung:**

**1a) Single Source of Truth — `kachelXVariant` + `isKachelXFirstCheck`**
Die variant-Logik wird exakt aus dem JSX extrahiert und in benannte Variablen gespeichert. Diese werden sowohl als `variant={...}`-Prop als auch als Double-Check-Guard verwendet. Alte Inline-Logik im JSX wird gelöscht.

```typescript
const kachel1Variant = parsedInvoiceResult?.header.qtyValidationStatus === 'mismatch'
  ? 'warning' : parsedInvoiceResult?.header.qtyValidationStatus === 'ok' ? 'success' : 'default';
const isKachel1FirstCheck = kachel1Variant === 'success';

const kachel2Variant = currentRun.stats.noMatchCount > 0
  ? 'error' : currentRun.stats.articleMatchedCount > 0 ? 'success' : 'default';
const isKachel2FirstCheck = kachel2Variant === 'success';

const kachel3Variant = (currentRun.stats.priceMismatchCount > 0 || currentRun.stats.priceMissingCount > 0)
  ? 'warning' : currentRun.stats.priceOkCount > 0 ? 'success' : 'default';
const isKachel3FirstCheck = kachel3Variant === 'success';

const kachel4Variant = (currentRun.stats.serialMatchedCount >= currentRun.stats.serialRequiredCount
  && currentRun.stats.serialRequiredCount > 0) ? 'success' : 'default';
const isKachel4FirstCheck = kachel4Variant === 'success';

const kachel5Variant = currentRun.stats.notOrderedCount > 0
  ? 'warning' : currentRun.stats.matchedOrders > 0 ? 'success' : 'default';
const isKachel5FirstCheck = kachel5Variant === 'success';
```

**1b) Jedes `isKachelXVerified` gaten:** `if (!isKachelXFirstCheck) return false;` als erste Zeile jedes useMemo.

**1c) Grüner Balken immer sichtbar:** In KPITile.tsx: `!isVerified && variantStyles[variant]` → `variantStyles[variant]`

**1d) CSS border-left bewahren:** `.kpi-tile-verified` setzt nur `border-top-color`, `border-right-color`, `border-bottom-color` — nicht das Shorthand `border-color`.

### ADD-ON 2: Checkpoint-Meldungen (Queue-System)

**Funktion:** Ersetzt die bisherige einzelne Erfolgsmeldung "Rechnung erfolgreich ausgelesen" durch ein Queue-System mit 6 Checkpoint-Meldungen, die sequentiell angezeigt werden.

**Meldungen:**
1. `[✓] CHECKFELD "PDF-Parsing" erfüllt: Rechnungspositionen und Rechnungssumme erfolgreich geparst.`
2. `[✓] CHECKFELD "Artikel extrahiert" erfüllt: Artikelmenge, Artikelzuordnung erfolgreich durchgeführt.`
3. `[✓] CHECKFELD "Preise checken" erfüllt: Alle Einzel- und Gesamtpreise erfolgreich zugeordnet.`
4. `[✓] CHECKFELD "Serials geparst" erfüllt: Alle seriennummernpflichtigen Artikel erfolgreich zugeordnet.`
5. `[✓] CHECKFELD "Beleg zugeteilt" erfüllt: Alle Artikel konnten offene Bestellungen erfolgreich zugeteilt werden.`
6. `[✓] CHECKFELD "Export" erfüllt: Alle Daten erfolgreich zusammen gestellt, der Download ist verfügbar.`

**Architektur:**
- `CHECKPOINT_MESSAGES` Konstante (modul-level)
- `checkpointQueue: number[]` + `activeCheckpoint: number | null` + `checkpointFade: 'in'|'out'|'hidden'` (State)
- `shownCheckpointsRef: Set<number>` (Ref, verhindert doppelte Anzeige)
- 6 Watcher-Effects (je 1 pro Checkpoint), enqueuen bei `isKachelXVerified=true`
- Checkpoint 6 feuert bei `allTilesVerified = isKachel1..5Verified`
- Consumer-Effect mit sauberem Timer-Cleanup: 2s Anzeige + 300ms Fade-Out
- Reset-Effect bei Run-Wechsel (`currentRun?.id`)
- `showEvent` → `showParseError` umbenennen, nur noch für Fehlerfall

**Rendering:**
- Bestehende Container-Klassen beibehalten (`border-green-500 text-green-800`, `rgba(255,255,255,0.5)`)
- Einzeilig durch `whitespace-nowrap overflow-hidden text-ellipsis`
- CheckCircle2 Icon in `#46cb78` (identisch mit KPI-Tile-Icon)
- Text bis `:` in fett, danach normal

**Kachel 6:** Wird NICHT verändert. Nur die Meldung #6 wird angezeigt.

### Betroffene Dateien
- `src/index.css` — `.kpi-tile-verified` CSS border-fix
- `src/components/KPITile.tsx` — variantStyles Guard entfernen
- `src/pages/RunDetail.tsx` — First-Checks, Verified-Guards, Checkpoint-Queue, Event-Feld

---

## ADD-ON 3 & Bugfix 2: Queue-Timing-Fix + UI-Polish + L-Form-Balken (2026-02-25)

### Bugfix 2: Queue-Timing Freeze

**Problem:** Die Checkpoint-Meldungen frieren ein — nur die erste Meldung erscheint und verschwindet nie.

**Root Cause — Cleanup-Race-Condition im Consumer-Effect:**
Der alte Consumer-Effect hatte `[checkpointQueue, activeCheckpoint]` als Dependencies. Wenn er 3 State-Updates im selben Tick setzte (Queue slice, activeCheckpoint, fade), verursachte die Queue-Änderung einen Re-Render, der die Cleanup-Funktion auslöste und damit die laufenden Timer (`fadeOutTimer`, `clearTimer`) tötete. Im neuen Effect-Durchlauf war `activeCheckpoint !== null` → early return → keine neuen Timer → Meldung bleibt stehen.

**Fix — Zwei separate Effects:**
- **Effect A (Dequeuer):** Reagiert auf `[checkpointQueue, activeCheckpoint]`, dequeued nächstes Item. Hat **keine Timer** → kein Cleanup-Problem.
- **Effect B (Timer):** Reagiert **NUR** auf `[activeCheckpoint]`. Startet 2s Fade-Out + 2.3s Clear. Wird nicht durch Queue-Änderungen re-getriggert.

### UI-Polish: Meldungs-Layout & Farben

- **Höhe:** `h-10` (identisch mit TabsList, 40px) statt `py-2`
- **Breite:** `ml-5 flex-shrink-0` statt `flex-none w-1/3 ml-auto` (dynamisch, min. 20px Abstand)
- **Text:** `overflow-hidden text-ellipsis` entfernt (kein Abschneiden)
- **Icon:** CheckCircle2 in `text-slate-900` (schwarz) statt `text-[#46cb78]` (grün) für bessere Lesbarkeit

### ADD-ON 3: First-Check-Balken L-Form

- **variantStyles** erweitert: `border-t-0` → `border-t-4 border-t-{color}` (L-Form: links + oben)
- **`.kpi-tile-verified`** CSS: `border-top-color` entfernt, nur noch `border-right-color` + `border-bottom-color`
- **Zuständigkeit:** Links + Oben = First-Check (Variant-Farbe). Rechts + Unten = Relief (verified-Farbe).
- **Kachel 6:** Nicht betroffen (nutzt variantStyles nicht)

### Betroffene Dateien
- `src/components/KPITile.tsx` — variantStyles L-Form (`border-t-4 border-t-{color}`)
- `src/index.css` — `.kpi-tile-verified` border-top-color entfernt
- `src/pages/RunDetail.tsx` — Consumer-Effect aufgeteilt (Dequeuer + Timer), Meldungs-Container Layout

---

## ADD-ON 4: Meldung rechtsbündig + L-Form nach unten (2026-02-25)

### Bugfix: Meldung rechtsbündig

- **Problem:** Checkpoint-Meldung dockt linksbündig an (`ml-5` = 20px Offset) statt am rechten Rand
- **Fix:** `ml-5` → `ml-auto` in RunDetail.tsx — schiebt Meldung in Flex-Container ganz nach rechts, wächst dynamisch nach links. `gap-4` (16px) garantiert Mindestabstand zum Tab-Reiter.

### Design 1: L-Form-Balken nach unten

- **variantStyles:** L-Form wandert von LINKS+OBEN nach LINKS+UNTEN
  - `border-t-4` → `border-t-0` (oben genullt)
  - `border-b-0` → `border-b-2` (unten 2px)
  - `border-t-{color}` → `border-b-{color}` (Farbe nach unten)
- **`.kpi-tile-verified` CSS:** Relief-Kanten invertiert auf OBEN+RECHTS
  - `border-top-width: 1px !important; border-right-width: 1px !important;` — Breite muss mit `!important` wiederhergestellt werden, da Variant `border-t-0`/`border-r-0` in `@layer utilities` (höhere Priorität als `@layer components`) die Width auf 0px setzt
  - `border-top-color` + `border-right-color` = `hsl(193 32% 30%)`
  - `border-bottom-color` + `border-left-color` = gesteuert durch Variant (L-Form First-Check)
- **Zuständigkeit:** Links + Unten = First-Check (Variant-Farbe). Oben + Rechts = Relief (verified-Farbe).

## ADD-ON 5: Relief-Intensität +20% (2026-02-25)

- **Problem:** Relief-Effekt (eingedrückter Button) bei verified Kacheln wirkt zu flach
- **Änderungen in `.kpi-tile-verified`:**
  - `background-color` opacity: `0.6` → `0.72` (+20%)
  - Dunkler Inset-Shadow: `inset 2px 2px 6px rgba(0,0,0, 0.35)` → `inset 2px 2px 8px rgba(0,0,0, 0.42)` (Spread 6→8, Opacity +20%)
  - Heller Inset-Shadow: `inset -1px -1px 3px rgba(255,255,255, 0.08)` → `inset -1px -1px 4px rgba(255,255,255, 0.10)` (Spread 3→4, Opacity +25%)

### Betroffene Dateien
- `src/pages/RunDetail.tsx` — `ml-5` → `ml-auto` (Zeile 741)
- `src/components/KPITile.tsx` — variantStyles L-Form unten
- `src/index.css` — `.kpi-tile-verified` Relief top/right + !important widths + Intensität +20%

---

## ADD-ON 6: Text-Overflow-Fix Checkpoint-Meldung (2026-02-25)

- **Problem:** Auf kleinen Bildschirmen sprengt die Checkpoint-Meldung das Layout (kein Truncation, `flex-shrink-0` verhindert Schrumpfen)
- **Fix:**
  - Outer-Div: `flex-shrink-0` → `min-w-0` (Flex-Child darf unter Content-Breite schrumpfen)
  - Text-Span: `whitespace-nowrap` → `truncate` (Tailwind-Shorthand für `overflow-hidden whitespace-nowrap text-ellipsis`)
- **Ergebnis:** Meldung bleibt rechtsbündig, Text wird bei Platzmangel mit `...` abgeschnitten

## ADD-ON 7: Label-Texte Kachel 1-5 aktualisiert (2026-02-25)

- Kachel 1 Line 3: "Gesamtsumme" → "Rechnungssumme"
- Kachel 1 Line 2: "Positionen erhalten" → "Positionen eingelesen"
- Kachel 2 Line 2: "Artikel extrahiert" → "Positionen extrahiert"
- Kachel 3 Line 2: "Preise checken" → "Preise geprüft"
- Kachel 4 Line 3: "ART. ohne S/N-PFLICHT" → "ohne S/N-Pflicht"
- CHECKPOINT_MESSAGES synchron: Labels #2 und #3 angepasst

### Betroffene Dateien
- `src/pages/RunDetail.tsx` — Overflow-Fix + 5 Texte + 2 CHECKPOINT_MESSAGES Labels

## ADD-ON 8: Kachel 3 Zeile-3 im Verified-Zustand sichtbar (2026-02-25)

- **Problem:** Kachel 3 verlor im Erfolgsfall die 3. Zeile inkl. Verified-Darstellung, weil `subValue` bei `0` Abweichungen `undefined` war und die Zeile nur bei vorhandenem `subValue` gerendert wird.
- **Fix in RunDetail:** Dediziertes `kachel3SubValue` eingeführt:
  - Wenn `isKachel3Verified === true` und `priceMismatchCount === 0` und `priceMissingCount === 0` → `✔️- 0 Abweichungen`
  - Sonst unverändert: `{x} Abweichungen` / `{x} fehlen` / `undefined`
- **Fix in KPITile:** Neues optionales Prop `showVerifiedIcon?: boolean` (Default `true`).
  - Für Kachel 3 wird `showVerifiedIcon={false}` gesetzt, damit bei Text `✔️- 0 Abweichungen` kein doppeltes Prüf-Icon erscheint.
  - Kachel 1,2,4,5 bleiben unverändert (Default `true`).
- **Wichtig:** Keine Änderungen an First-Check-/Variant-Logik (Timeline-relevant), keine Änderungen an Queue/Step-Guards, **Kachel 6 nicht betroffen**.

### Betroffene Dateien
- `src/pages/RunDetail.tsx` — `kachel3SubValue` + Kachel-3-Prop `showVerifiedIcon={false}`
- `src/components/KPITile.tsx` — neues optionales Prop `showVerifiedIcon`

## ADD-ON 9: Kachel 3 Zeile-3 Flucht + Icon-Angleichung (2026-02-25)

- **Problem:** In Kachel 3 war Zeile 3 optisch nicht in derselben Flucht wie bei Kachel 1/2/4/5, da das Haken-Symbol als Teil des Textes gerendert wurde.
- **Fix:** Verified-Text in Kachel 3 von `✔️- 0 Abweichungen` auf `0 Abweichungen` umgestellt und wieder das standardisierte KPITile-Icon rechts verwendet.
- **Ergebnis:** Gleiche Zeile-3-Geometrie, gleiche Icon-Position/Größe wie bei den anderen Kacheln.
- **Wichtig:** Keine Änderung an First-Check-/Variant-/Timeline-Logik, Kachel 6 unverändert.

### Betroffene Dateien
- `src/pages/RunDetail.tsx` — Kachel-3-subValue angepasst, `showVerifiedIcon={false}` entfernt

## Status

In Progress
