import { describe, expect, it } from 'vitest';
import { matchAllOrders } from './OrderMatcher';
import type { InvoiceLine, OpenWEPosition } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLine(overrides: Partial<InvoiceLine> = {}): InvoiceLine {
  return {
    lineId: 'r-line-1-0',
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

function makeOP(overrides: Partial<OpenWEPosition> = {}): OpenWEPosition {
  return {
    id: 'op-1',
    belegnummer: 'B0012345',
    vorgang: 'V-001',
    orderYear: 2025,
    supplierId: 'SUP-01',
    manufacturerArticleNo: 'ART.100',
    ean: '1234567890123',
    openQty: 5,
    orderedQty: 5,
    ...overrides,
  };
}

// ===========================================================================
// matchAllOrders()
// ===========================================================================
describe('matchAllOrders', () => {
  // -----------------------------------------------------------------------
  // Basic matching
  // -----------------------------------------------------------------------
  it('assigns a single line to the matching open position (oldest-first)', () => {
    const lines = [makeLine()];
    const ops = [makeOP()];
    const result = matchAllOrders(lines, ops);

    expect(result[0].orderAssignmentReason).toBe('oldest-first');
    expect(result[0].orderNumberAssigned).toBe('2025-12345');
    expect(result[0].orderYear).toBe(2025);
    expect(result[0].supplierId).toBe('SUP-01');
  });

  it('marks line as not-ordered when no candidate exists', () => {
    const lines = [makeLine({ manufacturerArticleNo: 'UNKNOWN', ean: '' })];
    const ops = [makeOP()];
    const result = matchAllOrders(lines, ops);

    expect(result[0].orderAssignmentReason).toBe('not-ordered');
    expect(result[0].orderNumberAssigned).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Rule 1: exact-qty-match
  // -----------------------------------------------------------------------
  it('prefers exact-qty-match when group size equals openQty', () => {
    // 2 pending lines for ART.100 — op-exact has openQty=2 (exact match), op-old is older
    const lines = [
      makeLine({ lineId: 'r-line-1-0' }),
      makeLine({ lineId: 'r-line-1-1', expansionIndex: 1 }),
    ];
    const ops = [
      makeOP({ id: 'op-old', belegnummer: 'B0010000', orderYear: 2024, openQty: 10 }),
      makeOP({ id: 'op-exact', belegnummer: 'B0099999', orderYear: 2026, openQty: 2 }),
    ];
    const result = matchAllOrders(lines, ops);

    // Both should be assigned to op-exact (exact qty) despite op-old being older
    expect(result[0].orderAssignmentReason).toBe('exact-qty-match');
    expect(result[0].orderNumberAssigned).toBe('2026-99999');
    expect(result[1].orderAssignmentReason).toBe('exact-qty-match');
    expect(result[1].orderNumberAssigned).toBe('2026-99999');
  });

  // -----------------------------------------------------------------------
  // Rule 2: oldest-first sorting
  // -----------------------------------------------------------------------
  it('older year wins over newer year', () => {
    const lines = [makeLine()];
    const ops = [
      makeOP({ id: 'op-new', orderYear: 2026, belegnummer: 'B0010000' }),
      makeOP({ id: 'op-old', orderYear: 2024, belegnummer: 'B0099999' }),
    ];
    const result = matchAllOrders(lines, ops);

    expect(result[0].orderYear).toBe(2024);
    expect(result[0].orderAssignmentReason).toBe('oldest-first');
  });

  it('lower belegnummer wins when same year', () => {
    const lines = [makeLine()];
    const ops = [
      makeOP({ id: 'op-high', orderYear: 2025, belegnummer: 'B0099999' }),
      makeOP({ id: 'op-low', orderYear: 2025, belegnummer: 'B0010001' }),
    ];
    const result = matchAllOrders(lines, ops);

    expect(result[0].orderNumberAssigned).toBe('2025-10001');
  });

  // -----------------------------------------------------------------------
  // Consumption tracking
  // -----------------------------------------------------------------------
  it('consumes openQty correctly — excess lines get not-ordered', () => {
    // openQty=2 but 3 lines → first 2 assigned, 3rd not-ordered
    const lines = [
      makeLine({ lineId: 'r-line-1-0', expansionIndex: 0 }),
      makeLine({ lineId: 'r-line-1-1', expansionIndex: 1 }),
      makeLine({ lineId: 'r-line-1-2', expansionIndex: 2 }),
    ];
    const ops = [makeOP({ openQty: 2 })];
    const result = matchAllOrders(lines, ops);

    expect(result[0].orderAssignmentReason).toBe('oldest-first');
    expect(result[1].orderAssignmentReason).toBe('oldest-first');
    expect(result[2].orderAssignmentReason).toBe('not-ordered');
  });

  // -----------------------------------------------------------------------
  // orderCode extraction
  // -----------------------------------------------------------------------
  it('orderCode is last 5 digits of belegnummer', () => {
    const lines = [makeLine()];
    const ops = [makeOP({ belegnummer: 'WE0054321' })];
    const result = matchAllOrders(lines, ops);

    expect(result[0].orderCode).toBe('54321');
  });

  it('orderCode returns full belegnummer if shorter than 5 chars', () => {
    const lines = [makeLine()];
    const ops = [makeOP({ belegnummer: '123' })];
    const result = matchAllOrders(lines, ops);

    expect(result[0].orderCode).toBe('123');
  });

  // -----------------------------------------------------------------------
  // orderNumberAssigned format
  // -----------------------------------------------------------------------
  it('orderNumberAssigned has format {year}-{code}', () => {
    const lines = [makeLine()];
    const ops = [makeOP({ orderYear: 2025, belegnummer: 'B0012345' })];
    const result = matchAllOrders(lines, ops);

    expect(result[0].orderNumberAssigned).toBe('2025-12345');
  });

  // -----------------------------------------------------------------------
  // Skip non-pending lines
  // -----------------------------------------------------------------------
  it('skips lines that are not pending', () => {
    const lines = [
      makeLine({ lineId: 'r-line-manual', orderAssignmentReason: 'manual', orderNumberAssigned: '2025-99999' }),
      makeLine({ lineId: 'r-line-pending' }),
    ];
    const ops = [makeOP()];
    const result = matchAllOrders(lines, ops);

    // Manual line untouched
    expect(result[0].orderAssignmentReason).toBe('manual');
    expect(result[0].orderNumberAssigned).toBe('2025-99999');
    // Pending line gets matched
    expect(result[1].orderAssignmentReason).toBe('oldest-first');
  });

  // -----------------------------------------------------------------------
  // EAN-only matching
  // -----------------------------------------------------------------------
  it('matches by EAN when manufacturerArticleNo differs', () => {
    const lines = [makeLine({ manufacturerArticleNo: 'DIFFERENT' })];
    // OP has same EAN but different code
    const ops = [makeOP({ manufacturerArticleNo: 'OTHER.CODE' })];
    const result = matchAllOrders(lines, ops);

    expect(result[0].orderAssignmentReason).toBe('oldest-first');
    expect(result[0].orderNumberAssigned).toBe('2025-12345');
  });

  // -----------------------------------------------------------------------
  // Empty openPositions
  // -----------------------------------------------------------------------
  it('all lines become not-ordered when openPositions is empty', () => {
    const lines = [makeLine(), makeLine({ lineId: 'r-line-2-0' })];
    const result = matchAllOrders(lines, []);

    expect(result.every(l => l.orderAssignmentReason === 'not-ordered')).toBe(true);
  });

  // -----------------------------------------------------------------------
  // orderVorgang and orderOpenQty carried through
  // -----------------------------------------------------------------------
  it('carries orderVorgang and orderOpenQty from the matched OP', () => {
    const lines = [makeLine()];
    const ops = [makeOP({ vorgang: 'V-42', openQty: 7 })];
    const result = matchAllOrders(lines, ops);

    expect(result[0].orderVorgang).toBe('V-42');
    expect(result[0].orderOpenQty).toBe(7);
  });

  // -----------------------------------------------------------------------
  // Multiple articles — independent matching
  // -----------------------------------------------------------------------
  it('matches different articles to their respective OPs independently', () => {
    const lines = [
      makeLine({ lineId: 'line-a-0', manufacturerArticleNo: 'ART.A', ean: 'EAN-A' }),
      makeLine({ lineId: 'line-b-0', manufacturerArticleNo: 'ART.B', ean: 'EAN-B' }),
    ];
    const ops = [
      makeOP({ id: 'op-a', manufacturerArticleNo: 'ART.A', ean: 'EAN-A', belegnummer: 'B0011111' }),
      makeOP({ id: 'op-b', manufacturerArticleNo: 'ART.B', ean: 'EAN-B', belegnummer: 'B0022222' }),
    ];
    const result = matchAllOrders(lines, ops);

    expect(result[0].orderNumberAssigned).toBe('2025-11111');
    expect(result[1].orderNumberAssigned).toBe('2025-22222');
  });
});
