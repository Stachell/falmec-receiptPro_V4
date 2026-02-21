import { describe, expect, it } from 'vitest';
import { checkPrice, matchArticle, matchAllArticles } from './ArticleMatcher';
import type { InvoiceLine, ArticleMaster } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLine(overrides: Partial<InvoiceLine> = {}): InvoiceLine {
  return {
    lineId: 'test-line-1-0',
    positionIndex: 1,
    expansionIndex: 0,
    manufacturerArticleNo: 'ART.100',
    ean: '1234567890123',
    descriptionIT: 'Test article',
    qty: 1,
    unitPriceInvoice: 100,
    totalLineAmount: 100,
    orderNumberAssigned: null,
    orderAssignmentReason: 'pending',
    serialNumber: null,
    serialSource: 'none',
    falmecArticleNo: null,
    descriptionDE: null,
    storageLocation: null,
    unitPriceSage: null,
    unitPriceFinal: null,
    activeFlag: true,
    priceCheckStatus: 'pending',
    matchStatus: 'pending',
    serialRequired: false,
    orderYear: null,
    orderCode: null,
    orderVorgang: null,
    orderOpenQty: null,
    supplierId: null,
    serialNumbers: [],
    allocatedOrders: [],
    ...overrides,
  };
}

function makeArticle(overrides: Partial<ArticleMaster> = {}): ArticleMaster {
  return {
    id: 'am-1',
    falmecArticleNo: 'FAL-001',
    manufacturerArticleNo: 'ART.100',
    ean: '1234567890123',
    storageLocation: 'WE Lager;0;0;0',
    unitPriceNet: 100,
    activeFlag: true,
    serialRequirement: false,
    ...overrides,
  };
}

const TOLERANCE = 2;

// ===========================================================================
// checkPrice()
// ===========================================================================
describe('checkPrice', () => {
  it('returns ok for equal prices', () => {
    expect(checkPrice(100, 100, TOLERANCE)).toBe('ok');
  });

  it('returns ok within tolerance', () => {
    expect(checkPrice(101, 100, TOLERANCE)).toBe('ok');
  });

  it('returns ok at exact tolerance boundary', () => {
    expect(checkPrice(102, 100, TOLERANCE)).toBe('ok');
  });

  it('returns mismatch when exceeding tolerance', () => {
    expect(checkPrice(103, 100, TOLERANCE)).toBe('mismatch');
  });

  it('returns missing for zero invoice price', () => {
    expect(checkPrice(0, 100, TOLERANCE)).toBe('missing');
  });

  it('returns missing for NaN invoice price', () => {
    expect(checkPrice(NaN, 100, TOLERANCE)).toBe('missing');
  });

  it('returns missing for Infinity sage price', () => {
    expect(checkPrice(100, Infinity, TOLERANCE)).toBe('missing');
  });

  it('returns missing for negative price', () => {
    expect(checkPrice(-5, 100, TOLERANCE)).toBe('missing');
  });
});

// ===========================================================================
// matchArticle()
// ===========================================================================
describe('matchArticle', () => {
  const articles = [makeArticle()];

  it('returns full-match when both code and EAN hit', () => {
    const line = makeLine();
    const result = matchArticle(line, articles, TOLERANCE);
    expect(result.matchStatus).toBe('full-match');
    expect(result.falmecArticleNo).toBe('FAL-001');
  });

  it('returns code-it-only when only code matches', () => {
    const line = makeLine({ ean: '0000000000000' });
    const result = matchArticle(line, articles, TOLERANCE);
    expect(result.matchStatus).toBe('code-it-only');
  });

  it('returns ean-only when only EAN matches', () => {
    const line = makeLine({ manufacturerArticleNo: 'UNKNOWN' });
    const result = matchArticle(line, articles, TOLERANCE);
    expect(result.matchStatus).toBe('ean-only');
  });

  it('returns no-match when neither code nor EAN match', () => {
    const line = makeLine({ manufacturerArticleNo: 'UNKNOWN', ean: '0000000000000' });
    const result = matchArticle(line, articles, TOLERANCE);
    expect(result.matchStatus).toBe('no-match');
  });

  it('handles empty string code and EAN gracefully', () => {
    const line = makeLine({ manufacturerArticleNo: '', ean: '' });
    const result = matchArticle(line, articles, TOLERANCE);
    expect(result.matchStatus).toBe('no-match');
  });

  it('handles null/undefined fields without crash', () => {
    const line = makeLine({
      manufacturerArticleNo: null as unknown as string,
      ean: undefined as unknown as string,
    });
    const result = matchArticle(line, articles, TOLERANCE);
    expect(result.matchStatus).toBe('no-match');
  });

  it('code-match takes priority over EAN-match when they resolve to different articles', () => {
    const artByCode = makeArticle({ id: 'am-code', falmecArticleNo: 'FAL-CODE', ean: '9999999999999' });
    const artByEan = makeArticle({ id: 'am-ean', falmecArticleNo: 'FAL-EAN', manufacturerArticleNo: 'OTHER' });
    const line = makeLine();
    const result = matchArticle(line, [artByCode, artByEan], TOLERANCE);
    // Code match wins — full-match because both resolve (to different articles)
    expect(result.matchStatus).toBe('full-match');
    expect(result.falmecArticleNo).toBe('FAL-CODE');
  });

  it('sets priceCheckStatus ok when prices match', () => {
    const result = matchArticle(makeLine({ unitPriceInvoice: 100 }), articles, TOLERANCE);
    expect(result.priceCheckStatus).toBe('ok');
    expect(result.unitPriceFinal).toBe(100);
  });

  it('sets priceCheckStatus mismatch when price exceeds tolerance', () => {
    const result = matchArticle(makeLine({ unitPriceInvoice: 200 }), articles, TOLERANCE);
    expect(result.priceCheckStatus).toBe('mismatch');
    expect(result.unitPriceFinal).toBeNull();
  });

  it('sets priceCheckStatus missing when invoice price is 0', () => {
    const result = matchArticle(makeLine({ unitPriceInvoice: 0 }), articles, TOLERANCE);
    expect(result.priceCheckStatus).toBe('missing');
  });

  it('returns graceful no-match for null line', () => {
    const result = matchArticle(null as unknown as InvoiceLine, articles, TOLERANCE);
    expect(result.matchStatus).toBe('no-match');
  });

  it('returns graceful no-match for null articles', () => {
    const result = matchArticle(makeLine(), null as unknown as ArticleMaster[], TOLERANCE);
    expect(result.matchStatus).toBe('no-match');
  });
});

// ===========================================================================
// matchAllArticles()
// ===========================================================================
describe('matchAllArticles', () => {
  it('batch-matches lines with mixed results', () => {
    const articles = [makeArticle()];
    const lines = [
      makeLine(), // full-match
      makeLine({ manufacturerArticleNo: 'UNKNOWN', ean: '0000000000000' }), // no-match
      makeLine({ ean: '0000000000000' }), // code-it-only
    ];
    const result = matchAllArticles(lines, articles, TOLERANCE);
    expect(result).toHaveLength(3);
    expect(result[0].matchStatus).toBe('full-match');
    expect(result[1].matchStatus).toBe('no-match');
    expect(result[2].matchStatus).toBe('code-it-only');
  });

  it('returns empty array for non-array lines input', () => {
    const result = matchAllArticles('bad' as unknown as InvoiceLine[], [], TOLERANCE);
    expect(result).toEqual([]);
  });

  it('returns unchanged lines for non-array articles input', () => {
    const lines = [makeLine()];
    const result = matchAllArticles(lines, 'bad' as unknown as ArticleMaster[], TOLERANCE);
    expect(result).toHaveLength(1);
    expect(result[0].matchStatus).toBe('pending'); // unchanged
  });

  it('is resilient when one article throws — rest still processed', () => {
    // A poison article whose property access throws inside matchArticle's .find()
    const poisonArticle = new Proxy({} as ArticleMaster, {
      get(_target, prop) {
        if (prop === 'manufacturerArticleNo') throw new Error('poison');
        return undefined;
      },
    });
    const lines = [
      makeLine(),
      makeLine({ lineId: 'test-line-2-0', manufacturerArticleNo: 'OTHER', ean: '0000000000000' }),
    ];
    // First line's code-match triggers the poison article → error caught → fallback no-match
    // Second line also hits the poison → same fallback
    const result = matchAllArticles(lines, [poisonArticle], TOLERANCE);
    expect(result).toHaveLength(2);
    // Both lines should survive (fallback no-match from catch block)
    expect(result[0].matchStatus).toBe('no-match');
    expect(result[1].matchStatus).toBe('no-match');
  });
});
