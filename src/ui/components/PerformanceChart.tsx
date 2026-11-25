/**
 * Acceleration or deceleration in G against time (Accelleration_Requirements.MD §7).
 *
 * Hand-rolled SVG, like the elevation profile. Positive G for acceleration and
 * negative for deceleration, so the sign of the chart says what it is (D15).
 * Several events can be overlaid for comparison (REQ-ACC-97). A touch or
 * pointer reads the time and G at that point.
 */

import { useCallback, useMemo, useState } from 'preact/hooks';
import type { ChartPoint } from '../../core/performance/analysis';
import { niceStep } from '../../core/performance/export';

export interface ChartSeries {
  key: string;
  label: string;
  colour: string;
  points: ChartPoint[];
}

const VIEW_W = 1000;
const VIEW_H = 340;
const PAD = { top: 16, right: 16, bottom: 36, left: 56 };

interface PerformanceChartProps {
  series: ChartSeries[];
  /** What the sign means, e.g. "Acceleration (positive G)". */
  caption: string;
}

export function PerformanceChart({ series, caption }: PerformanceChartProps) {
  const [cursor, setCursor] = useState<number | null>(null);

  // Axis bounds land on multiples of the grid step, so the zero line is always drawn.
  const bounds = useMemo(() => {
    const xs = series.flatMap((s) => s.points.map((p) => p.x));
    const ys = series.flatMap((s) => s.points.map((p) => p.y));
    const xMax = Math.max(1, ...xs);
    const rawHi = Math.max(0.1, ...ys);
    const rawLo = Math.min(-0.1, ...ys);
    const step = niceStep(rawHi - rawLo);
    const yHi = Math.ceil(rawHi / step) * step;
    const yLo = Math.floor(rawLo / step) * step;
    return { xMax, yHi, yLo, step };
  }, [series]);

  const x = (s: number) => PAD.left + (s / bounds.xMax) * (VIEW_W - PAD.left - PAD.right);
  const y = (g: number) =>
    PAD.top +
    ((bounds.yHi - g) / (bounds.yHi - bounds.yLo)) * (VIEW_H - PAD.top - PAD.bottom);

  const gridValues = useMemo(() => {
    const values: number[] = [];
    for (let g = bounds.yHi; g >= bounds.yLo - bounds.step / 2; g -= bounds.step) {
      values.push(Math.abs(g) < bounds.step / 2 ? 0 : g);
    }
    return values;
  }, [bounds]);

  const handleMove = useCallback(
    (event: PointerEvent) => {
      const svg = event.currentTarget as SVGSVGElement;
      const rect = svg.getBoundingClientRect();
      const plotX = ((event.clientX - rect.left) / rect.width) * VIEW_W - PAD.left;
      const fraction = Math.max(0, Math.min(1, plotX / (VIEW_W - PAD.left - PAD.right)));
      setCursor(fraction * bounds.xMax);
    },
    [bounds.xMax],
  );

  if (series.every((s) => s.points.length === 0)) {
    return <p class="muted tab-empty">No samples to chart for this event.</p>;
  }

  /** Nearest point of a series to the cursor, in seconds. */
  const readingAt = (s: ChartSeries): ChartPoint | null => {
    if (cursor === null || s.points.length === 0) return null;
    let best = s.points[0]!;
    for (const p of s.points) {
      if (Math.abs(p.x - cursor) < Math.abs(best.x - cursor)) best = p;
    }
    return best;
  };

  const primary = series[0] ? readingAt(series[0]) : null;

  return (
    <div class="viz performance-chart">
      <p class="viz-caption muted">{caption}</p>
      <svg
        class="elevation performance-svg"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${caption}. ${series.map((s) => s.label).join(', ')}`}
        onPointerMove={handleMove}
        onPointerDown={handleMove}
        onPointerLeave={() => setCursor(null)}
      >
        {gridValues.map((g) => (
          <g key={g}>
            <line
              class={Math.abs(g) < 1e-9 ? 'perf-zero' : 'viz-grid'}
              x1={PAD.left}
              x2={VIEW_W - PAD.right}
              y1={y(g)}
              y2={y(g)}
            />
            <text class="viz-tick" x={PAD.left - 8} y={y(g) + 4} text-anchor="end">
              {g.toFixed(1)}
            </text>
          </g>
        ))}

        <text class="viz-tick" x={PAD.left} y={VIEW_H - 8}>
          0 s
        </text>
        <text class="viz-tick" x={VIEW_W - PAD.right} y={VIEW_H - 8} text-anchor="end">
          {bounds.xMax.toFixed(1)} s
        </text>

        {series.map((s) => (
          <path
            key={s.key}
            d={pathFor(s.points, x, y)}
            fill="none"
            stroke={s.colour}
            stroke-width="3"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
        ))}

        {cursor !== null && (
          <line class="elevation-cursor" x1={x(cursor)} x2={x(cursor)} y1={PAD.top} y2={VIEW_H - PAD.bottom} />
        )}
      </svg>

      <ul class="perf-legend">
        {series.map((s) => {
          const reading = readingAt(s);
          return (
            <li key={s.key}>
              <span class="perf-swatch" style={{ background: s.colour }} aria-hidden="true" />
              {s.label}
              {reading && (
                <span class="muted">
                  {' '}
                  · {reading.y.toFixed(2)} G at {reading.x.toFixed(2)} s
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {primary === null && <p class="viz-readout muted">Touch the chart to read a point.</p>}
    </div>
  );
}

function pathFor(
  points: readonly ChartPoint[],
  x: (s: number) => number,
  y: (g: number) => number,
): string {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.x).toFixed(1)},${y(p.y).toFixed(1)}`)
    .join(' ');
}
