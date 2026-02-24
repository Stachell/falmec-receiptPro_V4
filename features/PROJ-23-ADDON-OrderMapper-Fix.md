# PROJ-23-ADDON: OrderMapper Fix

## Status: IN PROGRESS
## Datum: 2026-02-23

---

## Problem

Der OrderMapper (Step 4) schlaegt stumm fehl (0 Zuteilungen).

**Ursache 1:** `buildOrderPool()` in `orderPool.ts` filtert Excel-Bestellungen AUSSCHLIESSLICH nach `artNoDE` gegen `falmecArticleNo`. Wenn dieser eine Wert nicht matcht, wird die Bestellung verworfen — selbst wenn `artNoIT` und `ean` perfekt uebereinstimmen.

**Ursache 2:** Die internen IDs (`waterfall-4`, `legacy-3`) sind historisch falsch benannt.

---

## Task 1: RADIKALES UM-BENENNEN (UI & State)

**Ziel:** Etikettenschwindel beenden.

| Alt | Neu (ID) | Neu (UI-Label) |
|-----|----------|----------------|
| `waterfall-4` | `engine-proj-23` | PROJ-23 (3-Run Engine) |
| `legacy-3` | `legacy-waterfall-4` | Legacy (Veraltet) |

**Betroffene Dateien:**
- `src/store/runStore.ts` — Default-Wert (Z.518), 3 Branch-Points (Z.1458, 1617, 1854), Kommentar (Z.2222)
- `src/components/SettingsPopup.tsx` — Default + Options-Array (Z.313-316)
- `src/data/mockData.ts` — 3 Mock-Configs (Z.23, 66, 109)
- `src/types/index.ts` — Kommentar (Z.148)
- `features/*.md` — 4 Doku-Dateien

---

## Task 2: SMART POOL FILTER ("2 von 3" Per-Artikel-Scoring)

**Datei:** `src/services/matching/orderPool.ts` — `buildOrderPool()`

### Algorithmus:

1. **Eindeutige Rechnungsartikel-Tripel sammeln** (falmecArticleNo, manufacturerArticleNo, ean)
   - Dedupliziert nach `falmecArticleNo` (lowercase)
   - Original-Case-Mapping: `falmecOriginalCase: Map<lowercase, original>`

2. **Per-Artikel-Scoring** (KEIN Frankenstein-Match!):
   - Fuer jede Excel-Bestellung: innere Schleife ueber alle Rechnungsartikel
   - Score 1 Punkt pro non-empty Match: artNoDE↔falmecArticleNo, artNoIT↔manufacturerArticleNo, ean↔ean
   - Alle Punkte muessen vom SELBEN Rechnungsartikel stammen
   - Score >= 2 → Match, Break

3. **Korrekter Pool-Key:**
   - `byArticle` Map-Key = `falmecArticleNo` des gematchten Rechnungsartikels (Original-Case)
   - `order.artNoDE` wird auf den groupKey aktualisiert (Auto-Heal)
   - MatchingEngine Run 1/2/3 findet die Bestellung unter dem richtigen Key

### Design-Garantien:
- Kein Cross-Artikel-Match (Frankenstein verhindert)
- Leere Strings generieren NIE Score-Punkte
- Case-insensitive Vergleich, Original-Case im Map-Key
- First-Match-Wins bei mehreren passenden Rechnungsartikeln

---

## Task 3: ANTI-SILENT-FAILURE ("Leerer Pool"-Falle)

**Dateien:** `src/types/index.ts`, `src/store/runStore.ts`

### 3a: Neuer IssueType
- `'pool-empty-mismatch'` zur IssueType-Union hinzufuegen

### 3b: Guard in executeOrderMapping
- WENN `poolResult.pool.totalRemaining === 0` UND `parsedOrders.length > 0`:
  - Issue erstellen: Typ `pool-empty-mismatch`, Severity `error`
  - Message: "Excel gelesen, aber keine Position erreicht den 2-von-3 Match-Score."
  - Step 4 → `failed`
  - MatchingEngine wird NICHT gestartet (early return)

---

## Task 4: ERWEITERTES LOGGING (Telemetry)

**Dateien:** `src/store/runStore.ts`, `src/services/matching/orderPool.ts`

Logge zwingend (via logService.info):
1. Wieviele ParsedOrderPositions aus der Excel kamen
2. Wieviele davon den "2 von 3" Filter ueberlebt haben
3. Die finale Groesse des OrderPools VOR Run 1

---

## Ausfuehrungsreihenfolge

1. Task 1 — Rename IDs
2. Task 3a — IssueType registrieren
3. Task 2 — Pool-Filter umbauen (Kern-Fix)
4. Task 3b — Empty-Pool-Guard einfuegen
5. Task 4 — Logging upgraden

## Verifikation

- [ ] `tsc --noEmit` — 0 Fehler
- [ ] Settings-Dropdown: "PROJ-23 (3-Run Engine)" + "Legacy (Veraltet)"
- [ ] Console-Log: `[OrderPool] 2-of-3 per-article filter:` mit Telemetrie
- [ ] Bei leerem Pool: Issue `pool-empty-mismatch` sichtbar
- [ ] Bestehende Tests grueen
