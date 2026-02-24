# PROJ-19 — Stammdaten-Infrastruktur (Excel-Upload → IndexedDB → Matcher)

**Status:** Done
**Datum:** 2026-02-20
**Commit:** `1490d87` (zusammen mit PROJ-18)
**Baut auf:** PROJ-16, PROJ-18

---

## Ziel

Aufbau einer vollständigen Stammdaten-Pipeline: Excel-Datei hochladen → parsen → in IndexedDB persistieren → beim Cross-Matching automatisch verwenden.

---

## Umgesetzte Änderungen

### 1. `masterDataParser.ts` (NEU)
- XLSX-Parser via SheetJS (`xlsx`-Bibliothek).
- Schema-Alias-Filterung mit `FALMEC_SCHEMA`: Mappt verschiedene Spaltenbezeichnungen auf kanonische Felder.
- Collision-Resolver: Bei doppelten Artikel-Einträgen gewinnt die Zeile mit den meisten non-empty Zellen.
- Output: `ArticleMaster[]` Array.

### 2. `masterDataStore.ts` (NEU)
- Globaler Zustand für `ArticleMaster[]` (Zustand, kein runStore).
- IndexedDB-Persistenz: Stammdaten überleben Page-Reload.
- localStorage-Metadaten: `lastUpdated` Zeitstempel und `rowCount` für UI-Anzeige.
- Öffentliche API: `load()`, `set()`, `clear()`.

### 3. `runStore` — Integration
- `addUploadedFile()`: Triggert `parseMasterDataFile()` automatisch bei Upload einer Datei mit Type `articleList`.
- `executeMatcherCrossMatch()`: Liest Stammdaten nun aus `masterDataStore` (kein Parameter-Übergabe mehr). Emittiert `blocking`-Issue wenn Store leer ist.
- **Pre-Explosion Matching:** Matcher läuft ausschließlich auf kompakten Original-Positionen (nicht auf ~295 expandierten Zeilen). Ergebnis wird auf alle expandierten Zeilen gespread.

### 4. `App.tsx` — Boot-Hydration
- `masterDataStore.load()` beim App-Start aufgerufen → IndexedDB-Hydration beim Boot.

### 5. `package.json` — Neue Abhängigkeit
- `xlsx` (SheetJS) als neue Produktions-Abhängigkeit hinzugefügt.

### 6. UI-Fixes (parallel in PROJ-18 Commit enthalten)
- `ItemsTable.tsx`: Spalte `Art-# (DE)` verbreitert (`w-16` → `w-20`), `"Bezeichnung (DE)"` → `"Bezeichnung"`.
- `RunDetail.tsx` KPI-Grid: "Preise checken" und "Serial parsen" getauscht (Preise jetzt Position 3, Serial Position 4).

---

## Technische Details

**Neue Dateien:**

| Datei | Zweck |
|-------|-------|
| `src/services/masterDataParser.ts` | XLSX-Parser mit Schema-Alias-Filterung |
| `src/store/masterDataStore.ts` | Globaler Store für ArticleMaster[] mit IndexedDB |

**Modifizierte Dateien:**

| Datei | Änderung |
|-------|----------|
| `src/store/runStore.ts` | `addUploadedFile` + `executeMatcherCrossMatch` Integration |
| `src/App.tsx` | `masterDataStore.load()` beim Boot |
| `src/components/run-detail/ItemsTable.tsx` | Spaltenbreite + Umbenennung |
| `src/pages/RunDetail.tsx` | KPI-Grid Reihenfolge |
| `package.json` | xlsx als Dependency |

**Schema-Alias-System (`FALMEC_SCHEMA`):**
```typescript
// Beispiel: Verschiedene Spaltennamen → kanonisches Feld
{ canonical: 'artNoDE', aliases: ['Art-Nr. DE', 'ArtNoDE', 'Artikelnummer DE', ...] }
{ canonical: 'ean', aliases: ['EAN', 'EAN-Code', 'GTIN', ...] }
```

**Pre-Explosion Matching Pattern:**
```typescript
// Matcher läuft auf originale Positionen (~45)
const matchResults = matcher.run(originalPositions, masterData);
// Ergebnis wird auf expandierte Zeilen gespread
expandedLines.forEach(line => {
  line.matchResult = matchResults[line.positionIndex];
});
```
