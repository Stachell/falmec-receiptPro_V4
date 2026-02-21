# Order-Mapper — Parsing-Rules

> **Modul:** MatchingEngine (PROJ-23, 3-Run Article-First)
> **Orchestrator:** `src/services/matching/matchingEngine.ts`
> **Run 1:** `src/services/matching/runs/run1PerfectMatch.ts`
> **Run 2:** `src/services/matching/runs/run2PartialFillup.ts`
> **Run 3:** `src/services/matching/runs/run3ExpandFifo.ts`
> **OrderPool:** `src/services/matching/orderPool.ts`
> **Order-Parser:** `src/services/matching/orderParser.ts`
> **Step:** 4 — Bestellungen mappen
> **Config-Switch:** `RunConfig.activeOrderMapperId`
> **Vorgaenger:** PROJ-20 Waterfall-4 (ersetzt, Code bleibt als `@deprecated` Referenz)

---

## 1. Architektur-Prinzip (PROJ-23)

Der OrderMapper arbeitet in **3 sequentiellen Runs** mit einem **Article-First OrderPool**:

```
Step 2 (Artikel-Match) → buildOrderPool() → Run 1 → Run 2 → Run 3
                              ↓
              Nur Bestellungen fuer Rechnungsartikel laden
```

**Kernprinzip:**
- Runs 1 und 2 arbeiten auf **aggregierten Positionen** (z.B. 45 Zeilen mit qty > 1)
- Run 3 **expandiert** die aggregierten Zeilen zu ~295 Einzelzeilen (qty=1) und fuellt per FIFO auf
- Der OrderPool ist **global im Store** (nicht lokal im Mapper) und ueberlebt fuer manuelle Resolution

### Datenmodell

```typescript
interface AllocatedOrder {
  orderNumber: string;    // z.B. "2025-10153" (YYYY-XXXXX Composite Key)
  orderYear: number;      // z.B. 2025
  qty: number;            // Teilmenge aus dieser Bestellung
  reason: OrderAssignmentReason;
}

// Pro aggregierte Position (vor Expansion):
invoiceLine.allocatedOrders: AllocatedOrder[]

// Pro Einzelzeile (nach Expansion in Run 3):
invoiceLine.allocatedOrders: AllocatedOrder[]  // max 1 Eintrag, qty=1
```

**Invariante:** `sum(allocatedOrders[].qty) <= line.qty`

---

## 2. Article-First OrderPool

### 2.1 Aufbau

**Funktion:** `buildOrderPool(parsedOrders, invoiceLines, masterArticles)`

Der Pool wird **nach Step 2** gebaut, wenn `falmecArticleNo` (ArtNoDE) auf den Rechnungszeilen verfuegbar ist.

```
Alle ParsedOrderPositions aus CSV
    ↓ Filter: artNoDE muss in Set(invoiceLines.map(l => l.falmecArticleNo)) sein
    ↓ Validierung: EAN oder ArtNoIT muessen vorhanden sein (Soft-Fail Warning wenn nicht)
    ↓ Sortierung: orderYear ASC, belegnummer ASC (aelteste zuerst)
    = OrderPool
```

**Nur Bestellungen fuer Rechnungsartikel** werden geladen. Alle anderen werden verworfen.

### 2.2 Datenstruktur

```typescript
interface OrderPoolEntry {
  position: ParsedOrderPosition;  // Aus orderParser
  initialQty: number;             // Originale offene Menge
  consumedQty: number;            // Bisher verbraucht (durch Runs + manuelle Zuweisung)
  remainingQty: number;           // = initialQty - consumedQty
}

interface OrderPool {
  byArticle: Map<string, OrderPoolEntry[]>;  // artNoDE → Entries (sorted oldest-first)
  byId: Map<string, OrderPoolEntry>;         // position.id → Entry (O(1) Lookup)
  totalRemaining: number;                    // Summe aller remainingQty
}
```

### 2.3 Pool-Operationen

```typescript
consumeFromPool(pool, positionId, qty):  // remainingQty -= qty, consumedQty += qty
returnToPool(pool, positionId, qty):     // remainingQty += qty, consumedQty -= qty (bidirektional)
```

`returnToPool` wird **ausschliesslich** fuer manuelle Reassignment genutzt (Phase A5).

### 2.4 Soft-Fail Validierung

| Situation | Aktion |
|-----------|--------|
| Bestellung hat `artNoDE` + `ean` + `artNoIT` | Volle Validierung bestanden |
| Bestellung hat `artNoDE` + mindestens `ean` ODER `artNoIT` | OK, in Pool aufgenommen |
| Bestellung hat `artNoDE` aber WEDER `ean` NOCH `artNoIT` | In Pool aufgenommen, **Warning-Issue** emittiert |
| Bestellung hat kein `artNoDE` Match zu Rechnungsartikeln | Nicht in Pool aufgenommen |

### 2.5 Composite Key

Bestellnummern MUESSEN als `YYYY-XXXXX` formatiert sein:

```
orderYear: 2025, orderNumber: "10153" → Composite Key: "2025-10153"
```

Dies ist der **Primaerschluessel** fuer Bestellungen im gesamten System.

---

## 3. Order-Parser (Datei einlesen)

**Funktion:** `parseOrderFile(file: File): Promise<OrderParseResult>`

### 3.1 Unterstuetzte Formate

| Format | Erkennung | Encoding | Trennzeichen |
|--------|-----------|----------|--------------|
| CSV | `.csv` Endung | ISO-8859-1 (Latin-1) | Semikolon `;` |
| XLSX | alle anderen | — | — |

### 3.2 Spalten-Aliases

| Feld | Aliases |
|------|---------|
| `artNoDE` | `ART-# (DE)`, `ART-DE`, `FALMEC-ART`, `ARTIKELNR`, `ARTIKEL-NR` |
| `artNoIT` | `ART-# (IT)`, `ART-IT`, `CODICE`, `HERSTELLERARTIKELNR` |
| `ean` | `EAN`, `BARCODE`, `EAN-CODE`, `GTIN`, `EAN13` |
| `supplierId` | `LIEFERANT`, `SUPPLIER`, `KREDITORNR`, `KREDITOR` |
| `openQuantity` | `OFFENE MENGE`, `OPEN QTY`, `RESTMENGE`, `OFFEN` |
| `orderNumber` | `BELEGNUMMER`, `BELEG-NR`, `BESTELLNUMMER`, `ORDER-NO`, `BESTELLUNG` |
| `orderYear` | `BESTELLJAHR`, `ORDER-YEAR`, `JAHR` |

### 3.3 Regex-Validierung

```
Bestellnummer: /^1\d{4}$/
```

Exakt **5 Ziffern**, beginnt mit `"1"`. Beispiele:
- `"10153"` — gueltig
- `"20153"` — ungueltig (beginnt nicht mit 1)
- `"1015"` — ungueltig (nur 4 Ziffern)

Bei laengeren Belegnummern (z.B. `"202510153"`) werden die **letzten 5 Ziffern** extrahiert.

```
Bestelljahr: /^\d{4}$/
```

Exakt 4 Ziffern. Beispiel: `"2025"`.

**Fallback-Jahr-Erkennung:** Wenn keine separate Jahr-Spalte existiert, werden die **ersten 4 Ziffern** der Belegnummer als Jahr interpretiert:
```
"202510153" → orderYear = 2025, orderNumber = "10153"
```

### 3.4 Filter-Regeln

| Regel | Aktion |
|-------|--------|
| Bestellnummer faellt durch Regex | Zeile uebersprungen, Warning |
| Offene Menge <= 0 | Zeile uebersprungen |
| Offene Menge Dezimal | Gerundet auf Ganzzahl |

### 3.5 Output

```typescript
interface ParsedOrderPosition {
  id: string;            // "op-{rowIndex}-{orderNumber}"
  artNoDE: string;       // Falmec-Artikelnummer (DE)
  ean: string;
  artNoIT: string;       // Herstellerartikelnummer
  supplierId: string;
  openQuantity: number;  // Offene Restmenge (ganzzahlig)
  orderNumber: string;   // 5-stellig, validiert
  orderYear: number;     // 4-stellig
  belegnummer: string;   // Original-Wert (vor Extraktion)
}
```

---

## 4. 3-Run Matching-Engine

### 4.1 Run 1 — Perfect Match (Aggregiert)

**Input:** Aggregierte InvoiceLine[] (qty > 1), OrderPool
**Bedingung:** `orderCandidate` aus PDF-Parsing + `pool.remainingQty === line.qty`

```
Fuer jede aggregierte Position:
  1. Pruefe PDF orderCandidates (aus Step 1)
  2. Suche im OrderPool nach Bestellung mit matchendem Rumpf (letzte 5 Ziffern)
  3. Wenn pool.remainingQty === line.qty → Perfect Match

Duplikat-Regel: Bei 2024-10153 und 2025-10153 → AELTESTE zuerst (2024)
```

**Ergebnis:** Ein `AllocatedOrder` mit `reason: 'perfect-match'` und `qty = line.qty`

### 4.2 Run 2 — Partial/Fillup (Aggregiert)

**Input:** Verbleibende ungematchte aggregierte Positionen, OrderPool
**Logik:**

1. **Reference-Fill:** Positionen mit PDF-Refs die keinen Perfect Match bekamen:
   ```
   orderCandidate "10153" passt, aber remaining ≠ line.qty
   → Teilmenge zuweisen: min(remainingQty, op.remaining)
   → Mehrere AllocatedOrders moeglich
   ```

2. **Smart Qty Match:** Positionen ohne PDF-Refs:
   ```
   Genau EINE Bestellung mit remaining === verbleibende Menge → Zuweisen
   0 oder ≥2 Treffer → Weiter zu Run 3
   ```

**Ergebnis:** Mehrere `AllocatedOrder` mit `reason: 'reference-match'` oder `'smart-qty-match'`

### 4.3 Run 3 — Expansion + FIFO (KRITISCHER UEBERGANG)

**Dies ist der architektonische Pivot-Punkt.**

#### Schritt 1: Expansion

```typescript
// ~45 aggregierte Zeilen → ~295 Einzelzeilen
for (const line of aggregatedLines) {
  for (let i = 0; i < line.qty; i++) {
    expanded.push({
      ...line,
      lineId: `${runId}-line-${line.positionIndex}-${i}`,
      qty: 1,
      expansionIndex: i,
      serialNumbers: line.serialNumbers[i] ? [line.serialNumbers[i]] : [],
      allocatedOrders: findOrderForExpansionIndex(line.allocatedOrders, i),
      // orderAssignmentReason: abgeleitet oder 'pending'
    });
  }
}
```

**Order-Verteilung bei Expansion:**
```
allocatedOrders = [{qty:7, order:'2025-10153'}, {qty:3, order:'2024-10089'}]
→ Expanded Index 0-6: allocatedOrders = [{qty:1, order:'2025-10153', reason:...}]
→ Expanded Index 7-9: allocatedOrders = [{qty:1, order:'2024-10089', reason:...}]
```

#### Schritt 2: FIFO-Fill

```
Alle expanded Lines mit orderAssignmentReason === 'pending':
  Gruppiere nach Artikel (falmecArticleNo)
  Fuer jeden Artikel:
    Sortiere Pool-Eintraege: orderYear ASC, belegnummer ASC
    Pro unassigned Line: consume 1 aus aeltestem Pool-Eintrag
```

**Ergebnis:** Einzelzeilen mit `reason: 'fifo-fallback'`

#### Schritt 3: Store-Update

```typescript
set({
  invoiceLines: expandedLines,        // ~295 Zeilen mit qty=1
  orderPool: result.pool,             // Mutierter Pool (fuer manuelle Resolution)
  runs: [{ ...run, isExpanded: true }] // Einweg-Flag
});
```

**EINWEG-OPERATION:** Nach Run 3 ist `isExpanded = true`. Es gibt kein Zurueck.

---

## 5. Consumption-Tracking

Der OrderPool ersetzt den alten `ConsumptionTracker`:

```typescript
// ALT (PROJ-20): Lokale ConsumptionTracker-Klasse in orderMapper.ts
class ConsumptionTracker {
  private consumed = new Map<string, number>();
  remaining(op): number { return op.openQuantity - consumed.get(op.id); }
  consume(op, qty): void { consumed.set(op.id, prev + qty); }
}

// NEU (PROJ-23): Globaler OrderPool im Store
consumeFromPool(pool, positionId, qty): void {
  entry.consumedQty += qty;
  entry.remainingQty -= qty;
  pool.totalRemaining -= qty;
}
```

**Vorteile des neuen Ansatzes:**
- Pool ist global im Store → ueberlebt zwischen Runs und manueller Resolution
- `returnToPool()` ermoeglicht bidirektionale Zuweisung
- Pool wird in IndexedDB persistiert → ueberlebt F5

---

## 6. Manuelle Resolution (Phase A5)

Nach Step 4 (Run 3) kann der User im Tab "Artikelliste" unassigned Einzelzeilen manuell Bestellungen zuweisen.

### 6.1 Popup-Logik

| Element | Verhalten |
|---------|-----------|
| **Dropdown** | Alle verbleibenden Pool-Eintraege fuer diesen Artikel (YYYY-XXXXX). Letzter Eintrag: "NEU" |
| **Freitext** | Manuelle Bestellnummer-Eingabe |
| **Leerstand** | "Keine Bestellung vorhanden" — nur "NEU" waehlbar |
| **Konflikt** | Dropdown gewaehlt UND Freitext befuellt → Zwangsauswahl-Dialog |

### 6.2 Bidirektionales State-Update

```
User weist Zeile X die Bestellung 2025-10153 zu:
  1. Alte Bestellung (falls vorhanden) → returnToPool(oldOrder, +1)
  2. Neue Bestellung → consumeFromPool(2025-10153, -1)
  3. Line updaten: allocatedOrders = [{orderNumber: "2025-10153", qty: 1, reason: 'manual'}]
  4. Auto-Resolve Issues pruefen
```

### 6.3 OrderAssignmentReason-Werte

| Wert | Quelle |
|------|--------|
| `'perfect-match'` | Run 1 |
| `'reference-match'` | Run 2 |
| `'smart-qty-match'` | Run 2 |
| `'fifo-fallback'` | Run 3 |
| `'manual'` | Manuelle Zuweisung (Dropdown oder Freitext) |
| `'manual-ok'` | Manuell bestaetigt |
| `'not-ordered'` | Kein Match (alle Runs + manuell) |
| `'pending'` | Initialzustand |

---

## 7. Artikel-Matching (Kandidaten-Suche)

Order-Positionen werden pro Rechnungsposition ueber **3 Identifikatoren** gesucht:

```typescript
// Match wenn mindestens einer zutrifft:
const matchDE  = line.falmecArticleNo === op.artNoDE;      // Art-# (DE) — PRIMAER
const matchIT  = line.manufacturerArticleNo === op.artNoIT; // Art-# (IT)
const matchEan = line.ean === op.ean;                       // EAN
```

Kandidaten werden nach **Alter sortiert** (aelteste zuerst): `orderYear ASC`, dann `belegnummer ASC`.

**Article-First Filter (NEU):** Die Suche geschieht nicht mehr global, sondern ueber den OrderPool, der bereits nach Rechnungsartikeln gefiltert ist.

---

## 8. Aggregiertes → Expandiertes Datenmodell

### 8.1 Vor Expansion (Runs 1-2): Aggregiert

```typescript
invoiceLine = {
  positionIndex: 5,
  qty: 10,
  lineId: "run123-line-5",             // Kein Expansion-Suffix
  serialNumbers: ['K25...01K', ..., 'K25...10K'],  // 10 S/Ns
  allocatedOrders: [
    { orderNumber: "2025-10153", orderYear: 2025, qty: 7, reason: 'perfect-match' },
    { orderNumber: "2024-10089", orderYear: 2024, qty: 3, reason: 'fifo-fallback' },
  ],
  // Gesamt: 7 + 3 = 10 = qty
}
```

### 8.2 Nach Expansion (Run 3): Einzelzeilen

```typescript
// Index 0 (von 10):
expandedLine = {
  positionIndex: 5,
  expansionIndex: 0,
  qty: 1,
  lineId: "run123-line-5-0",           // MIT Expansion-Suffix
  serialNumbers: ['K25...01K'],        // 1 S/N
  allocatedOrders: [
    { orderNumber: "2025-10153", orderYear: 2025, qty: 1, reason: 'perfect-match' },
  ],
}

// Index 7 (von 10):
expandedLine = {
  positionIndex: 5,
  expansionIndex: 7,
  qty: 1,
  lineId: "run123-line-5-7",
  serialNumbers: ['K25...08K'],
  allocatedOrders: [
    { orderNumber: "2024-10089", orderYear: 2024, qty: 1, reason: 'fifo-fallback' },
  ],
}
```

### 8.3 Rueckwaerts-Kompatibilitaet

Fuer Legacy-Code werden die ersten Allokation-Daten auch in die flachen Felder geschrieben:

```typescript
line.orderNumberAssigned = allocatedOrders[0]?.orderNumber ?? null;
line.orderYear = allocatedOrders[0]?.orderYear ?? null;
line.orderCode = allocatedOrders[0]?.orderNumber.split('-').pop() ?? null;
line.orderAssignmentReason = allocatedOrders[0]?.reason ?? 'not-ordered';
```

---

## 9. Stats & Issues

### 9.1 RunStats-Felder (nach Step 4)

| Feld | Beschreibung |
|------|--------------|
| `perfectMatchCount` | Anzahl Run-1-Zuweisungen |
| `referenceMatchCount` | Anzahl Run-2-Reference-Zuweisungen |
| `smartQtyMatchCount` | Anzahl Run-2-Smart-Qty-Zuweisungen |
| `fifoFallbackCount` | Anzahl Run-3-FIFO-Zuweisungen |
| `matchedOrders` | Positionen mit mind. 1 Zuweisung |
| `notOrderedCount` | Positionen ohne jegliche Zuweisung |

### 9.2 Issues

| Typ | Severity | Bedingung |
|-----|----------|-----------|
| `'order-no-match'` | `'error'` | Position ohne Zuweisung nach allen 3 Runs |
| `'order-incomplete'` | `'warning'` | Zugewiesene Menge < Positionsmenge |
| `'order-multi-split'` | `'info'` | Position ueber 3+ Bestellungen gesplittet |
| `'order-fifo-only'` | `'info'` | Position nur via FIFO zugewiesen (kein PDF-Ref) |
| `'order-pool-validation'` | `'warning'` | Bestellung hat artNoDE aber weder EAN noch artNoIT |

---

## 10. Cache-Cleanup nach Step 4

Unmittelbar nach erfolgreicher Order-Zuordnung werden temporaere Daten geleert:

```typescript
set({ preFilteredSerials: [], serialDocument: null });
```

| Daten | Vor Cleanup | Nach Cleanup |
|-------|-------------|--------------|
| `preFilteredSerials` | S/N-Zwischenspeicher | `[]` (leer) |
| `serialDocument` | Legacy SerialDocument | `null` |
| Parsed Order Positions | Lokale Variable | Automatisch GC'd |
| **OrderPool** | **Bleibt im Store** | **Persistiert fuer manuelle Resolution** |

**Archiv-Regel:** Keine rohen Bestell-Dateien im Archiv. Order-Daten sind in `invoice-lines.json` pro Position via `allocatedOrders[]` eingebettet.

---

## 11. Legacy-Pfad (PROJ-20 Waterfall-4)

Der alte 4-Stufen-Wasserfall (`src/services/matching/orderMapper.ts`) bleibt als `@deprecated` Referenz im Code:

| Stufe | Beschreibung | Ersetzt durch |
|-------|-------------|---------------|
| Stufe 1 (Perfect Match) | orderCandidate + exact qty | Run 1 |
| Stufe 2 (Reference Match) | orderCandidate + partial qty | Run 2 |
| Stufe 3 (Smart Qty) | Keine Ref, exakt 1 Match | Run 2 (integriert) |
| Stufe 4 (FIFO Fallback) | Aelteste zuerst auffuellen | Run 3 (nach Expansion) |

**Wesentliche Unterschiede PROJ-20 → PROJ-23:**
1. OrderPool statt globaler Bestellliste (Article-First Filter)
2. Expansion geschieht in Run 3, nicht in Step 1
3. OrderPool persistiert im Store fuer manuelle Resolution
4. Bidirektionale Pool-Mutation (consume/return)
5. Composite Key `YYYY-XXXXX` als Primaerschluessel

### Legacy OrderMatcher (3 Regeln)

Wenn `activeOrderMapperId === 'legacy-3'`:

| Regel | Beschreibung |
|-------|--------------|
| 1. Exact Qty Match | `openQty === pendingLinesForArticle.length` |
| 2. Oldest First | Sortierung: `orderYear ASC`, `belegnummer ASC` |
| 3. Not Ordered | Kein Match gefunden |

Der Legacy-Matcher arbeitet auf **expandierten Einzelzeilen** (qty=1) und nutzt NICHT `allocatedOrders[]`.
