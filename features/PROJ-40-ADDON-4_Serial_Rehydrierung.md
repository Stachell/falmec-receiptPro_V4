# PROJ-40-ADDON-4: Serial Rehydrierung Bugfix

## Context

Nach Reload, "Neu verarbeiten" oder Archiv-Laden verliert Kachel 4 ("Serials geparst") ihre Daten, obwohl die Serial-Daten in IndexedDB gespeichert sind. Zwei Bugs:

1. **Kernproblem:** `preFilteredSerials` ist als "MEMORY ONLY" markiert und wird nie persistiert. Nach Reload bleibt es `[]`, Step 3 überspringt den SerialFinder-Pfad (Path A) und fällt auf den Legacy-Matcher zurück — der aber nicht dieselben Ergebnisse liefert.
2. **UI-Inkonsistenz:** Kachel 4 zeigt qty-basierte Werte (aus `invoiceLines`), aber der Variant/Border-Check nutzt line-count-basierte `stats`-Felder. Das kann zu optischen Widersprüchen führen.

---

## Fix 1: `preFilteredSerials` persistieren & rehydrieren

### Step 1 — PersistedRunData erweitern
**Datei:** `src/services/runPersistenceService.ts`

- Import `PreFilteredSerialRow` aus `@/types` hinzufügen (Zeile 15-22)
- Neues optionales Feld in `PersistedRunData` nach Zeile 46 (`runLog`):
  ```typescript
  preFilteredSerials?: PreFilteredSerialRow[];  // PROJ-40: S/N-Rehydrierung
  ```

### Step 2 — Auto-Save Payload erweitern
**Datei:** `src/hooks/buildAutoSavePayload.ts`

- Nach Zeile 45 (`serialDocument`) hinzufügen:
  ```typescript
  preFilteredSerials: current.preFilteredSerials.length > 0
    ? current.preFilteredSerials : undefined,
  ```

### Step 3 — `loadPersistedRun` Rehydrierung
**Datei:** `src/store/runStore.ts`, Zeile ~3319

- Im `set()` Return-Objekt nach `serialDocument` hinzufügen:
  ```typescript
  preFilteredSerials: data.preFilteredSerials ?? [],  // PROJ-40: S/N-Rehydrierung
  ```

### Step 4 — Kommentar-Update
**Datei:** `src/store/runStore.ts`

- Zeile 385: Kommentar ändern zu `// PROJ-20: Pre-filtered serial rows — persisted to IndexedDB since PROJ-40`
- Zeile 517: Gleicher Kommentar-Update

---

## Fix 2: Kachel 4 Variant harmonisieren

### Step 5 — `kachel4Variant` auf qty-basiert umstellen
**Datei:** `src/pages/RunDetail.tsx`, Zeilen 156-161

**Alt:**
```typescript
const kachel4Variant = (
  currentRun && currentRun.stats.serialMatchedCount >= currentRun.stats.serialRequiredCount
    && currentRun.stats.serialRequiredCount > 0
    ? 'success' as const
    : 'default' as const
);
```

**Neu:**
```typescript
const kachel4Variant = (
  serialMatchedQtySum >= serialRequiredQtySum
    && serialRequiredQtySum > 0
    ? 'success' as const
    : 'default' as const
);
```

Nutzt dieselben qty-Memos (`serialMatchedQtySum` Z.115, `serialRequiredQtySum` Z.87) wie der Anzeigewert — keine neuen Dependencies nötig.

---

## Betroffene Dateien (Zusammenfassung)

| Datei | Änderung |
|---|---|
| `src/services/runPersistenceService.ts` | Import + neues Feld `preFilteredSerials` |
| `src/hooks/buildAutoSavePayload.ts` | `preFilteredSerials` in Payload aufnehmen |
| `src/store/runStore.ts` | Rehydrierung in `loadPersistedRun` + Kommentar-Updates |
| `src/pages/RunDetail.tsx` | `kachel4Variant` auf qty-basiert umstellen |

## Rückwärtskompatibilität

- Alte Runs ohne `preFilteredSerials` in IndexedDB → `?? []` Fallback → Legacy-Matcher greift wie bisher
- Kein IndexedDB-Schema-Migration nötig (optionales Feld in JSON)
- Keine Änderungen an `archiveService.ts`, `clearAllFiles()`, `loadStoredFiles()`

## Verifikation

1. `npx tsc --noEmit` → 0 Errors
2. Serial-Excel hochladen → Step 3 (Path A) → Kachel 4 grün ✓
3. Seite reload → `preFilteredSerials` aus IndexedDB restauriert → Kachel 4 weiterhin korrekt ✓
4. Run aus Archiv-Liste laden → gleicher Check ✓
5. Alt-persistierter Run (ohne `preFilteredSerials`) → Legacy-Fallback, kein Crash ✓
6. Kachel 4 Border-Farbe stimmt mit Zahlenwerten überein ✓

---

## Implementierung abgeschlossen — 2026-03-08

Alle 5 Schritte des Plans buchstabengetreu umgesetzt. `npx tsc --noEmit` → **0 Errors**.

### Geänderte Dateien

| Datei | Änderung |
|---|---|
| `src/services/runPersistenceService.ts` | `PreFilteredSerialRow` Import + `preFilteredSerials?` in `PersistedRunData` |
| `src/hooks/buildAutoSavePayload.ts` | `preFilteredSerials` in Payload aufgenommen (nur wenn > 0) |
| `src/store/runStore.ts` | Rehydrierung in `loadPersistedRun` (`data.preFilteredSerials ?? []`) + zwei Kommentare auf "persisted to IndexedDB since PROJ-40" aktualisiert |
| `src/pages/RunDetail.tsx` | `kachel4Variant` auf qty-basierte Memos umgestellt (`serialMatchedQtySum >= serialRequiredQtySum`) |
