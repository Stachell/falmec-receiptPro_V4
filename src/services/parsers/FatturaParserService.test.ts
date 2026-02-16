import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FatturaParserService } from './FatturaParserService';
import {
  extractTextFromPDF,
  type ExtractedPage,
  type ExtractedTextItem,
  type GroupedLine,
} from './utils/pdfTextExtractor';

vi.mock('./utils/pdfTextExtractor', () => ({
  extractTextFromPDF: vi.fn(),
  groupTextByLine: vi.fn(() => []),
}));

vi.mock('../logService', () => ({
  logService: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const HEADER_TEXT = 'NUMERO DOC 20.008 DATA DOC 13/02/2026';

function makeFile(name = 'invoice.pdf'): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'application/pdf' });
}

function makeItem(text: string, x: number, y: number = 700): ExtractedTextItem {
  return {
    text,
    x,
    y,
    width: Math.max(10, text.length * 5),
    height: 10,
  };
}

function makeLine(text: string, y: number, items?: ExtractedTextItem[]): GroupedLine {
  if (items && items.length > 0) {
    return { y, text, items };
  }

  const tokens = text.split(/\s+/).filter(Boolean);
  return {
    y,
    text,
    items: tokens.map((token, index) => makeItem(token, 20 + index * 35, y)),
  };
}

function makePage(
  groupedLines: GroupedLine[],
  fullText: string,
  pageNumber: number = 1,
  items?: ExtractedTextItem[]
): ExtractedPage {
  return {
    pageNumber,
    groupedLines,
    fullText,
    items: items ?? groupedLines.flatMap((line) => line.items),
  };
}

describe('FatturaParserService', () => {
  const extractTextFromPDFMock = vi.mocked(extractTextFromPDF);

  beforeEach(() => {
    extractTextFromPDFMock.mockReset();
  });

  it('parst Position bei kombinierter Zeile', async () => {
    const parser = new FatturaParserService();
    const page = makePage(
      [
        makeLine('Vs. ORDINE Nr. 10153', 710),
        makeLine('KACL.457#NF 8034122713656 CAPPA PZ 2 894,45 1.788,90', 690),
      ],
      HEADER_TEXT
    );

    extractTextFromPDFMock.mockResolvedValue([page]);
    const result = await parser.parseInvoice(makeFile());

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].manufacturerArticleNo).toBe('KACL.457#NF');
    expect(result.lines[0].ean).toBe('8034122713656');
    expect(result.lines[0].quantityDelivered).toBe(2);
    expect(result.lines[0].orderCandidates).toEqual(['10153']);
  });

  it('parst Position bei partial PZ mit Lookahead', async () => {
    const parser = new FatturaParserService();
    const page = makePage(
      [
        makeLine('Vs. ORDINE Nr. 10222', 710),
        makeLine('KACL.457#NF 8034122719999', 695),
        makeLine('Descrizione PZ 3', 680),
        makeLine('250,00 750,00', 665),
      ],
      HEADER_TEXT
    );

    extractTextFromPDFMock.mockResolvedValue([page]);
    const result = await parser.parseInvoice(makeFile());

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].manufacturerArticleNo).toBe('KACL.457#NF');
    expect(result.lines[0].ean).toBe('8034122719999');
    expect(result.lines[0].quantityDelivered).toBe(3);
    expect(result.lines[0].unitPrice).toBe(250);
    expect(result.lines[0].totalPrice).toBe(750);
  });

  it('uebernimmt Position ohne Artikel/EAN mit Warning', async () => {
    const parser = new FatturaParserService();
    const page = makePage([makeLine('Dienstleistung PZ 1 99,00 99,00', 690)], HEADER_TEXT);

    extractTextFromPDFMock.mockResolvedValue([page]);
    const result = await parser.parseInvoice(makeFile());

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].manufacturerArticleNo).toBe('');
    expect(result.lines[0].ean).toBe('');
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'POSITION_MISSING_IDENTIFIER',
          severity: 'warning',
          positionIndex: 1,
        }),
      ])
    );
  });

  it('fallback scan greift bei 0 Haupttreffern', async () => {
    const parser = new FatturaParserService();
    const groupedLines = [makeLine('Nur Kopfzeile ohne PZ-Position', 700)];
    const fallbackItems = [
      makeItem('KACL.457#NF', 10),
      makeItem('8034122713656', 50),
      makeItem('PZ', 120),
      makeItem('2', 140),
      makeItem('894,45', 180),
      makeItem('1.788,90', 240),
    ];
    const page = makePage(groupedLines, `${HEADER_TEXT}\nFallbackdaten`, 1, fallbackItems);

    extractTextFromPDFMock.mockResolvedValue([page]);
    const result = await parser.parseInvoice(makeFile());

    expect(result.lines.length).toBeGreaterThan(0);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'FALLBACK_PARSING',
          severity: 'warning',
        }),
      ])
    );
    expect(result.warnings.some((w) => w.code === 'NO_POSITIONS_FOUND')).toBe(false);
  });

  it('NO_POSITIONS_FOUND nur bei totalem Nulltreffer', async () => {
    const parser = new FatturaParserService();
    const groupedLines = [makeLine('Nur Header ohne Positionen', 700)];
    const page = makePage(groupedLines, HEADER_TEXT);

    extractTextFromPDFMock.mockResolvedValue([page]);
    const result = await parser.parseInvoice(makeFile());

    expect(result.success).toBe(false);
    expect(result.lines).toHaveLength(0);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'NO_POSITIONS_FOUND',
          severity: 'error',
        }),
      ])
    );
  });

  it('haengt keine Positionen aus FullText automatisch an', async () => {
    const parser = new FatturaParserService();
    const groupedLines = [
      makeLine('Vs. ORDINE Nr. 10153', 710),
      makeLine('KACL.457#NF 8034122713656 CAPPA PZ 1 219,09 219,09', 690),
    ];
    const fullText = [
      'Vs. ORDINE Nr. 10153',
      'KACL.457#NF 8034122713656 CAPPA PZ 1 219,09 219,09',
      'CAEI20.E0P2#ZZZB461F 8034122354507 CAPPA PZ 1 894,45 894,45',
    ].join('\n');
    const page = makePage(groupedLines, fullText);

    extractTextFromPDFMock.mockResolvedValue([page]);
    const result = await parser.parseInvoice(makeFile());

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].manufacturerArticleNo).toBe('KACL.457#NF');
    expect(result.warnings.some((w) => w.code === 'FULLTEXT_POSITION_SUPPLEMENT')).toBe(false);
  });
});
