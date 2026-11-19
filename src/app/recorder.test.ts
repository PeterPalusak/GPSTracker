import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { METRES_PER_DEG_LAT, T0 } from '../core/testFixtures';
import { LogRepository } from '../data/logRepository';
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
  repo = await LogRepository.open(`recorder-db-${dbCounter++}`);
  source = new FakeLocationSource();
  recorder = new Recorder({ repository: repo, source, now: () => clock });
});

const advance = (ms: number): number => (clock += ms);

/** A good fix `northMetres` north of the origin. */
function fix(northMetres: number, overrides: Partial<RawFix> = {}): RawFix {
  return {
    t: clock,
    lat: 48 + northMetres / METRES_PER_DEG_LAT,
    lon: 17,
    alt: null,
    acc: 8,
    spd: null,
    hdg: null,
    ...overrides,
  };
}

/** Emit `count` fixes a second apart at a constant speed. */
async function ride(count: number, speedMps = 10): Promise<void> {
  for (let i = 0; i < count; i++) {
    source.emitOne(fix(i * speedMps, { spd: speedMps }));
    advance(1000);
  }
  await recorder.settled();
}

describe('starting (REQ-REC-1)', () => {
  it('creates a log and starts the source', async () => {
    const log = await recorder.start();
    expect(log.status).toBe('recording');
    expect(source.running).toBe(true);
    expect(recorder.snapshot().recording).toBe('recording');
  });

  it('refuses to start a second log while one is open', async () => {
    await recorder.start();
    await expect(recorder.start()).rejects.toThrow(/Cannot START/);
  });

  it('reports acquiring until the first fix (REQ-GPS-2)', async () => {
    await recorder.start();
    expect(recorder.snapshot().signal).toBe('acquiring');
  });

  it('reports tracking once fixes arrive', async () => {
    await recorder.start();
    await ride(3);
    expect(recorder.snapshot().signal).toBe('tracking');
  });
});

describe('acquisition gate (REQ-GPS-1, REQ-GPS-3)', () => {
  it('records nothing before a usable fix arrives', async () => {
    const log = await recorder.start();
    source.emitOne(fix(0, { acc: 2_000 })); // network-derived position
    await recorder.settled();

    expect(await repo.countPoints(log.id)).toBe(0);
    expect(recorder.snapshot().signal).toBe('acquiring');
  });

  it('records nothing until two consecutive qualifying fixes', async () => {
    const log = await recorder.start();
    source.emitOne(fix(0, { acc: 1_000 }));
    source.emitOne(fix(5, { acc: 10 })); // first good one: held back
    await recorder.settled();
    expect(await repo.countPoints(log.id)).toBe(0);

    source.emitOne(fix(10, { acc: 10 })); // second: acquisition
    await recorder.settled();
    // Both qualifying fixes land — the held-back one is not thrown away.
    expect(await repo.countPoints(log.id)).toBe(2);
  });

  it('treats a non-null altitude as a satellite fix even at loose accuracy', async () => {
    // Wi-Fi and cell positioning are 2-D; an altitude implies satellites.
    const log = await recorder.start();
    source.emitOne(fix(0, { acc: 60, alt: 212 }));
    source.emitOne(fix(10, { acc: 60, alt: 213 }));
    await recorder.settled();

    expect(await repo.countPoints(log.id)).toBe(2);
    expect(recorder.snapshot().signal).toBe('tracking');
  });

  it('ignores a lone plausible fix among poor ones', async () => {
    const log = await recorder.start();
    source.emitOne(fix(0, { acc: 2_000 }));
    source.emitOne(fix(5, { acc: 10 }));
    source.emitOne(fix(10, { acc: 2_000 }));
    await recorder.settled();

    expect(await repo.countPoints(log.id)).toBe(0);
  });

  it('uses the satellite count where a native source supplies one', async () => {
    const log = await recorder.start();
    source.emitOne(fix(0, { acc: 5, satellites: 2 })); // too few for a 3-D fix
    source.emitOne(fix(5, { acc: 5, satellites: 2 }));
    await recorder.settled();
    expect(await repo.countPoints(log.id)).toBe(0);

    source.emitOne(fix(10, { acc: 40, satellites: 9 }));
    source.emitOne(fix(20, { acc: 40, satellites: 9 }));
    await recorder.settled();
    expect(await repo.countPoints(log.id)).toBe(2);
  });

  it('keeps recording poor fixes once acquired, without filtering (trap T2)', async () => {
    const log = await recorder.start();
    source.emitOne(fix(0, { acc: 5 }));
    source.emitOne(fix(10, { acc: 5 }));
    source.emitOne(fix(20, { acc: 900 }));
    await recorder.settled();

    // The gate is for acquisition only; outlier rejection was not adopted.
    expect(await repo.countPoints(log.id)).toBe(3);
  });

  it('reacquires from scratch after a pause (REQ-REC-9a)', async () => {
    const log = await recorder.start();
    source.emitOne(fix(0, { acc: 5 }));
    source.emitOne(fix(10, { acc: 5 }));
    await recorder.settled();
    await recorder.pause();
    await recorder.resume();

    source.emitOne(fix(20, { acc: 5 })); // first after resume: held back
    await recorder.settled();
    expect(await repo.countPoints(log.id)).toBe(2);

    source.emitOne(fix(30, { acc: 5 }));
    await recorder.settled();
    expect(await repo.countPoints(log.id)).toBe(4);
  });

  it('falls back to acquiring when fixes stop arriving (REQ-GPS-3)', async () => {
    await recorder.start();
    await ride(3);
    expect(recorder.snapshot().signal).toBe('tracking');

    advance(30_000); // a tunnel
    expect(recorder.snapshot().signal).toBe('acquiring');
  });
});

describe('persisting fixes (REQ-STO-2)', () => {
  it('writes each fix as it arrives', async () => {
    const log = await recorder.start();
    await ride(10);
    expect(await repo.countPoints(log.id)).toBe(10);
  });

  it('numbers fixes consecutively from zero', async () => {
    const log = await recorder.start();
    await ride(5);
    expect((await repo.readPoints(log.id)).map((f) => f.seq)).toEqual([0, 1, 2, 3, 4]);
  });

  it('accepts a batched delivery (REQ-PLAT-6)', async () => {
    const log = await recorder.start();
    source.emit([fix(0, { spd: 10 }), fix(10, { spd: 10 }), fix(20, { spd: 10 })]);
    await recorder.settled();

    expect(await repo.countPoints(log.id)).toBe(3);
    expect(recorder.snapshot().pointCount).toBe(3);
  });

  it('keeps live statistics in step with what is stored', async () => {
    await recorder.start();
    await ride(11);
    const stats = recorder.snapshot().stats;
    expect(stats.distance).toBeCloseTo(100, 0);
    expect(stats.maxSpeed).toBe(10);
  });

  it('reports the observed fix rate (REQ-GPS-6)', async () => {
    await recorder.start();
    await ride(6);
    expect(recorder.snapshot().fixRateHz).toBeCloseTo(1, 1);
  });
});

describe('pause and resume (REQ-REC-7, REQ-REC-9, REQ-REC-9a)', () => {
  it('powers the receiver down on pause', async () => {
    await recorder.start();
    await ride(3);
    await recorder.pause();

    expect(source.running).toBe(false);
    expect(source.stopCount).toBe(1);
    expect(recorder.snapshot().signal).toBe('off');
  });

  it('records nothing that arrives after pausing', async () => {
    const log = await recorder.start();
    await ride(3);
    await recorder.pause();

    source.emitOne(fix(500)); // a straggler from the stopped watch
    await recorder.settled();

    expect(await repo.countPoints(log.id)).toBe(3);
  });

  it('restarts the source and reacquires on resume (REQ-REC-9a)', async () => {
    await recorder.start();
    await ride(3);
    await recorder.pause();
    await recorder.resume();

    expect(source.running).toBe(true);
    expect(source.startCount).toBe(2);
    // The receiver was off, so a fresh fix is needed before recording.
    expect(recorder.snapshot().signal).toBe('acquiring');
  });

  it('continues the same log rather than starting a new one', async () => {
    const log = await recorder.start();
    await ride(3);
    await recorder.pause();
    await recorder.resume();
    await ride(3);

    expect(recorder.snapshot().log?.id).toBe(log.id);
    expect(await repo.countPoints(log.id)).toBe(6);
  });

  it('can be paused and resumed repeatedly (REQ-REC-9b)', async () => {
    await recorder.start();
    for (let i = 0; i < 4; i++) {
      await ride(2);
      await recorder.pause();
      await recorder.resume();
    }
    expect(recorder.snapshot().recording).toBe('recording');
    expect(source.startCount).toBe(5);
  });

  it('excludes paused time from overall time (REQ-STAT-15)', async () => {
    await recorder.start();
    await ride(6); // 6 s
    await recorder.pause();
    advance(60_000); // a one-minute stop
    await recorder.resume();
    await ride(5);

    const { stats } = recorder.snapshot();
    // ~11 s of recording out of ~71 s of wall-clock.
    expect(stats.overallTime).toBeLessThan(20_000);
  });

  it('persists pause intervals as they happen', async () => {
    const log = await recorder.start();
    await ride(2);
    await recorder.pause();

    const stored = await repo.getLog(log.id);
    expect(stored?.pauses).toHaveLength(1);
    expect(stored?.pauses[0]?.to).toBeNull();
  });
});

describe('stopping (REQ-REC-5, REQ-REC-6a)', () => {
  it('finalises the log and returns to idle', async () => {
    await recorder.start();
    await ride(11);
    const done = await recorder.stop();

    expect(done?.status).toBe('finished');
    expect(done?.stats?.distance).toBeCloseTo(100, 0);
    expect(recorder.snapshot().recording).toBe('idle');
    expect(source.running).toBe(false);
  });

  it('stops from the paused state as well', async () => {
    await recorder.start();
    await ride(4);
    await recorder.pause();
    const done = await recorder.stop();

    expect(done?.status).toBe('finished');
    expect(recorder.snapshot().recording).toBe('idle');
  });

  it('closes a pause interval left open by stopping while paused', async () => {
    const log = await recorder.start();
    await ride(2);
    await recorder.pause();
    advance(5_000);
    await recorder.stop();

    const stored = await repo.getLog(log.id);
    expect(stored?.pauses[0]?.to).not.toBeNull();
  });

  it('keeps the recorded points', async () => {
    const log = await recorder.start();
    await ride(20);
    await recorder.stop();
    expect(await repo.countPoints(log.id)).toBe(20);
  });
});

describe('cancelling (REQ-REC-12, REQ-REC-13)', () => {
  it('deletes the log and all its points', async () => {
    const log = await recorder.start();
    await ride(15);
    await recorder.cancel();

    expect(await repo.getLog(log.id)).toBeUndefined();
    expect(await repo.countPoints(log.id)).toBe(0);
    expect(recorder.snapshot().recording).toBe('idle');
  });

  it('cancels from the paused state too', async () => {
    const log = await recorder.start();
    await ride(3);
    await recorder.pause();
    await recorder.cancel();

    expect(await repo.getLog(log.id)).toBeUndefined();
  });

  it('leaves earlier logs alone', async () => {
    const kept = await recorder.start();
    await ride(5);
    await recorder.stop();

    await recorder.start();
    await ride(5);
    await recorder.cancel();

    expect(await repo.getLog(kept.id)).toBeDefined();
    expect(await repo.listLogs()).toHaveLength(1);
  });

  it('clears the statistics panel', async () => {
    await recorder.start();
    await ride(10);
    await recorder.cancel();

    expect(recorder.snapshot().stats.distance).toBe(0);
    expect(recorder.snapshot().log).toBeNull();
  });
});

describe('recovering an interrupted ride (REQ-REC-15…17)', () => {
  it('closes the open log and marks it unfinished', async () => {
    const log = await recorder.start();
    await ride(30);

    // The app is killed: a new Recorder over the same database.
    const revived = new Recorder({ repository: repo, source, now: () => clock });
    const recovered = await revived.recoverInterrupted();

    expect(recovered?.id).toBe(log.id);
    expect(recovered?.status).toBe('unfinished');
    expect(revived.snapshot().recording).toBe('idle');
  });

  it('keeps every position recorded before the interruption (REQ-REC-16)', async () => {
    const log = await recorder.start();
    await ride(30);

    const revived = new Recorder({ repository: repo, source, now: () => clock });
    await revived.recoverInterrupted();

    expect(await repo.countPoints(log.id)).toBe(30);
    expect((await repo.getLog(log.id))?.stats?.distance).toBeCloseTo(290, 0);
  });

  it('does not resume recording automatically (REQ-REC-17)', async () => {
    await recorder.start();
    await ride(5);

    const revived = new Recorder({ repository: repo, source, now: () => clock });
    await revived.recoverInterrupted();

    expect(revived.snapshot().recording).toBe('idle');
    expect(revived.snapshot().signal).toBe('off');
  });

  it('does nothing when the last session ended cleanly', async () => {
    await recorder.start();
    await ride(5);
    await recorder.stop();

    const revived = new Recorder({ repository: repo, source, now: () => clock });
    expect(await revived.recoverInterrupted()).toBeNull();
  });

  it('does nothing on a fresh install', async () => {
    expect(await recorder.recoverInterrupted()).toBeNull();
  });

  it('handles a log interrupted before any fix arrived', async () => {
    const log = await recorder.start();

    const revived = new Recorder({ repository: repo, source, now: () => clock });
    const recovered = await revived.recoverInterrupted();

    expect(recovered?.id).toBe(log.id);
    expect(recovered?.stats?.distance).toBe(0);
  });
});

describe('errors (REQ-PERM-1)', () => {
  it('surfaces a permission denial', async () => {
    await recorder.start();
    source.emitError('permission-denied');
    expect(recorder.snapshot().lastError).toBe('permission-denied');
  });

  it('clears the error once fixes resume', async () => {
    await recorder.start();
    source.emitError('timeout');
    await ride(2);
    expect(recorder.snapshot().lastError).toBeNull();
  });
});

describe('notifications', () => {
  it('notifies subscribers as the ride progresses', async () => {
    const seen: string[] = [];
    recorder.subscribe((s) => seen.push(s.recording));

    await recorder.start();
    await ride(2);
    await recorder.pause();
    await recorder.resume();
    await recorder.stop();

    expect(seen).toContain('recording');
    expect(seen).toContain('paused');
    expect(seen).toContain('idle');
  });

  it('stops notifying after unsubscribe', async () => {
    let count = 0;
    const unsubscribe = recorder.subscribe(() => count++);
    await recorder.start();
    const afterStart = count;

    unsubscribe();
    await ride(5);

    expect(count).toBe(afterStart);
  });
});
