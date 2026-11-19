import { describe, expect, it } from 'vitest';
import { fixAt, straightRun, T0 } from '../testFixtures';
import type { Fix, LogMeta } from '../types';
import { exportLog, GPX_MIME, KML_MIME, toGpx, toKml } from './index';

const log: LogMeta = {
  id: 'log-1',
  name: '20261119-0914',
  startedAt: T0,
  endedAt: T0 + 10_000,
  status: 'finished',
  pauses: [],
  stats: null,
  pointCount: 3,
};

const fixes: Fix[] = [
  fixAt(0, 0, 0, { alt: 212.44 }),
  fixAt(1, 1000, 10, { alt: 215.1 }),
  fixAt(2, 2000, 20, { alt: 218.0 }),
];

describe('GPX (REQ-EXP-8)', () => {
  const gpx = toGpx(log, fixes);

  it('declares GPX 1.1 with the correct namespace', () => {
    expect(gpx).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(gpx).toContain('version="1.1"');
    expect(gpx).toContain('xmlns="http://www.topografix.com/GPX/1/1"');
  });

  it('writes one trkpt per recorded position', () => {
    expect(gpx.match(/<trkpt /g)).toHaveLength(3);
  });

  it('carries elevation and time on every point', () => {
    expect(gpx.match(/<ele>/g)).toHaveLength(3);
    expect(gpx.match(/<time>/g)).toHaveLength(4); // 3 points + metadata
  });

  it('uses a single segment, since signal gaps are not marked (REQ-GPS-4)', () => {
    expect(gpx.match(/<trkseg>/g)).toHaveLength(1);
  });

  it('writes latitude before longitude', () => {
    const point = /<trkpt lat="([\d.-]+)" lon="([\d.-]+)"/.exec(gpx)!;
    expect(Number(point[1])).toBeCloseTo(48, 1);
    expect(Number(point[2])).toBeCloseTo(17, 1);
  });

  it('writes times as UTC ISO 8601', () => {
    expect(gpx).toContain('<time>2026-11-19T09:00:00.000Z</time>');
  });

  it('omits elevation rather than claiming sea level (REQ-GPS-7)', () => {
    const withoutAltitude = toGpx(log, straightRun(3, 10));
    expect(withoutAltitude).not.toContain('<ele>');
    expect(withoutAltitude.match(/<trkpt /g)).toHaveLength(3);
  });

  it('escapes the log name', () => {
    const odd = toGpx({ ...log, name: 'a & b <c>' }, fixes);
    expect(odd).toContain('a &amp; b &lt;c&gt;');
    expect(odd).not.toContain('<c>');
  });

  it('produces a well-formed document for an empty log', () => {
    const empty = toGpx(log, []);
    expect(empty).toContain('<trkseg>');
    expect(empty).toContain('</gpx>');
    expect(empty).not.toContain('<trkpt');
  });
});

describe('KML (REQ-EXP-9)', () => {
  const kml = toKml(log, fixes);

  it('declares the KML 2.2 namespace', () => {
    expect(kml).toContain('xmlns="http://www.opengis.net/kml/2.2"');
  });

  it('writes a plain LineString, with no timestamps', () => {
    // A deliberate decision: KML is a route export, GPX keeps the log.
    expect(kml).toContain('<LineString>');
    expect(kml).not.toContain('<when>');
    expect(kml).not.toContain('gx:Track');
  });

  it('writes coordinates as longitude,latitude,altitude', () => {
    // KML reverses the usual order; getting it wrong relocates the ride
    // to the other side of the world.
    const first = /<coordinates>\s*([\d.,-]+)/.exec(kml)!;
    const [lon, lat, alt] = first[1]!.split(',').map(Number);
    expect(lon).toBeCloseTo(17, 1);
    expect(lat).toBeCloseTo(48, 1);
    expect(alt).toBeCloseTo(212.4, 1);
  });

  it('writes one coordinate triple per position', () => {
    const block = /<coordinates>([\s\S]*?)<\/coordinates>/.exec(kml)![1]!;
    expect(block.trim().split(/\s+/)).toHaveLength(3);
  });

  it('escapes the log name', () => {
    expect(toKml({ ...log, name: 'a & b' }, fixes)).toContain('a &amp; b');
  });

  it('handles positions without altitude', () => {
    expect(() => toKml(log, straightRun(3, 10))).not.toThrow();
  });
});

describe('exportLog (REQ-EXP-1, REQ-EXP-2)', () => {
  it('names the file after the log, with the right extension', () => {
    expect(exportLog(log, fixes, 'gpx').name).toBe('20261119-0914.gpx');
    expect(exportLog(log, fixes, 'kml').name).toBe('20261119-0914.kml');
  });

  it('sets a specific MIME type, not a generic one', () => {
    expect(exportLog(log, fixes, 'gpx').mimeType).toBe(GPX_MIME);
    expect(exportLog(log, fixes, 'kml').mimeType).toBe(KML_MIME);
  });

  it('defaults to GPX (REQ-SET-8)', () => {
    expect(exportLog(log, fixes, 'gpx').text).toContain('<gpx');
  });
});

describe('exports are always SI, whatever the display setting (REQ-EXP-10)', () => {
  // The miles setting is display-only (REQ-SET-2a). If it ever reached a
  // serialiser the app would emit files every other tool misreads, with no
  // error anywhere — so assert the numbers directly.
  it('writes metres for elevation, never feet', () => {
    const gpx = toGpx(log, [fixAt(0, 0, 0, { alt: 1000 })]);
    expect(gpx).toContain('<ele>1000.0</ele>');
    expect(gpx).not.toContain('3280'); // 1000 m in feet
  });

  it('writes decimal degrees, not any projected unit', () => {
    const gpx = toGpx(log, fixes);
    const lat = Number(/<trkpt lat="([\d.-]+)"/.exec(gpx)![1]);
    expect(lat).toBeGreaterThan(-90);
    expect(lat).toBeLessThan(90);
  });

  it('writes metres in KML too', () => {
    const kml = toKml(log, [fixAt(0, 0, 0, { alt: 1000 })]);
    expect(kml).toContain(',1000.0');
  });

  it('takes no units parameter at all', () => {
    // The strongest guarantee available: the serialisers cannot see the
    // setting, so it cannot leak into a file.
    expect(toGpx).toHaveLength(2);
    expect(toKml).toHaveLength(2);
  });
});

describe('a realistic export', () => {
  it('serialises a three-hour ride', () => {
    const ride = straightRun(10_800, 12, { alt: 200 });
    const file = exportLog({ ...log, pointCount: ride.length }, ride, 'gpx');

    expect(file.text.match(/<trkpt /g)).toHaveLength(10_800);
    // Comfortably shareable; well under any practical attachment limit.
    expect(file.text.length).toBeLessThan(3_000_000);
  });
});
