import { useState, useEffect, useRef } from 'react';
import { Search, Filter, Info, Barcode, Type, ChevronsDown, ChevronsUp } from 'lucide-react';
import { useRunStore } from '@/store/runStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusCheckbox } from './StatusCheckbox';
import { PriceCell } from './PriceCell';
import { DetailPopup } from './DetailPopup';
import { ManualOrderPopup } from './ManualOrderPopup';
import { InvoiceLine } from '@/types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function ItemsTable() {
  const { invoiceLines: allInvoiceLines, highlightedLineIds, scrollToLineId, currentRun } = useRunStore();
  const invoiceLines = currentRun
    ? allInvoiceLines.filter(l => l.lineId.startsWith(`${currentRun.id}-line-`))
    : allInvoiceLines;
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [detailLine, setDetailLine] = useState<InvoiceLine | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [collapsedHeightPx, setCollapsedHeightPx] = useState(400);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const toggleContainerRef = useRef<HTMLDivElement | null>(null);
  const bestellungWidthClass = 'w-24';

  useEffect(() => {
    if (!scrollToLineId) return;
    if (!expanded) {
      setExpanded(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = document.getElementById(`row-${scrollToLineId}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      });
    } else {
      requestAnimationFrame(() => {
        const el = document.getElementById(`row-${scrollToLineId}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }, [scrollToLineId, expanded]);

  const filteredLines = invoiceLines.filter(line => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      line.manufacturerArticleNo.toLowerCase().includes(term) ||
      line.ean.includes(searchTerm) ||
      line.descriptionIT.toLowerCase().includes(term) ||
      (line.falmecArticleNo?.toLowerCase().includes(term)) ||
      (line.descriptionDE?.toLowerCase().includes(term));

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'full-match' && line.matchStatus === 'full-match') ||
      (statusFilter === 'partial-match' && (line.matchStatus === 'code-it-only' || line.matchStatus === 'ean-only')) ||
      (statusFilter === 'no-match' && line.matchStatus === 'no-match') ||
      (statusFilter === 'pending' && line.matchStatus === 'pending') ||
      (statusFilter === 'price-mismatch' && line.priceCheckStatus === 'mismatch') ||
      (statusFilter === 'price-missing' && line.priceCheckStatus === 'missing') ||
      (statusFilter === 'not-ordered' && !line.orderNumberAssigned);

    return matchesSearch && matchesStatus;
  });

  useEffect(() => {
    const updateCollapsedHeight = () => {
      const containerTop = tableContainerRef.current?.getBoundingClientRect().top;
      const toggleHeight = toggleContainerRef.current?.getBoundingClientRect().height ?? 0;

      if (typeof containerTop !== 'number' || Number.isNaN(containerTop)) {
        setCollapsedHeightPx(400);
        return;
      }

      const nextHeight = Math.max(260, Math.floor(window.innerHeight - containerTop - toggleHeight - 8));
      setCollapsedHeightPx(Number.isFinite(nextHeight) ? nextHeight : 400);
    };

    const rafId = window.requestAnimationFrame(updateCollapsedHeight);
    window.addEventListener('resize', updateCollapsedHeight);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateCollapsedHeight);
    };
  }, [expanded, filteredLines.length]);

  const handleSetPrice = (_lineId: string, _price: number, _source: 'invoice' | 'sage' | 'custom') => {
    // Price editing is read-only in ItemsTable.
  };

  const packageCount = currentRun?.invoice?.packagesCount ?? invoiceLines.length;
  const toggleAriaLabel = expanded ? 'Einklappen' : 'Ausklappen';
  const handleToggleExpanded = () => setExpanded((e) => !e);
  const getOrderZoomClass = (value: string | null | undefined): string => {
    const count = (value ?? '')
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean).length;

    if (count >= 5) return 'text-[9px] tracking-tighter break-all leading-none';
    if (count === 4) return 'text-[10px] tracking-tighter break-all leading-none';
    if (count === 3) return 'text-[11px] tracking-tighter break-all leading-none';
    return 'text-xs';
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-4 pb-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Suche nach Artikelnummer, EAN, Bezeichnung..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-surface-elevated"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] bg-surface-elevated">
              <SelectValue placeholder="Filter Status" />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="all">Alle anzeigen</SelectItem>
              <SelectItem value="full-match">Match</SelectItem>
              <SelectItem value="partial-match">Teilmatch</SelectItem>
              <SelectItem value="no-match">Kein Match</SelectItem>
              <SelectItem value="pending">Ausstehend</SelectItem>
              <SelectItem value="price-mismatch">Preisabweichung</SelectItem>
              <SelectItem value="price-missing">Preis fehlt</SelectItem>
              <SelectItem value="not-ordered">Nicht bestellt</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="text-sm text-muted-foreground">
          {filteredLines.length} von {invoiceLines.length} Positionen
        </div>
        <div className="ml-auto flex items-stretch">
          <div className="text-right">
            <h3 className="text-2xl font-semibold leading-none tracking-tight">
              Artikel Liste
            </h3>
            <p className="text-sm text-muted-foreground">
              /article list ({packageCount})
            </p>
          </div>
          <div className={`${bestellungWidthClass} flex items-center justify-center self-stretch border-l border-transparent`}>
            {filteredLines.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 p-px text-muted-foreground/50 hover:text-muted-foreground"
                onClick={handleToggleExpanded}
                aria-label={toggleAriaLabel}
              >
                {expanded ? (
                  <ChevronsUp className="h-full w-full text-muted-foreground/85" />
                ) : (
                  <ChevronsDown className="h-full w-full animate-[pulse_1.1s_ease-in-out_infinite] text-muted-foreground/75" />
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 pb-0">
        {filteredLines.length > 0 ? (
          <div className="-mx-6">
            <div
              ref={tableContainerRef}
              className={`transition-all duration-500 ease-in-out ${
                expanded ? 'overflow-y-hidden overflow-x-auto' : 'overflow-y-auto overflow-x-auto'
              }`}
              style={expanded ? { maxHeight: 'none' } : { maxHeight: `${collapsedHeightPx}px` }}
            >
              <table className="w-full table-fixed caption-bottom text-sm">
                <TableHeader className="bg-[hsl(var(--surface-sunken))]">
                  <TableRow className="bg-[hsl(var(--surface-sunken))]">
                    <TableHead className={`w-[59px] pl-2 text-center ${expanded ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}`}>DETAILS</TableHead>
                    <TableHead className={`w-[30px] text-center ${expanded ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}`}>#</TableHead>
                    <TableHead className={`w-[72px] text-right pr-0 ${expanded ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}`}>ARTIKEL</TableHead>
                    <TableHead className={`w-[calc(8ch-9px)] whitespace-nowrap pl-0 ${expanded ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}`}>- MATCH</TableHead>
                    <TableHead className={`w-[157px] ${expanded ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}`}>BESTELLNUMMER</TableHead>
                    <TableHead className={`w-[115px] ${expanded ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}`}>EAN</TableHead>
                    <TableHead className={expanded ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}>BEZEICHNUNG</TableHead>
                    <TableHead className={`w-[53px] text-center ${expanded ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}`}>MENGE</TableHead>
                    <TableHead className={`w-[114px] text-right ${expanded ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}`}>PREIS / CHECK</TableHead>
                    <TableHead className={`w-[120px] ${expanded ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}`}>SN / SERIAL</TableHead>
                    <TableHead className={`${bestellungWidthClass} pr-2 ${expanded ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}`}>BESTELLUNG</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLines.map((line) => (
                    <TableRow
                      key={line.lineId}
                      id={`row-${line.lineId}`}
                      className={`hover:bg-muted/30 ${
                        line.positionIndex % 2 === 1 ? 'bg-slate-50/50' : ''
                      } ${!line.activeFlag ? 'bg-status-soft-fail/5' : ''} ${
                        highlightedLineIds.includes(line.lineId)
                          ? 'ring-2 ring-amber-400/60 bg-amber-500/10 transition-all duration-300'
                          : ''
                      }`}
                    >
                      <TableCell className="px-1 pl-2 text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => { setDetailLine(line); setDetailOpen(true); }}
                        >
                          <Info className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>

                      <TableCell className="font-mono text-xs text-muted-foreground text-center">
                        {line.positionIndex}
                      </TableCell>

                      <TableCell className="font-mono text-xs truncate text-right pr-0">
                        <div className="flex items-center justify-end gap-1">
                          {line.matchStatus === 'ean-only' && (
                            <Barcode className="w-3 h-3 text-orange-400 flex-shrink-0" title="EAN-Match" />
                          )}
                          {(line.matchStatus === 'code-it-only' || line.matchStatus === 'full-match') && (
                            <Type className="w-3 h-3 text-green-500 flex-shrink-0" title="ArtNo-Match" />
                          )}
                          <span className="truncate">
                            {line.falmecArticleNo ?? <span className="text-muted-foreground">--</span>}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell className="px-1 pl-0 text-left">
                        <div className="flex justify-start">
                          <StatusCheckbox
                            status={line.matchStatus}
                            onClick={() => setDetailLine(line)}
                          />
                        </div>
                      </TableCell>

                      <TableCell className="font-mono text-xs truncate" title={line.manufacturerArticleNo}>
                        {line.manufacturerArticleNo}
                      </TableCell>

                      <TableCell className="font-mono text-xs truncate" title={line.ean}>
                        {line.ean}
                      </TableCell>

                      <TableCell className="min-w-0">
                        <div
                          className="text-xs truncate w-full"
                          title={line.descriptionDE ?? line.descriptionIT}
                        >
                          {line.descriptionDE ?? line.descriptionIT}
                        </div>
                        {line.descriptionDE && (
                          <div
                            className="text-[11px] text-muted-foreground truncate w-full"
                            title={line.descriptionIT}
                          >
                            {line.descriptionIT}
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="text-center text-xs font-medium">
                        {line.qty}
                      </TableCell>

                      <TableCell className="text-right">
                        <PriceCell line={line} onSetPrice={handleSetPrice} readOnly />
                      </TableCell>

                      <TableCell className="text-xs whitespace-nowrap">
                        <div className="flex items-center gap-1 whitespace-nowrap">
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className="inline-block w-3 h-3 rounded-sm flex-shrink-0 border"
                                  style={{
                                    backgroundColor: !line.serialRequired
                                      ? '#000000'
                                      : line.serialNumber
                                        ? '#22C55E'
                                        : '#E5E7EB',
                                    borderColor: !line.serialRequired
                                      ? '#000000'
                                      : line.serialNumber
                                        ? '#16A34A'
                                        : '#9CA3AF',
                                  }}
                                />
                              </TooltipTrigger>
                              <TooltipContent>
                                {!line.serialRequired
                                  ? 'Keine S/N-Pflicht'
                                  : line.serialNumber
                                    ? `${line.serialNumber} (${line.serialSource})`
                                    : 'S/N ausstehend'}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          {line.serialRequired && line.serialNumber ? (
                            <span className="font-mono whitespace-nowrap">{line.serialNumber}</span>
                          ) : null}
                        </div>
                      </TableCell>

                      <TableCell className="pr-2">
                        {(() => {
                          const orderZoomClass = getOrderZoomClass(line.orderNumberAssigned);
                          return currentRun?.isExpanded ? (
                            <ManualOrderPopup line={line} labelClassName={orderZoomClass} />
                          ) : line.orderNumberAssigned ? (
                            <span className={`font-mono ${orderZoomClass}`}>{line.orderNumberAssigned}</span>
                          ) : (
                            <span className="text-xs text-status-soft-fail">--</span>
                          );
                        })()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </table>
            </div>

            <div ref={toggleContainerRef} className="flex justify-center items-center h-[50px] border-t border-border/40 sticky bottom-0 bg-card">
              <button
                className="text-muted-foreground/50 hover:text-muted-foreground transition-colors p-1 rounded"
                onClick={handleToggleExpanded}
                aria-label={toggleAriaLabel}
              >
                {expanded ? (
                  <ChevronsUp className="w-7 h-7 text-muted-foreground/85" />
                ) : (
                  <ChevronsDown className="w-7 h-7 animate-[pulse_1.1s_ease-in-out_infinite] text-muted-foreground/75" />
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            Keine Positionen gefunden.
          </div>
        )}
      </CardContent>

      {/* Crash-Fix: detailLine is NOT cleared on close. */}
      <DetailPopup
        line={detailLine ?? ({} as InvoiceLine)}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </Card>
  );
}
