/**
 * PROJ-37 — Issue Line Formatter
 * Pure UI-side helpers. NO backend/service imports.
 * Builds display strings from InvoiceLine objects for IssueCard body + clipboard.
 *
 * PROJ-39: added generateMailtoLink for escalation via mailto:
 */
import type { InvoiceLine, Issue } from '@/types';
import { resolveIssueLines } from '@/store/runStore';

const MAILTO_LINE_LIMIT = 10; // mailto: URI length safety
const ISSUE_TYPE_LABELS_FOR_MAIL: Record<string, string> = {
  'order-assignment': 'Bestellzuordnung',
  'serial-mismatch': 'Seriennummer-Fehler',
  'price-mismatch': 'Preisabweichung',
  'inactive-article': 'Inaktiver Artikel',
  'missing-storage-location': 'Fehlender Lagerort',
  'missing-ean': 'Fehlende EAN',
  'parser-error': 'Parser-Fehler',
  'no-article-match': 'Artikel nicht gefunden',
  'price-missing': 'Preis fehlt',
  'order-no-match': 'Bestellung nicht zuordenbar',
  'conflict': 'Identifier-Konflikt',
  'match-artno-not-found': 'Artikelnummer/EAN nicht im Stamm',
  'match-ean-not-found': 'EAN nicht im Stamm',
  'match-conflict-id': 'Artikelnummer/EAN-Konflikt',
  'match-ambiguous': 'Mehrdeutige Artikelzuordnung',
  'sn-invoice-ref-missing': 'Rechnungsreferenz fehlt',
  'sn-regex-failed': 'S/N Regex kein Treffer',
  'sn-insufficient-count': 'Zu wenige Seriennummern',
  'order-incomplete': 'Bestellung unvollstaendig',
  'order-multi-split': 'Mehrfach-Split (3+)',
  'order-fifo-only': 'Nur FIFO-Zuweisung',
};

/**
 * PROJ-39: Generate a mailto: link for escalating an issue via email.
 * Body is limited to MAILTO_LINE_LIMIT affected lines to avoid URI length overflow.
 * Returns the mailto: string — caller must also copy full text to clipboard separately.
 */
export function generateMailtoLink(
  issue: Issue,
  recipient: string,
  allLines: InvoiceLine[],
): string {
  const typeLabel = ISSUE_TYPE_LABELS_FOR_MAIL[issue.type] ?? issue.type;
  const severityLabel =
    issue.severity === 'error' ? 'Fehler' :
    issue.severity === 'warning' ? 'Warnung' : 'Info';

  const subject = encodeURIComponent(`[FALMEC-ReceiptPro] ${severityLabel}: ${issue.message}`);

  // Resolve affected lines (PROJ-45-ADD-ON: nutzt resolveIssueLines für korrekte Post-Expansion-Auflösung)
  const affectedLines = resolveIssueLines(issue.affectedLineIds ?? [], allLines, true);
  const displayLines = affectedLines.slice(0, MAILTO_LINE_LIMIT);
  const overflow = affectedLines.length - displayLines.length;

  const bodyParts: string[] = [
    `Fehlertyp: ${typeLabel}`,
    `Schweregrad: ${severityLabel}`,
    `Schritt: ${issue.stepNo}`,
    `Meldung: ${issue.message}`,
    `Details: ${issue.details}`,
    '',
    'Betroffene Positionen:',
    ...displayLines.map(formatLineForDisplay),
    ...(overflow > 0 ? [`... und ${overflow} weitere Positionen`] : []),
    '',
    '--- Automatisch generiert von FALMEC-ReceiptPro ---',
  ];

  const body = encodeURIComponent(bodyParts.join('\n'));
  return `mailto:${encodeURIComponent(recipient)}?subject=${subject}&body=${body}`;
}

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
    if (hasInvoice) priceParts.push(`PDF-Rechnung: ${line.unitPriceInvoice?.toFixed(2)} EUR`);
    if (hasSage) priceParts.push(`Sage ERP: ${line.unitPriceSage?.toFixed(2)} EUR`);
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
  const parts: string[] = [header];

  // Details IMMER einfuegen (nicht nur wenn affectedLineIds leer)
  if (issue.details) {
    parts.push(issue.details);
  }

  // Betroffene Positionen aufloesen (PROJ-45-ADD-ON: nutzt resolveIssueLines für korrekte Post-Expansion-Auflösung)
  if (issue.affectedLineIds.length > 0) {
    const affectedLines = resolveIssueLines(issue.affectedLineIds, allLines, true);

    if (affectedLines.length > 0) {
      const displayLines = affectedLines.slice(0, LINE_LIMIT).map(formatLineForDisplay);
      const overflow = affectedLines.length - LINE_LIMIT;

      parts.push('---');
      parts.push(displayLines.join('\n'));
      if (overflow > 0) {
        parts.push(`... (+${overflow} weitere Positionen)`);
      }
    }
  }

  return parts.join('\n');
}
