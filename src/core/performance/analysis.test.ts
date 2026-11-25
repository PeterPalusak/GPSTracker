/**
 * Performance analysis against synthetic profiles with known answers
 * (REQ-ACC-133, REQ-ACC-134). The profiles are built from a speed function,
 * so the expected times can be worked out by hand.
 */

import { describe, expect, it } from 'vitest';
import { fixAt } from '../testFixtures';
import type { Fix } from '../types';
import { analysePerformance, type PhaseResult } from './analysis';
import { kmhToMps } from './constants';
import { firstReadyAt } from './readiness';
import { buildSeries, windowedAccel } from './series';

const DT = 0.2; // 5 Hz

/** Fixes sampled from a speed profile, positions integrated along the track. */
function track(speedAt: (t: number) => number, duration: number): Fix[] {
  const fixes: Fix[] = [];
  let north = 0;
  for (let i = 0; i * DT <= duration + 1e-9; i++) {
    const t = i * DT;
    const v = speedAt(t);
    fixes.push(fixAt(i, Math.round(t * 1000), north, { spd: v, acc: 4 }));
    north += v * DT;
  }
  return fixes;
}

function standingPhase(phases: PhaseResult[]): PhaseResult {
  const found = phases.find((p) => p.standingStart);
  expect(found).toBeDefined();
  return found!;
}

/** Standing start, constant 3 m/s², flat-out after 50 m/s. Time zero is 1.1667 s. */
const standingStart = (t: number): number => (t < 1 ? 0 : Math.min(3 * (t - 1), 50));

/** Stationary, 3 m/s² to 40 m/s, 3 s cruise, then 8 m/s² to a stop. */
const brakingRun = (t: number): number => {
  if (t < 2) return 0;
  if (t < 2 + 40 / 3) return 3 * (t - 2);
  if (t < 2 + 40 / 3 + 3) return 40;
  return Math.max(0, 40 - 8 * (t - (2 + 40 / 3 + 3)));
};

describe('standing start', () => {
  const result = analysePerformance(track(standingStart, 25), 'motorcycle');
  const phase = standingPhase(result.phases);

  it('finds one standing-start phase', () => {
    expect(result.phases).toHaveLength(1);
    expect(phase.standingStart).toBe(true);
    expect(phase.peakSpeed).toBeCloseTo(50, 0);
  });

  it('measures 0–100 km/h from time zero (the standstill crossing)', () => {
    // Speed reaches 27.78 m/s at t = 10.26 s; time zero is 1.1667 s.
    expect(phase.targets['0-100kmh'].status).toBe('measured');
    expect(phase.targets['0-100kmh'].time).toBeGreaterThan(9.0);
    expect(phase.targets['0-100kmh'].time).toBeLessThan(9.2);
  });

  it('measures 1/4 mile time and trap speed from integrated distance', () => {
    // 1.5·(t−1)² − 1.5·(t0−1)² = 402.336 gives t ≈ 17.378 s, so 16.21 s from time zero.
    const quarter = phase.targets['1/4'];
    expect(quarter.status).toBe('measured');
    expect(quarter.time).toBeGreaterThan(16.1);
    expect(quarter.time).toBeLessThan(16.3);
    expect(quarter.trapSpeed!).toBeGreaterThan(48.8);
    expect(quarter.trapSpeed!).toBeLessThan(49.4);
  });

  it('reports the 1/8 mile and the distance marks in order', () => {
    const eighth = phase.targets['1/8'].time!;
    const quarter = phase.targets['1/4'].time!;
    const fourHundred = phase.targets['400m'].time!;
    const thousand = phase.targets['1000m'];
    expect(eighth).toBeLessThan(quarter);
    expect(quarter).toBeLessThanOrEqual(fourHundred + 0.05);
    // Acceleration stops at 50 m/s, about 418 m in. The phase ends there, so
    // 1000 m is not reached within a pure acceleration (REQ-ACC-4).
    expect(thousand.status).toBe('not-reached');
  });

  it('does not measure rolling windows that the phase cannot show', () => {
    expect(phase.targets['roll-30-80'].status).toBe('measured');
  });
});

describe('rolling windows', () => {
  // Already moving at 5 m/s, then 3 m/s² to 40 m/s: no standstill, so not a standing start.
  const rolling = (t: number): number => {
    if (t < 2) return 5;
    return Math.min(5 + 3 * (t - 2), 40);
  };
  const result = analysePerformance(track(rolling, 16), 'motorcycle');
  const phase = result.phases[0]!;

  it('is not a standing start, so standing-start targets do not apply', () => {
    expect(phase.standingStart).toBe(false);
    expect(phase.targets['0-100kmh'].status).toBe('not-applicable');
    expect(phase.targets['1/4'].status).toBe('not-applicable');
  });

  it('times each window between its two crossings', () => {
    // Each 22.22 m/s window (8.33→22.22, 13.89→27.78, 22.22→36.11) takes 4.63 s at 3 m/s².
    expect(phase.targets['roll-30-80'].time!).toBeCloseTo(4.63, 1);
    expect(phase.targets['roll-50-100'].time!).toBeCloseTo(4.63, 1);
    expect(phase.targets['roll-80-130'].time!).toBeCloseTo(4.63, 1);
  });
});

describe('gear dips', () => {
  it('keeps a short dip inside the phase (one phase)', () => {
    // A 0.5 s flat spot is shorter than the 1 s allowance.
    const profile = (t: number): number => {
      if (t < 1) return 0;
      if (t < 4) return 3 * (t - 1);
      if (t < 4.5) return 9;
      return Math.min(9 + 3 * (t - 4.5), 40);
    };
    const result = analysePerformance(track(profile, 14), 'motorcycle');
    expect(result.phases).toHaveLength(1);
  });

  it('ends the phase on a dip longer than the allowance, and starts a new one', () => {
    // A 2 s flat spot is longer than the 1 s allowance.
    const profile = (t: number): number => {
      if (t < 1) return 0;
      if (t < 6) return Math.min(3 * (t - 1), 15);
      if (t < 8) return 15;
      return Math.min(15 + 3 * (t - 8), 40);
    };
    const result = analysePerformance(track(profile, 16), 'motorcycle');
    expect(result.phases).toHaveLength(2);
    expect(result.phases[0]!.standingStart).toBe(true);
    expect(result.phases[1]!.standingStart).toBe(false);
  });
});

describe('braking events', () => {
  const result = analysePerformance(track(brakingRun, 26), 'motorcycle');
  const byTarget = (kmh: number) => result.brakings.find((b) => b.targetKmh === kmh)!;

  it('reports one event for each braking target from the same stop', () => {
    expect(result.brakings.map((b) => b.targetKmh)).toEqual([130, 100, 80, 50]);
  });

  it('times 130–0 km/h from the crossing to standstill', () => {
    // (36.11 − 0.5) / 8 = 4.45 s
    expect(byTarget(130).duration).toBeCloseTo(4.45, 1);
    expect(byTarget(100).duration).toBeCloseTo(3.41, 1);
    expect(byTarget(80).duration).toBeCloseTo(2.72, 1);
    expect(byTarget(50).duration).toBeCloseTo(1.67, 1);
  });

  it('measures the braking distance by integrating speed', () => {
    // (36.11² − 0.5²) / (2 · 8) = 81.5 m
    expect(byTarget(130).distance).toBeGreaterThan(80.5);
    expect(byTarget(130).distance).toBeLessThan(82.5);
  });

  it('reports the maximum and average deceleration', () => {
    expect(byTarget(130).maxDecel).toBeCloseTo(8, 0);
    // Mean deceleration is about 8 m/s² across the event (the profile's
    // clamp at zero bends the last sample segment slightly).
    expect(byTarget(130).avgDecel).toBeCloseTo((kmhToMps(130) - 0.5) / 4.45, 0);
  });

  it('gives negative G on the chart for braking', () => {
    const series = byTarget(130).series;
    expect(series.length).toBeGreaterThan(0);
    expect(series.every((p) => p.y <= 0.01)).toBe(true);
  });

  it('starts the braking event from actual braking, not from anything else', () => {
    // The event begins at the downward crossing; the cruise before it is not braking.
    expect(byTarget(130).originT).toBeGreaterThan(0);
    // The chart starts at the first sample after the origin, within one 5 Hz sample.
    expect(byTarget(130).series[0]!.x).toBeLessThan(0.25);
  });
});

describe('braking interrupted by re-acceleration', () => {
  it('does not report an event that rises again for longer than the allowance', () => {
    // Brake from 40 m/s to 25 m/s, then accelerate again, then stop.
    const profile = (t: number): number => {
      if (t < 2) return 40;
      if (t < 4) return 40 - 7.5 * (t - 2);
      if (t < 7) return 25 + 3 * (t - 4);
      return Math.max(0, 34 - 8 * (t - 7));
    };
    const result = analysePerformance(track(profile, 14), 'motorcycle');
    expect(result.brakings.map((b) => b.targetKmh)).not.toContain(130);
    expect(result.summary.interruptedBraking).toBeGreaterThan(0);
  });
});

describe('readiness and flags', () => {
  it('reaches Ready after five seconds of precise fixes', () => {
    const fixes = track(standingStart, 10);
    expect(firstReadyAt(fixes)).toBe(fixes[0]!.t + 5000);
  });

  it('flags a start that happens before Ready', () => {
    const result = analysePerformance(track(standingStart, 25), 'motorcycle');
    expect(standingPhase(result.phases).flags).toContain('before-ready');
  });

  it('drops fixes less accurate than the exclusion limit, and counts them', () => {
    const fixes = track(standingStart, 5).map((f, i) => (i === 3 ? { ...f, acc: 15 } : f));
    const { samples, excludedAccuracy } = buildSeries(fixes);
    expect(excludedAccuracy).toBe(1);
    expect(samples.length).toBe(fixes.length - 1);
  });
});

describe('windowed acceleration', () => {
  it('recovers a constant acceleration on a one-hertz track', () => {
    const fixes = Array.from({ length: 10 }, (_, i) =>
      fixAt(i, i * 1000, 0, { spd: 2 * i, acc: 4 }),
    );
    const { samples } = buildSeries(fixes);
    const accel = windowedAccel(samples);
    for (const a of accel.slice(1, -1)) expect(a).toBeCloseTo(2, 6);
  });
});
