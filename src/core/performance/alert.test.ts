/**
 * The wanted-speed alert (REQ-ACC-145…147, REQ-ACC-155, REQ-ACC-156).
 */

import { describe, expect, it } from 'vitest';
import { kmhToMps } from './constants';
import { WantedSpeedAlert } from './alert';
import { ReadinessTracker } from './readiness';

describe('wanted-speed alert', () => {
  it('fires once when the speed reaches the wanted speed', () => {
    const alert = new WantedSpeedAlert();
    alert.setTarget(kmhToMps(130));
    const fired: number[] = [];
    for (let i = 0; i < 10; i++) {
      const v = kmhToMps(120 + i * 2);
      if (alert.consider(i * 1000, v)) fired.push(i);
    }
    expect(fired).toHaveLength(1);
  });

  it('does not fire when Off', () => {
    const alert = new WantedSpeedAlert();
    alert.setTarget(null);
    expect(alert.consider(0, kmhToMps(200))).toBe(false);
  });

  it('does not refire while speed hovers around the target', () => {
    const alert = new WantedSpeedAlert();
    alert.setTarget(kmhToMps(100));
    expect(alert.consider(0, kmhToMps(99))).toBe(false);
    expect(alert.consider(1000, kmhToMps(101))).toBe(true);
    // Dropping 2 km/h is inside the 5 km/h hysteresis, so it stays fired.
    expect(alert.consider(2000, kmhToMps(99))).toBe(false);
    expect(alert.consider(3000, kmhToMps(101))).toBe(false);
  });

  it('re-arms after speed falls clearly below the target', () => {
    const alert = new WantedSpeedAlert();
    alert.setTarget(kmhToMps(100));
    expect(alert.consider(0, kmhToMps(101))).toBe(true);
    expect(alert.consider(1000, kmhToMps(90))).toBe(false); // 10 km/h below: re-armed
    expect(alert.consider(2000, kmhToMps(101))).toBe(true);
  });

  it('re-arms on standstill', () => {
    const alert = new WantedSpeedAlert();
    alert.setTarget(kmhToMps(50));
    expect(alert.consider(0, kmhToMps(50))).toBe(true);
    alert.consider(1000, 0);
    expect(alert.consider(2000, kmhToMps(50))).toBe(true);
  });

  it('fires early when the acceleration will carry the speed past the target', () => {
    const alert = new WantedSpeedAlert();
    alert.setTarget(kmhToMps(100));
    // 1 Hz fixes: 90 km/h then 97 km/h. At ~7 km/h/s the next second reaches 100.
    alert.consider(0, kmhToMps(90));
    // Speed is still below the target, but acceleration predicts it past.
    expect(alert.consider(1000, kmhToMps(97))).toBe(true);
  });

  it('changing the wanted speed re-arms the alert', () => {
    const alert = new WantedSpeedAlert();
    alert.setTarget(kmhToMps(100));
    expect(alert.consider(0, kmhToMps(101))).toBe(true);
    alert.setTarget(kmhToMps(80));
    expect(alert.consider(1000, kmhToMps(81))).toBe(true);
  });
});

describe('readiness tracker', () => {
  const fix = (t: number, acc: number, spd: number | null = 10) => ({ t, acc, spd });

  it('is ready after five seconds of precise fixes', () => {
    const r = new ReadinessTracker();
    for (let t = 0; t < 5000; t += 1000) expect(r.consider(fix(t, 4))).toBe(false);
    expect(r.consider(fix(5000, 4))).toBe(true);
    expect(r.readyAt).toBe(5000);
  });

  it('needs a reported speed', () => {
    const r = new ReadinessTracker();
    for (let t = 0; t <= 10_000; t += 1000) r.consider(fix(t, 3, null));
    expect(r.isReady).toBe(false);
  });

  it('drops out of Ready after more than three seconds of poor accuracy', () => {
    const r = new ReadinessTracker();
    for (let t = 0; t <= 5000; t += 1000) r.consider(fix(t, 4));
    expect(r.isReady).toBe(true);
    r.consider(fix(6000, 12));
    r.consider(fix(8000, 12));
    expect(r.isReady).toBe(true);
    r.consider(fix(10_000, 12));
    expect(r.isReady).toBe(false);
  });

  it('rejects a network-provider fix where the provider is reported', () => {
    const r = new ReadinessTracker();
    for (let t = 0; t <= 6000; t += 1000) {
      r.consider({ t, acc: 4, spd: 10, provider: 'network' });
    }
    expect(r.isReady).toBe(false);
  });
});
