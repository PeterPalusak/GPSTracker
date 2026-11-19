/**
 * Record a ride, then export it — the whole path through the recorder,
 * storage, the serialisers and the share boundary.
 */

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { exportLog } from '../core/export';
import { METRES_PER_DEG_LAT, T0 } from '../core/testFixtures';
import { LogRepository } from '../data/logRepository';
import { FakeLocationSource } from '../platform/FakeLocationSource';
import { FakeSharer } from '../platform/FakeSharer';
import type { RawFix } from '../platform/LocationSource';
import { Recorder } from './recorder';

let repo: LogRepository;
let source: FakeLocationSource;
let sharer: FakeSharer;
let recorder: Recorder;
let clock = T0;
let dbCounter = 0;

beforeEach(async () => {
  clock = T0;
  repo = await LogRepository.open(`export-db-${dbCounter++}`);
  source = new FakeLocationSource();
  sharer = new FakeSharer();
  recorder = new Recorder({ repository: repo, source, now: () => clock });
});

function fix(north: number, alt: number | null): RawFix {
  return {
    t: clock,
    lat: 48 + north / METRES_PER_DEG_LAT,
    lon: 17,
    alt,
    acc: 6,
    spd: 10,
    hdg: null,
    satellites: 9,
    provider: 'gps',
  };
}

/** Record `count` fixes a second apart and finish the log. */
async function recordRide(count: number, alt: number | null = 200) {
  await recorder.start();
  for (let i = 0; i < count; i++) {
    source.emitOne(fix(i * 10, alt === null ? null : alt + i));
    clock += 1000;
  }
  await recorder.settled();
  return (await recorder.stop())!;
}

describe('recording then exporting', () => {
  it('exports every recorded position as GPX', async () => {
    const log = await recordRide(25);
    const fixes = await repo.readPoints(log.id);

    const file = exportLog(log, fixes, 'gpx');
    const outcome = await sharer.share(file);

    expect(outcome).toBe('shared');
    expect(sharer.last?.name).toBe(`${log.name}.gpx`);
    expect(sharer.last!.text.match(/<trkpt /g)).toHaveLength(25);
  });

  it('exports the same ride as KML when asked', async () => {
    const log = await recordRide(10);
    const fixes = await repo.readPoints(log.id);

    await sharer.share(exportLog(log, fixes, 'kml'));

    expect(sharer.last?.name).toBe(`${log.name}.kml`);
    expect(sharer.last!.text).toContain('<LineString>');
  });

  it('leaves the stored log untouched, however often it is exported (REQ-EXP-7)', async () => {
    const log = await recordRide(15);
    const fixes = await repo.readPoints(log.id);

    await sharer.share(exportLog(log, fixes, 'gpx'));
    await sharer.share(exportLog(log, fixes, 'kml'));
    await sharer.share(exportLog(log, fixes, 'gpx'));

    const after = await repo.getLog(log.id);
    expect(after).toEqual(log);
    expect(await repo.countPoints(log.id)).toBe(15);
    expect(sharer.shared).toHaveLength(3);
  });

  it('falls back to a download where the share sheet cannot take files (REQ-EXP-6)', async () => {
    sharer.supportsFiles = false;
    const log = await recordRide(5);
    const fixes = await repo.readPoints(log.id);

    expect(await sharer.share(exportLog(log, fixes, 'gpx'))).toBe('downloaded');
  });

  it('round-trips the recorded positions through the file', async () => {
    const log = await recordRide(12);
    const fixes = await repo.readPoints(log.id);
    const gpx = exportLog(log, fixes, 'gpx').text;

    const lats = [...gpx.matchAll(/<trkpt lat="([\d.-]+)"/g)].map((m) => Number(m[1]));
    expect(lats).toHaveLength(fixes.length);
    lats.forEach((lat, i) => expect(lat).toBeCloseTo(fixes[i]!.lat, 6));
  });

  it('omits elevation for a ride the device gave no altitude for (REQ-GPS-7)', async () => {
    const log = await recordRide(8, null);
    const fixes = await repo.readPoints(log.id);

    const gpx = exportLog(log, fixes, 'gpx').text;
    expect(gpx).not.toContain('<ele>');
    expect(gpx.match(/<trkpt /g)).toHaveLength(8);
  });

  it('exports an unfinished log recovered after a kill (REQ-REC-16)', async () => {
    await recorder.start();
    for (let i = 0; i < 20; i++) {
      source.emitOne(fix(i * 10, 150 + i));
      clock += 1000;
    }
    await recorder.settled();

    const revived = new Recorder({ repository: repo, source, now: () => clock });
    const recovered = (await revived.recoverInterrupted())!;
    const fixes = await repo.readPoints(recovered.id);

    const file = exportLog(recovered, fixes, 'gpx');
    expect(file.text.match(/<trkpt /g)).toHaveLength(20);
  });
});
