/**
 * Synthetic tracks for unit tests.
 *
 * These are deliberately clean — they verify the arithmetic, not the
 * behaviour under real GPS noise. Real recorded rides should be added as
 * fixtures once Phase 0 produces some (Implementation_Plan §6).
 */

import type { Fix } from './types';

export const T0 = Date.UTC(2026, 10, 19, 9, 0, 0); // 2026-11-19T09:00:00Z

/** One degree of latitude in metres, near enough for building fixtures. */
export const METRES_PER_DEG_LAT = 111_194.9;

export interface FixOverrides {
  alt?: number | null;
  spd?: number | null;
  acc?: number | null;
  hdg?: number | null;
}

/**
 * A fix `northMetres` north of the origin at `t`.
 *
 * Moving along a meridian keeps the expected distance trivially
 * calculable, so test assertions stay readable.
 */
export function fixAt(
  seq: number,
  tOffsetMs: number,
  northMetres: number,
  overrides: FixOverrides = {},
): Fix {
  return {
    logId: 'test-log',
    seq,
    t: T0 + tOffsetMs,
    lat: 48 + northMetres / METRES_PER_DEG_LAT,
    lon: 17,
    alt: overrides.alt !== undefined ? overrides.alt : null,
    acc: overrides.acc !== undefined ? overrides.acc : 5,
    spd: overrides.spd !== undefined ? overrides.spd : null,
    hdg: overrides.hdg !== undefined ? overrides.hdg : null,
  };
}

/**
 * A straight run at constant speed, one fix per second.
 * Total distance = speedMps * (count - 1) metres.
 */
export function straightRun(count: number, speedMps: number, opts: FixOverrides = {}): Fix[] {
  return Array.from({ length: count }, (_, i) =>
    fixAt(i, i * 1000, i * speedMps, { spd: speedMps, ...opts }),
  );
}

/** Stationary at the same point — the shape of a traffic-light stop. */
export function stationary(count: number, startSeq = 0, startT = 0): Fix[] {
  return Array.from({ length: count }, (_, i) =>
    fixAt(startSeq + i, startT + i * 1000, 0, { spd: 0 }),
  );
}
