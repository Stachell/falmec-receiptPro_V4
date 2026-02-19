import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useClickLock } from '@/hooks/useClickLock';
import { SlidersHorizontal, ChevronsDown, AlertTriangle, FolderOpen, FileText, CheckCircle, Settings } from 'lucide-react';
import { useRunStore } from '@/store/runStore';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { logService } from '@/services/logService';
import { fileSystemService } from '@/services/fileSystemService';
import { parserRegistryService, type ParserRegistryModule } from '@/services/parserRegistryService';
import { matcherRegistryService, type MatcherRegistryModule } from '@/services/matcherRegistryService';
import { getParser } from '@/services/parsers';
import { getMatcher } from '@/services/matchers';
import { SettingsPopup } from '@/components/SettingsPopup';

const DEFAULT_DATA_PATH = 'nicht gewaehlt';

// Hover style constants
const HOVER_BG = '#008C99';
const HOVER_TEXT = '#FFFFFF';
const HOVER_BORDER = '#D8E6E7';

export function AppFooter() {
  const [isOpen, setIsOpen] = useState(false);
  const [dataPath, setDataPath] = useState(DEFAULT_DATA_PATH);
  const [hasWarning, setHasWarning] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isSelectingFolder, setIsSelectingFolder] = useState(false);
  const [isToggleHovered, setIsToggleHovered] = useState(false);
  const [isLogfileHovered, setIsLogfileHovered] = useState(false);
  const [isDirHovered, setIsDirHovered] = useState(false);
  const [isSettingsHovered, setIsSettingsHovered] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedParserId, setSelectedParserId] = useState('auto');
  const [registryModules, setRegistryModules] = useState<ParserRegistryModule[]>([]);
  const [parserReady, setParserReady] = useState(false);
  const [selectedMatcherId, setSelectedMatcherId] = useState('auto');
  const [matcherModules, setMatcherModules] = useState<MatcherRegistryModule[]>([]);
  const [matcherReady, setMatcherReady] = useState(false);
  const { globalConfig, setGlobalConfig } = useRunStore();
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
    // Mark as selecting
    setIsSelectingFolder(true);

    // Open folder picker dialog
    const result = await fileSystemService.selectDirectory();

    // Done selecting
    setIsSelectingFolder(false);

    if (result.success) {
      setDataPath(result.path);
      setIsConfigured(true);
    }
  };

  const handleShowLogfile = () => {
    // Create a snapshot and open log in new browser tab
    logService.info('Logfile angezeigt', { step: 'System' });
    logService.viewLogWithSnapshot();
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

  // Determine dropdown display: if only 1 module, hide "Auto" option
  const showAutoOption = registryModules.length > 1;
  const showMatcherAutoOption = matcherModules.length > 1;

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
          isOpen ? "bottom-[calc(66px+0.5rem)]" : "bottom-2"
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
          isOpen ? "h-[66px] opacity-100" : "h-0 opacity-0 overflow-hidden border-t-0"
        )}
      >
        <div className="h-full px-6 flex items-center justify-end gap-6">
          {/* [1] Parser-Dropdown (NEU - erstes Element) */}
          <div className="flex items-center gap-2">
            <Label htmlFor="footer-parser" className="text-xs text-sidebar-foreground whitespace-nowrap flex items-center gap-1">
              Parser-Regex
              {parserReady && (
                <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
              )}
            </Label>
            <Select
              value={selectedParserId}
              onValueChange={handleParserChange}
            >
              <SelectTrigger
                id="footer-parser"
                className="h-7 w-56 text-xs border rounded-md transition-colors"
                style={{
                  backgroundColor: 'var(--sidebar)',
                  borderColor: 'var(--input)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#c9c3b6';
                  e.currentTarget.style.borderColor = '#666666';
                  e.currentTarget.style.color = '#666666';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--sidebar)';
                  e.currentTarget.style.borderColor = 'var(--input)';
                  e.currentTarget.style.color = '';
                }}
              >
                <SelectValue placeholder="Parser waehlen..." />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                {showAutoOption && (
                  <SelectItem value="auto">Auto</SelectItem>
                )}
                {registryModules.map((parser) => (
                  <SelectItem key={parser.moduleId} value={parser.moduleId}>
                    {parser.moduleName} v{parser.version}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* [1b] Matcher-Dropdown (PROJ-16) */}
          <div className="flex items-center gap-2">
            <Label htmlFor="footer-matcher" className="text-xs text-sidebar-foreground whitespace-nowrap flex items-center gap-1">
              Matcher
              {matcherReady && (
                <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
              )}
            </Label>
            <Select
              value={selectedMatcherId}
              onValueChange={handleMatcherChange}
            >
              <SelectTrigger
                id="footer-matcher"
                className="h-7 w-56 text-xs border rounded-md transition-colors"
                style={{
                  backgroundColor: 'var(--sidebar)',
                  borderColor: 'var(--input)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#c9c3b6';
                  e.currentTarget.style.borderColor = '#666666';
                  e.currentTarget.style.color = '#666666';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--sidebar)';
                  e.currentTarget.style.borderColor = 'var(--input)';
                  e.currentTarget.style.color = '';
                }}
              >
                <SelectValue placeholder="Matcher waehlen..." />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                {showMatcherAutoOption && (
                  <SelectItem value="auto">Auto</SelectItem>
                )}
                {matcherModules.map((matcher) => (
                  <SelectItem key={matcher.moduleId} value={matcher.moduleId}>
                    {matcher.moduleName} v{matcher.version}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* [2] Data Directory (bestehend) */}
          <div className="flex items-center gap-2">
            <Label htmlFor="footer-datapath" className="text-xs text-sidebar-foreground whitespace-nowrap">
              Datenverzeichnis
            </Label>
            <button
              onClick={handleDataPathChange}
              onMouseEnter={() => setIsDirHovered(true)}
              onMouseLeave={() => setIsDirHovered(false)}
              className="h-7 px-2 text-xs border rounded-md flex items-center gap-1.5 transition-colors"
              style={{
                backgroundColor: isSelectingFolder ? '#c9c3b6' : (isDirHovered ? '#c9c3b6' : 'var(--surface-elevated)'),
                borderColor: isSelectingFolder ? '#666666' : 'var(--input)',
                color: (isSelectingFolder || isDirHovered) ? '#666666' : undefined,
              }}
              title={isConfigured ? `${dataPath}/falmec receiptPro` : 'Klicken um Ordner auszuwaehlen'}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span className="truncate max-w-[180px]">
                {isConfigured ? `${dataPath}/falmec receiptPro` : 'Ordner waehlen...'}
              </span>
              {isConfigured && (
                <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
              )}
            </button>
          </div>

          {/* [3] Logfile Button (bestehend) */}
          <button
            onClick={handleShowLogfile}
            onMouseEnter={() => setIsLogfileHovered(true)}
            onMouseLeave={() => setIsLogfileHovered(false)}
            className="h-7 px-3 text-xs rounded-md flex items-center gap-1.5 transition-all duration-200 border"
            style={{
              backgroundColor: isLogfileHovered ? HOVER_BG : '#c9c3b6',
              color: isLogfileHovered ? HOVER_TEXT : '#666666',
              borderColor: isLogfileHovered ? HOVER_BORDER : '#666666',
            }}
            title="Logfile"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Logfile</span>
          </button>

          {/* [4] Einstellungen Button (NEU) */}
          <button
            onClick={() => setSettingsOpen(true)}
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
            <span>Einstellungen</span>
          </button>
        </div>
      </footer>

      {/* Settings Popup */}
      <SettingsPopup
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
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
    </>
  );
}
