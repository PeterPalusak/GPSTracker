/**
 * Loading a log's recorded positions.
 *
 * Lifted above the tabs so that Export has the points already in memory.
 * `navigator.share` must be called from within a user gesture, and an
 * await between the tap and the call can lose it — so the data has to be
 * there before the button is pressed, not fetched when it is.
 */

import { useEffect, useState } from 'preact/hooks';
import type { Fix, LogMeta } from '../core/types';
import type { LogRepository } from '../data/logRepository';

export interface UseLogPointsResult {
  fixes: Fix[];
  loading: boolean;
}

export function useLogPoints(
  repository: LogRepository,
  log: LogMeta | null,
): UseLogPointsResult {
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!log) {
      setFixes([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      const points = await repository.readPoints(log.id);
      if (cancelled) return;
      setFixes(points);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [repository, log]);

  return { fixes, loading };
}
