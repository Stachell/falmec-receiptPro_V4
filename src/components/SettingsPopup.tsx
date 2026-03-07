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
import { Upload, FolderOpen, Trash2, CheckCircle, GripVertical, ChevronUp, ChevronDown, Save } from 'lucide-react';
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
import { getStoredEmailAddresses, saveEmailAddresses, isValidEmail } from '@/lib/errorHandlingConfig';

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

type SettingsTabKey = 'general' | 'parser' | 'matcher' | 'serial' | 'ordermapper' | 'export' | 'overview';

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
  const { columnOrder, isDirty, moveColumn, saveConfig, resetToDefault, lastDiagnostics, csvDelimiter, setCsvDelimiter } = useExportConfigStore();

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

  // PROJ-39: Fehlerhandling email addresses (5 slots)
  const [emailAddresses, setEmailAddresses] = useState<string[]>(['', '', '', '', '']);
  const handleUpdateAddress = (index: number, value: string) => {
    setEmailAddresses(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };
  const handleSaveEmails = () => {
    saveEmailAddresses(emailAddresses);
    toast.success('E-Mail-Adressen gespeichert');
  };

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  // PROJ-39: Load stored emails when popup opens
  useEffect(() => {
    if (open) {
      const stored = getStoredEmailAddresses();
      const slots: string[] = ['', '', '', '', ''];
      stored.forEach((addr, i) => { if (i < 5) slots[i] = addr; });
      setEmailAddresses(slots);
    }
  }, [open]);

  // Parser-Verwaltung state
  const [parserToDelete, setParserToDelete] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [cacheConfirmOpen, setCacheConfirmOpen] = useState(false);
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

  const handleClearCache = () => {
    // Clear localStorage + reload
    try {
      localStorage.clear();
      toast.success('Speicher/Cache geleert');
      setTimeout(() => window.location.reload(), 800);
    } catch {
      toast.error('Cache konnte nicht geleert werden');
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
          className="max-w-[600px] w-full"
          style={{ backgroundColor: '#D8E6E7' }}
        >
          <DialogHeader>
            <DialogTitle>Einstellungen</DialogTitle>
          </DialogHeader>

          {/* PROJ-22 B4: Vertikales Tab-Menu */}
          {/* PROJ-35: feste Hoehe gegen Layout-Shift beim Tab-Wechsel */}
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as SettingsTabKey)}
            orientation="vertical"
            className="flex gap-4 mt-2 h-[65vh] max-h-[800px]"
          >
            <TabsList
              className="flex flex-col h-auto items-start justify-start gap-0.5 p-1 w-44 shrink-0"
              style={{ backgroundColor: '#c9c3b6', borderRadius: '0.5rem' }}
            >
              <TabsTrigger value="general"     className="w-full justify-start text-left text-sm px-3 py-2">Allgemein</TabsTrigger>
              <TabsTrigger value="parser"      className="w-full justify-start text-left text-sm px-3 py-2">PDF-Parser</TabsTrigger>
              <TabsTrigger value="matcher"     className="w-full justify-start text-left text-sm px-3 py-2">Artikel extrahieren</TabsTrigger>
              <TabsTrigger value="serial"      className="w-full justify-start text-left text-sm px-3 py-2">Serial parsen</TabsTrigger>
              <TabsTrigger value="ordermapper" className="w-full justify-start text-left text-sm px-3 py-2">Bestellung mappen</TabsTrigger>
              <TabsTrigger value="export"      className="w-full justify-start text-left text-sm px-3 py-2">Export</TabsTrigger>
              <TabsTrigger value="overview"    className="w-full justify-start text-left text-sm px-3 py-2">Speicher/Cache</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto">
              {/* Tab 1: Speicher/Cache */}
              <TabsContent value="overview" className="mt-0 space-y-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Speicher/Cache</div>

                {/* Speicher/Cache leeren */}
                <div className="border-t border-border pt-3 space-y-2">
                  <Label className="text-sm font-semibold">Local-Storge / Cache leeren</Label>
                  <FooterButton onClick={() => setCacheConfirmOpen(true)} danger>
                    <Trash2 className="w-4 h-4" />
                    Speicher / Cache leeren
                  </FooterButton>
                  <p className="text-xs text-muted-foreground mt-1">
                    Loescht alle localStorage-Daten und laedt die Seite neu.
                  </p>
                </div>

                <div className="border-t border-border pt-3 space-y-2">
                  <Label className="text-sm font-semibold">Archiv leeren</Label>
                  <FooterButton onClick={() => toast.info('Archiv-Synchronisation - kommt in PROJ-23 A2')}>
                    Archiv synchronisieren
                  </FooterButton>
                  <p className="text-xs text-muted-foreground mt-1">
                    Exportiert alle Runs als JSON in einen lokalen Ordner (PROJ-23).
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

                {/* PROJ-39: Separator 3 — Fehlerhandling */}
                <div className="border-t border-border pt-3 space-y-3">
                  <Label className="text-sm font-semibold">Fehlerhandling</Label>
                  <p className="text-xs text-muted-foreground">
                    E-Mail-Adressen fuer Fehlerweiterleitung
                  </p>

                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center justify-between gap-4">
                      <Label className="text-sm whitespace-nowrap">Adresse {i + 1}</Label>
                      <Input
                        type="email"
                        value={emailAddresses[i] ?? ''}
                        onChange={(e) => handleUpdateAddress(i, e.target.value)}
                        placeholder="name@firma.de"
                        className={`h-8 flex-1 max-w-[280px] text-sm bg-white ${
                          emailAddresses[i] && !isValidEmail(emailAddresses[i])
                            ? 'border-amber-400'
                            : ''
                        }`}
                      />
                    </div>
                  ))}

                  <div className="flex items-center gap-3">
                    <Button size="sm" onClick={handleSaveEmails}>Speichern</Button>
                    <p className="text-xs text-muted-foreground">
                      Gespeicherte Adressen erscheinen im Fehler-Popup als Empfaenger.
                    </p>
                  </div>
                </div>
              </TabsContent>

              {/* Tab 3: PDF-Parser */}
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
                  <FooterButton onClick={() => openOverrideModal(2)}>
                    Anpassen
                  </FooterButton>
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
              Alle localStorage-Daten werden geloescht. Runs, Einstellungen und Protokolle gehen verloren.
              Diese Aktion kann nicht rueckgaengig gemacht werden.
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
    </>
  );
}
