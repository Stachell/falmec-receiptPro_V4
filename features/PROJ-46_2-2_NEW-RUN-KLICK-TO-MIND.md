# PROJ-46: "New Run Klick-to-Mind" — Architektur-Plan

## Context

Beim Start eines Runs aus dem "Gedächtnis" (IndexedDB) treten zwei kritische Bugs auf:

- **Bug A — Step-2-Crash:** `loadStoredFiles()` restauriert Dateien aus der IndexedDB und zeigt im UI "Grün", aber es wird kein Re-Parsing der Artikelstammdaten in den `masterDataStore` getriggert. Wenn `masterDataStore.load()` aus `App.tsx` scheitert, leer bleibt, oder langsam ist, crasht Step 2 mit "Stammdaten fehlen".

- **Bug B — Early Archive Log-Pollution:** Nach einem Reload ist `directoryHandle` null (Browser entzieht die Berechtigung). `writeEarlyArchive()` ruft `saveToArchive()` für jede Datei auf → jede prüft Permissions → loggt einzeln eine Warnung → N Warnungen im Log. Zudem: potentieller Workflow-Gefährdung durch unkontrollierte Error-Propagation.

---

## Fix A: masterDataStore-Hydrierung (Step-2-Crash)

### Root Cause

1. `loadStoredFiles()` (`runStore:744`) setzt `uploadedFiles[]` aus der IndexedDB, triggert aber **nicht** `parseMasterDataFile()` → `masterDataStore` bleibt leer
2. `addUploadedFile()` (`runStore:626`) parsed die `articleList` und speichert in `masterDataStore`, wird aber nur bei **frischem** User-Upload aufgerufen, nie bei Restore
3. `App.tsx:28` ruft `useMasterDataStore.getState().load()` fire-and-forget auf — wenn die masterData-IndexedDB leer/korrupt ist, hilft das nicht
4. Step 2 (`executeMatcherCrossMatch`, `runStore:3088`) liest `useMasterDataStore.getState().articles` → findet 0 Artikel → `'failed'`

### Fix-Strategie: Lazy Hydration Guard in `createNewRunWithParsing()`

**Ort:** `src/store/runStore.ts`, Funktion `createNewRunWithParsing()`, direkt nach Zeile 843 (nach dem Destructuring von `uploadedFiles`), **VOR** dem Invoice-Parsing.

**Logik:**

```ts
const articleListFile = uploadedFiles.find(f => f.type === 'articleList');

if (articleListFile?.file && useMasterDataStore.getState().articles.length === 0) {
  try {
    set({ parsingProgress: 'Stammdaten laden...' });
    const result = await parseMasterDataFile(articleListFile.file);
    await useMasterDataStore.getState().save(result.articles, articleListFile.name);
    logService.info(
      `Stammdaten rehydriert: ${result.rowCount} Artikel aus '${articleListFile.name}'`,
      { step: 'Stammdaten' }
    );
  } catch (err) {
    logService.error(
      `Stammdaten-Rehydrierung fehlgeschlagen: ${err instanceof Error ? err.message : err}`,
      { step: 'Stammdaten' }
    );
  }
}
```

### Warum dieser Ort?

- **Vor Step 2:** Hydration ist abgeschlossen, bevor `updateRunWithParsedData()` den 500ms-Timer für Step 2 startet
- **Awaited:** `createNewRunWithParsing` ist bereits `async` — das `await` blockiert den Flow bis die Hydration fertig ist
- **Idempotent:** `articles.length === 0` verhindert doppeltes Parsing bei frischem Upload (`addUploadedFile` hat bereits gespeichert)
- **Im try/finally:** Der bestehende `try/finally`-Block (`runStore:904`) garantiert `isProcessing = false`-Reset auch bei Hydration-Fehlern
- **Kein Eingriff in addUploadedFile:** Der frische Upload-Flow bleibt 100% unberührt

### Betroffene Dateien

- `src/store/runStore.ts` — ~10 Zeilen einfügen nach Zeile 843

---

## Fix B: Early Archive Graceful Fail (Rechte-Airbag)

### Root Cause

1. Nach Reload: `directoryHandle = null` in `fileSystemService.ts:23`
2. `archiveService.writeEarlyArchive()` ruft `fileSystemService.saveToArchive()` für jede Datei auf
3. Jeder Aufruf: `checkPermission()` → `false` → `logService.warn("Keine Schreibberechtigung...")` → `return false`
4. Ergebnis: **N identische Warnungen** im Log (Rechnung-PDF, metadata.json, etc.)
5. Der `.catch()` in runStore (Zeile 969) fängt nur echte Exceptions, nicht die leisen Failures

### Fix-Strategie: Pre-Flight-Check in `runStore.ts`

**Ort:** `src/store/runStore.ts`, vor den beiden `archiveService.writeEarlyArchive()`-Aufrufen (Zeilen 951-974 und 1009-1035).

**Vorhandene API nutzen:** `fileSystemService.hasWriteAccess()` (`fileSystemService.ts:290`) — synchron, gibt `!!this.directoryHandle` zurück.

**Logik (zwei Stellen identisch):**

```ts
if (earlyRun) {
  const capturedRunId = runId;

  // PRE-FLIGHT: Prüfe ob Dateisystem-Handle existiert (nach Reload: null)
  if (!fileSystemService.hasWriteAccess()) {
    logService.info('Early Archive übersprungen: Keine Dateisystem-Rechte (Seite wurde neu geladen)', {
      runId: capturedRunId, step: 'Archiv',
    });
  } else {
    archiveService.writeEarlyArchive(earlyRun, uploadedFiles, globalConfig)
      .then(earlyResult => {
        if (earlyResult.success) {
          set((state) => ({
            runs: state.runs.map(r =>
              r.id === capturedRunId ? { ...r, archivePath: earlyResult.folderName } : r
            ),
            currentRun: state.currentRun?.id === capturedRunId
              ? { ...state.currentRun, archivePath: earlyResult.folderName }
              : state.currentRun,
          }));
          logService.info(`Early Archive erstellt: ${earlyResult.folderName}`, {
            runId: capturedRunId, step: 'Archiv',
          });
        }
      })
      .catch(err => {
        logService.warn(
          `Early Archive fehlgeschlagen: ${err instanceof Error ? err.message : err}`,
          { runId: capturedRunId, step: 'Archiv' }
        );
      });
  }
}
```

### Warum Pre-Flight statt try/catch?

- **1 Log-Eintrag statt N:** Verhindert N identische Warnungen (eine pro Datei)
- **Kein archiveService-Aufruf:** `archiveService.ts` wird **nicht** angefasst (Ausschlussregel!)
- **Synchron:** `hasWriteAccess()` ist synchron — kein async-Overhead
- **Frischer Upload unberührt:** Bei frischem Upload ist `directoryHandle` gesetzt → normaler Flow
- **Bestehender .catch() bleibt:** Für echte Exceptions im Normalbetrieb

### Betroffene Dateien

- `src/store/runStore.ts` — 2 Stellen modifizieren (Zeilen 951-974 und 1009-1035): `if/else` um bestehenden Code

---

## Zusätzlich: `ensureFolderStructure()`-Absicherung in `NewRun.tsx`

**Ort:** `src/pages/NewRun.tsx`, Zeile 68

**Aktuell:**

```ts
fileSystemService.ensureFolderStructure().then(structureReady => { ... });
```

**Fix:** `.catch()` hinzufügen:

```ts
fileSystemService.ensureFolderStructure()
  .then(structureReady => {
    if (!structureReady) {
      logService.warn('Ordnerstruktur konnte nicht verifiziert werden', { step: 'System' });
    }
  })
  .catch(() => {
    // Silently ignore — no directory handle after reload is expected
  });
```

### Betroffene Dateien

- `src/pages/NewRun.tsx` — 1 Stelle, `.catch()` hinzufügen

---

## Zusammenfassung der Änderungen

| Datei | Änderung | Zeilen |
|-------|----------|--------|
| `src/store/runStore.ts` | Hydration Guard einfügen nach Z.843 | ~10 neue Zeilen |
| `src/store/runStore.ts` | Pre-Flight `if/else` um Early Archive (2×) | Z.951-974, Z.1009-1035 |
| `src/pages/NewRun.tsx` | `.catch()` an `ensureFolderStructure()` | Z.68 |

**NICHT angefasst:** `archiveService.ts`, `clearAllFiles()`, `loadStoredFiles()`, `masterDataStore.ts`, `fileStorageService.ts`

---

## Verifikation

1. **TypeScript-Check:** `npx tsc --noEmit` — 0 Errors
2. **Test Bug A:** Browser öffnen → Dateien hochladen → Reload (F5) → NewRun → "Verarbeitung starten" → Step 2 muss grün durchlaufen (Artikel gefunden)
3. **Test Bug B:** Browser öffnen → Ordner konfigurieren → Reload (F5) → Run starten → Log muss genau **1** Info-Eintrag zeigen: "Early Archive übersprungen: Keine Dateisystem-Rechte"
4. **Regression frischer Upload:** Alle 4 Dateien frisch hochladen → Run starten → Step 1-5 müssen exakt wie bisher funktionieren inkl. Early Archive auf Platte

---

## Nützliche Hinweise für Sonnet bei der Durchführung des Plans um Fehler zu vermeiden

### 1. ArrayBuffer → File Konversion (bereits gelöst!)

`fileStorageService.loadAllFiles()` (`fileStorageService.ts:162-209`) rekonstruiert automatisch ein `File`-Objekt aus dem gespeicherten ArrayBuffer:

```ts
const blob = new Blob([storedFile.data], { type: storedFile.mimeType });
const file = new File([blob], storedFile.name, { type: storedFile.mimeType, ... });
```

Das `uploadedFiles[].file`-Property ist nach `loadStoredFiles()` also ein vollwertiges `File`-Objekt. `parseMasterDataFile(file: File)` aus `@/services/masterDataParser` akzeptiert es direkt — kein manueller ArrayBuffer→File-Umbau nötig!

### 2. Race-Condition: Step 2 darf ERST starten, wenn masterDataStore hydriert ist

Warum der gewählte Ort sicher ist:

1. `createNewRunWithParsing()` ist `async` (`runStore:841`)
2. Der Hydration Guard mit `await parseMasterDataFile(...)` und `await ...save(...)` blockiert den Funktionsfluss
3. `updateRunWithParsedData()` wird NACH dem Guard aufgerufen (frühestens Zeile 915)
4. Der 500ms-Timer für Step 2 wird in `updateRunWithParsedData()` gestartet (ca. Zeile 1397)
5. Zeitliche Kette: **Hydration Guard → Invoice Parse → updateRunWithParsedData → 500ms → Step 2**
6. Step 2 kann **unmöglich** vor der Hydration starten

> **Kritischer Fehler zu vermeiden:** Den Guard NIEMALS nach `updateRunWithParsedData()` platzieren! Der 500ms-Timer läuft dann bereits und Step 2 könnte vor der Hydration starten.

### 3. Import von `parseMasterDataFile`

`parseMasterDataFile` wird bereits in `runStore.ts` importiert (für `addUploadedFile`). Prüfe, ob der Import schon existiert:

```ts
import { parseMasterDataFile } from '@/services/masterDataParser';
```

Falls ja: kein neuer Import nötig. Falls nein (es könnte ein dynamischer Import sein): statischen Import hinzufügen.

### 4. try/catch des Early Archive — NICHT den äusseren try/finally sprengen

Der Hydration Guard kommt **innerhalb** des bestehenden `try` (Zeile 904) / `finally` (ca. Zeile 1095) Blocks. Der Early Archive Pre-Flight ist **ausserhalb** des try — er ist fire-and-forget mit eigenem `.then()`/`.catch()`. **Finger weg vom äusseren try/finally!**

### 5. Zwei identische Early-Archive-Stellen

Es gibt **zwei** identische Fire-and-Forget-Blöcke für `writeEarlyArchive`:

1. **Stelle 1:** Zeile 950-974 (Success-Path: `parseSuccess && parsedInvoiceResult`)
2. **Stelle 2:** Zeile 1008-1035 (Partial-Success-Path: `parsedInvoiceResult` ohne `parseSuccess`)

**Beide** müssen den Pre-Flight-Check bekommen! Vergiss nicht die zweite Stelle.

### 6. `fileSystemService` Import prüfen

`fileSystemService` wird möglicherweise noch nicht in `runStore.ts` importiert (das Early Archive geht über `archiveService`). Prüfe ob ein Import existiert. Falls nicht:

```ts
import { fileSystemService } from '@/services/fileSystemService';
```

### 7. `parsingProgress` zurücksetzen

Der Hydration Guard setzt `parsingProgress: 'Stammdaten laden...'`. Das wird automatisch vom nachfolgenden `set({ parsingProgress: 'Lese PDF...' })` (Zeile 908) überschrieben. Kein manuelles Reset nötig.

### 8. Keine Doppel-Hydrierung bei frischem Upload

Bei einem frischen Upload passiert:

1. User lädt `articleList` hoch → `addUploadedFile()` → `parseMasterDataFile()` → `masterDataStore.save()` (fire-and-forget)
2. User klickt "Verarbeitung starten" → `createNewRunWithParsing()`
3. Hydration Guard prüft `articles.length === 0` → **FALSE** (addUploadedFile hat bereits gespeichert)
4. Guard wird übersprungen → kein doppeltes Parsing

**Edge Case:** Wenn `addUploadedFile`s fire-and-forget-Save noch nicht abgeschlossen ist und der User sofort klickt, könnte `articles.length` noch 0 sein. In diesem Fall parsed der Guard nochmal → kein Problem, `masterDataStore.save()` überschreibt idempotent mit denselben Daten.
