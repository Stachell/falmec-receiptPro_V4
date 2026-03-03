/**
 * InvoicePreview Component
 *
 * Displays the parsed invoice data from Step 1 (Rechnung auslesen).
 * Shows header information and a table of all parsed positions.
 *
 * PROJ-22 B1/B2: Sticky header, 5-row default height, unified column order,
 * PriceCell (readOnly=false = ACTIVE), search bar, heading right-aligned.
 *
 * @component
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { AlertCircle, AlertTriangle, FileText, ChevronsDown, ChevronsUp, FilterX, Info, Search, Filter, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CopyableText } from '@/components/ui/CopyableText';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FILTER_ALL, INVOICE_ACTION_FILTERS, matchesInvoiceActionFilter,
} from '@/lib/filterConfig';
import { normalizeSearchTerm } from '@/lib/searchNormalization';
import { useRunStore } from '@/store/runStore';
import { PriceCell } from './PriceCell';
import { StatusCheckbox } from './StatusCheckbox';
import { SerialStatusDot } from './SerialStatusDot';
import { InvoiceLineDetailPopup } from './InvoiceLineDetailPopup';
import type { InvoiceHeader, InvoiceParserWarning, ParsedInvoiceLineExtended, PriceCheckStatus, InvoiceLine } from '@/types';

interface InvoicePreviewProps {
  /** Parsed invoice header data */
  header: InvoiceHeader;
  /** Parsed invoice positions */
  positions: ParsedInvoiceLineExtended[];
  /** Parser warnings and errors */
  warnings: InvoiceParserWarning[];
  /** Whether parsing was successful */
  isSuccess: boolean;
  /** Source file name */
  sourceFileName?: string;
}

/**
 * Format currency value in German locale
 */
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value);
}

export function InvoicePreview({
  header,
  positions,
  warnings,
  isSuccess,
  sourceFileName,
}: InvoicePreviewProps) {
  const [expandedPositions, setExpandedPositions] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailPosition, setDetailPosition] = useState<ParsedInvoiceLineExtended | null>(null);
  const [showDE, setShowDE] = useState(true);
  const [collapsedHeightPx, setCollapsedHeightPx] = useState(400);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const toggleContainerRef = useRef<HTMLDivElement | null>(null);
  const bestellungWidthClass = 'w-24';
  const errorCount = warnings.filter((w) => w.severity === 'error').length;
  const warningCount = warnings.filter((w) => w.severity === 'warning').length;
  const toggleAriaLabel = expandedPositions ? 'Einklappen' : 'Ausklappen';
  const handleToggleExpanded = () => setExpandedPositions((e) => !e);
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

  // PROJ-20: Aggregated status from expanded lines per position
  const { invoiceLines: allInvoiceLines, currentRun, activeIssueFilterIds, setActiveIssueFilterIds, setManualPrice, navigateToLine } = useRunStore();
  // HOTFIX-1: Filter lines to current run only
  const invoiceLines = currentRun
    ? allInvoiceLines.filter(l => l.lineId.startsWith(`${currentRun.id}-line-`))
    : allInvoiceLines;

  const linesByPosition = useMemo(() => {
    const map = new Map<number, InvoiceLine[]>();
    for (const line of invoiceLines) {
      const existing = map.get(line.positionIndex);
      if (existing) {
        existing.push(line);
      } else {
        map.set(line.positionIndex, [line]);
      }
    }
    return map;
  }, [invoiceLines]);

  const parsedPositionByIndex = useMemo(() => {
    const map = new Map<number, ParsedInvoiceLineExtended>();
    for (const pos of positions) {
      map.set(pos.positionIndex, pos);
    }
    return map;
  }, [positions]);

  // KISS: After Step 4 (isExpanded) use persistent invoiceLines as primary
  // source for RE-Positionen rows, while keeping parse-only fields as fallback.
  const persistentPositions = useMemo<ParsedInvoiceLineExtended[]>(() => {
    const rows: ParsedInvoiceLineExtended[] = [];

    for (const [positionIndex, lines] of linesByPosition.entries()) {
      if (lines.length === 0) continue;

      const representativeLine = lines[0];
      const parsedFallback = parsedPositionByIndex.get(positionIndex);
      const quantityDelivered = lines.reduce((sum, line) => sum + line.qty, 0);
      const totalPrice = lines.reduce((sum, line) => sum + line.totalLineAmount, 0);
      const fallbackQty = parsedFallback?.quantityDelivered ?? 0;
      const finalQty = quantityDelivered || fallbackQty;
      const unitPrice = representativeLine.unitPriceInvoice ?? parsedFallback?.unitPrice ?? 0;

      rows.push({
        positionIndex,
        manufacturerArticleNo: representativeLine.manufacturerArticleNo ?? parsedFallback?.manufacturerArticleNo ?? '',
        ean: representativeLine.ean ?? parsedFallback?.ean ?? '',
        descriptionIT: representativeLine.descriptionIT ?? parsedFallback?.descriptionIT ?? '',
        quantityDelivered: finalQty,
        unitPrice,
        totalPrice: totalPrice || parsedFallback?.totalPrice || (unitPrice * finalQty),
        orderCandidates: parsedFallback?.orderCandidates ?? [],
        orderCandidatesText: parsedFallback?.orderCandidatesText ?? representativeLine.orderNumberAssigned ?? '',
        orderStatus: parsedFallback?.orderStatus ?? (representativeLine.orderNumberAssigned ? 'YES' : 'NO'),
      });
    }

    return rows.sort((a, b) => a.positionIndex - b.positionIndex);
  }, [linesByPosition, parsedPositionByIndex]);

  const tablePositions = useMemo(() => {
    if (currentRun?.isExpanded && persistentPositions.length > 0) {
      return persistentPositions;
    }
    return positions;
  }, [currentRun?.isExpanded, persistentPositions, positions]);

  const positionStatusMap = useMemo(() => {
    const map = new Map<number, {
      priceCheckStatus: PriceCheckStatus;
      serialRequired: boolean;
      serialAssigned: boolean;
      representativeLine: InvoiceLine;
    }>();
    for (const [positionIndex, lines] of linesByPosition.entries()) {
      const representativeLine = lines[0];
      map.set(positionIndex, {
        priceCheckStatus: representativeLine.priceCheckStatus,
        serialRequired: representativeLine.serialRequired,
        serialAssigned: !!representativeLine.serialNumber,
        representativeLine,
      });
    }
    return map;
  }, [linesByPosition]);

  // ADD-ON: Count per action filter option (on unfiltered data)
  const invoiceFilterCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const opt of INVOICE_ACTION_FILTERS) {
      let c = 0;
      for (const pos of tablePositions) {
        const posStatus = positionStatusMap.get(pos.positionIndex);
        const line = posStatus?.representativeLine ?? null;
        if (matchesInvoiceActionFilter(pos, line, opt.value)) c++;
      }
      counts.set(opt.value, c);
    }
    return counts;
  }, [tablePositions, positionStatusMap]);

  // ADD-ON: Reset-Guard — auto-reset when active filter drops to 0
  // PROJ-37: Must run AFTER issue-filter-check — only matters when no issue filter is active
  useEffect(() => {
    if (activeIssueFilterIds !== null) return;
    if (statusFilter === 'all') return;
    const count = invoiceFilterCounts.get(statusFilter) ?? 0;
    if (count === 0) setStatusFilter('all');
  }, [invoiceFilterCounts, statusFilter, activeIssueFilterIds]);

  // PROJ-37: handleFilterChange wrapper — clears activeIssueFilterIds when dropdown is used
  const handleFilterChange = (value: string) => {
    setStatusFilter(value);
    setActiveIssueFilterIds(null);
  };

  // PROJ-22 B2 / ADD-ON PriceCheck: PriceCell handler — ACTIVE in RE-Positionen (pre-Step-4 only)
  // Guard: only write to store when NOT expanded (after Step 4, RE-Positionen uses jump mode)
  const handleSetPrice = (lineId: string, price: number, _source: 'invoice' | 'sage' | 'custom') => {
    if (!currentRun?.isExpanded) {
      setManualPrice(lineId, price);
    }
  };

  // ADD-ON PriceCheck: Post-Step-4 jump handler — scroll to first expanded article of position
  const handlePriceJump = (positionIndex: number) => {
    const runId = currentRun?.id;
    if (!runId) return;
    const targetLineId = `${runId}-line-${positionIndex}-0`;
    navigateToLine([targetLineId]);
  };

  // Filter positions by search term + action filter
  // PROJ-37: activeIssueFilterIds overrides all other filters (matches by positionIndex via lineId prefix)
  const filteredPositions = tablePositions.filter(pos => {
    // Issue-isolation filter: check if any affiliated line for this position is in the issue filter
    if (activeIssueFilterIds !== null) {
      const linesForPos = linesByPosition.get(pos.positionIndex) ?? [];
      return linesForPos.some(l => activeIssueFilterIds.includes(l.lineId));
    }

    // Enriched data (can be null before Step 2)
    const posStatus = positionStatusMap.get(pos.positionIndex);
    const line = posStatus?.representativeLine ?? null;

    const matchesSearch = !searchTerm || (() => {
      const term = normalizeSearchTerm(searchTerm);
      return (
        normalizeSearchTerm(String(pos.positionIndex)).includes(term) ||
        normalizeSearchTerm(pos.ean).includes(term) ||
        normalizeSearchTerm(pos.manufacturerArticleNo).includes(term) ||
        normalizeSearchTerm(line?.falmecArticleNo).includes(term) ||
        normalizeSearchTerm(pos.orderCandidatesText).includes(term)
      );
    })();

    if (statusFilter === 'all') return matchesSearch;

    return matchesSearch && matchesInvoiceActionFilter(pos, line, statusFilter);
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
  }, [expandedPositions, filteredPositions.length]);

  return (
    <div className="space-y-6">
      {/* Warnings Section */}
      {warnings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Hinweise ({warnings.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-auto min-h-[40px] max-h-[300px] overflow-y-auto">
              <ul className="space-y-2">
                {warnings.map((warning, index) => (
                  <li
                    key={`${warning.code}-${index}`}
                    className={`flex items-start gap-2 text-sm ${
                      warning.severity === 'error'
                        ? 'text-destructive'
                        : warning.severity === 'warning'
                        ? 'text-amber-600'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {warning.severity === 'error' ? (
                      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    )}
                    <span>
                      {warning.positionIndex && (
                        <Badge variant="outline" className="mr-2 text-xs">
                          Pos. {warning.positionIndex}
                        </Badge>
                      )}
                      {warning.message}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Positions Table */}
      <Card>
        {/* PROJ-22 B2 + PROJ-38: Suchleiste + Action-Filter links, Ueberschrift rechtsbuendig */}
        <CardHeader className="flex flex-row flex-wrap items-center gap-4 pb-2">
          <div className="relative w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Pos., EAN, Artikelnr. suchen..."
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
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value={FILTER_ALL.value}>{FILTER_ALL.label}</SelectItem>
                {INVOICE_ACTION_FILTERS.map((opt) => {
                  const count = invoiceFilterCounts.get(opt.value) ?? 0;
                  if (count === 0) return null;
                  return (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label} ({count})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto flex items-stretch">
            <div className="text-right">
              <CardTitle>Rechnungspositionen</CardTitle>
              <CardDescription>/invoicelines ({tablePositions.length})</CardDescription>
            </div>
            {tablePositions.length > 0 && (
              <div className={`${bestellungWidthClass} flex items-center justify-center self-stretch border-l border-transparent`}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 p-px border border-gray-400/70 rounded-md text-muted-foreground/50 hover:text-muted-foreground"
                  onClick={handleToggleExpanded}
                  aria-label={toggleAriaLabel}
                >
                  {expandedPositions ? (
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
                Zeige {filteredPositions.length} isolierte Problem-Zeilen (RE-Positionen)
              </span>
              <button
                className="ml-auto text-black hover:text-black/70 font-medium flex items-center gap-1 transition-colors"
                onClick={() => setActiveIssueFilterIds(null)}
              >
                <X className="w-3.5 h-3.5" /> Filter aufheben
              </button>
            </div>
          )}
          {tablePositions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Keine Positionen gefunden</p>
              <p className="text-sm">
                Das PDF enthält möglicherweise keine gültigen Rechnungspositionen oder
                verwendet ein nicht unterstütztes Format.
              </p>
            </div>
          ) : (
            <>
              <div className="-mx-6">
              {/* PROJ-22 B1: 5-row default max-h + sticky header */}
              <div
                ref={tableContainerRef}
                className={`transition-all duration-500 ease-in-out ${
                  expandedPositions ? 'overflow-y-hidden overflow-x-auto' : 'overflow-y-auto overflow-x-auto'
                }`}
                style={expandedPositions ? { maxHeight: 'none' } : { maxHeight: `${collapsedHeightPx}px` }}
              >
                {/* PROJ-22 B2: Unified column order matching ItemsTable:
                    1. Info | 2. Pos | 3. Status | 4. Art.-Nr. | 5. Herstellerartikelnr.
                    | 6. EAN | 7. Bezeichnung | 8. Menge | 9. Preis (ACTIVE) | 10. SN | 11. Bestellung */}
                <table className="w-full table-fixed caption-bottom text-sm">
                  {/* Sticky header: apply sticky on each th for reliable table behavior */}
                  <TableHeader className="bg-[hsl(var(--surface-sunken))]">
                    <TableRow className="bg-[hsl(var(--surface-sunken))]">
                      <TableHead className={`w-[9ch] pl-2 text-center ${expandedPositions ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}`}>DETAILS</TableHead>
                      <TableHead className={`w-[44px] ${expandedPositions ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}`}>#</TableHead>
                      <TableHead className={`w-[59px] text-right ${expandedPositions ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}`}>ARTIKEL</TableHead>
                      <TableHead className={`w-[8ch] whitespace-nowrap ${expandedPositions ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}`}>- MATCH</TableHead>
                      <TableHead className={`w-[172px] ${expandedPositions ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}`}>BESTELLNUMMER</TableHead>
                      <TableHead className={`w-[124px] ${expandedPositions ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}`}>EAN</TableHead>
                      <TableHead className={expandedPositions ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}>
                        <div className="flex items-center gap-1.5">
                          <span>BEZEICHNUNG</span>
                          <Switch checked={showDE} onCheckedChange={setShowDE} className="scale-75" />
                          <span className="text-[10px] text-muted-foreground">{showDE ? 'DE' : 'IT'}</span>
                        </div>
                      </TableHead>
                      <TableHead className={`text-center w-[67px] ${expandedPositions ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}`}>MENGE</TableHead>
                      <TableHead className={`text-right w-[119px] ${expandedPositions ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}`}>PREIS / CHECK</TableHead>
                      <TableHead className={`w-[61px] text-center ${expandedPositions ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}`}>SERIAL</TableHead>
                      <TableHead className={`${bestellungWidthClass} pr-2 ${expandedPositions ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}`}>BESTELLUNG</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPositions.map((position) => {
                      const posStatus = positionStatusMap.get(position.positionIndex);
                      const matchStatus = posStatus?.representativeLine.matchStatus ?? 'pending';
                      return (
                        <TableRow key={position.positionIndex}>
                          {/* Col 1: Info button — navigate to Artikelliste */}
                          <TableCell className="px-1 pl-2 text-center">
                            {posStatus && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => {
                                  setDetailPosition(position);
                                  setDetailOpen(true);
                                }}
                              >
                                <Info className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </TableCell>

                          {/* Col 2: Pos */}
                          <TableCell className="font-medium">
                            {position.positionIndex}
                          </TableCell>

                          {/* Col 3: Art.-Nr. (DE from positionStatusMap) */}
                          <TableCell className="font-medium text-right">
                            <CopyableText
                              value={posStatus?.representativeLine?.falmecArticleNo ?? '--'}
                              placeholderClassName="text-muted-foreground"
                            />
                          </TableCell>

                          {/* Col 4: Match status (same source and icon logic as Artikelliste) */}
                          <TableCell className="text-left">
                            <div className="flex justify-start">
                              <StatusCheckbox status={matchStatus} />
                            </div>
                          </TableCell>

                          {/* Col 5: Herstellerartikelnr. */}
                          <TableCell className="font-mono text-xs">
                            <div className="truncate w-full" title={position.manufacturerArticleNo || 'Fehlt'}>
                              <CopyableText
                                value={position.manufacturerArticleNo || 'Fehlt'}
                                className="block truncate"
                                placeholderClassName="text-destructive"
                              />
                            </div>
                          </TableCell>

                          {/* Col 6: EAN */}
                          <TableCell className="font-mono text-xs">
                            <CopyableText
                              value={position.ean || 'Fehlt'}
                              placeholderClassName="text-destructive"
                            />
                          </TableCell>

                          {/* Col 7: Bezeichnung — dynamic width, DE/IT toggle */}
                          <TableCell className="min-w-0">
                            {showDE ? (
                              <>
                                <div className="text-xs truncate w-full"
                                     title={posStatus?.representativeLine?.descriptionDE ?? position.descriptionIT ?? undefined}>
                                  {posStatus?.representativeLine?.descriptionDE ?? position.descriptionIT ?? ''}
                                </div>
                                {posStatus?.representativeLine?.descriptionDE && position.descriptionIT && (
                                  <div className="text-[11px] text-muted-foreground truncate w-full"
                                       title={position.descriptionIT ?? undefined}>
                                    {position.descriptionIT}
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="text-xs truncate w-full"
                                   title={position.descriptionIT ?? position.manufacturerArticleNo}>
                                {position.descriptionIT || position.manufacturerArticleNo || ''}
                              </div>
                            )}
                          </TableCell>

                          {/* Col 8: Menge */}
                          <TableCell className="text-center font-medium">
                            {position.quantityDelivered}
                          </TableCell>

                          {/* Col 9: Preis — ACTIVE (readOnly=false) pre-Step-4; Jump mode post-Step-4 */}
                          <TableCell className="text-right">
                            {posStatus ? (
                              <PriceCell
                                line={posStatus.representativeLine}
                                onSetPrice={handleSetPrice}
                                readOnly={false}
                                onJumpToArticleList={
                                  currentRun?.isExpanded
                                    ? () => handlePriceJump(position.positionIndex)
                                    : undefined
                                }
                              />
                            ) : (
                              <span className="font-mono text-xs text-right block">
                                {formatCurrency(position.unitPrice)}
                              </span>
                            )}
                          </TableCell>

                          {/* Col 10: SN traffic light square */}
                          <TableCell className="px-1 text-center">
                            {posStatus ? (
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <SerialStatusDot
                                      serialRequired={posStatus.serialRequired}
                                      serialAssigned={posStatus.serialAssigned}
                                    />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {!posStatus.serialRequired
                                      ? 'Keine S/N-Pflicht'
                                      : posStatus.serialAssigned
                                        ? 'S/N zugewiesen'
                                        : 'S/N ausstehend'}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : null}
                          </TableCell>

                          {/* Col 11: Bestellung — READ-ONLY display in RE-Positionen */}
                          <TableCell className="pr-2">
                            <div className="flex flex-col gap-1">
                              {position.orderCandidatesText && (
                                <CopyableText
                                  value={position.orderCandidatesText}
                                  className={`${getOrderZoomClass(position.orderCandidatesText)} text-muted-foreground font-mono`}
                                />
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </table>
              </div>
              {/* PROJ-22 B1: Expand / Collapse Toggle — sticky bottom, 25% groesser */}
              <div
                ref={toggleContainerRef}
                className="flex justify-center items-center h-[50px] border-t border-border/40 sticky bottom-0 bg-card"
              >
                <button
                  className="text-muted-foreground/50 hover:text-muted-foreground transition-colors p-1 rounded"
                  onClick={handleToggleExpanded}
                  aria-label={toggleAriaLabel}
                >
                  {expandedPositions ? (
                    <ChevronsUp className="w-7 h-7 text-muted-foreground/85" />
                  ) : (
                    <ChevronsDown className="w-7 h-7 animate-[pulse_1.1s_ease-in-out_infinite] text-muted-foreground/75" />
                  )}
                </button>
              </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <InvoiceLineDetailPopup
        open={detailOpen}
        onOpenChange={setDetailOpen}
        position={detailPosition}
        linesForPosition={detailPosition ? (linesByPosition.get(detailPosition.positionIndex) ?? []) : []}
      />

    </div>
  );
}

export default InvoicePreview;
