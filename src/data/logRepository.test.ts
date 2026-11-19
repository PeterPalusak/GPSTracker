import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { computeStats } from '../core/statistics';
import { T0, straightRun } from '../core/testFixtures';
import type { Fix } from '../core/types';
import { LogRepository } from './logRepository';

let repo: LogRepository;
let dbCounter = 0;

/** A fresh database per test, so nothing leaks between them. */
beforeEach(async () => {
  repo = await LogRepository.open(`test-db-${dbCounter++}`);
});

const fixesFor = (logId: string, count: number): Fix[] =>
  straightRun(count, 10).map((f) => ({ ...f, logId }));

describe('creating logs (REQ-REC-1, REQ-REC-2)', () => {
  it('creates a log in the recording state', async () => {
    const log = await repo.createLog({ startedAt: T0 });
    expect(log.status).toBe('recording');
    expect(log.name).toBe('20261119-0900');
    expect(log.endedAt).toBeNull();
    expect(log.pointCount).toBe(0);
  });

  it('round-trips through storage', async () => {
    const log = await repo.createLog({ startedAt: T0 });
    expect(await repo.getLog(log.id)).toEqual(log);
  });

  it('gives distinct ids to logs created in the same minute (ambiguity A1)', async () => {
    const a = await repo.createLog({ startedAt: T0 });
    const b = await repo.createLog({ startedAt: T0 });
    expect(a.id).not.toBe(b.id);
    expect(a.name).toBe(b.name); // names may collide; ids must not
  });
});

describe('appending fixes (REQ-STO-2, REQ-PLAT-6)', () => {
  it('stores fixes and keeps the count in step', async () => {
    const log = await repo.createLog({ startedAt: T0 });
    await repo.appendFixes(log.id, fixesFor(log.id, 10));

    expect(await repo.countPoints(log.id)).toBe(10);
    expect((await repo.getLog(log.id))?.pointCount).toBe(10);
  });

  it('appends in batches of any size', async () => {
    const log = await repo.createLog({ startedAt: T0 });
    const fixes = fixesFor(log.id, 30);

    await repo.appendFixes(log.id, fixes.slice(0, 1));
    await repo.appendFixes(log.id, fixes.slice(1, 15));
    await repo.appendFixes(log.id, fixes.slice(15));

    expect(await repo.countPoints(log.id)).toBe(30);
    expect((await repo.getLog(log.id))?.pointCount).toBe(30);
  });

  it('ignores an empty batch', async () => {
    const log = await repo.createLog({ startedAt: T0 });
    await repo.appendFixes(log.id, []);
    expect((await repo.getLog(log.id))?.pointCount).toBe(0);
  });

  it('rejects appending to a log that does not exist', async () => {
    await expect(repo.appendFixes('nope', fixesFor('nope', 1))).rejects.toThrow(/No such log/);
  });

  it('returns points in seq order', async () => {
    const log = await repo.createLog({ startedAt: T0 });
    const fixes = fixesFor(log.id, 20);
    // Written out of order; the compound key must still read back sorted.
    await repo.appendFixes(log.id, [...fixes].reverse());

    const read = await repo.readPoints(log.id);
    expect(read.map((f) => f.seq)).toEqual(fixes.map((f) => f.seq));
  });

  it('resumes sequence numbering after a restart', async () => {
    const log = await repo.createLog({ startedAt: T0 });
    await repo.appendFixes(log.id, fixesFor(log.id, 7));
    expect(await repo.nextSeq(log.id)).toBe(7);
  });

  it('starts sequence numbering at zero for a new log', async () => {
    const log = await repo.createLog({ startedAt: T0 });
    expect(await repo.nextSeq(log.id)).toBe(0);
  });
});

describe('isolation between logs', () => {
  it('keeps each log′s points separate', async () => {
    const a = await repo.createLog({ startedAt: T0 });
    const b = await repo.createLog({ startedAt: T0 + 60_000 });

    await repo.appendFixes(a.id, fixesFor(a.id, 5));
    await repo.appendFixes(b.id, fixesFor(b.id, 9));

    expect(await repo.countPoints(a.id)).toBe(5);
    expect(await repo.countPoints(b.id)).toBe(9);
    expect((await repo.readPoints(a.id)).every((f) => f.logId === a.id)).toBe(true);
  });
});

describe('finalising (REQ-REC-5, REQ-REC-16)', () => {
  it('closes a log as finished', async () => {
    const log = await repo.createLog({ startedAt: T0 });
    const fixes = fixesFor(log.id, 11);
    await repo.appendFixes(log.id, fixes);

    const stats = computeStats(fixes, { startedAt: T0, endedAt: T0 + 10_000, pauses: [] });
    const done = await repo.finaliseLog(log.id, {
      endedAt: T0 + 10_000,
      status: 'finished',
      stats,
    });

    expect(done.status).toBe('finished');
    expect(done.endedAt).toBe(T0 + 10_000);
    expect(done.stats?.distance).toBeCloseTo(100, 1);
  });

  it('closes a log as unfinished after an interruption', async () => {
    const log = await repo.createLog({ startedAt: T0 });
    const done = await repo.finaliseLog(log.id, {
      endedAt: T0 + 5_000,
      status: 'unfinished',
      stats: computeStats([], { startedAt: T0, endedAt: T0 + 5_000, pauses: [] }),
    });
    expect(done.status).toBe('unfinished');
  });

  it('closes any pause interval left open', async () => {
    const log = await repo.createLog({ startedAt: T0 });
    await repo.setPauses(log.id, [{ from: T0 + 2_000, to: null }]);

    const done = await repo.finaliseLog(log.id, {
      endedAt: T0 + 9_000,
      status: 'unfinished',
      stats: computeStats([], { startedAt: T0, endedAt: T0 + 9_000, pauses: [] }),
    });

    expect(done.pauses).toEqual([{ from: T0 + 2_000, to: T0 + 9_000 }]);
  });
});

describe('recovering an interrupted log (REQ-REC-15)', () => {
  it('finds a log still marked recording', async () => {
    const log = await repo.createLog({ startedAt: T0 });
    expect((await repo.findOpenLog())?.id).toBe(log.id);
  });

  it('finds nothing once every log is closed', async () => {
    const log = await repo.createLog({ startedAt: T0 });
    await repo.finaliseLog(log.id, {
      endedAt: T0 + 1_000,
      status: 'finished',
      stats: computeStats([], { startedAt: T0, endedAt: T0 + 1_000, pauses: [] }),
    });
    expect(await repo.findOpenLog()).toBeUndefined();
  });

  it('finds nothing in an empty database', async () => {
    expect(await repo.findOpenLog()).toBeUndefined();
  });

  it('retains the points recorded before the interruption (REQ-REC-16)', async () => {
    const log = await repo.createLog({ startedAt: T0 });
    await repo.appendFixes(log.id, fixesFor(log.id, 42));

    const open = await repo.findOpenLog();
    expect(await repo.countPoints(open!.id)).toBe(42);
  });
});

describe('deleting (REQ-REC-13, REQ-NAV-8)', () => {
  it('removes the log and all its points', async () => {
    const log = await repo.createLog({ startedAt: T0 });
    await repo.appendFixes(log.id, fixesFor(log.id, 25));

    await repo.deleteLog(log.id);

    expect(await repo.getLog(log.id)).toBeUndefined();
    expect(await repo.countPoints(log.id)).toBe(0);
  });

  it('leaves other logs untouched', async () => {
    const a = await repo.createLog({ startedAt: T0 });
    const b = await repo.createLog({ startedAt: T0 + 60_000 });
    await repo.appendFixes(a.id, fixesFor(a.id, 5));
    await repo.appendFixes(b.id, fixesFor(b.id, 5));

    await repo.deleteLog(a.id);

    expect(await repo.getLog(b.id)).toBeDefined();
    expect(await repo.countPoints(b.id)).toBe(5);
  });
});

describe('listing (REQ-NAV-2)', () => {
  it('returns logs newest first', async () => {
    const first = await repo.createLog({ startedAt: T0 });
    const second = await repo.createLog({ startedAt: T0 + 3_600_000 });
    const third = await repo.createLog({ startedAt: T0 + 7_200_000 });

    expect((await repo.listLogs()).map((l) => l.id)).toEqual([third.id, second.id, first.id]);
  });

  it('returns an empty list when nothing has been recorded (REQ-STAT-14)', async () => {
    expect(await repo.listLogs()).toEqual([]);
  });
});

describe('streaming', () => {
  it('yields points in order without materialising the array', async () => {
    const log = await repo.createLog({ startedAt: T0 });
    await repo.appendFixes(log.id, fixesFor(log.id, 100));

    const seqs: number[] = [];
    for await (const fix of repo.streamPoints(log.id)) seqs.push(fix.seq);

    expect(seqs).toHaveLength(100);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  });
});

describe('a realistic log size', () => {
  it('handles a three-hour ride at 1 Hz', async () => {
    const log = await repo.createLog({ startedAt: T0 });
    const fixes = fixesFor(log.id, 10_800);

    for (let i = 0; i < fixes.length; i += 600) {
      await repo.appendFixes(log.id, fixes.slice(i, i + 600));
    }

    expect(await repo.countPoints(log.id)).toBe(10_800);

    const stats = computeStats(await repo.readPoints(log.id), {
      startedAt: T0,
      endedAt: T0 + 10_799_000,
      pauses: [],
    });
    expect(stats.distance).toBeCloseTo(107_990, -2);
  });
});
