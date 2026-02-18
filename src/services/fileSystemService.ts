// File System Service - Handles local folder structure and file operations
// Uses the File System Access API for modern browsers

import { logService } from './logService';

const FOLDER_STRUCTURE = {
  root: 'falmec receiptPro',
  subfolders: ['.Archiv', '.logs'],
};

const DATA_PATH_KEY = 'falmec-data-path';
const DIRECTORY_HANDLE_KEY = 'falmec-directory-handle';

interface FolderStatus {
  isConfigured: boolean;
  path: string;
  hasArchiv: boolean;
  hasLogs: boolean;
  handle: FileSystemDirectoryHandle | null;
}

class FileSystemService {
  private directoryHandle: FileSystemDirectoryHandle | null = null;
  private rootFolderHandle: FileSystemDirectoryHandle | null = null;

  // Check if File System Access API is available
  isFileSystemAccessSupported(): boolean {
    return 'showDirectoryPicker' in window;
  }

  // Get current data path from localStorage
  getDataPath(): string {
    return localStorage.getItem(DATA_PATH_KEY) || '';
  }

  // Set data path in localStorage
  setDataPath(path: string): void {
    localStorage.setItem(DATA_PATH_KEY, path);
  }

  // Get default documents path suggestion
  private getDefaultDocumentsPath(): string {
    // Suggest user's Documents folder as default
    return 'Dokumente';
  }

  // Open folder picker dialog and select a directory
  async selectDirectory(): Promise<{ success: boolean; path: string; error?: string }> {
    if (!this.isFileSystemAccessSupported()) {
      // Fallback for browsers without File System Access API
      const defaultPath = this.getDataPath() || this.getDefaultDocumentsPath();
      const path = prompt(
        'Speicherort eingeben (empfohlen: Dokumente-Ordner):',
        defaultPath
      );
      if (path) {
        this.setDataPath(path);
        logService.info('Datenverzeichnis manuell gesetzt', {
          step: 'System',
          details: `Pfad: ${path}`,
        });
        return { success: true, path };
      }
      return { success: false, path: '', error: 'Abgebrochen' };
    }

    try {
      // Open the directory picker
      const handle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents',
      });

      this.directoryHandle = handle;
      const path = handle.name;

      // Create the folder structure
      await this.createFolderStructure(handle);

      // Save the path
      this.setDataPath(path);

      logService.info('Datenverzeichnis ausgewählt', {
        step: 'System',
        details: `Pfad: ${path}`,
      });

      return { success: true, path };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return { success: false, path: '', error: 'Abgebrochen' };
      }
      logService.error('Fehler bei Ordnerauswahl', {
        step: 'System',
        details: error.message,
      });
      return { success: false, path: '', error: error.message };
    }
  }

  // Create the required folder structure
  async createFolderStructure(parentHandle: FileSystemDirectoryHandle): Promise<boolean> {
    try {
      // Create root folder "falmec receiptPro"
      this.rootFolderHandle = await parentHandle.getDirectoryHandle(FOLDER_STRUCTURE.root, {
        create: true,
      });

      // Create subfolders
      for (const subfolder of FOLDER_STRUCTURE.subfolders) {
        await this.rootFolderHandle.getDirectoryHandle(subfolder, { create: true });
      }

      logService.info('Ordnerstruktur erstellt', {
        step: 'System',
        details: `${FOLDER_STRUCTURE.root}/${FOLDER_STRUCTURE.subfolders.join(', ')}`,
      });

      return true;
    } catch (error: any) {
      logService.error('Fehler beim Erstellen der Ordnerstruktur', {
        step: 'System',
        details: error.message,
      });
      return false;
    }
  }

  // Ensure folder structure exists before upload
  async ensureFolderStructure(): Promise<boolean> {
    // If we don't have a directory handle, we can't create folders
    if (!this.directoryHandle) {
      // Check if path is configured
      const path = this.getDataPath();
      if (!path) {
        logService.warn('Kein Datenverzeichnis konfiguriert', { step: 'System' });
        return false;
      }

      // If File System Access is not supported, we assume folders exist (simulated)
      if (!this.isFileSystemAccessSupported()) {
        logService.info('Ordnerstruktur wird simuliert (Browser-Einschränkung)', { step: 'System' });
        return true;
      }

      // Path is configured in localStorage but handle was lost (e.g. page reload).
      // Don't block the workflow — archiving will fail gracefully elsewhere.
      logService.info('Datenverzeichnis konfiguriert, aber Zugriff muss neu angefordert werden', { step: 'System' });
      return true;
    }

    // Verify and create if needed
    return await this.createFolderStructure(this.directoryHandle);
  }

  // Get the archive folder handle
  async getArchiveFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
    if (!this.rootFolderHandle) {
      return null;
    }

    try {
      return await this.rootFolderHandle.getDirectoryHandle('.Archiv', { create: true });
    } catch {
      return null;
    }
  }

  // Get the logs folder handle
  async getLogsFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
    if (!this.rootFolderHandle) {
      return null;
    }

    try {
      return await this.rootFolderHandle.getDirectoryHandle('.logs', { create: true });
    } catch {
      return null;
    }
  }

  // Save a file to the archive folder
  async saveToArchive(
    subfolderName: string,
    fileName: string,
    content: string | Blob
  ): Promise<boolean> {
    if (!(await this.checkPermission())) {
      logService.warn('Keine Schreibberechtigung für Archiv – saveToArchive übersprungen', { step: 'System' });
      return false;
    }

    const archiveHandle = await this.getArchiveFolderHandle();
    if (!archiveHandle) {
      logService.warn('Archiv-Ordner nicht verfügbar', { step: 'System' });
      return false;
    }

    try {
      // Create subfolder
      const subfolderHandle = await archiveHandle.getDirectoryHandle(subfolderName, {
        create: true,
      });

      // Create file
      const fileHandle = await subfolderHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();

      if (content instanceof Blob) {
        await writable.write(content);
      } else {
        await writable.write(content);
      }

      await writable.close();

      logService.debug(`Datei gespeichert: ${subfolderName}/${fileName}`, { step: 'Archiv' });
      return true;
    } catch (error: any) {
      logService.error(`Fehler beim Speichern: ${fileName}`, {
        step: 'Archiv',
        details: error.message,
      });
      return false;
    }
  }

  // Save a log file
  async saveLogFile(fileName: string, content: string): Promise<boolean> {
    if (!(await this.checkPermission())) {
      logService.warn('Keine Schreibberechtigung für Logs – saveLogFile übersprungen', { step: 'System' });
      return false;
    }

    const logsHandle = await this.getLogsFolderHandle();
    if (!logsHandle) {
      logService.warn('Logs-Ordner nicht verfügbar', { step: 'System' });
      return false;
    }

    try {
      const fileHandle = await logsHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();

      return true;
    } catch (error: any) {
      logService.error(`Fehler beim Speichern des Logs: ${fileName}`, {
        step: 'System',
        details: error.message,
      });
      return false;
    }
  }

  // Save a file to Temp/.del (soft delete / recycle bin)
  async saveToBin(fileName: string, content: string): Promise<boolean> {
    if (!this.rootFolderHandle) {
      logService.warn('Kein Datenverzeichnis konfiguriert – saveToBin übersprungen', { step: 'System' });
      return false;
    }
    try {
      const tempHandle = await this.rootFolderHandle.getDirectoryHandle('Temp', { create: true });
      const delHandle = await tempHandle.getDirectoryHandle('.del', { create: true });
      const fileHandle = await delHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      logService.info(`In Papierkorb gespeichert: ${fileName}`, { step: 'System' });
      return true;
    } catch (error: any) {
      logService.warn(`saveToBin fehlgeschlagen: ${error.message}`, { step: 'System' });
      return false;
    }
  }

  // Get folder status
  getFolderStatus(): FolderStatus {
    return {
      isConfigured: !!this.getDataPath(),
      path: this.getDataPath(),
      hasArchiv: !!this.rootFolderHandle,
      hasLogs: !!this.rootFolderHandle,
      handle: this.directoryHandle,
    };
  }

  // Check if we have write access (need to re-request if page was reloaded)
  hasWriteAccess(): boolean {
    return !!this.directoryHandle;
  }

  // Check if directory handle still has valid read-write permission
  async checkPermission(): Promise<boolean> {
    if (!this.directoryHandle) {
      return false;
    }
    try {
      const perm = await this.directoryHandle.queryPermission({ mode: 'readwrite' });
      return perm === 'granted';
    } catch {
      return false;
    }
  }

  // Save run log JSON to the run's archive subfolder
  async saveRunLog(runId: string, jsonContent: string): Promise<boolean> {
    return this.saveToArchive(runId, 'run-log.json', jsonContent);
  }

  // Delete log files in /.logs/ older than maxDays. Returns count of deleted files.
  async rotateHomeLogs(maxDays: number = 30): Promise<number> {
    const logsHandle = await this.getLogsFolderHandle();
    if (!logsHandle) {
      return 0;
    }

    const cutoff = Date.now() - maxDays * 24 * 60 * 60 * 1000;
    const datePattern = /^system-(\d{4})-(\d{2})-(\d{2})\.log\.json$/;
    let deletedCount = 0;

    try {
      const entriesToDelete: string[] = [];
      for await (const [name, handle] of logsHandle.entries()) {
        if (handle.kind !== 'file') continue;
        try {
          const match = name.match(datePattern);
          if (!match) continue; // Skip files that don't match the naming scheme
          const fileDate = new Date(
            parseInt(match[1]),
            parseInt(match[2]) - 1,
            parseInt(match[3])
          );
          if (isNaN(fileDate.getTime())) continue; // Skip invalid dates
          if (fileDate.getTime() < cutoff) {
            entriesToDelete.push(name);
          }
        } catch {
          // Robust: skip this file on any parsing error, don't break the loop
          continue;
        }
      }

      for (const name of entriesToDelete) {
        try {
          await logsHandle.removeEntry(name);
          deletedCount++;
        } catch {
          logService.warn(`Log-Rotation: Konnte ${name} nicht löschen`, { step: 'System' });
        }
      }

      if (deletedCount > 0) {
        logService.info(`Log-Rotation: ${deletedCount} alte Log-Dateien gelöscht`, { step: 'System' });
      }
    } catch (error: any) {
      logService.error('Log-Rotation fehlgeschlagen', {
        step: 'System',
        details: error.message,
      });
    }

    return deletedCount;
  }

  // Read a JSON file from the root data folder (falmec receiptPro/)
  async readJsonFile<T>(fileName: string): Promise<T | null> {
    if (!this.rootFolderHandle) return null;
    try {
      const fileHandle = await this.rootFolderHandle.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      const text = await file.text();
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }

  // Write a JSON file to the root data folder (falmec receiptPro/)
  async writeJsonFile(fileName: string, data: unknown): Promise<boolean> {
    if (!this.rootFolderHandle) return false;
    try {
      const fileHandle = await this.rootFolderHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(data, null, 2));
      await writable.close();
      return true;
    } catch (error: any) {
      logService.warn(`JSON-Datei konnte nicht geschrieben werden: ${fileName}`, {
        step: 'System',
        details: error.message,
      });
      return false;
    }
  }

  // Request permission again (after page reload)
  async requestPermission(): Promise<boolean> {
    if (!this.isFileSystemAccessSupported()) {
      return true; // Simulated access
    }

    try {
      const handle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents',
      });

      this.directoryHandle = handle;
      await this.createFolderStructure(handle);
      this.setDataPath(handle.name);

      return true;
    } catch {
      return false;
    }
  }
}

// Add type declaration for showDirectoryPicker
declare global {
  interface Window {
    showDirectoryPicker(options?: {
      mode?: 'read' | 'readwrite';
      startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
    }): Promise<FileSystemDirectoryHandle>;
  }
}

// Export singleton instance
export const fileSystemService = new FileSystemService();
