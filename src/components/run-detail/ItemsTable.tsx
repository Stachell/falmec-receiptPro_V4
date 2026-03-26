import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Search, Filter, FilterX, Info, Barcode, ChevronsDown, ChevronsUp, X } from 'lucide-react';
import { useRunStore } from '@/store/runStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CopyableText } from '@/components/ui/CopyableText';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import lockClosedIcon from '@/assets/icons/Lock_CLOSE_STEP4.ico';
import lockOpenIcon from '@/assets/icons/Lock_OPEN_STEP4.ico';
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FILTER_ALL, ITEMS_FILTER_GROUPS, matchesItemsStatusFilter,
} from '@/lib/filterConfig';
import { normalizeSearchTerm } from '@/lib/searchNormalization';
import { StatusCheckbox } from './StatusCheckbox';
import { PriceCell } from './PriceCell';
import { DetailPopup } from './DetailPopup';
import { ManualOrderPopup } from './ManualOrderPopup';
import { getOrderReasonStyle } from './orderReasonStyle';
import { SerialStatusDot } from './SerialStatusDot';
import { SerialFixPopup } from './SerialFixPopup';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { InvoiceLine } from '@/types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function ItemsTable() {
  const {
    invoiceLines: allInvoiceLines,
    highlightedLineIds,
    scrollToLineId,
    currentRun,
    activeIssueFilterIds,
    setActiveIssueFilterIds,
    setManualPrice,
  } = useRunStore();
  const invoiceLines = currentRun
    ? allInvoiceLines.filter(l => l.lineId.startsWith(`${currentRun.id}-line-`))
    : allInvoiceLines;
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [detailLine, setDetailLine] = useState<InvoiceLine | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [collapsedHeightPx, setCollapsedHeightPx] = useState(400);
  const [showDE, setShowDE] = useState(true);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const toggleContainerRef = useRef<HTMLDivElement | null>(null);
  const bestellungWidthClass = 'w-[106px]';

  // PROJ-44-R6: Serial-Fix Pop-up State + Handler
  const [serialFixTarget, setSerialFixTarget] = useState<{
    lineId: string;
    positionIndex: number;
    serialRequired: boolean;
    serialNumbers: string[];
    qty: number;
  } | null>(null);

  const handleSerialDotClick = useCallback((line: InvoiceLine) => {
    const { currentRun: cr, setActiveTab } = useRunStore.getState();
    if (!cr) return;

    if (!cr.isExpanded) {
      // Nicht ausgerollt → RE-Positionen ist der richtige Ort → Tab wechseln
      setActiveTab('invoice-preview');
    } else {
      // Ausgerollt → hier ist der richtige Ort → Pop-up öffnen
      setSerialFixTarget({
        lineId: line.lineId,
        positionIndex: line.positionIndex,
        serialRequired: line.serialRequired,
        serialNumbers: line.serialNumbers,
        qty: line.qty,
      });
    }
  }, []);

  const step4 = currentRun?.steps.find(s => s.stepNo === 4);
  const isStep4Done = step4?.status === 'ok' || step4?.status === 'soft-fail';

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

  // PROJ-37: handleFilterChange wrapper — clears activeIssueFilterIds when dropdown is used
  const handleFilterChange = (value: string) => {
    setStatusFilter(value);
    setActiveIssueFilterIds(null);
  };

  const filteredLines = invoiceLines.filter(line => {
    // PROJ-37: activeIssueFilterIds overrides all other filters
    if (activeIssueFilterIds !== null) {
      return activeIssueFilterIds.includes(line.lineId);
    }

    const term = normalizeSearchTerm(searchTerm);
    const matchesSearch = !term || (
      normalizeSearchTerm(line.manufacturerArticleNo).includes(term) ||
      normalizeSearchTerm(line.ean).includes(term) ||
      normalizeSearchTerm(line.descriptionIT).includes(term) ||
      normalizeSearchTerm(line.falmecArticleNo).includes(term) ||
      normalizeSearchTerm(line.descriptionDE).includes(term)
    );

    return matchesSearch && matchesItemsStatusFilter(line, statusFilter);
  });

  // ADD-ON: Count per filter option (on unfiltered data)
  const itemsFilterCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const group of ITEMS_FILTER_GROUPS) {
      for (const opt of group.options) {
        let c = 0;
        for (const line of invoiceLines) {
          if (matchesItemsStatusFilter(line, opt.value)) c++;
        }
        counts.set(opt.value, c);
      }
    }
    return counts;
  }, [invoiceLines]);

  // ADD-ON: Reset-Guard — auto-reset when active filter drops to 0
  // PROJ-37: Must run AFTER issue-filter-check — only matters when no issue filter is active
  useEffect(() => {
    if (activeIssueFilterIds !== null) return;
    if (statusFilter === 'all') return;
    const count = itemsFilterCounts.get(statusFilter) ?? 0;
    if (count === 0) setStatusFilter('all');
  }, [itemsFilterCounts, statusFilter, activeIssueFilterIds]);

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

  // ADD-ON PriceCheck: Only write price when isExpanded (post-Step-4); readOnly guard prevents
  // calls from pre-Step-4 state but explicit check is a safety net (see ST-3 in spec).
  const handleSetPrice = (lineId: string, price: number, _source: 'invoice' | 'sage' | 'custom') => {
    if (currentRun?.isExpanded) {
      setManualPrice(lineId, price);
    }
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
        <div className="relative w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Suche nach Artikelnummer, EAN, Bezeichnung..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-surface-elevated"
          />
        </div>
        <div className="flex items-center gap-2">
          {/* PROJ-37: FilterX — visible when any filter is active, placed BEFORE Filter icon */}
          {(statusFilter !== 'all' || activeIssueFilterIds !== null) && (
            <button
              className="p-1.5 rounded hover:bg-red-500/10 hover:text-red-500 transition-colors text-muted-foreground"
              onClick={() => {
                setStatusFilter('all');
                setActiveIssueFilterIds(null);
              }}
              title="Alle Filter zuruecksetzen"
            >
              <FilterX className="w-4 h-4" />
            </button>
          )}
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={handleFilterChange}>
            <SelectTrigger className="w-[240px] bg-surface-elevated">
              <SelectValue placeholder="Filter Status" />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value={FILTER_ALL.value}>{FILTER_ALL.label}</SelectItem>
              {ITEMS_FILTER_GROUPS.map((group, groupIndex) => (
                <SelectGroup key={group.groupLabel}>
                  {groupIndex > 0 && <SelectSeparator />}
                  <SelectLabel>{group.groupLabel}</SelectLabel>
                  {group.options.map((opt) => {
                    const count = itemsFilterCounts.get(opt.value) ?? 0;
                    if (count === 0) return null;
                    return (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label} ({count})
                      </SelectItem>
                    );
                  })}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex items-stretch">
          <div className="flex items-center">
            <div
              className="mr-[10px] flex items-center"
              title={isStep4Done ? 'Artikelliste zur Bearbeitung freigegeben' : 'Gesperrt/locked: Artikelliste wird nach Abschluss von Schritt 4 ausgerollt und ist ab dann verfügbar.'}
            >
              {isStep4Done ? (
                <img
                  src={lockOpenIcon}
                  alt="Artikelliste freigegeben"
                  className="h-[2.156rem] w-[2.156rem] select-none"
                />
              ) : (
                <img
                  src={lockClosedIcon}
                  alt="Artikelliste gesperrt"
                  className="h-[2.156rem] w-[2.156rem] select-none"
                />
              )}
            </div>
            <div className="text-right">
              <h3 className="text-2xl font-semibold leading-none tracking-tight">
                Artikel Liste
              </h3>
              <p className="text-sm text-muted-foreground">
                /article list ({packageCount})
              </p>
            </div>
          </div>
          {filteredLines.length > 0 && (
            <div className={`${bestellungWidthClass} flex items-center justify-center self-stretch border-l border-transparent`}>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 p-px border border-gray-400/70 rounded-md text-muted-foreground/50 hover:text-muted-foreground"
                onClick={handleToggleExpanded}
                aria-label={toggleAriaLabel}
              >
                {expanded ? (
                  <ChevronsUp className="h-full w-full scale-[1.45] transform-gpu text-muted-foreground/85" />
                ) : (
                  <ChevronsDown className="h-full w-full scale-[1.45] transform-gpu animate-[pulse_1.1s_ease-in-out_infinite] text-muted-foreground/75" />
                )}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0 pb-0">
        {/* PROJ-37: Issue-filter banner */}
        {activeIssueFilterIds !== null && (
          <div className="mb-3 mt-1 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-1.5 text-xs flex items-center gap-2">
            <span className="text-black">
              Zeige {filteredLines.length} isolierte Problem-Zeilen
            </span>
            <button
              className="ml-auto text-black hover:text-black/70 font-medium flex items-center gap-1 transition-colors"
              onClick={() => setActiveIssueFilterIds(null)}
            >
              <X className="w-3.5 h-3.5" /> Filter aufheben
            </button>
          </div>
        )}
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
                    <TableHead className={expanded ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}>
                      <div className="flex items-center gap-1.5">
                        <span>BEZEICHNUNG</span>
                        <Switch checked={showDE} onCheckedChange={setShowDE} className="scale-75" />
                        <span className="text-[10px] text-muted-foreground">{showDE ? 'DE' : 'IT'}</span>
                      </div>
                    </TableHead>
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
                          <CopyableText
                            value={line.falmecArticleNo ?? '--'}
                            className="truncate"
                            placeholderClassName="text-muted-foreground"
                          />
                        </div>
                      </TableCell>

                      <TableCell className="px-1 pl-0 text-left">
                        <div className="flex justify-start items-center gap-0.5">
                          <StatusCheckbox
                            status={line.matchStatus}
                            onClick={() => setDetailLine(line)}
                          />
                          {line.articleSource === 'manual' && (
                            line.manualStatus === 'confirmed'
                              ? <img src="/src/assets/icons/Manuell_check_ICON.ico" alt="bestätigt" className="w-3.5 h-3.5" title="Artikel manuell zugeordnet (bestätigt)" />
                              : <span className="text-[10px] leading-none" title="Artikel manuell zugeordnet (Entwurf)">{'\u{1F6B9}'}</span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="font-mono text-xs truncate" title={line.manufacturerArticleNo}>
                        <CopyableText value={line.manufacturerArticleNo} className="block truncate" />
                      </TableCell>

                      <TableCell className="font-mono text-xs truncate" title={line.ean}>
                        <CopyableText value={line.ean} className="block truncate" />
                      </TableCell>

                      <TableCell className="min-w-0">
                        {showDE ? (
                          <div
                            className="text-xs truncate w-full"
                            title={line.descriptionDE ?? undefined}
                          >
                            {line.descriptionDE}
                          </div>
                        ) : (
                          <>
                            <div
                              className="text-xs truncate w-full"
                              title={line.descriptionIT ?? undefined}
                            >
                              {line.descriptionIT}
                            </div>
                            {line.descriptionDE && (
                              <div
                                className="text-[11px] text-muted-foreground truncate w-full"
                                title={line.descriptionDE ?? undefined}
                              >
                                {line.descriptionDE}
                              </div>
                            )}
                          </>
                        )}
                      </TableCell>

                      <TableCell className="text-center text-xs font-medium">
                        {line.qty}
                      </TableCell>

                      <TableCell className="text-right">
                        {/* ADD-ON PriceCheck: readOnly=false after Step 4 (isExpanded), readOnly=true before */}
                        <PriceCell
                          line={line}
                          onSetPrice={handleSetPrice}
                          readOnly={!currentRun?.isExpanded}
                          onJumpToArticleList={
                            currentRun?.isExpanded && line.priceCheckStatus === 'custom'
                              ? () => useRunStore.getState().setActiveTab('issues')
                              : undefined
                          }
                        />
                      </TableCell>

                      <TableCell className="text-xs whitespace-nowrap">
                        <div className="flex items-center gap-1 whitespace-nowrap">
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <SerialStatusDot
                                  serialRequired={line.serialRequired}
                                  serialAssigned={!!line.serialNumber}
                                  isManual={line.serialSource === 'manual'}
                                  isConfirmed={line.manualStatus === 'confirmed'}
                                  onClick={() => handleSerialDotClick(line)}
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
                            <CopyableText value={line.serialNumber} className="font-mono whitespace-nowrap" />
                          ) : null}
                        </div>
                      </TableCell>

                      <TableCell className="pr-0 overflow-hidden">
                        {(() => {
                          const orderZoomClass = getOrderZoomClass(line.orderNumberAssigned);
                          const reasonStyle = getOrderReasonStyle(line.orderAssignmentReason);
                          return currentRun?.isExpanded ? (
                            <ManualOrderPopup line={line} labelClassName={orderZoomClass} />
                          ) : (
                            <span
                              className={cn(
                                reasonStyle.pillClass,
                                'block w-full truncate text-right',
                                orderZoomClass
                              )}
                              title={reasonStyle.label}
                            >
                              {line.orderNumberAssigned ?? '--'}
                            </span>
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

      {serialFixTarget && (
        <SerialFixPopup
          target={serialFixTarget}
          onClose={() => setSerialFixTarget(null)}
        />
      )}
    </Card>
  );
}

