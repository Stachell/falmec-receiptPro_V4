/**
 * InvoicePreview Component
 *
 * Displays the parsed invoice data from Step 1 (Rechnung auslesen).
 * Shows header information and a table of all parsed positions.
 *
 * @component
 */

import { useState, useMemo } from 'react';
import { AlertCircle, AlertTriangle, FileText, ChevronsDown, ChevronsUp, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useRunStore } from '@/store/runStore';
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

// PROJ-20: Price badge config (mirrored from PriceCell.tsx)
const PRICE_BADGE_CONFIG: Record<PriceCheckStatus, { text: string; className: string }> = {
  pending:  { text: 'folgt',     className: 'bg-amber-100 text-amber-700' },
  ok:       { text: 'OK',        className: 'bg-green-100 text-green-700' },
  mismatch: { text: 'PRUEFEN',   className: 'bg-yellow-100 text-yellow-700' },
  missing:  { text: 'fehlt',     className: 'bg-red-100 text-red-700' },
  custom:   { text: 'angepasst', className: 'bg-blue-100 text-blue-700' },
};

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
      return { variant: 'secondary', label: 'Prüfen' };
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
        <CardHeader>
          <CardTitle>Rechnungspositionen ({positions.length})</CardTitle>
          <CardDescription>
            Alle aus der Rechnung extrahierten Positionen
          </CardDescription>
        </CardHeader>
        <CardContent>
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
              <div
                className={`overflow-y-auto overflow-x-hidden transition-all duration-500 ease-in-out ${
                  expandedPositions ? 'max-h-[5000px]' : 'max-h-[400px]'
                }`}
              >
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[60px]">Pos.</TableHead>
                      <TableHead className="w-[140px]">EAN</TableHead>
                      <TableHead>Herstellerartikelnr.</TableHead>
                      <TableHead className="text-right w-[80px]">Menge</TableHead>
                      <TableHead className="text-right w-[100px]">Einzelpreis</TableHead>
                      <TableHead className="text-right w-[100px]">Gesamtpreis</TableHead>
                      <TableHead className="w-[100px]">Bestellung</TableHead>
                      <TableHead className="w-[70px]">Preis</TableHead>
                      <TableHead className="w-[36px]">SN</TableHead>
                      <TableHead className="w-[36px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {positions.map((position) => {
                      const orderBadge = getOrderStatusBadge(position.orderStatus);
                      return (
                        <TableRow key={position.positionIndex}>
                          <TableCell className="font-medium">
                            {position.positionIndex}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {position.ean || (
                              <span className="text-destructive">Fehlt</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="max-w-[200px] truncate" title={position.manufacturerArticleNo}>
                              {position.manufacturerArticleNo || (
                                <span className="text-destructive">Fehlt</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {position.quantityDelivered}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(position.unitPrice)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(position.totalPrice)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Badge variant={orderBadge.variant}>
                                {orderBadge.label}
                              </Badge>
                              {position.orderCandidatesText && (
                                <span className="text-xs text-muted-foreground font-mono">
                                  {position.orderCandidatesText}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          {/* PROJ-20: PriceCheck badge */}
                          <TableCell className="px-1">
                            {(() => {
                              const posStatus = positionStatusMap.get(position.positionIndex);
                              if (!posStatus) return null;
                              const badge = PRICE_BADGE_CONFIG[posStatus.priceCheckStatus];
                              return (
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${badge.className}`}>
                                  {badge.text}
                                </span>
                              );
                            })()}
                          </TableCell>
                          {/* PROJ-20: S/N traffic light square */}
                          <TableCell className="px-1">
                            {(() => {
                              const posStatus = positionStatusMap.get(position.positionIndex);
                              if (!posStatus) return null;
                              return (
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
                              );
                            })()}
                          </TableCell>
                          {/* PROJ-20: Info button */}
                          <TableCell className="px-1">
                            {positionStatusMap.has(position.positionIndex) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => {
                                  // Navigate to Artikelliste tab with this position focused
                                  const { setActiveTab } = useRunStore.getState();
                                  setActiveTab('items');
                                }}
                              >
                                <Info className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {/* Expand / Collapse Toggle */}
              <div className="flex justify-center pt-1 pb-1 border-t border-border/40">
                <button
                  className="text-muted-foreground/50 hover:text-muted-foreground transition-colors p-1 rounded"
                  onClick={() => setExpandedPositions((e) => !e)}
                  aria-label={expandedPositions ? 'Einklappen' : 'Ausklappen'}
                >
                  {expandedPositions ? (
                    <ChevronsUp className="w-5 h-5" />
                  ) : (
                    <ChevronsDown className="w-5 h-5 animate-pulse" />
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
