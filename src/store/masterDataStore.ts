/**
 * masterDataStore — PROJ-19
 *
 * Global Zustand store for parsed ArticleMaster data.
 * Data is persisted in a dedicated IndexedDB database to avoid
 * localStorage quota issues (3 000+ articles × ~200 B/article ≈ 600 KB+).
 *
 * Architecture:
 *   - In-memory: Zustand holds articles[] + metadata for O(1) access
 *   - Persistence: IndexedDB stores the full payload between page loads
 *   - localStorage: only a tiny metadata record (timestamp, rowCount)
 *     so the sidebar traffic-light can read it without loading all articles
 *
 * Usage:
 *   const { articles, lastUpdated, load, save, clear } = useMasterDataStore();
 */

import { create } from 'zustand';
import type { ArticleMaster } from '@/types';

// ── IndexedDB helpers ──────────────────────────────────────────────────────────
const IDB_NAME = 'falmec-master-data';
const IDB_VERSION = 1;
const IDB_STORE = 'articles';

function openMasterDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };
  });
}

async function idbSaveArticles(articles: ArticleMaster[]): Promise<void> {
  const db = await openMasterDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    store.clear();
    for (const a of articles) store.put(a);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function idbLoadArticles(): Promise<ArticleMaster[]> {
  const db = await openMasterDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).getAll();
    req.onsuccess = () => { db.close(); resolve(req.result as ArticleMaster[]); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function idbClear(): Promise<void> {
  const db = await openMasterDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// ── localStorage metadata key ─────────────────────────────────────────────────
const LS_META_KEY = 'falmec-master-data-meta';

interface MasterDataMeta {
  lastUpdated: string;   // ISO timestamp
  rowCount: number;
  sourceFileName: string;
}

function loadMeta(): MasterDataMeta | null {
  try {
    const raw = localStorage.getItem(LS_META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveMeta(meta: MasterDataMeta): void {
  try {
    localStorage.setItem(LS_META_KEY, JSON.stringify(meta));
  } catch {
    console.warn('[masterDataStore] Failed to persist metadata to localStorage');
  }
}

function removeMeta(): void {
  try { localStorage.removeItem(LS_META_KEY); } catch { /* ignore */ }
}

// ── Store interface ───────────────────────────────────────────────────────────
interface MasterDataState {
  /** Parsed article master records (in-memory). Empty until loaded or populated. */
  articles: ArticleMaster[];

  /** ISO timestamp of last successful import. Null if never imported. */
  lastUpdated: string | null;

  /** Number of articles in the cache. */
  rowCount: number;

  /** File name of the source Excel. */
  sourceFileName: string;

  /** True while loading from IndexedDB on boot. */
  isLoading: boolean;

  /**
   * Persist a newly parsed article list.
   * Saves to IndexedDB + updates in-memory state + refreshes metadata.
   */
  save: (articles: ArticleMaster[], sourceFileName: string) => Promise<void>;

  /**
   * Load articles from IndexedDB into memory.
   * Call once on app boot (e.g. in App.tsx useEffect).
   */
  load: () => Promise<void>;

  /**
   * Clear all cached master data (IndexedDB + metadata + in-memory).
   */
  clear: () => Promise<void>;
}

// ── Store implementation ──────────────────────────────────────────────────────
export const useMasterDataStore = create<MasterDataState>((set) => {
  // Hydrate metadata synchronously from localStorage so UI can show the
  // traffic light immediately, even before IndexedDB has loaded.
  const meta = loadMeta();

  return {
    articles: [],
    lastUpdated: meta?.lastUpdated ?? null,
    rowCount: meta?.rowCount ?? 0,
    sourceFileName: meta?.sourceFileName ?? '',
    isLoading: false,

    save: async (articles, sourceFileName) => {
      await idbSaveArticles(articles);
      const now = new Date().toISOString();
      const meta: MasterDataMeta = { lastUpdated: now, rowCount: articles.length, sourceFileName };
      saveMeta(meta);
      set({ articles, lastUpdated: now, rowCount: articles.length, sourceFileName });
      console.info(`[masterDataStore] Saved ${articles.length} articles from '${sourceFileName}'`);
    },

    load: async () => {
      set({ isLoading: true });
      try {
        const articles = await idbLoadArticles();
        const meta = loadMeta();
        set({
          articles,
          lastUpdated: meta?.lastUpdated ?? null,
          rowCount: articles.length,
          sourceFileName: meta?.sourceFileName ?? '',
          isLoading: false,
        });
        console.info(`[masterDataStore] Loaded ${articles.length} articles from IndexedDB`);
      } catch (err) {
        console.error('[masterDataStore] Failed to load from IndexedDB:', err);
        set({ isLoading: false });
      }
    },

    clear: async () => {
      await idbClear();
      removeMeta();
      set({ articles: [], lastUpdated: null, rowCount: 0, sourceFileName: '' });
      console.info('[masterDataStore] Cleared');
    },
  };
});
