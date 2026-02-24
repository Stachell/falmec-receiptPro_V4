# PROJ-20 — SerialFinder + OrderMapper (Waterfall-4) + OrderParser

**Status:** Done
**Datum:** 2026-02-21
**Commit:** `a037f51` (zusammen mit PROJ-21)
**Baut auf:** PROJ-16, PROJ-19

---

## Ziel

Implementierung des vollständigen Matching-Backends für Step 3 (Seriennummern) und Step 4 (Bestellzuordnung) sowie eines deterministischen OrderParsers für Excel/CSV-Bestelldaten.

---

## Umgesetzte Änderungen

### 1. SerialFinder

- **preFilteredSerials:** Seriennummern werden vor dem eigentlichen Matching-Lauf vorge­filtert (nur relevante Serien für aktuelle Rechnungsartikel).
- **Lean Archive:** Schlanke Archiv-Struktur — nur gefundene Serials werden im Run-State gespeichert.
- **Cache Cleanup:** Temporärer Serial-Cache wird nach Step 3-Abschluss bereinigt (`preFilteredSerials` und `serialDocument` cleared).

### 2. OrderMapper — 4-stufiger Waterfall

Deterministischer 4-Stufen-Waterfall für Bestellzuordnung:

| Stufe | Name | Beschreibung |
|-------|------|--------------|
| **Stage 1** | Perfect Match | ArtNoDE + PDF-Referenz + exakte Menge stimmen überein |
| **Stage 2** | Reference Match | Nur PDF-Referenz stimmt (Menge toleriert) |
| **Stage 3** | Smart Qty Match | Genau eine Bestellung mit passender offener Menge |
| **Stage 4** | FIFO | Älteste Bestellung per Artikel, unabhängig von Referenz |

**Sortierung:** Bestellungen werden nach `orderYear ASC, belegnummer ASC` sortiert (älteste zuerst).

**Composite Key:** Alle Bestellreferenzen im Format `YYYY-XXXXX`.

### 3. OrderParser

- Neuer Parser für offene Bestellungen aus Excel/CSV (`openWE`-Format).
- Validierung: Pflichtfelder, Datumsformat, numerische Felder.
- Schema-Alias-System analog zu `masterDataParser.ts`.
- Output: `ParsedOrderPosition[]` mit `artNoDE`, `ean`, `artNoIT`, `openQuantity`, `belegnummer`, `orderYear`.

### 4. Parsing-Rules Dokumentation

- Deterministische Regelwerke für alle 4 Module dokumentiert.
- Ablage im Ordner `features/PARSING-RULES/`.
- Dient als Referenz für Debugging und zukünftige Matcher-Anpassungen.

---

## Technische Details

**Neue/modifizierte Dateien:**

| Datei | Status | Zweck |
|-------|--------|-------|
| `src/services/matching/serialFinder.ts` | NEU/modifiziert | Serien-Vorfilterung + Lean Archive |
| `src/services/matching/orderMapper.ts` | NEU/modifiziert | 4-Stufen Waterfall Bestellzuordnung |
| `src/services/matching/orderParser.ts` | NEU | Excel/CSV Parser für offene Bestellungen |
| `features/PARSING-RULES/` | NEU | Deterministische Regelwerk-Dokumentation |

**OrderMapper Waterfall-Logik:**
```typescript
function executeOrderMapping(lines, parsedOrders) {
  // Stage 1: Perfect Match
  for (const line of unmatchedLines) {
    const match = findPerfectMatch(line, parsedOrders);
    if (match) allocate(line, match, 'perfect-match');
  }
  // Stage 2: Reference Match
  for (const line of unmatchedLines) {
    const match = findReferenceMatch(line, parsedOrders);
    if (match) allocate(line, match, 'reference-match');
  }
  // Stage 3: Smart Qty Match
  for (const line of unmatchedLines) {
    const match = findSmartQtyMatch(line, parsedOrders);
    if (match) allocate(line, match, 'smart-qty');
  }
  // Stage 4: FIFO (oldest first)
  for (const line of unmatchedLines) {
    const match = fifoMatch(line, parsedOrders);
    if (match) allocate(line, match, 'fifo');
  }
}
```

> **Hinweis:** PROJ-20 Waterfall-4 wird durch PROJ-23 (Architecture Pivot) durch eine 3-Run Matching-Engine ersetzt. Der Waterfall bleibt als Referenz-Implementierung erhalten.
