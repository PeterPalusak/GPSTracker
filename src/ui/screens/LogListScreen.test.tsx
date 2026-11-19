import 'fake-indexeddb/auto';
import render from 'preact-render-to-string';
import { beforeEach, describe, expect, it } from 'vitest';
import { computeStats } from '../../core/statistics';
import { T0, straightRun } from '../../core/testFixtures';
import type { LogMeta, Stats, Units } from '../../core/types';
import { LogRepository } from '../../data/logRepository';
import { FakeSharer } from '../../platform/FakeSharer';
import { LogList } from '../components/LogList';
import { LogListScreen } from './LogListScreen';

let repo: LogRepository;
let dbCounter = 0;

beforeEach(async () => {
  repo = await LogRepository.open(`loglist-db-${dbCounter++}`);
});

const units: Units = 'km';

function meta(overrides: Partial<LogMeta> = {}): LogMeta {
  const stats: Stats = computeStats(straightRun(11, 10), {
    startedAt: T0,
    endedAt: T0 + 10_000,
    pauses: [],
  });
  return {
    id: 'log-1',
    name: '20261119-0914',
    startedAt: T0,
    endedAt: T0 + 10_000,
    status: 'finished',
    pauses: [],
    stats,
    pointCount: 11,
    ...overrides,
  };
}

describe('LogList (REQ-NAV-2, REQ-NAV-3)', () => {
  const noop = () => {};

  it('shows an empty state when nothing has been recorded', () => {
    const html = render(
      <LogList logs={[]} selectedId={null} units={units} onSelect={noop} onDelete={noop} />,
    );
    expect(html).toContain('No rides recorded yet');
  });

  it('lists each log with its name, distance and duration', () => {
    const html = render(
      <LogList
        logs={[meta()]}
        selectedId={null}
        units={units}
        onSelect={noop}
        onDelete={noop}
      />,
    );
    expect(html).toContain('20261119-0914');
    expect(html).toContain('0.10'); // 100 m in km
    expect(html).toContain('0:10');
  });

  it('marks logs closed by recovery as unfinished (REQ-NAV-9)', () => {
    const html = render(
      <LogList
        logs={[meta({ status: 'unfinished' })]}
        selectedId={null}
        units={units}
        onSelect={noop}
        onDelete={noop}
      />,
    );
    expect(html).toContain('unfinished');
  });

  it('does not mark a normally finished log', () => {
    const html = render(
      <LogList logs={[meta()]} selectedId={null} units={units} onSelect={noop} onDelete={noop} />,
    );
    expect(html).not.toContain('badge-warn');
  });

  it('gives every log a Delete button (REQ-NAV-8)', () => {
    const logs = [meta({ id: 'a', name: 'a' }), meta({ id: 'b', name: 'b' })];
    const html = render(
      <LogList logs={logs} selectedId={null} units={units} onSelect={noop} onDelete={noop} />,
    );
    expect(html.match(/log-row-delete/g)).toHaveLength(2);
  });

  it('marks the selected row', () => {
    const html = render(
      <LogList
        logs={[meta()]}
        selectedId="log-1"
        units={units}
        onSelect={noop}
        onDelete={noop}
      />,
    );
    expect(html).toContain('is-selected');
  });

  it('switches units with the setting', () => {
    const html = render(
      <LogList logs={[meta()]} selectedId={null} units="mi" onSelect={noop} onDelete={noop} />,
    );
    expect(html).toContain('mi');
  });
});

describe('LogListScreen', () => {
  it('renders without throwing', () => {
    const html = render(
      <LogListScreen
        repository={repo}
        sharer={new FakeSharer()}
        units={units}
        exportFormat="gpx"
        revision={0}
        onLogsChanged={() => {}}
      />,
    );
    expect(html).toContain('Loading');
  });
});

describe('listing excludes a recording in progress', () => {
  it('omits the open log, so its Delete button cannot appear', async () => {
    // Deleting the log the recorder is writing to would leave it pointing
    // at nothing; the list therefore only shows closed logs.
    const open = await repo.createLog({ startedAt: T0 });
    const closed = await repo.createLog({ startedAt: T0 - 60_000 });
    await repo.finaliseLog(closed.id, {
      endedAt: T0 - 30_000,
      status: 'finished',
      stats: computeStats([], { startedAt: T0 - 60_000, endedAt: T0 - 30_000, pauses: [] }),
    });

    const all = await repo.listLogs();
    const listed = all.filter((log) => log.status !== 'recording');

    expect(all).toHaveLength(2);
    expect(listed).toHaveLength(1);
    expect(listed[0]!.id).toBe(closed.id);
    expect(listed.some((log) => log.id === open.id)).toBe(false);
  });
});
