import { useRef, useState, useCallback } from 'react';
import { useRunStore } from '@/store/runStore';

/**
 * useClickLock – verhindert Mehrfachklicks für die konfigurierte Sperrzeit.
 *
 * Verwendung:
 *   const { wrap, isLocked } = useClickLock();
 *   <button onClick={wrap('btn-id', handler)} disabled={isLocked('btn-id')} />
 *
 * Die Sperrzeit wird aus globalConfig.clickLockSeconds gelesen (0 = deaktiviert).
 */
export function useClickLock() {
  const lockMs = useRunStore((s) => (s.globalConfig.clickLockSeconds ?? 0) * 1000);
  const lockedRef = useRef<Set<string>>(new Set());
  const [, forceUpdate] = useState(0);

  const wrap = useCallback(
    (key: string, fn: () => void | Promise<void>) =>
      async () => {
        if (lockMs <= 0) {
          await fn();
          return;
        }
        if (lockedRef.current.has(key)) return;
        lockedRef.current.add(key);
        forceUpdate((n) => n + 1);
        try {
          await fn();
        } finally {
          setTimeout(() => {
            lockedRef.current.delete(key);
            forceUpdate((n) => n + 1);
          }, lockMs);
        }
      },
    [lockMs]
  );

  const isLocked = useCallback(
    (key: string) => lockMs > 0 && lockedRef.current.has(key),
    [lockMs]
  );

  return { wrap, isLocked };
}
