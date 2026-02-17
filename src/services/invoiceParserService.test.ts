import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  expandInvoiceLines,
  convertToInvoiceHeader,
  generateRunId,
} from './invoiceParserService';
import type { ParsedInvoiceLine, ParsedInvoiceResult } from './parsers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParsedLine(overrides: Partial<ParsedInvoiceLine> = {}): ParsedInvoiceLine {
  return {
    positionIndex: 1,
    manufacturerArticleNo: 'ART.100',
    ean: '1234567890123',
    descriptionIT: 'Articolo test',
    quantityDelivered: 1,
    unitPrice: 50,
    totalPrice: 50,
    orderCandidates: [],
    orderCandidatesText: '',
    orderStatus: 'NO',
    ...overrides,
  };
}

function makeParsedResult(overrides: Partial<ParsedInvoiceResult> = {}): ParsedInvoiceResult {
  return {
    success: true,
    header: {
      fatturaNumber: '20.008',
      fatturaDate: '13.02.2026',
      packagesCount: 5,
      totalQty: 10,
      parsedPositionsCount: 3,
      qtyValidationStatus: 'ok',
    },
    lines: [],
    warnings: [],
    parserModule: 'FatturaParserV2',
    parsedAt: new Date().toISOString(),
    ...overrides,
  };
}

const RUN_ID = 'Fattura-20008-20260213-100000';

// ===========================================================================
// expandInvoiceLines()
// ===========================================================================
describe('expandInvoiceLines', () => {
  it('qty=1 produces exactly 1 expanded line', () => {
    const result = expandInvoiceLines([makeParsedLine({ quantityDelivered: 1 })], RUN_ID);
    expect(result).toHaveLength(1);
    expect(result[0].qty).toBe(1);
  });

  it('qty=3 produces 3 lines with expansionIndex 0, 1, 2', () => {
    const result = expandInvoiceLines(
      [makeParsedLine({ quantityDelivered: 3, positionIndex: 5 })],
      RUN_ID
    );
    expect(result).toHaveLength(3);
    expect(result.map(l => l.expansionIndex)).toEqual([0, 1, 2]);
    expect(result.every(l => l.positionIndex === 5)).toBe(true);
  });

  it('lineId follows schema {runId}-line-{positionIndex}-{expansionIndex}', () => {
    const result = expandInvoiceLines(
      [makeParsedLine({ quantityDelivered: 2, positionIndex: 7 })],
      RUN_ID
    );
    expect(result[0].lineId).toBe(`${RUN_ID}-line-7-0`);
    expect(result[1].lineId).toBe(`${RUN_ID}-line-7-1`);
  });

  it('skips entries with qty=0', () => {
    const result = expandInvoiceLines([makeParsedLine({ quantityDelivered: 0 })], RUN_ID);
    expect(result).toHaveLength(0);
  });

  it('skips null/undefined entries in the array', () => {
    const lines = [
      null as unknown as ParsedInvoiceLine,
      makeParsedLine({ quantityDelivered: 1 }),
      undefined as unknown as ParsedInvoiceLine,
    ];
    const result = expandInvoiceLines(lines, RUN_ID);
    expect(result).toHaveLength(1);
  });

  it('returns empty array for non-array input', () => {
    const result = expandInvoiceLines('bad' as unknown as ParsedInvoiceLine[], RUN_ID);
    expect(result).toEqual([]);
  });

  it('initializes all PROJ-11 fields correctly', () => {
    const result = expandInvoiceLines([makeParsedLine()], RUN_ID);
    const line = result[0];

    expect(line.matchStatus).toBe('pending');
    expect(line.priceCheckStatus).toBe('pending');
    expect(line.orderAssignmentReason).toBe('pending');
    expect(line.serialNumber).toBeNull();
    expect(line.serialSource).toBe('none');
    expect(line.falmecArticleNo).toBeNull();
    expect(line.descriptionDE).toBeNull();
    expect(line.storageLocation).toBeNull();
    expect(line.unitPriceSage).toBeNull();
    expect(line.unitPriceFinal).toBeNull();
    expect(line.orderNumberAssigned).toBeNull();
    expect(line.orderYear).toBeNull();
    expect(line.orderCode).toBeNull();
    expect(line.orderVorgang).toBeNull();
    expect(line.orderOpenQty).toBeNull();
    expect(line.supplierId).toBeNull();
    expect(line.activeFlag).toBe(true);
    expect(line.serialRequired).toBe(false);
  });

  it('sets unitPriceInvoice and totalLineAmount from unitPrice', () => {
    const result = expandInvoiceLines(
      [makeParsedLine({ unitPrice: 42.5, quantityDelivered: 2 })],
      RUN_ID
    );
    // Each expanded line has qty=1, so total = unit
    expect(result[0].unitPriceInvoice).toBe(42.5);
    expect(result[0].totalLineAmount).toBe(42.5);
  });

  it('handles NaN unitPrice by defaulting to 0', () => {
    const result = expandInvoiceLines(
      [makeParsedLine({ unitPrice: NaN })],
      RUN_ID
    );
    expect(result[0].unitPriceInvoice).toBe(0);
  });

  it('expands multiple positions independently', () => {
    const lines = [
      makeParsedLine({ positionIndex: 1, quantityDelivered: 2 }),
      makeParsedLine({ positionIndex: 2, quantityDelivered: 1 }),
    ];
    const result = expandInvoiceLines(lines, RUN_ID);
    expect(result).toHaveLength(3);
    expect(result[0].positionIndex).toBe(1);
    expect(result[1].positionIndex).toBe(1);
    expect(result[2].positionIndex).toBe(2);
  });
});

// ===========================================================================
// convertToInvoiceHeader()
// ===========================================================================
describe('convertToInvoiceHeader', () => {
  it('converts DD.MM.YYYY to YYYY-MM-DD', () => {
    const result = convertToInvoiceHeader(makeParsedResult({
      header: { ...makeParsedResult().header, fatturaDate: '13.02.2026' },
    }));
    expect(result.invoiceDate).toBe('2026-02-13');
  });

  it('converts DD.MM.YY with year <= 50 to 20xx', () => {
    const result = convertToInvoiceHeader(makeParsedResult({
      header: { ...makeParsedResult().header, fatturaDate: '01.06.26' },
    }));
    expect(result.invoiceDate).toBe('2026-06-01');
  });

  it('converts DD.MM.YY with year > 50 to 19xx', () => {
    const result = convertToInvoiceHeader(makeParsedResult({
      header: { ...makeParsedResult().header, fatturaDate: '15.03.99' },
    }));
    expect(result.invoiceDate).toBe('1999-03-15');
  });
});

// ===========================================================================
// generateRunId()
// ===========================================================================
describe('generateRunId', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 13, 14, 5, 9)); // 2026-02-13 14:05:09
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('produces Fattura-{nr}-{YYYYMMDD}-{HHMMSS} format', () => {
    expect(generateRunId('20.008')).toBe('Fattura-20.008-20260213-140509');
  });
});
