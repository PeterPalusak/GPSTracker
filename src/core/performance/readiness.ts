/**
 * Readiness: the precision check behind the green indicator (REQ-ACC-20…25).
 *
 * Stricter than satellite acquisition (REQ-GPS-1). Ready requires accuracy,
 * a reported speed and, where the platform says, enough satellites and a
 * satellite provider, held for READY_SUSTAIN_MS. The same rules run over a
 * stored log, so the analysis can tell whether a run began after Ready.
 */

import type { Fix } from '../types';
import {
  READY_ACCURACY_M,
  READY_LOST_MS,
  READY_MIN_SATELLITES,
  READY_SUSTAIN_MS,
} from './constants';

/** The fields readiness looks at. Satellites and provider are native-only. */
export interface ReadinessInput {
  t: number;
  acc: number | null;
  spd: number | null;
  satellites?: number | null;
  provider?: string | null;
}

/** A single fix passes the precision test (REQ-ACC-21 a–d). */
export function fixIsPrecise(f: ReadinessInput): boolean {
  if (f.acc === null || f.acc > READY_ACCURACY_M) return false;
  if (f.spd === null || f.spd === undefined) return false;
  if (f.satellites !== null && f.satellites !== undefined && f.satellites < READY_MIN_SATELLITES) {
    return false;
  }
  if (f.provider !== null && f.provider !== undefined && f.provider !== 'gps' && f.provider !== 'fused') {
    return false;
  }
  return true;
}

export class ReadinessTracker {
  private ready = false;
  private readyAtMs: number | null = null;
  private goodSince: number | null = null;
  private badSince: number | null = null;
  private bestAcc: number | null = null;
  private lastAcc: number | null = null;
  private lastSatellites: number | null = null;

  get isReady(): boolean {
    return this.ready;
  }

  /** When Ready was first reached, epoch ms, or null. */
  get readyAt(): number | null {
    return this.readyAtMs;
  }

  /** Best horizontal accuracy seen in this log, metres. */
  get bestAccuracy(): number | null {
    return this.bestAcc;
  }

  get accuracy(): number | null {
    return this.lastAcc;
  }

  get satellites(): number | null {
    return this.lastSatellites;
  }

  consider(f: ReadinessInput): boolean {
    if (f.acc !== null && (this.bestAcc === null || f.acc < this.bestAcc)) this.bestAcc = f.acc;
    this.lastAcc = f.acc;
    this.lastSatellites = f.satellites ?? null;

    if (fixIsPrecise(f)) {
      this.badSince = null;
      this.goodSince ??= f.t;
      if (!this.ready && f.t - this.goodSince >= READY_SUSTAIN_MS) {
        this.ready = true;
        this.readyAtMs ??= f.t;
      }
    } else {
      this.goodSince = null;
      if (this.ready) {
        this.badSince ??= f.t;
        if (f.t - this.badSince > READY_LOST_MS) {
          this.ready = false;
          this.badSince = null;
        }
      }
    }
    return this.ready;
  }

  reset(): void {
    this.ready = false;
    this.readyAtMs = null;
    this.goodSince = null;
    this.badSince = null;
    this.bestAcc = null;
    this.lastAcc = null;
    this.lastSatellites = null;
  }
}

/** When a stored log first reached Ready, or null if it never did. */
export function firstReadyAt(fixes: readonly Fix[]): number | null {
  const tracker = new ReadinessTracker();
  for (const fix of fixes) tracker.consider(fix);
  return tracker.readyAt;
}
