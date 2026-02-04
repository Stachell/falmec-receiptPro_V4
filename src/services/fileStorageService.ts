/**
 * File Storage Service
 *
 * Provides persistent file storage using IndexedDB.
 * Allows files to survive page refreshes.
 *
 * @module services/fileStorageService
 */

import type { UploadedFile } from '@/types';

const DB_NAME = 'falmec-receiptpro-files';
const DB_VERSION = 1;
const STORE_NAME = 'uploadedFiles';

/**
 * Stored file structure in IndexedDB
 */
interface StoredFile {
  type: 'invoice' | 'openWE' | 'serialList' | 'articleList';
  name: string;
  size: number;
  mimeType: string;
  data: ArrayBuffer;
  uploadedAt: string;
}

/**
 * Open IndexedDB connection
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[FileStorage] Failed to open database:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'type' });
        console.debug('[FileStorage] Created object store:', STORE_NAME);
      }
    };
  });
}

/**
 * Save a file to IndexedDB
 */
async function saveFile(uploadedFile: UploadedFile): Promise<boolean> {
  if (!uploadedFile.file) {
    console.warn('[FileStorage] No file object to save');
    return false;
  }

  try {
    const db = await openDatabase();
    const arrayBuffer = await uploadedFile.file.arrayBuffer();

    const storedFile: StoredFile = {
      type: uploadedFile.type,
      name: uploadedFile.name,
      size: uploadedFile.size,
      mimeType: uploadedFile.file.type,
      data: arrayBuffer,
      uploadedAt: uploadedFile.uploadedAt,
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(storedFile);

      request.onsuccess = () => {
        console.debug('[FileStorage] File saved:', uploadedFile.name);
        resolve(true);
      };

      request.onerror = () => {
        console.error('[FileStorage] Failed to save file:', request.error);
        reject(request.error);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('[FileStorage] Error saving file:', error);
    return false;
  }
}

/**
 * Load a file from IndexedDB
 */
async function loadFile(
  type: 'invoice' | 'openWE' | 'serialList' | 'articleList'
): Promise<UploadedFile | null> {
  try {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(type);

      request.onsuccess = () => {
        const storedFile = request.result as StoredFile | undefined;

        if (!storedFile) {
          resolve(null);
          return;
        }

        // Reconstruct File object from stored data
        const blob = new Blob([storedFile.data], { type: storedFile.mimeType });
        const file = new File([blob], storedFile.name, {
          type: storedFile.mimeType,
          lastModified: new Date(storedFile.uploadedAt).getTime(),
        });

        const uploadedFile: UploadedFile = {
          type: storedFile.type,
          name: storedFile.name,
          size: storedFile.size,
          file: file,
          uploadedAt: storedFile.uploadedAt,
        };

        console.debug('[FileStorage] File loaded:', storedFile.name);
        resolve(uploadedFile);
      };

      request.onerror = () => {
        console.error('[FileStorage] Failed to load file:', request.error);
        reject(request.error);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('[FileStorage] Error loading file:', error);
    return null;
  }
}

/**
 * Load all files from IndexedDB
 */
async function loadAllFiles(): Promise<UploadedFile[]> {
  try {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const storedFiles = request.result as StoredFile[];
        const uploadedFiles: UploadedFile[] = [];

        for (const storedFile of storedFiles) {
          // Reconstruct File object from stored data
          const blob = new Blob([storedFile.data], { type: storedFile.mimeType });
          const file = new File([blob], storedFile.name, {
            type: storedFile.mimeType,
            lastModified: new Date(storedFile.uploadedAt).getTime(),
          });

          uploadedFiles.push({
            type: storedFile.type,
            name: storedFile.name,
            size: storedFile.size,
            file: file,
            uploadedAt: storedFile.uploadedAt,
          });
        }

        console.debug('[FileStorage] Loaded', uploadedFiles.length, 'files from storage');
        resolve(uploadedFiles);
      };

      request.onerror = () => {
        console.error('[FileStorage] Failed to load files:', request.error);
        reject(request.error);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('[FileStorage] Error loading files:', error);
    return [];
  }
}

/**
 * Remove a file from IndexedDB
 */
async function removeFile(
  type: 'invoice' | 'openWE' | 'serialList' | 'articleList'
): Promise<boolean> {
  try {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(type);

      request.onsuccess = () => {
        console.debug('[FileStorage] File removed:', type);
        resolve(true);
      };

      request.onerror = () => {
        console.error('[FileStorage] Failed to remove file:', request.error);
        reject(request.error);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('[FileStorage] Error removing file:', error);
    return false;
  }
}

/**
 * Clear all files from IndexedDB
 */
async function clearAllFiles(): Promise<boolean> {
  try {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.debug('[FileStorage] All files cleared');
        resolve(true);
      };

      request.onerror = () => {
        console.error('[FileStorage] Failed to clear files:', request.error);
        reject(request.error);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('[FileStorage] Error clearing files:', error);
    return false;
  }
}

/**
 * Check if IndexedDB is available
 */
function isAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

export const fileStorageService = {
  saveFile,
  loadFile,
  loadAllFiles,
  removeFile,
  clearAllFiles,
  isAvailable,
};
