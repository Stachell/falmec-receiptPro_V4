/**
 * exportService — PROJ-42
 *
 * Pure functions for XML and CSV export generation.
 * No React dependencies, no side effects — fully testable.
 */

import type { InvoiceLine, ExportColumnMapping, ExportColumnKey } from '@/types';

export interface RunExportMeta {
  fattura: string;
  invoiceDate: string;
  deliveryDate: string | null;
  eingangsart: string;
  runId: string;
  bookingDate: string;  // DD.MM.YYYY, persistent aus Run.stats.bookingDate
}

/** Escape special XML characters in a value */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Wrap a CSV value in double quotes if it contains the delimiter, quotes, or newlines */
export function csvQuote(value: string, delimiter: string): string {
  if (value.includes(delimiter) || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/** Map a columnKey to its XML tag name + raw string value for a given line */
export function resolveColumnValue(
  key: ExportColumnKey,
  line: InvoiceLine,
  meta: RunExportMeta,
): { tag: string; value: string } {
  switch (key) {
    case 'manufacturerArticleNo': return { tag: 'ManufacturerArticleNo', value: line.manufacturerArticleNo };
    case 'ean':                   return { tag: 'EAN', value: line.ean };
    case 'falmecArticleNo':       return { tag: 'FalmecArticleNo', value: line.falmecArticleNo || '' };
    case 'descriptionDE':         return { tag: 'DescriptionDE', value: line.descriptionDE || '' };
    case 'descriptionIT':         return { tag: 'DescriptionIT', value: line.descriptionIT };
    case 'supplierId':            return { tag: 'Lieferant', value: line.supplierId || '' };
    case 'unitPrice':             return { tag: 'UnitPrice', value: String(line.unitPriceFinal ?? line.unitPriceInvoice) };
    case 'bookingDate':           return { tag: 'BookingDate', value: meta.bookingDate ?? '' };
    case 'totalPrice':            return { tag: 'TotalPrice', value: String(line.totalLineAmount) };
    case 'orderNumberAssigned':   return { tag: 'OrderNumber', value: line.orderNumberAssigned || '' };
    case 'orderDate':             return { tag: 'OrderDate', value: line.orderYear ? String(line.orderYear) : '' };
    case 'serialNumber':          return { tag: 'SerialNumber', value: line.serialNumber || '' };
    case 'storageLocation':       return { tag: 'StorageLocation', value: line.storageLocation || '' };
    case 'orderVorgang':          return { tag: 'Vorgang', value: line.orderVorgang || '' };
    case 'fattura':               return { tag: 'Fattura', value: meta.fattura };
  }
}

/** Generate Sage100Import XML with XML-escaped values */
export function generateXML(
  lines: InvoiceLine[],
  columnOrder: ExportColumnMapping[],
  meta: RunExportMeta,
): string {
  const items = lines.map(line => {
    const fields = columnOrder.map(col => {
      const { tag, value } = resolveColumnValue(col.columnKey, line, meta);
      return `      <${tag}>${escapeXml(value)}</${tag}>`;
    }).join('\n');
    return `    <Item>\n${fields}\n    </Item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Sage100Import>
  <Header>
    <Fattura>${escapeXml(meta.fattura)}</Fattura>
    <InvoiceDate>${escapeXml(meta.invoiceDate)}</InvoiceDate>
    <DeliveryDate>${escapeXml(meta.deliveryDate || '')}</DeliveryDate>
    <Eingangsart>${escapeXml(meta.eingangsart)}</Eingangsart>
    <CreatedAt>${new Date().toISOString()}</CreatedAt>
  </Header>
  <Items>
${items}
  </Items>
</Sage100Import>`;
}

/** Generate CSV with UTF-8 BOM, optional header row, and CRLF line endings */
export function generateCSV(
  lines: InvoiceLine[],
  columnOrder: ExportColumnMapping[],
  meta: RunExportMeta,
  delimiter: string,
  includeHeader: boolean,
): string {
  const bom = '\uFEFF';
  const header = columnOrder.map(col => csvQuote(col.label, delimiter)).join(delimiter);
  const rows = lines.map(line =>
    columnOrder.map(col => {
      const { value } = resolveColumnValue(col.columnKey, line, meta);
      return csvQuote(value, delimiter);
    }).join(delimiter)
  );
  const parts = includeHeader ? [header, ...rows] : rows;
  return bom + parts.join('\r\n');
}

/** Build the export file name: "{runId}-Wareneingang.{ext}" */
export function buildExportFileName(runId: string, ext: string): string {
  return `${runId}-Wareneingang.${ext}`;
}
