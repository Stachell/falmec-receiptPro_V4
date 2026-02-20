import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseMasterDataFile } from './masterDataParser';

function makeMasterDataFile(serialValues: string[]): File {
  const rows: unknown[][] = [
    ['Art-# (DE)', 'Art-# (IT)', 'EAN', 'Preis netto', 'SN-Pflicht', 'Lagerort'],
    ...serialValues.map((serialValue, index) => [
      `1${String(10000 + index)}`,
      `IT-${index + 1}`,
      `80300000000${String(index).padStart(2, '0')}`,
      '99,95',
      serialValue,
      'WE Lager',
    ]),
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Artikel');
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return {
    name: 'masterdata.xlsx',
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    arrayBuffer: async () => bytes as ArrayBuffer,
  } as unknown as File;
}

describe('parseMasterDataFile serialRequired mapping', () => {
  it('maps configured true values to serialRequirement=true', async () => {
    const file = makeMasterDataFile([
      'JA',
      'YES',
      'TRUE',
      '1',
      'X',
      'Lagerführung und Verkauf',
      'nur Verkauf',
      'nur Lagerführung',
      'vorhanden',
      '  nur   Verkauf  ',
      'lagerfuehrung-und-verkauf',
      'lagerführung/und-verkauf',
    ]);

    const result = await parseMasterDataFile(file);
    expect(result.articles).toHaveLength(12);
    expect(result.articles.every((a) => a.serialRequirement === true)).toBe(true);
  });

  it('maps unknown and explicit false-like values to serialRequirement=false', async () => {
    const file = makeMasterDataFile([
      '',
      'NEIN',
      'NO',
      'FALSE',
      '0',
      'n/a',
      'unbekannt',
    ]);

    const result = await parseMasterDataFile(file);
    expect(result.articles).toHaveLength(7);
    expect(result.articles.every((a) => a.serialRequirement === false)).toBe(true);
  });

  it('does not affect other mapped fields while parsing serialRequired', async () => {
    const file = makeMasterDataFile(['Lagerführung und Verkauf']);
    const result = await parseMasterDataFile(file);

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].manufacturerArticleNo).toBe('IT-1');
    expect(result.articles[0].ean).toBe('8030000000000');
    expect(result.articles[0].unitPriceNet).toBeCloseTo(99.95);
    expect(result.articles[0].serialRequirement).toBe(true);
  });
});
