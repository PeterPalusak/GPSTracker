import { describe, expect, it } from 'vitest';
import { FixRateMeter } from './fixRate';

describe('FixRateMeter (REQ-GPS-6)', () => {
  it('reports nothing before enough fixes have arrived', () => {
    const meter = new FixRateMeter();
    expect(meter.rate(0)).toBeNull();
    meter.mark(0);
    expect(meter.rate(0)).toBeNull();
  });

  it('reads 1 Hz for fixes a second apart', () => {
    const meter = new FixRateMeter();
    for (let t = 0; t <= 5000; t += 1000) meter.mark(t);
    expect(meter.rate(5000)).toBeCloseTo(1, 2);
  });

  it('reads 2 Hz for fixes half a second apart', () => {
    const meter = new FixRateMeter();
    for (let t = 0; t <= 4000; t += 500) meter.mark(t);
    expect(meter.rate(4000)).toBeCloseTo(2, 2);
  });

  it('drops as the signal degrades', () => {
    const meter = new FixRateMeter();
    for (let t = 0; t <= 5000; t += 1000) meter.mark(t);
    const healthy = meter.rate(5000)!;

    const degraded = new FixRateMeter();
    for (let t = 0; t <= 9000; t += 3000) degraded.mark(t);

    expect(degraded.rate(9000)!).toBeLessThan(healthy);
  });

  it('forgets arrivals outside the window', () => {
    const meter = new FixRateMeter();
    for (let t = 0; t <= 3000; t += 1000) meter.mark(t);
    // Long after the last fix, there is nothing recent to average.
    expect(meter.rate(60_000)).toBeNull();
  });

  it('tracks time since the last fix', () => {
    const meter = new FixRateMeter();
    expect(meter.sinceLast(1000)).toBeNull();
    meter.mark(1000);
    expect(meter.sinceLast(4000)).toBe(3000);
  });

  it('clears on reset, as Pause does', () => {
    const meter = new FixRateMeter();
    for (let t = 0; t <= 3000; t += 1000) meter.mark(t);
    meter.reset();
    expect(meter.rate(3000)).toBeNull();
    expect(meter.sinceLast(3000)).toBeNull();
  });
});
