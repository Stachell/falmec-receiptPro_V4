# PROJ-27 ADD-ON: Archiv & Speicher Hygiene

## Context

Der aktuelle "Speicher / Cache leeren" Button (`SettingsPopup.tsx:417-426`) ruft `localStorage.clear()` auf, was ALLE Daten vernichtet — einschliesslich Archiv-Routing (`falmec-archive-runs`), Benutzer-Einstellungen und Export-Konfiguration. Zudem fehlen: eine Diagnose-Anzeige zum Archiv-Zustand, ein strukturierter Export-Flow mit Sicherheitspruefungen, und eine Import-Moeglichkeit fuer archivierte Runs.

**Ziel:** 4 chirurgische Aenderungen — ausschliesslich in `src/components/SettingsPopup.tsx`.

---

## Pillar 1: Selective Clear (Sicherer Cache-Reset)

### Aenderung: `handleClearCache()` in SettingsPopup.tsx:417-426

**Vorher:** `localStorage.clear()` (zerstoert alles)

**Nachher:** Nur volatile Keys loeschen, Settings + Archiv bleiben erhalten.

```typescript
const handleClearCache = () => {
  try {
    const VOLATILE_KEYS = [
      'falmec-uploaded-files',
      'falmec-parsed-invoice',
      'falmec-system-log',
      'falmec-log-snapshots',
    ];
    for (const key of VOLATILE_KEYS) {
      localStorage.removeItem(key);
    }
    // Dynamische Run-Log Keys
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('falmec-run-log-')) {
        localStorage.removeItem(key);
      }
    }
    toast.success('Cache geleert (Einstellungen & Archiv bleiben erhalten)');
    setTimeout(() => window.location.reload(), 800);
  } catch {
    toast.error('Cache konnte nicht geleert werden');
  }
};
```

### Key-Kategorien (Referenz)

| Kategorie | Keys | Aktion |
|-----------|------|--------|
| **Volatile (loeschen)** | `falmec-uploaded-files`, `falmec-parsed-invoice`, `falmec-system-log`, `falmec-log-snapshots`, `falmec-run-log-*` | `removeItem()` |
| **Settings (behalten)** | `falmec-data-path`, `falmec-master-data-meta`, `exportColumnConfig`, `exportDiagnostics`, `exportCsvDelimiter`, `falmec-error-handling-emails` | Nicht anfassen |
| **Archiv (behalten)** | `falmec-archive-runs`, `falmec-archive-file-*`, `falmec-archive-stats` | Nicht anfassen |

### UI-Aenderung
- AlertDialog-Beschreibung (Zeile ~1064-1066) aktualisieren:
  > "Cache-Daten (Uploads, Logs, geparste Rechnungen) werden geloescht. Einstellungen und Archivdaten bleiben erhalten."

---

## Pillar 2: Diagnosefenster (UX-Highlight)

### Neue Info-Box oberhalb der Archiv-Buttons

Eine `rounded-md border border-border bg-white/60 p-3` Box im Tab "Speicher/Cache", platziert VOR den Action-Buttons (weisser Hintergrund passend zu DiagnosticsBlock der anderen Reiter):

```tsx
<div className="rounded-md border border-border bg-white/60 p-3 space-y-1">
  <p className="text-xs">
    <span className="font-semibold">Archiv-Pfad:</span>{' '}
    {fileSystemService.getDataPath()
      ? `${fileSystemService.getDataPath()}/.Archiv`
      : <span className="text-muted-foreground italic">Kein Datenverzeichnis konfiguriert</span>}
  </p>
  <p className="text-xs">
    <span className="font-semibold">Aktuelle Runs im System:</span>{' '}
    {diagRunCount !== null ? diagRunCount : '...'}
  </p>
  <p className="text-xs">
    <span className="font-semibold">Letzter Export:</span>{' '}
    {diagArchiveStats
      ? `${new Date(diagArchiveStats.lastExportDate).toLocaleString('de-DE')} (${diagArchiveStats.exportedCount} Runs)`
      : <span className="text-muted-foreground italic">Noch kein Export durchgefuehrt</span>}
  </p>
</div>
```

### Datenquellen

| Zeile | Quelle | API |
|-------|--------|-----|
| Archiv-Pfad | `fileSystemService.getDataPath()` (synchron) | `string` |
| Run-Counter | `runPersistenceService.loadRunList()` (async) | `Promise<PersistedRunSummary[]>` |
| Letzter Export | localStorage `falmec-archive-stats` | `{ lastExportDate: string, exportedCount: number }` |

### Neue State-Variablen
```typescript
const [diagRunCount, setDiagRunCount] = useState<number | null>(null);
const [diagArchiveStats, setDiagArchiveStats] = useState<{
  lastExportDate: string;
  exportedCount: number;
} | null>(null);
```

### useEffect (laedt Daten wenn Dialog oeffnet)
```typescript
useEffect(() => {
  if (!open) return;
  runPersistenceService.loadRunList().then(list => {
    setDiagRunCount(list.length);
  }).catch(() => setDiagRunCount(null));
  try {
    const raw = localStorage.getItem('falmec-archive-stats');
    setDiagArchiveStats(raw ? JSON.parse(raw) : null);
  } catch { setDiagArchiveStats(null); }
}, [open]);
```

### refreshDiagnostics Helper (nach Export/Import aufrufen)
```typescript
const refreshDiagnostics = async () => {
  try {
    const list = await runPersistenceService.loadRunList();
    setDiagRunCount(list.length);
  } catch { setDiagRunCount(null); }
  try {
    const raw = localStorage.getItem('falmec-archive-stats');
    setDiagArchiveStats(raw ? JSON.parse(raw) : null);
  } catch { setDiagArchiveStats(null); }
};
```

---

## Pillar 3: Dropdown-Export ("Archiv ablegen")

### Aenderung: Ersetze Placeholder-Button (SettingsPopup.tsx:572-580)

Der bestehende "Archiv synchronisieren" Button (Zeile 572-580) ist ein Platzhalter mit `toast.info('... kommt in PROJ-23 A2')`. Dieser wird durch ein DropdownMenu ersetzt.

### Neue Imports
```typescript
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Archive } from 'lucide-react';  // ChevronDown bereits vorhanden
import { runPersistenceService } from '@/services/runPersistenceService';
import { fileSystemService } from '@/services/fileSystemService';
```

### Neue State-Variablen
```typescript
const [archiveForceConfirmOpen, setArchiveForceConfirmOpen] = useState(false);
const [archiveBusy, setArchiveBusy] = useState(false);
```

### Handler: Option 1 (Default) — Export + alte Runs entfernen (> 12 Monate)

```typescript
const handleArchiveDefault = async () => {
  setArchiveBusy(true);
  try {
    const exportedCount = await runPersistenceService.exportToDirectory(12);
    if (exportedCount === -1) {
      toast.info('Export abgebrochen');
      return;
    }
    const stats = { lastExportDate: new Date().toISOString(), exportedCount };
    localStorage.setItem('falmec-archive-stats', JSON.stringify(stats));
    toast.success(`${exportedCount} Run(s) exportiert, Runs > 12 Monate entfernt`);
    await refreshDiagnostics();
  } catch (err: any) {
    toast.error(`Archivierung fehlgeschlagen: ${err?.message || 'Unbekannter Fehler'}`);
  } finally {
    setArchiveBusy(false);
  }
};
```

### Handler: Option 2 (Hard Reset) — Komplettes Archiv erzwingen

```typescript
const handleArchiveForceAll = async () => {
  setArchiveForceConfirmOpen(false);
  setArchiveBusy(true);
  try {
    const exportedCount = await runPersistenceService.exportToDirectory();
    if (exportedCount === -1) {
      toast.info('Export abgebrochen');
      return;
    }
    // Safety Check: Nur loeschen wenn Export vollstaendig
    const runList = await runPersistenceService.loadRunList();
    const completedRuns = runList.filter(r => r.status === 'ok' || r.status === 'soft-fail');

    if (exportedCount < completedRuns.length) {
      toast.error(`Export unvollstaendig (${exportedCount}/${completedRuns.length}). Loeschung abgebrochen.`);
      return;
    }

    let deletedCount = 0;
    for (const run of completedRuns) {
      const ok = await runPersistenceService.deleteRun(run.id);
      if (ok) deletedCount++;
    }

    const stats = { lastExportDate: new Date().toISOString(), exportedCount };
    localStorage.setItem('falmec-archive-stats', JSON.stringify(stats));
    toast.success(`${exportedCount} Run(s) exportiert, ${deletedCount} abgeschlossene Run(s) entfernt`);
    await refreshDiagnostics();
  } catch (err: any) {
    toast.error(`Archivierung fehlgeschlagen: ${err?.message || 'Unbekannter Fehler'}`);
  } finally {
    setArchiveBusy(false);
  }
};
```

### Sicherheits-Check Logik
- `exportedCount` wird gegen `completedRuns.length` geprueft
- Wenn Export weniger Runs geschrieben hat als abgeschlossene Runs existieren → Loeschung abgebrochen
- Nur Runs mit `status === 'ok'` oder `status === 'soft-fail'` werden geloescht
- Laufende oder fehlgeschlagene Runs bleiben IMMER erhalten

### UI-Struktur
```tsx
<div className="border-t border-border pt-3 space-y-2">
  <Label className="text-sm font-semibold">Archiv ablegen</Label>
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <div>
        <FooterButton disabled={archiveBusy}>
          <Archive className="w-4 h-4" />
          {archiveBusy ? 'Archivierung laeuft...' : 'Archiv ablegen'}
          <ChevronDown className="w-3 h-3 ml-1" />
        </FooterButton>
      </div>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start">
      <DropdownMenuItem onSelect={handleArchiveDefault}>
        Export + alte Runs entfernen (&gt; 12 Monate)
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => setArchiveForceConfirmOpen(true)}>
        Komplettes Archiv erzwingen
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
  <p className="text-xs text-muted-foreground mt-1">
    Exportiert Runs als JSON auf die Festplatte.
  </p>
</div>
```

### Neuer AlertDialog (Force-Archivierung)
```tsx
<AlertDialog open={archiveForceConfirmOpen} onOpenChange={setArchiveForceConfirmOpen}>
  <AlertDialogContent style={{ backgroundColor: '#D8E6E7' }}>
    <AlertDialogHeader>
      <AlertDialogTitle>Komplettes Archiv erzwingen?</AlertDialogTitle>
      <AlertDialogDescription>
        Alle aktuellen Daten werden auf die lokale Platte verschoben
        und abgeschlossene Runs aus der App entfernt. Fortfahren?
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
      <AlertDialogAction
        onClick={handleArchiveForceAll}
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
      >
        Archivieren & loeschen
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## Pillar 4: Manueller Import ("Run importieren")

### Strategie: Zwei Import-Pfade

1. **Pfad A (Voll):** Ordner enthaelt `run-data.json` (von `exportToDirectory`) → Direkt `runPersistenceService.saveRun()` mit voller PersistedRunData
2. **Pfad B (Archiv-Paket):** Ordner enthaelt `metadata.json` + `invoice-lines.json` (von `archiveService.writeArchivePackage`) → Run-Objekt aus ArchiveMetadata rekonstruieren, InvoiceLines laden, minimale PersistedRunData bauen

### Handler-Logik
```typescript
const handleImportRun = async () => {
  try {
    if (!('showDirectoryPicker' in window)) {
      toast.error('File System Access API nicht verfuegbar');
      return;
    }
    const dirHandle = await (window as any).showDirectoryPicker({ mode: 'read' });

    // Pfad A: run-data.json (voller Export)
    let runDataFile: FileSystemFileHandle | null = null;
    try {
      runDataFile = await dirHandle.getFileHandle('run-data.json');
    } catch { /* nicht gefunden, versuche Pfad B */ }

    if (runDataFile) {
      const file = await runDataFile.getFile();
      const text = await file.text();
      const parsed: PersistedRunData = JSON.parse(text);
      const ok = await runPersistenceService.saveRun(parsed);
      if (ok) {
        toast.success(`Run importiert: Fattura ${parsed.run.invoice.fattura}`);
      } else {
        toast.error('Run konnte nicht gespeichert werden');
      }
      await refreshDiagnostics();
      return;
    }

    // Pfad B: metadata.json + invoice-lines.json (Archiv-Paket)
    let metadataFile: FileSystemFileHandle | null = null;
    try {
      metadataFile = await dirHandle.getFileHandle('metadata.json');
    } catch {
      toast.error('Kein run-data.json oder metadata.json im Ordner gefunden');
      return;
    }

    const metaText = await (await metadataFile.getFile()).text();
    const metadata: ArchiveMetadata = JSON.parse(metaText);

    // Optional: invoice-lines.json
    let invoiceLines: any[] = [];
    try {
      const linesFile = await dirHandle.getFileHandle('invoice-lines.json');
      const linesText = await (await linesFile.getFile()).text();
      invoiceLines = JSON.parse(linesText);
    } catch { /* optional, leeres Array als Fallback */ }

    // Optional: run-log.json
    let runLog: any[] | undefined;
    try {
      const logFile = await dirHandle.getFileHandle('run-log.json');
      const logText = await (await logFile.getFile()).text();
      runLog = JSON.parse(logText);
    } catch { /* optional */ }

    // Rekonstruiere minimalen Run aus ArchiveMetadata
    const reconstructedPayload = {
      id: metadata.runId,
      run: {
        id: metadata.runId,
        createdAt: metadata.createdAt,
        status: metadata.status === 'completed' ? 'ok' as const : 'failed' as const,
        config: {
          eingangsart: metadata.config.eingangsart,
          tolerance: metadata.config.tolerance,
          currency: metadata.config.currency,
          preisbasis: metadata.config.preisbasis,
        },
        invoice: {
          fattura: metadata.fattura,
          invoiceDate: metadata.invoiceDate,
          deliveryDate: null,
        },
        stats: metadata.stats,
        steps: [],
        isExpanded: true,
      },
      invoiceLines,
      issues: [],
      auditLog: [],
      parsedPositions: [],
      parserWarnings: [],
      parsedInvoiceResult: null,
      serialDocument: null,
      uploadMetadata: [],
      ...(runLog ? { runLog } : {}),
    };

    const ok = await runPersistenceService.saveRun(reconstructedPayload as any);
    if (ok) {
      toast.success(`Run importiert (Archiv): Fattura ${metadata.fattura}`);
    } else {
      toast.error('Run konnte nicht gespeichert werden');
    }
    await refreshDiagnostics();
  } catch (err: any) {
    if (err?.name === 'AbortError') return; // User hat Picker abgebrochen
    toast.error(`Import fehlgeschlagen: ${err?.message || 'Unbekannter Fehler'}`);
  }
};
```

### Type-Imports
```typescript
import type { PersistedRunData } from '@/services/runPersistenceService';
import type { ArchiveMetadata } from '@/types';
```

### UI
```tsx
<div className="border-t border-border pt-3 space-y-2">
  <Label className="text-sm font-semibold">Run importieren</Label>
  <FooterButton onClick={handleImportRun}>
    <FolderOpen className="w-4 h-4" />
    Run importieren
  </FooterButton>
  <p className="text-xs text-muted-foreground mt-1">
    Bitte den uebergeordneten Run-Ordner waehlen, keine einzelnen Dateien.
  </p>
</div>
```

---

## Betroffene Dateien

| Datei | Aenderung |
|-------|-----------|
| `src/components/SettingsPopup.tsx` | Alle 4 Pillars: handleClearCache, Diagnosefenster, DropdownMenu, Import-Handler, AlertDialogs |

**Keine Aenderungen an:** `archiveService.ts`, `runPersistenceService.ts`, `runStore.ts`, `clearAllFiles()`, `loadStoredFiles()`

## Wiederzuverwendende APIs (keine Neuimplementierung)

| Funktion | Return | Datei |
|----------|--------|-------|
| `runPersistenceService.exportToDirectory(months?)` | `Promise<number>` (-1 = abgebrochen) | runPersistenceService.ts:351 |
| `runPersistenceService.saveRun(data)` | `Promise<boolean>` | runPersistenceService.ts:115 |
| `runPersistenceService.deleteRun(id)` | `Promise<boolean>` | runPersistenceService.ts |
| `runPersistenceService.loadRunList()` | `Promise<PersistedRunSummary[]>` | runPersistenceService.ts |
| `fileSystemService.getDataPath()` | `string` (synchron) | fileSystemService.ts |
| Bestehende shadcn DropdownMenu + AlertDialog Komponenten | — | src/components/ui/ |

## Verifikation

1. **Cache leeren:** Nur volatile Keys weg, Settings + Archiv-Keys pruefen via DevTools > Application > Local Storage
2. **Diagnosefenster:** Zeigt Archiv-Pfad, Run-Count (Live), letzten Export (oder "Noch kein Export durchgefuehrt")
3. **Archiv ablegen (Default):** Directory Picker oeffnet, Runs exportiert, > 12 Monate aus IndexedDB geloescht, Stats aktualisiert
4. **Archiv ablegen (Force):** Warndialog erscheint, alle exportiert, nur abgeschlossene aus IndexedDB geloescht, Safety-Check greift
5. **Import Pfad A:** Ordner mit `run-data.json` → voller Run in App, Counter aktualisiert
6. **Import Pfad B:** Ordner mit `metadata.json` → minimaler Run in App, Counter aktualisiert
7. **TypeScript:** `npx tsc --noEmit` → 0 Errors

---

---

## UI-Refactoring (2026-03-07) — Speicher/Cache Tab

**Änderungen in `src/components/SettingsPopup.tsx`:**

### Neue Reihenfolge der Sektionen (Position 1→4):
1. **Archiv ablegen** (war Position 3)
2. **Diagnosefenster** (war Position 1)
3. **Run importieren** (war Position 4)
4. **Local-Storage / Cache leeren** (war Position 2 — gefährlichste Aktion jetzt ganz unten)

### DropdownMenu → Select + Button:
- Import `DropdownMenu*` entfernt (war ausschliesslich für Archiv ablegen)
- Neuer State: `archiveRetention: '6' | '12' | 'all'` (Default: `'6'`)
- Select-Optionen: "6 Monate", "12 Monate", "Komplettes Archiv erzwingen & leeren"
- Separater "Archiv exportieren"-Button — kein sofortiges Auslösen mehr
- Dynamischer Hilfetext je nach Selektion (3 Varianten)

### Handler-Signatur geändert:
- `handleArchiveDefault()` → `handleArchiveDefault(months: number)`
- Ruft intern `exportToDirectory(months)` auf (statt hartcodierten 12)
- Toast-Nachricht dynamisch: `Runs > ${months} Monate entfernt`

### AlertDialog-Text (Force-Archivierung):
- Neu: "Sind Sie sicher das alle aktuellen Daten lokal gesichert, allerdings vollständig aus dem internen Langzeitspeicher entfernt werden sollen? Fortfahren?"

**TypeScript-Check:** `npx tsc --noEmit` → 0 Errors ✓

---

## Nuetzliche Hinweise & Regeln fuer den ausfuehrenden Agenten

1. **Workflow-Schutz:** Keine Aenderungen ausserhalb von `SettingsPopup.tsx`. Bestehende Logiken nicht beschaedigen!
2. **Arbeitsweise:** Zuerst Plan-Modus, dann Projektdaten (Memory/MEMORY.md) aktualisieren.
3. **Self-Check:** GANZ AM ENDE `npx tsc --noEmit` ausfuehren und alle Type-Errors (besonders bei Promises und `as any` Casts) fixen.
4. **Abschluss:** `features/INDEX.md` aktualisieren.
5. **Shadcn Imports:** Achte auf die korrekten Shadcn UI Imports:
   - `DropdownMenu` aus `@/components/ui/dropdown-menu`
   - `AlertDialog` aus `@/components/ui/alert-dialog`
   - Pruefe ob die Komponenten-Dateien existieren bevor du importierst
6. **Ausschlussregeln:** `archiveService.ts`, `clearAllFiles()`, `loadStoredFiles()` NICHT anfassen!
7. **Nur 1 Datei aendern:** Alle Aenderungen gehoeren in `src/components/SettingsPopup.tsx`. Keine neuen Service-Dateien noetig.
8. **saveRun Return-Typ:** Gibt `Promise<boolean>` zurueck — Rueckgabewert pruefen! Kein `if(ok)` ueberspringen.
9. **falmec-archive-stats:** Neuer localStorage Key. Format: `{ lastExportDate: string, exportedCount: number }`. Muss nach JEDEM erfolgreichen Export gesetzt werden.
