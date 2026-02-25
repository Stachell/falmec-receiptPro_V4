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
import { AlertCircle, AlertTriangle, FileText, ChevronsDown, ChevronsUp, Info, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useRunStore } from '@/store/runStore';
import { PriceCell } from './PriceCell';
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

/**
 * Get badge variant for order status
 */
function getOrderStatusBadge(status: 'YES' | 'NO' | 'check'): {
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  label: string;
} {
  switch (status) {
    case 'YES':
      return { variant: 'default', label: 'OK' };
    case 'NO':
      return { variant: 'destructive', label: 'Keine' };
    case 'check':
      return { variant: 'secondary', label: 'check' };
  }
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
  const { invoiceLines: allInvoiceLines, currentRun } = useRunStore();
  // HOTFIX-1: Filter lines to current run only
  const invoiceLines = currentRun
    ? allInvoiceLines.filter(l => l.lineId.startsWith(`${currentRun.id}-line-`))
    : allInvoiceLines;

  const positionStatusMap = useMemo(() => {
    const map = new Map<number, {
      priceCheckStatus: PriceCheckStatus;
      serialRequired: boolean;
      serialAssigned: boolean;
      representativeLine: InvoiceLine;
    }>();
    for (const line of invoiceLines) {
      if (!map.has(line.positionIndex)) {
        map.set(line.positionIndex, {
          priceCheckStatus: line.priceCheckStatus,
          serialRequired: line.serialRequired,
          serialAssigned: !!line.serialNumber,
          representativeLine: line,
        });
      }
    }
    return map;
  }, [invoiceLines]);

  // PROJ-22 B2: PriceCell handler — ACTIVE in RE-Positionen
  // TODO: Wire to store action when price persistence is implemented (PROJ-23 A2)
  const handleSetPrice = (lineId: string, price: number, source: 'invoice' | 'sage' | 'custom') => {
    console.log('setPrice (RE-Positionen):', lineId, price, source);
  };

  // Filter positions by search term
  const filteredPositions = positions.filter(pos => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      String(pos.positionIndex).includes(term) ||
      (pos.ean?.toLowerCase().includes(term)) ||
      (pos.manufacturerArticleNo?.toLowerCase().includes(term)) ||
      (pos.orderCandidatesText?.toLowerCase().includes(term))
    );
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
        {/* PROJ-22 B2: Suchleiste links, Ueberschrift rechtsbuendig */}
        <CardHeader className="flex flex-row items-center gap-4 pb-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Pos., EAN, Artikelnr. suchen..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-8 text-sm bg-surface-elevated"
            />
          </div>
          <div className="ml-auto flex items-stretch">
            <div className="text-right">
              <CardTitle>Rechnungspositionen</CardTitle>
              <CardDescription>/invoicelines ({positions.length})</CardDescription>
            </div>
            {positions.length > 0 && (
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
          {positions.length === 0 ? (
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
                      <TableHead className={expandedPositions ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}>BEZEICHNUNG</TableHead>
                      <TableHead className={`text-center w-[67px] ${expandedPositions ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}`}>MENGE</TableHead>
                      <TableHead className={`text-right w-[119px] ${expandedPositions ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}`}>PREIS / CHECK</TableHead>
                      <TableHead className={`w-[61px] text-center ${expandedPositions ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}`}>SERIAL</TableHead>
                      <TableHead className={`${bestellungWidthClass} pr-2 ${expandedPositions ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}`}>BESTELLUNG</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPositions.map((position) => {
                      const orderBadge = getOrderStatusBadge(position.orderStatus);
                      const posStatus = positionStatusMap.get(position.positionIndex);
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
                                  const { setActiveTab } = useRunStore.getState();
                                  setActiveTab('items');
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
                            {posStatus?.representativeLine?.falmecArticleNo ?? (
                              <span className="text-muted-foreground">--</span>
                            )}
                          </TableCell>

                          {/* Col 4: Status (order badge) */}
                          <TableCell className="text-left">
                            <div className="flex justify-start">
                              <Badge variant={orderBadge.variant} className="text-[10px] px-1 py-0">
                                {orderBadge.label}
                              </Badge>
                            </div>
                          </TableCell>

                          {/* Col 5: Herstellerartikelnr. */}
                          <TableCell className="font-mono text-xs">
                            <div className="truncate w-full" title={position.manufacturerArticleNo}>
                              {position.manufacturerArticleNo || (
                                <span className="text-destructive">Fehlt</span>
                              )}
                            </div>
                          </TableCell>

                          {/* Col 6: EAN */}
                          <TableCell className="font-mono text-xs">
                            {position.ean || (
                              <span className="text-destructive">Fehlt</span>
                            )}
                          </TableCell>

                          {/* Col 7: Bezeichnung — dynamic width, truncate by available space */}
                          <TableCell className="min-w-0">
                            <div
                              className="text-xs truncate w-full"
                              title={position.descriptionIT || position.manufacturerArticleNo}
                            >
                              {position.descriptionIT || position.manufacturerArticleNo || ''}
                            </div>
                          </TableCell>

                          {/* Col 8: Menge */}
                          <TableCell className="text-center font-medium">
                            {position.quantityDelivered}
                          </TableCell>

                          {/* Col 9: Preis — ACTIVE (readOnly=false) in RE-Positionen */}
                          <TableCell className="text-right">
                            {posStatus ? (
                              <PriceCell
                                line={posStatus.representativeLine}
                                onSetPrice={handleSetPrice}
                                readOnly={false}
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
                                    <span
                                      className="inline-block w-3 h-3 rounded-sm border"
                                      style={{
                                        backgroundColor: !posStatus.serialRequired
                                          ? '#000000'
                                          : posStatus.serialAssigned
                                            ? '#22C55E'
                                            : '#E5E7EB',
                                        borderColor: !posStatus.serialRequired
                                          ? '#000000'
                                          : posStatus.serialAssigned
                                            ? '#16A34A'
                                            : '#9CA3AF',
                                      }}
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
                                <span className={`${getOrderZoomClass(position.orderCandidatesText)} text-muted-foreground font-mono`}>
                                  {position.orderCandidatesText}
                                </span>
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

    </div>
  );
}

export default InvoicePreview;
