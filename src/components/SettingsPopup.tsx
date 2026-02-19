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
import { Upload, FolderOpen, Trash2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { getAllParsers } from '@/services/parsers';
import { parserRegistryService, type ParserRegistryModule } from '@/services/parserRegistryService';
import { getMatcher } from '@/services/matchers';
import type { MatcherRegistryModule } from '@/services/matcherRegistryService';

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

export function SettingsPopup({ open, onOpenChange, activeParser, activeMatcher }: SettingsPopupProps) {
  const { globalConfig, setGlobalConfig } = useRunStore();
  const [importSuccessOpen, setImportSuccessOpen] = useState(false);
  const [importedFileName, setImportedFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parser-Verwaltung state
  const [parserToDelete, setParserToDelete] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
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

    // Reset file input so same file can be re-selected
    e.target.value = '';

    // Validation: file extension
    if (!file.name.endsWith('.ts')) {
      toast.error('Nur .ts-Dateien werden unterstuetzt');
      return;
    }

    // Validation: file size (max 1 MB)
    if (file.size > 1024 * 1024) {
      toast.error('Parser-Datei zu gross (max. 1 MB)');
      return;
    }

    // Validation: basic heuristic - read file and check for moduleId
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content.includes('moduleId')) {
        toast.error('Ungueltige Parser-Datei: "moduleId" nicht gefunden');
        return;
      }

      // --- MOCK: Actual file copy + registry update is backend work ---
      // For now, just show the success dialog
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

    // Derive the file name from moduleId (convention: moduleId matches class name)
    const fileName = `${parserToDelete}.ts`;

    try {
      // 1. Delete file + clean index.ts via Vite dev endpoint
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

      // 2. Wipe registry JSON
      await parserRegistryService.wipeRegistry();

      // 3. Reload app
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

  // Selected parser display name for confirmation dialog
  const selectedParserName = parsers.find(p => p.moduleId === parserToDelete)?.moduleName || parserToDelete;

  // Active parser display name (from footer props)
  const activeParserDisplayName = activeParser?.parserId === 'auto'
    ? 'Auto'
    : activeParser?.modules.find(m => m.moduleId === activeParser.parserId)?.moduleName
      || activeParser?.parserId || '–';

  // Active matcher display name + schema
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
        <DialogContent
          className="sm:max-w-[420px]"
          style={{ backgroundColor: '#D8E6E7' }}
        >
          <DialogHeader>
            <DialogTitle>Einstellungen</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Maussperre */}
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="settings-clickLock" className="text-sm whitespace-nowrap">
                Maussperre (SEK.)
              </Label>
              <Select
                value={(globalConfig.clickLockSeconds ?? 0).toFixed(1)}
                onValueChange={(v) => setGlobalConfig({ clickLockSeconds: parseFloat(v) })}
              >
                <SelectTrigger id="settings-clickLock" className="h-8 w-28 text-sm bg-white">
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
              <Label htmlFor="settings-priceBasis" className="text-sm whitespace-nowrap">
                Preisbasis
              </Label>
              <Select
                value={globalConfig.priceBasis}
                onValueChange={(value: 'Net' | 'Gross') =>
                  setGlobalConfig({ priceBasis: value })
                }
              >
                <SelectTrigger id="settings-priceBasis" className="h-8 w-28 text-sm bg-white">
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
              <Label htmlFor="settings-currency" className="text-sm whitespace-nowrap">
                Waehrung
              </Label>
              <Select
                value="EUR"
                onValueChange={() => {}}
              >
                <SelectTrigger id="settings-currency" className="h-8 w-28 text-sm bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="EUR">Euro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Toleranz */}
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="settings-tolerance" className="text-sm whitespace-nowrap">
                Toleranz (EUR)
              </Label>
              <Input
                id="settings-tolerance"
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

            {/* Separator */}
            <div className="border-t border-border my-1" />

            {/* Parser importieren */}
            <div className="flex flex-col gap-2">
              <button
                onClick={handleImportClick}
                className="h-9 px-4 text-sm rounded-md flex items-center justify-center gap-2 transition-colors border"
                style={{
                  backgroundColor: '#c9c3b6',
                  borderColor: '#666666',
                  color: '#666666',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#008C99';
                  e.currentTarget.style.color = '#FFFFFF';
                  e.currentTarget.style.borderColor = '#D8E6E7';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#c9c3b6';
                  e.currentTarget.style.color = '#666666';
                  e.currentTarget.style.borderColor = '#666666';
                }}
              >
                <Upload className="w-4 h-4" />
                Parser importieren
              </button>
              <p className="text-xs text-muted-foreground">
                Achtung – App muss neu geladen werden, um Aenderungen anzuzeigen.
              </p>
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".ts"
                className="hidden"
                onChange={handleFileSelected}
              />
            </div>

            {/* Aktiver Parser (read-only) */}
            {activeParser?.ready && (
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm whitespace-nowrap">Aktiver Parser</Label>
                <div className="flex items-center gap-1.5 text-sm">
                  <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                  <span>{activeParserDisplayName}</span>
                </div>
              </div>
            )}

            {/* Aktiver Matcher (read-only) */}
            {activeMatcher?.ready && (
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm whitespace-nowrap">Aktiver Matcher</Label>
                <div className="flex items-center gap-1.5 text-sm">
                  <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                  <span>{activeMatcherDisplayName}</span>
                </div>
              </div>
            )}

            {/* Matcher Schema (read-only) */}
            {resolvedMatcher && (
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-semibold">Matcher Schema: {resolvedMatcher.schemaDefinition.name}</Label>
                <div className="grid grid-cols-1 gap-1.5">
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
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Separator */}
            <div className="border-t border-border my-1" />

            {/* Parser-Verwaltung */}
            <div className="flex flex-col gap-3">
              <Label className="text-sm font-semibold">Parser-Verwaltung</Label>

              {/* Parser-Dropdown */}
              <Select
                value={parserToDelete}
                onValueChange={setParserToDelete}
              >
                <SelectTrigger
                  className="h-9 text-sm bg-white"
                  style={{ borderColor: '#666666' }}
                >
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

              {/* Button row: Entfernen + Ordner oeffnen */}
              <div className="flex gap-2">
                <button
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={!parserToDelete || parsers.length <= 1}
                  className="h-9 px-4 text-sm rounded-md flex items-center justify-center gap-2 transition-colors border disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: '#c9c3b6',
                    borderColor: '#666666',
                    color: '#666666',
                  }}
                  onMouseEnter={(e) => {
                    if (!e.currentTarget.disabled) {
                      e.currentTarget.style.backgroundColor = '#008C99';
                      e.currentTarget.style.color = '#FFFFFF';
                      e.currentTarget.style.borderColor = '#D8E6E7';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#c9c3b6';
                    e.currentTarget.style.color = '#666666';
                    e.currentTarget.style.borderColor = '#666666';
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                  Entfernen
                </button>

                <button
                  onClick={handleOpenFolder}
                  className="h-9 px-4 text-sm rounded-md flex items-center justify-center gap-2 transition-colors border"
                  style={{
                    backgroundColor: '#c9c3b6',
                    borderColor: '#666666',
                    color: '#666666',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#008C99';
                    e.currentTarget.style.color = '#FFFFFF';
                    e.currentTarget.style.borderColor = '#D8E6E7';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#c9c3b6';
                    e.currentTarget.style.color = '#666666';
                    e.currentTarget.style.borderColor = '#666666';
                  }}
                >
                  <FolderOpen className="w-4 h-4" />
                  Ordner oeffnen
                </button>
              </div>

              <p className="text-xs text-muted-foreground">
                Achtung – App wird nach Aenderung neu geladen, um die Registry zu aktualisieren.
              </p>
            </div>
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

      {/* Delete Confirmation AlertDialog */}
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
            <AlertDialogAction onClick={handleDeleteParser}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
