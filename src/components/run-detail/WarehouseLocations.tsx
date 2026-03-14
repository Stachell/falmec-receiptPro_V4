import { useState, useMemo } from 'react';
import { Warehouse, Edit2, Save, ChevronsDown, ChevronsUp, ChevronUp, ChevronDown } from 'lucide-react';
import { useRunStore } from '@/store/runStore';
import { STORAGE_LOCATIONS, StorageLocation, InvoiceLine } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type SortKey = 'positionIndex' | 'falmecArticleNo' | 'storageLocation';
type SortDir = 'asc' | 'desc';

export function WarehouseLocations() {
  const { invoiceLines: allInvoiceLines, updateInvoiceLine, currentRun } = useRunStore();
  // HOTFIX-1: Filter lines to current run only
  const invoiceLines = currentRun
    ? allInvoiceLines.filter(l => l.lineId.startsWith(`${currentRun.id}-line-`))
    : allInvoiceLines;
  const [editMode, setEditMode] = useState(false);
  const [globalWE, setGlobalWE] = useState<StorageLocation>('WE Lager;0;0;0');
  const [globalKDD, setGlobalKDD] = useState<StorageLocation>('WE KDD;0;0;0');
  const [expandedDetails, setExpandedDetails] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('positionIndex');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Bug #5: Group by logicalStorageGroup (immutable, set at match time) instead of storageLocation text
  const { weLagerItems, kddItems, otherItems } = useMemo(() => {
    const weLager = invoiceLines.filter(line => line.logicalStorageGroup === 'WE');
    const kdd = invoiceLines.filter(line => line.logicalStorageGroup === 'KDD');
    const other = invoiceLines.filter(line => !line.logicalStorageGroup);
    return { weLagerItems: weLager, kddItems: kdd, otherItems: other };
  }, [invoiceLines]);

  const handleGlobalWEChange = (value: StorageLocation) => {
    setGlobalWE(value);
    weLagerItems.forEach(line => {
      updateInvoiceLine(line.lineId, { storageLocation: value });
    });
  };

  const handleGlobalKDDChange = (value: StorageLocation) => {
    setGlobalKDD(value);
    kddItems.forEach(line => {
      updateInvoiceLine(line.lineId, { storageLocation: value });
    });
  };

  const missingLocationItems = invoiceLines.filter(line => !line.storageLocation);

  // Bug #6: Sorting helper — DRY: one function used for all 3 groups
  const sortLines = (lines: InvoiceLine[]): InvoiceLine[] => {
    return [...lines].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'positionIndex') {
        cmp = (a.positionIndex ?? 0) - (b.positionIndex ?? 0);
      } else if (sortKey === 'falmecArticleNo') {
        const aVal = a.falmecArticleNo ?? '';
        const bVal = b.falmecArticleNo ?? '';
        cmp = aVal.localeCompare(bVal, 'de', { numeric: true });
      } else {
        const aVal = a.storageLocation ?? '';
        const bVal = b.storageLocation ?? '';
        cmp = aVal.localeCompare(bVal, 'de');
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  };

  const handleSortClick = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === 'asc'
      ? <ChevronUp className="inline w-3 h-3 ml-0.5" />
      : <ChevronDown className="inline w-3 h-3 ml-0.5" />;
  };

  // Sorted detail table — all lines sorted together
  const sortedAll = sortLines(invoiceLines);

  return (
    <div className="space-y-6">
      {/* Global Controls */}
      <div className="enterprise-card p-6">
        <div className="flex items-center gap-2 mb-6">
          <Warehouse className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">Globale Lagerort-Zuweisung</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Wareneingangslager ({weLagerItems.length} Artikel)
            </label>
            <Select value={globalWE} onValueChange={handleGlobalWEChange}>
              <SelectTrigger className="bg-surface-elevated">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                {STORAGE_LOCATIONS.map((loc) => (
                  <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Gilt für alle Positionen mit Kategorie "Wareneingangslager"
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Kundendienstwareneingangslager ({kddItems.length} Artikel)
            </label>
            <Select value={globalKDD} onValueChange={handleGlobalKDDChange}>
              <SelectTrigger className="bg-surface-elevated">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                {STORAGE_LOCATIONS.map((loc) => (
                  <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Gilt für alle Positionen mit Kategorie "Kundendienstwareneingangslager"
            </p>
          </div>
        </div>
      </div>

      {/* Missing Locations Warning */}
      {missingLocationItems.length > 0 && (
        <div className="enterprise-card p-4 border-l-4 border-l-status-failed">
          <div className="flex items-center gap-2 text-status-failed mb-2">
            <Warehouse className="w-5 h-5" />
            <span className="font-medium">
              {missingLocationItems.length} Position(en) ohne Lagerort
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Diese Positionen müssen vor dem Export einen Lagerort erhalten.
          </p>
        </div>
      )}

      {/* Detailed Table */}
      <div className="enterprise-card">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Lagerort-Details</h3>
          <Button
            variant={editMode ? "default" : "outline"}
            size="sm"
            className="gap-2"
            onClick={() => setEditMode(!editMode)}
          >
            {editMode ? (
              <>
                <Save className="w-4 h-4" />
                Speichern
              </>
            ) : (
              <>
                <Edit2 className="w-4 h-4" />
                Bearbeiten
              </>
            )}
          </Button>
        </div>

        <div
          className={`transition-all duration-500 ease-in-out ${
            expandedDetails
              ? 'max-h-[5000px] overflow-y-hidden overflow-x-auto'
              : 'max-h-[360px] overflow-y-auto overflow-x-auto'
          }`}
        >
          <table className="w-full caption-bottom text-sm">
            <TableHeader className="bg-[hsl(var(--surface-sunken))]">
              <TableRow className="data-table-header">
                {/* Bug #6: POS-NR column — clickable for sorting */}
                <TableHead
                  className={`cursor-pointer select-none ${expandedDetails ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}`}
                  onClick={() => handleSortClick('positionIndex')}
                >
                  Pos <SortIcon col="positionIndex" />
                </TableHead>
                <TableHead
                  className={`cursor-pointer select-none ${expandedDetails ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}`}
                  onClick={() => handleSortClick('falmecArticleNo')}
                >
                  Artikelnr. <SortIcon col="falmecArticleNo" />
                </TableHead>
                <TableHead className={expandedDetails ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}>Herstellerartikelnr.</TableHead>
                <TableHead className={expandedDetails ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}>Beschreibung</TableHead>
                <TableHead className={expandedDetails ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}>Menge</TableHead>
                {/* Bug #6: Lagerort header — clickable for sorting */}
                <TableHead
                  className={`cursor-pointer select-none ${expandedDetails ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}`}
                  onClick={() => handleSortClick('storageLocation')}
                >
                  Aktueller Lagerort <SortIcon col="storageLocation" />
                </TableHead>
                {editMode && (
                  <TableHead className={expandedDetails ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}>
                    Neuer Lagerort
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedAll.map((line) => (
                <TableRow
                  key={line.lineId}
                  className={`hover:bg-muted/30 ${!line.storageLocation ? 'bg-status-failed/5' : ''}`}
                >
                  {/* Bug #6: POS-NR cell */}
                  <TableCell>
                    <span className="font-mono text-xs text-muted-foreground">{line.positionIndex + 1}</span>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-sm">{line.falmecArticleNo ?? '—'}</span>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-sm">{line.manufacturerArticleNo}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm truncate max-w-[200px] block">
                      {line.descriptionDE ?? line.descriptionIT}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{line.qty}</span>
                  </TableCell>
                  <TableCell>
                    {line.storageLocation ? (
                      <span className="text-sm">{line.storageLocation}</span>
                    ) : (
                      <span className="text-sm text-status-failed font-medium">
                        Nicht zugewiesen
                      </span>
                    )}
                  </TableCell>
                  {editMode && (
                    <TableCell>
                      <Select
                        value={line.storageLocation || ''}
                        onValueChange={(value) =>
                          updateInvoiceLine(line.lineId, { storageLocation: value as StorageLocation })
                        }
                      >
                        <SelectTrigger className="w-[200px] bg-surface-elevated">
                          <SelectValue placeholder="Auswählen..." />
                        </SelectTrigger>
                        <SelectContent className="bg-popover">
                          {STORAGE_LOCATIONS.map((loc) => (
                            <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </table>
        </div>

        {/* Expand / Collapse Toggle */}
        <div className="flex justify-center py-2 border-t border-border/40">
          <button
            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors p-1 rounded"
            onClick={() => setExpandedDetails((e) => !e)}
            aria-label={expandedDetails ? 'Einklappen' : 'Ausklappen'}
          >
            {expandedDetails ? (
              <ChevronsUp className="w-5 h-5" />
            ) : (
              <ChevronsDown className="w-5 h-5 animate-pulse" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
