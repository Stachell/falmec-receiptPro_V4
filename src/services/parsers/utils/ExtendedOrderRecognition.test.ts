import { describe, expect, it } from 'vitest';
import {
  extractOrderReferencesExtended,
  enrichOrderCandidates,
  buildTypeBWarning,
  type ClassifiedOrder,
} from './ExtendedOrderRecognition';
import type { ParsedInvoiceLine } from '../types';
import type { ExtractedTextItem } from './pdfTextExtractor';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeItem(text: string, x: number, y: number): ExtractedTextItem {
  return { text, x, y, width: text.length * 5, height: 10 };
}

function makeLine(overrides: Partial<ParsedInvoiceLine> = {}): ParsedInvoiceLine {
  return {
    positionIndex: 1,
    manufacturerArticleNo: 'KACL.457#NF',
    ean: '8034122713656',
    descriptionIT: 'Test',
    quantityDelivered: 1,
    unitPrice: 100,
    totalPrice: 100,
    orderCandidates: [],
    orderCandidatesText: '',
    orderStatus: 'NO',
    rawPositionText: 'PZ 1 100,00 100,00',
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════════════
// extractOrderReferencesExtended
// ═════════════════════════════════════════════════════════════════════

describe('extractOrderReferencesExtended', () => {
  it('extracts standalone 10xxx as Typ A', () => {
    const result = extractOrderReferencesExtended('Vs. ORDINE Nr. 10153');
    expect(result).toEqual([{ number: '10153', type: 'A' }]);
  });

  it('extracts standalone 9xxxx as Typ B (with ORDINE marker)', () => {
    const result = extractOrderReferencesExtended('Vs. ORDINE Nr. 90100');
    expect(result).toEqual([{ number: '90100', type: 'B' }]);
  });

  it('does NOT extract 9xxxx without ORDINE marker', () => {
    const result = extractOrderReferencesExtended('Nr. 90100 some text');
    expect(result).toEqual([]);
  });

  it('extracts underscore format with 10xxx prefix', () => {
    const result = extractOrderReferencesExtended('Vs. ORDINE 0_10170_173_172');
    expect(result).toEqual([
      { number: '10170', type: 'A' },
      { number: '10173', type: 'A' },
      { number: '10172', type: 'A' },
    ]);
  });

  it('extracts underscore format with 9xxxx prefix', () => {
    const result = extractOrderReferencesExtended('Vs. ORDINE 0_90100_101_102');
    expect(result).toEqual([
      { number: '90100', type: 'B' },
      { number: '90101', type: 'B' },
      { number: '90102', type: 'B' },
    ]);
  });

  it('handles mixed Typ A and Typ B', () => {
    const result = extractOrderReferencesExtended('Vs. ORDINE Nr. 10153 90100');
    expect(result).toEqual([
      { number: '10153', type: 'A' },
      { number: '90100', type: 'B' },
    ]);
  });

  it('deduplicates order numbers', () => {
    const result = extractOrderReferencesExtended('Vs. ORDINE Nr. 10153 10153');
    expect(result).toEqual([{ number: '10153', type: 'A' }]);
  });

  it('returns empty array for no matches', () => {
    const result = extractOrderReferencesExtended('Vs. ORDINE Nr. keine Nummer');
    expect(result).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════
// enrichOrderCandidates
// ═════════════════════════════════════════════════════════════════════

describe('enrichOrderCandidates', () => {
  it('keeps existing Typ A candidates unchanged, no warnings', () => {
    const lines = [makeLine({ orderCandidates: ['10153'], orderStatus: 'YES' })];
    const { enrichedLines, warnings } = enrichOrderCandidates(lines, [], []);

    expect(enrichedLines[0].orderCandidates).toEqual(['10153']);
    expect(warnings).toHaveLength(0);
  });

  it('emits warning for existing Typ B only candidates', () => {
    const lines = [makeLine({
      orderCandidates: ['90100'],
      orderCandidatesText: '90100',
      orderStatus: 'YES',
    })];
    const { enrichedLines, warnings } = enrichOrderCandidates(lines, [], []);

    expect(enrichedLines[0].orderCandidates).toEqual(['90100']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe('ORDER_TYPE_B_DETECTED');
    expect(warnings[0].severity).toBe('warning');
    expect(warnings[0].positionIndex).toBe(1);
  });

  it('mixed Typ A + B: keeps only Typ A, no warning', () => {
    const lines = [makeLine({
      orderCandidates: ['10153', '90100'],
      orderCandidatesText: '10153|90100',
      orderStatus: 'check',
    })];
    const { enrichedLines, warnings } = enrichOrderCandidates(lines, [], []);

    expect(enrichedLines[0].orderCandidates).toEqual(['10153']);
    expect(enrichedLines[0].orderStatus).toBe('YES');
    expect(warnings).toHaveLength(0);
  });

  it('returns lines unchanged when no order candidates', () => {
    const lines = [makeLine()];
    const { enrichedLines, warnings } = enrichOrderCandidates(lines, [], []);

    expect(enrichedLines[0].orderCandidates).toEqual([]);
    expect(enrichedLines[0].orderStatus).toBe('NO');
    expect(warnings).toHaveLength(0);
  });

  it('does not modify original lines array (immutability)', () => {
    const original = [makeLine({ orderCandidates: ['10153', '90100'] })];
    const originalCandidates = [...original[0].orderCandidates];
    enrichOrderCandidates(original, [], []);

    expect(original[0].orderCandidates).toEqual(originalCandidates);
  });
});

// ═════════════════════════════════════════════════════════════════════
// buildTypeBWarning
// ═════════════════════════════════════════════════════════════════════

describe('buildTypeBWarning', () => {
  it('builds correct warning structure', () => {
    const warning = buildTypeBWarning(3, ['90100', '90101']);

    expect(warning.code).toBe('ORDER_TYPE_B_DETECTED');
    expect(warning.severity).toBe('warning');
    expect(warning.positionIndex).toBe(3);
    expect(warning.message).toContain('90100');
    expect(warning.message).toContain('90101');
    expect(warning.context).toEqual({
      orderNumbers: ['90100', '90101'],
      orderType: 'B',
    });
  });
});
