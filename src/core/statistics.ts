/**
 * Statistics (REQ-STAT-4…19).
 *
 * Accumulated incrementally — O(1) per fix — rather than recomputed over a
 * growing array once per second. `finalise` turns an accumulator plus the
 * log's pause intervals into the nine displayed metrics.
 *
 * Deliberately unfiltered, per REQ-GEN-3 and REQ-STAT-19:
 *   - no stationary deadband, so drift inflates distance (trap T3, accepted)
 *   - no altitude smoothing, so noise inflates gain/drop (trap T1, accepted)
 *   - no outlier rejection on speed (trap T2, accepted)
 * Cleaning up is left to other tools. Changing any of this means changing
 * the requirements first.
 */

import { haversine, impliedSpeed } from './geo';
import type { Fix, PauseInterval, Stats } from './types';

/** At or above this speed the device counts as moving (REQ-STAT-16). */
export const MOVING_THRESHOLD_MPS = 0.5;

export interface StatsAccumulator {
  distance: number;
  movingTime: number;
  maxSpeed: number;
  minAlt: number | null;
  maxAlt: number | null;
  gain: number;
  drop: number;
  /** Previous fix, for distance and interval timing. */
  prev: Fix | null;
  /**
   * Previous *non-null* altitude, which is not necessarily `prev.alt`.
   * Fixes without an altitude are skipped rather than treated as zero
   * (REQ-GPS-7), so the comparison must reach back past them.
   */
  prevAlt: number | null;
  count: number;
}

export function createAccumulator(): StatsAccumulator {
  return {
    distance: 0,
    movingTime: 0,
    maxSpeed: 0,
    minAlt: null,
    maxAlt: null,
    gain: 0,
    drop: 0,
    prev: null,
    prevAlt: null,
    count: 0,
  };
}

/**
 * Speed at a fix: the device's own value where it has one (REQ-GPS-5),
 * otherwise derived from the previous position. Negative or NaN values
 * from the device are treated as absent.
 */
function speedAt(fix: Fix, prev: Fix | null): number | null {
  if (fix.spd !== null && Number.isFinite(fix.spd) && fix.spd >= 0) {
    return fix.spd;
  }
  return prev ? impliedSpeed(prev, fix) : null;
}

/** Fold one fix into the accumulator. Must be called in `seq` order. */
export function addFix(acc: StatsAccumulator, fix: Fix): void {
  const { prev } = acc;

  if (prev) {
    acc.distance += haversine(prev, fix);

    const dt = fix.t - prev.t;
    if (dt > 0) {
      const speed = speedAt(fix, prev);
      if (speed !== null && speed >= MOVING_THRESHOLD_MPS) {
        acc.movingTime += dt;
      }
    }
  }

  const speed = speedAt(fix, prev);
  if (speed !== null && speed > acc.maxSpeed) {
    acc.maxSpeed = speed;
  }

  if (fix.alt !== null && Number.isFinite(fix.alt)) {
    acc.minAlt = acc.minAlt === null ? fix.alt : Math.min(acc.minAlt, fix.alt);
    acc.maxAlt = acc.maxAlt === null ? fix.alt : Math.max(acc.maxAlt, fix.alt);

    if (acc.prevAlt !== null) {
      const d = fix.alt - acc.prevAlt;
      if (d > 0) acc.gain += d;
      else acc.drop += -d;
    }
    acc.prevAlt = fix.alt;
  }

  acc.prev = fix;
  acc.count += 1;
}

/** Total milliseconds spent paused, clamping any still-open interval to `now`. */
export function pausedDuration(pauses: readonly PauseInterval[], now: number): number {
  let total = 0;
  for (const p of pauses) {
    const to = p.to ?? now;
    if (to > p.from) total += to - p.from;
  }
  return total;
}

export interface FinaliseOptions {
  startedAt: number;
  /** End of the log, or `now` for a log still in progress. */
  endedAt: number;
  pauses: readonly PauseInterval[];
}

/**
 * Produce the displayed statistics.
 *
 * Overall time excludes paused intervals (REQ-STAT-15), so average speed
 * (REQ-STAT-17) is distance over *recording* time, not wall-clock.
 */
export function finalise(acc: StatsAccumulator, opts: FinaliseOptions): Stats {
  const wall = Math.max(0, opts.endedAt - opts.startedAt);
  const paused = pausedDuration(opts.pauses, opts.endedAt);
  const overallTime = Math.max(0, wall - paused);

  const seconds = overallTime / 1000;
  const avgSpeed = seconds > 0 ? acc.distance / seconds : 0;

  return {
    distance: acc.distance,
    overallTime,
    // Guard against a moving interval that straddles a pause boundary.
    movingTime: Math.min(acc.movingTime, overallTime),
    avgSpeed,
    maxSpeed: acc.maxSpeed,
    minAlt: acc.minAlt,
    maxAlt: acc.maxAlt,
    gain: acc.gain,
    drop: acc.drop,
  };
}

/**
 * Rebuild an accumulator from stored fixes.
 *
 * Used when re-attaching to a recording that continued while the UI was
 * dead (REQ-BG-12), and for any finished log with no cached statistics.
 */
export function accumulate(fixes: Iterable<Fix>): StatsAccumulator {
  const acc = createAccumulator();
  for (const fix of fixes) addFix(acc, fix);
  return acc;
}

/** Convenience: statistics for a complete set of fixes in one call. */
export function computeStats(fixes: Iterable<Fix>, opts: FinaliseOptions): Stats {
  return finalise(accumulate(fixes), opts);
}

/** The statistics of a log with no fixes at all (REQ-STAT-14 empty state). */
export function emptyStats(): Stats {
  return finalise(createAccumulator(), { startedAt: 0, endedAt: 0, pauses: [] });
}
