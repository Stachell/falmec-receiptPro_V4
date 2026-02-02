import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { cn } from '@/lib/utils';
import { Upload, FileText, X, Check, AlertCircle } from 'lucide-react';
import { UploadedFile } from '@/types';
import { Button } from '@/components/ui/button';

interface FileUploadZoneProps {
  label: string;
  description: string;
  accept: Record<string, string[]>;
  fileType: UploadedFile['type'];
  onFileAccepted: (file: UploadedFile) => void;
  onFileRemoved: () => void;
  currentFile?: UploadedFile;
  required?: boolean;
}

export function FileUploadZone({
  label,
  description,
  accept,
  fileType,
  onFileAccepted,
  onFileRemoved,
  currentFile,
  required = false,
}: FileUploadZoneProps) {
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    setError(null);
    
    if (rejectedFiles.length > 0) {
      setError('Ungültiges Dateiformat');
      return;
    }
    
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      onFileAccepted({
        name: file.name,
        size: file.size,
        type: fileType,
        file,
      });
    }
  }, [fileType, onFileAccepted]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxFiles: 1,
    multiple: false,
  });

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (currentFile) {
    return (
      <div className="enterprise-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-status-ok/10 flex items-center justify-center">
              <Check className="w-5 h-5 text-status-ok" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground">
                {label}
                {required && <span className="text-status-failed ml-1">*</span>}
              </span>
              <span className="text-sm text-foreground truncate max-w-[200px]">
                {currentFile.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatFileSize(currentFile.size)}
                {currentFile.rowCount && ` • ${currentFile.rowCount} Zeilen`}
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onFileRemoved();
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={cn(
        'file-drop-zone',
        isDragActive && 'file-drop-zone-active',
        error && 'border-status-failed'
      )}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-3">
        <div className={cn(
          "w-12 h-12 rounded-full flex items-center justify-center",
          isDragActive ? "bg-primary/10" : "bg-muted"
        )}>
          {isDragActive ? (
            <Upload className="w-6 h-6 text-primary" />
          ) : (
            <FileText className="w-6 h-6 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-sm font-medium text-foreground">
            {label}
            {required && <span className="text-status-failed ml-1">*</span>}
          </span>
          <span className="text-xs text-muted-foreground text-center">
            {description}
          </span>
        </div>
        {error && (
          <div className="flex items-center gap-1.5 text-status-failed text-xs">
            <AlertCircle className="w-3.5 h-3.5" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
