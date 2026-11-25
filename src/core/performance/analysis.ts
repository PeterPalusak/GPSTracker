/**
 * The performance analysis: acceleration phases and braking events, their
 * measurements, validity flags and chart series (Accelleration_Requirements.MD
 * §5 to §8).
 *
 * Pure: fixes in, results out. The result is JSON-serialisable so it can be
 * cached on the log (REQ-ACC-108).
 */

import type { Fix, VehicleType } from '../types';
import {
  ANALYSIS_VERSION,
  GAP_FLAG_MS,
  LOW_RATE_HZ,
  MAX_PLAUSIBLE_MPS2,
  READY_ACCURACY_M,
  STANDSTILL_MPS,
  VEHICLE_PARAMETERS,
  kmhToMps,
} from './constants';
import { findPhases, type Phase } from './phases';
import { firstReadyAt } from './readiness';
import {
  buildSeries,
  firstRisingCrossing,
  interpolateAt,
  interpolateTime,
  lastFallingCrossing,
  toG,
  windowedAccel,
  type Sample,
} from './series';
import { ACCEL_TARGETS, BRAKE_TARGETS_KMH, type AccelTargetDef, type AccelTargetId } from './targets';

// --- Result types -----------------------------------------------------------

export type FlagCode =
  | 'accuracy'
  | 'derived-speed'
  | 'gap'
  | 'before-ready'
  | 'implausible'
  | 'low-rate';

export const FLAG_LABELS: Record<FlagCode, string> = {
  accuracy: 'accuracy above the Ready limit during the event',
  'derived-speed': 'speed derived from positions',
  gap: 'gap of more than 2 s between fixes',
  'before-ready': 'started before Ready',
  implausible: 'implausible acceleration, likely a speed error',
  'low-rate': 'fix rate below 5 Hz',
};

/** A point on a chart: seconds from the event's origin, and G (signed). */
export interface ChartPoint {
  x: number;
  y: number;
}

export type TargetStatus = 'measured' | 'not-reached' | 'not-applicable';

export interface TargetResult {
  status: TargetStatus;
  /** Seconds from the target's origin. */
  time: number | null;
  /** Metres from time zero, for distance marks. */
  distance: number | null;
  /** Trap speed at a distance mark, m/s. */
  trapSpeed: number | null;
}

export interface PhaseResult {
  key: string;
  standingStart: boolean;
  /** Epoch ms of time zero (standing start) or the first sample (rolling). */
  originT: number;
  endT: number;
  peakSpeed: number;
  /** Seconds, origin to end. */
  duration: number;
  /** Metres, origin to end. */
  distance: number;
  /** m/s², change in speed over the duration. */
  avgAccel: number;
  /** m/s², largest windowed acceleration in the span. */
  peakAccel: number;
  flags: FlagCode[];
  targets: Record<AccelTargetId, TargetResult>;
  series: ChartPoint[];
}

export interface BrakingResult {
  key: string;
  /** The starting speed of the event, km/h (130, 100, 80 or 50). */
  targetKmh: number;
  originT: number;
  endT: number;
  /** Seconds, from the crossing of the target speed to standstill. */
  duration: number;
  /** Metres. */
  distance: number;
  /** m/s², positive magnitude. */
  maxDecel: number;
  /** m/s², positive magnitude. */
  avgDecel: number;
  flags: FlagCode[];
  series: ChartPoint[];
}

export interface PerformanceResults {
  version: number;
  vehicle: VehicleType;
  /** Epoch ms when the log first reached Ready, or null. */
  readyAt: number | null;
  summary: {
    fixes: number;
    excludedAccuracy: number;
    noSpeed: number;
    /** Fixes not inside any reported phase or braking event. */
    outsideEvents: number;
    /** Braking events cut short by re-acceleration (REQ-ACC-59). */
    interruptedBraking: number;
  };
  phases: PhaseResult[];
  brakings: BrakingResult[];
}

// --- Helpers ----------------------------------------------------------------

const sv = (s: Sample): number => s.v;
const sd = (s: Sample): number => s.d;

/** Flags for a span of samples (REQ-ACC-100, REQ-ACC-102). */
function flagsFor(
  samples: readonly Sample[],
  from: number,
  to: number,
  originT: number,
  readyAt: number | null,
  peakAbsAccel: number,
): FlagCode[] {
  const flags = new Set<FlagCode>();

  for (let i = from; i <= to; i++) {
    const s = samples[i]!;
    if (s.acc !== null && s.acc > READY_ACCURACY_M) flags.add('accuracy');
    if (s.derived) flags.add('derived-speed');
    if (i > from && s.t - samples[i - 1]!.t > GAP_FLAG_MS) flags.add('gap');
  }

  if (readyAt === null || originT < readyAt) flags.add('before-ready');
  if (peakAbsAccel > MAX_PLAUSIBLE_MPS2) flags.add('implausible');

  const spanS = (samples[to]!.t - samples[from]!.t) / 1000;
  if (spanS > 0 && (to - from) / spanS < LOW_RATE_HZ) flags.add('low-rate');

  return [...flags];
}

/** Signed G values across a span, starting at the origin. */
function seriesFor(
  samples: readonly Sample[],
  accel: ReadonlyArray<number | null>,
  from: number,
  to: number,
  originT: number,
): ChartPoint[] {
  const out: ChartPoint[] = [];
  for (let i = from; i <= to; i++) {
    const a = accel[i];
    const t = samples[i]!.t;
    if (a === null || a === undefined || t < originT) continue;
    out.push({ x: (t - originT) / 1000, y: toG(a) });
  }
  return out;
}

const NOT_APPLICABLE: TargetResult = { status: 'not-applicable', time: null, distance: null, trapSpeed: null };
const NOT_REACHED: TargetResult = { status: 'not-reached', time: null, distance: null, trapSpeed: null };

// --- Acceleration -----------------------------------------------------------

interface PhaseOutcome {
  result: PhaseResult | null;
  from: number;
  to: number;
}

function analysePhase(
  samples: readonly Sample[],
  accel: ReadonlyArray<number | null>,
  phase: Phase,
  readyAt: number | null,
): PhaseOutcome {
  const { startIndex, endIndex, zeroIndex, standingStart } = phase;

  // Origin: time zero for a standing start (REQ-ACC-41), else the first sample.
  let originT: number;
  let dOrigin: number;
  let from: number;
  let v0: number;
  if (standingStart) {
    const before = samples[zeroIndex]!;
    const after = samples[zeroIndex + 1]!;
    originT = interpolateTime(before, after, sv, STANDSTILL_MPS);
    dOrigin = interpolateAt(before, after, sd, originT);
    from = zeroIndex;
    v0 = STANDSTILL_MPS;
  } else {
    originT = samples[startIndex]!.t;
    dOrigin = samples[startIndex]!.d;
    from = startIndex;
    v0 = samples[startIndex]!.v;
  }

  const endT = samples[endIndex]!.t;
  const duration = (endT - originT) / 1000;
  if (duration <= 0) return { result: null, from, to: endIndex };

  const distance = samples[endIndex]!.d - dOrigin;
  const peakSpeed = samples[endIndex]!.v;

  let peakAccel = 0;
  for (let i = from; i <= endIndex; i++) {
    const a = accel[i];
    if (a !== null && a !== undefined && a > peakAccel) peakAccel = a;
  }

  const targets = {} as Record<AccelTargetId, TargetResult>;
  for (const def of ACCEL_TARGETS) {
    targets[def.id] = measureTarget(def, samples, phase, originT, dOrigin, from, endIndex, standingStart);
  }

  const flags = flagsFor(samples, from, endIndex, originT, readyAt, peakAccel);

  return {
    result: {
      key: String(Math.round(originT)),
      standingStart,
      originT,
      endT,
      peakSpeed,
      duration,
      distance,
      avgAccel: (peakSpeed - v0) / duration,
      peakAccel,
      flags,
      targets,
      series: seriesFor(samples, accel, from, endIndex, originT),
    },
    from,
    to: endIndex,
  };
}

function measureTarget(
  def: AccelTargetDef,
  samples: readonly Sample[],
  phase: Phase,
  originT: number,
  dOrigin: number,
  from: number,
  endIndex: number,
  standingStart: boolean,
): TargetResult {
  if (def.group === 'rolling') {
    const a = firstRisingCrossing(samples, from, endIndex, def.from!);
    if (a === null) return NOT_REACHED;
    const b = firstRisingCrossing(samples, a, endIndex, def.to!);
    if (b === null) return NOT_REACHED;
    const tA = interpolateTime(samples[a - 1]!, samples[a]!, sv, def.from!);
    const tB = interpolateTime(samples[b - 1]!, samples[b]!, sv, def.to!);
    return {
      status: 'measured',
      time: (tB - tA) / 1000,
      distance: null,
      trapSpeed: null,
    };
  }

  // The remaining targets are measured from a standstill only.
  if (!standingStart) return NOT_APPLICABLE;

  if (def.group === 'standing') {
    const k = firstRisingCrossing(samples, phase.zeroIndex, endIndex, def.to!);
    if (k === null) return NOT_REACHED;
    const t = interpolateTime(samples[k - 1]!, samples[k]!, sv, def.to!);
    return { status: 'measured', time: (t - originT) / 1000, distance: null, trapSpeed: null };
  }

  // Distance mark, measured as integrated distance from time zero (REQ-ACC-77).
  const metres = def.metres!;
  const valueOf = (s: Sample) => s.d - dOrigin;
  const k = firstRisingCrossing(samples, phase.zeroIndex, endIndex, metres, valueOf);
  if (k === null) return NOT_REACHED;
  const t = interpolateTime(samples[k - 1]!, samples[k]!, valueOf, metres);
  return {
    status: 'measured',
    time: (t - originT) / 1000,
    distance: metres,
    trapSpeed: interpolateAt(samples[k - 1]!, samples[k]!, sv, t),
  };
}

// --- Braking ----------------------------------------------------------------

/**
 * A braking event is interrupted when speed rises by more than the loss
 * allowance and keeps rising for longer than the dip allowance (REQ-ACC-59).
 */
function isInterrupted(
  samples: readonly Sample[],
  from: number,
  to: number,
  dipMaxS: number,
  lossMps: number,
): boolean {
  let minV = samples[from]!.v;
  let minIndex = from;
  for (let i = from + 1; i <= to; i++) {
    const v = samples[i]!.v;
    if (v < minV) {
      minV = v;
      minIndex = i;
    } else if (v - minV > lossMps && (samples[i]!.t - samples[minIndex]!.t) / 1000 > dipMaxS) {
      return true;
    }
  }
  return false;
}

interface BrakingOutcome {
  event: BrakingResult | null;
  interrupted: boolean;
  from: number;
  to: number;
}

function analyseBraking(
  samples: readonly Sample[],
  accel: ReadonlyArray<number | null>,
  k: number,
  stop: number,
  targetKmh: number,
  dipMaxS: number,
  lossMps: number,
  readyAt: number | null,
): BrakingOutcome {
  const from = k - 1;
  if (isInterrupted(samples, k, stop, dipMaxS, lossMps)) {
    return { event: null, interrupted: true, from, to: stop };
  }

  const target = kmhToMps(targetKmh);
  const before = samples[k - 1]!;
  const after = samples[k]!;
  const stopBefore = samples[stop - 1]!;
  const stopAfter = samples[stop]!;

  const originT = interpolateTime(before, after, sv, target);
  const endT = interpolateTime(stopBefore, stopAfter, sv, STANDSTILL_MPS);
  const duration = (endT - originT) / 1000;
  if (duration <= 0) return { event: null, interrupted: false, from, to: stop };

  const distance =
    interpolateAt(stopBefore, stopAfter, sd, endT) - interpolateAt(before, after, sd, originT);

  let maxDecel = 0;
  for (let i = k; i <= stop; i++) {
    const a = accel[i];
    if (a !== null && a !== undefined && -a > maxDecel) maxDecel = -a;
  }

  const flags = flagsFor(samples, from, stop, originT, readyAt, maxDecel);

  return {
    event: {
      key: String(Math.round(originT)),
      targetKmh,
      originT,
      endT,
      duration,
      distance,
      maxDecel,
      avgDecel: (target - STANDSTILL_MPS) / duration,
      flags,
      series: seriesFor(samples, accel, from, stop, originT),
    },
    interrupted: false,
    from,
    to: stop,
  };
}

// --- Assembly ---------------------------------------------------------------

/** Analyse a stored log for one vehicle. */
export function analysePerformance(fixes: readonly Fix[], vehicle: VehicleType): PerformanceResults {
  const { samples, excludedAccuracy, noSpeed } = buildSeries(fixes);
  const accel = windowedAccel(samples);
  const readyAt = firstReadyAt(fixes);
  const params = VEHICLE_PARAMETERS[vehicle];
  const covered = new Uint8Array(samples.length);
  const mark = (from: number, to: number) => {
    for (let i = from; i <= to; i++) covered[i] = 1;
  };

  // Acceleration phases.
  const phases: PhaseResult[] = [];
  for (const phase of findPhases(samples, accel, vehicle)) {
    const outcome = analysePhase(samples, accel, phase, readyAt);
    if (!outcome.result) continue;
    phases.push(outcome.result);
    mark(outcome.from, outcome.to);
  }

  // Braking events, one per stop and per target speed (REQ-ACC-58).
  const stops: number[] = [];
  let moving = false;
  for (let i = 0; i < samples.length; i++) {
    if (samples[i]!.v >= STANDSTILL_MPS) {
      moving = true;
    } else if (moving) {
      stops.push(i);
      moving = false;
    }
  }

  const brakings: BrakingResult[] = [];
  let interruptedBraking = 0;
  let previousStop = -1;
  for (const stop of stops) {
    for (const targetKmh of BRAKE_TARGETS_KMH) {
      const k = lastFallingCrossing(samples, previousStop, stop, kmhToMps(targetKmh));
      if (k === null) continue;
      const outcome = analyseBraking(
        samples,
        accel,
        k,
        stop,
        targetKmh,
        params.gearDipMaxS,
        params.gearDipMaxLossMps,
        readyAt,
      );
      if (outcome.interrupted) interruptedBraking += 1;
      if (outcome.event) {
        brakings.push(outcome.event);
        mark(outcome.from, outcome.to);
      }
    }
    previousStop = stop;
  }

  let outsideEvents = 0;
  for (const c of covered) if (c === 0) outsideEvents += 1;

  return {
    version: ANALYSIS_VERSION,
    vehicle,
    readyAt,
    summary: {
      fixes: fixes.length,
      excludedAccuracy,
      noSpeed,
      outsideEvents,
      interruptedBraking,
    },
    phases,
    brakings,
  };
}
