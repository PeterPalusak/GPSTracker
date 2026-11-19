import { describe, expect, it } from 'vitest';
import { haversine, impliedSpeed } from './geo';

describe('haversine', () => {
  it('is zero for identical points', () => {
    expect(haversine({ lat: 48.148, lon: 17.107 }, { lat: 48.148, lon: 17.107 })).toBe(0);
  });

  it('measures one degree of latitude as ~111.2 km', () => {
    const d = haversine({ lat: 48, lon: 17 }, { lat: 49, lon: 17 });
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_400);
  });

  it('is symmetric', () => {
    const a = { lat: 48.148, lon: 17.107 };
    const b = { lat: 48.21, lon: 17.33 };
    expect(haversine(a, b)).toBeCloseTo(haversine(b, a), 9);
  });

  it('shrinks a degree of longitude with latitude', () => {
    const atEquator = haversine({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
    const atFifty = haversine({ lat: 50, lon: 0 }, { lat: 50, lon: 1 });
    expect(atFifty).toBeLessThan(atEquator);
    expect(atFifty / atEquator).toBeCloseTo(Math.cos((50 * Math.PI) / 180), 2);
  });

  it('handles the antimeridian without blowing up', () => {
    const d = haversine({ lat: 0, lon: 179.999 }, { lat: 0, lon: -179.999 });
    expect(d).toBeLessThan(300);
  });

  it('resolves metre-scale separations', () => {
    // ~1 m north. Matters because consecutive fixes are metres apart.
    const d = haversine({ lat: 48, lon: 17 }, { lat: 48 + 1 / 111_194.9, lon: 17 });
    expect(d).toBeCloseTo(1, 1);
  });
});

describe('impliedSpeed', () => {
  it('derives speed from displacement over time', () => {
    const a = { lat: 48, lon: 17, t: 0 };
    const b = { lat: 48 + 10 / 111_194.9, lon: 17, t: 1000 };
    expect(impliedSpeed(a, b)).toBeCloseTo(10, 1);
  });

  it('returns null for a zero or negative interval', () => {
    const a = { lat: 48, lon: 17, t: 1000 };
    expect(impliedSpeed(a, { ...a, t: 1000 })).toBeNull();
    expect(impliedSpeed(a, { ...a, t: 500 })).toBeNull();
  });
});
