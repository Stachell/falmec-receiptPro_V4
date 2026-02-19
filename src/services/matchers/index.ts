/**
 * Matcher Module Registry — PROJ-16
 *
 * Modular setup mirroring src/services/parsers/index.ts.
 * New matchers can be added to LOCAL_MATCHERS array.
 */

// Types
export type {
  MatcherModule,
  MatcherConfig,
  SchemaDefinition,
  SchemaFieldDef,
  CrossMatchResult,
  SerialDocument,
  SerialDocumentRow,
  SerialExtractionResult,
  MatcherWarning,
} from './types';

// Matcher Imports
export { FalmecMatcher_Master } from './modules/FalmecMatcher_Master';

import { FalmecMatcher_Master } from './modules/FalmecMatcher_Master';
import type { MatcherModule } from './types';
import type { ArticleMaster } from '@/types';
import { logService } from '../logService';

// Singleton instance
const falmecMaster = new FalmecMatcher_Master();

// MODULAR REGISTRATION: All local TypeScript matchers go here
const LOCAL_MATCHERS: MatcherModule[] = [
  falmecMaster,
];

/** Registry for direct ID lookups */
export const matcherRegistry: Map<string, MatcherModule> = new Map([
  [falmecMaster.moduleId, falmecMaster],
  ['auto', falmecMaster],
]);

export function getMatcher(moduleId: string): MatcherModule | undefined {
  return matcherRegistry.get(moduleId);
}

export function getAllMatchers(): MatcherModule[] {
  return [...LOCAL_MATCHERS];
}

/**
 * Find the appropriate matcher for a given article dataset.
 * Tries canHandle() on each registered matcher; falls back to first available.
 */
export function findMatcherForArticles(articles: ArticleMaster[]): MatcherModule {
  for (const matcher of LOCAL_MATCHERS) {
    if (matcher.canHandle) {
      if (matcher.canHandle(articles)) {
        logService.info(`[MatcherRouter] Zuschlag: '${matcher.moduleName}' hat Artikeldaten akzeptiert.`);
        return matcher;
      }
    } else {
      logService.info(`[MatcherRouter] Zuschlag: '${matcher.moduleName}' uebernimmt (Standard).`);
      return matcher;
    }
  }

  // Absolute fallback
  logService.error('[MatcherRouter] Kein passender Matcher gefunden! Erzwinge FalmecMatcher_Master.');
  return falmecMaster;
}
