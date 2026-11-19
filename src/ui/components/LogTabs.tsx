/**
 * The tabbed view of a selected log (REQ-NAV-10…14).
 *
 * Positions are supplied by the screen rather than loaded here, so that
 * Export can reach them without an await inside the tap handler.
 */

import { useState } from 'preact/hooks';
import type { Fix, LogMeta, Units } from '../../core/types';
import { ElevationTab } from './ElevationTab';
import { MapTab } from './MapTab';
import { StatisticsPanel } from './StatisticsPanel';

export type LogTab = 'statistics' | 'map' | 'elevation';

const TABS: Array<{ id: LogTab; label: string }> = [
  { id: 'statistics', label: 'Statistics' },
  { id: 'map', label: 'Map' },
  { id: 'elevation', label: 'Elevation' },
];

interface LogTabsProps {
  log: LogMeta | null;
  fixes: readonly Fix[];
  loading: boolean;
  units: Units;
}

export function LogTabs({ log, fixes, loading, units }: LogTabsProps) {
  const [tab, setTab] = useState<LogTab>('statistics');

  if (!log) {
    return (
      <section class="log-detail">
        <StatisticsPanel stats={null} units={units} caption={null} />
      </section>
    );
  }

  return (
    <section class="log-detail" aria-label={`Log ${log.name}`}>
      <div class="tabs" role="tablist">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            class={`tab${tab === id ? ' is-active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div class="tab-panel" role="tabpanel">
        {tab === 'statistics' && (
          <StatisticsPanel
            stats={log.stats}
            units={units}
            caption={`${log.name} · ${log.pointCount} points`}
          />
        )}

        {tab === 'map' &&
          (loading ? (
            <p class="muted tab-empty">Loading positions…</p>
          ) : (
            <MapTab fixes={fixes} />
          ))}

        {tab === 'elevation' &&
          (loading ? (
            <p class="muted tab-empty">Loading positions…</p>
          ) : (
            <ElevationTab fixes={fixes} units={units} />
          ))}
      </div>
    </section>
  );
}
