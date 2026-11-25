/**
 * The list of logs (requirements §4.1).
 *
 * The list scrolls in the upper area; the selected log is shown in the
 * tabbed area at the bottom (REQ-NAV-4, §4.4).
 */

import { useCallback, useEffect, useState } from 'preact/hooks';
import { useLogPoints } from '../../app/useLogPoints';
import { useLogs } from '../../app/useLogs';
import { exportLog } from '../../core/export';
import type { ExportFormat, LogMeta, Units } from '../../core/types';
import type { LogRepository } from '../../data/logRepository';
import type { Sharer, ShareOutcome } from '../../platform/Sharer';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { LogList } from '../components/LogList';
import { LogTabs } from '../components/LogTabs';
import { PerformanceLogView } from '../components/PerformanceLogView';

interface LogListScreenProps {
  repository: LogRepository;
  sharer: Sharer;
  units: Units;
  exportFormat: ExportFormat;
  /** Bumped by the shell when a recording ends, to refresh the list. */
  revision: number;
  onLogsChanged: () => void;
}

export function LogListScreen({
  repository,
  sharer,
  units,
  exportFormat,
  revision,
  onLogsChanged,
}: LogListScreenProps) {
  const { logs, loading, reload } = useLogs(repository, revision);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<LogMeta | null>(null);
  const [exportResult, setExportResult] = useState<ShareOutcome | null>(null);

  // Select the newest log on arrival, so the panel is never blank when
  // there is something to show.
  useEffect(() => {
    if (selectedId === null && logs.length > 0) setSelectedId(logs[0]!.id);
  }, [logs, selectedId]);

  const selected = logs.find((log) => log.id === selectedId) ?? null;
  const { fixes, loading: loadingPoints } = useLogPoints(repository, selected);

  const confirmDelete = useCallback(async () => {
    const log = pendingDelete;
    setPendingDelete(null);
    if (!log) return;

    await repository.deleteLog(log.id);
    if (log.id === selectedId) setSelectedId(null);
    await reload();
    onLogsChanged();
  }, [pendingDelete, repository, selectedId, reload, onLogsChanged]);

  /**
   * Build the file and hand it straight to the share sheet.
   *
   * Deliberately synchronous up to the share call: the positions are
   * already loaded, so no await sits between the tap and `navigator.share`
   * where the user gesture could be lost.
   */
  const handleExport = useCallback(() => {
    if (!selected) return;
    const file = exportLog(selected, fixes, exportFormat);
    void sharer.share(file).then(setExportResult);
  }, [selected, fixes, exportFormat, sharer]);

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
            onSelect={(log) => {
              setSelectedId(log.id);
              setExportResult(null);
            }}
            onDelete={(log) => setPendingDelete(log)}
          />
        )}
      </div>

      {selected && selected.type !== 'performance' && (
        <div class="export-bar">
          <button
            type="button"
            class="btn btn-export"
            disabled={loadingPoints || fixes.length === 0}
            onClick={handleExport}
          >
            {loadingPoints
              ? 'Preparing…'
              : `Share as ${exportFormat.toUpperCase()}`}
          </button>
          {exportResult && (
            <span class="export-note muted">
              {exportResult === 'shared' && 'Handed to the share sheet.'}
              {exportResult === 'downloaded' && 'Downloaded.'}
              {exportResult === 'failed' && 'Export failed.'}
            </span>
          )}
        </div>
      )}

      {selected?.type === 'performance' && (
        <PerformanceLogView
          key={selected.id}
          repository={repository}
          log={selected}
          sharer={sharer}
          units={units}
          onChanged={() => void reload().then(onLogsChanged)}
        />
      )}

      <LogTabs log={selected} fixes={fixes} loading={loadingPoints} units={units} />

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
