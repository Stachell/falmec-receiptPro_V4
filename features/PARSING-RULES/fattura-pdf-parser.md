# Fattura PDF-Parser — Parsing-Rules

> **Modul:** `FatturaParser_Master` (v3)
> **Pfad:** `src/services/parsers/modules/FatturaParser_Master.ts`
> **Step:** 1 — Rechnung auslesen
> **Engine:** pdfjs-dist (rein browser-basiert, kein OCR/AI)

---

## 1. Architektur-Prinzip

Der Parser arbeitet **koordinatenbasiert**: Jedes Text-Element aus dem PDF hat eine exakte `(x, y)`-Position. Spalten werden durch X-Bänder definiert, Zeilen durch Y-Toleranz gruppiert. Das Koordinatensystem von pdfjs (Y=0 unten) wird sofort in **Top-Down** (Y=0 oben) konvertiert.

```
pdfjs Y → topDownY = PAGE_HEIGHT - pdfjsY
PAGE_HEIGHT = 841 (A4 in Points)
```

---

## 2. Spalten-Bänder (Column Bands)

Jede Spalte hat einen festen X-Bereich auf der PDF-Seite (Breite = 595pt):

| Spalte | xMin | xMax | Inhalt |
|--------|------|------|--------|
| `LEFT_COL` | 10 | 82 | Artikelnummern, EAN-Codes |
| `DESCRIPTION` | 82 | 400 | Produkttext, Order-Header |
| `UM` | 400 | 425 | "PZ"-Anker (Mengeneinheit) |
| `QTY` | 425 | 470 | Menge (Stückzahl) |
| `UNIT_PRICE` | 470 | 520 | Einzelpreis EUR |
| `TOTAL_PRICE` | 515 | 560 | Gesamtpreis EUR |

Ein Text-Element gehört zu einer Spalte wenn `xMin <= item.x <= xMax`.

---

## 3. Header-Extraktion (Seite 1)

Feste Koordinaten-Regionen auf der ersten Seite:

| Feld | xMin | xMax | yMin | yMax |
|------|------|------|------|------|
| Rechnungsnummer | 420 | 470 | 235 | 255 |
| Rechnungsdatum | 470 | 535 | 235 | 255 |

### Regex-Patterns

```
Rechnungsnummer: /(\d{2}\.\d{3})/        → z.B. "24.007"
Rechnungsdatum:  /(\d{2}\/\d{2}\/\d{4})/ → z.B. "15/01/2025"
```

Das Datum wird beim Konvertieren zu `InvoiceHeader` von `DD/MM/YYYY` in `YYYY-MM-DD` umgewandelt.

---

## 4. Body-Extraktion (Positions-Parsing)

### 4.1 Body-Grenzen

| Grenze | Erkennung | Default |
|--------|-----------|---------|
| **Start** | Text "DESCRIPTION" bei Y=280..300 | Y=289 |
| **Ende** | "Number of packages"-Marker bei Y>700 | Y=717 |
| Fallback Ende | "Continues..."-Marker bei Y>780 | — |

### 4.2 Zeilen-Gruppierung

Text-Elemente mit einer Y-Differenz von **maximal 5pt** (`Y_TOL = 5`) werden zu einer logischen Zeile zusammengefasst. Innerhalb einer Zeile wird nach X-Koordinate sortiert.

### 4.3 PZ-Anker-Erkennung

Eine Position wird erkannt wenn in der `UM`-Spalte (x: 400–425) der Text `"PZ"` steht. Jede PZ-Zeile startet eine neue Rechnungsposition.

### 4.4 Nummernblock-Extraktion

Ausgehend von der PZ-Zeile wird im Bereich **25pt unterhalb** (`NUM_BLOCK_SCAN = 25`) nach Artikelnummer und EAN gesucht:

```
Artikelnummer: /^([A-Z][A-Z0-9]+(?:[.#\/][A-Z0-9#]+)*)/
               → z.B. "CFAB90#VT.ME" oder "FDPA90.E0P2#AA"

EAN:           /(803\d{10})/
               → 13-stellig, beginnt mit "803", z.B. "8032624878610"
```

**Ablauf:**
1. Items in `LEFT_COL` (x: 10–82) unterhalb der PZ-Zeile scannen
2. Erstes Match gegen `articleNumber`-Regex = Artikelnummer
3. Erstes Match gegen `ean`-Regex = EAN-Code
4. Status: `'found'` wenn mindestens eines erkannt wurde

### 4.5 Mengen- und Preis-Extraktion

| Feld | Spalte | Regex | Format |
|------|--------|-------|--------|
| Menge | `QTY` | `/^(\d+)$/` | Ganzzahl |
| Einzelpreis | `UNIT_PRICE` | `/([\d.]+,\d{2})/` | DE-Format |
| Gesamtpreis | `TOTAL_PRICE` | `/([\d.]+,\d{2})/` | DE-Format |

### 4.6 Preis-Parsing (Deutsches Format)

```typescript
function parseEurPrice(text: string): number | null {
  const match = text.match(/([\d.]+,\d{2})/);
  // "1.758,00" → Punkte entfernen, Komma zu Punkt
  // → "1758.00" → parseFloat → 1758
}
```

Schritte: `"1.758,00"` → `.replace(/\./g, '')` → `"1758,00"` → `.replace(',', '.')` → `"1758.00"` → `1758`

---

## 5. Order-Block-Tracking (Belegnummern)

### 5.1 Erkennung im PDF

Order-Header werden in der `DESCRIPTION`-Spalte erkannt:

```
Vs. ORDINE: /Vs\.\s+ORDINE/i               → Kundenbestellung (verbindlich)
Ns. ORDINE: /Ns\.\s+ORDINE/i               → Informativ (Falmec-intern)

Order-Block:
/(?:Vs\.|Ns\.)\s+ORDINE\s+(?:ESTERO|WEB\s*\(?NET-PORTAL\)?|SOSTITUZ\.\/RICAMBI)\s+Nr\.?\s*(.+?)\s+del\s+(\d{2}\/\d{2}\/\d{4})/i
```

Erfasste Typen: `ESTERO`, `WEB (NET-PORTAL)`, `SOSTITUZ./RICAMBI`

### 5.2 Extended Order Recognition

**Pfad:** `src/services/parsers/utils/ExtendedOrderRecognition.ts`

Ergänzt die Kern-Erkennung um einen erweiterten Y-Korridor-Scan:

| Parameter | Wert | Beschreibung |
|-----------|------|--------------|
| `ORDER_SCAN_CORRIDOR` | 15px | Suchbereich ober-/unterhalb der PZ-Zeile |
| Typ-A Pattern | `/\b(10\d{3})\b/g` | Standard-Bestellnummern (10xxx) |
| Typ-B Pattern | `/\b(9\d{4})\b/g` | Sonderbuchungen (9xxxx) |
| Underscore-Format | `/(\d+(?:_\d+)+)/` | z.B. `"0_10170_173_172"` |

**Underscore-Expansion:** `"0_10170_173_172"` wird expandiert zu:
- `10170` (vollständige Nummer, Typ A)
- `10173` (Prefix `"10"` + `"173"`)
- `10172` (Prefix `"10"` + `"172"`)

**Typ-Priorität:**
- Typ A (10xxx) hat Vorrang vor Typ B (9xxxx)
- Bei gemischten Ergebnissen: nur Typ A behalten, Typ-B-Warnung emittieren
- Nur Typ B: Soft-Fail-Warnung (`ORDER_TYPE_B_DETECTED`)

**Kern-Parser hat Priorität:** Existierende `orderCandidates` werden nie überschrieben. Der Extended-Scan befüllt nur leere Slots.

---

## 6. Footer-Extraktion (letzte Seite)

Feste Koordinaten auf der letzten Seite:

| Feld | xMin | xMax | yMin | yMax |
|------|------|------|------|------|
| Pakete (Anzahl) | 25 | 65 | 722 | 745 |
| Warenwert | 315 | 385 | 722 | 745 |
| Rechnungstotal | 485 | 560 | 722 | 800 |
| Fälligkeitsdatum | 290 | 350 | 780 | 800 |

---

## 7. Validierung

Nach dem Parsing werden 3 Plausibilitätsprüfungen durchgeführt:

| Prüfung | Vergleich | Toleranz |
|---------|-----------|----------|
| Positions-Summe vs. Rechnungstotal | `sumTotalPrice === invoiceTotal` | ±0.02 EUR |
| Mengen-Summe vs. Paketzahl | `sumQty === packagesCount` | exakt |
| Zeilen-Plausibilität | `qty * unitPrice === totalPrice` | ±0.02 EUR |

Das Ergebnis wird als `qtyValidationStatus` (`'ok'` / `'mismatch'` / `'unknown'`) im Header gespeichert und steuert die KPI-Kachel 1 ("Positionen erhalten") Ampel-Farbe.

---

## 8. Output-Schema

```typescript
interface ParsedInvoiceResult {
  success: boolean;
  header: {
    fatturaNumber: string;       // "24.007"
    fatturaDate: string;         // "15/01/2025"
    packagesCount: number | null;
    totalQty: number;
    parsedPositionsCount: number;
    qtyValidationStatus: 'ok' | 'mismatch' | 'unknown';
    invoiceTotal?: number;       // Rechnungstotal EUR
  };
  lines: ParsedInvoiceLine[];
  warnings: ParserWarning[];
  parserModule: string;          // "FatturaParser_Master"
  parsedAt: string;              // ISO timestamp
  sourceFileName: string;
}

interface ParsedInvoiceLine {
  positionIndex: number;
  manufacturerArticleNo: string;
  ean: string;
  descriptionIT: string;
  quantityDelivered: number;
  unitPrice: number;
  totalPrice: number;
  orderCandidates: string[];     // Belegnummern aus PDF
  orderCandidatesText: string;   // "10153|10170"
  orderStatus: 'YES' | 'NO' | 'check';
}
```
