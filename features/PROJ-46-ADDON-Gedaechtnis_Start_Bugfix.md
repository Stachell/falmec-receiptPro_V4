# PROJ-46 ADD-ON: "Gedächtnis-Start" Bugfix — Implementierungsdokumentation

**Datum:** 2026-03-14
**Status:** Done
**Bezug:** PROJ-46_3_NEW-RUN-KLICK-TO-MIND.md (Architekturplan v3, final)

---

## Überblick

Zwei kritische Bugs beim Start eines Runs aus dem "Gedächtnis" (IndexedDB) behoben, plus ein Defensive-Fix für die Ordnerstruktur-Prüfung.

---

## Fix A — masterDataStore Lazy Hydration Guard

**Datei:** `src/store/runStore.ts`
**Einfügepunkt:** Anfang des `try`-Blocks in `createNewRunWithParsing()`, vor dem Invoice-Parsing

**Problem:** `loadStoredFiles()` restauriert `uploadedFiles[]` aus IndexedDB, triggert aber keine erneute Artikel-Parser-Pipeline → `masterDataStore` bleibt leer → Step 2 crasht mit "Stammdaten fehlen".

**Lösung:** Idempotenter Guard prüft `articles.length === 0`. Wenn leer, wird `parseMasterDataFile(articleListFile.file)` awaited und `masterDataStore.save()` aufgerufen — bevor `updateRunWithParsedData()` den 500ms-Timer für Step 2 startet. Bei frischem Upload (`addUploadedFile` hat bereits gespeichert) ist `articles.length > 0` → Guard wird übersprungen.

```ts
const articleListFile = uploadedFiles.find(f => f.type === 'articleList');
if (articleListFile?.file && useMasterDataStore.getState().articles.length === 0) {
  try {
    set({ parsingProgress: 'Stammdaten laden...' });
    const result = await parseMasterDataFile(articleListFile.file);
    await useMasterDataStore.getState().save(result.articles, articleListFile.name);
    logService.info(`Stammdaten rehydriert: ${result.rowCount} Artikel aus '${articleListFile.name}'`, { step: 'Stammdaten' });
  } catch (err) {
    logService.error(`Stammdaten-Rehydrierung fehlgeschlagen: ...`, { step: 'Stammdaten' });
  }
}
```

**Garantien:**
- Liegt innerhalb des bestehenden `try/finally` → `isProcessing = false` wird immer zurückgesetzt
- Kein neuer Import nötig (`parseMasterDataFile` + `useMasterDataStore` bereits importiert)
- Frischer Upload-Flow 100% unberührt

---

## Fix B — Early Archive Pre-Flight Check (Rechte-Airbag)

**Datei:** `src/services/archiveService.ts`
**Einfügepunkt:** Allererste Zeile von `writeEarlyArchive()`, vor `generateArchiveFolderName()`
**Return-Typ:** `Promise<{ success: boolean; folderName: string; reason?: string }>` (optionales `reason`-Feld ergänzt)

**Problem:** Nach Reload ist `directoryHandle = null`. `writeEarlyArchive()` iterierte trotzdem über alle Dateien → N identische Warnungen im Log statt 1.

**Lösung:** `fileSystemService.hasWriteAccess()` (synchron, `!!this.directoryHandle`) als Pre-Flight. Kein Schreibzugriff → sofortiger Return `{ success: false, folderName: '', reason: 'no_permission' }` + 1 Info-Log-Eintrag.

**Regeln eingehalten:**
- `runStore.ts` an den Early-Archive-Stellen (Z.950-974, Z.1008-1035) **NICHT angefasst**
- Die `.then(if earlyResult.success)`-Blöcke im runStore ignorieren `success: false` korrekt
- `fileSystemService` war bereits importiert (kein neuer Import)
- Frischer Upload: `directoryHandle` gesetzt → normaler Flow

---

## Fix C — `ensureFolderStructure()` Defensive Catch

**Datei:** `src/pages/NewRun.tsx`
**Einfügepunkt:** Zeile 68 — `ensureFolderStructure().then(...)` erweitert um `.catch()`

**Problem:** Nach Reload ohne Dateisystem-Berechtigung konnte `ensureFolderStructure()` eine unhandled Promise rejection werfen.

**Lösung:** `.catch(err => logService.info(...))` ergänzt. Kein leerer Catch — aussagekräftiger Log-Eintrag.

---

## Veränderte Dateien

| Datei | Art | Zeilen |
|-------|-----|--------|
| `src/store/runStore.ts` | +20 Zeilen im try-Block | Hydration Guard |
| `src/services/archiveService.ts` | +9 Zeilen am Methodenkopf + Rückgabetyp | Pre-Flight Check |
| `src/pages/NewRun.tsx` | +5 Zeilen | `.catch()` an ensureFolderStructure |

**Nicht angefasst:** `runStore.ts` Archive-Stellen, `clearAllFiles()`, `loadStoredFiles()`, `masterDataStore.ts`, `fileStorageService.ts`, `fileSystemService.ts`

---

## TypeScript-Check

```
npx tsc --noEmit → 0 Errors
```
