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
  PreFilteredSerialRow,
  ArticleMaster,
  ParsedOrderPosition,
} from '@/types';
import type { ParsedInvoiceResult } from '@/services/parsers';
import type { SerialDocument } from '@/services/matchers/types';
import type { LogEntry } from '@/services/logService';

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
  // ── NEU für vollständige Rehydrierung (PROJ-40) ──────────────────────
  parsedInvoiceResult: ParsedInvoiceResult | null;  // PDF-Preview
  serialDocument: SerialDocument | null;             // S/N-Excel für Neu-Verarbeiten
  uploadMetadata: PersistedUploadMeta[];             // Dateinamen + Typen der Uploads
  runLog?: LogEntry[];                           // PROJ-41: Run-Log für IndexedDB-Persistenz
  preFilteredSerials?: PreFilteredSerialRow[];   // PROJ-40: S/N-Rehydrierung
  // ── PROJ-49 SSOT-Felder ──────────────────────────────────────────────────
  ingestStatus?: {
    pdf: 'ready' | 'invalid' | 'pending';
    articleList: 'ready' | 'invalid' | 'pending';
    serialList: 'ready' | 'not_provided' | 'invalid' | 'pending';
    openWE: 'ready' | 'not_provided' | 'invalid' | 'pending';
  };
  parsedOrderPool?: ParsedOrderPosition[];       // aus parseOrderFile() — run-spezifisch
  parsedArticlePool?: ArticleMaster[];           // aus parseMasterDataFile() — run-spezifisch
  savedAt: string;                               // ISO timestamp
  sizeEstimateBytes: number;                     // JSON.stringify(data).length * 2
}

/** Lean upload metadata (kein File-Binary — das liegt in fileStorageService). PROJ-40. */
export interface PersistedUploadMeta {
  type: 'invoice' | 'openWE' | 'serialList' | 'articleList';
  name: string;
  size: number;
  uploadedAt: string;
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
  invoiceTotal: number | null;
  step1AmountCheckPassed: boolean | null;
}

/**
 * PROJ-50 FINAL-FIX — Record-basierter SSOT-Filter für Tombstones (Grabsteine).
 *
 * Ein Record ist ein Tombstone aus cleanupFailedIngest, wenn ALLE sechs
 * Merkmale zutreffen (dreifach-konjunktive Robustheit — legitime failed-Runs
 * mit echten Daten werden NICHT versehentlich ausgeblendet):
 *
 *   1. `record.run.status === 'failed'`
 *   2. `record.run.invoice.fattura` leer (fehlt oder whitespace-only)
 *   3. `record.run.stats.parsedInvoiceLines === 0`
 *   4. `record.run.steps.length === 0`              (Tombstone hat leere Steps)
 *   5. `record.ingestStatus` existiert               (PROJ-49 SSOT-Feld)
 *   6. Alle vier `ingestStatus`-Felder === `'invalid'`
 *
 * Dieser Helper ist SSOT und wird in vier Pfaden verwendet:
 *   - `loadRunList()`          — vor Summary-Map
 *   - `getStorageStats()`      — vor Aggregation
 *   - `exportToDirectory()`    — vor Disk-Write
 *   - `persistenceSlice.loadPersistedRun()` — ersetzt die alte 2-Feld-Logik
 */
export function isTombstoneRecord(record: PersistedRunData): boolean {
  if (record.run.status !== 'failed') return false;
  const fattura = record.run.invoice?.fattura;
  const hasNoFattura = !fattura || fattura.trim() === '';
  if (!hasNoFattura) return false;
  if (record.run.stats?.parsedInvoiceLines !== 0) return false;
  if ((record.run.steps?.length ?? 0) !== 0) return false;
  const s = record.ingestStatus;
  if (!s) return false;
  return (
    s.pdf === 'invalid' &&
    s.articleList === 'invalid' &&
    s.serialList === 'invalid' &&
    s.openWE === 'invalid'
  );
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

/** PROJ-49: Extended payload type — currentParsedRunId is a transient signal, not persisted. */
type SaveRunPayload = Omit<PersistedRunData, 'savedAt' | 'sizeEstimateBytes'> & {
  currentParsedRunId?: string | null;
};

/** Save or update a run in IndexedDB with PROJ-49 Overwrite-Schutz. */
async function saveRun(data: SaveRunPayload): Promise<boolean> {
  try {
    const db = await openDatabase();

    // PROJ-49: Extract transient signal before persisting
    const { currentParsedRunId, ...cleanData } = data;
    const runId = cleanData.id;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([RUNS_STORE], 'readwrite');
      const store = transaction.objectStore(RUNS_STORE);

      // PROJ-49: Read existing entry in the same transaction for merge protection
      const getRequest = store.get(runId);

      getRequest.onsuccess = () => {
        const existing = getRequest.result as PersistedRunData | undefined;
        let mergedData = { ...cleanData };

        if (existing) {
          // PROJ-49: Overwrite-Schutz — sensible Felder nur ueberschreiben wenn legitimiert
          const isOwnedByCurrentRun = currentParsedRunId === runId;

          // parsedInvoiceResult: beibehalten wenn neuer Wert null UND nicht-owned
          if (
            mergedData.parsedInvoiceResult === null &&
            existing.parsedInvoiceResult !== null &&
            !isOwnedByCurrentRun
          ) {
            console.debug(`[RunPersistence] Overwrite verhindert: parsedInvoiceResult (runId=${runId}, currentParsedRunId=${currentParsedRunId})`);
            mergedData.parsedInvoiceResult = existing.parsedInvoiceResult;
          }

          // parsedPositions: beibehalten wenn neuer Wert [] UND nicht-owned
          if (
            mergedData.parsedPositions.length === 0 &&
            existing.parsedPositions.length > 0 &&
            !isOwnedByCurrentRun
          ) {
            console.debug(`[RunPersistence] Overwrite verhindert: parsedPositions (runId=${runId}, currentParsedRunId=${currentParsedRunId})`);
            mergedData.parsedPositions = existing.parsedPositions;
          }

          // preFilteredSerials: beibehalten wenn neuer Wert leer UND bestehend nicht-leer UND uploadMetadata hat serialList
          const hasSerialUpload = (mergedData.uploadMetadata ?? existing.uploadMetadata)?.some(
            m => m.type === 'serialList',
          );
          if (
            (!mergedData.preFilteredSerials || mergedData.preFilteredSerials.length === 0) &&
            existing.preFilteredSerials &&
            existing.preFilteredSerials.length > 0 &&
            hasSerialUpload
          ) {
            console.debug(`[RunPersistence] Overwrite verhindert: preFilteredSerials (runId=${runId})`);
            mergedData.preFilteredSerials = existing.preFilteredSerials;
          }

          // serialDocument: beibehalten wenn neuer Wert null UND bestehend nicht-null UND serialList vorhanden
          if (
            mergedData.serialDocument === null &&
            existing.serialDocument !== null &&
            hasSerialUpload
          ) {
            console.debug(`[RunPersistence] Overwrite verhindert: serialDocument (runId=${runId})`);
            mergedData.serialDocument = existing.serialDocument;
          }

          // PROJ-49: uploadMetadata — leere Überschreibung verhindern wenn nicht owned
          if (
            (!mergedData.uploadMetadata || mergedData.uploadMetadata.length === 0) &&
            existing.uploadMetadata?.length > 0 &&
            !isOwnedByCurrentRun
          ) {
            console.debug(`[RunPersistence] Overwrite verhindert: uploadMetadata (runId=${runId}, currentParsedRunId=${currentParsedRunId})`);
            mergedData.uploadMetadata = existing.uploadMetadata;
          }

          // PROJ-49: parsedPositions — leere Überschreibung verhindern wenn nicht owned
          if (
            (!mergedData.parsedPositions || mergedData.parsedPositions.length === 0) &&
            existing.parsedPositions?.length > 0 &&
            !isOwnedByCurrentRun
          ) {
            console.debug(`[RunPersistence] Overwrite verhindert: parsedPositions (runId=${runId}, currentParsedRunId=${currentParsedRunId})`);
            mergedData.parsedPositions = existing.parsedPositions;
          }

          // PROJ-49: parserWarnings — leere Überschreibung verhindern wenn nicht owned
          if (
            (!mergedData.parserWarnings || mergedData.parserWarnings.length === 0) &&
            existing.parserWarnings?.length > 0 &&
            !isOwnedByCurrentRun
          ) {
            console.debug(`[RunPersistence] Overwrite verhindert: parserWarnings (runId=${runId}, currentParsedRunId=${currentParsedRunId})`);
            mergedData.parserWarnings = existing.parserWarnings;
          }

          // PROJ-49 SSOT: ingestStatus — nie durch Auto-Save löschen (Plan-Lücke-Fix)
          // Auto-Save trägt dieses Feld nicht in der Payload — ohne Schutz geht es verloren.
          if (!mergedData.ingestStatus && existing.ingestStatus) {
            mergedData.ingestStatus = existing.ingestStatus;
          }

          // PROJ-49 SSOT: parsedArticlePool — nie durch Auto-Save löschen
          if ((!mergedData.parsedArticlePool || mergedData.parsedArticlePool.length === 0) &&
              existing.parsedArticlePool && existing.parsedArticlePool.length > 0) {
            mergedData.parsedArticlePool = existing.parsedArticlePool;
          }

          // PROJ-49 SSOT: parsedOrderPool — nie durch Auto-Save löschen
          if ((!mergedData.parsedOrderPool || mergedData.parsedOrderPool.length === 0) &&
              existing.parsedOrderPool && existing.parsedOrderPool.length > 0) {
            mergedData.parsedOrderPool = existing.parsedOrderPool;
          }
        }

        const savedAt = new Date().toISOString();
        const serialized = JSON.stringify(mergedData);
        const sizeEstimateBytes = serialized.length * 2; // UTF-16 estimate

        const persistedData: PersistedRunData = {
          ...mergedData,
          savedAt,
          sizeEstimateBytes,
        };

        const putRequest = store.put(persistedData);

        putRequest.onsuccess = () => {
          console.debug(`[RunPersistence] Run saved: ${runId} (${(sizeEstimateBytes / 1024).toFixed(1)} KB)`);
          resolve(true);
        };

        putRequest.onerror = () => {
          console.error('[RunPersistence] Failed to save run:', putRequest.error);
          reject(putRequest.error);
        };
      };

      getRequest.onerror = () => {
        console.error('[RunPersistence] Failed to read existing run for merge:', getRequest.error);
        reject(getRequest.error);
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
        const allRuns = request.result as PersistedRunData[];
        // PROJ-50 FINAL-FIX: Tombstones bereits im Service filtern (Record-SSOT).
        const runs = allRuns.filter(r => !isTombstoneRecord(r));
        const summaries: PersistedRunSummary[] = runs.map(r => {
          const invoiceTotal = r.run.invoice.invoiceTotal ?? null;
          let step1AmountCheckPassed: boolean | null = null;
          if (invoiceTotal != null) {
            if (r.run.invoice.qtyValidationStatus !== 'ok') {
              step1AmountCheckPassed = false;
            } else {
              const lineSum = r.invoiceLines.reduce((s, l) => s + l.totalLineAmount, 0);
              step1AmountCheckPassed = Math.abs(lineSum - invoiceTotal) < 0.10;
            }
          }
          return {
            id: r.id,
            fattura: r.run.invoice.fattura,
            invoiceDate: r.run.invoice.invoiceDate,
            createdAt: r.run.createdAt,
            savedAt: r.savedAt,
            status: r.run.status,
            sizeEstimateBytes: r.sizeEstimateBytes,
            stats: r.run.stats,
            invoiceTotal,
            step1AmountCheckPassed,
          };
        });

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
        const allRuns = request.result as PersistedRunData[];
        // PROJ-50 FINAL-FIX: Tombstones nicht in runCount/totalSizeBytes einrechnen.
        const runs = allRuns.filter(r => !isTombstoneRecord(r));
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
    const allRuns = await new Promise<PersistedRunData[]>((resolve, reject) => {
      const transaction = db.transaction([RUNS_STORE], 'readonly');
      const store = transaction.objectStore(RUNS_STORE);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as PersistedRunData[]);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => db.close();
    });
    // PROJ-50 FINAL-FIX: Tombstones nicht auf Platte exportieren.
    const runs = allRuns.filter(r => !isTombstoneRecord(r));

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
