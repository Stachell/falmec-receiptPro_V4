import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { SlidersHorizontal, ChevronsDown, AlertTriangle, FolderOpen } from 'lucide-react';
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

const DEFAULT_DATA_PATH = 'nicht gewählt - C:/falmec receiptPro';

export function AppFooter() {
  const [isOpen, setIsOpen] = useState(false);
  const [dataPath, setDataPath] = useState(DEFAULT_DATA_PATH);
  const [hasWarning, setHasWarning] = useState(false);
  const { globalConfig, setGlobalConfig } = useRunStore();

  // Initialize data path from localStorage
  useEffect(() => {
    const savedPath = localStorage.getItem('falmec-data-path');
    if (savedPath) {
      setDataPath(savedPath);
    } else {
      localStorage.setItem('falmec-data-path', DEFAULT_DATA_PATH);
      // Simulate folder creation (in a real app, this would be handled by backend)
      console.log('Created folder structure: falmec receiptPro/.archiv and falmec receiptPro/.logs');
    }
  }, []);

  const handleDataPathChange = () => {
    // In a browser environment, we simulate folder selection
    const newPath = prompt('Neuen Speicherort eingeben:', dataPath);
    if (newPath && newPath !== dataPath) {
      setDataPath(newPath);
      localStorage.setItem('falmec-data-path', newPath);
      console.log(`Created folder structure: ${newPath}/.archiv and ${newPath}/.logs`);
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

  return (
    <>
      {/* Toggle Button - Always visible at bottom left */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-2 left-2 z-50 p-3 rounded-lg bg-sidebar border border-sidebar-border shadow-md hover:bg-sidebar-accent/50 transition-all duration-200"
        title="Konfiguration"
      >
        {isOpen ? (
          <ChevronsDown className="w-7 h-7 text-sidebar-foreground" />
        ) : (
          <SlidersHorizontal className="w-7 h-7 text-sidebar-foreground" />
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
          {/* Price Basis */}
          <div className="flex items-center gap-2">
            <Label htmlFor="footer-priceBasis" className="text-xs text-sidebar-foreground whitespace-nowrap">
              Preisbasis
            </Label>
            <Select
              value={globalConfig.priceBasis}
              onValueChange={(value: 'Net' | 'Gross') => 
                setGlobalConfig({ priceBasis: value })
              }
            >
              <SelectTrigger id="footer-priceBasis" className="h-7 w-24 text-xs bg-surface-elevated">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="Net">Netto</SelectItem>
                <SelectItem value="Gross">Brutto</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Currency */}
          <div className="flex items-center gap-2">
            <Label htmlFor="footer-currency" className="text-xs text-sidebar-foreground whitespace-nowrap">
              Währung
            </Label>
            <Select
              value="EUR"
              onValueChange={() => {}}
            >
              <SelectTrigger id="footer-currency" className="h-7 w-24 text-xs bg-surface-elevated">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="EUR">Euro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tolerance */}
          <div className="flex items-center gap-2">
            <Label htmlFor="footer-tolerance" className="text-xs text-sidebar-foreground whitespace-nowrap">
              Toleranz (EUR)
            </Label>
            <Input
              id="footer-tolerance"
              type="number"
              step="0.01"
              min="0"
              value={globalConfig.tolerance}
              onChange={(e) =>
                setGlobalConfig({ tolerance: parseFloat(e.target.value) || 0 })
              }
              className="h-7 w-20 text-xs bg-surface-elevated"
            />
          </div>

          {/* Data Directory */}
          <div className="flex items-center gap-2">
            <Label htmlFor="footer-datapath" className="text-xs text-sidebar-foreground whitespace-nowrap">
              Datenverzeichnis
            </Label>
            <button
              onClick={handleDataPathChange}
              className="h-7 px-2 text-xs bg-surface-elevated border border-input rounded-md flex items-center gap-1 hover:bg-accent transition-colors"
              title={dataPath}
            >
              <FolderOpen className="w-3 h-3" />
              <span className="truncate max-w-[120px]">{dataPath}</span>
            </button>
          </div>
        </div>
      </footer>
    </>
  );
}
