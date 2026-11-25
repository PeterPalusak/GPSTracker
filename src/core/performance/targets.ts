/**
 * The measurements the Performance screen reports (REQ-ACC-60…74).
 *
 * Shared by the analysis and the UI, so the list is written once. The order
 * here is the order of the tables.
 */

import { kmhToMps, mphToMps, MARK_1000_M, MARK_400_M, MARK_EIGHTH_MILE_M, MARK_QUARTER_MILE_M } from './constants';

export type AccelTargetId =
  | '0-100kmh'
  | '0-100mph'
  | '1/8'
  | '1/4'
  | '400m'
  | '1000m'
  | 'roll-30-80'
  | 'roll-50-100'
  | 'roll-80-130';

export type AccelTargetGroup = 'standing' | 'distance' | 'rolling';

export interface AccelTargetDef {
  id: AccelTargetId;
  label: string;
  group: AccelTargetGroup;
  /** Speed to reach, m/s (standing start). */
  to?: number;
  /** Lower and upper speeds, m/s (rolling window). */
  from?: number;
  /** Distance mark, metres, from time zero (distance-based). */
  metres?: number;
}

export const ACCEL_TARGETS: readonly AccelTargetDef[] = [
  { id: '0-100kmh', label: '0–100 km/h', group: 'standing', to: kmhToMps(100) },
  { id: '0-100mph', label: '0–100 mph', group: 'standing', to: mphToMps(100) },
  { id: '1/8', label: '1/8 mile', group: 'distance', metres: MARK_EIGHTH_MILE_M },
  { id: '1/4', label: '1/4 mile', group: 'distance', metres: MARK_QUARTER_MILE_M },
  { id: '400m', label: '400 m', group: 'distance', metres: MARK_400_M },
  { id: '1000m', label: '1000 m', group: 'distance', metres: MARK_1000_M },
  { id: 'roll-30-80', label: '30–80 km/h', group: 'rolling', from: kmhToMps(30), to: kmhToMps(80) },
  { id: 'roll-50-100', label: '50–100 km/h', group: 'rolling', from: kmhToMps(50), to: kmhToMps(100) },
  { id: 'roll-80-130', label: '80–130 km/h', group: 'rolling', from: kmhToMps(80), to: kmhToMps(130) },
];

/** Starting speeds of the braking targets, km/h (REQ-ACC-58). */
export const BRAKE_TARGETS_KMH: readonly number[] = [130, 100, 80, 50];
