# PROJ-16: ETL-Pipeline & S/N-Verifizierung

**Status:** In Progress
**Priorität:** High
**Voraussetzung:** PROJ-14 (Parser-Modularisierung), PROJ-15 (Run-Detail Fixes)

## Beschreibung
Modulares Matcher-System (analog ParserRegistry) für Step 2 (Cross-Match) und Step 3 (S/N-Extraktion). Erste Implementierung: `FalmecMatcher_Master`. Legacy `ArticleMatcher.ts` wird komplett ersetzt.

---

## Roadmap

### Phase A: Neue Dateistruktur
- [x] `src/services/matchers/` Verzeichnis anlegen
- [x] `types.ts`, `index.ts`, `matcherRegistryService.ts`, `modules/FalmecMatcher_Master.ts`

### Phase B: Interface-Design (`matchers/types.ts`)
- [x] `MatcherModule` Interface (Kern-Contract)
- [x] `SchemaDefinition` + `SchemaFieldDef` (Feld-Mapping mit Aliases)
- [x] `CrossMatchResult` (Step 2 Output)
- [x] `SerialDocument` + `SerialExtractionResult` (Step 3)
- [x] `MatcherConfig`, `MatcherWarning`
- [x] `IssueType` um `'conflict'` erweitert

### Phase C: FalmecMatcher_Master
- [x] Schema (Falmec-spezifische Aliases für 6 Felder)
- [x] `crossMatch()`: Normalisierung (`trim().toUpperCase()` BEIDE Seiten), ArtNo+EAN Match, CONFLICT-Erkennung, Preis-Check
- [x] `serialExtract()`: Invoice-Ref-Suche, Regex `/K[0-2][0-9]{10}K/`, Zuweisung, Checksumme
- [x] Pre-indexed Maps für O(1) Lookups (byArtNo, byEan)

### Phase D: Registry + Router
- [x] `matchers/index.ts` — Registry Map, `getMatcher()`, `getAllMatchers()`, `findMatcherForArticles()`
- [x] `matcherRegistryService.ts` — Singleton, Disk-Persistenz, Boot-Validation

### Phase E: Store-Integration (`runStore.ts`)
- [x] `executeMatcherCrossMatch()` als neue Action (nutzt aktives Matcher-Modul)
- [x] `executeMatcherSerialExtract()` (NEU: Step 3 via Matcher-Modul)
- [x] `serialDocument` State-Feld hinzugefügt
- [x] Auto-Advance Chain: Step 1 → Step 2 (crossMatch) → Step 3 (serialExtract) → Step 4
- [x] RunDetail: Retry-Button nutzt `executeMatcherCrossMatch` statt `executeArticleMatching`

### Phase F: UI-Anpassungen
- [x] Matcher-Dropdown in AppFooter (analog Parser-Dropdown)
- [x] Matcher-Registry-Init + Boot-Validation in AppFooter
- [x] Settings-UI: Aktiver Matcher (read-only) + Schema-Aliases (Tag-Display)
- [x] ItemsTable: Dynamische Icons (Barcode/Type) bei EAN-/ArtNo-Match
- [x] ItemsTable: S/N-Spalte mit Text + Status-Quadrat (schwarz/grau/grün) + Hover-Tooltip
- [x] KPI-Tile "Serial parsen" zeigt `serialMatchedCount` (via Stats-Store, automatisch)

---

## Status-Legende
- [ ] Todo
- [x] Done
- [~] In Progress
