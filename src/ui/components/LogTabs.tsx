/**
 * The tabbed view of a selected log (REQ-NAV-10…14).
 *
 * Positions are loaded once per log and shared by the Map and Elevation
 * tabs, rather than re-read on every tab switch.
 */

import { useEffect, useState } from 'preact/hooks';
import type { Fix, LogMeta, Units } from '../../core/types';
import type { LogRepository } from '../../data/logRepository';
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
  repository: LogRepository;
  units: Units;
}

export function LogTabs({ log, repository, units }: LogTabsProps) {
  const [tab, setTab] = useState<LogTab>('statistics');
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!log) {
      setFixes([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      const points = await repository.readPoints(log.id);
      if (!cancelled) {
        setFixes(points);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [log, repository]);

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
          (loading ? <p class="muted tab-empty">Loading positions…</p> : <MapTab fixes={fixes} />)}

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
