import { create } from 'zustand';
import {
  Run,
  InvoiceLine,
  Issue,
  UploadedFile,
  RunConfig,
  AuditLogEntry,
  StepStatus
} from '@/types';
import {
  mockRuns,
  mockInvoiceLines,
  mockIssues,
  mockAuditLog
} from '@/data/mockData';
import { logService } from '@/services/logService';
import { archiveService } from '@/services/archiveService';

interface RunState {
  // Data
  runs: Run[];
  currentRun: Run | null;
  invoiceLines: InvoiceLine[];
  issues: Issue[];
  auditLog: AuditLogEntry[];
  uploadedFiles: UploadedFile[];
  
  // Global Config
  globalConfig: RunConfig;
  
  // UI State
  activeTab: string;
  isProcessing: boolean;
  
  // Actions
  setCurrentRun: (run: Run | null) => void;
  setActiveTab: (tab: string) => void;
  setGlobalConfig: (config: Partial<RunConfig>) => void;
  addUploadedFile: (file: UploadedFile) => void;
  removeUploadedFile: (type: UploadedFile['type']) => void;
  clearUploadedFiles: () => void;
  createNewRun: () => Run;
  updateRunStatus: (runId: string, status: StepStatus) => void;
  updateStepStatus: (runId: string, stepNo: number, status: StepStatus) => void;
  updateInvoiceLine: (lineId: string, updates: Partial<InvoiceLine>) => void;
  resolveIssue: (issueId: string, resolutionNote: string) => void;
  addAuditEntry: (entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) => void;
}

export const useRunStore = create<RunState>((set, get) => ({
  // Initial Data
  runs: mockRuns,
  currentRun: null,
  invoiceLines: mockInvoiceLines,
  issues: mockIssues,
  auditLog: mockAuditLog,
  uploadedFiles: [],
  
  // Global Config
  globalConfig: {
    priceBasis: 'Net',
    priceType: 'EK',
    tolerance: 0.01,
    eingangsart: 'Standard',
  },
  
  // UI State
  activeTab: 'overview',
  isProcessing: false,
  
  // Actions
  setCurrentRun: (run) => set({ currentRun: run }),
  
  setActiveTab: (tab) => set({ activeTab: tab }),
  
  setGlobalConfig: (config) => set((state) => ({
    globalConfig: { ...state.globalConfig, ...config }
  })),
  
  addUploadedFile: (file) => set((state) => ({
    uploadedFiles: [
      ...state.uploadedFiles.filter(f => f.type !== file.type),
      file
    ]
  })),
  
  removeUploadedFile: (type) => set((state) => ({
    uploadedFiles: state.uploadedFiles.filter(f => f.type !== type)
  })),
  
  clearUploadedFiles: () => set({ uploadedFiles: [] }),
  
  createNewRun: () => {
    const { globalConfig, uploadedFiles } = get();
    const newRun: Run = {
      id: `run-${Date.now()}`,
      createdAt: new Date().toISOString(),
      status: 'running',
      config: globalConfig,
      invoice: {
        fattura: 'FA-2025-NEW',
        invoiceDate: new Date().toISOString().split('T')[0],
        deliveryDate: null,
      },
      stats: {
        parsedInvoiceLines: 0,
        matchedOrders: 0,
        notOrderedCount: 0,
        serialMatchedCount: 0,
        mismatchedGroupsCount: 0,
        articleMatchedCount: 0,
        inactiveArticlesCount: 0,
        priceOkCount: 0,
        priceMismatchCount: 0,
        exportReady: false,
      },
      steps: [
        { stepNo: 1, name: 'Rechnung auslesen', status: 'running', issuesCount: 0 },
        { stepNo: 2, name: 'Order Assignment', status: 'not-started', issuesCount: 0 },
        { stepNo: 3, name: 'Serial Matching', status: 'not-started', issuesCount: 0 },
        { stepNo: 4, name: 'Article Master', status: 'not-started', issuesCount: 0 },
        { stepNo: 5, name: 'Warehouse Location', status: 'not-started', issuesCount: 0 },
        { stepNo: 6, name: 'XML Export', status: 'not-started', issuesCount: 0 },
      ],
    };

    // Log workflow start
    logService.info('Neuer Verarbeitungslauf gestartet', {
      runId: newRun.id,
      step: 'System',
      details: `Fattura: ${newRun.invoice.fattura}, Config: ${JSON.stringify(globalConfig)}`,
    });

    // Create archive entry with uploaded files
    archiveService.createArchiveEntry(
      newRun.id,
      newRun.invoice.fattura,
      globalConfig,
      uploadedFiles
    );

    // Log step start
    logService.info('Schritt gestartet: Rechnung auslesen', {
      runId: newRun.id,
      step: 'Rechnung auslesen',
    });

    set((state) => ({
      runs: [newRun, ...state.runs],
      currentRun: newRun,
    }));

    return newRun;
  },
  
  updateRunStatus: (runId, status) => set((state) => ({
    runs: state.runs.map(run => 
      run.id === runId ? { ...run, status } : run
    ),
    currentRun: state.currentRun?.id === runId 
      ? { ...state.currentRun, status } 
      : state.currentRun,
  })),
  
  updateStepStatus: (runId, stepNo, status) => set((state) => {
    const updateSteps = (steps: Run['steps']) =>
      steps.map(step => step.stepNo === stepNo ? { ...step, status } : step);
    
    return {
      runs: state.runs.map(run =>
        run.id === runId ? { ...run, steps: updateSteps(run.steps) } : run
      ),
      currentRun: state.currentRun?.id === runId
        ? { ...state.currentRun, steps: updateSteps(state.currentRun.steps) }
        : state.currentRun,
    };
  }),
  
  updateInvoiceLine: (lineId, updates) => set((state) => ({
    invoiceLines: state.invoiceLines.map(line =>
      line.lineId === lineId ? { ...line, ...updates } : line
    ),
  })),
  
  resolveIssue: (issueId, resolutionNote) => set((state) => ({
    issues: state.issues.map(issue =>
      issue.id === issueId
        ? {
            ...issue,
            status: 'resolved' as const,
            resolvedAt: new Date().toISOString(),
            resolutionNote,
          }
        : issue
    ),
  })),
  
  addAuditEntry: (entry) => set((state) => ({
    auditLog: [
      {
        ...entry,
        id: `audit-${Date.now()}`,
        timestamp: new Date().toISOString(),
      },
      ...state.auditLog,
    ],
  })),
}));
