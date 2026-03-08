# PROJ-42-ADD-ON-V: Export Versioning & Archiv Log-Fix

## Status: Open
## Abhängigkeit: PROJ-42-ADD-ON (Export Bugfixes)

---

## Kontext

Nach PROJ-42 (Export Overhaul) und PROJ-42-ADD-ON (Export Bugfixes) bleiben zwei Lücken:
- Das Archiv loggt unnötige WARNs wenn Export-Dateien fehlen (z.B. bei Auto-Save nach Step 4/5 ohne vorherigen Export).
- Bei Mehrfach-Export (nach Korrekturen) wird die CSV/XML im Archiv **überschrieben** — **Datenverlust!** Das Archiv ist unser revisionssicheres "Kassenbuch": Jede Export-Version muss physisch im Archiv-Ordner überleben.

---

## Ziel 1: Log-Fix (archiveService.ts)

**Problem:** `writeArchivePackage()` behandelt fehlgeschlagene Export-Dateien in `failedFiles` gleichwertig mit kritischen Dateien. Irreführende WARN-Meldungen.

**Lösung:** WARN nur bei tatsächlich kritischen Dateien (`invoice-lines.json`, `metadata.json`).

**Datei:** `src/services/archiveService.ts` (Zeilen ~503–516)

**Änderung:**
```typescript
// Nur kritische Dateien prüfen — Export-Dateien sind optional
const requiredOk = !failedFiles.includes('invoice-lines.json') && !failedFiles.includes('metadata.json');
const criticalFailures = failedFiles.filter(f => f === 'invoice-lines.json' || f === 'metadata.json');
// WARN nur bei criticalFailures
logService.warn(`Archiv-Paket unvollständig: ${criticalFailures.join(', ')}`, ...);
```

---

## Ziel 2: Export-Versionierung (revisionssicher)

### Big Picture
Das Archiv ist unser revisionssicheres Kassenbuch. Wenn ein User exportiert, Preise anpasst und erneut exportiert, MÜSSEN BEIDE CSV-Versionen physisch im Archiv-Ordner überleben. Kein Überschreiben.

### 2a. RunStats erweitern
**Datei:** `src/types/index.ts` — 1 Zeile nach `bookingDate`
```typescript
/** PROJ-42-ADD-ON-V: Export-Version Counter (1 = erster Export kein Suffix, 2 = _v1, 3 = _v2, etc.) */
exportVersion?: number;
```

### 2b. buildExportFileName erweitern
**Datei:** `src/services/exportService.ts`
```typescript
export function buildExportFileName(runId: string, ext: string, version?: number): string {
  // version 0/undefined/1 = erster Export → kein Suffix
  // version 2 = zweiter Export → _v1, version 3 → _v2, etc.
  const suffix = version && version > 1 ? `_v${version - 1}` : '';
  return `${runId}-Wareneingang${suffix}.${ext}`;
}
```

### 2c. Neue Store-Action: incrementExportVersion
**Datei:** `src/store/runStore.ts` — Interface + Implementierung (~15 Zeilen)
- Liest aktuellen `exportVersion ?? 0`, inkrementiert um 1
- Schreibt in `runs[]` + `currentRun`
- **Gibt das komplett aktualisierte `Run`-Objekt zurück (`Run | null`), NICHT nur den Counter!**
- Kein Stale State: Enthält `bookingDate` + `exportVersion`
- Pattern identisch zu `setBookingDate`

### 2d. archiveService.writeArchivePackage — dynamische Export-Dateinamen
**Datei:** `src/services/archiveService.ts`

**Problem:** Aktuell hardcoded `'export.csv'` / `'export.xml'` (Zeilen 402, 413). Bei erneutem Export wird die alte Datei überschrieben.

**Lösung:** Options-Signatur um `extraFiles: Record<string, string>` erweitern:

```typescript
options?: {
  exportXml?: string;      // LEGACY — nur aktiv wenn KEIN extraFiles
  exportCsv?: string;      // LEGACY — nur aktiv wenn KEIN extraFiles
  extraFiles?: Record<string, string>;  // NEU: Key = versionierter Dateiname, Value = Content
  preFilteredSerials?: PreFilteredSerialRow[];
  issues?: Issue[];
}
```

**Neuer Schreibblock** (nach den bestehenden export-Blöcken):
```typescript
// Write extra files (versionierte Exporte)
if (options?.extraFiles) {
  for (const [name, content] of Object.entries(options.extraFiles)) {
    const ok = await fileSystemService.saveToArchive(folderName, name, content);
    if (!ok) failedFiles.push(name);
  }
}
```

**Legacy-Guard:** Bestehende `exportCsv`/`exportXml`-Blöcke mit `&& !options?.extraFiles` schützen.

**Metadata:** `exportXml`/`exportCsv`-Info-Objekte auf den letzten geschriebenen Export setzen:
```typescript
const extraFileInfos = options?.extraFiles
  ? Object.entries(options.extraFiles).map(([name, content]) => ({ name, size: content.length }))
  : [];
exportXml: exportXmlInfo ?? extraFileInfos.find(f => f.name.endsWith('.xml')) ?? null,
exportCsv: exportCsvInfo ?? extraFileInfos.find(f => f.name.endsWith('.csv')) ?? null,
```

### 2e. 3 Export-Handler anpassen — extraFiles ans Archiv

**Handler-Flow (alle 3 Call-Sites):**
```typescript
// 1. Buchungsdatum setzen (einmalig)
const afterBooking = setBookingDate(runId, ...);
// 2. Version hochzählen → frisches Run-Objekt (enthält bookingDate + exportVersion)
const latestRun = incrementExportVersion(runId);
const effectiveRun = latestRun ?? afterBooking ?? run;
// 3. Filename mit Version
const version = effectiveRun.stats.exportVersion ?? 0;
const fileName = buildExportFileName(effectiveRun.id, format, version);
// 4. Blob-Download (wie bisher)
// 5. Archive mit versioniertem Dateinamen — KEIN Überschreiben!
archiveService.writeArchivePackage(effectiveRun, lines, {
  extraFiles: { [fileName]: content },
}).catch(() => {});
```

| Handler | Datei | Archiv-Aufruf |
|---------|-------|---------------|
| `handleTileExport` | `src/pages/RunDetail.tsx:301` | `extraFiles: { [csvFileName]: csvContent }` |
| `handleDownload` | `src/components/run-detail/ExportPanel.tsx:59` | `extraFiles: { [fileName]: content }` |
| `handleDownloadFormat` | `src/pages/Index.tsx:149` | Kein Archiv-Aufruf (existiert nicht) — nur Download-Filename versionieren |

---

## Dateien-Übersicht

| Datei | Änderung | Aufwand |
|-------|----------|---------|
| `src/types/index.ts` | `exportVersion?: number` | 1 Zeile |
| `src/services/exportService.ts` | `version`-Parameter | 2 Zeilen |
| `src/services/archiveService.ts` | (1) WARN-Fix, (2) `extraFiles` Option, (3) Schreibblock, (4) Legacy-Guard, (5) Metadata | ~25 Zeilen |
| `src/store/runStore.ts` | `incrementExportVersion` (Interface + Impl) | ~15 Zeilen |
| `src/pages/RunDetail.tsx` | Counter + Filename + extraFiles | ~5 Zeilen |
| `src/components/run-detail/ExportPanel.tsx` | Counter + Filename + extraFiles | ~5 Zeilen |
| `src/pages/Index.tsx` | Counter + Filename | ~3 Zeilen |
| `features/INDEX.md` | Eintrag aktualisieren | 1 Zeile |

---

## Verifikation

1. `npx tsc --noEmit` — 0 Errors
2. Manueller Test: Export → `[RunID]-Wareneingang.csv` (kein Suffix). Re-Export → `_v1`. Dritter → `_v2`.
3. **Archiv-Ordner prüfen:** BEIDE CSV-Dateien (original + `_v1`) müssen physisch im Ordner liegen. Keine Überschreibung.
4. Archiv: Keine WARN-Meldung bei Auto-Save ohne Export-Dateien.
5. `archiveRun` (runStore.ts:2156): Funktioniert weiterhin ohne Export-Daten (Legacy-Pfad).
6. `features/INDEX.md` aktualisiert.

---

## Nützliche Hinweise für Sonnet bei der Durchführung des Plans um Fehler zu vermeiden

### Fallstricke
1. **`buildExportFileName` hat 3 Call-Sites** — alle 3 müssen den `version`-Parameter bekommen. Vergiss nicht `Index.tsx:handleDownloadFormat`.
2. **`incrementExportVersion` muss VOR `buildExportFileName` aufgerufen werden** — Counter muss inkrementiert sein, bevor der Dateiname gebaut wird.
3. **STALE-STATE-GEFAHR:** `incrementExportVersion` gibt `Run | null` zurück. Dieses Run-Objekt MUSS für `buildExportFileName`, `generateCSV/XML` (RunExportMeta), UND `archiveService.writeArchivePackage` verwendet werden — NICHT das ältere `freshRun` aus `setBookingDate`. `incrementExportVersion` liest intern via `get()`, enthält also bereits `bookingDate`.
4. **Suffix-Logik: 1. Export = kein Suffix!** `version <= 1` → kein Suffix. `version 2` → `_v1`. `version 3` → `_v2`. Formel: `_v${version - 1}`. NICHT `_v${version}`.
5. **`archiveService.ts` Ausschlussregel** im MEMORY.md bezieht sich auf `clearAllFiles()` und `loadStoredFiles()`. Die WARN-Logik und die Options-Signatur von `writeArchivePackage` dürfen angepasst werden.
6. **Optional-Chaining:** `exportVersion?: number` ist optional → immer `?? 0` beim Lesen.
7. **RunStore Interface:** `incrementExportVersion`-Signatur muss im Interface-Block (~Zeile 470) UND in der Implementierung ergänzt werden. Return-Type ist `Run | null`, NICHT `number`!
8. **REVISIONSSICHERHEIT:** Export-Dateien im Archiv dürfen NIEMALS überschrieben werden. Der versionierte Dateiname wird als Key in `extraFiles` übergeben → `fileSystemService.saveToArchive` schreibt eine NEUE Datei. Alte Dateien bleiben unangetastet.
9. **Legacy-Kompatibilität:** Die alten Options-Felder `exportCsv`/`exportXml` bleiben in der Signatur, werden aber mit `&& !options?.extraFiles`-Guard geschützt. Der `archiveRun`-Aufruf in `runStore.ts:2156` übergibt weder `exportCsv` noch `extraFiles` → kein Breaking Change.
10. **Index.tsx `handleDownloadFormat`:** Dieser Handler hat KEINEN `archiveService`-Aufruf. Nur Download-Dateiname versionieren.

### Suffix-Wahrheitstabelle:
```
Erster Export:  exportVersion = undefined → increment → 1 → suffix: '' (kein Suffix)
Zweiter Export: exportVersion = 1 → increment → 2 → suffix: '_v1'
Dritter Export: exportVersion = 2 → increment → 3 → suffix: '_v2'
```
Formel in `buildExportFileName`: `const suffix = version && version > 1 ? '_v${version - 1}' : '';`

### Tipps
- `setBookingDate` (runStore.ts:2354) ist das perfekte Vorbild für `incrementExportVersion`.
- `version`-Parameter in `buildExportFileName` ist optional → bestehende Aufrufe kompilieren ohne Änderung.
- `fileSystemService.saveToArchive(subfolderName, fileName, content)` akzeptiert beliebige Dateinamen.
- Die `extraFiles`-Schleife: `for (const [name, content] of Object.entries(options.extraFiles))` → pro Eintrag ein `saveToArchive`.

### Pflichtregeln für den ausführenden Sonnet-Agenten (Phase 2)
1. **IMMER** vorher in den Plan-Modus gehen (`/plan`).
2. **IMMER** in die Projektdaten schreiben (features/, MEMORY.md etc.).
3. Am Ende selbstständig `npx tsc --noEmit` über das Bash-Terminal ausführen und Fehler fixen.
4. Die Datei `features/INDEX.md` aktualisieren.
