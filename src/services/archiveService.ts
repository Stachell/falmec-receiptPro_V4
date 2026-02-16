// Archive Service - Manages virtual folder structure and file storage for runs

import { logService } from './logService';

export interface ArchiveFile {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
  data?: string; // Base64 encoded for small files
}

export interface ArchiveFolder {
  id: string;
  name: string;
  createdAt: string;
  files: ArchiveFile[];
}

export interface ArchiveRun {
  id: string;
  runId: string;
  fattura: string;
  status: string;
  createdAt: string;
  folders: ArchiveFolder[];
  metadata: {
    config: any;
    stats: any;
  };
}

const ARCHIVE_RUNS_KEY = 'falmec-archive-runs';
const ARCHIVE_FILES_PREFIX = 'falmec-archive-file-';

class ArchiveService {
  private safeSetItem(key: string, value: string): boolean {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      logService.warn('Archivspeicher voll oder nicht verfuegbar', {
        step: 'Archiv',
        details: `${key}: ${error instanceof Error ? error.message : String(error)}`,
      });
      return false;
    }
  }

  // Format timestamp for folder names: YYYY-MM-DD_HHmmss
  private formatFolderTimestamp(date: Date = new Date()): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }

  // Get all archived runs
  getArchivedRuns(): ArchiveRun[] {
    try {
      const data = localStorage.getItem(ARCHIVE_RUNS_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  // Save archived runs
  private saveArchivedRuns(runs: ArchiveRun[]): void {
    const serialized = JSON.stringify(runs);
    if (!this.safeSetItem(ARCHIVE_RUNS_KEY, serialized)) {
      // Keep only the newest entries as fallback.
      this.safeSetItem(ARCHIVE_RUNS_KEY, JSON.stringify(runs.slice(0, 25)));
    }
  }

  // Get a specific archived run
  getArchivedRun(runId: string): ArchiveRun | null {
    const runs = this.getArchivedRuns();
    return runs.find(r => r.runId === runId) || null;
  }

  // Create a new archive entry for a run
  createArchiveEntry(
    runId: string,
    fattura: string,
    config: any,
    uploadedFiles: { type: string; file: File; name: string }[]
  ): ArchiveRun {
    const now = new Date();
    const timestamp = this.formatFolderTimestamp(now);

    const archiveRun: ArchiveRun = {
      id: `archive-${Date.now()}`,
      runId,
      fattura,
      status: 'running',
      createdAt: now.toISOString(),
      folders: [
        {
          id: `folder-${Date.now()}-uploads`,
          name: `00_Uploads`,
          createdAt: now.toISOString(),
          files: [],
        },
      ],
      metadata: {
        config,
        stats: null,
      },
    };

    // Process uploaded files
    for (const uploadedFile of uploadedFiles) {
      this.addFileToFolder(archiveRun, '00_Uploads', uploadedFile.file, uploadedFile.name);
    }

    // Save to storage
    const runs = this.getArchivedRuns();
    runs.unshift(archiveRun);
    this.saveArchivedRuns(runs);

    logService.info(`Archiv-Eintrag erstellt: ${timestamp}`, {
      runId,
      step: 'Archiv',
      details: `Fattura: ${fattura}, ${uploadedFiles.length} Dateien`,
    });

    return archiveRun;
  }

  // Add a file to a folder in the archive
  private addFileToFolder(archiveRun: ArchiveRun, folderName: string, file: File, fileName: string): void {
    const folder = archiveRun.folders.find(f => f.name === folderName);
    if (!folder) return;

    const archiveFile: ArchiveFile = {
      id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: fileName,
      type: file.type || 'application/octet-stream',
      size: file.size,
      createdAt: new Date().toISOString(),
    };

    folder.files.push(archiveFile);

    // Store file data in IndexedDB for larger files (simplified: use localStorage for now)
    // In production, use IndexedDB for files > 1MB
    if (file.size < 1024 * 1024) {
      const reader = new FileReader();
      reader.onload = () => {
        const key = `${ARCHIVE_FILES_PREFIX}${archiveFile.id}`;
        this.safeSetItem(key, reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  // Create a step folder when data changes
  createStepFolder(runId: string, stepName: string, stepNo: number): ArchiveFolder | null {
    const runs = this.getArchivedRuns();
    const runIndex = runs.findIndex(r => r.runId === runId);
    if (runIndex === -1) return null;

    const now = new Date();
    const timestamp = this.formatFolderTimestamp(now);
    const folderName = `${stepNo.toString().padStart(2, '0')}_${stepName.replace(/\s+/g, '-')}_${timestamp}`;

    const folder: ArchiveFolder = {
      id: `folder-${Date.now()}`,
      name: folderName,
      createdAt: now.toISOString(),
      files: [],
    };

    runs[runIndex].folders.push(folder);
    this.saveArchivedRuns(runs);

    logService.info(`Schritt-Ordner erstellt: ${folderName}`, {
      runId,
      step: stepName,
    });

    return folder;
  }

  // Add data to a step folder
  addDataToStepFolder(runId: string, folderName: string, data: any, fileName: string): void {
    const runs = this.getArchivedRuns();
    const runIndex = runs.findIndex(r => r.runId === runId);
    if (runIndex === -1) return;

    const folder = runs[runIndex].folders.find(f => f.name.includes(folderName));
    if (!folder) return;

    const jsonData = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });

    const archiveFile: ArchiveFile = {
      id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: fileName,
      type: 'application/json',
      size: blob.size,
      createdAt: new Date().toISOString(),
      data: jsonData,
    };

    folder.files.push(archiveFile);
    this.saveArchivedRuns(runs);

    logService.debug(`Datei gespeichert: ${fileName}`, {
      runId,
      details: `Ordner: ${folder.name}`,
    });
  }

  // Update run status
  updateRunStatus(runId: string, status: string, stats?: any): void {
    const runs = this.getArchivedRuns();
    const runIndex = runs.findIndex(r => r.runId === runId);
    if (runIndex === -1) return;

    runs[runIndex].status = status;
    if (stats) {
      runs[runIndex].metadata.stats = stats;
    }
    this.saveArchivedRuns(runs);
  }

  // Get file data
  getFileData(fileId: string): string | null {
    const key = `${ARCHIVE_FILES_PREFIX}${fileId}`;
    return localStorage.getItem(key);
  }

  // Download a file from archive
  downloadFile(file: ArchiveFile): void {
    let data: string | null = file.data || this.getFileData(file.id);

    if (!data) {
      logService.warn(`Datei nicht gefunden: ${file.name}`);
      return;
    }

    // Handle base64 data URLs
    if (data.startsWith('data:')) {
      const link = document.createElement('a');
      link.href = data;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      // Handle JSON or text data
      const blob = new Blob([data], { type: file.type });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }

  // Delete an archived run
  deleteArchivedRun(runId: string): void {
    const runs = this.getArchivedRuns();
    const run = runs.find(r => r.runId === runId);

    if (run) {
      // Delete associated files
      for (const folder of run.folders) {
        for (const file of folder.files) {
          const key = `${ARCHIVE_FILES_PREFIX}${file.id}`;
          localStorage.removeItem(key);
        }
      }

      // Remove from list
      const filteredRuns = runs.filter(r => r.runId !== runId);
      this.saveArchivedRuns(filteredRuns);

      logService.info(`Archiv-Eintrag gelöscht`, {
        runId,
        step: 'Archiv',
      });
    }
  }

  // Get storage usage info
  getStorageInfo(): { used: number; available: number; percentage: number } {
    let totalSize = 0;
    for (const key of Object.keys(localStorage)) {
      totalSize += localStorage.getItem(key)?.length || 0;
    }

    const maxSize = 5 * 1024 * 1024; // ~5MB typical limit
    return {
      used: totalSize,
      available: maxSize - totalSize,
      percentage: (totalSize / maxSize) * 100,
    };
  }
}

// Export singleton instance
export const archiveService = new ArchiveService();
