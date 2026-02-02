import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileBox, FilePenLine, Archive, Download } from 'lucide-react';
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

const UPLOAD_MODULES = [
  { type: 'invoice', label: 'Rechnung / Fattura', accept: '.pdf' },
  { type: 'openWE', label: 'offene Bestellungen', accept: '.csv' },
  { type: 'serialList', label: 'Seriennummerliste', accept: '.xls,.xlsx' },
  { type: 'articleList', label: 'Artikelstammdaten', accept: '.xlsx,.xml' },
] as const;

export function AppSidebar() {
  const [showHomeDialog, setShowHomeDialog] = useState(false);
  const navigate = useNavigate();
  const { uploadedFiles, addUploadedFile } = useRunStore();

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
      addUploadedFile({ type: type as any, file, name: file.name });
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
    <header className="w-full bg-sidebar border-b border-sidebar-border sticky top-0 z-50 min-h-[calc(4rem+3vh)] flex items-center relative">
      <div className="flex items-center justify-center px-6 w-full">
        {/* Logo - Left positioned */}
        <div className="absolute left-6 flex items-center gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={handleHomeClick}
              className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center hover:opacity-80 transition-opacity duration-200"
              title="Zur Startseite"
            >
              <FileBox className="w-5 h-5 text-primary-foreground" />
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

        {/* Sidebar Buttons - Centered */}
        <div className="flex items-center gap-2">
          {/* Archiv Button */}
          <Link
            to="/archiv"
            className="h-[calc((4rem+3vh)*0.82)] aspect-square rounded-lg border border-[#666666] bg-[#c9c3b6] hover:opacity-80 transition-all duration-200 flex flex-col items-center justify-end p-[2px]"
            title="Archiv"
          >
            <Archive
              className="flex-1 w-full max-h-[141%]"
              style={{ color: '#666666' }}
            />
            <span className="text-xs text-muted-foreground">
              Archiv
            </span>
          </Link>

          {/* Export Button */}
          <button
            onClick={() => {
              const link = document.createElement('a');
              link.href = 'data:text/xml;charset=utf-8,<?xml version="1.0" encoding="UTF-8"?><export></export>';
              link.download = 'export.xml';
              link.click();
            }}
            className="h-[calc((4rem+3vh)*0.82)] aspect-square rounded-lg border border-[#666666] bg-[#c9c3b6] hover:opacity-80 transition-all duration-200 flex flex-col items-center justify-end p-[2px]"
            title="Export"
          >
            <Download
              className="flex-1 w-full max-h-[141%]"
              style={{ color: '#666666' }}
            />
            <span className="text-xs text-muted-foreground">
              Export
            </span>
          </button>

          {/* NEU Button */}
          <Link
            to="/new-run"
            className="h-[calc((4rem+3vh)*0.82)] aspect-square rounded-lg border border-[#666666] bg-[#c9c3b6] hover:opacity-80 transition-all duration-200 flex flex-col items-center justify-end p-[2px]"
            title="Neuer Lauf"
          >
            <FilePenLine
              className="flex-1 w-full max-h-[141%]"
              style={{ color: '#666666' }}
            />
            <span className="text-xs text-muted-foreground">
              NEU
            </span>
          </Link>
        </div>

        {/* Upload Status - Right positioned, vertically centered */}
        <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col">
          {UPLOAD_MODULES.map((module, index) => {
            const uploadedFile = uploadedFiles.find(f => f.type === module.type);
            const isUploaded = !!uploadedFile;
            const isFirst = index === 0;
            const isLast = index === UPLOAD_MODULES.length - 1;

            return (
              <button
                key={module.type}
                onClick={() => fileInputRefs[module.type]?.current?.click()}
                className={`flex items-center gap-1.5 px-2 py-0.5 border-x border-t border-[#666666] bg-transparent hover:bg-sidebar-accent/30 transition-colors text-left ${isFirst ? 'rounded-t' : ''} ${isLast ? 'rounded-b border-b' : ''}`}
                title={isUploaded ? uploadedFile.name : 'Klicken zum Hochladen'}
              >
                <span className="text-[10px] text-muted-foreground w-[95px] min-w-[95px] max-w-[95px] text-right">
                  {module.label}
                </span>
                <div className="h-3 w-px bg-border flex-shrink-0" />
                <span className="text-[9px] text-muted-foreground flex-1 truncate">
                  {isUploaded ? uploadedFile.name : 'nicht ausgewählt - bitte wählen'}
                </span>
                <div className="h-3 w-px bg-border flex-shrink-0" />
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${isUploaded ? 'bg-green-500' : 'bg-red-500'}`}
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
