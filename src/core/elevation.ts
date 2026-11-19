/**
 * The elevation profile series: altitude against distance travelled
 * (REQ-NAV-13).
 *
 * Pure, so the awkward cases — no altitudes at all, altitudes on only
 * part of the ride, a track that never moves — are testable without a
 * browser.
 */

import { haversine } from './geo';
import type { Fix } from './types';

export interface ProfilePoint {
  /** Metres travelled from the start of the log. */
  distance: number;
  /** Metres. */
  altitude: number;
}

export interface ElevationProfile {
  points: ProfilePoint[];
  minAlt: number;
  maxAlt: number;
  totalDistance: number;
  /** Index of the lowest point, for a direct label. */
  minIndex: number;
  /** Index of the highest point, for a direct label. */
  maxIndex: number;
}

/**
 * Build the profile.
 *
 * Distance accumulates over *every* fix, while only fixes carrying an
 * altitude become profile points (REQ-GPS-7). A gap in altitude therefore
 * shows as a longer horizontal step rather than shifting everything after
 * it leftwards.
 *
 * Returns null when nothing can be plotted, so the caller can say so
 * rather than render an empty axis.
 */
export function buildElevationProfile(fixes: readonly Fix[]): ElevationProfile | null {
  const points: ProfilePoint[] = [];
  let distance = 0;
  let prev: Fix | null = null;

  let minAlt = Number.POSITIVE_INFINITY;
  let maxAlt = Number.NEGATIVE_INFINITY;
  let minIndex = 0;
  let maxIndex = 0;

  for (const fix of fixes) {
    if (prev) distance += haversine(prev, fix);
    prev = fix;

    if (fix.alt === null || !Number.isFinite(fix.alt)) continue;

    if (fix.alt < minAlt) {
      minAlt = fix.alt;
      minIndex = points.length;
    }
    if (fix.alt > maxAlt) {
      maxAlt = fix.alt;
      maxIndex = points.length;
    }
    points.push({ distance, altitude: fix.alt });
  }

  // One point draws no line, and a profile of a single height is not a
  // profile. Both are "nothing to plot" as far as the UI is concerned.
  if (points.length < 2) return null;

  return { points, minAlt, maxAlt, totalDistance: distance, minIndex, maxIndex };
}

/**
 * Reduce the profile to at most `maxPoints` by even sampling.
 *
 * The extremes are preserved explicitly: they carry the direct labels,
 * and dropping them would make the chart disagree with the statistics
 * panel's min and max height.
 */
export function thinProfile(
  profile: ElevationProfile,
  maxPoints: number,
): ProfilePoint[] {
  const { points } = profile;
  if (points.length <= maxPoints) return points;

  const step = points.length / maxPoints;
  const keep = new Set<number>([0, points.length - 1, profile.minIndex, profile.maxIndex]);
  for (let i = 0; i < maxPoints; i++) keep.add(Math.floor(i * step));

  return [...keep].sort((a, b) => a - b).map((i) => points[i]!);
}
