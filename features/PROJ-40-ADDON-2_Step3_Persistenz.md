# PROJ-40 BUGFIX ADD-ON 2 — Step 3 Serial-Persistenz

**Datum:** 2026-03-03
**Status:** Planungsphase
**Betroffene Dateien:** nur `src/store/runStore.ts`

---

## Problem

Step 3 ("Serials geparst") schlägt bei "Neu verarbeiten" und nach Archiv-Reload stumm fehl:
1. `preFilteredSerials` wird nach Step 4 gelöscht (Z. 2489–2491)
2. `serialDocument` (PROJ-40 Persistenz-Fallback) wird beim Upload nie befüllt
3. Legacy-Pfad findet immer `serialDocument === null` → überspringt Step 3

---

## Lösung: 3 chirurgische Eingriffe (1 Datei)

### Fix A — Vorzeitiges Löschen entfernen
`runStore.ts:2489–2491` — 3 Zeilen entfernen. Bereinigung erfolgt über `clearUploadedFiles()` beim Run-Wechsel.

### Fix B — `serialDocument` beim Upload befüllen
`runStore.ts:624–644` — Nach `preFilterSerialExcel()` zusätzlich ein `SerialDocument` aus den `filteredRows` bauen (`PreFilteredSerialRow` → `SerialDocumentRow` Konvertierung) und per `set()` im Store ablegen. Damit greift die bestehende PROJ-40 Persistenz-Kette: Auto-Save → IndexedDB → `loadPersistedRun()`.

### Fix C — `consumed`-Flags vor Legacy-Matching zurücksetzen
`runStore.ts:3048–3049` — Vor `matcher.serialExtract()` alle `consumed`-Flags auf `false` resetten, damit rehydrierte Documents frisch zugewiesen werden.

---

## Nicht-Ziele
- `archiveService.ts` bleibt unangetastet
- Keine `async`-Umstellung
- Keine Änderung an `useRunAutoSave.ts`

---

## Verifikation
1. Normalfall: S/N korrekt via `preFilteredSerials`
2. "Neu verarbeiten": `preFilteredSerials` noch im Memory (Fix A)
3. Page-Reload: Legacy-Pfad mit `serialDocument` aus IndexedDB (Fix B)
4. Archiv-Load: `serialDocument` rehydriert + `consumed` frisch (Fix C)
5. Ohne serialList: Step 3 überspringt regulär
