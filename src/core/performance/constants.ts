/**
 * Constants for the Performance screen (Accelleration_Requirements.MD §12).
 *
 * Every number the analysis depends on is here, so that tuning after field
 * tests touches one file. Values are the proposals in the requirements; the
 * ones marked "from the requirements" are fixed by a definition.
 */

import type { VehicleType } from '../types';

/** Standard gravity, for converting m/s² to G (§2). */
export const G_MPS2 = 9.80665;

const KMH_TO_MPS = 1000 / 3600;
const MPH_TO_MPS = 0.44704;

export const kmhToMps = (kmh: number): number => kmh * KMH_TO_MPS;
export const mphToMps = (mph: number): number => mph * MPH_TO_MPS;

/** Speed below which the vehicle counts as stationary (REQ-STAT-16). */
export const STANDSTILL_MPS = 0.5;

/** Speed a phase must reach to be reported at all (REQ-ACC-56). */
export const MIN_PHASE_SPEED_MPS = kmhToMps(10);

/** Half-width of the centred window used for acceleration, in ms. */
export const WINDOW_HALF_MS = 500;

/** Readiness (REQ-ACC-21). */
export const READY_ACCURACY_M = 5;
export const READY_SUSTAIN_MS = 5_000;
export const READY_MIN_SATELLITES = 6;
/** Time above the accuracy limit before Ready is withdrawn (REQ-ACC-23). */
export const READY_LOST_MS = 3_000;

/** Fixes less accurate than this are dropped from analysis (REQ-ACC-87). */
export const EXCLUDE_ACCURACY_M = 10;

/** A gap between fixes longer than this inside an event is flagged (REQ-ACC-100). */
export const GAP_FLAG_MS = 2_000;

/** Peak acceleration above this indicates a speed error (REQ-ACC-100). */
export const MAX_PLAUSIBLE_MPS2 = 30;

/** Fix rate below this flags an event as low-rate (REQ-ACC-102). */
export const LOW_RATE_HZ = 5;

/** Wanted-speed alert (§8). */
export const ALERT_HYSTERESIS_MPS = kmhToMps(5);
/** Seconds of acceleration the alert looks ahead, to cover GPS delay (D18). */
export const ALERT_LEAD_S = 0.5;
export const ALERT_DURATION_MS = 3_000;
/** Photosensitivity limit for the blinking screen (§8.3). */
export const ALERT_MAX_FLASH_HZ = 3;

/** Bumped whenever the analysis changes, so cached results are recalculated (REQ-ACC-109). */
export const ANALYSIS_VERSION = 1;

/** Distance marks, in metres. 1/8 and 1/4 mile are exact by definition. */
export const MARK_EIGHTH_MILE_M = 201.168;
export const MARK_QUARTER_MILE_M = 402.336;
export const MARK_400_M = 400;
export const MARK_1000_M = 1000;

/**
 * Per-vehicle parameter sets (REQ-ACC-7). The three start with identical
 * values; they are separate so that each can be tuned on its own.
 */
export interface DipParameters {
  /** Non-accelerating periods inside a phase may last this long (REQ-ACC-50). */
  gearDipMaxS: number;
  /** …and may lose at most this much speed (REQ-ACC-50). */
  gearDipMaxLossMps: number;
  /** Below this windowed acceleration the speed counts as not rising. */
  minAccelMps2: number;
}

const SHARED_PARAMETERS: DipParameters = {
  gearDipMaxS: 1.0, // maximum set by the user
  gearDipMaxLossMps: 0.8, // about 3 km/h
  minAccelMps2: 0.3,
};

export const VEHICLE_PARAMETERS: Record<VehicleType, DipParameters> = {
  motorcycle: SHARED_PARAMETERS,
  car: SHARED_PARAMETERS,
  bicycle: SHARED_PARAMETERS,
};

export const VEHICLE_LABELS: Record<VehicleType, string> = {
  motorcycle: 'Motorcycle',
  car: 'Car',
  bicycle: 'Bicycle',
};

export const DEFAULT_VEHICLE: VehicleType = 'motorcycle';
