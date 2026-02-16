import { Clock, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { MatchStatus } from '@/types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface StatusCheckboxProps {
  status: MatchStatus;
  onClick?: () => void;
}

const STATUS_CONFIG: Record<MatchStatus, {
  icon: typeof Clock;
  color: string;
  label: string;
}> = {
  pending:       { icon: Clock,          color: '#F59E0B', label: 'folgt' },
  'full-match':  { icon: CheckCircle2,   color: '#22C55E', label: 'match' },
  'code-it-only':{ icon: AlertTriangle,  color: '#FB923C', label: 'Code-IT' },
  'ean-only':    { icon: AlertTriangle,  color: '#FB923C', label: 'EAN' },
  'no-match':    { icon: XCircle,        color: '#EF4444', label: 'fail' },
};

export function StatusCheckbox({ status, onClick }: StatusCheckboxProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded p-1 hover:bg-muted/50 transition-colors"
            onClick={onClick}
          >
            <Icon className="h-5 w-5" style={{ color: config.color }} />
          </button>
        </TooltipTrigger>
        <TooltipContent>{config.label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
