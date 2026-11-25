/**
 * Export of performance measurements (Accelleration_Requirements.MD §7.1).
 *
 * A performance log is exported as one image per event: its chart and its
 * figures, and nothing else. The GPX and KML of a route log are not used here.
 *
 * Built as SVG text so that it can be tested without a browser. The PNG
 * conversion happens in the platform layer.
 *
 * Units are SI (metres, seconds, G), like the other exports (REQ-EXP-10).
 */

import type { PerformanceResults, PhaseResult, BrakingResult, ChartPoint } from './analysis';
import { G_MPS2 } from './constants';

export type EventKind = 'acceleration' | 'deceleration';

export interface EventChart {
  kind: EventKind;
  title: string;
  series: ChartPoint[];
  figures: Array<{ label: string; value: string }>;
}

/** Figures for an acceleration event (REQ-ACC-161). */
export function accelerationChart(phase: PhaseResult, title: string): EventChart {
  return {
    kind: 'acceleration',
    title,
    series: phase.series,
    figures: [
      { label: 'Time', value: `${phase.duration.toFixed(2)} s` },
      { label: 'Distance', value: `${phase.distance.toFixed(1)} m` },
      { label: 'Average acceleration', value: `${(phase.avgAccel / G_MPS2).toFixed(2)} G` },
      { label: 'Maximum acceleration', value: `${(phase.peakAccel / G_MPS2).toFixed(2)} G` },
    ],
  };
}

/** Figures for a deceleration event (REQ-ACC-162). */
export function decelerationChart(event: BrakingResult, title: string): EventChart {
  return {
    kind: 'deceleration',
    title,
    series: event.series,
    figures: [
      { label: 'Time', value: `${event.duration.toFixed(2)} s` },
      { label: 'Distance', value: `${event.distance.toFixed(1)} m` },
      { label: 'Maximum deceleration', value: `${(event.maxDecel / G_MPS2).toFixed(2)} G` },
      { label: 'Average deceleration', value: `${(event.avgDecel / G_MPS2).toFixed(2)} G` },
    ],
  };
}

/** The chart for the event at `index` of an analysed log, or null. */
export function eventChart(
  results: PerformanceResults,
  kind: EventKind,
  index: number,
  logName: string,
): EventChart | null {
  if (kind === 'acceleration') {
    const phase = results.phases[index];
    if (!phase) return null;
    const label = phase.standingStart ? 'standing start' : 'rolling start';
    return accelerationChart(phase, `${logName} · acceleration ${index + 1} (${label})`);
  }
  const event = results.brakings[index];
  if (!event) return null;
  return decelerationChart(event, `${logName} · braking from ${event.targetKmh} km/h`);
}

/** File name for one event's image (REQ-EXP-2 style). */
export function eventFileName(logName: string, kind: EventKind, index: number): string {
  return `${logName}-${kind}-${index + 1}.png`;
}

const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Pick a y-axis step that gives roughly five gridlines. */
export function niceStep(range: number): number {
  const raw = range / 5;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const nice = n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10;
  return nice * pow;
}

export const EXPORT_WIDTH = 1200;
export const EXPORT_HEIGHT = 800;

/**
 * The chart and figures as one SVG document.
 *
 * Positive G for acceleration and negative G for deceleration, so the sign
 * of the chart says what kind of event it is (D15).
 */
export function chartSvg(chart: EventChart): string {
  const W = EXPORT_WIDTH;
  const H = EXPORT_HEIGHT;
  const pad = { top: 120, right: 60, bottom: 200, left: 120 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const xs = chart.series.map((p) => p.x);
  const ys = chart.series.map((p) => p.y);
  const xMax = Math.max(1, ...xs);
  // Always show zero, so the sign reads at a glance.
  const yHi = Math.max(0.1, ...ys);
  const yLo = Math.min(-0.1, ...ys);
  const yStep = niceStep(yHi - yLo);
  const yTop = Math.ceil(yHi / yStep) * yStep;
  const yBottom = Math.floor(yLo / yStep) * yStep;

  const x = (s: number) => pad.left + (s / xMax) * plotW;
  const y = (g: number) => pad.top + ((yTop - g) / (yTop - yBottom)) * plotH;

  const grid: string[] = [];
  for (let g = yBottom; g <= yTop + yStep / 2; g += yStep) {
    const yy = y(g);
    const isZero = Math.abs(g) < yStep / 2;
    grid.push(
      `<line x1="${pad.left}" x2="${W - pad.right}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}" stroke="${isZero ? '#55606e' : '#d8dde4'}" stroke-width="${isZero ? 2 : 1}"/>`,
      `<text x="${pad.left - 12}" y="${(yy + 6).toFixed(1)}" text-anchor="end" font-size="22" fill="#55606e">${g.toFixed(1)}</text>`,
    );
  }

  const xStep = niceStep(xMax);
  const ticks: string[] = [];
  for (let s = 0; s <= xMax + xStep / 2; s += xStep) {
    ticks.push(
      `<text x="${x(s).toFixed(1)}" y="${H - pad.bottom + 34}" text-anchor="middle" font-size="22" fill="#55606e">${s.toFixed(xStep < 1 ? 1 : 0)}</text>`,
    );
  }

  const line = chart.series
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.x).toFixed(1)},${y(p.y).toFixed(1)}`)
    .join(' ');
  const colour = chart.kind === 'acceleration' ? '#1f7a5a' : '#b5462f';

  // Figures in a two-by-two grid under the chart.
  const figureRows = chart.figures.map((f, i) => {
    const left = 120 + (i % 2) * (W / 2 - 40);
    const top = H - 88 + Math.floor(i / 2) * 44;
    return `<text x="${left}" y="${top}" font-size="26" fill="#2a3340"><tspan font-weight="700">${esc(f.label)}: </tspan>${esc(f.value)}</text>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif">
<rect width="${W}" height="${H}" fill="#ffffff"/>
<text x="${pad.left}" y="62" font-size="34" font-weight="700" fill="#1b2430">${esc(chart.title)}</text>
<text x="${pad.left}" y="98" font-size="22" fill="#55606e">${chart.kind === 'acceleration' ? 'Acceleration (G)' : 'Deceleration (G)'} against time (s)</text>
${grid.join('\n')}
${ticks.join('\n')}
<text x="${W - pad.right}" y="${H - pad.bottom + 68}" text-anchor="end" font-size="22" fill="#55606e">time (s)</text>
<text x="${pad.left}" y="${pad.top - 24}" font-size="22" fill="#55606e">G</text>
<path d="${line}" fill="none" stroke="${colour}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
${figureRows.join('\n')}
</svg>`;
}
