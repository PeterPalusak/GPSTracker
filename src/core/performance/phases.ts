/**
 * Acceleration phases (REQ-ACC-40…57).
 *
 * A phase is one continuous acceleration: it starts from standstill, or from
 * any speed when a rolling start is measured, and ends at its peak speed when
 * the vehicle stops accelerating for longer than the gear-dip allowance or
 * loses more speed than the allowance (REQ-ACC-50, REQ-ACC-51).
 *
 * Gear changes are inside a phase. A dip shorter than the allowance does not
 * end it, so the speed drops caused by shifting are kept, as the requirements
 * ask.
 */

import {
  MIN_PHASE_SPEED_MPS,
  STANDSTILL_MPS,
  VEHICLE_PARAMETERS,
  type DipParameters,
} from './constants';
import type { Sample } from './series';
import type { VehicleType } from '../types';

export interface Phase {
  /** Index of the first sample in the phase. */
  startIndex: number;
  /** Index of the peak-speed sample, where the phase ends. */
  endIndex: number;
  /**
   * True when the phase begins at standstill. Standing-start metrics use only
   * these phases (REQ-ACC-57).
   */
  standingStart: boolean;
  /**
   * For a standing start, the last sample below standstill. Time zero lies
   * between this sample and the next one (REQ-ACC-41).
   */
  zeroIndex: number;
}

interface Active {
  start: number;
  standing: boolean;
  zeroIndex: number;
  peak: number;
  /** Index where the current non-accelerating period began, or null. */
  dipStart: number | null;
}

export function findPhases(
  samples: readonly Sample[],
  accel: ReadonlyArray<number | null>,
  vehicle: VehicleType,
): Phase[] {
  const params: DipParameters = VEHICLE_PARAMETERS[vehicle];
  const dipMaxMs = params.gearDipMaxS * 1000;
  const rising = (i: number): boolean => {
    const a = accel[i];
    return a !== null && a !== undefined && a >= params.minAccelMps2;
  };

  const phases: Phase[] = [];
  let lastStandstill: number | null = null;
  let lastPhaseEnd: number | null = null;
  let active: Active | null = null;

  const close = (end: number): void => {
    if (!active) return;
    if (samples[end]!.v >= MIN_PHASE_SPEED_MPS) {
      phases.push({
        startIndex: active.start,
        endIndex: end,
        standingStart: active.standing,
        zeroIndex: active.zeroIndex,
      });
    }
    lastPhaseEnd = end;
    active = null;
  };

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    // The last stationary sample strictly before this one. The current sample
    // may itself still be stationary when the rise is first detected, so the
    // standstill test must not look at it.
    const standstillBefore = lastStandstill;
    if (s.v < STANDSTILL_MPS) lastStandstill = i;

    if (!active) {
      if (!rising(i)) continue;

      // Standing start: the vehicle was stationary after the previous phase.
      const standing =
        standstillBefore !== null && (lastPhaseEnd === null || standstillBefore > lastPhaseEnd);

      if (standing) {
        // Time zero is where speed first reaches standstill's upper edge, which
        // can be after this sample: search forward for it (REQ-ACC-41).
        let j = standstillBefore! + 1;
        while (j < samples.length && samples[j]!.v < STANDSTILL_MPS) j++;
        const zero = j - 1;
        active = { start: zero, standing: true, zeroIndex: zero, peak: i, dipStart: null };
      } else {
        // Rolling start. The centred window lags the true start by up to
        // half a second, so step back over the rising samples that precede i.
        let start = i;
        const floor = lastPhaseEnd === null ? 0 : lastPhaseEnd + 1;
        while (start - 1 >= floor && rising(start - 1)) start--;
        active = { start, standing: false, zeroIndex: start, peak: i, dipStart: null };
      }
      continue;
    }

    if (s.v > samples[active.peak]!.v) active.peak = i;

    if (rising(i)) {
      active.dipStart = null;
      continue;
    }

    if (active.dipStart === null) active.dipStart = i;
    const dipMs = s.t - samples[active.dipStart]!.t;
    const lossMps = samples[active.peak]!.v - s.v;
    if (dipMs > dipMaxMs || lossMps > params.gearDipMaxLossMps) {
      close(active.peak);
    }
  }

  // A phase still running when the log ends ends at its peak (REQ-ACC-52).
  if (active) close((active as Active).peak);

  return phases;
}
