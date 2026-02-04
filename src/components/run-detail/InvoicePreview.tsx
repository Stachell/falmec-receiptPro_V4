/**
 * InvoicePreview Component
 *
 * Displays the parsed invoice data from Step 1 (Rechnung auslesen).
 * Shows header information and a table of all parsed positions.
 *
 * @component
 */

import { AlertCircle, CheckCircle, AlertTriangle, FileText, Package, Calendar, Hash } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { InvoiceHeader, InvoiceParserWarning, ParsedInvoiceLineExtended } from '@/types';

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
 * Format date to German locale
 */
function formatDate(dateStr: string): string {
  if (!dateStr) return '-';

  // Try to parse as ISO date
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return new Intl.DateTimeFormat('de-DE').format(date);
    }
  } catch {
    // Fall through
  }

  // If already in DD.MM.YYYY format, return as is
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(dateStr)) {
    return dateStr;
  }

  return dateStr;
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
  const errorCount = warnings.filter((w) => w.severity === 'error').length;
  const warningCount = warnings.filter((w) => w.severity === 'warning').length;

  return (
    <div className="space-y-6">
      {/* Status Alert */}
      {!isSuccess && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Parsing fehlgeschlagen</AlertTitle>
          <AlertDescription>
            Das PDF konnte nicht vollständig geparst werden. Bitte überprüfen Sie die Warnungen unten.
          </AlertDescription>
        </Alert>
      )}

      {isSuccess && errorCount === 0 && (
        <Alert className="border-green-500 bg-green-50 text-green-800">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertTitle>Erfolgreich geparst</AlertTitle>
          <AlertDescription>
            Die Rechnung wurde erfolgreich ausgelesen. {positions.length} Positionen gefunden.
          </AlertDescription>
        </Alert>
      )}

      {/* Header Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Rechnungsdaten
          </CardTitle>
          {sourceFileName && (
            <CardDescription>Quelldatei: {sourceFileName}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Fattura Number */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Hash className="h-4 w-4" />
                Rechnungsnummer
              </div>
              <p className="font-semibold text-lg">
                {header.fattura || <span className="text-destructive">Fehlt</span>}
              </p>
            </div>

            {/* Invoice Date */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                Rechnungsdatum
              </div>
              <p className="font-semibold text-lg">
                {formatDate(header.invoiceDate) || <span className="text-destructive">Fehlt</span>}
              </p>
            </div>

            {/* Packages Count */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Package className="h-4 w-4" />
                Paketanzahl
              </div>
              <p className="font-semibold text-lg">
                {header.packagesCount ?? <span className="text-muted-foreground">n/a</span>}
              </p>
            </div>

            {/* Total Quantity */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                Gesamtmenge
              </div>
              <p className="font-semibold text-lg">{header.totalQty ?? 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

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
            <ScrollArea className="h-[150px]">
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
            </ScrollArea>
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
            <ScrollArea className="h-[400px]">
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
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
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
