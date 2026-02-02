import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KPITileProps {
  value: number | string;
  label: string;
  icon?: ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  subValue?: string;
  className?: string;
  variant?: 'default' | 'success' | 'warning' | 'error';
}

const variantStyles = {
  default: 'border-border',
  success: 'border-l-4 border-l-status-ok border-t-0 border-r-0 border-b-0',
  warning: 'border-l-4 border-l-status-soft-fail border-t-0 border-r-0 border-b-0',
  error: 'border-l-4 border-l-status-failed border-t-0 border-r-0 border-b-0',
};

export function KPITile({ 
  value, 
  label, 
  icon, 
  trend, 
  subValue, 
  className,
  variant = 'default' 
}: KPITileProps) {
  return (
    <div className={cn('kpi-tile', variantStyles[variant], className)}>
      <div className="flex items-center justify-between">
        <span className="kpi-tile-value">{value}</span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <div className="flex items-center gap-2">
        <span className="kpi-tile-label">{label}</span>
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
        <span className="text-xs text-muted-foreground mt-1">{subValue}</span>
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
