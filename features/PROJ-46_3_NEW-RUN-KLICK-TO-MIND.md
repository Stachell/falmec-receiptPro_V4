# PROJ-46: "New Run Klick-to-Mind" — Architektur-Plan (v3, final)

## Context

Beim Start eines Runs aus dem "Gedächtnis" (IndexedDB) treten zwei kritische Bugs auf:

- **Bug A — Step-2-Crash:** `loadStoredFiles()` restauriert Dateien aus der IndexedDB und zeigt im UI "Grün", aber es wird kein Re-Parsing der Artikelstammdaten in den `masterDataStore` getriggert. Wenn `masterDataStore.load()` aus `App.tsx` scheitert, leer bleibt, oder langsam ist, crasht Step 2 mit "Stammdaten fehlen".

- **Bug B — Early Archive Log-Pollution:** Nach einem Reload ist `directoryHandle` null (Browser entzieht die Berechtigung). `writeEarlyArchive()` ruft `saveToArchive()` für jede Datei auf → jede prüft Permissions → loggt einzeln eine Warnung → N Warnungen im Log. Zudem: potentielle Workflow-Gefährdung durch unkontrollierte Error-Propagation.

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

### Fix-Strategie: Pre-Flight-Check DIREKT in `archiveService.writeEarlyArchive()`

**Ort:** `src/services/archiveService.ts`, Funktion `writeEarlyArchive()` (Zeile 136-213), als **allererstes** vor `generateArchiveFolderName()`.

**Vorhandene API nutzen:** `fileSystemService.hasWriteAccess()` (`fileSystemService.ts:290`) — synchron, gibt `!!this.directoryHandle` zurück. Ist bereits in `archiveService.ts` importiert (Zeile 4).

**Logik (am Anfang der Methode, vor Zeile 141):**

```ts
async writeEarlyArchive(
  run: Run,
  uploadedFiles: { type: string; file: File; name: string }[],
  config: RunConfig
): Promise<{ success: boolean; folderName: string; reason?: string }> {
  // PRE-FLIGHT: Dateisystem-Handle vorhanden? (nach Reload: null)
  if (!fileSystemService.hasWriteAccess()) {
    logService.info(
      'Early Archive übersprungen: Keine Dateisystem-Rechte (Seite wurde neu geladen)',
      { runId: run.id, step: 'Archiv' }
    );
    return { success: false, folderName: '', reason: 'no_permission' };
  }

  const runId = run.id;
  // ... rest der bestehenden Methode unverändert ...
```

### Warum Pre-Flight IN archiveService statt in runStore?

- **DRY:** 1 Check an 1 Stelle statt identische `if/else`-Blöcke an 2 Stellen im runStore
- **KISS:** `runStore.ts` bleibt an den Early-Archive-Aufrufstellen (Z.950-974 und Z.1008-1035) **völlig unverändert**
- **1 Log-Eintrag statt N:** Die Methode returnt sofort — kein `saveToArchive()` wird aufgerufen, keine N Einzelwarnungen
- **Sanfter Return:** `{ success: false, reason: 'no_permission' }` — die `.then()`-Blöcke im runStore prüfen bereits `if (earlyResult.success)` und ignorieren den Fall `success: false` korrekt
- **Bestehende .catch() im runStore bleibt:** Fängt weiterhin echte Exceptions (Disk voll, etc.) im Normalbetrieb
- **Frischer Upload unberührt:** Bei frischem Upload ist `directoryHandle` gesetzt → normaler Flow

### Betroffene Dateien

- `src/services/archiveService.ts` — 7 Zeilen einfügen am Anfang von `writeEarlyArchive()` (vor Zeile 141), Return-Typ um `reason?: string` erweitern
- `src/store/runStore.ts` — **KEINE Änderung** an den Early-Archive-Stellen

---

## Fix C: `ensureFolderStructure()`-Absicherung in `NewRun.tsx`

**Ort:** `src/pages/NewRun.tsx`, Zeile 68-72

**Aktuell:**

```ts
fileSystemService.ensureFolderStructure().then(structureReady => {
  if (!structureReady) {
    logService.warn('Ordnerstruktur konnte nicht verifiziert werden', { step: 'System' });
  }
});
```

**Fix:** `.catch()` mit aussagekräftigem Logging hinzufügen:

```ts
fileSystemService.ensureFolderStructure()
  .then(structureReady => {
    if (!structureReady) {
      logService.warn('Ordnerstruktur konnte nicht verifiziert werden', { step: 'System' });
    }
  })
  .catch(err => {
    logService.info(
      `Ordnerstruktur-Prüfung übersprungen: ${err instanceof Error ? err.message : 'Keine Berechtigung'}`,
      { step: 'System' }
    );
  });
```

### Betroffene Dateien

- `src/pages/NewRun.tsx` — 1 Stelle, `.catch()` mit `logService.info` hinzufügen

---

## Zusammenfassung der Änderungen

| Datei | Änderung | Zeilen |
|-------|----------|--------|
| `src/store/runStore.ts` | Hydration Guard einfügen nach Z.843 | ~10 neue Zeilen |
| `src/services/archiveService.ts` | Pre-Flight-Check in `writeEarlyArchive()` | ~7 Zeilen am Methodenkopf |
| `src/pages/NewRun.tsx` | `.catch()` mit Logging an `ensureFolderStructure()` | Z.68-72 |

**NICHT angefasst:** `runStore.ts` an den Early-Archive-Stellen (Z.950-974, Z.1008-1035), `clearAllFiles()`, `loadStoredFiles()`, `masterDataStore.ts`, `fileStorageService.ts`, `fileSystemService.ts`

---

## Kreuzverhör & Confidence-Wert

### Abgleich gegen Diagnose-Berichte

| Diagnose-Befund | Plan-Abdeckung |
|-----------------|----------------|
| **PROJ-46-2 Phase 2:** "State-Entkopplungsfehler zwischen Upload-Indikator und Matcher-Datenquelle" | Fix A: Hydration Guard stellt `masterDataStore.articles` sicher bevor Step 2 startet |
| **PROJ-46-2 Phase 2:** "`loadStoredFiles()` setzt nur `uploadedFiles`, triggert aber KEINE erneute Artikel-Parser-Pipeline" | Fix A: Guard in `createNewRunWithParsing()` parsed articleList nach, wenn `articles.length === 0` |
| **PROJ-46-2 Phase 2:** "Boot-Hydration der Stammdaten läuft asynchron in `App.tsx` und wird nicht auf Run-Start synchronisiert" | Fix A: Guard ist `await`-basiert — blockiert den Flow bis Hydration fertig |
| **PROJ-46-2 Phase 1:** "Early Archive ist laut Doku NICHT tot" | Fix B: Early Archive bleibt aktiv, wird nur bei fehlenden Rechten sanft übersprungen |
| **PROJ-46-1:** "Preislogik liegt fachlich in Step 2, nicht sauber dort, wo der Prompt sie teilweise verortet" | Kein Widerspruch — Fix A sichert Step-2-Datenquelle, nicht die Preislogik |

### Abgleich gegen SOLL-Vorstellung

| SOLL | Erfüllt? |
|------|----------|
| Unverwüstlicher Workflow bei Start aus Gedächtnis | Ja — Hydration Guard + sanfter Archive-Fail |
| Kein Step-2-Crash bei leeren Stammdaten | Ja — `articles.length === 0` → Re-Parse vor Step 2 |
| 1 Log-Eintrag statt N bei fehlenden Rechten | Ja — Pre-Flight in `writeEarlyArchive()` returnt sofort |
| Keine leeren `.catch(() => {})` | Ja — `logService.info` mit Fehlerbeschreibung |
| DRY: Kein duplizierter Code | Ja — 1 Check in archiveService statt 2× in runStore |
| KISS: runStore bleibt schlank | Ja — runStore unverändert an Archive-Stellen |
| Frischer Upload-Flow unberührt | Ja — Guard ist idempotent (`articles.length === 0`), Archive hat Rechte |

### Confidence-Wert: **95%**

**Begründung der 5% Abzug:**

- **2% — Edge Case `parseMasterDataFile` mit rekonstruiertem File:** `fileStorageService.loadAllFiles()` baut Files aus `ArrayBuffer` → `Blob` → `new File()` auf. Das ist laut Diagnose-Bericht getestet und funktioniert. Minimales Restrisiko bei korrupten IndexedDB-Einträgen → wird vom `try/catch` im Guard gefangen, aber Step 2 würde dann trotzdem "failed" melden (korrektes Verhalten, aber nicht "grün").
- **2% — Timing-Fenster bei `masterDataStore.save()`:** `save()` schreibt async in IndexedDB. Wenn `save()` erfolgreich returnt, sind die Artikel im In-Memory-Store (`set()` ist synchron). Das IndexedDB-Write ist fire-and-forget. Risiko: Bei sofortigem Browser-Crash nach `save()` aber vor IndexedDB-Write wäre der nächste Reload wieder leer → gleicher Guard greift erneut.
- **1% — Return-Typ-Erweiterung `reason?: string`:** Optional-Property, bricht keine bestehenden Caller. Minimalstes TypeScript-Risiko.

---

## Verifikation

1. **TypeScript-Check:** `npx tsc --noEmit` — 0 Errors
2. **Test Bug A:** Browser öffnen → Dateien hochladen → Reload (F5) → NewRun → "Verarbeitung starten" → Step 2 muss grün durchlaufen (Artikel gefunden). Im Log: `"Stammdaten rehydriert: X Artikel aus 'dateiname.xlsx'"`
3. **Test Bug B:** Browser öffnen → Ordner konfigurieren → Reload (F5) → Run starten → Log muss genau **1** Info-Eintrag zeigen: `"Early Archive übersprungen: Keine Dateisystem-Rechte (Seite wurde neu geladen)"`
4. **Regression frischer Upload:** Alle 4 Dateien frisch hochladen (kein Reload) → Run starten → Step 1-5 müssen exakt wie bisher funktionieren inkl. Early Archive auf Platte
5. **Test Fix C:** Reload → Run starten → Log zeigt `"Ordnerstruktur-Prüfung übersprungen"` statt unhandled Promise rejection

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

`parseMasterDataFile` ist bereits in `runStore.ts` importiert (Zeile 25):

```ts
import { parseMasterDataFile } from '@/services/masterDataParser';
```

**Kein neuer Import nötig.** Ebenso ist `useMasterDataStore` bereits importiert (für Step-2-Logik).

### 4. try/catch-Struktur — NICHT den äußeren try/finally sprengen

Der Hydration Guard kommt **innerhalb** des bestehenden `try` (Zeile 904) / `finally` (ca. Zeile 1095) Blocks in `runStore.ts`. Er hat seinen eigenen inneren `try/catch`, der Hydration-Fehler abfängt, ohne den äußeren Flow zu unterbrechen. **Finger weg vom äußeren try/finally!**

### 5. Fix B: NUR `archiveService.ts` anfassen, NICHT `runStore.ts`

Der Pre-Flight-Check gehört **ausschließlich** in `archiveService.writeEarlyArchive()`:
- **Einfügepunkt:** Am Anfang der Methode, VOR `generateArchiveFolderName()` (vor Zeile 141)
- **Return-Typ erweitern:** `Promise<{ success: boolean; folderName: string; reason?: string }>`
- **`runStore.ts` Zeilen 950-974 und 1008-1035 bleiben unangetastet!**
- Die `.then()`-Blöcke im runStore prüfen bereits `if (earlyResult.success)` — bei `success: false` passiert einfach nichts (korrekt)
- Die `.catch()`-Blöcke im runStore fangen weiterhin echte Exceptions

### 6. `fileSystemService` Import in `archiveService.ts`

`fileSystemService` ist bereits in `archiveService.ts` importiert (Zeile 4):

```ts
import { fileSystemService } from './fileSystemService';
```

**Kein neuer Import nötig.**

### 7. `parsingProgress` zurücksetzen

Der Hydration Guard setzt `parsingProgress: 'Stammdaten laden...'`. Das wird automatisch vom nachfolgenden `set({ parsingProgress: 'Lese PDF...' })` (Zeile 908) überschrieben. Kein manuelles Reset nötig.

### 8. Keine Doppel-Hydrierung bei frischem Upload

Bei einem frischen Upload passiert:

1. User lädt `articleList` hoch → `addUploadedFile()` → `parseMasterDataFile()` → `masterDataStore.save()` (fire-and-forget)
2. User klickt "Verarbeitung starten" → `createNewRunWithParsing()`
3. Hydration Guard prüft `articles.length === 0` → **FALSE** (addUploadedFile hat bereits gespeichert)
4. Guard wird übersprungen → kein doppeltes Parsing

**Edge Case:** Wenn `addUploadedFile`s fire-and-forget-Save noch nicht abgeschlossen ist und der User sofort klickt, könnte `articles.length` noch 0 sein. In diesem Fall parsed der Guard nochmal → kein Problem, `masterDataStore.save()` überschreibt idempotent mit denselben Daten.

### 9. `logService` Import in `NewRun.tsx`

Prüfe ob `logService` bereits in `NewRun.tsx` importiert ist. Falls nicht:

```ts
import { logService } from '@/services/logService';
```

Der bestehende `.then()`-Block (Zeile 69) verwendet bereits `logService.warn()`, also ist der Import vorhanden.
