# PROJ-26 - Kachel-Anpassung-Codex

## Beschreibung

Dieses Projekt enthaelt die Anpassungen an den KPI-Kacheln auf der Run-Detail-Seite sowie die technische Analyse der Pruef- und Counterlogik fuer die Kacheln aus Step 1 bis Step 4.

## Umgesetzte Aenderungen

- [x] Kachel-Label in Run-Detail geaendert:
  - [x] `Bestellungen mappen` -> `Beleg zugeteilt`
- [x] Dynamische Export-Kachel (Start/Retry/Export) fuer Pause-Zustand angepasst:
  - [x] Kein zusaetzlicher Hinweis mehr in neuer Zeile (kein Layout-Shift)
  - [x] Bei `isPaused === true`:
    - [x] Kachel-Hintergrund: `#FD7C6E` (wie aktiver Pause-Button)
    - [x] Text/Icon: weiss
    - [x] Nur Inhalt `Pause-Icon + pausiert`
    - [x] Schriftgroesse wie bisher bei `Start` (`text-base`)
  - [x] Kachel bei Pause als nicht klickbar dargestellt (`cursor-not-allowed`)
  - [x] Click-Handler mit Pause-Guard (`if (isPaused) return`)
- [x] PDF-Rechnungssumme (Footer `invoiceTotal`) wieder in den App-Flow verlinkt:
  - [x] `InvoiceHeader` um `invoiceTotal?: number | null` erweitert
  - [x] Mapping `convertToInvoiceHeader()` uebernimmt `parsedResult.header.invoiceTotal`
  - [x] `runStore.updateRunWithParsedData()` speichert `invoiceTotal` in `run.invoice`
  - [x] Anzeige in UI:
    - [x] `OverviewPanel`: Feld `Rechnungssumme`
    - [x] `InvoicePreview`: Summary-Footer ergaenzt um `Rechnungssumme`

## Analyse-Ergebnis (Kurzfassung)

- Parser extrahiert die Rechnungssumme weiterhin korrekt in `ParsedInvoiceHeader.invoiceTotal`.
- Ursache fuer fehlende Anzeige war die fehlende Weitergabe ins Domain-Modell `InvoiceHeader` und damit in `run.invoice`.
- Die Kachel-Counter/Nenner-Logik ist aktuell funktional, hat aber unterschiedliche Nennerquellen je Schritt (siehe separate Doku unter `features/Kachel-Rules/Kachel-Rules.md`).

## Betroffene Dateien

- `src/pages/RunDetail.tsx`
- `src/types/index.ts`
- `src/services/invoiceParserService.ts`
- `src/store/runStore.ts`
- `src/components/run-detail/OverviewPanel.tsx`
- `src/components/run-detail/InvoicePreview.tsx`
- `features/Kachel-Rules/Kachel-Rules.md`

## Offene Punkte / Erweiterungen

- Optional: Wenn gewuenscht, kann Step-4-Nenner explizit auf `matchedOrders + notOrderedCount` gestellt werden, um die Schrittlogik semantisch noch klarer vom Expansionstiming zu entkoppeln.
- Optional: Zentrale Rule-Definition fuer alle Kacheln in einer dedizierten Konfigdatei (statt direkter Inline-Berechnung in `RunDetail.tsx`).

---

## Phase 2 Plan: Kachel 6 3-Zeilen-Layout (Start/Retry/Export)

- Ziel: Nur visuelle Anpassung der dynamischen Kachel, ohne Eingriff in Hintergrundlogik.
- Umsetzung:
  - Oberer Bereich (Zeile 1+2): `Icon + Label` in einer horizontalen Reihe.
  - Unterer Bereich (Zeile 3): dynamischer Zusatztext.
  - Start/Retry: Zeile 3 zeigt `nextStep.name` (falls vorhanden).
  - Export: Zeile 3 zeigt offenen Fehlerstatus:
    - `{totalIssues} Issues offen` bei `totalIssues > 0`
    - `Keine offenen Issues` bei `totalIssues === 0`
- Ausrichtung:
  - Icon-Groesse bleibt `w-[42px] h-[42px]`.
  - Label bleibt `text-base font-semibold`, mit `leading-none` und leichtem visuellen Offset (`translate-y-[1px]`) fuer die gewuenschte optische Mitte.
- Safety:
  - `onClick`-Flow, `if (isPaused) return`, `setActiveTab('export')`, `retryStep(...)`, `advanceToNextStep(...)` bleiben unveraendert.

## Phase 3 Plan: Stepper-Hoehenreduktion (80%, Min-Height, Auto-Growth aktiv)

- Ziel: Timeline/Stepper visuell kompakter, ohne Clipping bei Issues.
- Umsetzung:
  - Neue dedizierte Klasse `workflow-stepper-card`.
  - `min-height` reduziert die Basishoehe auf das 80%-Zielbild.
  - `height: auto` bleibt aktiv, damit bei zusaetzlichen Issue-Zeilen Wachstum moeglich bleibt.
  - Leichte Padding-Reduktion am Stepper-Container fuer konsistente Hoehenwirkung.
- Safety:
  - Keine Aenderung an `steps.map(...)`, Statusfarben, Issue-Rendering, Props oder Workflowdaten.

## Zusatz-Checkliste (UI-only)

- [x] Kachel-6-Layout nur optisch refactored (keine Logikpfad-Aenderung)
- [x] Export-Zustand mit 3.-Zeilen-Hinweis auf offene Issues
- [x] Stepper min-height reduziert, auto-grow aktiv gelassen
- [x] Doku Kachel 1-5 um 3.-Zeilen-Beschreibung erweitert
