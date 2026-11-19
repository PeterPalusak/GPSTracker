/**
 * GPX 1.1 export (REQ-EXP-8).
 *
 * The lossless format: one <trkpt> per recorded position, each carrying
 * <ele> and <time>, so every statistic can be re-derived from the file.
 *
 * Units are fixed by the format — decimal degrees and metres — and never
 * follow the display setting (REQ-EXP-10).
 */

import type { Fix, LogMeta } from '../types';

/** ~1 cm at the equator; more digits would be recording GPS noise. */
const COORD_DP = 7;
const ELEVATION_DP = 1;

export const GPX_MIME = 'application/gpx+xml';
export const GPX_EXTENSION = 'gpx';

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const isoTime = (ms: number): string => new Date(ms).toISOString();

/**
 * Serialise a log as GPX.
 *
 * A single <trkseg>: signal gaps are deliberately not marked (REQ-GPS-4),
 * so the track is one continuous segment and a tunnel appears as a long
 * straight leg.
 */
export function toGpx(log: LogMeta, fixes: readonly Fix[]): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="GPS Logger"',
    '     xmlns="http://www.topografix.com/GPX/1/1"',
    '     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    '     xsi:schemaLocation="http://www.topografix.com/GPX/1/1' +
      ' http://www.topografix.com/GPX/1/1/gpx.xsd">',
    '  <metadata>',
    `    <name>${escapeXml(log.name)}</name>`,
    `    <time>${isoTime(log.startedAt)}</time>`,
    '  </metadata>',
    '  <trk>',
    `    <name>${escapeXml(log.name)}</name>`,
    '    <trkseg>',
  ];

  for (const fix of fixes) {
    lines.push(
      `      <trkpt lat="${fix.lat.toFixed(COORD_DP)}" lon="${fix.lon.toFixed(COORD_DP)}">`,
    );
    // Omitted rather than zeroed where the device reported none (REQ-GPS-7):
    // an <ele>0</ele> would claim sea level.
    if (fix.alt !== null && Number.isFinite(fix.alt)) {
      lines.push(`        <ele>${fix.alt.toFixed(ELEVATION_DP)}</ele>`);
    }
    lines.push(`        <time>${isoTime(fix.t)}</time>`);
    lines.push('      </trkpt>');
  }

  lines.push('    </trkseg>', '  </trk>', '</gpx>', '');
  return lines.join('\n');
}
