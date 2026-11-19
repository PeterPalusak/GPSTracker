/**
 * KML export (REQ-EXP-9).
 *
 * A route export only: a plain <LineString>, with no timestamps or
 * per-point data. That is a deliberate decision — KML here is for looking
 * at the shape of a ride in Google Earth, while GPX is the format that
 * preserves the full log (ambiguity A7, accepted).
 *
 * Units are fixed by the format — decimal degrees and metres — and never
 * follow the display setting (REQ-EXP-10).
 */

import type { Fix, LogMeta } from '../types';
import { escapeXml } from './gpx';

const COORD_DP = 7;
const ELEVATION_DP = 1;

export const KML_MIME = 'application/vnd.google-earth.kml+xml';
export const KML_EXTENSION = 'kml';

/**
 * Serialise a log as KML.
 *
 * Note the coordinate order: KML is **longitude,latitude,altitude** —
 * the reverse of GPX and of most other formats. Getting it backwards puts
 * a ride through Bratislava somewhere in the Indian Ocean.
 */
export function toKml(log: LogMeta, fixes: readonly Fix[]): string {
  const coordinates = fixes
    .map((fix) => {
      const lon = fix.lon.toFixed(COORD_DP);
      const lat = fix.lat.toFixed(COORD_DP);
      const alt =
        fix.alt !== null && Number.isFinite(fix.alt) ? fix.alt.toFixed(ELEVATION_DP) : '0';
      return `${lon},${lat},${alt}`;
    })
    .join('\n          ');

  // clampToGround rather than absolute: without reliable altitude on every
  // point, draping the line on the terrain looks right, whereas absolute
  // heights make GPS altitude noise into a visibly floating ribbon.
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(log.name)}</name>
    <Style id="track">
      <LineStyle>
        <color>ffe58739</color>
        <width>4</width>
      </LineStyle>
    </Style>
    <Placemark>
      <name>${escapeXml(log.name)}</name>
      <styleUrl>#track</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <altitudeMode>clampToGround</altitudeMode>
        <coordinates>
          ${coordinates}
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>
`;
}
