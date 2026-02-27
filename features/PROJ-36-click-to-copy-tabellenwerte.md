# PROJ-36: Click-to-Copy fuer Run-Detail Tabellenwerte (Rev 4, KISS + Performance-Override)

**Status:** Planned
**Datum:** 2026-02-27
**Rev:** 4
**Skill:** requirements
**Strategie:** KISS / Scope reduziert / lokale Render-Isolation
**Baut auf:** PROJ-22, PROJ-31, PROJ-32, PROJ-33

---

## Ziel

Einzelwerte in definierten Tabellenzellen sollen per Klick in die lokale Zwischenablage kopiert werden, mit minimalem UI-Eingriff, ohne Konflikt mit bestehenden Interaktionen und ohne unnoetige Re-Renders ganzer Tabellen.

---

## Uebernommene Architektur-Regel (Performance-Override)

Der Copy-State wird **nicht** in `ItemsTable` oder `InvoicePreview` gehalten.

Stattdessen wird eine kleine, isolierte Micro-Komponente eingefuehrt:
- `src/components/ui/CopyableText.tsx`

Diese Komponente:
1. bekommt den anzuzeigenden Wert als Prop,
2. prueft Platzhalter (`--`, `Fehlt`, leer, null, undefined),
3. verwaltet nur eigenen lokalen `isCopied`-State (~1.5s),
4. setzt Feedback direkt am Text (`text-green-600`, `title="Kopiert!"`),
5. nutzt im Idle-Zustand bei gueltigem Wert: `cursor-pointer hover:underline`.

Begruendung:
- Kein globaler / Tabellenweiter Copy-State.
- Kein bewusstes SetState in den Tabellen-Containern pro Klick.
- Copy-Feedback bleibt pro Zelle lokal und leichtgewichtig.

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

## UI-Regeln (KISS)

1. Keine Zusatz-Icons neben dem Text.
2. Keine globalen Toaster.
3. Keine Layout-Aenderung durch Feedback.
4. Platzhalter sind nicht interaktiv und erhalten keinen Hover-Effekt.

Visuelles Verhalten pro CopyableText:
- **Idle + gueltiger Wert:** `cursor-pointer hover:underline`
- **Copied (~1.5s):** `text-green-600` und `title="Kopiert!"`
- **Platzhalter:** neutrales Styling, kein Click-Handler

---

## Technischer Plan

## Phase 1: Micro-Komponente definieren (Planebene)

Komponente `CopyableText` mit schlanker API, z. B.:
- `value: string | null | undefined`
- optional `className`
- optional `placeholderValues?: string[]`

Interne Logik:
- `isCopyableValue(value)`
- `navigator.clipboard.writeText(value)` nur bei gueltigem Wert
- lokaler Timer-Reset fuer `isCopied`

## Phase 2: Einbau in RE-Positionen

In `InvoicePreview.tsx` werden die 4 Zielwerte im Zelleninhalt durch `CopyableText` ersetzt.

Hinweis BESTELLUNG:
- RE-BESTELLUNG darf Mehrfachstring (`A|B|C`) als Ganzes kopieren.

## Phase 3: Einbau in Artikelliste (ohne BESTELLUNG)

In `ItemsTable.tsx` werden genau diese Zielwerte auf `CopyableText` umgestellt:
- ARTIKEL
- BESTELLNUMMER
- EAN
- SN / SERIAL (nur wenn vorhanden)

BESTELLUNG-Zelle bleibt unveraendert.

## Phase 4: Platzhalter-Guards vereinheitlichen

Als nicht copybar behandeln:
- `null`, `undefined`, leerer String
- `--`
- `Fehlt`

Optional im Plan als robuste Regel:
- Vergleich getrimmt und case-insensitive.

## Phase 5: Verifikation / Regression

1. Keine Aenderung am Verhalten von `ManualOrderPopup`.
2. Keine Aenderung an PROJ-32 Pill-Styles und Pill-Interaktion.
3. Copy funktioniert in allen 8 Ziel-Locations.
4. Platzhalter sind nirgends klickbar.
5. Feedback bleibt lokal ohne sichtbaren Layout-Shift.
6. Keine globale Toast-Ausgabe pro Copy.

---

## Kritische Pruefung deiner Vorgabe (Bewertung)

## Was sinnvoll ist und uebernommen wurde

- Die Micro-Komponente ist eine gute Kapselung fuer KISS + Wiederverwendung.
- Lokaler Zellen-State reduziert die Gefahr, unnoetig Parent-State zu triggern.
- Kein Icon-Add-on passt zum engen Tabellenlayout.
- Platzhalter-Filter als zentrale Regel verhindert Fehlkopien.

## Stolperfallen / Hinweise

1. **Re-Render-Erwartung realistisch einordnen**
   - Lokaler State in `CopyableText` verhindert gezielte Parent-SetStates.
   - Wenn Parent aus anderen Gruenden neu rendert (z. B. Store-Update), rendert die Zelle trotzdem mit.
   - Das ist normal und kein PROJ-36-Regressionsthema.

2. **`title`-Feedback ist browserabhaengig dezent**
   - `title="Kopiert!"` ist minimal-invasiv, aber Tooltip-Anzeigehaeufigkeit variiert je Browser.
   - Deshalb bleibt die Textfarbenaenderung (`text-green-600`) das primaere sichtbare Feedback.

3. **Clipboard-API-Randfall**
   - In restriktiven Kontexten kann `writeText` fehlschlagen.
   - Komponente sollte Fehler intern abfangen und still bleiben (kein globaler Toast).

---

## Akzeptanzkriterien (Rev 4)

1. Es existiert ein einziger PROJ-36-Plan mit Rev-4-Inhalt (diese Datei).
2. Copy-Interaktion laeuft ueber `CopyableText` (Micro-Komponente), nicht ueber Tabellen-Globalstate.
3. Genau 8 Ziel-Locations sind im Scope.
4. Artikelliste > BESTELLUNG bleibt unangetastet.
5. Keine zusaetzlichen Copy-Icons in Tabellenzellen.
6. Platzhalter sind nicht klickbar und nicht unterstrichen.
7. Bei erfolgreichem Copy: temporaer `text-green-600` + `title="Kopiert!"`.
8. Keine globalen Toaster.

---

## Nicht im Scope

- Keine Aenderung an `ManualOrderPopup.tsx`.
- Keine Aenderung an `getOrderReasonStyle` / PROJ-32 Pill-Logik.
- Keine Aenderung an Parsing, Matching, Workflow-Stepper oder Persistenz.

---

## Umsetzungsstatus

Plan ist final aktualisiert (Rev 4). **Keine Implementierung gestartet.**

