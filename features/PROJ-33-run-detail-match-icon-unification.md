# PROJ-33: Run-Detail Match-Icon Unification + Pending Hourglass

**Status:** Done  
**Datum:** 2026-02-26  
**Baut auf:** PROJ-11, PROJ-18, PROJ-31, PROJ-32

---

## Ziel

`-MATCH` in **Artikelliste** und **RE-Positionen** auf dieselbe fachliche Quelle und dieselbe Icon-Sprache bringen:

- Quelle: `matchStatus` (Step 2)
- Einheitliche Icons je Status
- `pending` mit animierter Sanduhr

Zusatz: `pending` in **PREIS / CHECK** (Artikelliste) visuell angleichen, aber weiterhin fachlich getrennte Logik (`priceCheckStatus`).

---

## Umgesetzt

### 1) RE-Positionen `-MATCH` auf `matchStatus` umgestellt

- Vorher: Anzeige lief ueber `orderStatus`-Badge (`YES/NO/check`)
- Nachher: Anzeige nutzt `StatusCheckbox` mit `matchStatus`
- Fallback: `pending`, falls `representativeLine` nicht vorhanden

Datei:
- `src/components/run-detail/InvoicePreview.tsx`

### 2) Einheitliche `-MATCH`-Icon-Regeln

`StatusCheckbox` nutzt jetzt:

- `full-match` -> gruener `CheckCircle2` (unveraendert)
- `code-it-only` -> lokales Asset `Code_IT.ico`
- `ean-only` -> lokales Asset `EAN.ico`
- `pending` -> animierte Sanduhr (U+231B + U+23F3)
- `no-match` -> rotes X (`U+274C`)

Dateien:
- `src/components/run-detail/StatusCheckbox.tsx`
- `src/assets/icons/Code_IT.ico`
- `src/assets/icons/EAN.ico`

### 3) Wiederverwendbare Pending-Sanduhr eingefuehrt

Neue Komponente:
- `src/components/run-detail/PendingHourglassIcon.tsx`

Render:
- Basis: `U+231B` (hourglass)
- Overlay: `U+23F3` (hourglass flowing sand), absolut darueber
- Animation: Opacity-Puls (0 -> 100 -> 0)

### 4) CSS-Animation ergaenzt

In `src/index.css`:
- `@keyframes pending-hourglass-pulse`
- Utility-Klasse `.pending-hourglass-overlay`

### 5) PREIS / CHECK (Artikelliste): pending angepasst

- `pending` rendert jetzt dieselbe `PendingHourglassIcon`
- Bestehende Logik fuer `ok`, `mismatch`, `missing`, `custom` bleibt erhalten
- Popover-/Button-Mechanik unveraendert

Datei:
- `src/components/run-detail/PriceCell.tsx`

### 6) Nachjustierung der Pending-Hintergruende

Zur besseren Erkennbarkeit auf hellem Hintergrund:
- Kreis-/Badge-Hintergrund fuer pending final auf `#968C8C`
- Puls-Effekt unveraendert

Dateien:
- `src/components/run-detail/PendingHourglassIcon.tsx`
- `src/components/run-detail/PriceCell.tsx`

---

## Nicht geaendert

- Keine Aenderung an Backend/Store/API
- Keine Aenderung an `types/index.ts`
- `PREIS / CHECK` bleibt fachlich getrennt von `-MATCH`

---

## Verifikation

- Build erfolgreich: `npm run build`
- Icons/Animation in Run-Detail kompiliert ohne TS- oder Import-Fehler

---

## Betroffene Dateien (gesamt)

- `src/components/run-detail/InvoicePreview.tsx`
- `src/components/run-detail/StatusCheckbox.tsx`
- `src/components/run-detail/PriceCell.tsx`
- `src/components/run-detail/PendingHourglassIcon.tsx` (neu)
- `src/index.css`
- `src/assets/icons/Code_IT.ico`
- `src/assets/icons/EAN.ico`

