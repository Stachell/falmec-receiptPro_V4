import { useState, useRef, useEffect } from 'react';
import { useClickLock } from '@/hooks/useClickLock';
import { Link, useNavigate } from 'react-router-dom';
import { FileBox, FilePenLine, RefreshCw } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useRunStore } from '@/store/runStore';
import { UploadStatus } from '@/types';

// Hover style constants
const HOVER_BG = '#008C99';
const HOVER_TEXT = '#FFFFFF';
const HOVER_BORDER = '#D8E6E7';

// Traffic light colors
const STATUS_COLORS: Record<UploadStatus, string> = {
  ready: '#22C55E',      // Green - file uploaded and current
  missing: '#EF4444',    // Red - no file uploaded
  warning: '#FFA500',    // Light Orange - day doesn't match (outdated)
  critical: '#FF6600',   // Dark Orange - month doesn't match (very outdated)
};

const UPLOAD_MODULES = [
  { type: 'invoice', label: 'Rechnung / Fattura', accept: '.pdf' },
  { type: 'openWE', label: 'offene Bestellungen', accept: '.csv' },
  { type: 'serialList', label: 'Seriennummerliste', accept: '.xls,.xlsx' },
  { type: 'articleList', label: 'Artikelstammdaten', accept: '.xlsx,.xml' },
] as const;

// Format date for display [DD.MM.]
function formatDateShort(isoString: string): string {
  const date = new Date(isoString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${day}.${month}.`;
}

// Format full timestamp [DD.MM.YY-HH:mm:ss]
function formatDateFull(isoString: string): string {
  const date = new Date(isoString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear().toString().slice(-2);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${day}.${month}.${year}-${hours}:${minutes}:${seconds}`;
}

// Determine upload status based on timestamp comparison
function getUploadStatus(uploadedAt: string | undefined): UploadStatus {
  if (!uploadedAt) return 'missing';

  const now = new Date();
  const uploadDate = new Date(uploadedAt);

  const nowDay = now.getDate();
  const nowMonth = now.getMonth();
  const uploadDay = uploadDate.getDate();
  const uploadMonth = uploadDate.getMonth();

  // Month doesn't match = critical (very outdated)
  if (nowMonth !== uploadMonth) {
    return 'critical';
  }

  // Day doesn't match = warning (outdated)
  if (nowDay !== uploadDay) {
    return 'warning';
  }

  // Same day = ready
  return 'ready';
}

export function AppSidebar() {
  const [showHomeDialog, setShowHomeDialog] = useState(false);
  const [isLogoHovered, setIsLogoHovered] = useState(false);
  const [isNeuHovered, setIsNeuHovered] = useState(false);
  const navigate = useNavigate();
  const { uploadedFiles, addUploadedFile, loadStoredFiles } = useRunStore();
  const { wrap: lockWrap, isLocked: uploadIsLocked } = useClickLock();

  // Load stored files on mount
  useEffect(() => {
    loadStoredFiles();
  }, [loadStoredFiles]);

  const invoiceRef = useRef<HTMLInputElement>(null);
  const openWERef = useRef<HTMLInputElement>(null);
  const serialListRef = useRef<HTMLInputElement>(null);
  const articleListRef = useRef<HTMLInputElement>(null);

  const fileInputRefs: Record<string, React.RefObject<HTMLInputElement>> = {
    invoice: invoiceRef,
    openWE: openWERef,
    serialList: serialListRef,
    articleList: articleListRef,
  };

  const handleFileChange = (type: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      addUploadedFile({ type: type as any, file, name: file.name, size: file.size });
    }
  };

  const handleHomeClick = () => {
    setShowHomeDialog(true);
  };

  const handleConfirmHome = () => {
    setShowHomeDialog(false);
    navigate('/');
  };

  return (
    <header className="w-full bg-sidebar border-b border-sidebar-border sticky top-0 z-50 min-h-[calc(4rem+4vh)] flex items-center relative">
      <div className="flex items-center justify-center px-6 w-full">
        {/* Logo - Left positioned */}
        <div className="absolute left-6 flex items-center gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={handleHomeClick}
              onMouseEnter={() => setIsLogoHovered(true)}
              onMouseLeave={() => setIsLogoHovered(false)}
              className="rounded-lg flex items-center justify-center transition-all duration-200"
              style={{
                width: isLogoHovered ? '52px' : '40px',
                height: isLogoHovered ? '52px' : '40px',
                backgroundColor: isLogoHovered ? '#DC2626' : '#008C99',
                borderWidth: '2px',
                borderStyle: 'solid',
                borderColor: isLogoHovered ? '#991B1B' : 'transparent',
              }}
              title={isLogoHovered ? 'Seite neu laden' : 'Zur Startseite'}
            >
              {isLogoHovered ? (
                <RefreshCw className="w-6 h-6" style={{ color: '#FFFFFF' }} />
              ) : (
                <FileBox className="w-5 h-5 text-primary-foreground" />
              )}
            </button>
            <div className="flex flex-col">
              <span className="font-semibold text-sidebar-foreground">
                falmec ReceiptPro
              </span>
              <span className="text-xs text-muted-foreground">
                by Dominik Langgut
              </span>
            </div>
          </div>
          {/* Vertical Separator */}
          <div className="h-10 w-px bg-border" />
        </div>

        {/* Upload Status - Centered */}
        <div
          className="flex flex-col"
          style={{
            transform: 'scale(0.85)',
            transformOrigin: 'center',
          }}
        >
          {UPLOAD_MODULES.map((module, index) => {
            const uploadedFile = uploadedFiles.find(f => f.type === module.type);
            const isUploaded = !!uploadedFile;
            const isFirst = index === 0;
            const isLast = index === UPLOAD_MODULES.length - 1;
            const uploadStatus = getUploadStatus(uploadedFile?.uploadedAt);
            const statusColor = STATUS_COLORS[uploadStatus];

            // Format dates for display
            const dateDisplay = isUploaded ? formatDateShort(uploadedFile.uploadedAt) : '***';
            const fullTimestamp = isUploaded ? formatDateFull(uploadedFile.uploadedAt) : '';

            return (
              <button
                key={module.type}
                onClick={lockWrap(module.type, () => fileInputRefs[module.type]?.current?.click())}
                disabled={uploadIsLocked(module.type)}
                className={`flex items-center gap-1.5 px-2 py-0.5 border-x border-t border-[#666666] transition-colors text-left ${isFirst ? 'rounded-t' : ''} ${isLast ? 'rounded-b border-b' : ''}`}
                style={{ backgroundColor: '#D8E6E7' }}
                title={isUploaded ? `${uploadedFile.name} | Upload: ${fullTimestamp}` : 'Klicken zum Hochladen'}
              >
                {/* Label column - shifts left */}
                <span className="text-[10px] text-muted-foreground w-[95px] min-w-[95px] max-w-[95px] text-right">
                  {module.label}
                </span>
                <div className="h-3 w-px bg-[#666666] flex-shrink-0" />

                {/* Date column - new */}
                <span
                  className="text-[9px] text-muted-foreground w-[38px] min-w-[38px] max-w-[38px] text-center"
                  title={fullTimestamp || 'Keine Datei'}
                >
                  {dateDisplay}
                </span>
                <div className="h-3 w-px bg-[#666666] flex-shrink-0" />

                {/* Filename column - 20% wider (was ~95px, now ~114px), RTL for right-to-left display */}
                <span
                  className="text-[9px] text-muted-foreground w-[114px] min-w-[114px] max-w-[114px] overflow-hidden whitespace-nowrap"
                  style={{ direction: 'rtl', textAlign: 'left' }}
                >
                  {isUploaded ? uploadedFile.name : 'nicht ausgewählt'}
                </span>
                <div className="h-3 w-px bg-[#666666] flex-shrink-0" />

                {/* Status indicator (traffic light) */}
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: statusColor }}
                  title={
                    uploadStatus === 'ready' ? 'Aktuell' :
                    uploadStatus === 'missing' ? 'Keine Datei' :
                    uploadStatus === 'warning' ? 'Veraltete Datei (Tag)' :
                    'Sehr veraltete Datei (Monat)'
                  }
                />
                <input
                  ref={fileInputRefs[module.type]}
                  type="file"
                  accept={module.accept}
                  onChange={(e) => handleFileChange(module.type, e)}
                  className="hidden"
                />
              </button>
            );
          })}
        </div>

        {/* NEU Button - Right positioned */}
        <div className="absolute right-6 flex items-center">
          <Link
            to="/new-run"
            onMouseEnter={() => setIsNeuHovered(true)}
            onMouseLeave={() => setIsNeuHovered(false)}
            className="h-[calc((4rem+4vh)*0.82)] aspect-square rounded-lg border transition-all duration-200 flex flex-col items-center justify-end p-[2px]"
            style={{
              backgroundColor: isNeuHovered ? HOVER_BG : '#c9c3b6',
              borderColor: isNeuHovered ? HOVER_BORDER : '#666666',
            }}
            title="Neuer Lauf"
          >
            <FilePenLine
              className="flex-1 w-full max-h-[141%]"
              style={{ color: isNeuHovered ? HOVER_TEXT : '#666666' }}
            />
            <span
              className="text-xs"
              style={{ color: isNeuHovered ? HOVER_TEXT : '#666666' }}
            >
              NEU
            </span>
          </Link>
        </div>
      </div>

      {/* Home Navigation Dialog */}
      <AlertDialog open={showHomeDialog} onOpenChange={setShowHomeDialog}>
        <AlertDialogContent style={{ backgroundColor: '#D8E6E7' }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Zur Startseite wechseln?</AlertDialogTitle>
            <AlertDialogDescription>
              Du wirst zur Startseite geleitet. Willst du die Bearbeitung wirklich verlassen?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbruch</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmHome}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
