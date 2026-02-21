/**
 * Run Persistence Service — PROJ-23 Phase A2
 *
 * Raw IndexedDB wrapper for persisting Run data across page refreshes.
 * Follows the same pattern as fileStorageService.ts — NO external library.
 *
 * Database: 'falmec-receiptpro-runs', version 1
 * Object Stores:
 *   - 'runs': Full Run + invoiceLines + issues + auditLog (keyPath: 'id')
 *   - 'metadata': Storage stats singleton (keyPath: 'key')
 *
 * @module services/runPersistenceService
 */

import type {
  Run,
  InvoiceLine,
  Issue,
  AuditLogEntry,
  ParsedInvoiceLineExtended,
  InvoiceParserWarning,
} from '@/types';

const DB_NAME = 'falmec-receiptpro-runs';
const DB_VERSION = 1;
const RUNS_STORE = 'runs';
const METADATA_STORE = 'metadata';

// ── Persisted data shape ───────────────────────────────────────────────

export interface PersistedRunData {
  id: string;                                    // Run.id = keyPath
  run: Run;
  invoiceLines: InvoiceLine[];
  issues: Issue[];
  auditLog: AuditLogEntry[];
  parsedPositions: ParsedInvoiceLineExtended[];
  parserWarnings: InvoiceParserWarning[];
  savedAt: string;                               // ISO timestamp
  sizeEstimateBytes: number;                     // JSON.stringify(data).length * 2
}

/** Lightweight summary for archive listing (no line data). */
export interface PersistedRunSummary {
  id: string;
  fattura: string;
  invoiceDate: string;
  createdAt: string;
  savedAt: string;
  status: Run['status'];
  sizeEstimateBytes: number;
  stats: Run['stats'];
}

export interface StorageStats {
  runCount: number;
  totalSizeBytes: number;
  oldestRun: string | null;    // ISO date of oldest run
  newestRun: string | null;    // ISO date of newest run
}

// ── Database connection ────────────────────────────────────────────────

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[RunPersistence] Failed to open database:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(RUNS_STORE)) {
        const store = db.createObjectStore(RUNS_STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'run.createdAt', { unique: false });
        console.debug('[RunPersistence] Created object store:', RUNS_STORE);
      }

      if (!db.objectStoreNames.contains(METADATA_STORE)) {
        db.createObjectStore(METADATA_STORE, { keyPath: 'key' });
        console.debug('[RunPersistence] Created object store:', METADATA_STORE);
      }
    };
  });
}

// ── CRUD operations ────────────────────────────────────────────────────

/** Save or update a run in IndexedDB. */
async function saveRun(data: Omit<PersistedRunData, 'savedAt' | 'sizeEstimateBytes'>): Promise<boolean> {
  try {
    const db = await openDatabase();
    const savedAt = new Date().toISOString();
    const serialized = JSON.stringify(data);
    const sizeEstimateBytes = serialized.length * 2; // UTF-16 estimate

    const persistedData: PersistedRunData = {
      ...data,
      savedAt,
      sizeEstimateBytes,
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([RUNS_STORE], 'readwrite');
      const store = transaction.objectStore(RUNS_STORE);
      const request = store.put(persistedData);

      request.onsuccess = () => {
        console.debug(`[RunPersistence] Run saved: ${data.id} (${(sizeEstimateBytes / 1024).toFixed(1)} KB)`);
        resolve(true);
      };

      request.onerror = () => {
        console.error('[RunPersistence] Failed to save run:', request.error);
        reject(request.error);
      };

      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error('[RunPersistence] Error saving run:', error);
    return false;
  }
}

/** Load a full run from IndexedDB. */
async function loadRun(runId: string): Promise<PersistedRunData | null> {
  try {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([RUNS_STORE], 'readonly');
      const store = transaction.objectStore(RUNS_STORE);
      const request = store.get(runId);

      request.onsuccess = () => {
        const result = request.result as PersistedRunData | undefined;
        if (result) {
          console.debug(`[RunPersistence] Run loaded: ${runId}`);
        }
        resolve(result ?? null);
      };

      request.onerror = () => {
        console.error('[RunPersistence] Failed to load run:', request.error);
        reject(request.error);
      };

      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error('[RunPersistence] Error loading run:', error);
    return null;
  }
}

/** Load lightweight summaries of all persisted runs (no line data). */
async function loadRunList(): Promise<PersistedRunSummary[]> {
  try {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([RUNS_STORE], 'readonly');
      const store = transaction.objectStore(RUNS_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const runs = request.result as PersistedRunData[];
        const summaries: PersistedRunSummary[] = runs.map(r => ({
          id: r.id,
          fattura: r.run.invoice.fattura,
          invoiceDate: r.run.invoice.invoiceDate,
          createdAt: r.run.createdAt,
          savedAt: r.savedAt,
          status: r.run.status,
          sizeEstimateBytes: r.sizeEstimateBytes,
          stats: r.run.stats,
        }));

        // Sort newest first
        summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        console.debug(`[RunPersistence] Loaded ${summaries.length} run summaries`);
        resolve(summaries);
      };

      request.onerror = () => {
        console.error('[RunPersistence] Failed to load run list:', request.error);
        reject(request.error);
      };

      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error('[RunPersistence] Error loading run list:', error);
    return [];
  }
}

/** Delete a run from IndexedDB. */
async function deleteRun(runId: string): Promise<boolean> {
  try {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([RUNS_STORE], 'readwrite');
      const store = transaction.objectStore(RUNS_STORE);
      const request = store.delete(runId);

      request.onsuccess = () => {
        console.debug(`[RunPersistence] Run deleted: ${runId}`);
        resolve(true);
      };

      request.onerror = () => {
        console.error('[RunPersistence] Failed to delete run:', request.error);
        reject(request.error);
      };

      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error('[RunPersistence] Error deleting run:', error);
    return false;
  }
}

/** Clear all persisted runs. */
async function clearAll(): Promise<boolean> {
  try {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([RUNS_STORE], 'readwrite');
      const store = transaction.objectStore(RUNS_STORE);
      const request = store.clear();

      request.onsuccess = () => {
        console.debug('[RunPersistence] All runs cleared');
        resolve(true);
      };

      request.onerror = () => {
        console.error('[RunPersistence] Failed to clear runs:', request.error);
        reject(request.error);
      };

      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error('[RunPersistence] Error clearing runs:', error);
    return false;
  }
}

// ── Storage stats ──────────────────────────────────────────────────────

/** Get aggregate storage statistics. */
async function getStorageStats(): Promise<StorageStats> {
  try {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([RUNS_STORE], 'readonly');
      const store = transaction.objectStore(RUNS_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const runs = request.result as PersistedRunData[];
        const stats: StorageStats = {
          runCount: runs.length,
          totalSizeBytes: runs.reduce((sum, r) => sum + r.sizeEstimateBytes, 0),
          oldestRun: null,
          newestRun: null,
        };

        if (runs.length > 0) {
          const sorted = runs
            .map(r => r.run.createdAt)
            .sort();
          stats.oldestRun = sorted[0];
          stats.newestRun = sorted[sorted.length - 1];
        }

        resolve(stats);
      };

      request.onerror = () => {
        console.error('[RunPersistence] Failed to get storage stats:', request.error);
        reject(request.error);
      };

      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error('[RunPersistence] Error getting storage stats:', error);
    return { runCount: 0, totalSizeBytes: 0, oldestRun: null, newestRun: null };
  }
}

// ── Archive sync (File System Access API) ──────────────────────────────

/**
 * Export all persisted runs to a user-selected directory using File System Access API.
 * Each run is written to a separate subfolder: Run_YYYY-MM-DD_Fattura_XYZ/run-data.json
 *
 * Chromium-only (Chrome/Edge). No fallback needed (enterprise app).
 *
 * @param purgeOlderThanMonths - If set, delete runs older than N months after export
 * @returns Number of exported runs, or -1 if user cancelled / API unavailable
 */
async function exportToDirectory(purgeOlderThanMonths?: number): Promise<number> {
  // Check File System Access API availability
  if (!('showDirectoryPicker' in window)) {
    console.error('[RunPersistence] File System Access API not available');
    return -1;
  }

  let dirHandle: FileSystemDirectoryHandle;
  try {
    dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
  } catch (err) {
    // User cancelled the picker
    console.debug('[RunPersistence] Directory picker cancelled');
    return -1;
  }

  try {
    const db = await openDatabase();
    const runs = await new Promise<PersistedRunData[]>((resolve, reject) => {
      const transaction = db.transaction([RUNS_STORE], 'readonly');
      const store = transaction.objectStore(RUNS_STORE);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as PersistedRunData[]);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => db.close();
    });

    let exportedCount = 0;

    for (const run of runs) {
      // Build folder name: Run_YYYY-MM-DD_Fattura_XYZ
      const dateStr = run.run.createdAt.slice(0, 10); // YYYY-MM-DD
      const fattura = run.run.invoice.fattura.replace(/[^\w.-]/g, '_');
      const folderName = `Run_${dateStr}_Fattura_${fattura}`;

      try {
        const subDir = await dirHandle.getDirectoryHandle(folderName, { create: true });
        const fileHandle = await subDir.getFileHandle('run-data.json', { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(run, null, 2));
        await writable.close();
        exportedCount++;
      } catch (writeErr) {
        console.error(`[RunPersistence] Failed to export run ${run.id}:`, writeErr);
      }
    }

    // Purge old runs if requested
    if (purgeOlderThanMonths != null && purgeOlderThanMonths > 0) {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - purgeOlderThanMonths);
      const cutoffISO = cutoff.toISOString();

      const toDelete = runs.filter(r => r.run.createdAt < cutoffISO);
      for (const old of toDelete) {
        await deleteRun(old.id);
      }

      if (toDelete.length > 0) {
        console.debug(`[RunPersistence] Purged ${toDelete.length} runs older than ${purgeOlderThanMonths} months`);
      }
    }

    console.debug(`[RunPersistence] Exported ${exportedCount} runs to directory`);
    return exportedCount;
  } catch (error) {
    console.error('[RunPersistence] Error during export:', error);
    return -1;
  }
}

/** Check if IndexedDB is available. */
function isAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

// ── Public API ─────────────────────────────────────────────────────────

export const runPersistenceService = {
  saveRun,
  loadRun,
  loadRunList,
  deleteRun,
  clearAll,
  getStorageStats,
  exportToDirectory,
  isAvailable,
};
