/**
 * Performance exports (REQ-ACC-160…164): the figures and the sign of the chart.
 */

import { describe, expect, it } from 'vitest';
import { fixAt } from '../testFixtures';
import { analysePerformance } from './analysis';
import { chartSvg, eventChart, eventFileName } from './export';

// A standing start to 40 m/s at 3 m/s², then 8 m/s² braking to a stop.
const profile = (t: number): number => {
  if (t < 2) return 0;
  if (t < 2 + 40 / 3) return 3 * (t - 2);
  if (t < 2 + 40 / 3 + 3) return 40;
  return Math.max(0, 40 - 8 * (t - (2 + 40 / 3 + 3)));
};

function fixes() {
  const out = [];
  let north = 0;
  for (let i = 0; i * 0.2 <= 26; i++) {
    const t = i * 0.2;
    const v = profile(t);
    out.push(fixAt(i, Math.round(t * 1000), north, { spd: v, acc: 4 }));
    north += v * 0.2;
  }
  return out;
}

describe('performance exports', () => {
  const results = analysePerformance(fixes(), 'motorcycle');

  it('gives the acceleration figures: time, distance, average and maximum G', () => {
    const chart = eventChart(results, 'acceleration', 0, 'ride')!;
    const labels = chart.figures.map((f) => f.label);
    expect(labels).toEqual(['Time', 'Distance', 'Average acceleration', 'Maximum acceleration']);
    expect(chart.figures[3]!.value).toMatch(/^0\.3\d G$/);
  });

  it('gives the deceleration figures: time, distance, maximum and average G', () => {
    const chart = eventChart(results, 'deceleration', 0, 'ride')!;
    const labels = chart.figures.map((f) => f.label);
    expect(labels).toEqual(['Time', 'Distance', 'Maximum deceleration', 'Average deceleration']);
  });

  it('plots acceleration as positive G and deceleration as negative G', () => {
    const acc = eventChart(results, 'acceleration', 0, 'ride')!;
    const dec = eventChart(results, 'deceleration', 0, 'ride')!;
    expect(acc.series.every((p) => p.y >= -0.01)).toBe(true);
    expect(dec.series.every((p) => p.y <= 0.01)).toBe(true);
  });

  it('writes a self-contained SVG with the figures in it', () => {
    const svg = chartSvg(eventChart(results, 'acceleration', 0, 'ride')!);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('Maximum acceleration: ');
    expect(svg).toContain('<path d="M');
  });

  it('escapes the title', () => {
    const chart = { ...eventChart(results, 'acceleration', 0, 'ride')!, title: 'a <b> & "c"' };
    expect(chartSvg(chart)).toContain('a &lt;b&gt; &amp; &quot;c&quot;');
  });

  it('returns null for an event that does not exist', () => {
    expect(eventChart(results, 'deceleration', 99, 'ride')).toBeNull();
  });

  it('names the file after the log, the kind and the number', () => {
    expect(eventFileName('20261125-0900', 'deceleration', 1)).toBe('20261125-0900-deceleration-2.png');
  });
});
