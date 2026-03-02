import { describe, expect, it } from 'vitest';
import { normalizeSearchTerm } from './searchNormalization';

describe('normalizeSearchTerm', () => {
  it('returns empty string for nullish values', () => {
    expect(normalizeSearchTerm(undefined)).toBe('');
    expect(normalizeSearchTerm(null)).toBe('');
  });

  it('normalizes casing and trims surrounding whitespace', () => {
    expect(normalizeSearchTerm('  AbC123  ')).toBe('abc123');
  });

  it('removes spaces, dots, hyphens, slashes, and hash signs', () => {
    expect(normalizeSearchTerm('KACL .457#NF')).toBe('kacl457nf');
    expect(normalizeSearchTerm('ABC-12/34#X')).toBe('abc1234x');
  });

  it('keeps other characters unchanged', () => {
    expect(normalizeSearchTerm('AB_C+1')).toBe('ab_c+1');
  });
});

