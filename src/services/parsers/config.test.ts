import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getDevlogicApiUrl,
  getParserModeFromEnv,
  getParsingTimeoutMs,
  normalizeParserMode,
} from './config';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('parser config', () => {
  it('normalizes parser mode values', () => {
    expect(normalizeParserMode('devlogic')).toBe('devlogic');
    expect(normalizeParserMode('TYPEscript')).toBe('typescript');
    expect(normalizeParserMode('auto')).toBe('auto');
    expect(normalizeParserMode('invalid')).toBe('typescript');
    expect(normalizeParserMode(undefined)).toBe('typescript');
  });

  it('reads parser mode from env', () => {
    vi.stubEnv('VITE_PARSER_MODE', 'devlogic');
    expect(getParserModeFromEnv()).toBe('devlogic');
  });

  it('uses mode-based parsing timeout', () => {
    expect(getParsingTimeoutMs('typescript')).toBe(30_000);
    expect(getParsingTimeoutMs('devlogic')).toBe(90_000);
    expect(getParsingTimeoutMs('auto')).toBe(90_000);
  });

  it('reads and sanitizes devlogic api url', () => {
    vi.stubEnv('VITE_DEVLOGIC_API_URL', 'http://localhost:9000///');
    expect(getDevlogicApiUrl()).toBe('http://localhost:9000');
  });
});
