/**
 * qaSamplesService — PROJ-50 Test-Arena (Giftküche)
 *
 * Isolated IDB silo for QA test samples. Two-store split (Index + Blobs)
 * to keep list loads cheap. NEVER imports runStore, runPersistenceService,
 * fileStorageService, globalConfig or workflow-engine modules (C.B-TA1).
 *
 * @module services/qaSamplesService
 */

const DB_NAME = 'falmec-receiptpro-qa-samples';
const DB_VERSION = 1;
const INDEX_STORE = 'qa-sample-index';
const BLOB_STORE = 'qa-sample-blobs';
const BLOB_INDEX_BY_SAMPLE = 'by-sampleId';

export type QaFileKind = 'pdf' | 'json' | 'md';

export interface QaSampleFileMeta {
  name: string;
  kind: QaFileKind;
  mimeType: string;
  size: number;
}

export interface QaSampleIndexEntry {
  sampleId: string;
  folderName: string;
  description: string;
  fileMeta: QaSampleFileMeta[];
  uploadedAt: string;
  sizeEstimateBytes: number;
}

export interface QaSampleBlob {
  sampleId: string;
  fileName: string;
  kind: QaFileKind;
  mimeType: string;
  data: ArrayBuffer;
}

export type QaSampleSummary = QaSampleIndexEntry;

export interface QaIngestResult {
  saved: number;
  skipped: number;
  errors: string[];
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(INDEX_STORE)) {
        db.createObjectStore(INDEX_STORE, { keyPath: 'sampleId' });
      }
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        const blobStore = db.createObjectStore(BLOB_STORE, {
          keyPath: ['sampleId', 'fileName'],
        });
        blobStore.createIndex(BLOB_INDEX_BY_SAMPLE, 'sampleId', { unique: false });
      }
    };
  });
}

function classify(filename: string): QaFileKind | 'other' {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.md')) return 'md';
  return 'other';
}

function parseMarkdownDescription(buf: ArrayBuffer | undefined): string {
  if (!buf || buf.byteLength === 0) return '(keine Beschreibung)';
  if (buf.byteLength > 100 * 1024) return '(Beschreibung zu gross)';
  const text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if (!text.trim()) return '(keine Beschreibung)';
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      const stripped = line.replace(/^#+\s*/, '').trim();
      if (stripped) return stripped.slice(0, 400);
    }
    return line.slice(0, 400);
  }
  return text.trim().slice(0, 200);
}

// INV-WSA-3: Single tx, both stores. INV-WSA-4: No foreign awaits inside.
// INV-WSA-1: puts ONLY in terminal branch (cur === null).
// INV-WSA-2: No put before req.onsuccess runs terminal branch.
// INV-WSA-5: resolve/reject on all three tx handlers.
function writeSampleAtomically(
  db: IDBDatabase,
  indexRecord: QaSampleIndexEntry,
  blobRecords: QaSampleBlob[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([INDEX_STORE, BLOB_STORE], 'readwrite');
    const indexStore = tx.objectStore(INDEX_STORE);
    const blobStore = tx.objectStore(BLOB_STORE);
    const byId = blobStore.index(BLOB_INDEX_BY_SAMPLE);
    const req = byId.openCursor(IDBKeyRange.only(indexRecord.sampleId));

    req.onsuccess = (e) => {
      const cur = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cur) {
        cur.delete();
        cur.continue();
        return; // Keine put()s in diesem Zweig — INV-WSA-1.
      }
      // Terminal-Zweig: alle Cursor-Deletes sind enqueued → jetzt erst Writes.
      indexStore.put(indexRecord);
      for (const blob of blobRecords) {
        blobStore.put(blob);
      }
    };

    req.onerror = () => reject(req.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('QA-Samples: Tx error'));
    tx.onabort = () => reject(tx.error ?? new Error('QA-Samples: Tx aborted'));
  });
}

async function ingestDirectory(
  dir: FileSystemDirectoryHandle
): Promise<QaIngestResult> {
  const db = await openDatabase();
  let saved = 0;
  let skipped = 0;
  const errors: string[] = [];

  try {
    // @ts-expect-error — values() ist Async-Iterator im FileSystem-Access-API-Draft.
    for await (const entry of dir.values()) {
    if (entry.kind !== 'directory') continue;
    const subDir = entry as FileSystemDirectoryHandle;

    // Phase 1: File-System-Reads (ausserhalb der IDB-Tx).
    const files: Array<{
      name: string;
      kind: QaFileKind;
      mimeType: string;
      size: number;
      data: ArrayBuffer;
    }> = [];

    try {
      // @ts-expect-error — values() ist Async-Iterator.
      for await (const fileEntry of subDir.values()) {
        if (fileEntry.kind !== 'file') continue;
        const kind = classify(fileEntry.name);
        if (kind === 'other') continue;
        const fileHandle = fileEntry as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        const buf = await file.arrayBuffer();
        files.push({
          name: file.name,
          kind,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          data: buf,
        });
      }
    } catch (err) {
      errors.push(`${subDir.name}: ${(err as Error)?.message ?? 'Read-Error'}`);
      continue;
    }

    if (!files.some((f) => f.kind === 'pdf')) {
      skipped++;
      continue;
    }

    const sampleId = subDir.name; // verbatim — keine Sanitization.
    const descriptionBuf = files.find((f) => f.kind === 'md')?.data;
    const indexRecord: QaSampleIndexEntry = {
      sampleId,
      folderName: subDir.name,
      description: parseMarkdownDescription(descriptionBuf),
      fileMeta: files.map((f) => ({
        name: f.name,
        kind: f.kind,
        mimeType: f.mimeType,
        size: f.size,
      })),
      uploadedAt: new Date().toISOString(),
      sizeEstimateBytes: files.reduce((s, f) => s + f.size, 0),
    };
    const blobRecords: QaSampleBlob[] = files.map((f) => ({
      sampleId,
      fileName: f.name,
      kind: f.kind,
      mimeType: f.mimeType,
      data: f.data,
    }));

    // Phase 2: Atomare Tx für genau dieses Sample.
    try {
      await writeSampleAtomically(db, indexRecord, blobRecords);
      saved++;
    } catch (err) {
      errors.push(
        `${sampleId}: ${(err as Error)?.name ?? (err as Error)?.message ?? 'Tx-Error'}`
      );
    }
      // files/blobRecords/indexRecord verlassen hier den Scope → GC kann reclaimen.
    }
  } finally {
    // Zombie-Connection-Schutz: db.close() auch bei Exception im Loop.
    db.close();
  }
  return { saved, skipped, errors };
}

function loadAllSummaries(): Promise<QaSampleSummary[]> {
  return openDatabase().then(
    (db) =>
      new Promise<QaSampleSummary[]>((resolve, reject) => {
        const tx = db.transaction(INDEX_STORE, 'readonly');
        const req = tx.objectStore(INDEX_STORE).getAll();
        let settled: QaSampleIndexEntry[] | null = null;
        req.onsuccess = () => {
          settled = (req.result as QaSampleIndexEntry[]) ?? [];
        };
        req.onerror = () => {
          db.close();
          reject(req.error);
        };
        tx.oncomplete = () => {
          db.close();
          resolve(settled ?? []);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error ?? new Error('QA-Samples: Tx aborted'));
        };
      })
  );
}

function loadSample(
  sampleId: string
): Promise<{ index: QaSampleIndexEntry; blobs: QaSampleBlob[] } | null> {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction([INDEX_STORE, BLOB_STORE], 'readonly');
        const indexReq = tx.objectStore(INDEX_STORE).get(sampleId);
        const blobs: QaSampleBlob[] = [];
        let indexRecord: QaSampleIndexEntry | undefined;

        indexReq.onsuccess = () => {
          indexRecord = indexReq.result as QaSampleIndexEntry | undefined;
          if (!indexRecord) return;
          const cursorReq = tx
            .objectStore(BLOB_STORE)
            .index(BLOB_INDEX_BY_SAMPLE)
            .openCursor(IDBKeyRange.only(sampleId));
          cursorReq.onsuccess = (e) => {
            const cur = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
            if (cur) {
              blobs.push(cur.value as QaSampleBlob);
              cur.continue();
            }
          };
        };

        tx.oncomplete = () => {
          db.close();
          resolve(indexRecord ? { index: indexRecord, blobs } : null);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error ?? new Error('QA-Samples: Tx aborted'));
        };
      })
  );
}

function deleteSample(sampleId: string): Promise<boolean> {
  return openDatabase().then(
    (db) =>
      new Promise<boolean>((resolve, reject) => {
        const tx = db.transaction([INDEX_STORE, BLOB_STORE], 'readwrite');
        tx.objectStore(INDEX_STORE).delete(sampleId);
        const req = tx
          .objectStore(BLOB_STORE)
          .index(BLOB_INDEX_BY_SAMPLE)
          .openCursor(IDBKeyRange.only(sampleId));
        req.onsuccess = (e) => {
          const cur = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (cur) {
            cur.delete();
            cur.continue();
          }
        };
        tx.oncomplete = () => {
          db.close();
          resolve(true);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error ?? new Error('QA-Samples: Tx aborted'));
        };
      })
  );
}

function clearAll(): Promise<boolean> {
  return openDatabase().then(
    (db) =>
      new Promise<boolean>((resolve, reject) => {
        const tx = db.transaction([INDEX_STORE, BLOB_STORE], 'readwrite');
        tx.objectStore(INDEX_STORE).clear();
        tx.objectStore(BLOB_STORE).clear();
        tx.oncomplete = () => {
          db.close();
          resolve(true);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error ?? new Error('QA-Samples: Tx aborted'));
        };
      })
  );
}

function getStats(): Promise<{ sampleCount: number; totalBytes: number }> {
  return loadAllSummaries().then((list) => ({
    sampleCount: list.length,
    totalBytes: list.reduce((s, e) => s + e.sizeEstimateBytes, 0),
  }));
}

function isAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

export const qaSamplesService = {
  isAvailable,
  ingestDirectory,
  loadAllSummaries,
  loadSample,
  deleteSample,
  clearAll,
  getStats,
};
