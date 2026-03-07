// Log Service - Handles logging to localStorage with system and per-run logs

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  runId?: string;
  step?: string;
  message: string;
  details?: string;
}

export interface LogSnapshot {
  id: string;
  name: string;
  createdAt: string;
  logs: LogEntry[];
}

const SYSTEM_LOG_KEY = 'falmec-system-log';
const RUN_LOG_PREFIX = 'falmec-run-log-';
const LOG_SNAPSHOTS_KEY = 'falmec-log-snapshots';
const MAX_SYSTEM_LOG_ENTRIES = 10000;

class LogService {
  // In-memory run buffers: collects log entries per active run for later JSON export
  private runBuffers: Map<string, LogEntry[]> = new Map();

  private safeSetItem(key: string, value: string): boolean {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.warn(`[LogService] localStorage write failed for key "${key}"`, error);
      return false;
    }
  }

  // Format timestamp for folder/file names: YYYY-MM-DD-HHmmss
  private formatTimestamp(date: Date = new Date()): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }

  // Format timestamp for display: DD.MM.YYYY HH:mm:ss
  private formatDisplayTimestamp(date: Date = new Date()): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  // Add a log entry to both system log and run-specific log (if runId provided)
  log(
    level: LogEntry['level'],
    message: string,
    options?: { runId?: string; step?: string; details?: string }
  ): LogEntry {
    const entry: LogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      level,
      message,
      runId: options?.runId,
      step: options?.step,
      details: options?.details,
    };

    // Add to system log
    this.addToSystemLog(entry);

    // Add to run-specific log if runId provided
    if (options?.runId) {
      this.addToRunLog(options.runId, entry);

      // Also push to in-memory run buffer (if active)
      const buffer = this.runBuffers.get(options.runId);
      if (buffer) {
        buffer.push(entry);
      }
    }

    return entry;
  }

  // Convenience methods
  info(message: string, options?: { runId?: string; step?: string; details?: string }): LogEntry {
    return this.log('INFO', message, options);
  }

  warn(message: string, options?: { runId?: string; step?: string; details?: string }): LogEntry {
    return this.log('WARN', message, options);
  }

  error(message: string, options?: { runId?: string; step?: string; details?: string }): LogEntry {
    return this.log('ERROR', message, options);
  }

  debug(message: string, options?: { runId?: string; step?: string; details?: string }): LogEntry {
    return this.log('DEBUG', message, options);
  }

  // Add entry to system log
  private addToSystemLog(entry: LogEntry): void {
    const logs = this.getSystemLog();
    logs.unshift(entry);

    // Trim to max entries
    if (logs.length > MAX_SYSTEM_LOG_ENTRIES) {
      logs.length = MAX_SYSTEM_LOG_ENTRIES;
    }

    const serialized = JSON.stringify(logs);
    if (!this.safeSetItem(SYSTEM_LOG_KEY, serialized)) {
      // Retry once with a much smaller log payload in low-storage scenarios.
      this.safeSetItem(SYSTEM_LOG_KEY, JSON.stringify(logs.slice(0, 500)));
    }
  }

  // Add entry to run-specific log
  private addToRunLog(runId: string, entry: LogEntry): void {
    const key = `${RUN_LOG_PREFIX}${runId}`;
    const logs = this.getRunLog(runId);
    logs.unshift(entry);
    const serialized = JSON.stringify(logs);
    if (!this.safeSetItem(key, serialized)) {
      this.safeSetItem(key, JSON.stringify(logs.slice(0, 300)));
    }
  }

  // Get all system logs
  getSystemLog(): LogEntry[] {
    try {
      const data = localStorage.getItem(SYSTEM_LOG_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  // Get logs for a specific run
  getRunLog(runId: string): LogEntry[] {
    try {
      const key = `${RUN_LOG_PREFIX}${runId}`;
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  // Format logs as text for display/download
  formatLogsAsText(logs: LogEntry[], title?: string): string {
    const lines: string[] = [];

    if (title) {
      lines.push('='.repeat(60));
      lines.push(title);
      lines.push('='.repeat(60));
      lines.push('');
    }

    lines.push(`Erstellt: ${this.formatDisplayTimestamp()}`);
    lines.push(`Anzahl Einträge: ${logs.length}`);
    lines.push('');
    lines.push('-'.repeat(60));
    lines.push('');

    for (const entry of logs) {
      const date = new Date(entry.timestamp);
      const timestamp = this.formatDisplayTimestamp(date);
      const levelPad = entry.level.padEnd(5);

      let line = `[${timestamp}] [${levelPad}]`;

      if (entry.runId) {
        line += ` [${entry.runId}]`;
      }
      if (entry.step) {
        line += ` [${entry.step}]`;
      }

      line += ` ${entry.message}`;
      lines.push(line);

      if (entry.details) {
        lines.push(`    Details: ${entry.details}`);
      }
    }

    return lines.join('\n');
  }

  // Create a snapshot of the current system log
  createLogSnapshot(): LogSnapshot {
    const now = new Date();
    const timestamp = this.formatTimestamp(now);
    const snapshot: LogSnapshot = {
      id: `snapshot-${Date.now()}`,
      name: `Logabfrage_${timestamp}`,
      createdAt: now.toISOString(),
      logs: this.getSystemLog(),
    };

    // Save snapshot to list
    const snapshots = this.getLogSnapshots();
    snapshots.unshift(snapshot);
    this.safeSetItem(LOG_SNAPSHOTS_KEY, JSON.stringify(snapshots));

    return snapshot;
  }

  // Get all log snapshots
  getLogSnapshots(): LogSnapshot[] {
    try {
      const data = localStorage.getItem(LOG_SNAPSHOTS_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  // Open log in new browser tab
  openLogInNewTab(logs: LogEntry[], title?: string): void {
    const text = this.formatLogsAsText(logs, title);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const timestamp = this.formatTimestamp(now);
    const fileName = `Logfile_Stand-_${timestamp}.txt`;

    // Open in new tab
    const newWindow = window.open(url, '_blank');
    if (newWindow) {
      newWindow.document.title = fileName;
    }
  }

  // Download log as file
  downloadLog(logs: LogEntry[], fileName?: string): void {
    const now = new Date();
    const timestamp = this.formatTimestamp(now);
    const name = fileName || `Logfile_Stand-_${timestamp}.txt`;

    const text = this.formatLogsAsText(logs, `falmec ReceiptPro - Logfile`);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Create snapshot and open in new tab
  viewLogWithSnapshot(): LogSnapshot {
    const snapshot = this.createLogSnapshot();
    this.openLogInNewTab(snapshot.logs, `falmec ReceiptPro - ${snapshot.name}`);
    return snapshot;
  }

  // Initialize in-memory buffer for a new run
  startRunLogging(runId: string): void {
    this.runBuffers.set(runId, []);
    this.info('Run-Logging gestartet', { runId, step: 'System' });
  }

  // Get the in-memory run buffer (or empty array if not active)
  getRunBuffer(runId: string): LogEntry[] {
    return this.runBuffers.get(runId) || [];
  }

  /** PROJ-41: Restore run buffer from IndexedDB persistence */
  restoreRunBuffer(runId: string, entries: LogEntry[]): void {
    this.runBuffers.set(runId, [...entries]);
  }

  // Rename run buffer + localStorage key when runId changes (e.g. run-123 → Fattura-Nr-date)
  renameRunBuffer(oldRunId: string, newRunId: string): void {
    // Move in-memory buffer
    const buffer = this.runBuffers.get(oldRunId);
    if (buffer) {
      this.runBuffers.delete(oldRunId);
      this.runBuffers.set(newRunId, buffer);
    }

    // Move localStorage key
    const oldKey = `${RUN_LOG_PREFIX}${oldRunId}`;
    const newKey = `${RUN_LOG_PREFIX}${newRunId}`;
    const data = localStorage.getItem(oldKey);
    if (data) {
      this.safeSetItem(newKey, data);
      localStorage.removeItem(oldKey);
    }
  }

  // Export run log to disk via fileSystemService, then clean up on success
  async exportRunLog(runId: string): Promise<boolean> {
    // Collect entries: prefer buffer, fall back to localStorage
    const bufferEntries = this.runBuffers.get(runId);
    const entries = bufferEntries && bufferEntries.length > 0
      ? bufferEntries
      : this.getRunLog(runId);

    if (entries.length === 0) {
      this.warn('exportRunLog: Keine Log-Einträge für Run', { runId, step: 'System' });
      return false;
    }

    try {
      // Dynamic import to avoid circular dependency (fileSystemService imports logService)
      const { fileSystemService } = await import('./fileSystemService');
      const jsonContent = JSON.stringify(entries, null, 2);
      const success = await fileSystemService.saveRunLog(runId, jsonContent);

      if (success) {
        // Cleanup: delete buffer + localStorage ONLY after confirmed write
        this.runBuffers.delete(runId);
        localStorage.removeItem(`${RUN_LOG_PREFIX}${runId}`);
        this.info('Run-Log exportiert und localStorage bereinigt', { runId, step: 'System' });
        return true;
      }

      this.warn('exportRunLog: Speicherung fehlgeschlagen – Daten bleiben erhalten', { runId, step: 'System' });
      return false;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.error(`exportRunLog fehlgeschlagen: ${msg}`, { runId, step: 'System' });
      return false;
    }
  }

  // Clear all logs (for testing/development)
  clearAllLogs(): void {
    localStorage.removeItem(SYSTEM_LOG_KEY);
    localStorage.removeItem(LOG_SNAPSHOTS_KEY);

    // Clear all run logs
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.startsWith(RUN_LOG_PREFIX)) {
        localStorage.removeItem(key);
      }
    }
  }
}

// Export singleton instance
export const logService = new LogService();
