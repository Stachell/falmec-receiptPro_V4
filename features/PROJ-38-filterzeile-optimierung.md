# PROJ-38: Optimierung, Anpassung und Verlinkung der Filterzeile + Filterzeile RE-Positionen (Rev 4)

**Status:** Done
**Datum:** 2026-02-28
**Rev:** 4
**Skill:** requirements
**Baut auf:** PROJ-22, PROJ-20, PROJ-31, PROJ-36

---

### Rev-Historie

| Rev | Datum | Aenderungen |
|-----|-------|-------------|
| 0 | 2026-02-28 | Initialer Plan — Aufgabe 1 (Filter-Aktualisierung) + Aufgabe 2 (RE-Positionen Filter) + Stolpersteine |
| 1 | 2026-02-28 | 3 kritische Korrekturen: (1) S1-Logikfehler behoben. (2) DRY-Architektur `src/lib/filterConfig.ts`. (3) S8 Layout-Fix `flex-wrap` + `gap-4`. |
| 3 | 2026-02-28 | Architektur-Neuausrichtung RE-Positionen: Massgeschneiderter 4-Punkte "Action-Filter". Shared-Datei mit ZWEI Konfigurationen + ZWEI Pruef-Funktionen. Hybrid-Logik fuer PDF + enriched Daten. |
| 4 | 2026-02-28 | **3 Code-Leitplanken:** (1) Explizites UI-Alignment — exakte Tailwind-Klassen fuer 1:1 optischen Klon. (2) `<SelectGroup>` statt `<Fragment>` fuer Artikelliste-Gruppen. (3) Null-Safety via Optional Chaining in allen Such-/Filterausdruecken. **Neue Stolperfalle S9:** Body-Abschluss-Schutz — collapsedHeight-Berechnung darf nicht brechen. |

---

## Kontext

Die Filterzeile im Tab "Artikelliste" (`ItemsTable.tsx`) wurde frueh im Projekt erstellt und seitdem nicht aktualisiert. Inzwischen sind neue Datenfelder und Spalten hinzugekommen (Seriennummer-Status, Preis-OK, Bestellungs-Perfektmatch, inaktive Artikel, Preis-Custom). Zudem sind die Filterlabels generisch benannt ("Match", "Preisabweichung") und bieten keinen klaren Bezug zu den jeweiligen Tabellenspalten/-Checkboxen. Der Tab "RE-Positionen" (`InvoicePreview.tsx`) verfuegt aktuell nur ueber eine Suchleiste, aber kein Filter-Dropdown.

**Business-Kontext (Rev 3):** Die RE-Positionen sind der zentrale Ort fuer "Bulk-Korrekturen" bevor Step 4 laeuft (Preis-Overrides, Match-Pruefung). Der Filter dort muss daher **nicht granular**, sondern **aufgabenorientiert** sein: "Was muss ich noch korrigieren?" statt "Zeige mir alle Zeilen mit Status X". Deshalb erhaelt die RE-Positionen-Tabelle einen eigenen, abgespeckten **Action-Filter** mit 4 aufgabenbezogenen Optionen.

---

## Code-Leitplanken [NEU in Rev 4]

Die folgenden 3 Leitplanken sind **zwingende Vorgaben** fuer die Code-Umsetzung und muessen in jeder betroffenen Datei eingehalten werden.

### L1: Explizites UI-Alignment — 1:1 optischer Klon [NEU in Rev 4]

Das Design (Groesse, Hoehe, Position, Abstaende) der Suchleiste und des Filter-Dropdowns in `InvoicePreview.tsx` (RE-Positionen) **MUSS** ein exakter optischer Klon der `ItemsTable.tsx` (Artikelliste) sein. Dies garantiert ein fluessiges Gesamt-Design beim Tab-Wechsel.

#### Referenz-Klassen aus ItemsTable.tsx (Vorbild)

**Quelle:** `src/components/run-detail/ItemsTable.tsx` Zeile 140-167

```
CardHeader:     "flex flex-row flex-wrap items-center gap-4 pb-2"
Suchleiste-Div: "relative flex-1 max-w-sm"
Search-Icon:    "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
Input:          "pl-10 bg-surface-elevated"          ← KEINE h-8, KEINE text-sm
                                                       (erbt h-10 aus shadcn SelectTrigger-Default)
Filter-Div:     "flex items-center gap-2"
Filter-Icon:    "w-4 h-4 text-muted-foreground"      (lucide <Filter />)
SelectTrigger:  "w-[240px] bg-surface-elevated"       ← erbt h-10 aus shadcn-Default (select.tsx Z.20)
SelectContent:  "bg-popover"
```

#### Ziel-Klassen fuer InvoicePreview.tsx (1:1 Klon)

**IST (aktuell InvoicePreview.tsx Zeile 212-221):**
```html
<CardHeader className="flex flex-row items-center gap-4 pb-2">          ← fehlt flex-wrap
  <div className="relative flex-1 max-w-xs">                            ← max-w-xs statt max-w-sm
    <Input className="pl-10 h-8 text-sm bg-surface-elevated" />          ← h-8 + text-sm falsch
  </div>
  <!-- kein Filter-Dropdown -->
</CardHeader>
```

**SOLL (nach PROJ-38):**
```html
<CardHeader className="flex flex-row flex-wrap items-center gap-4 pb-2">  ← flex-wrap ergaenzt
  <div className="relative flex-1 max-w-sm">                              ← max-w-sm (wie ItemsTable)
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
    <Input
      placeholder="Pos., EAN, Artikelnr. suchen..."
      className="pl-10 bg-surface-elevated"                                ← h-8 + text-sm ENTFERNT
    />
  </div>
  <div className="flex items-center gap-2">                                ← NEU: Filter-Container
    <Filter className="w-4 h-4 text-muted-foreground" />
    <Select value={statusFilter} onValueChange={setStatusFilter}>
      <SelectTrigger className="w-[240px] bg-surface-elevated">            ← h-10 erbt aus shadcn
        <SelectValue placeholder="Filter" />
      </SelectTrigger>
      <SelectContent className="bg-popover">
        ...
      </SelectContent>
    </Select>
  </div>
  <div className="ml-auto flex items-stretch">                             ← Titel bleibt rechts
    ...
  </div>
</CardHeader>
```

#### Hoehen-Zusammenfassung

| Element | shadcn-Default | ItemsTable (IST) | InvoicePreview (IST) | InvoicePreview (SOLL) |
|---------|---------------|-------------------|---------------------|----------------------|
| Input (Suchleiste) | `h-10` (aus shadcn) | `h-10` (kein Override) | `h-8` (Override) | **`h-10` (Override entfernen)** |
| SelectTrigger | `h-10` (select.tsx Z.20) | `h-10` (kein Override) | nicht vorhanden | **`h-10` (erbt automatisch)** |

**Regel:** Weder in ItemsTable noch in InvoicePreview darf `h-8` oder `h-10` explizit auf Input oder SelectTrigger gesetzt werden. Beide erben die Hoehe aus den shadcn-Defaults. Das garantiert automatische Konsistenz.

### L2: `<SelectGroup>` statt `<Fragment>` fuer Artikelliste-Gruppen [NEU in Rev 4]

Im gruppierten Dropdown der Artikelliste (`ItemsTable.tsx`) muss **`<SelectGroup>`** (aus `@/components/ui/select`) als Wrapper um jede Filtergruppe verwendet werden — NICHT `<Fragment>`.

**Begruendung:** `SelectGroup` ist das semantisch korrekte Radix-Primitive. Es stellt sicher, dass:
- `<SelectLabel>` korrekt als Gruppen-Header gerendert wird (visuell eingerueckt, nicht anklickbar)
- Screenreader die Gruppenstruktur erkennen (ARIA `role="group"`)
- Radix-interne Focus-Navigation innerhalb der Gruppe funktioniert

**Bereits exportiert:** `SelectGroup` ist in `src/components/ui/select.tsx` (Zeile 9 + 134) bereits definiert und exportiert. Kein Code-Aenderung an `select.tsx` noetig.

**Korrigiertes Dropdown-Rendering (Artikelliste):**

```tsx
import {
  Select, SelectContent, SelectItem, SelectGroup,
  SelectLabel, SelectSeparator, SelectTrigger, SelectValue,
} from '@/components/ui/select';

<SelectContent className="bg-popover">
  <SelectItem value={FILTER_ALL.value}>{FILTER_ALL.label}</SelectItem>
  {ITEMS_FILTER_GROUPS.map((group) => (
    <SelectGroup key={group.groupLabel}>
      <SelectSeparator />
      <SelectLabel>{group.groupLabel}</SelectLabel>
      {group.options.map((opt) => (
        <SelectItem key={opt.value} value={opt.value}>
          {opt.label}
        </SelectItem>
      ))}
    </SelectGroup>
  ))}
</SelectContent>
```

**Hinweis:** `InvoicePreview.tsx` verwendet eine flache Liste ohne Gruppen → `SelectGroup` wird dort NICHT benoetigt.

### L3: Null-Safety via Optional Chaining [NEU in Rev 4]

**Alle** String-Zugriffe in Such- und Filterlogik muessen Optional Chaining (`?.`) verwenden. Felder wie `manufacturerArticleNo`, `ean`, `descriptionIT` koennen theoretisch `null` oder `undefined` sein, wenn die DB-Daten unvollstaendig sind. Ein fehlendes `?.` fuehrt zu einem Runtime-Crash (`Cannot read properties of null`).

**Betroffene Stellen:**

#### ItemsTable.tsx — Suchlogik (Zeile 76-82, aktuell UNSICHER):

```typescript
// IST (UNSICHER — crasht bei null):
line.manufacturerArticleNo.toLowerCase().includes(term)
line.ean.includes(searchTerm)
line.descriptionIT.toLowerCase().includes(term)

// SOLL (SICHER — mit Optional Chaining):
line.manufacturerArticleNo?.toLowerCase().includes(term) ||
line.ean?.toLowerCase().includes(term) ||
line.descriptionIT?.toLowerCase().includes(term) ||
line.falmecArticleNo?.toLowerCase().includes(term) ||
line.descriptionDE?.toLowerCase().includes(term)
```

**Achtung:** `line.ean.includes(searchTerm)` im IST-Zustand verwendet KEIN `.toLowerCase()` — das ist ein bestehender Bug (case-sensitive EAN-Suche). Bei der Korrektur auf `?.toLowerCase().includes(term)` umstellen (konsistent mit den anderen Feldern).

#### InvoicePreview.tsx — Suchlogik (Zeile 129-137, bereits SICHER):

Die bestehende Suchlogik in InvoicePreview verwendet bereits `?.` — hier kein Handlungsbedarf:
```typescript
pos.ean?.toLowerCase().includes(term)                    // OK
pos.manufacturerArticleNo?.toLowerCase().includes(term)  // OK
pos.orderCandidatesText?.toLowerCase().includes(term)    // OK
```

#### filterConfig.ts — matchesInvoiceActionFilter:

Im `action-conflict`-Case:
```typescript
// SOLL (SICHER):
if (!pos.ean?.trim()) return true;  // EAN fehlt oder leer
```

---

## Aufgabe 1: Aktualisierung der Filterpunkte (Artikelliste)

### Location
`Run-Detail > Artikelliste > Body Ueberschrift > Dropdown "Filter"`
**Datei:** `src/components/run-detail/ItemsTable.tsx` (Zeilen 150-166)

### 1.1 IST-Zustand — Aktuelle Filter

| # | value | Label (aktuell) | Logik |
|---|-------|-----------------|-------|
| 1 | `all` | Alle anzeigen | Kein Filter |
| 2 | `full-match` | Match | `matchStatus === 'full-match'` |
| 3 | `partial-match` | Teilmatch | `matchStatus === 'code-it-only' \|\| 'ean-only'` |
| 4 | `no-match` | Kein Match | `matchStatus === 'no-match'` |
| 5 | `pending` | Ausstehend | `matchStatus === 'pending'` |
| 6 | `price-mismatch` | Preisabweichung | `priceCheckStatus === 'mismatch'` |
| 7 | `price-missing` | Preis fehlt | `priceCheckStatus === 'missing'` |
| 8 | `not-ordered` | Nicht bestellt | `!orderNumberAssigned` |

### 1.2 SOLL-Zustand — Aktualisierte & erweiterte Filter

Die Filterpunkte werden in **5 logische Gruppen** gegliedert. Jede Gruppe wird mit `<SelectGroup>` gewrappt (L2), erhaelt einen `<SelectLabel>` und wird durch `<SelectSeparator />` visuell getrennt.

#### Gruppe 1: ALLGEMEIN
| # | value | Label (NEU) | Logik | Aenderung |
|---|-------|-------------|-------|-----------|
| 0 | `all` | Alle anzeigen | Kein Filter | unveraendert |

#### Gruppe 2: ARTIKEL (Spalte "- MATCH")
| # | value | Label (NEU) | Logik | Aenderung |
|---|-------|-------------|-------|-----------|
| 1 | `full-match` | ARTIKEL: Match | `matchStatus === 'full-match'` | **Umbenennung** |
| 2 | `partial-match` | ARTIKEL: Teilmatch | `matchStatus === 'code-it-only' \|\| 'ean-only'` | **Umbenennung** |
| 3 | `no-match` | ARTIKEL: Kein Match | `matchStatus === 'no-match'` | **Umbenennung** |
| 4 | `pending` | ARTIKEL: Ausstehend | `matchStatus === 'pending'` | **Umbenennung** |
| 5 | `inactive` | ARTIKEL: Inaktiv | `activeFlag === false` | **NEU** |

#### Gruppe 3: PREIS (Spalte "PREIS / CHECK")
| # | value | Label (NEU) | Logik | Aenderung |
|---|-------|-------------|-------|-----------|
| 6 | `price-ok` | PREIS: OK | `priceCheckStatus === 'ok'` | **NEU** |
| 7 | `price-mismatch` | PREIS: Abweichung | `priceCheckStatus === 'mismatch'` | **Umbenennung** |
| 8 | `price-missing` | PREIS: Fehlt | `priceCheckStatus === 'missing'` | **Umbenennung** |
| 9 | `price-custom` | PREIS: Angepasst | `priceCheckStatus === 'custom'` | **NEU** |

#### Gruppe 4: SERIAL (Spalte "SN / SERIAL")
| # | value | Label (NEU) | Logik | Aenderung |
|---|-------|-------------|-------|-----------|
| 10 | `sn-assigned` | SERIAL: Zugewiesen | `serialRequired && serialNumbers.length > 0` | **NEU** |
| 11 | `sn-missing` | SERIAL: Ausstehend | `serialRequired && serialNumbers.length === 0` | **NEU** |
| 12 | `sn-not-required` | SERIAL: Nicht erforderlich | `!serialRequired` | **NEU** |

#### Gruppe 5: BESTELLUNG (Spalte "BESTELLUNG")
| # | value | Label (NEU) | Logik | Aenderung |
|---|-------|-------------|-------|-----------|
| 13 | `not-ordered` | BESTELLUNG: Nicht bestellt | `!orderNumberAssigned` | **Umbenennung** |
| 14 | `order-assigned` | BESTELLUNG: Zugewiesen | `orderNumberAssigned !== null` | **NEU** |
| 15 | `order-perfect` | BESTELLUNG: Perfekt-Match | `orderAssignmentReason === 'perfect-match'` | **NEU** |
| 16 | `order-manual` | BESTELLUNG: Manuell | `orderAssignmentReason === 'manual' \|\| 'manual-ok'` | **NEU** |

### 1.3 Visuelle Gliederung im Dropdown (Artikelliste)

```
+------------------------------+
|  Alle anzeigen               |
| ─────────────────────────── |  <- SelectSeparator
|  ARTIKEL                     |  <- SelectLabel (in SelectGroup)
|    ARTIKEL: Match            |
|    ARTIKEL: Teilmatch        |
|    ARTIKEL: Kein Match       |
|    ARTIKEL: Ausstehend       |
|    ARTIKEL: Inaktiv          |
| ─────────────────────────── |
|  PREIS                       |  <- SelectLabel (in SelectGroup)
|    PREIS: OK                 |
|    PREIS: Abweichung         |
|    PREIS: Fehlt              |
|    PREIS: Angepasst          |
| ─────────────────────────── |
|  SERIAL                      |  <- SelectLabel (in SelectGroup)
|    SERIAL: Zugewiesen        |
|    SERIAL: Ausstehend        |
|    SERIAL: Nicht erforderlich|
| ─────────────────────────── |
|  BESTELLUNG                  |  <- SelectLabel (in SelectGroup)
|    BESTELLUNG: Nicht bestellt|
|    BESTELLUNG: Zugewiesen    |
|    BESTELLUNG: Perfekt-Match |
|    BESTELLUNG: Manuell       |
+------------------------------+
```

### 1.4 UI-Aenderungen (Select-Dropdown Artikelliste)

- `SelectTrigger` Breite erhoehen: `w-[180px]` -> `w-[240px]`
- Gruppen-Wrapper: `<SelectGroup>` statt `<Fragment>` (L2)
- Gruppenheader: `<SelectLabel>` innerhalb `<SelectGroup>`
- Separatoren: `<SelectSeparator />` zwischen den Gruppen
- Imports ergaenzen: `SelectGroup`, `SelectSeparator`, `SelectLabel` aus `@/components/ui/select`

---

## Aufgabe 2: Action-Filter fuer RE-Positionen

### Location
`Run-Detail > RE-Positionen > Body Ueberschrift`
**Datei:** `src/components/run-detail/InvoicePreview.tsx` (Zeilen 212-244)

### 2.1 IST-Zustand Header RE-Positionen

```
+------------------------------------------------------------------+
| [Suchleiste (max-w-xs)]    [ml-auto]  Rechnungspositionen  [v/^] |
|                                       /invoicelines (XX)         |
+------------------------------------------------------------------+
```

- Suchleiste: `relative flex-1 max-w-xs`, Input `h-8 text-sm`
- Kein Filter-Dropdown vorhanden
- Titel rechtsbuendig mit `ml-auto`

### 2.2 SOLL-Zustand Header RE-Positionen

```
+----------------------------------------------------------------------------+
| [Suchleiste (max-w-sm)] [Filter-Icon] [Dropdown (w-[240px])]  [ml-auto]   |
|                                                   Rechnungspositionen [v/^]|
|                                                   /invoicelines (XX)       |
+----------------------------------------------------------------------------+
```

### 2.3 Action-Filter — Konzept

Die RE-Positionen erhalten **keinen** 1:1-Klon des 16-Punkte-Artikelliste-Filters. Stattdessen erhalten sie einen **flachen, aufgabenorientierten Action-Filter** mit 4 Optionen, der den Workflow "Was muss ich vor Step 4 noch pruefen/korrigieren?" abbildet.

**Kein Gruppen-Rendering** (keine `SelectGroup`, `SelectSeparator`, `SelectLabel`). Nur eine flache Liste aus `SelectItem`-Eintraegen.

#### Filter-Optionen RE-Positionen

| # | value | Label | Datenquelle | Logik |
|---|-------|-------|-------------|-------|
| 0 | `all` | Alle anzeigen | — | Kein Filter |
| 1 | `action-price` | Preisabweichungen | `positionStatusMap` (enriched) | `line.priceCheckStatus === 'mismatch'` |
| 2 | `action-match` | Matchstatus pruefen | `positionStatusMap` (enriched) | `line.matchStatus !== 'full-match'` |
| 3 | `action-order` | Bestellung fehlt | `pos` (rohe PDF-Daten) | `pos.orderStatus === 'NO'` |
| 4 | `action-conflict` | Konflikte | **Hybrid** (PDF + enriched) | Zusammengesetzter Check — siehe 2.4 |

#### Visuelle Gliederung im Dropdown (RE-Positionen)

```
+-------------------------+
|  Alle anzeigen          |
|  Preisabweichungen      |
|  Matchstatus pruefen    |
|  Bestellung fehlt       |
|  Konflikte              |
+-------------------------+
```

### 2.4 Filterlogik Detail — Hybrid-Pruefung

Die Action-Filter arbeiten mit einer **Zwei-Schichten-Architektur**: Sie pruefen sowohl die rohen PDF-Daten des `ParsedInvoiceLineExtended`-Objekts als auch (falls verfuegbar) die enriched Daten aus der `positionStatusMap`.

#### `action-price` — "Preisabweichungen"
- **Datenquelle:** `positionStatusMap` → `representativeLine.priceCheckStatus`
- **Logik:** `line.priceCheckStatus === 'mismatch'`
- **Vor Step 2:** `posStatus` nicht vorhanden → `return false` (kein Preis-Check erfolgt, nichts anzeigen)

#### `action-match` — "Matchstatus pruefen"
- **Datenquelle:** `positionStatusMap` → `representativeLine.matchStatus`
- **Logik:** `line.matchStatus !== 'full-match'`
- **Vor Step 2:** `posStatus` nicht vorhanden → `return true` (alle Positionen sind implizit "noch nicht gematcht" → anzeigen)

#### `action-order` — "Bestellung fehlt"
- **Datenquelle:** `pos` (rohe PDF-Daten: `ParsedInvoiceLineExtended`)
- **Logik:** `pos.orderStatus === 'NO'`
- **Kein posStatus noetig!** Funktioniert ab Step 1 (sofort nach dem Parsing).

#### `action-conflict` — "Konflikte"
- **Datenquelle:** **Hybrid** — `pos` (PDF) + `positionStatusMap` (enriched)
- **Logik (Oder-Verknuepfung):**
  1. `!pos.ean?.trim()` — EAN fehlt im PDF (rohe PDF-Daten, L3 null-safe)
  2. `line.priceCheckStatus === 'missing'` — Kein Sage-Preis vorhanden (enriched)
  3. `line.matchStatus === 'no-match'` — Kein Artikelmatch gefunden (enriched)
  4. `!line.activeFlag` — Artikel in Sage als inaktiv markiert (enriched)
- **Vor Step 2:** Nur Punkt 1 (EAN-Check, PDF-basiert) wird ausgefuehrt. Punkte 2-4 uebersprungen.

### 2.5 Formatierung — 1:1 Klon der Artikelliste (L1)

**Exakte Tailwind-Klassen-Zuordnung:**

| Element | Klasse | Herkunft |
|---------|--------|----------|
| `<CardHeader>` | `flex flex-row flex-wrap items-center gap-4 pb-2` | 1:1 aus ItemsTable Z.140 |
| Suchleiste `<div>` | `relative flex-1 max-w-sm` | 1:1 aus ItemsTable Z.141 |
| `<Search>` Icon | `absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground` | 1:1 aus ItemsTable Z.142 |
| `<Input>` | `pl-10 bg-surface-elevated` | 1:1 aus ItemsTable Z.147 (**kein** h-8, **kein** text-sm) |
| Filter `<div>` | `flex items-center gap-2` | 1:1 aus ItemsTable Z.150 |
| `<Filter>` Icon | `w-4 h-4 text-muted-foreground` | 1:1 aus ItemsTable Z.151 |
| `<SelectTrigger>` | `w-[240px] bg-surface-elevated` | erbt h-10 aus shadcn-Default |
| `<SelectContent>` | `bg-popover` | Standard |
| Titel `<div>` | `ml-auto flex items-stretch` | beibehalten aus InvoicePreview Z.222 |

### 2.6 Imports ergaenzen in InvoicePreview.tsx

```typescript
// Bestehend + NEU:
import { Filter } from 'lucide-react';  // NEU (zusaetzlich zu bestehendem lucide-Import)
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';  // NEU (KEIN SelectGroup/SelectSeparator/SelectLabel noetig)
```

---

## Aufgabe 3: Shared Filter-Modul (DRY-Architektur)

### 3.1 Neue Datei: `src/lib/filterConfig.ts`

**Exportiert:**

#### A) Typen

```typescript
export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterGroup {
  groupLabel: string;
  options: FilterOption[];
}
```

#### B) Artikelliste-Konfiguration

```typescript
/** "Alle anzeigen" — wird von BEIDEN Filtern geteilt */
export const FILTER_ALL: FilterOption = { value: 'all', label: 'Alle anzeigen' };

/** Artikelliste: Gruppierte Filter mit 16 Optionen */
export const ITEMS_FILTER_GROUPS: FilterGroup[] = [
  {
    groupLabel: 'ARTIKEL',
    options: [
      { value: 'full-match',     label: 'ARTIKEL: Match' },
      { value: 'partial-match',  label: 'ARTIKEL: Teilmatch' },
      { value: 'no-match',       label: 'ARTIKEL: Kein Match' },
      { value: 'pending',        label: 'ARTIKEL: Ausstehend' },
      { value: 'inactive',       label: 'ARTIKEL: Inaktiv' },
    ],
  },
  {
    groupLabel: 'PREIS',
    options: [
      { value: 'price-ok',       label: 'PREIS: OK' },
      { value: 'price-mismatch', label: 'PREIS: Abweichung' },
      { value: 'price-missing',  label: 'PREIS: Fehlt' },
      { value: 'price-custom',   label: 'PREIS: Angepasst' },
    ],
  },
  {
    groupLabel: 'SERIAL',
    options: [
      { value: 'sn-assigned',      label: 'SERIAL: Zugewiesen' },
      { value: 'sn-missing',       label: 'SERIAL: Ausstehend' },
      { value: 'sn-not-required',  label: 'SERIAL: Nicht erforderlich' },
    ],
  },
  {
    groupLabel: 'BESTELLUNG',
    options: [
      { value: 'not-ordered',     label: 'BESTELLUNG: Nicht bestellt' },
      { value: 'order-assigned',  label: 'BESTELLUNG: Zugewiesen' },
      { value: 'order-perfect',   label: 'BESTELLUNG: Perfekt-Match' },
      { value: 'order-manual',    label: 'BESTELLUNG: Manuell' },
    ],
  },
];
```

#### C) RE-Positionen-Konfiguration

```typescript
/** RE-Positionen: Flache Action-Filter ohne Gruppen */
export const INVOICE_ACTION_FILTERS: FilterOption[] = [
  { value: 'action-price',    label: 'Preisabweichungen' },
  { value: 'action-match',    label: 'Matchstatus pruefen' },
  { value: 'action-order',    label: 'Bestellung fehlt' },
  { value: 'action-conflict', label: 'Konflikte' },
];
```

#### D) Artikelliste Filterlogik-Funktion

```typescript
import type { InvoiceLine } from '@/types';

/**
 * Prueft ob eine InvoiceLine dem gewaehlten Artikelliste-Filter entspricht.
 * Arbeitet ausschliesslich auf enriched InvoiceLine-Daten (ab Step 2).
 */
export function matchesItemsStatusFilter(line: InvoiceLine, statusFilter: string): boolean {
  if (statusFilter === 'all') return true;

  switch (statusFilter) {
    // ARTIKEL
    case 'full-match':     return line.matchStatus === 'full-match';
    case 'partial-match':  return line.matchStatus === 'code-it-only' || line.matchStatus === 'ean-only';
    case 'no-match':       return line.matchStatus === 'no-match';
    case 'pending':        return line.matchStatus === 'pending';
    case 'inactive':       return !line.activeFlag;
    // PREIS
    case 'price-ok':       return line.priceCheckStatus === 'ok';
    case 'price-mismatch': return line.priceCheckStatus === 'mismatch';
    case 'price-missing':  return line.priceCheckStatus === 'missing';
    case 'price-custom':   return line.priceCheckStatus === 'custom';
    // SERIAL (PROJ-20: serialNumbers[] statt serialNumber)
    case 'sn-assigned':     return line.serialRequired && line.serialNumbers.length > 0;
    case 'sn-missing':      return line.serialRequired && line.serialNumbers.length === 0;
    case 'sn-not-required': return !line.serialRequired;
    // BESTELLUNG
    case 'not-ordered':    return !line.orderNumberAssigned;
    case 'order-assigned': return !!line.orderNumberAssigned;
    case 'order-perfect':  return line.orderAssignmentReason === 'perfect-match';
    case 'order-manual':   return line.orderAssignmentReason === 'manual' || line.orderAssignmentReason === 'manual-ok';
    default:               return true;
  }
}
```

#### E) RE-Positionen Action-Filterlogik-Funktion

```typescript
import type { InvoiceLine, ParsedInvoiceLineExtended } from '@/types';

/**
 * Prueft ob eine RE-Position dem gewaehlten Action-Filter entspricht.
 *
 * Hybrid-Logik: Arbeitet auf ZWEI Datenquellen:
 *   - `pos`: Rohe PDF-Parse-Daten (ParsedInvoiceLineExtended) — immer verfuegbar
 *   - `line`: Enriched Store-Daten (InvoiceLine) — erst ab Step 2 verfuegbar (optional)
 *
 * @param pos    - Step-1-Parse-Position (immer vorhanden)
 * @param line   - Enriched InvoiceLine aus positionStatusMap (null wenn Step 2 noch nicht lief)
 * @param filter - Gewaehlter Action-Filter-Wert
 * @returns true wenn die Position dem Filter entspricht
 */
export function matchesInvoiceActionFilter(
  pos: ParsedInvoiceLineExtended,
  line: InvoiceLine | null,
  filter: string,
): boolean {
  if (filter === 'all') return true;

  switch (filter) {
    case 'action-price':
      if (!line) return false;
      return line.priceCheckStatus === 'mismatch';

    case 'action-match':
      if (!line) return true;
      return line.matchStatus !== 'full-match';

    case 'action-order':
      return pos.orderStatus === 'NO';

    case 'action-conflict':
      // L3: Null-safe EAN-Check
      if (!pos.ean?.trim()) return true;
      if (!line) return false;
      return (
        line.priceCheckStatus === 'missing' ||
        line.matchStatus === 'no-match' ||
        !line.activeFlag
      );

    default:
      return true;
  }
}
```

### 3.2 Verwendung in ItemsTable.tsx

```typescript
import {
  FILTER_ALL, ITEMS_FILTER_GROUPS, matchesItemsStatusFilter
} from '@/lib/filterConfig';
import {
  Select, SelectContent, SelectItem, SelectGroup,
  SelectLabel, SelectSeparator, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// Filterlogik (Zeile 75-95 ersetzt durch, mit L3 Null-Safety):
const filteredLines = invoiceLines.filter(line => {
  const term = searchTerm.toLowerCase();
  const matchesSearch =
    line.manufacturerArticleNo?.toLowerCase().includes(term) ||
    line.ean?.toLowerCase().includes(term) ||
    line.descriptionIT?.toLowerCase().includes(term) ||
    line.falmecArticleNo?.toLowerCase().includes(term) ||
    line.descriptionDE?.toLowerCase().includes(term);

  return matchesSearch && matchesItemsStatusFilter(line, statusFilter);
});

// Dropdown-Rendering (mit SelectGroup, L2):
<Select value={statusFilter} onValueChange={setStatusFilter}>
  <SelectTrigger className="w-[240px] bg-surface-elevated">
    <SelectValue placeholder="Filter Status" />
  </SelectTrigger>
  <SelectContent className="bg-popover">
    <SelectItem value={FILTER_ALL.value}>{FILTER_ALL.label}</SelectItem>
    {ITEMS_FILTER_GROUPS.map((group) => (
      <SelectGroup key={group.groupLabel}>
        <SelectSeparator />
        <SelectLabel>{group.groupLabel}</SelectLabel>
        {group.options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectGroup>
    ))}
  </SelectContent>
</Select>
```

### 3.3 Verwendung in InvoicePreview.tsx

```typescript
import {
  FILTER_ALL, INVOICE_ACTION_FILTERS, matchesInvoiceActionFilter
} from '@/lib/filterConfig';

const [statusFilter, setStatusFilter] = useState<string>('all');

// Filterlogik (Zeile 129-138 ersetzt durch):
const filteredPositions = positions.filter(pos => {
  // L3: Suchlogik bereits null-safe (bestehend)
  const matchesSearch = !searchTerm || (
    String(pos.positionIndex).includes(searchTerm.toLowerCase()) ||
    pos.ean?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pos.manufacturerArticleNo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pos.orderCandidatesText?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (statusFilter === 'all') return matchesSearch;

  // Enriched-Daten abrufen (kann null sein vor Step 2)
  const posStatus = positionStatusMap.get(pos.positionIndex);
  const line = posStatus?.representativeLine ?? null;

  // Hybrid-Filter: pos (PDF-roh) + line (enriched, nullable)
  return matchesSearch && matchesInvoiceActionFilter(pos, line, statusFilter);
});

// Dropdown-Rendering (flach, ohne Gruppen):
<Select value={statusFilter} onValueChange={setStatusFilter}>
  <SelectTrigger className="w-[240px] bg-surface-elevated">
    <SelectValue placeholder="Filter" />
  </SelectTrigger>
  <SelectContent className="bg-popover">
    <SelectItem value={FILTER_ALL.value}>{FILTER_ALL.label}</SelectItem>
    {INVOICE_ACTION_FILTERS.map((opt) => (
      <SelectItem key={opt.value} value={opt.value}>
        {opt.label}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

---

## Zusammenfassung der Dateiaenderungen (Rev 4)

| Datei | Aenderung |
|-------|-----------|
| **`src/lib/filterConfig.ts`** | **NEU** — Typen, `FILTER_ALL`, `ITEMS_FILTER_GROUPS[]`, `INVOICE_ACTION_FILTERS[]`, `matchesItemsStatusFilter()`, `matchesInvoiceActionFilter()` |
| `src/components/run-detail/ItemsTable.tsx` | Filterlogik → `matchesItemsStatusFilter()`, Dropdown → `ITEMS_FILTER_GROUPS.map()` mit `<SelectGroup>` (L2), Suchlogik → Null-Safety `?.` (L3), Dropdown-Breite `w-[240px]`, Import `SelectGroup` + `SelectSeparator` + `SelectLabel` |
| `src/components/run-detail/InvoicePreview.tsx` | Filter-Dropdown NEU (flach, `INVOICE_ACTION_FILTERS`), CardHeader → 1:1 Klon (L1), Input `h-8 text-sm` entfernen, `max-w-xs` → `max-w-sm`, `flex-wrap` ergaenzen, `statusFilter` State, Filterlogik via `matchesInvoiceActionFilter()` |
| `src/components/ui/select.tsx` | **KEIN** Aenderungsbedarf — `SelectGroup`, `SelectLabel`, `SelectSeparator` sind bereits exportiert (Z.9, 93-99, 124-130, 132-143) |

---

## Stolpersteine

### S1: positionStatusMap-Abhaengigkeit — Differenziertes Verhalten pro Action-Filter
Das Verhalten bei fehlendem `posStatus` (vor Step 2) wird **pro Action-Filter individuell** entschieden:

| Filter | Verhalten bei `!line` | Begruendung |
|--------|----------------------|-------------|
| `action-price` | `return false` | Preis-Check benoetigt Sage-Daten |
| `action-match` | `return true` | Jede Position ist vor Step 2 "zu pruefen" |
| `action-order` | *nicht betroffen* | Nutzt nur PDF-Daten (`pos.orderStatus`) |
| `action-conflict` | Nur EAN-Check | EAN via PDF, enriched Checks uebersprungen |

### S2: serialNumber vs. serialNumbers (PROJ-20 Aggregation)
In `matchesItemsStatusFilter()` wird korrekt `line.serialNumbers.length > 0` geprueft. Action-Filter haben keinen Serial-Filter.

### S3: SelectGroup / SelectSeparator / SelectLabel Verfuegbarkeit
**Alle drei** sind bereits in `src/components/ui/select.tsx` definiert und exportiert. Kein Aenderungsbedarf an der Datei.

### S4: Dropdown-Breite und Textlaenge
Beide Dropdowns verwenden `w-[240px]`. Laengstes Label: "BESTELLUNG: Perfekt-Match" (25 Zeichen). Passt komfortabel.

### S5: Filter-State bei Tab-Wechsel
Lokal (`useState`). Beim Tab-Wechsel Reset auf Default. Bewusst KEIN Store-Lifting.

### S6: ParsedInvoiceLineExtended vs. InvoiceLine Datentypen
Durch die Hybrid-Signatur `matchesInvoiceActionFilter(pos, line | null, filter)` architektonisch geloest.

### S7: orderStatus-Feld als Bestellungs-Indikator
Action-Filter "Bestellung fehlt" nutzt `pos.orderStatus === 'NO'` (PDF-Parse). Korrespondiert mit der Spalte "BESTELLUNG" in RE-Positionen.

### S8: flex-wrap Layout bei kleinen Viewports
CardHeader in InvoicePreview erhaelt `flex flex-row flex-wrap items-center gap-4 pb-2` — 1:1 identisch zur Artikelliste (L1).

### S9: Body-Abschluss-Schutz — collapsedHeight darf nicht brechen [NEU in Rev 4]

**Stolperfalle:** Der Body der RE-Positionen ist mit dem `collapsedHeightPx`-Mechanismus an den unteren Viewport-Rand gebunden (PROJ-22 B1). Das Einfuegen des Filter-Dropdowns im CardHeader erhoeh die Header-Hoehe um ca. 40-50px (eine zusaetzliche Zeile bei flex-wrap auf schmalen Viewports).

**Warum es NICHT bricht:** Die `collapsedHeightPx`-Berechnung in InvoicePreview (Z.140-161) ist **bereits dynamisch und self-healing**:

```typescript
const updateCollapsedHeight = () => {
  const containerTop = tableContainerRef.current?.getBoundingClientRect().top;
  const toggleHeight = toggleContainerRef.current?.getBoundingClientRect().height ?? 0;
  const nextHeight = Math.max(260, Math.floor(window.innerHeight - containerTop - toggleHeight - 8));
  setCollapsedHeightPx(Number.isFinite(nextHeight) ? nextHeight : 400);
};
```

- `containerTop` wird vom `tableContainerRef` gemessen, das **unterhalb** des CardHeaders sitzt
- Wenn der CardHeader durch das neue Filter-Dropdown hoeher wird, verschiebt sich `containerTop` nach unten
- → `collapsedHeightPx` wird automatisch kleiner → Tabelle passt sich an
- → Der sticky Toggle-Button am unteren Rand (`sticky bottom-0`) bleibt positioniert
- → Die `useEffect`-Abhaengigkeit auf `filteredPositions.length` triggered ein Re-Measure bei Filterwechsel

**Zwingende Pruefung beim Coden:**
1. Das neue Filter-Dropdown darf **NICHT** unterhalb des `tableContainerRef` eingefuegt werden
2. Es muss **innerhalb** des `<CardHeader>` bleiben (vor `<CardContent>`)
3. Der `resize`-EventListener (Z.155) deckt auch Viewport-Aenderungen durch flex-wrap ab
4. Bei Filterwechsel (der `filteredPositions.length` aendert) wird `collapsedHeightPx` neu berechnet

**Kein Code-Eingriff in die collapsedHeight-Logik noetig.** Das bestehende System handhabt die Header-Hoehenaenderung automatisch.

---

## Verifizierung / Testplan

### Artikelliste (Aufgabe 1)
1. Jeden der 16 Filter einzeln aktivieren → gefilterte Zeilen korrekt?
2. `<SelectGroup>` + `<SelectLabel>` korrekt gerendert? (L2)
3. Dropdown-Breite `w-[240px]` — kein Textabschnitt?

### RE-Positionen (Aufgabe 2)
4. "Alle anzeigen" → alle Positionen sichtbar
5. "Preisabweichungen" → nur Positionen mit `priceCheckStatus === 'mismatch'`
6. "Matchstatus pruefen" → alle Positionen mit `matchStatus !== 'full-match'`
7. "Bestellung fehlt" → nur Positionen mit `orderStatus === 'NO'` (PDF-basiert)
8. "Konflikte" → EAN fehlt ODER Preis fehlt ODER no-match ODER inaktiv

### Pre-Step-2-Verhalten (RE-Positionen)
9. "Preisabweichungen" vor Step 2 → Tabelle leer
10. "Matchstatus pruefen" vor Step 2 → ALLE Positionen sichtbar
11. "Bestellung fehlt" vor Step 2 → funktioniert (PDF-only)
12. "Konflikte" vor Step 2 → nur Positionen mit fehlender EAN

### UI-Alignment (L1)
13. Tab-Wechsel Artikelliste ↔ RE-Positionen: Suchleiste + Filter optisch identisch?
14. Input-Hoehe in beiden Tabs identisch (`h-10` via shadcn-Default)?
15. SelectTrigger-Hoehe in beiden Tabs identisch (`h-10` via shadcn-Default)?

### Layout & Responsive (S8 + S9)
16. Viewports testen: 1920px, 1440px, 1280px, < 1280px
17. flex-wrap Umbruch: Suchleiste + Filter + Titel mit korrektem gap-4 Abstand?
18. **S9-Test:** Nach Filterwechsel: Body-Abschluss (Toggle-Button) bleibt am unteren Rand?
19. **S9-Test:** Browser verkleinern bis flex-wrap greift: collapsedHeight passt sich an?

### Null-Safety (L3)
20. Artikelliste Suche mit Position deren `manufacturerArticleNo` null ist → kein Crash?
21. Artikelliste Suche mit Position deren `ean` null ist → kein Crash?

### DRY-Validierung
22. `matchesItemsStatusFilter` und `matchesInvoiceActionFilter` voneinander unabhaengig?
23. Neuen Filter in `filterConfig.ts` hinzufuegen → erscheint nur in der richtigen Komponente?

---

## ADD-ON: Dynamische Filter-Sichtbarkeit [NEU]

**Datum:** 2026-02-28

### Konzept

Jede Filter-Option im Dropdown zeigt ihren Treffer-Count in Klammern (z. B. "PREIS: Abweichung (3)"). Optionen mit 0 Treffern werden komplett ausgeblendet, um das Menue kompakt zu halten.

### Zaehllogik (`useMemo`)

In beiden Tabellen wird ein `useMemo`-Hook eingefuegt, der ueber die **ungefilterten** Basis-Daten iteriert und pro Filter-Option den Count berechnet. Die bestehenden Funktionen `matchesItemsStatusFilter()` und `matchesInvoiceActionFilter()` aus `filterConfig.ts` werden 1:1 wiederverwendet.

- **ItemsTable:** `itemsFilterCounts: Map<string, number>` — Dependency: `[invoiceLines]`
- **InvoicePreview:** `invoiceFilterCounts: Map<string, number>` — Dependency: `[positions, positionStatusMap]`

### Ausblenden leerer Optionen

Beim Rendering der `<SelectItem>`s: Wenn `count === 0`, wird `null` zurueckgegeben. "Alle anzeigen" wird IMMER gerendert.

**UX-Sonderregel (ItemsTable):** Die Gruppen-Struktur (`<SelectGroup>`, `<SelectLabel>`, `<SelectSeparator>`) bleibt IMMER sichtbar — auch wenn alle Optionen innerhalb einer Gruppe 0 Treffer haben. Das signalisiert dem User: "Hier gibt es keine Probleme."

### Fallback: Reset-Guard (`useEffect`)

Wenn ein aktiver Filter (z. B. "Konflikte") durch Datenkorrektur auf 0 Treffer faellt, verschwindet das `<SelectItem>` aus dem DOM. Radix UI kann dann keinen Wert anzeigen, der nicht existiert. Ein `useEffect` prueft nach jedem Render: Ist `statusFilter !== 'all'` UND Count `=== 0`? → Automatischer Reset auf `'all'`.

### Dateiaenderungen

| Datei | Aenderung |
|-------|-----------|
| `src/components/run-detail/ItemsTable.tsx` | +1 `useMemo`, +1 `useEffect`, Dropdown-Rendering mit Count + Hide-Logik |
| `src/components/run-detail/InvoicePreview.tsx` | +1 `useMemo`, +1 `useEffect`, Dropdown-Rendering mit Count + Hide-Logik |
| `src/lib/filterConfig.ts` | Keine Aenderung |

---

## ADD-ON: Symmetrisches UI-Alignment Suchleiste [NEU]

**Datum:** 2026-02-28

### Konzept

Die Suchleiste im Header beider Tabellen (Artikelliste + RE-Positionen) war mit `flex-1 max-w-sm` (bis 384px) deutlich breiter als der danebenliegende Filter-Trigger (`w-[240px]`). Fuer ein symmetrisches Design wird die Suchleiste auf exakt dieselbe feste Breite gesetzt.

### Aenderung

| Datei | Vorher | Nachher |
|-------|--------|---------|
| `src/components/run-detail/ItemsTable.tsx` | `relative flex-1 max-w-sm` | `relative w-[240px]` |
| `src/components/run-detail/InvoicePreview.tsx` | `relative flex-1 max-w-sm` | `relative w-[240px]` |

`flex-1` wird entfernt, damit die Flexbox die feste Breite nicht ueberschreibt. Keine weiteren Layout-Aenderungen am Header.
