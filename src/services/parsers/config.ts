/**
 * Shared parser runtime configuration.
 */

export type ParserMode = 'auto' | 'devlogic' | 'typescript';

export const DEFAULT_PARSER_MODE: ParserMode = 'typescript';
export const DEFAULT_DEVLOGIC_API_URL = 'http://localhost:8090';

export function normalizeParserMode(mode: unknown): ParserMode {
  const value = String(mode ?? '').trim().toLowerCase();
  if (value === 'devlogic' || value === 'typescript' || value === 'auto') {
    return value;
  }
  return DEFAULT_PARSER_MODE;
}

export function getParserModeFromEnv(): ParserMode {
  return normalizeParserMode(import.meta.env.VITE_PARSER_MODE);
}

export function getParsingTimeoutMs(mode: ParserMode = getParserModeFromEnv()): number {
  return mode === 'typescript' ? 30_000 : 90_000;
}

export function getDevlogicApiUrl(): string {
  const rawValue = String(import.meta.env.VITE_DEVLOGIC_API_URL ?? '').trim();
  const url = rawValue || DEFAULT_DEVLOGIC_API_URL;
  return url.replace(/\/+$/, '');
}

