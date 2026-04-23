/**
 * useQaSamples — PROJ-50 Test-Arena
 *
 * React hook around qaSamplesService with isActive sentinel (S.B-TA1).
 * Guards against stale setState after popup close / tab switch / unmount.
 */

import { useEffect, useState, useCallback } from 'react';
import { qaSamplesService, type QaSampleSummary } from '@/services/qaSamplesService';

interface UseQaSamplesOptions {
  enabled: boolean;
}

interface UseQaSamplesResult {
  samples: QaSampleSummary[];
  totalBytes: number;
  isLoading: boolean;
  error: Error | null;
  reload: () => void;
}

export function useQaSamples({ enabled }: UseQaSamplesOptions): UseQaSamplesResult {
  const [samples, setSamples] = useState<QaSampleSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let isActive = true;
    setLoading(true);
    qaSamplesService
      .loadAllSummaries()
      .then((list) => {
        if (!isActive) return;
        setSamples(list);
        setError(null);
      })
      .catch((err: unknown) => {
        if (isActive) setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (isActive) setLoading(false);
      });
    return () => {
      isActive = false;
    };
  }, [enabled, bump]);

  const reload = useCallback(() => setBump((n) => n + 1), []);
  const totalBytes = samples.reduce((sum, s) => sum + s.sizeEstimateBytes, 0);

  return { samples, totalBytes, isLoading: loading, error, reload };
}
