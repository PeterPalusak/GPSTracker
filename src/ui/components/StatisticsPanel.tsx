/**
 * The statistics panel (REQ-STAT-1…14).
 *
 * Occupies at least half the screen. The first three metrics are given
 * more weight than the rest — nine equally-sized numbers in this space
 * read as a wall of digits, and distance and time are what a rider glances
 * at. Whether this hierarchy is right is a decision deferred to review
 * once there is something to look at (analysis §9b #2).
 */

import { statisticRows } from '../../core/format';
import type { Stats, Units } from '../../core/types';

interface StatisticsPanelProps {
  stats: Stats | null;
  units: Units;
  /** Name of the log these figures belong to, or null in the empty state. */
  caption: string | null;
}

export function StatisticsPanel({ stats, units, caption }: StatisticsPanelProps) {
  // REQ-STAT-14: no logs means no statistics, not a grid of zeroes.
  if (!stats) {
    return (
      <section class="stats stats-empty">
        <p>No rides recorded yet.</p>
        <p class="muted">Press Start to record one.</p>
      </section>
    );
  }

  const rows = statisticRows(stats, units);
  const primary = rows.slice(0, 3);
  const secondary = rows.slice(3);

  return (
    <section class="stats" aria-label="Statistics">
      {caption && <h2 class="stats-caption">{caption}</h2>}

      <div class="stats-primary">
        {primary.map((row) => (
          <div class="stat stat-large" key={row.label}>
            <span class="stat-value">
              {row.value}
              {row.unit && <span class="stat-unit">{row.unit}</span>}
            </span>
            <span class="stat-label">{row.label}</span>
          </div>
        ))}
      </div>

      <div class="stats-grid">
        {secondary.map((row) => (
          <div class="stat" key={row.label}>
            <span class="stat-value">
              {row.value}
              {row.unit && <span class="stat-unit">{row.unit}</span>}
            </span>
            <span class="stat-label">{row.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
