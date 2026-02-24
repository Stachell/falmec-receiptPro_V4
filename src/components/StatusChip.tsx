import { cn } from '@/lib/utils';
import { StepStatus } from '@/types';

interface StatusChipProps {
  status: StepStatus | 'resolved' | 'open';
  label?: string;
  className?: string;
}

const statusConfig: Record<string, { class: string; label: string }> = {
  'not-started': { class: 'status-chip-pending', label: 'Nicht gestartet' },
  'running': { class: 'status-chip-running', label: 'In Bearbeitung' },
  'paused': { class: 'status-chip-paused', label: 'Pausiert' },
  'ok': { class: 'status-chip-ok', label: 'Erfolgreich' },
  'soft-fail': { class: 'status-chip-soft-fail', label: 'Warnung' },
  'failed': { class: 'status-chip-failed', label: 'Fehlgeschlagen' },
  'resolved': { class: 'status-chip-ok', label: 'Gelöst' },
  'open': { class: 'status-chip-soft-fail', label: 'Offen' },
};

export function StatusChip({ status, label, className }: StatusChipProps) {
  const config = statusConfig[status] || statusConfig['not-started'];
  
  return (
    <span className={cn('status-chip', config.class, className)}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label || config.label}
    </span>
  );
}

interface PriceStatusChipProps {
  status: 'ok' | 'mismatch' | 'pending';
  className?: string;
}

export function PriceStatusChip({ status, className }: PriceStatusChipProps) {
  const config = {
    ok: { class: 'status-chip-ok', label: 'Preis OK' },
    mismatch: { class: 'status-chip-soft-fail', label: 'Preisabweichung' },
    pending: { class: 'status-chip-pending', label: 'Ausstehend' },
  };
  
  return (
    <span className={cn('status-chip', config[status].class, className)}>
      {config[status].label}
    </span>
  );
}

interface SeverityBadgeProps {
  severity: 'error' | 'warning' | 'info';
  className?: string;
}

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  const config = {
    error: { class: 'status-chip-failed', label: 'Fehler' },
    warning: { class: 'status-chip-soft-fail', label: 'Warnung' },
    info: { class: 'bg-blue-500/20 text-blue-400', label: 'Info' },
  };

  return (
    <span className={cn('status-chip', config[severity].class, className)}>
      {config[severity].label}
    </span>
  );
}
