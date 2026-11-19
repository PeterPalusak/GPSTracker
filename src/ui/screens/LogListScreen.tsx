/**
 * The list of logs (requirements §4.1).
 *
 * The list scrolls in the upper area; the selected log is shown in the
 * dedicated area at the bottom (REQ-NAV-4). That area becomes tabbed —
 * Statistics, Map, Elevation profile — in Phase 6; for now it shows the
 * statistics tab's content directly.
 */

import { useCallback, useEffect, useState } from 'preact/hooks';
import { useLogs } from '../../app/useLogs';
import type { LogMeta, Units } from '../../core/types';
import type { LogRepository } from '../../data/logRepository';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { LogList } from '../components/LogList';
import { LogTabs } from '../components/LogTabs';

interface LogListScreenProps {
  repository: LogRepository;
  units: Units;
  /** Bumped by the shell when a recording ends, to refresh the list. */
  revision: number;
  onLogsChanged: () => void;
}

export function LogListScreen({
  repository,
  units,
  revision,
  onLogsChanged,
}: LogListScreenProps) {
  const { logs, loading, reload } = useLogs(repository, revision);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<LogMeta | null>(null);

  // Select the newest log on arrival, so the panel is never blank when
  // there is something to show.
  useEffect(() => {
    if (selectedId === null && logs.length > 0) setSelectedId(logs[0]!.id);
  }, [logs, selectedId]);

  const selected = logs.find((log) => log.id === selectedId) ?? null;

  const confirmDelete = useCallback(async () => {
    const log = pendingDelete;
    setPendingDelete(null);
    if (!log) return;

    await repository.deleteLog(log.id);
    // Clear the selection if it was the log just removed.
    if (log.id === selectedId) setSelectedId(null);
    await reload();
    onLogsChanged();
  }, [pendingDelete, repository, selectedId, reload, onLogsChanged]);

  return (
    <div class="screen">
      <div class="log-list-wrap">
        {loading ? (
          <p class="muted log-list-loading">Loading…</p>
        ) : (
          <LogList
            logs={logs}
            selectedId={selectedId}
            units={units}
            onSelect={(log) => setSelectedId(log.id)}
            onDelete={(log) => setPendingDelete(log)}
          />
        )}
      </div>

      <LogTabs log={selected} repository={repository} units={units} />

      {pendingDelete && (
        <ConfirmDialog
          title={`Delete “${pendingDelete.name}”?`}
          message="The log and every position in it will be deleted. This cannot be undone."
          confirmLabel="Delete"
          onConfirm={() => void confirmDelete()}
          onDismiss={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
