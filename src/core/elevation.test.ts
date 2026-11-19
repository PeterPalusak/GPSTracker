import { describe, expect, it } from 'vitest';
import { buildElevationProfile, thinProfile } from './elevation';
import { fixAt, straightRun } from './testFixtures';

describe('buildElevationProfile (REQ-NAV-13)', () => {
  it('plots altitude against distance travelled', () => {
    const fixes = [
      fixAt(0, 0, 0, { alt: 100 }),
      fixAt(1, 1000, 10, { alt: 110 }),
      fixAt(2, 2000, 20, { alt: 120 }),
    ];
    const profile = buildElevationProfile(fixes)!;

    expect(profile.points).toHaveLength(3);
    expect(profile.points[0]!.distance).toBe(0);
    expect(profile.points[2]!.distance).toBeCloseTo(20, 0);
    expect(profile.points[2]!.altitude).toBe(120);
  });

  it('reports the extremes and where they are', () => {
    const fixes = [
      fixAt(0, 0, 0, { alt: 100 }),
      fixAt(1, 1000, 10, { alt: 180 }),
      fixAt(2, 2000, 20, { alt: 90 }),
    ];
    const profile = buildElevationProfile(fixes)!;

    expect(profile.minAlt).toBe(90);
    expect(profile.maxAlt).toBe(180);
    expect(profile.minIndex).toBe(2);
    expect(profile.maxIndex).toBe(1);
  });

  it('returns null when no fix carries an altitude (REQ-GPS-7)', () => {
    expect(buildElevationProfile(straightRun(20, 10))).toBeNull();
  });

  it('returns null for a single altitude, which is not a profile', () => {
    const fixes = [fixAt(0, 0, 0, { alt: 100 }), fixAt(1, 1000, 10, { alt: null })];
    expect(buildElevationProfile(fixes)).toBeNull();
  });

  it('returns null for an empty log', () => {
    expect(buildElevationProfile([])).toBeNull();
  });

  it('keeps accumulating distance across fixes with no altitude', () => {
    // The gap must widen the step, not pull later points leftwards.
    const fixes = [
      fixAt(0, 0, 0, { alt: 100 }),
      fixAt(1, 1000, 10, { alt: null }),
      fixAt(2, 2000, 20, { alt: null }),
      fixAt(3, 3000, 30, { alt: 130 }),
    ];
    const profile = buildElevationProfile(fixes)!;

    expect(profile.points).toHaveLength(2);
    expect(profile.points[1]!.distance).toBeCloseTo(30, 0);
  });

  it('reports total distance over every fix, not just the plotted ones', () => {
    const fixes = [
      fixAt(0, 0, 0, { alt: 100 }),
      fixAt(1, 1000, 10, { alt: 110 }),
      fixAt(2, 2000, 20, { alt: null }),
    ];
    expect(buildElevationProfile(fixes)!.totalDistance).toBeCloseTo(20, 0);
  });

  it('copes with a track that never moves', () => {
    const fixes = [
      fixAt(0, 0, 0, { alt: 100 }),
      fixAt(1, 1000, 0, { alt: 102 }),
      fixAt(2, 2000, 0, { alt: 101 }),
    ];
    const profile = buildElevationProfile(fixes)!;

    expect(profile.totalDistance).toBeCloseTo(0, 1);
    expect(profile.points).toHaveLength(3);
  });

  it('handles a flat profile where min equals max', () => {
    const fixes = [
      fixAt(0, 0, 0, { alt: 200 }),
      fixAt(1, 1000, 10, { alt: 200 }),
      fixAt(2, 2000, 20, { alt: 200 }),
    ];
    const profile = buildElevationProfile(fixes)!;
    expect(profile.minAlt).toBe(profile.maxAlt);
  });
});

describe('thinProfile', () => {
  const fixes = Array.from({ length: 5_000 }, (_, i) =>
    fixAt(i, i * 1000, i * 10, { alt: 100 + Math.sin(i / 100) * 50 }),
  );

  it('leaves a short profile alone', () => {
    const profile = buildElevationProfile(fixes.slice(0, 50))!;
    expect(thinProfile(profile, 400)).toHaveLength(50);
  });

  it('reduces a long profile', () => {
    const profile = buildElevationProfile(fixes)!;
    const thinned = thinProfile(profile, 400);
    expect(thinned.length).toBeLessThanOrEqual(404); // budget plus the kept extremes
    expect(thinned.length).toBeGreaterThan(300);
  });

  it('keeps the extremes, so the chart agrees with the statistics panel', () => {
    const profile = buildElevationProfile(fixes)!;
    const thinned = thinProfile(profile, 100);

    const altitudes = thinned.map((p) => p.altitude);
    expect(Math.min(...altitudes)).toBeCloseTo(profile.minAlt, 6);
    expect(Math.max(...altitudes)).toBeCloseTo(profile.maxAlt, 6);
  });

  it('returns points in distance order', () => {
    const profile = buildElevationProfile(fixes)!;
    const thinned = thinProfile(profile, 200);
    const distances = thinned.map((p) => p.distance);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });
});
