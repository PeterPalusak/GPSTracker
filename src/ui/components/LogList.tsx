/**
 * The scrollable list of recorded logs (REQ-NAV-2, REQ-NAV-3).
 *
 * Each row carries its own Delete button (REQ-NAV-8), and logs closed by
 * the recovery process are marked (REQ-NAV-9).
 */

import { formatDistance, formatDuration, formatLogDateTime } from '../../core/format';
import type { LogMeta, Units } from '../../core/types';

interface LogListProps {
  logs: LogMeta[];
  selectedId: string | null;
  units: Units;
  onSelect: (log: LogMeta) => void;
  onDelete: (log: LogMeta) => void;
}

export function LogList({ logs, selectedId, units, onSelect, onDelete }: LogListProps) {
  if (logs.length === 0) {
    return (
      <div class="log-list log-list-empty">
        <p>No rides recorded yet.</p>
        <p class="muted">Recorded rides will appear here.</p>
      </div>
    );
  }

  return (
    <ul class="log-list" aria-label="Recorded logs">
      {logs.map((log) => {
        const distance = formatDistance(log.stats?.distance ?? 0, units);
        const selected = log.id === selectedId;

        return (
          <li key={log.id} class={`log-row${selected ? ' is-selected' : ''}`}>
            <button
              type="button"
              class="log-row-main"
              aria-current={selected ? 'true' : undefined}
              onClick={() => onSelect(log)}
            >
              <span class="log-row-head">
                <span class="log-name">{log.name}</span>
                {log.status === 'unfinished' && (
                  <span class="badge badge-warn" title="Recording was interrupted">
                    unfinished
                  </span>
                )}
              </span>
              <span class="log-row-meta">
                {formatLogDateTime(log.startedAt)} · {distance.value} {distance.unit} ·{' '}
                {formatDuration(log.stats?.overallTime ?? 0)}
              </span>
            </button>

            <button
              type="button"
              class="log-row-delete"
              aria-label={`Delete ${log.name}`}
              onClick={() => onDelete(log)}
            >
              Delete
            </button>
          </li>
        );
      })}
    </ul>
  );
}
