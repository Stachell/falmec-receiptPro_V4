/**
 * Matcher Registry Service — PROJ-16
 *
 * Manages `matcher-registry.json` on disk via File System Access API.
 * Single Source of Truth for the active matcher selection.
 * Mirrors parserRegistryService.ts exactly.
 */

import { fileSystemService } from './fileSystemService';
import { getAllMatchers } from './matchers';
import { logService } from './logService';

// ── Types ────────────────────────────────────────────────────────────

export interface MatcherRegistryModule {
  fileName: string;
  moduleId: string;
  moduleName: string;
  version: string;
  addedAt: string;
  source: 'builtin' | 'imported';
}

export interface MatcherRegistry {
  version: number;
  selectedMatcherId: string;
  modules: MatcherRegistryModule[];
}

const REGISTRY_FILE = 'matcher-registry.json';

// ── Service ──────────────────────────────────────────────────────────

class MatcherRegistryService {
  private cached: MatcherRegistry | null = null;

  private buildDefault(): MatcherRegistry {
    const matchers = getAllMatchers();
    return {
      version: 1,
      selectedMatcherId: 'auto',
      modules: matchers.map((m) => ({
        fileName: `${m.moduleId}.ts`,
        moduleId: m.moduleId,
        moduleName: m.moduleName,
        version: m.version,
        addedAt: new Date().toISOString(),
        source: 'builtin' as const,
      })),
    };
  }

  async wipeRegistry(): Promise<void> {
    await fileSystemService.deleteFile(REGISTRY_FILE);
    this.cached = null;
    logService.info('Matcher-Registry gewiped (wird beim naechsten Start neu generiert).', { step: 'System' });
  }

  async read(): Promise<MatcherRegistry> {
    const fromDisk = await fileSystemService.readJsonFile<MatcherRegistry>(REGISTRY_FILE);

    if (fromDisk && typeof fromDisk.version === 'number' && Array.isArray(fromDisk.modules)) {
      this.cached = fromDisk;
      return fromDisk;
    }

    const defaultReg = this.buildDefault();
    this.cached = defaultReg;
    return defaultReg;
  }

  async write(registry: MatcherRegistry): Promise<boolean> {
    this.cached = registry;
    return fileSystemService.writeJsonFile(REGISTRY_FILE, registry);
  }

  async initialize(): Promise<MatcherRegistry> {
    let registry = await this.read();
    const liveMatchers = getAllMatchers();

    // Module-list comparison
    const registryIds = registry.modules.map((m) => m.moduleId).sort().join(',');
    const liveIds = liveMatchers.map((m) => m.moduleId).sort().join(',');

    if (registryIds !== liveIds) {
      const previousSelectedId = registry.selectedMatcherId;
      logService.info(
        `Matcher-Registry: Modulliste veraendert (registry=[${registryIds}] vs live=[${liveIds}]). Rebuild.`,
        { step: 'System' },
      );
      await this.wipeRegistry();
      registry = this.buildDefault();

      const newIds = new Set(registry.modules.map((m) => m.moduleId));
      if (previousSelectedId === 'auto' || newIds.has(previousSelectedId)) {
        registry.selectedMatcherId = previousSelectedId;
      } else {
        registry.selectedMatcherId = 'auto';
      }
      await this.write(registry);
    }

    // Standard boot validation
    const knownIds = new Set(registry.modules.map((m) => m.moduleId));
    let dirty = false;

    if (!registry.selectedMatcherId) {
      registry.selectedMatcherId = 'auto';
      dirty = true;
      logService.info('Matcher-Registry: selectedMatcherId war leer, auf "auto" gesetzt.', { step: 'System' });
    }

    // Auto-Select when only 1 matcher
    if (registry.modules.length === 1) {
      const singleId = registry.modules[0].moduleId;
      if (registry.selectedMatcherId !== singleId) {
        registry.selectedMatcherId = singleId;
        dirty = true;
        logService.info(
          `Auto-Select: Einziger Matcher '${registry.modules[0].moduleName}' automatisch gewaehlt.`,
          { step: 'System' },
        );
      }
    } else if (
      registry.selectedMatcherId !== 'auto' &&
      !knownIds.has(registry.selectedMatcherId)
    ) {
      logService.warn(
        `Gespeicherter Matcher '${registry.selectedMatcherId}' nicht verfuegbar. Fallback auf Auto.`,
        { step: 'System' },
      );
      registry.selectedMatcherId = 'auto';
      dirty = true;
    }

    if (dirty) {
      await this.write(registry);
    }

    this.cached = registry;
    return registry;
  }

  getSelectedMatcherId(): string {
    return this.cached?.selectedMatcherId ?? 'auto';
  }

  getModules(): MatcherRegistryModule[] {
    return this.cached?.modules ?? [];
  }

  getRegistry(): MatcherRegistry | null {
    return this.cached;
  }

  async setSelectedMatcherId(matcherId: string): Promise<boolean> {
    if (!this.cached) {
      await this.read();
    }
    this.cached!.selectedMatcherId = matcherId;
    return this.write(this.cached!);
  }
}

// Singleton
export const matcherRegistryService = new MatcherRegistryService();
