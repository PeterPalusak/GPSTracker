/**
 * The wanted-speed alert: when to tell the driver to start braking (§8).
 *
 * Runs on each fix as it arrives, so it is live, not part of the analysis.
 * It fires once per approach to the wanted speed. It re-arms when speed
 * falls ALERT_HYSTERESIS below the wanted speed, or when the vehicle stops.
 *
 * It looks ALERT_LEAD_S ahead along the current acceleration, so that GPS
 * delay does not make the alert late (D18). It does not start or change a
 * braking event (D22); braking events come from measured speed only.
 */

import { ALERT_HYSTERESIS_MPS, ALERT_LEAD_S, STANDSTILL_MPS } from './constants';

export class WantedSpeedAlert {
  private target: number | null = null;
  private fired = false;
  private prev: { t: number; v: number } | null = null;

  /** Set the wanted speed in m/s, or null for Off. */
  setTarget(targetMps: number | null): void {
    this.target = targetMps;
    this.fired = false;
  }

  get wanted(): number | null {
    return this.target;
  }

  /** Forget the previous fix, e.g. when a new log starts. */
  reset(): void {
    this.fired = false;
    this.prev = null;
  }

  /**
   * Offer one fix. Returns true on the fix that fires the alert.
   *
   * `speed` is the speed to use: device speed where reported, otherwise
   * derived from positions by the caller.
   */
  consider(t: number, speed: number): boolean {
    const target = this.target;
    let accel = 0;
    if (this.prev && t > this.prev.t) {
      accel = (speed - this.prev.v) / ((t - this.prev.t) / 1000);
    }
    this.prev = { t, v: speed };

    if (target === null) return false;

    // Re-arm: stopped, or clearly below the wanted speed.
    if (speed < STANDSTILL_MPS || speed <= target - ALERT_HYSTERESIS_MPS) {
      this.fired = false;
    }
    if (this.fired) return false;

    const predicted = speed + Math.max(accel, 0) * ALERT_LEAD_S;
    if (speed >= target || predicted >= target) {
      this.fired = true;
      return true;
    }
    return false;
  }
}
