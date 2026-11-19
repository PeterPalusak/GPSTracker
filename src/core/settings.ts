/**
 * User settings (REQ-SET-1…12).
 *
 * The shape and its validation are pure, so a corrupted or outdated
 * stored value degrades to the defaults rather than breaking the app.
 */

import type { ExportFormat, Units } from './types';

export interface Settings {
  /** Display units. Storage and exports stay SI (REQ-SET-2a, REQ-EXP-10). */
  units: Units;
  exportFormat: ExportFormat;
}

export const DEFAULT_SETTINGS: Settings = {
  units: 'km', // REQ-SET-1
  exportFormat: 'gpx', // REQ-SET-8
};

const UNITS: readonly Units[] = ['km', 'mi'];
const FORMATS: readonly ExportFormat[] = ['gpx', 'kml'];

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
