import { describe, expect, it } from 'vitest';
import {
  MOVING_THRESHOLD_MPS,
  addFix,
  computeStats,
  createAccumulator,
  emptyStats,
  finalise,
  pausedDuration,
} from './statistics';
import { T0, fixAt, stationary, straightRun } from './testFixtures';
import type { PauseInterval } from './types';

const noPauses: PauseInterval[] = [];

/** Finalise over the span the fixtures actually cover. */
const over = (ms: number, pauses: readonly PauseInterval[] = noPauses) => ({
  startedAt: T0,
  endedAt: T0 + ms,
  pauses,
});

describe('distance (REQ-STAT-4)', () => {
  it('sums the gaps between consecutive fixes', () => {
    // 11 fixes, 1 s apart, 10 m/s → 10 intervals → 100 m.
    const stats = computeStats(straightRun(11, 10), over(10_000));
    expect(stats.distance).toBeCloseTo(100, 1);
  });

  it('is zero for a single fix', () => {
    expect(computeStats([fixAt(0, 0, 0)], over(0)).distance).toBe(0);
  });

  it('is zero for no fixes at all (REQ-STAT-14)', () => {
    expect(computeStats([], over(0)).distance).toBe(0);
  });
});

describe('moving time (REQ-STAT-6, REQ-STAT-16)', () => {
  it('counts intervals at or above the threshold', () => {
    const stats = computeStats(straightRun(11, 10), over(10_000));
    expect(stats.movingTime).toBe(10_000);
  });

  it('excludes intervals below the threshold', () => {
    const stats = computeStats(stationary(11), over(10_000));
    expect(stats.movingTime).toBe(0);
  });

  it('includes a speed of exactly the threshold', () => {
    const stats = computeStats(straightRun(2, MOVING_THRESHOLD_MPS), over(1000));
    expect(stats.movingTime).toBe(1000);
  });

  it('excludes a speed just below the threshold', () => {
    const stats = computeStats(straightRun(2, MOVING_THRESHOLD_MPS - 0.01), over(1000));
    expect(stats.movingTime).toBe(0);
  });

  it('never exceeds overall time', () => {
    const stats = computeStats(straightRun(11, 10), over(5_000));
    expect(stats.movingTime).toBeLessThanOrEqual(stats.overallTime);
  });
});

describe('overall time and pauses (REQ-STAT-5, REQ-STAT-15)', () => {
  it('is wall-clock when nothing was paused', () => {
    expect(computeStats(straightRun(11, 10), over(10_000)).overallTime).toBe(10_000);
  });

  it('excludes a closed pause interval', () => {
    const pauses = [{ from: T0 + 2_000, to: T0 + 5_000 }];
    expect(computeStats(straightRun(11, 10), over(10_000, pauses)).overallTime).toBe(7_000);
  });

  it('excludes several pauses', () => {
    const pauses = [
      { from: T0 + 1_000, to: T0 + 2_000 },
      { from: T0 + 4_000, to: T0 + 6_000 },
    ];
    expect(computeStats(straightRun(11, 10), over(10_000, pauses)).overallTime).toBe(7_000);
  });

  it('clamps a still-open pause to the end of the log', () => {
    const pauses = [{ from: T0 + 6_000, to: null }];
    expect(pausedDuration(pauses, T0 + 10_000)).toBe(4_000);
    expect(computeStats(straightRun(11, 10), over(10_000, pauses)).overallTime).toBe(6_000);
  });

  it('never goes negative', () => {
    const pauses = [{ from: T0, to: T0 + 999_999 }];
    expect(computeStats([], over(1_000, pauses)).overallTime).toBe(0);
  });
});

describe('average speed (REQ-STAT-7, REQ-STAT-17)', () => {
  it('is distance over overall time', () => {
    const stats = computeStats(straightRun(11, 10), over(10_000));
    expect(stats.avgSpeed).toBeCloseTo(10, 1);
  });

  it('uses recording time, not wall-clock, so a pause raises it', () => {
    // Same 100 m, but 4 s of the 10 s span was paused → 100 m / 6 s.
    const pauses = [{ from: T0 + 2_000, to: T0 + 6_000 }];
    const stats = computeStats(straightRun(11, 10), over(10_000, pauses));
    expect(stats.avgSpeed).toBeCloseTo(100 / 6, 1);
  });

  it('is zero rather than NaN when no time has elapsed', () => {
    expect(computeStats([], over(0)).avgSpeed).toBe(0);
  });
});

describe('maximum speed (REQ-STAT-8, REQ-STAT-18)', () => {
  it('takes the highest device-reported speed', () => {
    const fixes = [
      fixAt(0, 0, 0, { spd: 10 }),
      fixAt(1, 1000, 10, { spd: 25 }),
      fixAt(2, 2000, 20, { spd: 15 }),
    ];
    expect(computeStats(fixes, over(2_000)).maxSpeed).toBe(25);
  });

  it('falls back to derived speed where the device reports none (REQ-GPS-5)', () => {
    const fixes = [fixAt(0, 0, 0, { spd: null }), fixAt(1, 1000, 30, { spd: null })];
    expect(computeStats(fixes, over(1_000)).maxSpeed).toBeCloseTo(30, 0);
  });

  it('prefers the device value over the derived one', () => {
    // A 300 m jump in 1 s would derive 300 m/s; the device says 12.
    const fixes = [fixAt(0, 0, 0, { spd: 12 }), fixAt(1, 1000, 300, { spd: 12 })];
    expect(computeStats(fixes, over(1_000)).maxSpeed).toBe(12);
  });

  it('ignores negative or non-finite device speeds', () => {
    const fixes = [
      fixAt(0, 0, 0, { spd: -1 }),
      fixAt(1, 1000, 5, { spd: Number.NaN }),
      fixAt(2, 2000, 10, { spd: 7 }),
    ];
    expect(computeStats(fixes, over(2_000)).maxSpeed).toBe(7);
  });
});

describe('altitude (REQ-STAT-10…13, REQ-STAT-19)', () => {
  it('tracks minimum and maximum', () => {
    const fixes = [
      fixAt(0, 0, 0, { alt: 100 }),
      fixAt(1, 1000, 10, { alt: 140 }),
      fixAt(2, 2000, 20, { alt: 90 }),
    ];
    const stats = computeStats(fixes, over(2_000));
    expect(stats.minAlt).toBe(90);
    expect(stats.maxAlt).toBe(140);
  });

  it('sums gain and drop without filtering', () => {
    const fixes = [
      fixAt(0, 0, 0, { alt: 100 }),
      fixAt(1, 1000, 10, { alt: 110 }),
      fixAt(2, 2000, 20, { alt: 105 }),
      fixAt(3, 3000, 30, { alt: 125 }),
    ];
    const stats = computeStats(fixes, over(3_000));
    expect(stats.gain).toBe(30); // +10 then +20
    expect(stats.drop).toBe(5); // -5
  });

  it('accumulates noise, as accepted in trap T1', () => {
    // A flat ride jittering ±2 m produces climb that is not there. This is
    // documented behaviour (REQ-STAT-19), not a defect — assert it so the
    // decision is visible if anyone later "fixes" it.
    const fixes = Array.from({ length: 101 }, (_, i) =>
      fixAt(i, i * 1000, i * 10, { alt: 100 + (i % 2 === 0 ? 2 : -2) }),
    );
    expect(computeStats(fixes, over(100_000)).gain).toBeGreaterThan(150);
  });

  it('reports null extremes when no fix carries an altitude (REQ-GPS-7)', () => {
    const stats = computeStats(straightRun(5, 10), over(4_000));
    expect(stats.minAlt).toBeNull();
    expect(stats.maxAlt).toBeNull();
    expect(stats.gain).toBe(0);
    expect(stats.drop).toBe(0);
  });

  it('skips fixes without altitude rather than treating them as zero (REQ-GPS-7)', () => {
    // 100 → (none) → 120 must be a 20 m gain, not 100 down then 120 up.
    const fixes = [
      fixAt(0, 0, 0, { alt: 100 }),
      fixAt(1, 1000, 10, { alt: null }),
      fixAt(2, 2000, 20, { alt: 120 }),
    ];
    const stats = computeStats(fixes, over(2_000));
    expect(stats.gain).toBe(20);
    expect(stats.drop).toBe(0);
    expect(stats.minAlt).toBe(100);
    expect(stats.maxAlt).toBe(120);
  });
});

describe('stationary drift (trap T3, accepted)', () => {
  it('counts drift as distance, with no deadband', () => {
    // A phone sitting still, wandering 3 m each second with the device
    // reporting no speed. Documented consequence of REQ-GEN-3.
    const fixes = Array.from({ length: 21 }, (_, i) =>
      fixAt(i, i * 1000, i % 2 === 0 ? 0 : 3, { spd: null }),
    );
    expect(computeStats(fixes, over(20_000)).distance).toBeGreaterThan(50);
  });
});

describe('incremental accumulation', () => {
  it('folding one fix at a time matches a single pass', () => {
    const fixes = straightRun(50, 12, { alt: 200 });

    const incremental = createAccumulator();
    for (const fix of fixes) addFix(incremental, fix);

    expect(finalise(incremental, over(49_000))).toEqual(
      computeStats(fixes, over(49_000)),
    );
  });

  it('is unaffected by how fixes are batched (REQ-PLAT-6)', () => {
    // A native source may deliver several fixes at once; the result must
    // not depend on the grouping.
    const fixes = straightRun(30, 8, { alt: 150 });

    const batched = createAccumulator();
    for (let i = 0; i < fixes.length; i += 7) {
      for (const fix of fixes.slice(i, i + 7)) addFix(batched, fix);
    }

    expect(finalise(batched, over(29_000))).toEqual(
      computeStats(fixes, over(29_000)),
    );
  });
});

describe('empty state (REQ-STAT-14)', () => {
  it('produces zeroed statistics', () => {
    const stats = emptyStats();
    expect(stats.distance).toBe(0);
    expect(stats.overallTime).toBe(0);
    expect(stats.movingTime).toBe(0);
    expect(stats.avgSpeed).toBe(0);
    expect(stats.maxSpeed).toBe(0);
    expect(stats.minAlt).toBeNull();
    expect(stats.maxAlt).toBeNull();
  });
});
