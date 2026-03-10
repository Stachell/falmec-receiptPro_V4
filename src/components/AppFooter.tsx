import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useClickLock } from '@/hooks/useClickLock';
import { SlidersHorizontal, ChevronsDown, AlertTriangle, FolderOpen, CheckCircle, Settings, BookOpen, Download } from 'lucide-react';
import { useExportConfigStore, DEFAULT_COLUMN_ORDER } from '@/store/exportConfigStore';
import { useRunStore } from '@/store/runStore';
import { Label } from '@/components/ui/label';
import { fileSystemService } from '@/services/fileSystemService';
import { parserRegistryService, type ParserRegistryModule } from '@/services/parserRegistryService';
import { matcherRegistryService, type MatcherRegistryModule } from '@/services/matcherRegistryService';
import { getParser } from '@/services/parsers';
import { getMatcher } from '@/services/matchers';
import { SettingsPopup } from '@/components/SettingsPopup';
import { IconGuidePopup } from '@/components/IconGuidePopup';
import { logService } from '@/services/logService';

const DEFAULT_DATA_PATH = 'nicht gewaehlt';

// Hover style constants
const HOVER_BG = '#008C99';
const HOVER_TEXT = '#FFFFFF';
const HOVER_BORDER = '#D8E6E7';
type SettingsTabKey = 'general' | 'errorhandling' | 'parser' | 'matcher' | 'serial' | 'ordermapper' | 'export' | 'overview' | 'misc';

export function AppFooter() {
  const [isOpen, setIsOpen] = useState(false);
  const [dataPath, setDataPath] = useState(DEFAULT_DATA_PATH);
  const [hasWarning, setHasWarning] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [, setIsSelectingFolder] = useState(false);
  const [isToggleHovered, setIsToggleHovered] = useState(false);
  const [isSettingsHovered, setIsSettingsHovered] = useState(false);
  const [isGuideHovered, setIsGuideHovered] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [isDataPathHovered, setIsDataPathHovered] = useState(false);
  const [hoveredStatusKey, setHoveredStatusKey] = useState<null | 'parser' | 'matcher' | 'serial' | 'ordermapper' | 'export'>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTabKey>('overview');
  const [selectedParserId, setSelectedParserId] = useState('auto');
  const [registryModules, setRegistryModules] = useState<ParserRegistryModule[]>([]);
  const [parserReady, setParserReady] = useState(false);
  const [selectedMatcherId, setSelectedMatcherId] = useState('auto');
  const [matcherModules, setMatcherModules] = useState<MatcherRegistryModule[]>([]);
  const [matcherReady, setMatcherReady] = useState(false);
  const globalConfig = useRunStore((state) => state.globalConfig);
  const { wrap, isLocked } = useClickLock();

  // Initialize data path from fileSystemService
  useEffect(() => {
    const savedPath = fileSystemService.getDataPath();
    if (savedPath) {
      setDataPath(savedPath);
      setIsConfigured(true);
    }
  }, []);

  // Initialize parser registry (boot validation + auto-select)
  useEffect(() => {
    parserRegistryService.initialize().then((registry) => {
      setSelectedParserId(registry.selectedParserId);
      setRegistryModules(registry.modules);
    });
  }, []);

  // Initialize matcher registry (boot validation + auto-select)
  useEffect(() => {
    matcherRegistryService.initialize().then((registry) => {
      setSelectedMatcherId(registry.selectedMatcherId);
      setMatcherModules(registry.modules);
    });
  }, []);

  // Compute parserReady: true only when registry has modules AND selected parser is valid
  useEffect(() => {
    const hasModules = registryModules.length > 0;
    const resolvedParser = getParser(selectedParserId);
    setParserReady(hasModules && resolvedParser !== undefined);
  }, [registryModules, selectedParserId]);

  // Compute matcherReady: true only when registry has modules AND selected matcher is valid
  useEffect(() => {
    const hasModules = matcherModules.length > 0;
    const resolvedMatcher = getMatcher(selectedMatcherId);
    setMatcherReady(hasModules && resolvedMatcher !== undefined);
  }, [matcherModules, selectedMatcherId]);

  const handleDataPathChange = async () => {
    setIsSelectingFolder(true);
    const result = await fileSystemService.selectDirectory();
    setIsSelectingFolder(false);
    if (result.success) {
      setDataPath(result.path);
      setIsConfigured(true);
    }
  };

  const handleParserChange = (parserId: string) => {
    const prev = selectedParserId;
    setSelectedParserId(parserId);

    // Persist to parser-registry.json (fire-and-forget)
    parserRegistryService.setSelectedParserId(parserId);

    // Log parser change
    if (prev !== parserId) {
      const prevName = prev === 'auto' ? 'Auto' : registryModules.find(p => p.moduleId === prev)?.moduleName || prev;
      const newName = parserId === 'auto' ? 'Auto' : registryModules.find(p => p.moduleId === parserId)?.moduleName || parserId;
      logService.info(`Parser gewechselt: ${prevName} → ${newName}`, { step: 'System' });
    }
  };

  const handleMatcherChange = (matcherId: string) => {
    const prev = selectedMatcherId;
    setSelectedMatcherId(matcherId);

    matcherRegistryService.setSelectedMatcherId(matcherId);

    if (prev !== matcherId) {
      const prevName = prev === 'auto' ? 'Auto' : matcherModules.find(m => m.moduleId === prev)?.moduleName || prev;
      const newName = matcherId === 'auto' ? 'Auto' : matcherModules.find(m => m.moduleId === matcherId)?.moduleName || matcherId;
      logService.info(`Matcher gewechselt: ${prevName} → ${newName}`, { step: 'System' });
    }
  };

  const openSettingsAtTab = (tab: SettingsTabKey) => {
    setSettingsInitialTab(tab);
    setSettingsOpen(true);
  };

  const closeFooter = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (isOpen) {
      // Auto-close after 3 minutes (180000ms)
      timer = setTimeout(() => {
        closeFooter();
      }, 180000);
    }

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [isOpen, closeFooter]);

  const activeParserDisplayName = selectedParserId === 'auto'
    ? 'Auto'
    : registryModules.find((p) => p.moduleId === selectedParserId)?.moduleName || selectedParserId;
  const activeMatcherDisplayName = selectedMatcherId === 'auto'
    ? 'Auto'
    : matcherModules.find((m) => m.moduleId === selectedMatcherId)?.moduleName || selectedMatcherId;
  const activeSerialFinderId = globalConfig.activeSerialFinderId ?? 'default';
  const serialFinderOptions: Array<{ id: string; label: string }> = [
    { id: 'default', label: 'Standard' },
  ];
  const serialFinderReady = serialFinderOptions.some((option) => option.id === activeSerialFinderId);
  const activeSerialFinderDisplayName = serialFinderOptions.find((option) => option.id === activeSerialFinderId)?.label
    || activeSerialFinderId;
  const activeOrderMapperId = globalConfig.activeOrderMapperId ?? 'engine-proj-23';
  const orderMapperOptions: Array<{ id: string; label: string }> = [
    { id: 'legacy-waterfall-4', label: 'Legacy (Veraltet)' },
    { id: 'engine-proj-23', label: 'PROJ-23 (3-Run Engine)' },
  ];
  const orderMapperReady = orderMapperOptions.some((option) => option.id === activeOrderMapperId);
  const activeOrderMapperDisplayName = orderMapperOptions.find((option) => option.id === activeOrderMapperId)?.label
    || activeOrderMapperId;

  // PROJ-35: Export config status
  const exportColumnOrder = useExportConfigStore((s) => s.columnOrder);
  const exportIsDirty = useExportConfigStore((s) => s.isDirty);
  const isExportCustom = JSON.stringify(exportColumnOrder.map(c => c.columnKey)) !== JSON.stringify(DEFAULT_COLUMN_ORDER.map(c => c.columnKey));
  const exportDisplayName = isExportCustom ? 'konfiguriert' : 'Standard';

  return (
    <>
      {/* Toggle Button - Always visible at bottom left */}
      <button
        onClick={wrap('toggle', () => setIsOpen(!isOpen))}
        onMouseEnter={() => setIsToggleHovered(true)}
        onMouseLeave={() => setIsToggleHovered(false)}
        disabled={isLocked('toggle')}
        className="fixed bottom-2 left-2 z-50 p-3 rounded-lg shadow-md transition-all duration-200 border"
        style={{
          backgroundColor: isToggleHovered ? HOVER_BG : (isOpen ? '#c9c3b6' : '#D8E6E7'),
          borderColor: isToggleHovered ? HOVER_BORDER : (isOpen ? '#666666' : 'var(--sidebar-border)'),
        }}
        title="Konfiguration"
      >
        {isOpen ? (
          <ChevronsDown
            className="w-7 h-7"
            style={{ color: isToggleHovered ? HOVER_TEXT : '#666666' }}
          />
        ) : (
          <SlidersHorizontal
            className="w-7 h-7"
            style={{ color: isToggleHovered ? HOVER_TEXT : 'var(--sidebar-foreground)' }}
          />
        )}
      </button>

      {/* Warning Icon - Bottom right, moves with footer */}
      <div
        className={cn(
          "fixed right-2 z-50 p-3 rounded-lg transition-all duration-300",
          isOpen ? "bottom-[calc(73px+0.5rem)]" : "bottom-2"
        )}
        title="System Status"
      >
        <AlertTriangle
          className="w-7 h-7"
          style={{
            color: hasWarning ? '#FFD700' : '#3F6C79',
            opacity: hasWarning ? 1 : 0.5
          }}
        />
      </div>

      {/* Footer Panel */}
      <footer
        className={cn(
          "fixed bottom-0 left-0 right-0 z-40 bg-sidebar border-t border-sidebar-border transition-all duration-300 ease-in-out",
          isOpen ? "h-[73px] opacity-100" : "h-0 opacity-0 overflow-hidden border-t-0"
        )}
      >
        <div className="h-full px-6 flex items-center justify-end gap-6 flex-nowrap overflow-x-auto">
          <div className="flex items-center gap-[1.05rem] shrink-0">
            {/* [1] PDF-Parser (Statusfeld) */}
            <div className="flex flex-col gap-0.5">
            <Label className="w-40 text-xs text-sidebar-foreground flex items-center gap-1 text-left">
              PDF-Parser
              {parserReady && (
                <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
              )}
            </Label>
            <button
              type="button"
              onClick={() => openSettingsAtTab('parser')}
              onMouseEnter={() => setHoveredStatusKey('parser')}
              onMouseLeave={() => setHoveredStatusKey(null)}
              className="h-7 w-40 text-xs border rounded-md px-2 flex items-center transition-colors"
              style={{
                backgroundColor: hoveredStatusKey === 'parser' ? HOVER_BG : '#FFFFFF',
                color: hoveredStatusKey === 'parser' ? HOVER_TEXT : '#666666',
                borderColor: hoveredStatusKey === 'parser' ? HOVER_BORDER : '#666666',
              }}
              title="Klicken, um Einstellungen > PDF-Parser zu oeffnen"
            >
              <span className="truncate">{activeParserDisplayName}</span>
            </button>
            </div>

            {/* [1b] Art.-Matcher (Statusfeld) */}
            <div className="flex flex-col gap-0.5">
            <Label className="w-40 text-xs text-sidebar-foreground flex items-center gap-1 text-left">
              Art.-Matcher
              {matcherReady && (
                <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
              )}
            </Label>
            <button
              type="button"
              onClick={() => openSettingsAtTab('matcher')}
              onMouseEnter={() => setHoveredStatusKey('matcher')}
              onMouseLeave={() => setHoveredStatusKey(null)}
              className="h-7 w-40 text-xs border rounded-md px-2 flex items-center transition-colors"
              style={{
                backgroundColor: hoveredStatusKey === 'matcher' ? HOVER_BG : '#FFFFFF',
                color: hoveredStatusKey === 'matcher' ? HOVER_TEXT : '#666666',
                borderColor: hoveredStatusKey === 'matcher' ? HOVER_BORDER : '#666666',
              }}
              title="Klicken, um Einstellungen > Artikel extrahieren zu oeffnen"
            >
              <span className="truncate">{activeMatcherDisplayName}</span>
            </button>
            </div>

            {/* [1c] Serial-Finder (Statusfeld) */}
            <div className="flex flex-col gap-0.5">
            <Label className="w-40 text-xs text-sidebar-foreground flex items-center gap-1 text-left">
              Serial-Finder
              {serialFinderReady && (
                <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
              )}
            </Label>
            <button
              type="button"
              onClick={() => openSettingsAtTab('serial')}
              onMouseEnter={() => setHoveredStatusKey('serial')}
              onMouseLeave={() => setHoveredStatusKey(null)}
              className="h-7 w-40 text-xs border rounded-md px-2 flex items-center transition-colors"
              style={{
                backgroundColor: hoveredStatusKey === 'serial' ? HOVER_BG : '#FFFFFF',
                color: hoveredStatusKey === 'serial' ? HOVER_TEXT : '#666666',
                borderColor: hoveredStatusKey === 'serial' ? HOVER_BORDER : '#666666',
              }}
              title="Klicken, um Einstellungen > Serial parsen zu oeffnen"
            >
              <span className="truncate">{activeSerialFinderDisplayName}</span>
            </button>
            </div>

            {/* [1d] OrderMapper (Statusfeld) */}
            <div className="flex flex-col gap-0.5">
            <Label className="w-40 text-xs text-sidebar-foreground flex items-center gap-1 text-left">
              OrderMapper
              {orderMapperReady && (
                <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
              )}
            </Label>
            <button
              type="button"
              onClick={() => openSettingsAtTab('ordermapper')}
              onMouseEnter={() => setHoveredStatusKey('ordermapper')}
              onMouseLeave={() => setHoveredStatusKey(null)}
              className="h-7 w-40 text-xs border rounded-md px-2 flex items-center transition-colors"
              style={{
                backgroundColor: hoveredStatusKey === 'ordermapper' ? HOVER_BG : '#FFFFFF',
                color: hoveredStatusKey === 'ordermapper' ? HOVER_TEXT : '#666666',
                borderColor: hoveredStatusKey === 'ordermapper' ? HOVER_BORDER : '#666666',
              }}
              title="Klicken, um Einstellungen > Bestellung mappen zu oeffnen"
            >
              <span className="truncate">{activeOrderMapperDisplayName}</span>
            </button>
            </div>

            {/* [1e] Export (Statusfeld) — PROJ-35 */}
            <div className="flex flex-col gap-0.5">
            <Label className="w-40 text-xs text-sidebar-foreground flex items-center gap-1 text-left">
              Export
              {isExportCustom && !exportIsDirty && (
                <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
              )}
            </Label>
            <button
              type="button"
              onClick={() => openSettingsAtTab('export')}
              onMouseEnter={() => setHoveredStatusKey('export')}
              onMouseLeave={() => setHoveredStatusKey(null)}
              className="h-7 w-40 text-xs border rounded-md px-2 flex items-center gap-1.5 transition-colors"
              style={{
                backgroundColor: hoveredStatusKey === 'export' ? HOVER_BG : '#FFFFFF',
                color: hoveredStatusKey === 'export' ? HOVER_TEXT : '#666666',
                borderColor: hoveredStatusKey === 'export' ? HOVER_BORDER : '#666666',
              }}
              title="Klicken, um Einstellungen > Export zu oeffnen"
            >
              <Download className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{exportDisplayName}</span>
            </button>
            </div>
          </div>
          {/* [2] Datenverzeichnis — PROJ-22 B4: Schwarzer klickbarer Link-Text */}
          <div className="flex flex-col gap-0.5 shrink-0">
            <Label className="w-56 text-xs text-sidebar-foreground flex items-center gap-1 text-left">
              Datenverzeichnis:
              {isConfigured && (
                <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
              )}
            </Label>
            <button
              onClick={handleDataPathChange}
              onMouseEnter={() => setIsDataPathHovered(true)}
              onMouseLeave={() => setIsDataPathHovered(false)}
              className="h-7 w-56 text-xs border rounded-md transition-colors px-2 flex items-center gap-1.5"
              style={{
                backgroundColor: isDataPathHovered ? HOVER_BG : '#c9c3b6',
                color: isDataPathHovered ? HOVER_TEXT : '#666666',
                borderColor: isDataPathHovered ? HOVER_BORDER : '#666666',
              }}
              title={isConfigured ? `${dataPath}/falmec receiptPro` : 'Klicken um Ordner auszuwaehlen'}
            >
              <FolderOpen className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">
                {isConfigured ? `${dataPath}/falmec receiptPro` : 'Ordner waehlen...'}
              </span>
            </button>
          </div>

          {/* [2b] Icon-Guide / Legende */}
          <div className="flex flex-col gap-0.5 shrink-0">
            <Label className="text-xs text-sidebar-foreground text-left">
              Icon-Guide:
            </Label>
            <button
              onClick={() => setGuideOpen(true)}
              onMouseEnter={() => setIsGuideHovered(true)}
              onMouseLeave={() => setIsGuideHovered(false)}
              className="h-7 px-3 text-xs rounded-md flex items-center gap-1.5 transition-all duration-200 border"
              style={{
                backgroundColor: isGuideHovered ? HOVER_BG : '#c9c3b6',
                color: isGuideHovered ? HOVER_TEXT : '#666666',
                borderColor: isGuideHovered ? HOVER_BORDER : '#666666',
              }}
              title="Icon-Legende anzeigen"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Legende</span>
            </button>
          </div>

          {/* [3] Einstellungen Button — Logfile wurde in SettingsPopup Tab 1 verschoben */}
          <div className="flex flex-col gap-0.5 shrink-0">
            <Label className="text-xs text-sidebar-foreground text-left">
              Einstellungen:
            </Label>
            <button
              onClick={() => openSettingsAtTab('general')}
              onMouseEnter={() => setIsSettingsHovered(true)}
              onMouseLeave={() => setIsSettingsHovered(false)}
              className="h-7 px-3 text-xs rounded-md flex items-center gap-1.5 transition-all duration-200 border"
              style={{
                backgroundColor: isSettingsHovered ? HOVER_BG : '#c9c3b6',
                color: isSettingsHovered ? HOVER_TEXT : '#666666',
                borderColor: isSettingsHovered ? HOVER_BORDER : '#666666',
              }}
              title="Einstellungen"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Settings</span>
            </button>
          </div>
        </div>
      </footer>

      {/* Settings Popup */}
      <SettingsPopup
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        initialTab={settingsInitialTab}
        onParserChange={handleParserChange}
        onMatcherChange={handleMatcherChange}
        activeParser={{
          parserId: selectedParserId,
          modules: registryModules,
          ready: parserReady,
        }}
        activeMatcher={{
          matcherId: selectedMatcherId,
          modules: matcherModules,
          ready: matcherReady,
        }}
      />

      {/* Icon-Guide Popup */}
      <IconGuidePopup open={guideOpen} onOpenChange={setGuideOpen} />
    </>
  );
}
