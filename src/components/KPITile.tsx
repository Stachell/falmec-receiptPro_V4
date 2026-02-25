import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus, CheckCircle2 } from 'lucide-react';

interface KPITileProps {
  value: number | string;
  label: string;
  icon?: ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  subValue?: string;
  className?: string;
  variant?: 'default' | 'success' | 'warning' | 'error';
  /** PROJ-17: KPI-Navigation to Issues-Center */
  onClick?: () => void;
  /** PROJ-29: True wenn alle Double-Check-Bedingungen erfüllt sind */
  isVerified?: boolean;
}

const variantStyles = {
  default: 'border-border',
  success: 'border-l-4 border-b-2 border-l-status-ok border-b-status-ok border-t-0 border-r-0',
  warning: 'border-l-4 border-b-2 border-l-status-soft-fail border-b-status-soft-fail border-t-0 border-r-0',
  error: 'border-l-4 border-b-2 border-l-status-failed border-b-status-failed border-t-0 border-r-0',
};

export function KPITile({
  value,
  label,
  icon,
  trend,
  subValue,
  className,
  variant = 'default',
  onClick,
  isVerified = false,
}: KPITileProps) {
  return (
    <div
      className={cn('kpi-tile', variantStyles[variant], isVerified && 'kpi-tile-verified', className, onClick && 'cursor-pointer hover:opacity-80 transition-opacity')}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <span className={cn('kpi-tile-value', isVerified && 'text-white')}>{value}</span>
        {icon && <span className={cn(isVerified ? 'text-white/70' : 'text-muted-foreground')}>{icon}</span>}
      </div>
      <div className="flex items-center gap-2">
        <span className={cn('kpi-tile-label', isVerified && 'text-emerald-50')}>{label}</span>
        {trend && (
          <span className={cn(
            "flex items-center",
            trend === 'up' && "text-status-ok",
            trend === 'down' && "text-status-failed",
            trend === 'neutral' && "text-muted-foreground"
          )}>
            {trend === 'up' && <TrendingUp className="w-3 h-3" />}
            {trend === 'down' && <TrendingDown className="w-3 h-3" />}
            {trend === 'neutral' && <Minus className="w-3 h-3" />}
          </span>
        )}
      </div>
      {subValue && (
        <div className="flex items-center justify-between mt-1">
          <span className={cn('text-xs', isVerified ? 'text-emerald-50' : 'text-muted-foreground')}>
            {subValue}
          </span>
          {isVerified && (
            <CheckCircle2 className="w-[22px] h-[22px] text-[#46cb78] flex-shrink-0" />
          )}
        </div>
      )}
    </div>
  );
}

interface KPIGridProps {
  children: ReactNode;
  className?: string;
}

export function KPIGrid({ children, className }: KPIGridProps) {
  return (
    <div className={cn(
      "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4",
      className
    )}>
      {children}
    </div>
  );
}
