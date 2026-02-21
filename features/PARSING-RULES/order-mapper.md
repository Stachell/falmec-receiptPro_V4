# Order-Mapper — Parsing-Rules

> **Modul:** OrderMapper (PROJ-20, Waterfall-4)
> **Parser:** `src/services/matching/orderParser.ts`
> **Mapper:** `src/services/matching/orderMapper.ts`
> **Step:** 4 — Bestellungen mappen
> **Legacy-Fallback:** `src/services/matching/OrderMatcher.ts` (3 Regeln)
> **Config-Switch:** `RunConfig.activeOrderMapperId` (`'waterfall-4'` / `'legacy-3'`)

---

## 1. Architektur-Prinzip

Der OrderMapper arbeitet **strikt auf den aggregierten Rechnungspositionen** (z.B. 45 Positionen mit `qty > 1`), NICHT auf expandierten Einzelzeilen. Bestellungen werden als **Array von Teilmengen** pro Position gespeichert:

```typescript
interface AllocatedOrder {
  orderNumber: string;    // z.B. "2025-10153"
  orderYear: number;      // z.B. 2025
  qty: number;            // Teilmenge aus dieser Bestellung
  reason: OrderAssignmentReason;
}

// Pro aggregierte Position:
invoiceLine.allocatedOrders: AllocatedOrder[]
```

**Invariante:** `sum(allocatedOrders[].qty) <= line.qty` — die Summe der zugewiesenen Teilmengen darf die Positionsmenge **niemals ueberschreiten**.

---

## 2. Order-Parser (Datei einlesen)

**Funktion:** `parseOrderFile(file: File): Promise<OrderParseResult>`

### 2.1 Unterstuetzte Formate

| Format | Erkennung | Encoding | Trennzeichen |
|--------|-----------|----------|--------------|
| CSV | `.csv` Endung | ISO-8859-1 (Latin-1) | Semikolon `;` |
| XLSX | alle anderen | — | — |

### 2.2 Spalten-Aliases

| Feld | Aliases |
|------|---------|
| `artNoDE` | `ART-# (DE)`, `ART-DE`, `FALMEC-ART`, `ARTIKELNR`, `ARTIKEL-NR` |
| `artNoIT` | `ART-# (IT)`, `ART-IT`, `CODICE`, `HERSTELLERARTIKELNR` |
| `ean` | `EAN`, `BARCODE`, `EAN-CODE`, `GTIN`, `EAN13` |
| `supplierId` | `LIEFERANT`, `SUPPLIER`, `KREDITORNR`, `KREDITOR` |
| `openQuantity` | `OFFENE MENGE`, `OPEN QTY`, `RESTMENGE`, `OFFEN` |
| `orderNumber` | `BELEGNUMMER`, `BELEG-NR`, `BESTELLNUMMER`, `ORDER-NO`, `BESTELLUNG` |
| `orderYear` | `BESTELLJAHR`, `ORDER-YEAR`, `JAHR` |

### 2.3 Regex-Validierung

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

### 2.4 Filter-Regeln

| Regel | Aktion |
|-------|--------|
| Bestellnummer faellt durch Regex | Zeile uebersprungen, Warning |
| Offene Menge <= 0 | Zeile uebersprungen |
| Offene Menge Dezimal | Gerundet auf Ganzzahl |

### 2.5 Output

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

## 3. 4-Stufen-Wasserfall

Fuer jede aggregierte Rechnungsposition wird der Wasserfall sequenziell durchlaufen. Jede Stufe kann Teilmengen zuweisen; die naechste Stufe arbeitet nur auf der **Restmenge**.

```
remainingQty = line.qty

Stufe 1 → remainingQty -= perfectMatch.qty
Stufe 2 → remainingQty -= sum(referenceMatches[].qty)
Stufe 3 → remainingQty -= smartQtyMatch.qty
Stufe 4 → remainingQty -= sum(fifoAllocations[].qty)
```

### 3.1 Stufe 1 — Perfect Match

**Bedingung:** Belegnummer aus PDF-Parsing (`orderCandidates`) + `openQuantity === position.qty`

```
orderCandidate "10153" (aus PDF)
    ↓ letzte 5 Ziffern vergleichen
openWE-Position mit orderNumber "10153" UND remaining === line.qty
    ↓
Gesamte Position in einem Schritt zugewiesen
```

**Ergebnis:** Ein `AllocatedOrder` mit `reason: 'perfect-match'` und `qty = line.qty`

### 3.2 Stufe 2 — Reference Match

**Bedingung:** Belegnummer aus PDF passt, aber Menge stimmt nicht ueberein

```
orderCandidate "10153" (aus PDF)
    ↓ passt, aber remaining ≠ line.qty
    ↓ Teilmenge zuweisen: min(remainingQty, op.remaining)
```

Iteriert ueber alle orderCandidates und alle passenden Order-Positionen (aelteste zuerst). Kann **mehrere** Teilzuweisungen erzeugen.

**Ergebnis:** Mehrere `AllocatedOrder` mit `reason: 'reference-match'`

### 3.3 Stufe 3 — Smart Qty Match

**Bedingung:** Keine Belegnummer aus PDF verfuegbar, aber **exakt eine** Bestellung mit `openQty === remainingQty`

```
Kein orderCandidate ODER Stufe 2 hat Rest uebrig
    ↓ Suche: genau EINE Order mit remaining === remainingQty
    ↓ Eindeutig? → Zuweisen
    ↓ 0 oder ≥2 Treffer? → Weiter zu Stufe 4
```

**Ergebnis:** Ein `AllocatedOrder` mit `reason: 'smart-qty-match'`

### 3.4 Stufe 4 — FIFO Fallback

**Bedingung:** Restmenge > 0 nach Stufen 1–3

```
Sortierung: orderYear ASC → belegnummer ASC (aelteste zuerst)
    ↓ Pro Order: take = min(remainingQty, op.remaining)
    ↓ Zuweisen, Restmenge reduzieren
    ↓ Naechste Order, bis remainingQty = 0 oder keine Orders mehr
```

Kann ueber **mehrere Bestellungen splitten**. Jede Teilmenge wird als separater `AllocatedOrder`-Eintrag mit `reason: 'fifo-fallback'` gespeichert.

**Ergebnis:** Mehrere `AllocatedOrder` mit `reason: 'fifo-fallback'`

---

## 4. Consumption-Tracking

Ein `ConsumptionTracker` verhindert Doppelzuweisung:

```typescript
class ConsumptionTracker {
  // Map: order position ID → bereits verbrauchte Menge
  remaining(op): number {
    return op.openQuantity - consumed.get(op.id);
  }
  consume(op, qty): void {
    consumed.set(op.id, prev + qty);
  }
}
```

Jede Stufe prueft `tracker.remaining(op) > 0` und ruft `tracker.consume(op, take)` auf. Ueber alle Positionen hinweg wird global getrackt.

---

## 5. Artikel-Matching (Kandidaten-Suche)

Order-Positionen werden pro Rechnungsposition ueber **3 Identifikatoren** gesucht:

```typescript
// Match wenn mindestens einer zutrifft:
const matchDE  = line.falmecArticleNo === op.artNoDE;      // Art-# (DE)
const matchIT  = line.manufacturerArticleNo === op.artNoIT; // Art-# (IT)
const matchEan = line.ean === op.ean;                       // EAN
```

Kandidaten werden nach **Alter sortiert** (aelteste zuerst): `orderYear ASC`, dann `belegnummer ASC`.

---

## 6. Aggregiertes Datenmodell

### 6.1 Beispiel: Position mit qty=10

```typescript
invoiceLine = {
  positionIndex: 5,
  qty: 10,
  allocatedOrders: [
    { orderNumber: "2025-10153", orderYear: 2025, qty: 7, reason: 'perfect-match' },
    { orderNumber: "2024-10089", orderYear: 2024, qty: 3, reason: 'fifo-fallback' },
  ],
  // Gesamt: 7 + 3 = 10 = qty ✓
}
```

### 6.2 Rueckwaerts-Kompatibilitaet

Fuer Legacy-Code werden die ersten Allokation-Daten auch in die flachen Felder geschrieben:

```typescript
line.orderNumberAssigned = allocatedOrders[0]?.orderNumber ?? null;
line.orderYear = allocatedOrders[0]?.orderYear ?? null;
line.orderCode = allocatedOrders[0]?.orderNumber.split('-').pop() ?? null;
line.orderAssignmentReason = allocatedOrders[0]?.reason ?? 'not-ordered';
```

### 6.3 View-Expansion

Die Expansion fuer die UI (Artikelliste-Tabelle) und XML-Export erfolgt ueber `expandForDisplay()`:

```typescript
function expandForDisplay(aggregatedLines: InvoiceLine[]): ExpandedViewLine[] {
  for (const line of aggregatedLines) {
    for (let i = 0; i < line.qty; i++) {
      result.push({
        ...line,
        expansionIndex: i,
        serialNumber: line.serialNumbers[i] ?? null,
        allocatedOrder: findOrderForIndex(line.allocatedOrders, i),
        lineId: `${line.lineId}-exp-${i}`,
        qty: 1,
      });
    }
  }
}

// findOrderForIndex: Sequentielle Zuordnung
// allocatedOrders = [{qty:7}, {qty:3}]
// Index 0-6 → Order[0], Index 7-9 → Order[1]
```

---

## 7. Stats & Issues

### 7.1 RunStats-Felder (nach Step 4)

| Feld | Beschreibung |
|------|--------------|
| `perfectMatchCount` | Anzahl Stufe-1-Zuweisungen |
| `referenceMatchCount` | Anzahl Stufe-2-Zuweisungen |
| `smartQtyMatchCount` | Anzahl Stufe-3-Zuweisungen |
| `fifoFallbackCount` | Anzahl Stufe-4-Zuweisungen |
| `matchedOrders` | Positionen mit mind. 1 Zuweisung |
| `notOrderedCount` | Positionen ohne jegliche Zuweisung |

### 7.2 Issues

| Typ | Severity | Bedingung |
|-----|----------|-----------|
| `'order-no-match'` | `'soft-fail'` | `notOrderedCount > 0` |

---

## 8. Cache-Cleanup nach Step 4

Unmittelbar nach erfolgreicher Order-Zuordnung werden temporaere Daten geleert:

```typescript
set({ preFilteredSerials: [], serialDocument: null });
```

| Daten | Vor Cleanup | Nach Cleanup |
|-------|-------------|--------------|
| `preFilteredSerials` | S/N-Zwischenspeicher | `[]` (leer) |
| `serialDocument` | Legacy SerialDocument | `null` |
| Parsed Order Positions | Lokale Variable in `executeOrderMapping()` | Automatisch GC'd |

**Archiv-Regel:** Keine rohen Bestell-Dateien im Archiv. Order-Daten sind in `invoice-lines.json` pro Position via `allocatedOrders[]` eingebettet.

---

## 9. Legacy-Pfad (OrderMatcher, 3 Regeln)

Wenn `activeOrderMapperId === 'legacy-3'`:

| Regel | Beschreibung |
|-------|--------------|
| 1. Exact Qty Match | `openQty === pendingLinesForArticle.length` |
| 2. Oldest First | Sortierung: `orderYear ASC`, `belegnummer ASC` |
| 3. Not Ordered | Kein Match gefunden |

Der Legacy-Matcher arbeitet auf **expandierten Einzelzeilen** (qty=1) und setzt `orderNumberAssigned` direkt pro Zeile. Er nutzt NICHT `allocatedOrders[]`.

### OrderAssignmentReason-Werte

| Wert | Quelle |
|------|--------|
| `'perfect-match'` | Waterfall Stufe 1 |
| `'reference-match'` | Waterfall Stufe 2 |
| `'smart-qty-match'` | Waterfall Stufe 3 |
| `'fifo-fallback'` | Waterfall Stufe 4 |
| `'exact-qty-match'` | Legacy Regel 1 |
| `'oldest-first'` | Legacy Regel 2 |
| `'not-ordered'` | Kein Match (beide Systeme) |
| `'manual'` | Manuelle Zuweisung durch User |
| `'manual-ok'` | Manuell bestaetigt |
| `'direct-match'` | Direkter Match (historisch) |
| `'pending'` | Initialzustand |
