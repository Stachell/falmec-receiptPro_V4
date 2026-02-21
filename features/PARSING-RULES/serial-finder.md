# Serial-Finder — Parsing-Rules

> **Modul:** SerialFinder (PROJ-20, aktualisiert PROJ-23)
> **Pfad:** `src/services/serialFinder.ts`
> **Step:** 3 — Seriennummer anfuegen
> **Legacy-Pfad:** `FalmecMatcher_Master.serialExtract()` (via SerialDocument)

---

## 1. Architektur-Prinzip

Der SerialFinder arbeitet in **3 Phasen**:

```
Phase 1: Pre-Filter   (beim Upload, SOFORT)
Phase 2: Validation    (bei Step-3-Start, gegen Invoice-Referenz)
Phase 3: Zuweisung     (S/N-Array auf aggregierte Positionen)
```

Die rohe S/N-Excel-Datei wird **niemals persistiert** — weder in localStorage noch im Archiv. Nur der Pre-Filter-Output existiert temporaer im Zustand-Memory.

---

## 2. S/N-Regex

```
/K[0-2][0-9]{10}K/
```

| Bestandteil | Laenge | Beschreibung |
|-------------|--------|--------------|
| `K` | 1 | Literales Praefix |
| `[0-2]` | 1 | Baujahr-Ziffer (0, 1 oder 2) |
| `[0-9]{10}` | 10 | Fortlaufende Produktionsnummer |
| `K` | 1 | Literales Suffix |
| **Gesamt** | **13** | z.B. `"K25645407008K"` |

---

## 3. Phase 1: Pre-Filter beim Upload

**Funktion:** `preFilterSerialExcel(file: File): Promise<SerialFinderResult>`

Wird **sofort bei File-Upload** (Typ `serialList`) ausgefuehrt, noch bevor ein Run gestartet wird.

### 3.1 Spalten-Erkennung (Fuzzy)

Die ersten 10 Zeilen werden nach Header-Candidates gescannt:

| Spalte | Aliases |
|--------|---------|
| Serial (Matricola) | `MATRICOLA`, `SERIAL`, `SERIENNUMMER`, `S/N`, `SN` |
| EAN (Barcode) | `BARCODE`, `EAN`, `EAN-CODE`, `GTIN`, `EAN13` |
| Art-# IT (Codice) | `CODICE`, `CODE-IT`, `ART-IT`, `HERSTELLERARTIKELNR`, `ART-# (IT)` |
| Rechnungsreferenz | `FATTURA`, `N° FATTURA`, `RECHNUNG`, `INVOICE`, `NR FATTURA` |

**Vergleich:** Case-insensitiv, Substring-Match (`header.includes(alias)`).

### 3.2 Fallback-Scan

Wenn die Serial-Spalte nicht erkannt wird, durchsucht der Parser **jede Zelle jeder Zeile** per Regex-Match. Die erste Zelle mit einem `/K[0-2]\d{10}K/`-Treffer gewinnt.

### 3.3 Output

```typescript
interface SerialFinderResult {
  filteredRows: PreFilteredSerialRow[];  // Nur Regex-Treffer
  totalRowsScanned: number;
  regexMatchCount: number;
  warnings: string[];
}

interface PreFilteredSerialRow {
  serialNumber: string;        // Extrahierter S/N (13 Zeichen)
  ean: string;                 // Aus EAN-Spalte
  artNoIT: string;             // Aus Art-IT-Spalte
  invoiceReference: string;    // Aus Rechnungs-Spalte
  sourceRowIndex: number;      // Original-Zeilenindex in der Excel
}
```

### 3.4 Speicher-Verhalten

| Aspekt | Verhalten |
|--------|-----------|
| **Zustand-Memory** | `preFilteredSerials: PreFilteredSerialRow[]` im runStore |
| **localStorage** | NIEMALS — explizit von `saveParsedInvoice()` ausgeschlossen |
| **IndexedDB** | Nur die rohe Excel-Datei (via fileStorageService), nicht die Filter-Ergebnisse |
| **Page-Refresh** | `preFilteredSerials` wird geleert (gewollt, erneuter Upload noetig) |
| **Cache-Cleanup** | Nach Step 4: `set({ preFilteredSerials: [] })` |

---

## 4. Phase 2: Smart-Validation gegen Invoice-Referenz

**Funktion:** `validateAgainstInvoice(rows, invoiceNumber): { validRows, rejectedCount }`

Wird bei Step-3-Ausfuehrung aufgerufen, nachdem die Fattura-Nummer bekannt ist.

### 4.1 Referenz-Extraktion

```typescript
// Eingabe: "24.007"
const digits = invoiceNumber.replace(/\D/g, '');  // → "24007"
const invoiceRef5 = digits.slice(-5);             // → "24007"

// Vergleich pro Zeile:
const rowRef = row.invoiceReference.replace(/\D/g, '').slice(-5);
// Match: rowRef === invoiceRef5
```

Nur die **letzten 5 Ziffern** werden verglichen. Nicht-numerische Zeichen werden vorher entfernt.

### 4.2 Ergebnis

Zeilen ohne passende Referenz werden verworfen. Die `rejectedCount` wird als Warning geloggt.

Nach der Validation ist das Feld `invoiceReference` semantisch redundant und wird im Lean-Archive nicht mehr gespeichert.

---

## 5. Phase 3: S/N-Zuweisung auf aggregierte Positionen

Die Zuweisung erfolgt in `executeMatcherSerialExtract()` im runStore.

**PROJ-23 Aenderung:** Da Step 1 ab sofort aggregierte Zeilen (qty>1) im Store haelt (statt expandierter qty=1 Zeilen), muss Phase 3 das `serialNumbers[]` Array auf der aggregierten Position befuellen (N Eintraege fuer qty=N). Die Logik bleibt EAN-basiert, operiert aber auf weniger Zeilen (~45 statt ~295).

### 5.1 EAN-basiertes Mapping

```typescript
// 1. EAN → S/N-Pool aufbauen
const eanToSerials = new Map<string, string[]>();
for (const row of validRows) {
  const ean = row.ean.trim();
  const list = eanToSerials.get(ean) ?? [];
  list.push(row.serialNumber);
  eanToSerials.set(ean, list);
}

// 2. Pro Position (aggregiert): bis zu qty S/Ns zuweisen
for (const line of runLines) {
  if (!line.serialRequired) continue;
  const available = eanToSerials.get(line.ean);
  const take = Math.min(line.qty, available.length);
  const assigned = available.splice(0, take);  // Pool wird verbraucht
  line.serialNumbers = assigned;               // Array, KEINE Expansion
}
```

### 5.2 Aggregiertes Datenmodell

```typescript
// Beispiel: Position mit qty=5
invoiceLine.serialNumbers = [
  'K25645407001K',
  'K25645407002K',
  'K25645407003K',
  'K25645407004K',
  'K25645407005K',
]
// serialNumbers.length <= qty (immer)
```

**Keine Expansion in Phase 3:** Die S/Ns werden als Array in der aggregierten Zeile gehalten. Die Verteilung auf Einzelzeilen geschieht erst in **Run 3 der Matching-Engine** (PROJ-23 Phase A4), wenn die aggregierten Zeilen expandiert werden. Dabei erhaelt jede expandierte Zeile genau eine Seriennummer: `expandedLine.serialNumbers = [line.serialNumbers[i]]`.

### 5.3 Checksum

```
regexHits    = validRows.length (Pre-Filter-Treffer nach Validation)
assignedSNs  = Summe aller zugewiesenen serialNumbers
match        = assignedSNs === requiredCount
```

| Ergebnis | Step-3-Status |
|----------|---------------|
| `match = true` | `'ok'` |
| `match = false` | `'soft-fail'` + Issue im Issues-Center |

---

## 6. Lean Archive

**Funktion:** `buildLeanArchive(rows): LeanSerialArchiveEntry[]`

Wird beim Archivieren (nach Step 5) aufgerufen und schreibt `serial-data.json` auf die Festplatte.

### 6.1 Output-Format

```typescript
interface LeanSerialArchiveEntry {
  ean: string;
  artNoIT: string;
  serialNumber: string;
  sourceRowIndex: number;
}
```

**4 Felder pro Zeile.** Kein `invoiceReference` im Archiv (bereits validiert und nicht mehr benoetigt).

### 6.2 Archiv-Regeln

| Regel | Beschreibung |
|-------|--------------|
| Rohe S/N-Excel | Wird **NIEMALS** ins Archiv geschrieben |
| `serial-data.json` | Einzige S/N-Datei im Archiv-Ordner |
| Format | JSON-Array mit 4 Feldern pro Eintrag |
| Groesse | ~50-100 Bytes pro Zeile (vs. ~5KB/Zeile in der rohen Excel) |
| Metadaten | `ArchiveMetadata.files.serialData: { name, size }` |

---

## 7. Legacy-Pfad (FalmecMatcher_Master.serialExtract)

Wenn `preFilteredSerials` leer ist (z.B. bei aelteren Runs), wird der Legacy-Pfad ueber `FalmecMatcher_Master.serialExtract()` aktiviert:

- Input: `SerialDocument` (rohes Zeilen-Array mit Column-Mapping)
- Funktionsweise: 5-Digit-Invoice-Ref-Matching → SN_REGEX → FIFO-Zuweisung auf **expandierte** Einzelzeilen
- Output: `SerialExtractionResult` mit per-Zeile `serialNumber` + `serialSource`

Der Legacy-Pfad bleibt als Fallback erhalten, wird aber durch den neuen SerialFinder-Pfad nicht mehr aktiv genutzt.
