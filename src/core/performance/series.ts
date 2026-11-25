/**
 * The speed series the performance analysis works on (REQ-ACC-40…43, 77…80).
 *
 * Built once from the stored fixes. Each sample carries the speed to use
 * (device speed where reported, REQ-ACC-78), the distance travelled so far
 * by integrating that speed over time (REQ-ACC-77), and the accuracy used
 * for flags. Fixes less accurate than EXCLUDE_ACCURACY_M are dropped here,
 * and counted, so no later step has to think about them (REQ-ACC-87).
 */

import { impliedSpeed } from '../geo';
import type { Fix } from '../types';
import { EXCLUDE_ACCURACY_M, WINDOW_HALF_MS, G_MPS2 } from './constants';

export interface Sample {
  /** Epoch ms. */
  t: number;
  /** Speed, m/s. */
  v: number;
  /** Cumulative distance from the first sample, metres. */
  d: number;
  /** Horizontal accuracy, metres, or null. */
  acc: number | null;
  /** True where the speed was derived from positions (REQ-ACC-78). */
  derived: boolean;
  /** The fix's own position, kept for rate and gap checks. */
  lat: number;
  lon: number;
}

export interface Series {
  samples: Sample[];
  /** Fixes dropped for poor accuracy (REQ-ACC-87). */
  excludedAccuracy: number;
  /** Fixes dropped because no speed could be obtained for them. */
  noSpeed: number;
}

export function buildSeries(fixes: readonly Fix[]): Series {
  const samples: Sample[] = [];
  let excludedAccuracy = 0;
  let noSpeed = 0;

  let prevFix: Fix | null = null;
  for (const fix of fixes) {
    if (fix.acc !== null && fix.acc > EXCLUDE_ACCURACY_M) {
      excludedAccuracy += 1;
      continue;
    }

    let v: number | null;
    let derived = false;
    if (fix.spd !== null && Number.isFinite(fix.spd) && fix.spd >= 0) {
      v = fix.spd;
    } else {
      v = prevFix ? impliedSpeed(prevFix, fix) : null;
      derived = true;
    }

    if (v === null) {
      noSpeed += 1;
      prevFix = fix;
      continue;
    }

    const prev = samples[samples.length - 1];
    let d = 0;
    if (prev) {
      const dt = (fix.t - prev.t) / 1000;
      d = prev.d + ((prev.v + v) / 2) * Math.max(0, dt);
    }

    samples.push({ t: fix.t, v, d, acc: fix.acc, derived, lat: fix.lat, lon: fix.lon });
    prevFix = fix;
  }

  return { samples, excludedAccuracy, noSpeed };
}

/**
 * Windowed acceleration at each sample, m/s².
 *
 * A centred difference over ±WINDOW_HALF_MS. It always spans at least the
 * neighbouring samples, so a 1 Hz track still gets a value. Null where the
 * series is too short to say.
 */
export function windowedAccel(samples: readonly Sample[]): Array<number | null> {
  const n = samples.length;
  const out: Array<number | null> = new Array(n).fill(null);

  for (let i = 0; i < n; i++) {
    const t = samples[i]!.t;

    let lo = i;
    while (lo > 0 && t - samples[lo - 1]!.t <= WINDOW_HALF_MS) lo--;
    if (lo === i && i > 0) lo = i - 1;

    let hi = i;
    while (hi < n - 1 && samples[hi + 1]!.t - t <= WINDOW_HALF_MS) hi++;
    if (hi === i && i < n - 1) hi = i + 1;

    const dt = (samples[hi]!.t - samples[lo]!.t) / 1000;
    if (dt > 0) out[i] = (samples[hi]!.v - samples[lo]!.v) / dt;
  }

  return out;
}

/** Acceleration in G, for display. */
export const toG = (mps2: number): number => mps2 / G_MPS2;

/**
 * Linear interpolation of the time at which a quantity crosses `target`
 * between two samples. The quantity is `valueOf` evaluated on each sample.
 */
export function interpolateTime(
  a: Sample,
  b: Sample,
  valueOf: (s: Sample) => number,
  target: number,
): number {
  const va = valueOf(a);
  const vb = valueOf(b);
  if (vb === va) return b.t;
  const f = (target - va) / (vb - va);
  return a.t + Math.min(1, Math.max(0, f)) * (b.t - a.t);
}

/** Linear interpolation of any sample field at a given time between two samples. */
export function interpolateAt(
  a: Sample,
  b: Sample,
  valueOf: (s: Sample) => number,
  t: number,
): number {
  if (b.t === a.t) return valueOf(b);
  const f = (t - a.t) / (b.t - a.t);
  return valueOf(a) + f * (valueOf(b) - valueOf(a));
}

/**
 * First index k in (lo, hi] where the speed rises through `target`:
 * v[k-1] < target ≤ v[k]. Null if it never does.
 */
export function firstRisingCrossing(
  samples: readonly Sample[],
  lo: number,
  hi: number,
  target: number,
  valueOf: (s: Sample) => number = (s) => s.v,
): number | null {
  for (let k = Math.max(lo + 1, 1); k <= hi; k++) {
    if (valueOf(samples[k - 1]!) < target && target <= valueOf(samples[k]!)) return k;
  }
  return null;
}

/**
 * Last index k in (lo, hi] where the speed falls through `target`:
 * v[k-1] ≥ target > v[k]. Null if it never does.
 */
export function lastFallingCrossing(
  samples: readonly Sample[],
  lo: number,
  hi: number,
  target: number,
): number | null {
  for (let k = hi; k > lo; k--) {
    if (k - 1 >= 0 && samples[k - 1]!.v >= target && target > samples[k]!.v) return k;
  }
  return null;
}
