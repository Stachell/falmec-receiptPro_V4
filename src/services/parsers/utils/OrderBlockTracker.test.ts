import { describe, expect, it } from 'vitest';
import { extractOrderReferences } from './OrderBlockTracker';

describe('extractOrderReferences', () => {
  it('extracts standard 10xxx order number', () => {
    expect(extractOrderReferences('Vs. ORDINE Nr. 10153')).toEqual(['10153']);
  });

  it('expands underscore short codes with 10-prefix', () => {
    expect(extractOrderReferences('Vs. ORDINE 0_10170_173_172')).toEqual([
      '10170',
      '10173',
      '10172',
    ]);
  });

  it('ignores non-10xxx short fragments without base prefix', () => {
    expect(extractOrderReferences('Vs. ORDINE 0_66_90')).toEqual([]);
  });
});
