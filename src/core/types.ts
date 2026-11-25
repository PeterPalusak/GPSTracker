/**
 * Core domain types.
 *
 * Everything here is stored in SI units: metres, metres per second,
 * decimal degrees, epoch milliseconds. Conversion to the user's chosen
 * display units happens in the UI only (REQ-SET-2a), and exports always
 * use SI regardless of that setting (REQ-EXP-10).
 */

import type { PerformanceResults } from './performance/analysis';

/** What a log was recorded for. Route is the main recorder (REQ-NAV-1…). */
export type LogType = 'route' | 'performance';

/** Vehicle used for a performance log (REQ-ACC-7). */
export type VehicleType = 'motorcycle' | 'car' | 'bicycle';

/** Whether a log is open, and if so whether it is paused (REQ-REC-0…14). */
export type RecordingState = 'idle' | 'recording' | 'paused';

/**
 * Satellite signal state, orthogonal to RecordingState.
 *
 * A log can be open while no fix has been acquired yet — on start
 * (REQ-GPS-1) and again after every resume, because Pause powers the
 * receiver down (REQ-REC-7, REQ-REC-9a).
 */
export type SignalState = 'off' | 'acquiring' | 'tracking';

/**
 * 'recording'  — open; if seen at launch, the app was killed (REQ-REC-15)
 * 'finished'   — closed normally with Stop
 * 'unfinished' — closed by the recovery process (REQ-REC-16)
 */
export type LogStatus = 'recording' | 'finished' | 'unfinished';

/** Display units (REQ-SET-1). Storage and exports are always SI. */
export type Units = 'km' | 'mi';

/** Export format (REQ-SET-6…8). */
export type ExportFormat = 'gpx' | 'kml';

/** A single recorded position. Stored in the `points` object store. */
export interface Fix {
  logId: string;
  /** Monotonic within a log, starting at 0. Part of the compound key. */
  seq: number;
  /** Epoch milliseconds, UTC. */
  t: number;
  /** Degrees. */
  lat: number;
  /** Degrees. */
  lon: number;
  /** Metres above the ellipsoid, or null where the device reports none (REQ-GPS-7). */
  alt: number | null;
  /** Horizontal accuracy in metres, or null. */
  acc: number | null;
  /** Metres per second as reported by the device (REQ-GPS-5), or null. */
  spd: number | null;
  /** Degrees from true north, or null. */
  hdg: number | null;
}

/** A pause interval. `to` is null while the log is still paused. */
export interface PauseInterval {
  from: number;
  to: number | null;
}

/**
 * The nine metrics of REQ-STAT-4…13, in SI units.
 *
 * Note the deliberately unfiltered treatment of `gain`, `drop`, `distance`
 * and `maxSpeed` — see REQ-GEN-3 and REQ-STAT-19. These figures include GPS
 * noise by design; cleaning up is left to other tools.
 */
export interface Stats {
  /** Metres (REQ-STAT-4). */
  distance: number;
  /** Milliseconds, excluding paused intervals (REQ-STAT-5, REQ-STAT-15). */
  overallTime: number;
  /** Milliseconds at or above MOVING_THRESHOLD_MPS (REQ-STAT-6, REQ-STAT-16). */
  movingTime: number;
  /** Metres per second: distance / overallTime (REQ-STAT-7, REQ-STAT-17). */
  avgSpeed: number;
  /** Metres per second (REQ-STAT-8, REQ-STAT-18). */
  maxSpeed: number;
  /** Metres, or null if no fix carried an altitude (REQ-STAT-10). */
  minAlt: number | null;
  /** Metres, or null if no fix carried an altitude (REQ-STAT-11). */
  maxAlt: number | null;
  /** Metres, sum of positive altitude changes (REQ-STAT-12, REQ-STAT-19). */
  gain: number;
  /** Metres, sum of negative altitude changes (REQ-STAT-13, REQ-STAT-19). */
  drop: number;
}

/** Log metadata. Stored in the `logs` object store. */
export interface LogMeta {
  /** Sortable unique id. Distinct from `name`, which can collide (A1). */
  id: string;
  /** Display name, `yyyymmdd-hhmm` in UTC (REQ-REC-2). */
  name: string;
  startedAt: number;
  endedAt: number | null;
  status: LogStatus;
  pauses: PauseInterval[];
  /** Cached statistics, so opening a finished log does not rescan points. */
  stats: Stats | null;
  pointCount: number;

  /*
   * Fields added with the performance feature. Optional so that logs stored
   * before it still load; the repository fills in the defaults on read.
   */

  /** Default `route` (REQ-ACC-105). */
  type?: LogType;
  /** Performance logs only (REQ-ACC-7). Default `motorcycle`. */
  vehicle?: VehicleType | null;
  /** Times, in epoch ms, at which the wanted-speed alert fired (§8). */
  alertMarks?: number[];
  /** Cached performance analysis, with the algorithm version (REQ-ACC-108). */
  performance?: PerformanceResults | null;
}
