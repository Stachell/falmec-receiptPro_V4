/**
 * PROJ-37 — useCopyToClipboard
 * Extracted from PROJ-36 CopyableText pattern.
 * Returns { isCopied, copy } — copy() is silent on failure (KISS).
 */
import { useEffect, useRef, useState } from 'react';

export function useCopyToClipboard(timeoutMs = 1500) {
  const [isCopied, setIsCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setIsCopied(false), timeoutMs);
    } catch {
      // Intentionally silent (KISS) — no fallback needed for localhost/HTTPS
    }
  };

  return { isCopied, copy };
}
