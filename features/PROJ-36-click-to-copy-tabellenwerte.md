# PROJ-36: Click-to-Copy fuer Run-Detail Tabellenwerte (Rev 3, KISS)

**Status:** Planned
**Datum:** 2026-02-27
**Rev:** 3
**Strategie:** KISS / Scope reduziert
**Baut auf:** PROJ-22, PROJ-31, PROJ-32, PROJ-33

---

## Ziel

Einzelwerte in definierten Tabellenzellen sollen per Klick in die lokale Zwischenablage kopiert werden, mit minimalem UI-Eingriff und ohne Risiko fuer bestehende Interaktionen.

---

## Gepruefte und uebernommene KISS-Aenderungen

1. **Scope reduziert auf 8 Ziel-Locations**
   - `Run-Detail > Artikelliste > BESTELLUNG` ist komplett aus PROJ-36 entfernt.
   - `ManualOrderPopup.tsx` bleibt unberuehrt.
   - Die BESTELLUNG-Zelle der Artikelliste in `ItemsTable.tsx` bleibt unberuehrt.

2. **Keine Zusatz-Icons**
   - Keine Copy-Icons in Tabellenzellen.
   - Keine zusaetzlichen visuellen Elemente, die Spaltenbreiten beeinflussen.

3. **KISS-Feedback ohne Layout-Shift**
   - Zentraler `useCopyToClipboard`-Hook.
   - Lokales, leichtes Feedback pro Wert (z. B. temporaere Textfarbe `text-green-600` fuer ~1.5s oder kleiner Tooltip "Kopiert!").
   - Keine globalen Toaster.

4. **Platzhalter sind ausgeschlossen**
   - `--`, `Fehlt`, leere Strings, `null`/`undefined` sind nicht klickbar.
   - Kein `hover:underline`, kein `cursor-pointer`, kein Copy-Handler fuer solche Werte.

---

## Finaler Scope (8 Ziel-Locations)

## A) RE-Positionen (`InvoicePreview.tsx`)

1. ARTIKEL
2. BESTELLNUMMER
3. EAN
4. BESTELLUNG

## B) Artikelliste (`ItemsTable.tsx`)

5. ARTIKEL
6. BESTELLNUMMER
7. EAN
8. SN / SERIAL (nur Seriennummer, wenn vorhanden)

**Explizit NICHT im Scope:**
- Artikelliste > BESTELLUNG
- `ManualOrderPopup.tsx`
- PROJ-32 Pill-Interaktion / Pill-DOM

---

## UI-Strategie (KISS)

- Nur Text selbst wird interaktiv gemacht.
- Interaktivitaet ausschliesslich ueber:
  - `cursor-pointer`
  - `hover:underline`
  - optional `focus-visible:underline` fuer Tastatur
- Keine zusaetzlichen Icons, Badges oder Inline-Elemente.

---

## Technischer Plan

## Phase 1: Hook (zentral)

- Einfuehrung `useCopyToClipboard`:
  - `copy(text: string, key: string)`
  - kurzer local state pro key: `idle | success | error`
  - auto-reset nach ca. 1500 ms

## Phase 2: RE-Positionen anbinden

- In `InvoicePreview.tsx` die 4 Zielzellen mit Copy-Handler versehen.
- Nur wenn Wert fachlich gueltig (kein Platzhalter).
- Hover-Unterstreichung nur fuer gueltige Werte.

## Phase 3: Artikelliste anbinden (ohne BESTELLUNG)

- In `ItemsTable.tsx` Copy fuer:
  - ARTIKEL
  - BESTELLNUMMER
  - EAN
  - SN / SERIAL (nur bei vorhandener `serialNumber`)
- BESTELLUNG-Zelle bleibt exakt wie heute.

## Phase 4: Feedback ohne Layout-Aenderung

- Nach erfolgreichem Copy fuer ~1.5s:
  - dezente Textfarbenaenderung (z. B. `text-green-600`), oder
  - kurzer, einfacher Tooltip "Kopiert!"
- Kein Element hinzufuegen/entfernen, das Breite/Hoehe verschiebt.

## Phase 5: Guards und Regression

- Platzhalter-Guard strikt in allen 8 Zielfeldern.
- Regression-Check:
  - `ManualOrderPopup` unveraendert
  - PROJ-32 Pill-Darstellung unveraendert
  - kein Eingriff in Workflow-/Matching-/Parser-Logik

---

## Akzeptanzkriterien (Rev 3)

1. Genau 8 Ziel-Locations sind copy-faehig.
2. Artikelliste > BESTELLUNG ist nicht angefasst.
3. Keine neuen Copy-Icons in Tabellenzellen.
4. Nur gueltige Werte zeigen `cursor-pointer` + `hover:underline`.
5. Platzhalter (`--`, `Fehlt`, leer) sind nicht klickbar.
6. Feedback ist lokal und verursacht keinen Layout-Shift.
7. Keine globalen Toaster.

---

## Nicht im Scope

- Keine Aenderung an `ManualOrderPopup.tsx`.
- Keine Aenderung an BESTELLUNG-Pill-Verhalten in Artikelliste.
- Keine Aenderung an PROJ-32 Styles oder `getOrderReasonStyle`.
- Keine Aenderung an Parsing, Matching, Step-Engine, Persistenzlogik.

---

## Fazit

Die vier KISS-Vorgaben sind technisch sinnvoll, risikoarm und vollstaendig in Rev 3 uebernommen.


