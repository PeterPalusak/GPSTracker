/**
 * Results of one performance log, for one kind of event (Accelleration_Requirements.MD §6, §7, §7.1).
 *
 * Acceleration: one column per phase, one row per target. Deceleration: one
 * row per braking event. The best value in each row is marked. Tick events to
 * overlay them on the chart; pick one to see its figures and export its image.
 *
 * The parent keys this component on the log and the kind, so selection starts
 * fresh for each.
 */

import { useEffect, useMemo, useState } from 'preact/hooks';
import { G_MPS2 } from '../../core/performance/constants';
import { ACCEL_TARGETS } from '../../core/performance/targets';
import {
  chartSvg,
  eventChart,
  eventFileName,
  EXPORT_HEIGHT,
  EXPORT_WIDTH,
  type EventKind,
} from '../../core/performance/export';
import {
  FLAG_LABELS,
  type BrakingResult,
  type PerformanceResults,
  type PhaseResult,
  type TargetResult,
} from '../../core/performance/analysis';
import { formatSpeed } from '../../core/format';
import type { ExportFile } from '../../core/export';
import type { LogMeta, Units } from '../../core/types';
import { svgToPng } from '../../platform/chartPng';
import type { Sharer, ShareOutcome } from '../../platform/Sharer';
import { PerformanceChart, type ChartSeries } from './PerformanceChart';

const COLOURS = ['#1f7a5a', '#3987e5', '#b5462f', '#8a5cc2', '#c98a12', '#2b8ea3'];

export function KindTabs({ value, onChange }: { value: EventKind; onChange: (k: EventKind) => void }) {
  const tabs: Array<{ id: EventKind; label: string }> = [
    { id: 'acceleration', label: 'Acceleration' },
    { id: 'deceleration', label: 'Deceleration' },
  ];
  return (
    <div class="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          class={`tab${value === t.id ? ' is-active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

interface PerformancePanelProps {
  log: LogMeta | null;
  results: PerformanceResults | null;
  loading: boolean;
  kind: EventKind;
  units: Units;
  /** Null where sharing is not offered. */
  sharer: Sharer | null;
}

export function PerformancePanel({ log, results, loading, kind, sharer }: PerformancePanelProps) {
  const [active, setActive] = useState<number | null>(null);
  const [shown, setShown] = useState<number[]>([]);
  const [png, setPng] = useState<Uint8Array | null>(null);
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null);

  const chart = useMemo(
    () => (log && results && active !== null ? eventChart(results, kind, active, log.name) : null),
    [log, results, kind, active],
  );

  // Render the PNG as soon as an event is picked, so Share can call the share
  // sheet directly from the tap (see LogListScreen on the user gesture).
  useEffect(() => {
    setPng(null);
    setOutcome(null);
    if (!chart) return;
    let cancelled = false;
    void svgToPng(chartSvg(chart), EXPORT_WIDTH, EXPORT_HEIGHT)
      .then((bytes) => {
        if (!cancelled) setPng(bytes);
      })
      .catch(() => {
        if (!cancelled) setPng(null);
      });
    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (!log) return <p class="muted tab-empty">Choose a performance log to see its results.</p>;
  if (loading || !results) return <p class="muted tab-empty">Analysing…</p>;

  const toggleShown = (index: number) =>
    setShown((list) => (list.includes(index) ? list.filter((i) => i !== index) : [...list, index]));

  const pick = (index: number) => {
    setActive(index);
    setShown((list) => (list.includes(index) ? list : [...list, index]));
  };

  const plotted = [...new Set([...shown, ...(active !== null ? [active] : [])])].sort((a, b) => a - b);
  const series: ChartSeries[] = plotted.map((index, i) => {
    const data = kind === 'acceleration' ? results.phases[index]?.series : results.brakings[index]?.series;
    return {
      key: `${kind}-${index}`,
      label: kind === 'acceleration' ? `Acceleration ${index + 1}` : `Braking from ${results.brakings[index]?.targetKmh} km/h`,
      colour: COLOURS[i % COLOURS.length]!,
      points: data ?? [],
    };
  });

  const handleExport = () => {
    if (!sharer || !png || !log || active === null) return;
    const file: ExportFile = {
      name: eventFileName(log.name, kind, active),
      mimeType: 'image/png',
      text: '',
      bytes: png,
    };
    void sharer.share(file).then(setOutcome);
  };

  const summary = results.summary;

  return (
    <div class="perf-panel">
      <p class="perf-summary muted">
        {results.phases.length} acceleration {results.phases.length === 1 ? 'phase' : 'phases'} ·{' '}
        {results.brakings.length} braking {results.brakings.length === 1 ? 'event' : 'events'}
        {summary.interruptedBraking > 0 && ` · ${summary.interruptedBraking} braking interrupted`}
        {` · ${summary.excludedAccuracy} fixes dropped for accuracy`}
        {` · ${results.readyAt === null ? 'Ready never reached' : 'Ready reached'}`}
      </p>

      {kind === 'acceleration' ? (
        <AccelerationTable
          phases={results.phases}
          shown={shown}
          active={active}
          onPick={pick}
          onToggle={toggleShown}
        />
      ) : (
        <BrakingTable
          events={results.brakings}
          shown={shown}
          active={active}
          onPick={pick}
          onToggle={toggleShown}
        />
      )}

      {plotted.length > 0 && (
        <PerformanceChart
          series={series}
          caption={
            kind === 'acceleration'
              ? 'Acceleration in G against time, positive. Time zero is the start of each phase.'
              : 'Deceleration in G against time, negative. Time zero is the crossing of the target speed.'
          }
        />
      )}

      {chart && (
        <section class="perf-figures" aria-label="Figures for the selected event">
          <h3>{chart.title}</h3>
          <dl>
            {chart.figures.map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
          <FlagList flags={activeFlags(results, kind, active)} />
          {sharer && (
            <div class="export-bar">
              <button type="button" class="btn btn-export" disabled={!png} onClick={handleExport}>
                {png ? 'Share as PNG' : 'Preparing image…'}
              </button>
              {outcome && (
                <span class="export-note muted">
                  {outcome === 'shared' && 'Handed to the share sheet.'}
                  {outcome === 'downloaded' && 'Downloaded.'}
                  {outcome === 'failed' && 'Export failed.'}
                </span>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function activeFlags(results: PerformanceResults, kind: EventKind, active: number | null) {
  if (active === null) return [];
  return kind === 'acceleration'
    ? (results.phases[active]?.flags ?? [])
    : (results.brakings[active]?.flags ?? []);
}

function FlagList({ flags }: { flags: readonly (keyof typeof FLAG_LABELS)[] }) {
  if (flags.length === 0) return <p class="perf-flags-ok muted">Valid: no flags on this event.</p>;
  return (
    <ul class="perf-flags" aria-label="Validity flags">
      {flags.map((f) => (
        <li key={f}>{FLAG_LABELS[f]}</li>
      ))}
    </ul>
  );
}

// --- Acceleration -----------------------------------------------------------

function speedPair(mps: number): string {
  const kmh = formatSpeed(mps, 'km');
  const mph = formatSpeed(mps, 'mi');
  return `${kmh.value} km/h · ${mph.value} mph`;
}

function cellText(target: TargetResult, distance: boolean): string {
  if (target.status === 'not-applicable') return '—';
  if (target.status === 'not-reached') return 'not reached';
  let text = `${target.time!.toFixed(2)} s`;
  if (distance && target.trapSpeed !== null) text += `\n${speedPair(target.trapSpeed)}`;
  return text;
}

function AccelerationTable({
  phases,
  shown,
  active,
  onPick,
  onToggle,
}: {
  phases: PhaseResult[];
  shown: number[];
  active: number | null;
  onPick: (i: number) => void;
  onToggle: (i: number) => void;
}) {
  if (phases.length === 0) {
    return <p class="muted tab-empty">No acceleration reached 10 km/h in this log.</p>;
  }

  // Best (shortest) time per target across the phases that measured it.
  const best = new Map<string, number>();
  for (const def of ACCEL_TARGETS) {
    let min: number | null = null;
    for (const p of phases) {
      const t = p.targets[def.id];
      if (t?.status === 'measured' && t.time !== null && (min === null || t.time < min)) min = t.time;
    }
    if (min !== null) best.set(def.id, min);
  }

  return (
    <div class="viz-table-wrap perf-table-wrap">
      <table class="viz-table perf-table">
        <thead>
          <tr>
            <th scope="col">Measurement</th>
            {phases.map((p, i) => (
              <th key={p.key} scope="col" class={active === i ? 'is-active' : undefined}>
                <label class="perf-overlay">
                  <input type="checkbox" checked={shown.includes(i)} onChange={() => onToggle(i)} aria-label={`Overlay acceleration ${i + 1}`} />
                </label>
                <button type="button" class="link-btn" onClick={() => onPick(i)} aria-pressed={active === i}>
                  #{i + 1} {p.standingStart ? 'standing' : 'rolling'}
                </button>
                <span class="muted perf-peak">peak {formatG(p.peakAccel)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ACCEL_TARGETS.map((def) => (
            <tr key={def.id}>
              <th scope="row">{def.label}</th>
              {phases.map((p) => {
                const t = p.targets[def.id]!;
                const isBest = t.status === 'measured' && t.time !== null && best.get(def.id) === t.time;
                return (
                  <td key={p.key} class={isBest ? 'is-best' : undefined}>
                    <span class="perf-cell">{cellText(t, def.group === 'distance')}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p class="muted perf-note">
        Times run from time zero, the standstill crossing. Rolling windows are timed between their two speeds.
        Distances are integrated from speed. Trap speeds are shown in both km/h and mph.
      </p>
    </div>
  );
}

// --- Deceleration -----------------------------------------------------------

function BrakingTable({
  events,
  shown,
  active,
  onPick,
  onToggle,
}: {
  events: BrakingResult[];
  shown: number[];
  active: number | null;
  onPick: (i: number) => void;
  onToggle: (i: number) => void;
}) {
  if (events.length === 0) {
    return (
      <p class="muted tab-empty">
        No braking to a stop from 130, 100, 80 or 50 km/h in this log.
      </p>
    );
  }

  const bestTime = Math.min(...events.map((e) => e.duration));
  const bestDistance = Math.min(...events.map((e) => e.distance));

  return (
    <div class="viz-table-wrap perf-table-wrap">
      <table class="viz-table perf-table">
        <thead>
          <tr>
            <th scope="col">Overlay</th>
            <th scope="col">From</th>
            <th scope="col">Time</th>
            <th scope="col">Distance</th>
            <th scope="col">Max</th>
            <th scope="col">Average</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e, i) => (
            <tr key={e.key} class={active === i ? 'is-active' : undefined}>
              <td>
                <input type="checkbox" checked={shown.includes(i)} onChange={() => onToggle(i)} aria-label={`Overlay braking from ${e.targetKmh} km/h`} />
              </td>
              <td>
                <button type="button" class="link-btn" onClick={() => onPick(i)} aria-pressed={active === i}>
                  {e.targetKmh} km/h → 0
                </button>
              </td>
              <td class={e.duration === bestTime ? 'is-best' : undefined}>{e.duration.toFixed(2)} s</td>
              <td class={e.distance === bestDistance ? 'is-best' : undefined}>{e.distance.toFixed(1)} m</td>
              <td>{formatG(e.maxDecel)}</td>
              <td>{formatG(e.avgDecel)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p class="muted perf-note">
        Each event runs from the crossing of its speed to standstill. Best time and best distance are marked.
      </p>
    </div>
  );
}

function formatG(mps2: number): string {
  return `${(mps2 / G_MPS2).toFixed(2)} G`;
}
