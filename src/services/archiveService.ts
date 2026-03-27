// Archive Service - Manages virtual folder structure and file storage for runs

import { logService } from './logService';
import { fileSystemService } from './fileSystemService';
import { fileStorageService } from './fileStorageService';
import { buildLeanArchive } from './serialFinder';
import type { Run, InvoiceLine, ArchiveMetadata, PreFilteredSerialRow, Issue, RunConfig } from '../types';

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

  // PROJ-27-ADDON-2: PDFs sichern im Fahrwasser der User Activation (Step 1)
  async writeEarlyArchive(
    run: Run,
    uploadedFiles: { type: string; file: File; name: string }[],
    config: RunConfig
  ): Promise<{ success: boolean; folderName: string; reason?: string }> {
    // PRE-FLIGHT: Dateisystem-Handle vorhanden? (nach Reload: null)
    if (!fileSystemService.hasWriteAccess()) {
      logService.info(
        'Early Archive übersprungen: Keine Dateisystem-Rechte (Seite wurde neu geladen)',
        { runId: run.id, step: 'Archiv' }
      );
      return { success: false, folderName: '', reason: 'no_permission' };
    }

    const runId = run.id;

    const folderName = await this.generateArchiveFolderName(
      run.invoice.fattura,
      run.invoice.invoiceDate
    );

    logService.info(`Early Archive wird erstellt: ${folderName}`, { runId, step: 'Archiv' });

    const failedFiles: string[] = [];

    // Alle Upload-Dateien direkt aus in-memory File-Objekten schreiben
    for (const uf of uploadedFiles) {
      if (!uf.file) continue;
      const ok = await fileSystemService.saveToArchive(folderName, uf.name, uf.file);
      if (!ok) failedFiles.push(uf.name);
    }

    // files-Objekt entsprechend ArchiveMetadata['files'] aufbauen (kein Array!)
    const findFile = (type: string): { name: string; size: number } | null => {
      const uf = uploadedFiles.find(f => f.type === type);
      return uf?.file ? { name: uf.name, size: uf.file.size } : null;
    };

    // Lokaler Hilfstyp — Status 'running' + Partial-Stats (ArchiveMetadata hat kein 'running')
    type EarlyArchiveMetadata = Omit<ArchiveMetadata, 'status' | 'stats'> & {
      status: 'running';
      stats: { parsedPositions: number; expandedLines: number };
    };

    const metadata: EarlyArchiveMetadata = {
      version: 1,
      runId,
      fattura: run.invoice.fattura,
      invoiceDate: run.invoice.invoiceDate,
      createdAt: run.createdAt,
      archivedAt: new Date().toISOString(),
      status: 'running',
      config: {
        eingangsart: config.eingangsart,
        tolerance: config.tolerance,
        currency: 'EUR',
        preisbasis: config.priceBasis,
      },
      stats: {
        parsedPositions: run.stats.parsedInvoiceLines,
        expandedLines: run.stats.expandedLineCount,
      },
      files: {
        invoice: findFile('invoice'),
        warenbegleitschein: findFile('openWE'),
        exportXml: null,
        exportCsv: null,
        exportXlsx: null,
        artikelstamm: findFile('articleList'),
        offeneBestellungen: null,
        serialData: null,
        runReport: null,
      },
    };

    const metaOk = await fileSystemService.saveToArchive(
      folderName, 'metadata.json', JSON.stringify(metadata, null, 2)
    );
    if (!metaOk) failedFiles.push('metadata.json');

    const success = !failedFiles.includes('metadata.json');
    logService.info(
      `Early Archive ${success ? 'erstellt' : 'mit Fehlern'}: ${folderName}`,
      { runId, step: 'Archiv', details: `${uploadedFiles.length} Dateien, ${failedFiles.length} Fehler` }
    );

    return { success, folderName };
  }

  // PROJ-27-ADDON-2: Finale Metadaten + Exports in bestehenden Archiv-Ordner anhängen
  async appendToArchive(
    folderName: string,
    run: Run,
    lines: InvoiceLine[],
    options?: {
      extraFiles?: Record<string, string | Blob>;
      preFilteredSerials?: PreFilteredSerialRow[];
      issues?: Issue[];
    }
  ): Promise<{ success: boolean; failedFiles: string[] }> {
    const runId = run.id;
    const failedFiles: string[] = [];

    logService.info(`Archiv wird ergänzt: ${folderName}`, { runId, step: 'Archiv' });

    // 0. Bestehende metadata.json lesen → existingFiles für Amnesie-Bug-Fix
    let existingFiles: ArchiveMetadata['files'] | null = null;
    try {
      const archiveHandle = await fileSystemService.getArchiveFolderHandle();
      if (archiveHandle) {
        const subHandle = await archiveHandle.getDirectoryHandle(folderName, { create: false });
        const fileHandle = await subHandle.getFileHandle('metadata.json', { create: false });
        const file = await fileHandle.getFile();
        const existing = JSON.parse(await file.text()) as Partial<ArchiveMetadata>;
        existingFiles = existing.files ?? null;
      }
    } catch {
      // Kein Early Archive vorhanden — kein Problem, fallback zu null
    }

    // 1. run-log.json
    const logEntries = logService.getRunBuffer(runId);
    const entries = logEntries.length > 0 ? logEntries : logService.getRunLog(runId);
    if (entries.length > 0) {
      const ok = await fileSystemService.saveToArchive(
        folderName, 'run-log.json', JSON.stringify(entries, null, 2)
      );
      if (!ok) failedFiles.push('run-log.json');
    }

    // 2. invoice-lines.json
    const linesOk = await fileSystemService.saveToArchive(
      folderName, 'invoice-lines.json', JSON.stringify(lines, null, 2)
    );
    if (!linesOk) failedFiles.push('invoice-lines.json');

    // 3. Versionierte Export-Dateien
    const extraFileInfos: { name: string; size: number }[] = [];
    if (options?.extraFiles) {
      for (const [name, content] of Object.entries(options.extraFiles)) {
        const ok = await fileSystemService.saveToArchive(folderName, name, content);
        if (ok) {
          const size = content instanceof Blob ? content.size : content.length;
          extraFileInfos.push({ name, size });
        } else {
          failedFiles.push(name);
        }
      }
    }

    // 4. serial-data.json
    let serialDataInfo: { name: string; size: number } | null = null;
    if (options?.preFilteredSerials && options.preFilteredSerials.length > 0) {
      const leanSerials = buildLeanArchive(options.preFilteredSerials);
      const serialJson = JSON.stringify(leanSerials, null, 2);
      const ok = await fileSystemService.saveToArchive(folderName, 'serial-data.json', serialJson);
      if (ok) serialDataInfo = { name: 'serial-data.json', size: serialJson.length };
      else failedFiles.push('serial-data.json');
    }

    // 5. run-report.json
    let runReportInfo: { name: string; size: number } | null = null;
    if (options?.issues && options.issues.length > 0) {
      const runIssues = options.issues.filter(i => i.runId === run.id);
      const runReport = {
        version: 1,
        runId,
        fattura: run.invoice.fattura,
        generatedAt: new Date().toISOString(),
        summary: {
          totalIssues: runIssues.length,
          openIssues: runIssues.filter(i => i.status === 'open').length,
          // PROJ-43: pendingIssues — escalated, awaiting external response
          pendingIssues: runIssues.filter(i => i.status === 'pending').length,
          resolvedIssues: runIssues.filter(i => i.status === 'resolved').length,
          bySeverity: {
            error: runIssues.filter(i => i.severity === 'error').length,
            warning: runIssues.filter(i => i.severity === 'warning').length,
            info: runIssues.filter(i => i.severity === 'info').length,
          },
        },
        issues: runIssues,
      };
      const reportJson = JSON.stringify(runReport, null, 2);
      const ok = await fileSystemService.saveToArchive(folderName, 'run-report.json', reportJson);
      if (ok) runReportInfo = { name: 'run-report.json', size: reportJson.length };
      else failedFiles.push('run-report.json');
    }

    // 6. metadata.json überschreiben — finaler Stand, existingFiles gemergt (Amnesie-Bug-Fix!)
    const metadata: ArchiveMetadata = {
      version: 1,
      runId,
      fattura: run.invoice.fattura,
      invoiceDate: run.invoice.invoiceDate,
      createdAt: run.createdAt,
      archivedAt: new Date().toISOString(),
      status: this.mapRunStatus(run.status),
      config: {
        eingangsart: run.config.eingangsart,
        tolerance: run.config.tolerance,
        currency: 'EUR',
        preisbasis: run.config.priceBasis,
      },
      stats: {
        parsedPositions: run.stats.parsedInvoiceLines,
        expandedLines: run.stats.expandedLineCount,
        fullMatchCount: run.stats.fullMatchCount,
        noMatchCount: run.stats.noMatchCount,
        exportedLines: lines.length,
      },
      files: {
        // Bestehende Upload-Referenzen aus Early Archive bewahren (Amnesie-Bug-Fix!)
        invoice: existingFiles?.invoice ?? null,
        warenbegleitschein: existingFiles?.warenbegleitschein ?? null,
        artikelstamm: existingFiles?.artikelstamm ?? null,
        offeneBestellungen: existingFiles?.offeneBestellungen ?? null,
        // Neue Export-Referenzen
        exportXml: extraFileInfos.find(f => f.name.endsWith('.xml')) ?? null,
        exportCsv: extraFileInfos.find(f => f.name.endsWith('.csv')) ?? null,
        exportXlsx: extraFileInfos.find(f => f.name.endsWith('.xlsx') || f.name.endsWith('.xls')) ?? null,
        serialData: serialDataInfo,
        runReport: runReportInfo,
      },
    };

    const metaOk = await fileSystemService.saveToArchive(
      folderName, 'metadata.json', JSON.stringify(metadata, null, 2)
    );
    if (!metaOk) failedFiles.push('metadata.json');

    const success = failedFiles.filter(
      f => f === 'invoice-lines.json' || f === 'metadata.json'
    ).length === 0;

    logService.info(
      `Archiv-Ergänzung ${success ? 'erfolgreich' : 'mit Fehlern'}: ${folderName}`,
      { runId, step: 'Archiv', details: `${failedFiles.length} Fehler` }
    );

    return { success, failedFiles };
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

  // ═══════════════════════════════════════════════════════════════════
  // PROJ-12: Disk-based archive package orchestration
  // ═══════════════════════════════════════════════════════════════════

  // Generate unique archive folder name with duplicate detection
  private async generateArchiveFolderName(fattura: string, invoiceDate: string): Promise<string> {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const date = new Date(invoiceDate);
    const datePart = isNaN(date.getTime())
      ? new Date().toISOString().slice(0, 10)
      : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

    const baseName = `Fattura-${fattura.trim()}_${datePart}`;

    // Check for duplicate folders in .Archiv/
    const archiveHandle = await fileSystemService.getArchiveFolderHandle();
    if (!archiveHandle) return baseName;

    let candidateName = baseName;
    let suffix = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        await archiveHandle.getDirectoryHandle(candidateName, { create: false });
        // Folder exists → try next suffix
        suffix++;
        candidateName = `${baseName}_v${suffix}`;
      } catch {
        // Folder does not exist → use this name
        return candidateName;
      }
    }
  }

  // Map StepStatus to ArchiveMetadata status
  private mapRunStatus(status: string): 'completed' | 'aborted' | 'failed' {
    if (status === 'ok' || status === 'soft-fail') return 'completed';
    return 'failed';
  }

  // Write complete archive package to disk
  async writeArchivePackage(
    run: Run,
    lines: InvoiceLine[],
    options?: { exportXml?: string; exportCsv?: string; extraFiles?: Record<string, string | Blob>; preFilteredSerials?: PreFilteredSerialRow[]; issues?: Issue[] }
  ): Promise<{ success: boolean; cleanedUp: boolean; folderName: string; failedFiles: string[] }> {
    const runId = run.id;
    const failedFiles: string[] = [];

    // 1. Generate folder name with duplicate detection
    const folderName = await this.generateArchiveFolderName(
      run.invoice.fattura,
      run.invoice.invoiceDate
    );

    logService.info(`Archiv-Paket wird erstellt: ${folderName}`, { runId, step: 'Archiv' });

    // 2. Write run-log.json (from in-memory buffer or localStorage)
    const logEntries = logService.getRunBuffer(runId);
    const entries = logEntries.length > 0 ? logEntries : logService.getRunLog(runId);
    if (entries.length > 0) {
      const ok = await fileSystemService.saveToArchive(
        folderName, 'run-log.json', JSON.stringify(entries, null, 2)
      );
      if (!ok) failedFiles.push('run-log.json');
    }

    // 3. Write invoice-lines.json
    const linesOk = await fileSystemService.saveToArchive(
      folderName, 'invoice-lines.json', JSON.stringify(lines, null, 2)
    );
    if (!linesOk) failedFiles.push('invoice-lines.json');

    // 4. Write invoice PDF from IndexedDB
    let invoiceFileInfo: { name: string; size: number } | null = null;
    try {
      const invoiceFile = await fileStorageService.loadFile('invoice');
      if (invoiceFile?.file) {
        const ok = await fileSystemService.saveToArchive(folderName, invoiceFile.name, invoiceFile.file);
        if (ok) {
          invoiceFileInfo = { name: invoiceFile.name, size: invoiceFile.size };
        } else {
          failedFiles.push(invoiceFile.name);
        }
      }
    } catch {
      logService.warn('Invoice-PDF konnte nicht aus IndexedDB geladen werden', { runId, step: 'Archiv' });
    }

    // 5. Write export.xml if provided (Legacy — nur aktiv wenn kein extraFiles)
    let exportXmlInfo: { name: string; size: number } | null = null;
    if (options?.exportXml && !options?.extraFiles) {
      const ok = await fileSystemService.saveToArchive(folderName, 'export.xml', options.exportXml);
      if (ok) {
        exportXmlInfo = { name: 'export.xml', size: options.exportXml.length };
      } else {
        failedFiles.push('export.xml');
      }
    }

    // 6. Write export.csv if provided (Legacy — nur aktiv wenn kein extraFiles)
    let exportCsvInfo: { name: string; size: number } | null = null;
    if (options?.exportCsv && !options?.extraFiles) {
      const ok = await fileSystemService.saveToArchive(folderName, 'export.csv', options.exportCsv);
      if (ok) {
        exportCsvInfo = { name: 'export.csv', size: options.exportCsv.length };
      } else {
        failedFiles.push('export.csv');
      }
    }

    // 6.5 PROJ-42-ADD-ON-V: Write versionierte Export-Dateien (revisionssicher, kein Überschreiben)
    const extraFileInfos: { name: string; size: number }[] = [];
    if (options?.extraFiles) {
      for (const [name, content] of Object.entries(options.extraFiles)) {
        const ok = await fileSystemService.saveToArchive(folderName, name, content);
        if (ok) {
          const size = content instanceof Blob ? content.size : content.length;
          extraFileInfos.push({ name, size });
        } else {
          failedFiles.push(name);
        }
      }
    }

    // 7. PROJ-20: Write serial-data.json (lean archive, no raw Excel)
    let serialDataInfo: { name: string; size: number } | null = null;
    if (options?.preFilteredSerials && options.preFilteredSerials.length > 0) {
      const leanSerials = buildLeanArchive(options.preFilteredSerials);
      const serialJson = JSON.stringify(leanSerials, null, 2);
      const ok = await fileSystemService.saveToArchive(folderName, 'serial-data.json', serialJson);
      if (ok) {
        serialDataInfo = { name: 'serial-data.json', size: serialJson.length };
      } else {
        failedFiles.push('serial-data.json');
      }
    }

    // 7.5 PROJ-21: Write run-report.json (Issues + Summary)
    let runReportInfo: { name: string; size: number } | null = null;
    if (options?.issues && options.issues.length > 0) {
      const runIssues = options.issues.filter(i => i.runId === run.id);
      const runReport = {
        version: 1,
        runId,
        fattura: run.invoice.fattura,
        generatedAt: new Date().toISOString(),
        summary: {
          totalIssues: runIssues.length,
          openIssues: runIssues.filter(i => i.status === 'open').length,
          // PROJ-43: pendingIssues — escalated, awaiting external response
          pendingIssues: runIssues.filter(i => i.status === 'pending').length,
          resolvedIssues: runIssues.filter(i => i.status === 'resolved').length,
          bySeverity: {
            error: runIssues.filter(i => i.severity === 'error').length,
            warning: runIssues.filter(i => i.severity === 'warning').length,
            info: runIssues.filter(i => i.severity === 'info').length,
          },
        },
        issues: runIssues,
      };
      const reportJson = JSON.stringify(runReport, null, 2);
      const ok = await fileSystemService.saveToArchive(folderName, 'run-report.json', reportJson);
      if (ok) {
        runReportInfo = { name: 'run-report.json', size: reportJson.length };
      } else {
        failedFiles.push('run-report.json');
      }
    }

    // 8. Build and write metadata.json
    const metadata: ArchiveMetadata = {
      version: 1,
      runId,
      fattura: run.invoice.fattura,
      invoiceDate: run.invoice.invoiceDate,
      createdAt: run.createdAt,
      archivedAt: new Date().toISOString(),
      status: this.mapRunStatus(run.status),
      config: {
        eingangsart: run.config.eingangsart,
        tolerance: run.config.tolerance,
        currency: 'EUR',
        preisbasis: run.config.priceBasis,
      },
      stats: {
        parsedPositions: run.stats.parsedInvoiceLines,
        expandedLines: run.stats.expandedLineCount,
        fullMatchCount: run.stats.fullMatchCount,
        noMatchCount: run.stats.noMatchCount,
        exportedLines: lines.length,
      },
      files: {
        invoice: invoiceFileInfo,
        warenbegleitschein: null,
        exportXml: exportXmlInfo ?? extraFileInfos.find(f => f.name.endsWith('.xml')) ?? null,
        exportCsv: exportCsvInfo ?? extraFileInfos.find(f => f.name.endsWith('.csv')) ?? null,
        exportXlsx: extraFileInfos.find(f => f.name.endsWith('.xlsx') || f.name.endsWith('.xls')) ?? null,
        artikelstamm: null,
        offeneBestellungen: null,
        serialData: serialDataInfo,
        runReport: runReportInfo,
      },
    };

    const metaOk = await fileSystemService.saveToArchive(
      folderName, 'metadata.json', JSON.stringify(metadata, null, 2)
    );
    if (!metaOk) failedFiles.push('metadata.json');

    // 8. Cleanup ONLY if required files succeeded
    const criticalFailures = failedFiles.filter(
      f => f === 'invoice-lines.json' || f === 'metadata.json'
    );
    const requiredOk = criticalFailures.length === 0;

    let cleanedUp = false;
    if (requiredOk) {
      await this.cleanupBrowserData(runId);
      cleanedUp = true;
    } else {
      logService.warn(`Archiv-Paket unvollständig: ${criticalFailures.join(', ')}`, { runId, step: 'Archiv' });
    }

    logService.info(
      `Archiv-Paket ${cleanedUp ? 'erfolgreich' : 'mit Fehlern'}: ${folderName}`,
      { runId, step: 'Archiv', details: `${lines.length} Positionen, ${failedFiles.length} Fehler` }
    );

    return { success: requiredOk, cleanedUp, folderName, failedFiles };
  }

  // Cleanup browser storage after successful archive write
  async cleanupBrowserData(runId: string): Promise<void> {
    // 1. Run log from localStorage
    localStorage.removeItem(`falmec-run-log-${runId}`);

    // 2. Archive run entry + associated archive files from localStorage
    const runs = this.getArchivedRuns();
    const run = runs.find(r => r.runId === runId);
    if (run) {
      for (const folder of run.folders) {
        for (const file of folder.files) {
          localStorage.removeItem(`${ARCHIVE_FILES_PREFIX}${file.id}`);
        }
      }
      const filtered = runs.filter(r => r.runId !== runId);
      this.saveArchivedRuns(filtered);
    }

    // 3. Parsed invoice cache
    localStorage.removeItem('falmec-parsed-invoice');

    // 4. IndexedDB uploaded files
    try {
      await fileStorageService.clearAllFiles();
    } catch {
      logService.warn('IndexedDB-Cleanup fehlgeschlagen', { runId, step: 'Archiv' });
    }

    logService.info('Browser-Daten bereinigt', { runId, step: 'Archiv' });
  }
}

// Export singleton instance
export const archiveService = new ArchiveService();
