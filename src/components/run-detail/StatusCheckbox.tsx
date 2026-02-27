import { CheckCircle2 } from 'lucide-react';
import { MatchStatus } from '@/types';
import codeItIcon from '@/assets/icons/Code_IT.ico';
import eanIcon from '@/assets/icons/EAN.ico';
import { PendingHourglassIcon } from './PendingHourglassIcon';
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
  label: string;
  kind: 'lucide' | 'asset' | 'emoji' | 'pending-hourglass';
  color?: string;
  src?: string;
  emoji?: string;
}> = {
  pending:       { label: 'folgt', kind: 'pending-hourglass' },
  'full-match':  { label: 'match', kind: 'lucide', color: '#22C55E' },
  'code-it-only':{ label: 'Code-IT', kind: 'asset', src: codeItIcon },
  'ean-only':    { label: 'EAN', kind: 'asset', src: eanIcon },
  'no-match':    { label: 'fail', kind: 'emoji', emoji: '\u274C' },
};

export function StatusCheckbox({ status, onClick }: StatusCheckboxProps) {
  const config = STATUS_CONFIG[status];

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded p-1 hover:bg-muted/50 transition-colors"
            onClick={onClick}
          >
            {config.kind === 'lucide' && (
              <CheckCircle2 className="h-5 w-5" style={{ color: config.color }} />
            )}
            {config.kind === 'asset' && config.src && (
              <img src={config.src} alt="" aria-hidden="true" className="h-5 w-5" />
            )}
            {config.kind === 'pending-hourglass' && (
              <PendingHourglassIcon sizeClass="w-5 h-5 text-[14px]" withCircle />
            )}
            {config.kind === 'emoji' && (
              <span aria-hidden="true" className="text-[16px] leading-none">{config.emoji}</span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>{config.label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
