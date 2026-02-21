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

import { useState, useRef, useEffect } from 'react';
import { useRunStore } from '@/store/runStore';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
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
import { Upload, FolderOpen, Trash2, CheckCircle, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { getAllParsers } from '@/services/parsers';
import { parserRegistryService, type ParserRegistryModule } from '@/services/parserRegistryService';
import { getMatcher } from '@/services/matchers';
import type { MatcherRegistryModule } from '@/services/matcherRegistryService';
import { logService } from '@/services/logService';

interface SettingsPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

/** Hover-style helper button (matching app design) */
function FooterButton({
  onClick,
  children,
  danger = false,
  disabled = false,
}: {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="h-9 px-4 text-sm rounded-md flex items-center justify-center gap-2 transition-colors border disabled:opacity-40 disabled:cursor-not-allowed"
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

export function SettingsPopup({ open, onOpenChange, activeParser, activeMatcher }: SettingsPopupProps) {
  const { globalConfig, setGlobalConfig } = useRunStore();
  const [importSuccessOpen, setImportSuccessOpen] = useState(false);
  const [importedFileName, setImportedFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const activeParserDisplayName = activeParser?.parserId === 'auto'
    ? 'Auto'
    : activeParser?.modules.find(m => m.moduleId === activeParser.parserId)?.moduleName
      || activeParser?.parserId || '–';
  const activeMatcherDisplayName = activeMatcher?.matcherId === 'auto'
    ? 'Auto'
    : activeMatcher?.modules.find(m => m.moduleId === activeMatcher.matcherId)?.moduleName
      || activeMatcher?.matcherId || '–';
  const resolvedMatcher = activeMatcher?.matcherId
    ? getMatcher(activeMatcher.matcherId)
    : undefined;

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

          {/* PROJ-22 B4: Vertikales Tab-Menu mit 6 Tabs */}
          <Tabs defaultValue="overview" orientation="vertical" className="flex gap-4 mt-2">
            <TabsList
              className="flex flex-col h-auto items-start justify-start gap-0.5 p-1 w-44 shrink-0"
              style={{ backgroundColor: '#c9c3b6', borderRadius: '0.5rem' }}
            >
              <TabsTrigger value="overview"    className="w-full justify-start text-left text-sm px-3 py-2">Uebersicht</TabsTrigger>
              <TabsTrigger value="general"     className="w-full justify-start text-left text-sm px-3 py-2">Allgemein</TabsTrigger>
              <TabsTrigger value="parser"      className="w-full justify-start text-left text-sm px-3 py-2">PDF-Parser</TabsTrigger>
              <TabsTrigger value="matcher"     className="w-full justify-start text-left text-sm px-3 py-2">Artikel extrahieren</TabsTrigger>
              <TabsTrigger value="serial"      className="w-full justify-start text-left text-sm px-3 py-2">Serial parsen</TabsTrigger>
              <TabsTrigger value="ordermapper" className="w-full justify-start text-left text-sm px-3 py-2">Bestellung mappen</TabsTrigger>
            </TabsList>

            <div className="flex-1 min-h-[280px]">
              {/* Tab 1: Uebersicht */}
              <TabsContent value="overview" className="mt-0 space-y-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Uebersicht</div>

                {/* Logfile-Button (moved from AppFooter) */}
                <FooterButton onClick={handleShowLogfile}>
                  <FileText className="w-4 h-4" />
                  Logfile oeffnen
                </FooterButton>

                {/* Aktiver Parser */}
                {activeParser?.ready && (
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span>Aktiver Parser</span>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                      <span>{activeParserDisplayName}</span>
                    </div>
                  </div>
                )}

                {/* Aktiver Matcher */}
                {activeMatcher?.ready && (
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span>Aktiver Matcher</span>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                      <span>{activeMatcherDisplayName}</span>
                    </div>
                  </div>
                )}

                {/* Speicher/Cache leeren */}
                <div className="border-t border-border pt-3">
                  <FooterButton onClick={() => setCacheConfirmOpen(true)} danger>
                    <Trash2 className="w-4 h-4" />
                    Speicher / Cache leeren
                  </FooterButton>
                  <p className="text-xs text-muted-foreground mt-1">
                    Loescht alle localStorage-Daten und laedt die Seite neu.
                  </p>
                </div>
              </TabsContent>

              {/* Tab 2: Allgemein */}
              <TabsContent value="general" className="mt-0 space-y-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Allgemein</div>

                {/* Maussperre */}
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

                {/* Preisbasis */}
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

                {/* Waehrung */}
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

                {/* Toleranz */}
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
              </TabsContent>

              {/* Tab 3: PDF-Parser */}
              <TabsContent value="parser" className="mt-0 space-y-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">PDF-Parser</div>

                {/* Parser importieren */}
                <div className="flex flex-col gap-2">
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

                {/* Aktiver Matcher read-only display */}
                {activeMatcher?.ready && (
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span>Aktiver Matcher</span>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                      <span>{activeMatcherDisplayName}</span>
                    </div>
                  </div>
                )}

                {/* Matcher Schema */}
                {resolvedMatcher && (
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm font-semibold">Schema: {resolvedMatcher.schemaDefinition.name}</Label>
                    <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto">
                      {resolvedMatcher.schemaDefinition.fields.map((field) => (
                        <div key={field.fieldId} className="flex items-start gap-2">
                          <span className="text-xs font-medium min-w-[90px]">{field.label}:</span>
                          <div className="flex flex-wrap gap-1">
                            {field.aliases.map((alias) => (
                              <span
                                key={alias}
                                className="inline-block px-1.5 py-0.5 text-[10px] rounded bg-white/70 border border-border"
                              >
                                {alias}
                              </span>
                            ))}
                            {field.validationPattern && (
                              <span
                                title={`Validierung: /${field.validationPattern}/`}
                                className="inline-block px-1.5 py-0.5 text-[10px] rounded bg-amber-100 border border-amber-300 text-amber-700 font-mono"
                              >
                                /{field.validationPattern}/
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Tab 5: Serial parsen */}
              <TabsContent value="serial" className="mt-0 space-y-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Serial parsen</div>

                <div className="flex items-center justify-between gap-4">
                  <Label className="text-sm whitespace-nowrap">Aktiver Serial-Finder</Label>
                  <Select
                    value={globalConfig.activeSerialFinderId ?? 'default'}
                    onValueChange={(v) => setGlobalConfig({ activeSerialFinderId: v })}
                  >
                    <SelectTrigger className="h-8 w-36 text-sm bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover">
                      <SelectItem value="default">Standard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

              {/* Tab 6: Bestellung mappen */}
              <TabsContent value="ordermapper" className="mt-0 space-y-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Bestellung mappen</div>

                <div className="flex items-center justify-between gap-4">
                  <Label className="text-sm whitespace-nowrap">Aktiver OrderMapper</Label>
                  <Select
                    value={globalConfig.activeOrderMapperId ?? 'waterfall-4'}
                    onValueChange={(v) => setGlobalConfig({ activeOrderMapperId: v })}
                  >
                    <SelectTrigger className="h-8 w-40 text-sm bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover">
                      <SelectItem value="legacy-3">Legacy (3 Regeln)</SelectItem>
                      <SelectItem value="waterfall-4">Wasserfall (4 Stufen)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Archiv synchronisieren placeholder */}
                <div className="border-t border-border pt-3">
                  <FooterButton onClick={() => toast.info('Archiv-Synchronisation — kommt in PROJ-23 A2')}>
                    Archiv synchronisieren
                  </FooterButton>
                  <p className="text-xs text-muted-foreground mt-1">
                    Exportiert alle Runs als JSON in einen lokalen Ordner (PROJ-23).
                  </p>
                </div>
              </TabsContent>
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
