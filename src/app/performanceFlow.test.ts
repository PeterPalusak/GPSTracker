/**
 * A performance log end to end: recording, the live wanted-speed alert, the
 * alarm marker stored with the log, Stop, and analysis of the stored fixes.
 *
 * The alert pipeline here mirrors useWantedSpeedAlert, which needs a Preact
 * runtime to exercise directly.
 */

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { WantedSpeedAlert } from '../core/performance/alert';
import { analysePerformance } from '../core/performance/analysis';
import { kmhToMps } from '../core/performance/constants';
import { METRES_PER_DEG_LAT, T0 } from '../core/testFixtures';
import { LogRepository, withDefaults } from '../data/logRepository';
import { FakeLocationSource } from '../platform/FakeLocationSource';
import type { RawFix } from '../platform/LocationSource';
import { Recorder } from './recorder';

let repo: LogRepository;
let source: FakeLocationSource;
let recorder: Recorder;
let clock = T0;
let dbCounter = 0;

beforeEach(async () => {
  clock = T0;
  repo = await LogRepository.open(`performance-db-${dbCounter++}`);
  source = new FakeLocationSource();
  recorder = new Recorder({ repository: repo, source, now: () => clock });
});

/** Standing start to 40 m/s, 3 s cruise, 8 m/s² to a stop, sampled at 5 Hz. */
const speedAt = (t: number): number => {
  if (t < 2) return 0;
  if (t < 2 + 40 / 3) return 3 * (t - 2);
  if (t < 2 + 40 / 3 + 3) return 40;
  return Math.max(0, 40 - 8 * (t - (2 + 40 / 3 + 3)));
};

/** Feed the whole run through the recorder, with the alert pipeline attached. */
async function ride(seconds: number, wantedKmh: number | null): Promise<number[]> {
  const alert = new WantedSpeedAlert();
  alert.setTarget(wantedKmh === null ? null : kmhToMps(wantedKmh));
  const fired: number[] = [];

  recorder.subscribeFixes((fixes) => {
    for (const fix of fixes) {
      if (alert.consider(fix.t, fix.spd ?? 0)) {
        fired.push(fix.t);
        void recorder.markAlert();
      }
    }
  });

  let north = 0;
  for (let i = 0; i * 0.2 <= seconds; i++) {
    const t = i * 0.2;
    const v = speedAt(t);
    clock = T0 + Math.round(t * 1000);
    source.emitOne(fix(north, v));
    north += v * 0.2;
  }
  await recorder.settled();
  return fired;
}

function fix(northMetres: number, speed: number): RawFix {
  return {
    t: clock,
    lat: 48 + northMetres / METRES_PER_DEG_LAT,
    lon: 17,
    alt: null,
    acc: 4,
    spd: speed,
    hdg: null,
  };
}

describe('performance log', () => {
  it('is stored as a performance log with its vehicle', async () => {
    const log = await recorder.start({ type: 'performance', vehicle: 'car' });
    expect(log.type).toBe('performance');
    expect(log.vehicle).toBe('car');
    await recorder.stop();
    const stored = await repo.getLog(log.id);
    expect(stored?.type).toBe('performance');
    expect(stored?.vehicle).toBe('car');
  });

  it('fires the wanted-speed alert once, and stores its moment with the log', async () => {
    const log = await recorder.start({ type: 'performance', vehicle: 'motorcycle' });
    const fired = await ride(26, 130);
    expect(fired).toHaveLength(1);

    await recorder.stop();
    const stored = await repo.getLog(log.id);
    expect(stored?.alertMarks).toHaveLength(1);
  });

  it('does not fire when the wanted speed is Off', async () => {
    await recorder.start({ type: 'performance', vehicle: 'motorcycle' });
    const fired = await ride(26, null);
    expect(fired).toHaveLength(0);
  });

  it('marks nothing when no log is open', async () => {
    await recorder.markAlert();
    const logs = await repo.listLogs();
    expect(logs.every((l) => l.alertMarks?.length === 0)).toBe(true);
  });

  it('analyses the stored fixes into both kinds of measurement', async () => {
    const log = await recorder.start({ type: 'performance', vehicle: 'motorcycle' });
    await ride(26, 130);
    await recorder.stop();

    const fixes = await repo.readPoints(log.id);
    const results = analysePerformance(fixes, 'motorcycle');

    expect(results.phases.length).toBeGreaterThanOrEqual(1);
    expect(results.phases[0]!.standingStart).toBe(true);
    expect(results.brakings.map((b) => b.targetKmh)).toEqual([130, 100, 80, 50]);
    // The stored log has positions from the first fix on, so readiness is reached.
    expect(results.readyAt).not.toBeNull();
  });

  it('reads older logs without the new fields as route logs', () => {
    const legacy = {
      id: 'old',
      name: '20260101-0000',
      startedAt: T0,
      endedAt: T0 + 1000,
      status: 'finished' as const,
      pauses: [],
      stats: null,
      pointCount: 3,
    };
    const meta = withDefaults(legacy);
    expect(meta.type).toBe('route');
    expect(meta.vehicle).toBeNull();
    expect(meta.alertMarks).toEqual([]);
    expect(meta.performance).toBeNull();
  });

  it('keeps route logs as route logs', async () => {
    const log = await recorder.start();
    expect(log.type).toBe('route');
    expect(log.vehicle).toBeNull();
  });
});
