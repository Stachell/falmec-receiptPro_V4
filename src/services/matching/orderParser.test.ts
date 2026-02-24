import { describe, expect, it } from 'vitest';
import { parseOrderFile } from './orderParser';

function makeCsvFile(content: string, name = 'openwe.csv'): File {
  const bytes = new TextEncoder().encode(content);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return {
    name,
    arrayBuffer: async () => buffer,
  } as unknown as File;
}

describe('parseOrderFile', () => {
  it('prefers Belegnummer on score tie via tie-break priority', async () => {
    const csv = [
      'Bestellnummer;Belegnummer;Bestelljahr;Offene Menge;ART-# (DE);ART-# (IT);EAN',
      '10153;202510153;2025;2;DE-1;IT-1;1111111111111',
      '10154;202510154;2025;1;DE-2;IT-2;2222222222222',
    ].join('\n');

    const result = await parseOrderFile(makeCsvFile(csv));

    expect(result.positions).toHaveLength(2);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics?.selectedHeader.toUpperCase()).toContain('BELEGNUMMER');
    expect(result.diagnostics?.confidence).not.toBe('low');
  });

  it('applies alias overrides deterministically', async () => {
    const csv = [
      'Bestellnummer;Belegnummer;Bestelljahr;Offene Menge;ART-# (DE);ART-# (IT);EAN',
      '10153;202510153;2025;1;DE-1;IT-1;1111111111111',
    ].join('\n');

    const result = await parseOrderFile(makeCsvFile(csv), {
      profileId: 'sage-openwe-v1',
      overrides: {
        aliases: {
          orderNumberCandidates: ['BESTELLNUMMER'],
        },
      },
    });

    expect(result.positions).toHaveLength(1);
    expect(result.diagnostics?.selectedHeader.toUpperCase()).toContain('BESTELLNUMMER');
    expect(result.diagnostics?.candidates.length).toBe(1);
  });

  it('returns diagnostics with low confidence when no valid order number is found', async () => {
    const csv = [
      'Bestellnummer;Belegnummer;Bestelljahr;Offene Menge;ART-# (DE);ART-# (IT);EAN',
      'ABC;XYZ;2025;3;DE-1;IT-1;1111111111111',
      'DEF;ZZZ;2025;1;DE-2;IT-2;2222222222222',
    ].join('\n');

    const result = await parseOrderFile(makeCsvFile(csv));

    expect(result.positions).toHaveLength(0);
    expect(result.diagnostics?.confidence).toBe('low');
    expect(result.diagnostics?.candidates.length).toBeGreaterThan(0);
    expect(result.warnings.some((warning) => warning.includes('Confidence'))).toBe(true);
  });
});
