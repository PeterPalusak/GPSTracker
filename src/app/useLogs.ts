/**
 * Loading the stored logs for the list screen.
 */

import { useCallback, useEffect, useState } from 'preact/hooks';
import type { LogMeta } from '../core/types';
import type { LogRepository } from '../data/logRepository';

export interface UseLogsResult {
  logs: LogMeta[];
  loading: boolean;
  reload: () => Promise<void>;
}

/**
 * All finished and unfinished logs, newest first.
 *
 * A log still being recorded is deliberately excluded: it is not a
 * recorded ride yet, and listing it would offer a Delete button that
 * would pull the log out from under the running recorder.
 */
export function useLogs(repository: LogRepository, revision: number): UseLogsResult {
  const [logs, setLogs] = useState<LogMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const all = await repository.listLogs();
    setLogs(all.filter((log) => log.status !== 'recording'));
    setLoading(false);
  }, [repository]);

  useEffect(() => {
    void reload();
  }, [reload, revision]);

  return { logs, loading, reload };
}
