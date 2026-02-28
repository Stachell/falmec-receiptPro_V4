import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface CopyableTextProps {
  value: string | null | undefined;
  className?: string;
  placeholderClassName?: string;
  placeholderValues?: string[];
}

const DEFAULT_PLACEHOLDERS = ['--', 'fehlt'];
const COPIED_TIMEOUT_MS = 1500;

export function CopyableText({
  value,
  className,
  placeholderClassName,
  placeholderValues,
}: CopyableTextProps) {
  const [isCopied, setIsCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const normalized = useMemo(() => (value ?? '').trim(), [value]);
  const lower = normalized.toLowerCase();
  const blocked = useMemo(
    () => new Set((placeholderValues ?? DEFAULT_PLACEHOLDERS).map((v) => v.trim().toLowerCase())),
    [placeholderValues]
  );
  const isCopyable = normalized.length > 0 && !blocked.has(lower);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    if (!isCopyable) return;
    try {
      await navigator.clipboard.writeText(normalized);
      setIsCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setIsCopied(false), COPIED_TIMEOUT_MS);
    } catch {
      // Intentionally silent (KISS): no global toast/noise.
    }
  };

  const title = isCopied ? 'Kopiert!' : undefined;
  const visualClass = isCopyable
    ? cn('cursor-pointer hover:underline', isCopied && 'text-green-600')
    : placeholderClassName;

  return (
    <span title={title} className={cn(className, visualClass)} onClick={handleCopy}>
      {normalized}
    </span>
  );
}

