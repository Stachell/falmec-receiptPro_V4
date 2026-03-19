/**
 * SettingsPopup — PROJ-22 Phase B4
 *
 * Redesigned with:
 * - Dynamic width (max-w-[600px])
 * - Vertical tab menu with 6 tabs
 * - "Schliessen" link at bottom
 * - "Speicher/Cache leeren" button (hover: rot, Confirm-Dialog)
 * - Logfile-Button moved here from AppFooter
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRunStore } from '@/store/runStore';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, FolderOpen, Trash2, CheckCircle, GripVertical, ChevronUp, ChevronDown, Save, Archive, Settings, AlertTriangle, FileText, Search, Fingerprint, PackageOpen, Download } from 'lucide-react';
import { runPersistenceService } from '@/services/runPersistenceService';
import type { PersistedRunData } from '@/services/runPersistenceService';
import { fileSystemService } from '@/services/fileSystemService';
import type { ArchiveMetadata } from '@/types';
import { useExportConfigStore } from '@/store/exportConfigStore';
import { toast } from 'sonner';
import { getAllParsers } from '@/services/parsers';
import { parserRegistryService, type ParserRegistryModule } from '@/services/parserRegistryService';
import type { MatcherRegistryModule } from '@/services/matcherRegistryService';
import { logService } from '@/services/logService';
import type { OrderParserFieldAliases, OrderParserProfile, StepDiagnostics, MatcherProfileOverrides, OrderParserProfileOverrides } from '@/types';
import {
  DEFAULT_ORDER_PARSER_PROFILE_ID,
  ORDER_PARSER_PROFILES,
  getOrderParserProfileById,
  resolveOrderParserProfile,
} from '@/services/matching/orderParserProfiles';
import { OverrideEditorModal } from '@/components/OverrideEditorModal';
import {
  ERROR_HANDLING_EMAIL_SLOT_COUNT,
  getStoredEmailSlots,
  saveEmailAddresses,
  isValidEmail,
} from '@/lib/errorHandlingConfig';

interface SettingsPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: SettingsTabKey;
  onParserChange?: (parserId: string) => void;
  onMatcherChange?: (matcherId: string) => void;
  activeParser?: {
    parserId: string;
    modules: ParserRegistryModule[];
    ready: boolean;
  };
  activeMatcher?: {
    matcherId: string;
    modules: MatcherRegistryModule[];
    ready: boolean;
  };
}

type SettingsTabKey = 'general' | 'errorhandling' | 'parser' | 'matcher' | 'serial' | 'ordermapper' | 'export' | 'overview';

/** Hover-style helper button (matching app design) */
function FooterButton({
  onClick,
  children,
  danger = false,
  disabled = false,
  className = '',
}: {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`h-9 px-4 text-sm rounded-md flex items-center justify-center gap-2 transition-colors border disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
      style={{
        backgroundColor: hovered ? (danger ? '#dc2626' : '#008C99') : '#c9c3b6',
        borderColor: hovered ? (danger ? '#dc2626' : '#D8E6E7') : '#666666',
        color: hovered ? '#FFFFFF' : '#666666',
      }}
    >
      {children}
    </button>
  );
}

const ORDER_ALIAS_INPUTS: Array<{ field: keyof OrderParserFieldAliases; label: string }> = [
  { field: 'orderNumberCandidates', label: 'Ordernummer Kandidaten' },
  { field: 'orderYear', label: 'Order-Jahr' },
  { field: 'openQuantity', label: 'Offene Menge' },
  { field: 'artNoDE', label: 'Art-# (DE)' },
  { field: 'artNoIT', label: 'Art-# (IT)' },
  { field: 'ean', label: 'EAN' },
];

function toCsvValue(values: string[] | undefined): string {
  return Array.isArray(values) ? values.join(', ') : '';
}

function fromCsvValue(raw: string): string[] {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

// PROJ-28 Phase D: read-only diagnostics display for all 4 step tabs
function DiagnosticsBlock({ diag }: { diag: StepDiagnostics | undefined }) {
  const confidenceColor: Record<string, string> = {
    high:   'text-green-700',
    medium: 'text-amber-700',
    low:    'text-red-700',
  };
  return (
    <div className="rounded-md border border-border bg-white/60 p-2 space-y-1">
      <Label className="text-xs font-semibold">Letzte Diagnose (read-only)</Label>
      {diag ? (
        <>
          <p className="text-xs">Modul: <span className="font-semibold">{diag.moduleName}</span></p>
          <p className="text-xs">
            Confidence:{' '}
            <span className={`font-semibold ${confidenceColor[diag.confidence] ?? ''}`}>
              {diag.confidence}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">{diag.summary}</p>
          {diag.detailLines?.map((line, i) => (
            <p key={i} className="text-xs text-muted-foreground">• {line}</p>
          ))}
          <p className="text-[10px] text-muted-foreground">
            {new Date(diag.timestamp).toLocaleString('de-DE')}
          </p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Noch keine Diagnose vorhanden.</p>
      )}
    </div>
  );
}

/** PROJ-35: Export column order configuration tab */
function ExportConfigTab() {
  const { columnOrder, isDirty, moveColumn, saveConfig, resetToDefault, lastDiagnostics, csvDelimiter, setCsvDelimiter, csvIncludeHeader, setCsvIncludeHeader } = useExportConfigStore();

  return (
    <TabsContent value="export" className="mt-0 space-y-3">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Export-Spaltenreihenfolge</div>
      <p className="text-xs text-muted-foreground">
        Felder in die gewuenschte Reihenfolge bringen.
      </p>

      {/* Sortierbare Liste */}
      <div className="space-y-1 border-t border-border pt-3">
        {columnOrder.map((col, index) => (
          <div
            key={col.columnKey}
            className="bg-white rounded-md border border-border px-3 py-1.5 flex items-center gap-3"
          >
            <GripVertical className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
            <span className="text-muted-foreground font-mono text-sm w-6 text-right flex-shrink-0">
              {col.position}.
            </span>
            <span className="text-sm flex-1">{col.label}</span>
            <button
              type="button"
              disabled={index === 0}
              onClick={() => moveColumn(index, index - 1)}
              className="p-0.5 rounded hover:bg-muted disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
              aria-label={`${col.label} nach oben`}
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={index === columnOrder.length - 1}
              onClick={() => moveColumn(index, index + 1)}
              className="p-0.5 rounded hover:bg-muted disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
              aria-label={`${col.label} nach unten`}
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Diagnose (letzter Export) */}
      <div className="border-t border-border pt-3">
        <Label className="text-xs font-semibold">Diagnose (letzter Export)</Label>
        {lastDiagnostics ? (
          <div className="mt-1 space-y-0.5">
            <p className="text-xs text-muted-foreground">
              Zeitpunkt: <span className="font-semibold">{new Date(lastDiagnostics.timestamp).toLocaleString('de-DE')}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Datei: <span className="font-semibold font-mono">{lastDiagnostics.fileName}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Zeilen: <span className="font-semibold">{lastDiagnostics.lineCount}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Status:{' '}
              <span className={`font-semibold ${lastDiagnostics.status === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                {lastDiagnostics.status === 'success' ? 'Erfolg' : 'Fehler'}
              </span>
              {lastDiagnostics.message && (
                <span className="ml-1">— {lastDiagnostics.message}</span>
              )}
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground mt-1">Noch kein Export durchgefuehrt.</p>
        )}
      </div>

      {/* CSV-Trennzeichen */}
      <div className="border-t border-border pt-3">
        <Label className="text-xs font-semibold">CSV-Trennzeichen</Label>
        <Select value={csvDelimiter} onValueChange={setCsvDelimiter}>
          <SelectTrigger className="mt-1 h-8 text-xs w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=",">Komma (,)</SelectItem>
            <SelectItem value=";">Semikolon (;)</SelectItem>
            <SelectItem value={'\t'}>Tab</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Headerzeile */}
      <div className="border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold">Headerzeile einfuegen:</Label>
          <Switch checked={csvIncludeHeader} onCheckedChange={setCsvIncludeHeader} />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Wenn aktiviert, wird eine Kopfzeile mit Spaltennamen in die CSV-Datei eingefuegt.
        </p>
      </div>

      {/* Aktionsleiste */}
      <div className="flex items-center gap-3 border-t border-border pt-3">
        {isDirty && (
          <FooterButton onClick={saveConfig}>
            <Save className="w-4 h-4" />
            Speichern
          </FooterButton>
        )}
        <button
          type="button"
          onClick={resetToDefault}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
        >
          Zuruecksetzen
        </button>
      </div>
    </TabsContent>
  );
}

export function SettingsPopup({
  open,
  onOpenChange,
  initialTab = 'overview',
  onParserChange,
  onMatcherChange,
  activeParser,
  activeMatcher,
}: SettingsPopupProps) {
  const globalConfig = useRunStore((state) => state.globalConfig);
  const setGlobalConfig = useRunStore((state) => state.setGlobalConfig);
  const latestDiagnostics = useRunStore((state) => state.latestDiagnostics);
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideModalStep, setOverrideModalStep] = useState<2 | 4>(4);
  const [importSuccessOpen, setImportSuccessOpen] = useState(false);
  const [importedFileName, setImportedFileName] = useState('');
  const [activeTab, setActiveTab] = useState<SettingsTabKey>(initialTab);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // PROJ-39-ADDON: Fehlerhandling email addresses (10 fixed slots)
  const [emailSaved, setEmailSaved] = useState(false);
  const [emailAddresses, setEmailAddresses] = useState<string[]>(getStoredEmailSlots);
  // PROJ-44-BUGFIX-R3b: Event-driven debounce (no useEffect, no stale-closure risk)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailAddressesRef = useRef<string[]>(emailAddresses);
  emailAddressesRef.current = emailAddresses; // kept current on every render
  const duplicateEmailIndices = useMemo(() => {
    const duplicateMap = new Map<string, number[]>();
    emailAddresses.forEach((entry, index) => {
      const value = entry.trim().toLowerCase();
      if (!value) return;
      const list = duplicateMap.get(value) ?? [];
      list.push(index);
      duplicateMap.set(value, list);
    });
    return new Set(
      [...duplicateMap.values()]
        .filter((indices) => indices.length > 1)
        .flat(),
    );
  }, [emailAddresses]);
  const handleUpdateAddress = (index: number, value: string) => {
    setEmailAddresses(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    // Debounced auto-save — only fired by user input, never by state reloads
    if (autoSaveTimerRef.current !== null) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      saveEmailAddresses(emailAddressesRef.current);
    }, 500);
  };
  const handleSaveEmails = () => {
    // Cancel any pending auto-save before manual save
    if (autoSaveTimerRef.current !== null) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    const result = saveEmailAddresses(emailAddresses);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    // Sync state with normalized (trimmed) values — safe because no useEffect watches emailAddresses
    if (result.ok) setEmailAddresses(result.addresses);
    toast.success('E-Mail-Adressen gespeichert');
    setEmailSaved(true);
    // Track timer in ref so it can be cancelled on dialog close
    if (emailSavedTimerRef.current !== null) clearTimeout(emailSavedTimerRef.current);
    emailSavedTimerRef.current = setTimeout(() => {
      emailSavedTimerRef.current = null;
      setEmailSaved(false);
    }, 2000);
  };

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  // PROJ-39-ADDON: Load stored emails (fixed slots) when popup opens
  useEffect(() => {
    if (open) {
      // Cancel any pending timers from previous session
      if (autoSaveTimerRef.current !== null) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      if (emailSavedTimerRef.current !== null) {
        clearTimeout(emailSavedTimerRef.current);
        emailSavedTimerRef.current = null;
        setEmailSaved(false);
      }
      setEmailAddresses(getStoredEmailSlots());
    }
  }, [open]);

  // PROJ-27 ADD-ON: Diagnostics laden wenn Dialog öffnet
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

  // Parser-Verwaltung state
  const [parserToDelete, setParserToDelete] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [cacheConfirmOpen, setCacheConfirmOpen] = useState(false);
  const [diagRunCount, setDiagRunCount] = useState<number | null>(null);
  const [diagArchiveStats, setDiagArchiveStats] = useState<{
    lastExportDate: string;
    exportedCount: number;
  } | null>(null);
  const [archiveForceConfirmOpen, setArchiveForceConfirmOpen] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveRetention, setArchiveRetention] = useState<'6' | '12' | 'all'>('6');
  const [parsers, setParsers] = useState<Array<{ moduleId: string; moduleName: string; version: string }>>([]);

  useEffect(() => {
    if (open) {
      const all = getAllParsers();
      setParsers(all.map(p => ({ moduleId: p.moduleId, moduleName: p.moduleName, version: p.version })));
    }
  }, [open]);

  // Pre-select active parser in "Parser entfernen" dropdown when popup opens
  useEffect(() => {
    if (open && activeParser?.parserId && parsers.length > 0) {
      const activeId = activeParser.parserId;
      if (activeId !== 'auto' && parsers.some(p => p.moduleId === activeId)) {
        setParserToDelete(activeId);
      }
    }
  }, [open, parsers, activeParser?.parserId]);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!file.name.endsWith('.ts')) {
      toast.error('Nur .ts-Dateien werden unterstuetzt');
      return;
    }
    if (file.size > 1024 * 1024) {
      toast.error('Parser-Datei zu gross (max. 1 MB)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content.includes('moduleId')) {
        toast.error('Ungueltige Parser-Datei: "moduleId" nicht gefunden');
        return;
      }
      setImportedFileName(file.name);
      setImportSuccessOpen(true);
    };
    reader.onerror = () => {
      toast.error('Datei konnte nicht gelesen werden');
    };
    reader.readAsText(file);
  };

  const handleDeleteParser = async () => {
    if (!parserToDelete) return;
    const parser = parsers.find(p => p.moduleId === parserToDelete);
    if (!parser) return;
    const fileName = `${parserToDelete}.ts`;
    try {
      const res = await fetch('/api/dev/delete-parser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName }),
      });
      const result = await res.json();
      if (!result.success) {
        toast.error(`Fehler: ${result.error}`);
        return;
      }
      await parserRegistryService.wipeRegistry();
      window.location.reload();
    } catch (err: any) {
      toast.error(`Loeschen fehlgeschlagen: ${err.message}`);
    }
  };

  const handleOpenFolder = async () => {
    try {
      await fetch('/api/dev/open-folder');
    } catch {
      toast.error('Ordner konnte nicht geoeffnet werden');
    }
  };

  const handleShowLogfile = () => {
    logService.info('Logfile angezeigt', { step: 'System' });
    logService.viewLogWithSnapshot();
  };

  // PROJ-27 ADD-ON: Diagnostics aktualisieren (nach Export/Import)
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

  // PROJ-27 ADD-ON Pillar 1: Selective Clear (nur volatile Keys)
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

  // PROJ-45-ADD-ON-round4: Matcher-Overrides zurücksetzen (Regex auf Default)
  const handleResetMatcherOverrides = () => {
    if (window.confirm(
      'Der aktuelle Wert wird durch die Grundeinstellung (^1\\d{5}$) ersetzt. ' +
      'Der überschriebene Wert wird nicht gesichert. Wollen Sie fortfahren?'
    )) {
      setGlobalConfig({ matcherProfileOverrides: { enabled: true } });
    }
  };

  // PROJ-27 ADD-ON Pillar 3: Archiv ablegen — Standard (Export + >N Monate löschen)
  const handleArchiveDefault = async (months: number) => {
    setArchiveBusy(true);
    try {
      const exportedCount = await runPersistenceService.exportToDirectory(months);
      if (exportedCount === -1) {
        toast.info('Export abgebrochen');
        return;
      }
      const stats = { lastExportDate: new Date().toISOString(), exportedCount };
      localStorage.setItem('falmec-archive-stats', JSON.stringify(stats));
      toast.success(`${exportedCount} Run(s) exportiert, Runs > ${months} Monate entfernt`);
      await refreshDiagnostics();
    } catch (err: any) {
      toast.error(`Archivierung fehlgeschlagen: ${err?.message || 'Unbekannter Fehler'}`);
    } finally {
      setArchiveBusy(false);
    }
  };

  // PROJ-27 ADD-ON Pillar 3: Archiv ablegen — Hard Reset (Komplettes Archiv erzwingen)
  const handleArchiveForceAll = async () => {
    setArchiveForceConfirmOpen(false);
    setArchiveBusy(true);
    try {
      const exportedCount = await runPersistenceService.exportToDirectory();
      if (exportedCount === -1) {
        toast.info('Export abgebrochen');
        return;
      }
      // Safety Check: Nur löschen wenn Export vollständig
      const runList = await runPersistenceService.loadRunList();
      const completedRuns = runList.filter(r => r.status === 'ok' || r.status === 'soft-fail');
      if (exportedCount < runList.length) {
        toast.error(`Export unvollständig (${exportedCount}/${runList.length}). Löschung abgebrochen.`);
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

  // PROJ-27 ADD-ON Pillar 4: Manueller Import (Pfad A: run-data.json / Pfad B: metadata.json)
  const handleImportRun = async () => {
    try {
      if (!('showDirectoryPicker' in window)) {
        toast.error('File System Access API nicht verfügbar');
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
      if (err?.name === 'AbortError') return;
      toast.error(`Import fehlgeschlagen: ${err?.message || 'Unbekannter Fehler'}`);
    }
  };

  // Display helpers
  const selectedParserName = parsers.find(p => p.moduleId === parserToDelete)?.moduleName || parserToDelete;
  const activeOrderParserProfileId = globalConfig.activeOrderParserProfileId ?? DEFAULT_ORDER_PARSER_PROFILE_ID;
  const selectedOrderParserProfile = useMemo(
    () => getOrderParserProfileById(activeOrderParserProfileId)
      || getOrderParserProfileById(DEFAULT_ORDER_PARSER_PROFILE_ID)
      || ORDER_PARSER_PROFILES[0]
      || resolveOrderParserProfile(DEFAULT_ORDER_PARSER_PROFILE_ID),
    [activeOrderParserProfileId],
  );

  const effectiveOrderParserProfile = useMemo(
    () => resolveOrderParserProfile(
      activeOrderParserProfileId,
      globalConfig.orderParserProfileOverrides,
      selectedOrderParserProfile,
    ),
    [activeOrderParserProfileId, globalConfig.orderParserProfileOverrides, selectedOrderParserProfile],
  );

  const customOrderParserOverrideEnabled = !!globalConfig.orderParserProfileOverrides;
  const strictSerialRequiredFailure = globalConfig.strictSerialRequiredFailure ?? true;
  const showParserAutoOption = (activeParser?.modules.length ?? 0) > 1;
  const showMatcherAutoOption = (activeMatcher?.modules.length ?? 0) > 1;
  const activeSerialFinderId = globalConfig.activeSerialFinderId ?? 'default';
  const serialFinderOptions: Array<{ id: string; label: string }> = [
    { id: 'default', label: 'Standard' },
  ];
  const serialFinderReady = serialFinderOptions.some((option) => option.id === activeSerialFinderId);
  const activeOrderMapperId = globalConfig.activeOrderMapperId ?? 'engine-proj-23';
  const orderMapperOptions: Array<{ id: string; label: string }> = [
    { id: 'legacy-waterfall-4', label: 'Legacy (Veraltet)' },
    { id: 'engine-proj-23', label: 'PROJ-23 (3-Run Engine)' },
  ];
  const orderMapperReady = orderMapperOptions.some((option) => option.id === activeOrderMapperId);

  const updateOrderParserAliasOverride = (field: keyof OrderParserFieldAliases, csvValue: string) => {
    const existingOverrides = globalConfig.orderParserProfileOverrides ?? {};
    const existingAliases = existingOverrides.aliases ?? {};
    const nextAliases: OrderParserProfile['aliases'] = {
      ...effectiveOrderParserProfile.aliases,
      ...existingAliases,
      [field]: fromCsvValue(csvValue),
    };

    setGlobalConfig({
      orderParserProfileOverrides: {
        ...existingOverrides,
        aliases: nextAliases,
      },
    });
  };

  const toggleCustomOrderParserOverrides = (enabled: boolean) => {
    if (enabled) {
      setGlobalConfig({
        orderParserProfileOverrides: globalConfig.orderParserProfileOverrides ?? {
          aliases: {
            orderNumberCandidates: [...effectiveOrderParserProfile.aliases.orderNumberCandidates],
            orderYear: [...effectiveOrderParserProfile.aliases.orderYear],
            openQuantity: [...effectiveOrderParserProfile.aliases.openQuantity],
            artNoDE: [...effectiveOrderParserProfile.aliases.artNoDE],
            artNoIT: [...effectiveOrderParserProfile.aliases.artNoIT],
            ean: [...effectiveOrderParserProfile.aliases.ean],
            supplierId: [...effectiveOrderParserProfile.aliases.supplierId],
            belegnummer: [...effectiveOrderParserProfile.aliases.belegnummer],
          },
        },
      });
      return;
    }
    setGlobalConfig({ orderParserProfileOverrides: undefined });
  };

  // PROJ-28 Phase D: computed values for override toggles
  const matcherOverrideEnabled = !!globalConfig.matcherProfileOverrides?.enabled;
  const matcherProfileOverrides = globalConfig.matcherProfileOverrides;
  const blockStep2OnPriceMismatch = globalConfig.blockStep2OnPriceMismatch ?? false;


  // PROJ-28 Phase D: handlers for OverrideEditorModal
  const openOverrideModal = (stepNo: 2 | 4) => {
    setOverrideModalStep(stepNo);
    setOverrideModalOpen(true);
  };

  const handleSaveMatcherOverrides = (overrides: MatcherProfileOverrides) => {
    setGlobalConfig({ matcherProfileOverrides: overrides });
  };

  const handleSaveOrderParserOverrides = (overrides: OrderParserProfileOverrides) => {
    setGlobalConfig({ orderParserProfileOverrides: overrides });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/* PROJ-22 B4: Dynamische Breite max-w-[600px] */}
        <DialogContent
          className="max-w-[800px] w-full"
          style={{ backgroundColor: '#D8E6E7' }}
        >
          <DialogHeader>
            <DialogTitle>Einstellungen</DialogTitle>
          </DialogHeader>

          {/* PROJ-27-ADDON-3: Horizontale Tab-Leiste (3D-Relief) */}
          {/* PROJ-35: feste Hoehe gegen Layout-Shift beim Tab-Wechsel */}
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as SettingsTabKey)}
            className="flex flex-col mt-2 h-[65vh] max-h-[800px]"
          >
            <TabsList
              className="flex flex-row h-fit bg-[#c9c3b6] border border-border tab-bar-raised p-1 gap-1 rounded-md mb-3 shrink-0"
            >
              <TabsTrigger value="general"       className="text-xs px-3 py-1.5 gap-1 tab-trigger-pressed data-[state=active]:bg-[#666666] data-[state=active]:text-white hover:bg-[#008C99] hover:text-[#E3E0CF] transition-colors"><Settings className="w-3 h-3" />Allgemein</TabsTrigger>
              <TabsTrigger value="errorhandling" className="text-xs px-3 py-1.5 gap-1 tab-trigger-pressed data-[state=active]:bg-[#666666] data-[state=active]:text-white hover:bg-[#008C99] hover:text-[#E3E0CF] transition-colors"><AlertTriangle className="w-3 h-3" />Fehler</TabsTrigger>
              <TabsTrigger value="parser"        className="text-xs px-3 py-1.5 gap-1 tab-trigger-pressed data-[state=active]:bg-[#666666] data-[state=active]:text-white hover:bg-[#008C99] hover:text-[#E3E0CF] transition-colors"><FileText className="w-3 h-3" />Parser</TabsTrigger>
              <TabsTrigger value="matcher"       className="text-xs px-3 py-1.5 gap-1 tab-trigger-pressed data-[state=active]:bg-[#666666] data-[state=active]:text-white hover:bg-[#008C99] hover:text-[#E3E0CF] transition-colors"><Search className="w-3 h-3" />Matcher</TabsTrigger>
              <TabsTrigger value="serial"        className="text-xs px-3 py-1.5 gap-1 tab-trigger-pressed data-[state=active]:bg-[#666666] data-[state=active]:text-white hover:bg-[#008C99] hover:text-[#E3E0CF] transition-colors"><Fingerprint className="w-3 h-3" />Serial</TabsTrigger>
              <TabsTrigger value="ordermapper"   className="text-xs px-3 py-1.5 gap-1 tab-trigger-pressed data-[state=active]:bg-[#666666] data-[state=active]:text-white hover:bg-[#008C99] hover:text-[#E3E0CF] transition-colors"><PackageOpen className="w-3 h-3" />Bestellung</TabsTrigger>
              <TabsTrigger value="export"        className="text-xs px-3 py-1.5 gap-1 tab-trigger-pressed data-[state=active]:bg-[#666666] data-[state=active]:text-white hover:bg-[#008C99] hover:text-[#E3E0CF] transition-colors"><Download className="w-3 h-3" />Export</TabsTrigger>
              <TabsTrigger value="overview"      className="text-xs px-3 py-1.5 gap-1 tab-trigger-pressed data-[state=active]:bg-[#666666] data-[state=active]:text-white hover:bg-[#008C99] hover:text-[#E3E0CF] transition-colors"><Archive className="w-3 h-3" />Speicher</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto min-h-0">
              {/* Tab 1: Speicher/Cache */}
              <TabsContent value="overview" className="mt-0 space-y-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Speicher/Cache</div>

                {/* Position 1: PROJ-27 ADD-ON Pillar 3: Archiv ablegen (Select + Button) */}
                <div className="border-t border-border pt-3 space-y-2">
                  <Label className="text-sm font-semibold">Archiv ablegen</Label>
                  <div className="flex items-center gap-2">
                    <Select
                      value={archiveRetention}
                      onValueChange={(v) => setArchiveRetention(v as '6' | '12' | 'all')}
                    >
                      <SelectTrigger className="flex-1 text-xs h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="6">Export + alte Runs entfernen (&gt; 6 Monate)</SelectItem>
                        <SelectItem value="12">Export + alte Runs entfernen (&gt; 12 Monate)</SelectItem>
                        <SelectItem value="all">Komplettes Archiv erzwingen &amp; leeren</SelectItem>
                      </SelectContent>
                    </Select>
                    <FooterButton
                      disabled={archiveBusy}
                      onClick={() => {
                        if (archiveRetention === 'all') {
                          setArchiveForceConfirmOpen(true);
                        } else {
                          handleArchiveDefault(Number(archiveRetention));
                        }
                      }}
                    >
                      <Archive className="w-4 h-4" />
                      {archiveBusy ? 'Läuft...' : 'Archiv exportieren'}
                    </FooterButton>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {archiveRetention === '6' && 'Exportiert Runs, älter als 6 Monate als Datensatz auf die Festplatte und bereinigt den internen Langzeitspeicher.'}
                    {archiveRetention === '12' && 'Exportiert Runs, älter als 12 Monate als Datensatz auf die Festplatte und bereinigt den internen Langzeitspeicher.'}
                    {archiveRetention === 'all' && 'Exportiert alle Runs auf die Festplatte und leert den internen Langzeitspeicher komplett.'}
                  </p>
                </div>

                {/* Position 2: PROJ-27 ADD-ON Pillar 2: Diagnosefenster */}
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
                      : <span className="text-muted-foreground italic">Noch kein Export durchgeführt</span>}
                  </p>
                </div>

                {/* Position 3: PROJ-27 ADD-ON Pillar 4: Run importieren */}
                <div className="border-t border-border pt-3 space-y-2">
                  <Label className="text-sm font-semibold">Run importieren</Label>
                  <FooterButton onClick={handleImportRun}>
                    <FolderOpen className="w-4 h-4" />
                    Run importieren
                  </FooterButton>
                  <p className="text-xs text-muted-foreground mt-1">
                    Bitte den übergeordneten Run-Ordner wählen, keine einzelnen Dateien.
                  </p>
                </div>

                {/* Position 4: Speicher/Cache leeren (gefährlichste Aktion, ganz unten) */}
                <div className="border-t border-border pt-3 space-y-2">
                  <Label className="text-sm font-semibold">Local-Storage / Cache leeren</Label>
                  <FooterButton onClick={() => setCacheConfirmOpen(true)} danger>
                    <Trash2 className="w-4 h-4" />
                    Speicher / Cache leeren
                  </FooterButton>
                  <p className="text-xs text-muted-foreground mt-1">
                    Loescht Cache-Daten und laedt die Seite neu. Einstellungen & Archiv bleiben erhalten.
                  </p>
                </div>
              </TabsContent>

              {/* Tab 2: Allgemein */}
              <TabsContent value="general" className="mt-0 space-y-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Allgemein</div>

                <div className="border-t border-border pt-3">
                  <div className="flex items-center justify-between gap-4">
                    <Label className="text-sm whitespace-nowrap text-left">Logfile (global) anzeigen:</Label>
                    <FooterButton onClick={handleShowLogfile} className="h-8 w-28 justify-start px-3">
                      Logfile
                    </FooterButton>
                  </div>
                </div>

                <div className="border-t border-border pt-3 space-y-3">
                  <Label className="text-sm font-semibold">Feineinstellung</Label>

                  <div className="flex items-center justify-between gap-4">
                    <Label className="text-sm whitespace-nowrap">Maussperre (SEK.)</Label>
                    <Select
                      value={(globalConfig.clickLockSeconds ?? 0).toFixed(1)}
                      onValueChange={(v) => setGlobalConfig({ clickLockSeconds: parseFloat(v) })}
                    >
                      <SelectTrigger className="h-8 w-28 text-sm bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover">
                        {Array.from({ length: 31 }, (_, i) => {
                          const val = (i * 0.1).toFixed(1);
                          return (
                            <SelectItem key={val} value={val}>
                              {val.replace('.', ',')}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <Label className="text-sm whitespace-nowrap">Preisbasis</Label>
                    <Select
                      value={globalConfig.priceBasis}
                      onValueChange={(value: 'Net' | 'Gross') => setGlobalConfig({ priceBasis: value })}
                    >
                      <SelectTrigger className="h-8 w-28 text-sm bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover">
                        <SelectItem value="Net">Netto</SelectItem>
                        <SelectItem value="Gross">Brutto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <Label className="text-sm whitespace-nowrap">Waehrung</Label>
                    <Select value="EUR" onValueChange={() => {}}>
                      <SelectTrigger className="h-8 w-28 text-sm bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover">
                        <SelectItem value="EUR">Euro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <Label className="text-sm whitespace-nowrap">Toleranz (EUR)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={globalConfig.tolerance}
                      onChange={(e) =>
                        setGlobalConfig({ tolerance: Math.max(0, parseFloat(e.target.value) || 0) })
                      }
                      className="h-8 w-28 text-sm bg-white"
                    />
                  </div>
                </div>

                {/* PROJ-44: Step 4 Waiting Point */}
                <div className="border-t border-border pt-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <img src="/icons/Lock_CLOSE_STEP4.ico" alt="Lock" className="w-5 h-5" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <Label className="text-sm whitespace-nowrap">Artikelliste mit Step 4 ausrollen?</Label>
                    </div>
                    <Switch
                      checked={globalConfig.autoStartStep4 ?? true}
                      onCheckedChange={(checked) => setGlobalConfig({ autoStartStep4: checked })}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Aus: Workflow haelt vor Step 4 an — Bestaetigungsdialog erscheint
                  </p>
                </div>

              </TabsContent>

              {/* Tab 3: Fehlerhandling */}
              <TabsContent value="errorhandling" className="mt-0 space-y-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Fehlerhandling</div>
                <div className="border-t border-border pt-3 space-y-3">
                  <Label className="text-sm font-semibold">Fehlerhandling</Label>
                  <p className="text-xs text-muted-foreground">
                    E-Mail-Adressen fuer Fehlerweiterleitung
                  </p>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    {Array.from({ length: ERROR_HANDLING_EMAIL_SLOT_COUNT }, (_, i) => (
                      <div key={i} className="flex items-center justify-between gap-4">
                        <Label className="text-sm whitespace-nowrap">Adresse {i + 1}</Label>
                        <Input
                          type="email"
                          value={emailAddresses[i] ?? ''}
                          onChange={(e) => handleUpdateAddress(i, e.target.value)}
                          placeholder="name@firma.de"
                          className={`h-8 flex-1 max-w-[280px] text-sm bg-white ${
                            (emailAddresses[i] && !isValidEmail(emailAddresses[i])) || duplicateEmailIndices.has(i)
                              ? 'border-amber-400'
                              : ''
                          }`}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-3">
                    <Button size="sm" onClick={handleSaveEmails} className="gap-1.5 min-w-[110px]">
                      {emailSaved ? (
                        <>
                          <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                          Gespeichert!
                        </>
                      ) : (
                        'Speichern'
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Gespeicherte Adressen erscheinen im Fehler-Popup als Empfaenger.
                    </p>
                  </div>
                </div>
              </TabsContent>

              {/* Tab 4: PDF-Parser */}
              <TabsContent value="parser" className="mt-0 space-y-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">PDF-Parser</div>

                <div className="border-t border-border pt-3 space-y-2">
                  <Label className="text-sm font-semibold flex items-center gap-1">
                    Parser-Regex
                    {activeParser?.ready && (
                      <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                    )}
                  </Label>
                  <Select
                    value={activeParser?.parserId ?? 'auto'}
                    onValueChange={(value) => onParserChange?.(value)}
                  >
                    <SelectTrigger className="h-9 text-sm bg-white" style={{ borderColor: '#666666' }}>
                      <SelectValue placeholder="Parser waehlen..." />
                    </SelectTrigger>
                    <SelectContent className="bg-popover">
                      {showParserAutoOption && (
                        <SelectItem value="auto">Auto</SelectItem>
                      )}
                      {(activeParser?.modules ?? []).map((parser) => (
                        <SelectItem key={parser.moduleId} value={parser.moduleId}>
                          {parser.moduleName} v{parser.version}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* [D] Letzte Diagnose Step 1 */}
                <div className="border-t border-border pt-3">
                  <DiagnosticsBlock diag={latestDiagnostics[1]} />
                </div>

                <div className="border-t border-border pt-3 space-y-2">
                  <Label className="text-sm font-semibold">Parser-Import</Label>
                  <FooterButton onClick={handleImportClick}>
                    <Upload className="w-4 h-4" />
                    Parser importieren
                  </FooterButton>
                  <p className="text-xs text-muted-foreground">
                    Achtung – App muss neu geladen werden, um Aenderungen anzuzeigen.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".ts"
                    className="hidden"
                    onChange={handleFileSelected}
                  />
                </div>

                {/* Parser-Verwaltung */}
                <div className="flex flex-col gap-3 border-t border-border pt-3">
                  <Label className="text-sm font-semibold">Parser-Verwaltung</Label>
                  <Select value={parserToDelete} onValueChange={setParserToDelete}>
                    <SelectTrigger className="h-9 text-sm bg-white" style={{ borderColor: '#666666' }}>
                      <SelectValue placeholder="Parser waehlen..." />
                    </SelectTrigger>
                    <SelectContent className="bg-popover">
                      {parsers.map((p) => (
                        <SelectItem key={p.moduleId} value={p.moduleId}>
                          {p.moduleName} v{p.version}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex gap-2">
                    <FooterButton
                      onClick={() => setDeleteConfirmOpen(true)}
                      disabled={!parserToDelete || parsers.length <= 1}
                      danger
                    >
                      <Trash2 className="w-4 h-4" />
                      Entfernen
                    </FooterButton>
                    <FooterButton onClick={handleOpenFolder}>
                      <FolderOpen className="w-4 h-4" />
                      Ordner oeffnen
                    </FooterButton>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Achtung – App wird nach Aenderung neu geladen, um die Registry zu aktualisieren.
                  </p>
                </div>
              </TabsContent>

              {/* Tab 4: Artikel extrahieren (Matcher) */}
              <TabsContent value="matcher" className="mt-0 space-y-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Artikel extrahieren</div>

                <div className="border-t border-border pt-3 space-y-2">
                  <Label className="text-sm font-semibold flex items-center gap-1">
                    Matcher
                    {activeMatcher?.ready && (
                      <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                    )}
                  </Label>
                  <Select
                    value={activeMatcher?.matcherId ?? 'auto'}
                    onValueChange={(value) => onMatcherChange?.(value)}
                  >
                    <SelectTrigger className="h-9 text-sm bg-white" style={{ borderColor: '#666666' }}>
                      <SelectValue placeholder="Matcher waehlen..." />
                    </SelectTrigger>
                    <SelectContent className="bg-popover">
                      {showMatcherAutoOption && (
                        <SelectItem value="auto">Auto</SelectItem>
                      )}
                      {(activeMatcher?.modules ?? []).map((matcher) => (
                        <SelectItem key={matcher.moduleId} value={matcher.moduleId}>
                          {matcher.moduleName} v{matcher.version}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* [C] Custom Override Toggle + Anpassen-Button */}
                <div className="flex items-center justify-between gap-4 border-t border-border pt-3">
                  <div className="space-y-1">
                    <Label className="text-sm whitespace-nowrap">Custom Override aktiv</Label>
                    <p className="text-xs text-muted-foreground">
                      Alias-Listen und Regex-Felder fuer geaenderte Stammdaten-Strukturen anpassen.
                    </p>
                  </div>
                  <Switch
                    checked={matcherOverrideEnabled}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setGlobalConfig({ matcherProfileOverrides: { enabled: true, ...matcherProfileOverrides } });
                      } else {
                        setGlobalConfig({ matcherProfileOverrides: { ...matcherProfileOverrides, enabled: false } });
                      }
                    }}
                  />
                </div>
                {matcherOverrideEnabled && (
                  <div className="flex gap-2">
                    <FooterButton onClick={() => openOverrideModal(2)}>
                      Bearbeiten
                    </FooterButton>
                    <FooterButton onClick={handleResetMatcherOverrides}>
                      Zurücksetzen
                    </FooterButton>
                  </div>
                )}

                {/* [D] Letzte Diagnose Step 2 */}
                <div className="border-t border-border pt-3">
                  <DiagnosticsBlock diag={latestDiagnostics[2]} />
                </div>

                {/* [F] Block-Toggle Step 2 */}
                <div className="flex items-center justify-between gap-4 border-t border-border pt-3">
                  <div className="space-y-1">
                    <Label className="text-sm whitespace-nowrap">Preisabweichungen blockieren Step 2</Label>
                    <p className="text-xs text-muted-foreground">
                      Wenn aktiv: Step 2 kann nicht abgeschlossen werden, solange Preis-Fehler offen sind.
                    </p>
                  </div>
                  <Switch
                    checked={blockStep2OnPriceMismatch}
                    onCheckedChange={(checked) => setGlobalConfig({ blockStep2OnPriceMismatch: checked })}
                  />
                </div>
              </TabsContent>

              {/* Tab 5: Serial parsen */}
              <TabsContent value="serial" className="mt-0 space-y-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Serial parsen</div>

                <div className="border-t border-border pt-3 space-y-2">
                  <Label className="text-sm font-semibold flex items-center gap-1">
                    Aktiver Serial-Finder
                    {serialFinderReady && (
                      <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                    )}
                  </Label>
                  <Select
                    value={activeSerialFinderId}
                    onValueChange={(v) => setGlobalConfig({ activeSerialFinderId: v })}
                  >
                    <SelectTrigger className="h-9 text-sm bg-white" style={{ borderColor: '#666666' }}>
                      <SelectValue placeholder="Serial-Finder waehlen..." />
                    </SelectTrigger>
                    <SelectContent className="bg-popover">
                      {serialFinderOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* [D] Letzte Diagnose Step 3 */}
                <div className="border-t border-border pt-3">
                  <DiagnosticsBlock diag={latestDiagnostics[3]} />
                </div>

                <div className="flex items-center justify-between gap-4 border-t border-border pt-3">
                  <div className="space-y-1">
                    <Label className="text-sm whitespace-nowrap">Pflicht-S/N blockiert Step 3</Label>
                    <p className="text-xs text-muted-foreground">
                      Wenn aktiv: bei fehlenden Pflicht-Seriennummern wird Step 3 auf failed gesetzt.
                    </p>
                  </div>
                  <Switch
                    checked={strictSerialRequiredFailure}
                    onCheckedChange={(checked) => setGlobalConfig({ strictSerialRequiredFailure: checked })}
                  />
                </div>
              </TabsContent>

              {/* Tab 6: Bestellung mappen */}
              <TabsContent value="ordermapper" className="mt-0 space-y-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Bestellung mappen</div>

                <div className="border-t border-border pt-3 space-y-2">
                  <Label className="text-sm font-semibold flex items-center gap-1">
                    Aktiver OrderMapper
                    {orderMapperReady && (
                      <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                    )}
                  </Label>
                  <Select
                    value={activeOrderMapperId}
                    onValueChange={(v) => setGlobalConfig({ activeOrderMapperId: v })}
                  >
                    <SelectTrigger className="h-9 text-sm bg-white" style={{ borderColor: '#666666' }}>
                      <SelectValue placeholder="OrderMapper waehlen..." />
                    </SelectTrigger>
                    <SelectContent className="bg-popover">
                      {orderMapperOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="border-t border-border pt-3 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <Label className="text-sm whitespace-nowrap">Order-Parser-Profil</Label>
                    <Select
                      value={activeOrderParserProfileId}
                      onValueChange={(value) => setGlobalConfig({ activeOrderParserProfileId: value })}
                    >
                      <SelectTrigger className="h-8 w-44 text-sm bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover">
                        {ORDER_PARSER_PROFILES.map((profile) => (
                          <SelectItem key={profile.id} value={profile.id}>
                            {profile.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <Label className="text-sm whitespace-nowrap">Custom Override aktiv</Label>
                      <p className="text-xs text-muted-foreground">
                        Aliaslisten fuer geaenderte Excel-/CSV-Strukturen manuell anpassen.
                      </p>
                    </div>
                    <Switch
                      checked={customOrderParserOverrideEnabled}
                      onCheckedChange={toggleCustomOrderParserOverrides}
                    />
                  </div>

                  {customOrderParserOverrideEnabled && (
                    <FooterButton onClick={() => openOverrideModal(4)}>
                      Anpassen
                    </FooterButton>
                  )}

                  {/* [D] Letzte Diagnose Step 4 — migrated to latestDiagnostics */}
                  <div className="border-t border-border pt-3">
                    <DiagnosticsBlock diag={latestDiagnostics[4]} />
                  </div>

                </div>

              </TabsContent>

              {/* PROJ-35: Tab 7 — Export-Konfiguration */}
              <ExportConfigTab />

            </div>
          </Tabs>

          {/* PROJ-22 B4: "Schliessen" link */}
          <div className="flex justify-end pt-3 border-t border-border mt-2">
            <button
              type="button"
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
              onClick={() => onOpenChange(false)}
            >
              Schliessen
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PROJ-28 Phase C: Override Editor Modal (Step 2 + Step 4) */}
      <OverrideEditorModal
        open={overrideModalOpen}
        onOpenChange={setOverrideModalOpen}
        stepNo={overrideModalStep}
        matcherOverrides={globalConfig.matcherProfileOverrides}
        onSaveMatcherOverrides={handleSaveMatcherOverrides}
        orderParserProfile={effectiveOrderParserProfile}
        orderParserOverrides={globalConfig.orderParserProfileOverrides}
        onSaveOrderParserOverrides={handleSaveOrderParserOverrides}
      />

      {/* Import Success AlertDialog */}
      <AlertDialog open={importSuccessOpen}>
        <AlertDialogContent
          style={{ backgroundColor: '#D8E6E7' }}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Parser erfolgreich importiert</AlertDialogTitle>
            <AlertDialogDescription>
              Die Datei „{importedFileName}" wurde importiert und in der Registry registriert.
              <br /><br />
              Die Seite muss aktualisiert werden, damit der neue Parser verfuegbar ist.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setImportSuccessOpen(false)}>
              Verstanden
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => window.location.reload()}>
              Refresh
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Parser Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent style={{ backgroundColor: '#D8E6E7' }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Parser wirklich loeschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Der Parser '{selectedParserName}' wird unwiderruflich entfernt. Die App wird anschliessend neu geladen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteParser}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cache Clear Confirmation */}
      <AlertDialog open={cacheConfirmOpen} onOpenChange={setCacheConfirmOpen}>
        <AlertDialogContent style={{ backgroundColor: '#D8E6E7' }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Speicher / Cache leeren?</AlertDialogTitle>
            <AlertDialogDescription>
              Cache-Daten (Uploads, Logs, geparste Rechnungen) werden gelöscht. Einstellungen und Archivdaten bleiben erhalten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearCache}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Leeren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* PROJ-27 ADD-ON Pillar 3: Force-Archivierung Bestätigung */}
      <AlertDialog open={archiveForceConfirmOpen} onOpenChange={setArchiveForceConfirmOpen}>
        <AlertDialogContent style={{ backgroundColor: '#D8E6E7' }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Komplettes Archiv erzwingen?</AlertDialogTitle>
            <AlertDialogDescription>
              Sind Sie sicher das alle aktuellen Daten lokal gesichert, allerdings vollständig aus dem internen Langzeitspeicher entfernt werden sollen? Fortfahren?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleArchiveForceAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Archivieren &amp; löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

