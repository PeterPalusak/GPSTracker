/**
 * Display formatting (REQ-SET-1, REQ-SET-2, REQ-SET-2a).
 *
 * Everything is stored and exported in SI (REQ-EXP-10). These functions are
 * the only place units are converted, and they are display-only — nothing
 * here may be used when writing a GPX or KML file.
 */

import type { Stats, Units } from './types';

/** Exact by international agreement since 1959. */
const METRES_PER_MILE = 1609.344;
const METRES_PER_FOOT = 0.3048;

export interface Formatted {
  value: string;
  unit: string;
}

const fmt = (n: number, digits: number): string =>
  n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

/** Distance, in kilometres or miles. */
export function formatDistance(metres: number, units: Units): Formatted {
  if (units === 'mi') {
    return { value: fmt(metres / METRES_PER_MILE, 2), unit: 'mi' };
  }
  return { value: fmt(metres / 1000, 2), unit: 'km' };
}

/** Speed, in km/h or mph. */
export function formatSpeed(metresPerSecond: number, units: Units): Formatted {
  const kmh = metresPerSecond * 3.6;
  if (units === 'mi') {
    return { value: fmt((metresPerSecond / METRES_PER_MILE) * 3600, 1), unit: 'mph' };
  }
  return { value: fmt(kmh, 1), unit: 'km/h' };
}

/** Altitude, in metres or feet. Null renders as a dash (REQ-GPS-7). */
export function formatAltitude(metres: number | null, units: Units): Formatted {
  if (metres === null) return { value: '—', unit: units === 'mi' ? 'ft' : 'm' };
  if (units === 'mi') {
    return { value: fmt(metres / METRES_PER_FOOT, 0), unit: 'ft' };
  }
  return { value: fmt(metres, 0), unit: 'm' };
}

/** Height difference — same units as altitude, never null. */
export function formatHeight(metres: number, units: Units): Formatted {
  return formatAltitude(metres, units);
}

/**
 * Duration as h:mm:ss, or m:ss under an hour.
 *
 * Not localised: a ride timer reads the same everywhere, and the colon
 * form is unambiguous.
 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

/**
 * Storage usage, for the Settings screen (REQ-STO-5).
 *
 * Binary units, since that is what a browser's quota is measured in.
 */
export function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'unknown';
  if (bytes < 1024) return `${bytes} B`;

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

/** Observed fix rate (REQ-GPS-6). */
export function formatFixRate(hz: number | null): string {
  return hz === null ? '—' : `${hz.toFixed(1)} Hz`;
}

/**
 * Friendly date and time for a log, in the device's local zone.
 *
 * Log *names* are UTC (REQ-REC-2) so they sort correctly and never shift
 * across a timezone or DST boundary. That makes them unfriendly to read,
 * so the list shows local time alongside.
 */
export function formatLogDateTime(startedAt: number): string {
  return new Date(startedAt).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export interface StatisticRow {
  label: string;
  value: string;
  unit: string;
}

/**
 * The nine metrics of REQ-STAT-4…13, ready to render.
 *
 * Order matters: the first three are the ones a rider actually looks at,
 * and the panel gives them more weight.
 */
export function statisticRows(stats: Stats, units: Units): StatisticRow[] {
  const distance = formatDistance(stats.distance, units);
  const avg = formatSpeed(stats.avgSpeed, units);
  const max = formatSpeed(stats.maxSpeed, units);

  return [
    { label: 'Distance', value: distance.value, unit: distance.unit },
    { label: 'Overall time', value: formatDuration(stats.overallTime), unit: '' },
    { label: 'Moving time', value: formatDuration(stats.movingTime), unit: '' },
    { label: 'Average speed', value: avg.value, unit: avg.unit },
    { label: 'Max speed', value: max.value, unit: max.unit },
    { label: 'Min height', ...rest(formatAltitude(stats.minAlt, units)) },
    { label: 'Max height', ...rest(formatAltitude(stats.maxAlt, units)) },
    { label: 'Height gained', ...rest(formatHeight(stats.gain, units)) },
    { label: 'Height dropped', ...rest(formatHeight(stats.drop, units)) },
  ];
}

const rest = (f: Formatted) => ({ value: f.value, unit: f.unit });
