import { cn } from '@/lib/utils';

interface PendingHourglassIconProps {
  sizeClass?: string;
  withCircle?: boolean;
}

export function PendingHourglassIcon({
  sizeClass = 'w-5 h-5 text-[14px]',
  withCircle = true,
}: PendingHourglassIconProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative inline-flex items-center justify-center leading-none',
        withCircle && 'rounded-full bg-[#968C8C] text-white',
        sizeClass
      )}
    >
      <span className="leading-none">{'\u231B'}</span>
      <span className="pending-hourglass-overlay absolute inset-0 flex items-center justify-center leading-none">
        {'\u23F3'}
      </span>
    </span>
  );
}
