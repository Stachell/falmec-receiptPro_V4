/**
 * Parser Registry Service
 *
 * Manages `parser-registry.json` on disk via File System Access API.
 * Single Source of Truth for the active parser selection.
 *
 * Responsibilities:
 * - Read/write the registry file from/to the user's data directory
 * - Boot validation: validate selectedParserId against known modules
 * - Auto-select: if exactly 1 parser exists, auto-set it
 * - Provide getters/setters for the frontend dropdown
 */

import { fileSystemService } from './fileSystemService';
import { getAllParsers } from './parsers';
import { logService } from './logService';

// ── Types ────────────────────────────────────────────────────────────

export interface ParserRegistryModule {
  fileName: string;
  moduleId: string;
  moduleName: string;
  version: string;
  addedAt: string;
  source: 'builtin' | 'imported';
}

export interface ParserRegistry {
  version: number;
  selectedParserId: string;
  modules: ParserRegistryModule[];
}

const REGISTRY_FILE = 'parser-registry.json';

// ── Service ──────────────────────────────────────────────────────────

class ParserRegistryService {
  private cached: ParserRegistry | null = null;

  /**
   * Build a default registry from the statically imported parsers.
   * Used when no file exists on disk or the file is corrupt.
   */
  private buildDefault(): ParserRegistry {
    const parsers = getAllParsers();
    return {
      version: 1,
      selectedParserId: 'auto',
      modules: parsers.map((p) => ({
        fileName: `${p.moduleId}.ts`,
        moduleId: p.moduleId,
        moduleName: p.moduleName,
        version: p.version,
        addedAt: new Date().toISOString(),
        source: 'builtin' as const,
      })),
    };
  }

  // ── Read / Write ───────────────────────────────────────────────────

  /** Read registry from disk. Falls back to default if unavailable. */
  async read(): Promise<ParserRegistry> {
    const fromDisk = await fileSystemService.readJsonFile<ParserRegistry>(REGISTRY_FILE);

    if (fromDisk && typeof fromDisk.version === 'number' && Array.isArray(fromDisk.modules)) {
      this.cached = fromDisk;
      return fromDisk;
    }

    // Fallback: build from known parsers
    const defaultReg = this.buildDefault();
    this.cached = defaultReg;
    return defaultReg;
  }

  /** Write registry to disk. Updates in-memory cache. */
  async write(registry: ParserRegistry): Promise<boolean> {
    this.cached = registry;
    return fileSystemService.writeJsonFile(REGISTRY_FILE, registry);
  }

  // ── Boot Validation (Spec 4.2.5) ──────────────────────────────────

  /**
   * Called once at app start. Reads the registry, validates
   * `selectedParserId`, applies auto-select rules, and persists
   * corrections back to disk if needed.
   */
  async initialize(): Promise<ParserRegistry> {
    const registry = await this.read();
    const knownIds = new Set(registry.modules.map((m) => m.moduleId));
    let dirty = false;

    // 1) Ensure selectedParserId field exists
    if (!registry.selectedParserId) {
      registry.selectedParserId = 'auto';
      dirty = true;
      logService.info('Parser-Registry: selectedParserId war leer, auf "auto" gesetzt.', { step: 'System' });
    }

    // 2) Auto-Select bei Einzel-Parser (Spec 4.2.6)
    if (registry.modules.length === 1) {
      const singleId = registry.modules[0].moduleId;
      if (registry.selectedParserId !== singleId) {
        registry.selectedParserId = singleId;
        dirty = true;
        logService.info(
          `Auto-Select: Einziger Parser '${registry.modules[0].moduleName}' automatisch gewaehlt.`,
          { step: 'System' },
        );
      }
    } else if (
      registry.selectedParserId !== 'auto' &&
      !knownIds.has(registry.selectedParserId)
    ) {
      // 3) selectedParserId references non-existent module → fallback
      logService.warn(
        `Gespeicherter Parser '${registry.selectedParserId}' nicht verfuegbar. Fallback auf Auto.`,
        { step: 'System' },
      );
      registry.selectedParserId = 'auto';
      dirty = true;
    }

    // Persist corrections
    if (dirty) {
      await this.write(registry);
    }

    this.cached = registry;
    return registry;
  }

  // ── Getters ────────────────────────────────────────────────────────

  /** Currently selected parser ID (from cache). */
  getSelectedParserId(): string {
    return this.cached?.selectedParserId ?? 'auto';
  }

  /** Registered modules (from cache). */
  getModules(): ParserRegistryModule[] {
    return this.cached?.modules ?? [];
  }

  /** Full cached registry (or null before initialize). */
  getRegistry(): ParserRegistry | null {
    return this.cached;
  }

  // ── Setter (Dropdown writes) ───────────────────────────────────────

  /**
   * Update selectedParserId and persist to disk.
   * Returns true if the write succeeded, false otherwise
   * (in which case the value is still held in memory).
   */
  async setSelectedParserId(parserId: string): Promise<boolean> {
    if (!this.cached) {
      await this.read();
    }
    this.cached!.selectedParserId = parserId;
    return this.write(this.cached!);
  }
}

// Singleton
export const parserRegistryService = new ParserRegistryService();
