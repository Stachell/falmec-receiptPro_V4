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

import { useState, useMemo } from 'react';
import { AlertCircle, AlertTriangle, FileText, ChevronsDown, ChevronsUp, Info, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
  const errorCount = warnings.filter((w) => w.severity === 'error').length;
  const warningCount = warnings.filter((w) => w.severity === 'warning').length;

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
          <div className="ml-auto text-right">
            <CardTitle>Rechnungspositionen ({positions.length})</CardTitle>
            <CardDescription>Alle extrahierten Positionen</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
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
              {/* PROJ-22 B1: 5-row default max-h + sticky header */}
              <div
                className={`overflow-y-auto overflow-x-hidden transition-all duration-500 ease-in-out ${
                  expandedPositions ? 'max-h-[5000px]' : 'max-h-[400px]'
                }`}
              >
                {/* PROJ-22 B2: Unified column order matching ItemsTable:
                    1. Info | 2. Pos | 3. Status | 4. Art.-Nr. | 5. Herstellerartikelnr.
                    | 6. EAN | 7. Bezeichnung | 8. Menge | 9. Preis (ACTIVE) | 10. SN | 11. Bestellung */}
                <Table>
                  {/* PROJ-22 B1: sticky header */}
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[36px]"></TableHead>
                      <TableHead className="w-[50px]">Pos.</TableHead>
                      <TableHead className="w-[70px]">Status</TableHead>
                      <TableHead className="w-[90px]">Art.-Nr.</TableHead>
                      <TableHead>Herstellerartikelnr.</TableHead>
                      <TableHead className="w-[130px]">EAN</TableHead>
                      <TableHead className="w-[160px]">Bezeichnung</TableHead>
                      <TableHead className="text-right w-[60px]">Menge</TableHead>
                      <TableHead className="text-right w-[130px]">Preis</TableHead>
                      <TableHead className="w-[36px]">SN</TableHead>
                      <TableHead className="w-[120px]">Bestellung</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPositions.map((position) => {
                      const orderBadge = getOrderStatusBadge(position.orderStatus);
                      const posStatus = positionStatusMap.get(position.positionIndex);
                      return (
                        <TableRow key={position.positionIndex}>
                          {/* Col 1: Info button — navigate to Artikelliste */}
                          <TableCell className="px-1">
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

                          {/* Col 3: Status (order badge) */}
                          <TableCell>
                            <Badge variant={orderBadge.variant} className="text-[10px] px-1 py-0">
                              {orderBadge.label}
                            </Badge>
                          </TableCell>

                          {/* Col 4: Art.-Nr. (DE from positionStatusMap) */}
                          <TableCell className="font-mono text-xs">
                            {posStatus?.representativeLine?.falmecArticleNo ?? (
                              <span className="text-muted-foreground">--</span>
                            )}
                          </TableCell>

                          {/* Col 5: Herstellerartikelnr. */}
                          <TableCell>
                            <div className="max-w-[200px] truncate font-mono text-xs" title={position.manufacturerArticleNo}>
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

                          {/* Col 7: Bezeichnung — max 35 chars */}
                          <TableCell>
                            <div
                              className="text-xs truncate max-w-[150px]"
                              title={position.descriptionIT || position.manufacturerArticleNo}
                            >
                              {(position.descriptionIT || position.manufacturerArticleNo || '')?.substring(0, 35)}
                              {((position.descriptionIT || position.manufacturerArticleNo || '')?.length ?? 0) > 35 ? '…' : ''}
                            </div>
                          </TableCell>

                          {/* Col 8: Menge */}
                          <TableCell className="text-right font-medium">
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
                          <TableCell className="px-1">
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
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {position.orderCandidatesText && (
                                <span className="text-xs text-muted-foreground font-mono">
                                  {position.orderCandidatesText}
                                </span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {/* PROJ-22 B1: Expand / Collapse Toggle — sticky bottom, 25% groesser */}
              <div className="flex justify-center pt-1 pb-1 border-t border-border/40 sticky bottom-0 bg-card">
                <button
                  className="text-muted-foreground/50 hover:text-muted-foreground transition-colors p-1 rounded"
                  onClick={() => setExpandedPositions((e) => !e)}
                  aria-label={expandedPositions ? 'Einklappen' : 'Ausklappen'}
                >
                  {expandedPositions ? (
                    <ChevronsUp className="w-6 h-6" />
                  ) : (
                    <ChevronsDown className="w-6 h-6 animate-pulse" />
                  )}
                </button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Summary Footer */}
      <div className="flex justify-between items-center text-sm text-muted-foreground">
        <span>
          {positions.length} Positionen • Gesamtmenge: {header.totalQty ?? 0}
        </span>
        <span>
          {errorCount > 0 && (
            <span className="text-destructive mr-4">{errorCount} Fehler</span>
          )}
          {warningCount > 0 && (
            <span className="text-amber-600">{warningCount} Warnungen</span>
          )}
        </span>
      </div>
    </div>
  );
}

export default InvoicePreview;
