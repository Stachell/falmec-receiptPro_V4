/**
 * PROJ-37 — Issue Line Formatter
 * Pure UI-side helpers. NO backend/service imports.
 * Builds display strings from InvoiceLine objects for IssueCard body + clipboard.
 */
import type { InvoiceLine, Issue } from '@/types';

const LINE_LIMIT = 30;

/**
 * Build a single display row for one InvoiceLine.
 * Omits fields that have no value (null / undefined / '' / 0).
 */
export function formatLineForDisplay(line: InvoiceLine): string {
  const parts: string[] = [];

  // Pos — 1-based
  if (line.positionIndex != null) {
    parts.push(`Pos.: ${line.positionIndex}`);
  }

  // Artikel — prefer falmecArticleNo, fallback manufacturerArticleNo
  const artikel = line.falmecArticleNo || line.manufacturerArticleNo;
  if (artikel) {
    parts.push(`Artikel: ${artikel}`);
  }

  // Bestellnummer (original from invoice)
  if (line.manufacturerArticleNo) {
    parts.push(`Bestellnummer: ${line.manufacturerArticleNo}`);
  }

  // EAN
  if (line.ean) {
    parts.push(`EAN: ${line.ean}`);
  }

  // Menge
  if (line.qty != null && line.qty !== 0) {
    parts.push(`Menge: ${line.qty}`);
  }

  // Preis — show both sources when available
  const hasInvoice = line.unitPriceInvoice != null && line.unitPriceInvoice !== 0;
  const hasSage = line.unitPriceSage != null && line.unitPriceSage !== 0;
  if (hasInvoice || hasSage) {
    const priceParts: string[] = [];
    if (hasInvoice) priceParts.push(`RE: ${line.unitPriceInvoice?.toFixed(2)} EUR`);
    if (hasSage) priceParts.push(`Sage: ${line.unitPriceSage?.toFixed(2)} EUR`);
    parts.push(`Preis: ${priceParts.join(' / ')}`);
  }

  // S/N — 3 states
  if (line.serialRequired != null) {
    if (!line.serialRequired) {
      parts.push('S/N: NEIN');
    } else if (line.serialNumbers && line.serialNumbers.length > 0) {
      parts.push(`S/N: JA - ${line.serialNumbers.join(', ')}`);
    } else {
      parts.push('S/N: JA - (fehlt)');
    }
  }

  // Bestellung — in Gaensefuesschen, prefer allocatedOrders, fallback orderNumberAssigned
  const hasAllocated = line.allocatedOrders && line.allocatedOrders.length > 0;
  const hasSingleOrder = line.orderNumberAssigned;
  if (hasAllocated) {
    const orderNrs = line.allocatedOrders!.map(o => o.orderNumber ?? o.orderPositionId).filter(Boolean);
    if (orderNrs.length > 0) {
      parts.push(`Bestellung: "${orderNrs.join(', ')}"`);
    }
  } else if (hasSingleOrder) {
    parts.push(`Bestellung: "${hasSingleOrder}"`);
  }

  return parts.join('  |  ');
}

/**
 * Build the full clipboard text for an issue.
 * Format:
 *   [Fehler] <message>
 *   ---
 *   <line1>
 *   <line2>
 *   ...
 *   ... (+X weitere Positionen)  (if > LINE_LIMIT)
 */
export function buildIssueClipboardText(issue: Issue, allLines: InvoiceLine[]): string {
  const severityLabel =
    issue.severity === 'error' ? 'Fehler' :
    issue.severity === 'warning' ? 'Warnung' : 'Info';

  const header = `[${severityLabel}] ${issue.message}`;
  const summary = issue.details ? `${issue.details}` : '';

  if (issue.affectedLineIds.length === 0) {
    return summary ? `${header}\n${summary}` : header;
  }

  const lineMap = new Map(allLines.map(l => [l.lineId, l]));
  const affectedLines = issue.affectedLineIds
    .map(id => lineMap.get(id))
    .filter((l): l is InvoiceLine => l != null);

  const displayLines = affectedLines.slice(0, LINE_LIMIT).map(formatLineForDisplay);
  const overflow = affectedLines.length - LINE_LIMIT;

  const body = displayLines.join('\n') + (overflow > 0 ? `\n... (+${overflow} weitere Positionen)` : '');

  return [header, '---', body].filter(Boolean).join('\n');
}
