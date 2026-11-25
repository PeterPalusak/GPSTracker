/**
 * User settings (REQ-SET-1…12).
 *
 * The shape and its validation are pure, so a corrupted or outdated
 * stored value degrades to the defaults rather than breaking the app.
 */

import type { ExportFormat, Units, VehicleType } from './types';
import { DEFAULT_VEHICLE } from './performance/constants';

export interface Settings {
  /** Display units. Storage and exports stay SI (REQ-SET-2a, REQ-EXP-10). */
  units: Units;
  exportFormat: ExportFormat;
  /** Vehicle for the next performance log (REQ-ACC-7). */
  vehicle: VehicleType;
  /** Wanted speed for the deceleration alert, km/h, or null for Off (§8). */
  wantedSpeedKmh: number | null;
  /** Whether the wanted-speed alert vibrates as well as sounds (REQ-ACC-150c). */
  alertVibration: boolean;
  /** Set once the one-time safety notice has been shown (REQ-ACC-157). */
  alertNoticeSeen: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  units: 'km', // REQ-SET-1
  exportFormat: 'gpx', // REQ-SET-8
  vehicle: DEFAULT_VEHICLE,
  wantedSpeedKmh: null,
  alertVibration: true,
  alertNoticeSeen: false,
};

const VEHICLES: readonly VehicleType[] = ['motorcycle', 'car', 'bicycle'];
/** Wanted speeds the alert accepts, km/h (REQ-ACC-141). */
export const WANTED_SPEED_MIN_KMH = 20;
export const WANTED_SPEED_MAX_KMH = 250;

const UNITS: readonly Units[] = ['km', 'mi'];
const FORMATS: readonly ExportFormat[] = ['gpx', 'kml'];

/** A wanted speed within the accepted range, or null. */
export function validWantedSpeed(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < WANTED_SPEED_MIN_KMH || value > WANTED_SPEED_MAX_KMH) return null;
  return value;
}

/**
 * Coerce an unknown stored value into valid settings.
 *
 * Anything unrecognised falls back to the default for that field alone,
 * so one bad value does not discard the rest. There is no version number:
 * with two fields, validating each one is simpler and more robust than
 * migrating.
 */
export function parseSettings(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SETTINGS };

  const value = raw as Partial<Record<keyof Settings, unknown>>;

  return {
    units: UNITS.includes(value.units as Units)
      ? (value.units as Units)
      : DEFAULT_SETTINGS.units,
    exportFormat: FORMATS.includes(value.exportFormat as ExportFormat)
      ? (value.exportFormat as ExportFormat)
      : DEFAULT_SETTINGS.exportFormat,
    vehicle: VEHICLES.includes(value.vehicle as VehicleType)
      ? (value.vehicle as VehicleType)
      : DEFAULT_SETTINGS.vehicle,
    wantedSpeedKmh: validWantedSpeed(value.wantedSpeedKmh),
    alertVibration:
      typeof value.alertVibration === 'boolean'
        ? value.alertVibration
        : DEFAULT_SETTINGS.alertVibration,
    alertNoticeSeen:
      typeof value.alertNoticeSeen === 'boolean'
        ? value.alertNoticeSeen
        : DEFAULT_SETTINGS.alertNoticeSeen,
  };
}

/** Parse settings from stored JSON text, tolerating anything at all. */
export function parseSettingsJson(text: string | null | undefined): Settings {
  if (!text) return { ...DEFAULT_SETTINGS };
  try {
    return parseSettings(JSON.parse(text));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
