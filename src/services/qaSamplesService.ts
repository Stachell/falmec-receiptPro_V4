/**
 * qaSamplesService — PROJ-50 Test-Arena (Giftküche)
 *
 * Isolated IDB silo for QA test samples. Two-store split (Index + Blobs)
 * to keep list loads cheap. NEVER imports runStore, runPersistenceService,
 * fileStorageService, globalConfig or workflow-engine modules (C.B-TA1).
 *
 * @module services/qaSamplesService
 */

// PROJ-50-DEV Rd5/Chef-Fix 4: reiner Type-Import aus @/types — wird beim Build
// entfernt, hat keine Runtime-Präsenz und bricht C.B-TA1 daher NICHT.
import type { UploadedFile } from '@/types';

const DB_NAME = 'falmec-receiptpro-qa-samples';
const DB_VERSION = 1;
const INDEX_STORE = 'qa-sample-index';
const BLOB_STORE = 'qa-sample-blobs';
const BLOB_INDEX_BY_SAMPLE = 'by-sampleId';

export type QaFileKind = 'pdf' | 'json' | 'md' | 'xlsx' | 'xls' | 'csv' | 'xml';

// PROJ-50-DEV: Kategorie-Ordner → UploadedFile.type ODER QA-README-Marker
// Whitelist; unbekannte Ordner bleiben unkategorisiert (→ Heuristik via classifyFileByName).
// Rd9/Lead-Dev-Fix 2: Zusätzlicher fester Wert `'qa-readme'` markiert den verbindlichen
// Sichtfenster-Ordner. Sein Rückgabewert ist NICHT Teil von QaCategory (ist keine
// UploadedFile-Kategorie), sondern wird als eigener Sentinel `'qa-readme'` erkannt und
// im ingestDirectory-Scan für `.md`-Sammlung weitergeleitet. resolveReadmeBody priorisiert
// später Blobs mit dem Pfadsegment `QA-README/`.
export type QaCategory = 'invoice' | 'openWE' | 'serialList' | 'articleList';
export type QaFolderKind = QaCategory | 'qa-readme';

function classifyCategoryFolder(folderName: string): QaFolderKind | null {
  const n = folderName.trim().toLowerCase();
  if (n === 'qa-readme') return 'qa-readme';                                    // ← Rd9/Lead-Dev-Fix 2
  if (['rechnung', 'invoice', 'fattura'].includes(n)) return 'invoice';
  if (['bestellung', 'bestellungen', 'openwe', 'orders', 'wareneingang', 'wareneingaenge'].includes(n)) return 'openWE';
  if (['seriennummern', 'serial', 'seriallist', 's-n', 'sn'].includes(n)) return 'serialList';
  if (['artikelliste', 'articles', 'articlelist', 'artikel', 'stammdaten'].includes(n)) return 'articleList';
  return null;
}

export interface QaSampleFileMeta {
  name: string;
  basename: string;
  kind: QaFileKind;
  mimeType: string;
  size: number;
  category?: QaCategory | null;
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
  if (lower.endsWith('.pdf'))  return 'pdf';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.md'))   return 'md';
  if (lower.endsWith('.xlsx')) return 'xlsx';
  if (lower.endsWith('.xls'))  return 'xls';
  if (lower.endsWith('.csv'))  return 'csv';
  if (lower.endsWith('.xml'))  return 'xml';
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
      basename: string;
      kind: QaFileKind;
      mimeType: string;
      size: number;
      category: QaCategory | null;
      data: ArrayBuffer;
    }> = [];

    try {
      // @ts-expect-error — values() ist Async-Iterator.
      for await (const entry2 of subDir.values()) {
        if (entry2.kind === 'file') {
          // Ebene-1-Datei (Legacy-Pfad) — unverändert: basename bleibt direkter Key.
          const kind = classify(entry2.name);
          if (kind === 'other') continue;
          const fileHandle = entry2 as FileSystemFileHandle;
          const file = await fileHandle.getFile();
          const buf = await file.arrayBuffer();
          files.push({
            name: file.name,               // basename (flach) → Array-Key [sampleId, basename]
            basename: file.name,            // ← Rd5/Chef-Fix 3: expliziter Original-Basename
            kind,
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
            // category = null bedeutet „Heuristik im Ingest-Adapter anwenden"
            category: null,
            data: buf,
          });
        } else if (entry2.kind === 'directory') {
          // Rd7/Chef-Fix 3: Unbekannte Ordner NICHT mehr komplett ignorieren.
          // Stattdessen: `.md`-Dateien daraus werden weiterhin eingesammelt (Doku-Fallback),
          // alle anderen Dateitypen werden übersprungen.
          // Rd9/Lead-Dev-Fix 2: `QA-README` ist ein zusätzlicher, fester Ordnername. Er ist
          // KEINE UploadedFile-Kategorie, sondern ein Sichtfenster-Anker: der Scan sammelt
          // daraus NUR `.md`-Dateien ein.
          const folderKind = classifyCategoryFolder(entry2.name);
          const uploadCategory: QaCategory | null =
            folderKind === 'qa-readme' || folderKind === null ? null : folderKind;
          const subSubDir = entry2 as FileSystemDirectoryHandle;
          // @ts-expect-error — values() ist Async-Iterator.
          for await (const fileEntry of subSubDir.values()) {
            if (fileEntry.kind !== 'file') continue;
            const kind = classify(fileEntry.name);
            if (kind === 'other') continue;
            // Bei unbekannter Kategorie + QA-README nur .md erlauben (Doku-Fallback).
            if (uploadCategory === null && kind !== 'md') continue;
            const fileHandle = fileEntry as FileSystemFileHandle;
            const file = await fileHandle.getFile();
            const buf = await file.arrayBuffer();
            // Rd5/Chef-Fix 3: Pfad-Präfix gegen fileName-Kollision.
            const keyedName = `${entry2.name}/${file.name}`;
            files.push({
              name: keyedName,
              basename: file.name,
              kind,
              mimeType: file.type || 'application/octet-stream',
              size: file.size,
              category: uploadCategory,
              data: buf,
            });
          }
        }
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
        basename: f.basename,
        kind: f.kind,
        mimeType: f.mimeType,
        size: f.size,
        category: f.category,
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

// PROJ-50-DEV: Adapter IDB-Blob → FileSnapshot
// Liefert entweder einen vollständig kategorisierten UploadedFile-Set
// oder ein ok:false-Ergebnis mit präzisem Grund.
// Rd5/Chef-Fix 4: Snapshot-Shape strukturell identisch zu FileSnapshot
// (src/store/types.ts) — alle 4 Keys required mit `UploadedFile | undefined`.
export interface QaSampleUploadSet {
  ok: boolean;
  reason?: string;
  snapshot?: {
    invoice:     UploadedFile | undefined;
    articleList: UploadedFile | undefined;
    serialList:  UploadedFile | undefined;
    openWE:      UploadedFile | undefined;
  };
}

// Heuristik-Fallback für V1-flache Samples (kein Kategorie-Tag im fileMeta).
// WICHTIG (Rd5/Chef-Fix 3): Input ist der BASENAME, NICHT der Pfad — damit die Regex-
// Matches nicht versehentlich auf Kategorie-Namen im Pfad greifen.
// Reihenfolge der Heuristik-Tests (dokumentiert): artikel → openWE → serial → null.
function classifyFileByName(basename: string, kind: QaFileKind): QaCategory | null {
  if (kind === 'pdf') return 'invoice';
  const lower = basename.toLowerCase();
  if (kind === 'json') return null;              // JSONs bleiben unkategorisiert
  if (/(artikel|stamm|master)/.test(lower)) return 'articleList';
  if (/(openwe|bestell|orders|we_|wareneingang)/.test(lower)) return 'openWE';
  if (/(serial|seriennr|s-n|_sn)/.test(lower)) return 'serialList';
  return null;
}

async function prepareFilesForIngest(sampleId: string): Promise<QaSampleUploadSet> {
  const detail = await loadSample(sampleId);
  if (!detail) return { ok: false, reason: `Sample '${sampleId}' nicht gefunden` };

  // Verbinde Blob-Daten mit ihrer Kategorie aus dem Index (fileMeta).
  // fileMeta.name ist der IDB-Key-Segment (V1: basename, Rd5: 'Kategorie/basename').
  const metaByName = new Map<string, QaSampleFileMeta>(
    detail.index.fileMeta.map((m) => [m.name, m]),
  );

  // Rd5/Chef-Fix 4: Initialisiere mit explizit `undefined` auf allen 4 Keys —
  // Snapshot-Shape ist damit ab dem ersten Moment struktur-kompatibel zu FileSnapshot.
  const result: NonNullable<QaSampleUploadSet['snapshot']> = {
    invoice:     undefined,
    articleList: undefined,
    serialList:  undefined,
    openWE:      undefined,
  };

  for (const blob of detail.blobs) {
    if (blob.kind === 'md') continue;            // README/expected.md NICHT in den Ingest

    const meta = metaByName.get(blob.fileName);

    // Rd5/Chef-Fix 3: basename = reiner Dateiname ohne Kategorie-Pfad.
    // Legacy-V1-Blobs: basename-Feld fehlt → fallback auf blob.fileName (== basename bei flat).
    const basename = meta?.basename ?? blob.fileName;

    const cat: QaCategory | null =
      (meta?.category ?? undefined) ??
      classifyFileByName(basename, blob.kind);    // Heuristik auf Basename, NICHT auf Pfad

    if (cat === null) continue;                   // Datei bleibt ungenutzt (kein Fehler)

    // Rd5/Chef-Fix 3: `new File([...], basename, ...)` — der Parser liest file.name
    // intern. Wir behalten den reinen Basename für die Parser-sichtbare File-Instanz.
    const file = new File([blob.data], basename, { type: blob.mimeType });

    const up: UploadedFile = {
      name: basename,
      size: blob.data.byteLength,
      type: cat,
      file,
      uploadedAt: detail.index.uploadedAt,
    };

    // Duplikat-Regel: Letzter gewinnt pro Kategorie.
    result[cat] = up;
  }

  // Rd10/Lead-Dev-Fix 2: QA-README ist Pflicht. Defense-in-Depth — die UI blockiert
  // den Button zwar bereits, aber der Service soll auch unabhängig vom UI-Pfad
  // abweisen, falls künftig ein Aufruf außerhalb des SettingsPopup hinzukäme.
  const hasQaReadmeBlob = detail.blobs.some(
    (b) => b.kind === 'md' && b.fileName.toLowerCase().startsWith('qa-readme/'),
  );
  if (!hasQaReadmeBlob) {
    return { ok: false, reason: 'Sample ohne QA-README-Ordner — Soll-Kontrakt fehlt' };
  }

  // Pflicht-Validierung (gleiche Ordnung wie ingestAndPersistRunData)
  if (!result.invoice)     return { ok: false, reason: 'Sample ohne PDF — kein Invoice erkennbar' };
  if (!result.articleList) return { ok: false, reason: 'Sample ohne Artikelliste — Pflichtdatei' };
  if (!result.openWE)      return { ok: false, reason: 'Sample ohne openWE — Pflichtdatei' };
  // serialList bleibt optional

  return { ok: true, snapshot: result };
}

export const qaSamplesService = {
  isAvailable,
  ingestDirectory,
  loadAllSummaries,
  loadSample,
  deleteSample,
  clearAll,
  getStats,
  prepareFilesForIngest,
};
