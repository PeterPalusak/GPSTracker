/**
 * Track simplification for display (REQ-NAV-19).
 *
 * Display only. The stored log and every exported file keep every
 * recorded position — this exists so that panning a map with 10,000
 * points does not stutter, and must never touch the data itself.
 */

import type { LatLon } from './geo';

/** Rough metres per degree of latitude. Good enough for a display tolerance. */
const M_PER_DEG = 111_194.9;

interface Projected {
  x: number;
  y: number;
}

/**
 * Equirectangular projection to local metres.
 *
 * Over the span of one ride the distortion is negligible, and it makes
 * perpendicular distance a plain 2-D calculation.
 */
function project(points: readonly LatLon[]): Projected[] {
  const lat0 = points.length > 0 ? (points[0]!.lat * Math.PI) / 180 : 0;
  const cos = Math.cos(lat0);
  return points.map((p) => ({ x: p.lon * M_PER_DEG * cos, y: p.lat * M_PER_DEG }));
}

/** Perpendicular distance from `p` to the segment `a`–`b`, in metres. */
function perpendicular(p: Projected, a: Projected, b: Projected): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);

  // Project p onto the segment, clamped to its ends.
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Douglas–Peucker, iterative so a long track cannot blow the stack.
 *
 * Returns the indices of the points to keep, always including the first
 * and last.
 */
function keepIndices(points: Projected[], tolerance: number): number[] {
  if (points.length <= 2) return points.map((_, i) => i);

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: Array<[number, number]> = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let furthest = -1;
    let maxDistance = tolerance;

    for (let i = first + 1; i < last; i++) {
      const d = perpendicular(points[i]!, points[first]!, points[last]!);
      if (d > maxDistance) {
        maxDistance = d;
        furthest = i;
      }
    }

    if (furthest !== -1) {
      keep[furthest] = 1;
      stack.push([first, furthest], [furthest, last]);
    }
  }

  const indices: number[] = [];
  for (let i = 0; i < keep.length; i++) if (keep[i]) indices.push(i);
  return indices;
}

/** Simplify to a metre tolerance, preserving the original objects. */
export function simplify<T extends LatLon>(points: readonly T[], toleranceMetres: number): T[] {
  if (points.length <= 2 || toleranceMetres <= 0) return [...points];
  return keepIndices(project(points), toleranceMetres).map((i) => points[i]!);
}

/**
 * Simplify until the track fits a point budget.
 *
 * Doubles the tolerance until the result fits, starting at 1 m. A ride
 * already under budget is returned untouched, so short tracks keep full
 * fidelity.
 */
export function simplifyToBudget<T extends LatLon>(
  points: readonly T[],
  maxPoints: number,
): T[] {
  if (points.length <= maxPoints) return [...points];

  let tolerance = 1;
  let result = simplify(points, tolerance);

  // 2^20 metres is far larger than any ride; the guard is for safety, not
  // for a case that should ever be reached.
  while (result.length > maxPoints && tolerance < 1_048_576) {
    tolerance *= 2;
    result = simplify(points, tolerance);
  }
  return result;
}
