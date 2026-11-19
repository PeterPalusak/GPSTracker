import { describe, expect, it } from 'vitest';
import type { LatLon } from './geo';
import { simplify, simplifyToBudget } from './simplify';
import { METRES_PER_DEG_LAT } from './testFixtures';

/** A point `north` metres north and `east` metres east of the origin. */
const at = (north: number, east = 0): LatLon => ({
  lat: 48 + north / METRES_PER_DEG_LAT,
  lon: 17 + east / (METRES_PER_DEG_LAT * Math.cos((48 * Math.PI) / 180)),
});

describe('simplify', () => {
  it('leaves a two-point track alone', () => {
    const points = [at(0), at(100)];
    expect(simplify(points, 10)).toHaveLength(2);
  });

  it('always keeps the first and last point', () => {
    const points = Array.from({ length: 50 }, (_, i) => at(i * 10));
    const result = simplify(points, 50);
    expect(result[0]).toEqual(points[0]);
    expect(result[result.length - 1]).toEqual(points[points.length - 1]);
  });

  it('collapses a straight line to its endpoints', () => {
    const points = Array.from({ length: 100 }, (_, i) => at(i * 10));
    expect(simplify(points, 5)).toHaveLength(2);
  });

  it('keeps a corner that exceeds the tolerance', () => {
    // An L: straight north, then straight east.
    const points = [at(0), at(50), at(100), at(100, 50), at(100, 100)];
    const result = simplify(points, 5);
    expect(result).toHaveLength(3); // start, corner, end
  });

  it('drops a wobble smaller than the tolerance', () => {
    const points = [at(0), at(50, 1), at(100)];
    expect(simplify(points, 10)).toHaveLength(2);
  });

  it('keeps a deviation larger than the tolerance', () => {
    const points = [at(0), at(50, 40), at(100)];
    expect(simplify(points, 10)).toHaveLength(3);
  });

  it('returns the original objects, not copies', () => {
    const points = [at(0), at(50, 40), at(100)];
    expect(simplify(points, 10)[1]).toBe(points[1]);
  });

  it('handles an empty track', () => {
    expect(simplify([], 10)).toEqual([]);
  });

  it('handles repeated identical points', () => {
    const points = [at(0), at(0), at(0), at(0)];
    expect(simplify(points, 5)).toHaveLength(2);
  });

  it('does not blow the stack on a long track', () => {
    // A three-hour ride at 1 Hz, which a recursive implementation can
    // overflow on in the worst case.
    const points = Array.from({ length: 10_800 }, (_, i) =>
      at(i * 10, Math.sin(i / 50) * 30),
    );
    expect(() => simplify(points, 5)).not.toThrow();
  });
});

describe('simplifyToBudget (REQ-NAV-19)', () => {
  it('leaves a track already under budget untouched', () => {
    const points = Array.from({ length: 100 }, (_, i) => at(i * 10, Math.sin(i) * 20));
    expect(simplifyToBudget(points, 2_000)).toHaveLength(100);
  });

  it('brings a long winding track under budget', () => {
    const points = Array.from({ length: 10_800 }, (_, i) =>
      at(i * 10, Math.sin(i / 20) * 50),
    );
    const result = simplifyToBudget(points, 2_000);
    expect(result.length).toBeLessThanOrEqual(2_000);
    expect(result.length).toBeGreaterThan(1);
  });

  it('keeps the start and end of the ride', () => {
    const points = Array.from({ length: 5_000 }, (_, i) => at(i * 10, Math.sin(i / 10) * 40));
    const result = simplifyToBudget(points, 500);
    expect(result[0]).toEqual(points[0]);
    expect(result[result.length - 1]).toEqual(points[points.length - 1]);
  });

  it('preserves the overall shape', () => {
    // The simplified track must still span the same ground.
    const points = Array.from({ length: 4_000 }, (_, i) => at(i * 5, Math.sin(i / 30) * 60));
    const result = simplifyToBudget(points, 300);

    const lats = result.map((p) => p.lat);
    expect(Math.min(...lats)).toBeCloseTo(Math.min(...points.map((p) => p.lat)), 4);
    expect(Math.max(...lats)).toBeCloseTo(Math.max(...points.map((p) => p.lat)), 4);
  });
});
