/**
 * Shell smoke tests.
 *
 * Effects do not run during server rendering, so these verify the static
 * shape — that the screens mount, the nav is present, and the main screen
 * reflects recorder state — rather than the startup sequence.
 */

import 'fake-indexeddb/auto';
import render from 'preact-render-to-string';
import { beforeEach, describe, expect, it } from 'vitest';
import { Recorder } from '../app/recorder';
import { T0 } from '../core/testFixtures';
import { LogRepository } from '../data/logRepository';
import { FakeLocationSource } from '../platform/FakeLocationSource';
import { FakeSharer } from '../platform/FakeSharer';
import { App } from './App';
import { MainScreen } from './screens/MainScreen';

let repo: LogRepository;
let source: FakeLocationSource;
let recorder: Recorder;
let clock = T0;
let dbCounter = 0;

beforeEach(async () => {
  clock = T0;
  repo = await LogRepository.open(`app-db-${dbCounter++}`);
  source = new FakeLocationSource();
  recorder = new Recorder({ repository: repo, source, now: () => clock });
});

describe('App shell', () => {
  it('renders without throwing', () => {
    const html = render(<App recorder={recorder} repository={repo} sharer={new FakeSharer()} />);
    expect(html).toContain('GPS Logger');
  });

  it('offers navigation to the logs and settings screens (REQ-NAV-1, REQ-NAV-7)', () => {
    const html = render(<App recorder={recorder} repository={repo} sharer={new FakeSharer()} />);
    expect(html).toContain('>Logs<');
    expect(html).toContain('>Settings<');
  });

  it('starts on the main screen with the controls visible', () => {
    const html = render(<App recorder={recorder} repository={repo} sharer={new FakeSharer()} />);
    expect(html).toContain('>Start<');
  });
});

describe('MainScreen', () => {
  const props = {
    recorder: null as unknown as Recorder,
    units: 'km' as const,
    permission: 'granted' as const,
    canOpenSettings: false,
    lastLog: null,
    onRequestPermission: () => {},
    onOpenSettings: () => {},
    onLogsChanged: () => {},
  };

  it('shows the empty state before anything is recorded (REQ-STAT-3, REQ-STAT-14)', () => {
    const html = render(<MainScreen {...props} recorder={recorder} />);
    expect(html).toContain('No rides recorded yet');
  });

  it('replaces the controls with a permission prompt when refused (REQ-PERM-1)', () => {
    const html = render(<MainScreen {...props} recorder={recorder} permission="denied" />);
    expect(html).toContain('Permit Location');
    expect(html).not.toContain('>Start<');
  });

  it('shows statistics for the last finished log when idle (REQ-STAT-3)', () => {
    const lastLog = {
      id: 'x',
      name: '20261119-0914',
      startedAt: T0,
      endedAt: T0 + 60_000,
      status: 'finished' as const,
      pauses: [],
      pointCount: 60,
      stats: {
        distance: 1234,
        overallTime: 60_000,
        movingTime: 55_000,
        avgSpeed: 20,
        maxSpeed: 30,
        minAlt: 100,
        maxAlt: 150,
        gain: 60,
        drop: 10,
      },
    };

    const html = render(<MainScreen {...props} recorder={recorder} lastLog={lastLog} />);
    expect(html).toContain('20261119-0914');
    expect(html).toContain('1.23'); // 1234 m as km
    expect(html).not.toContain('No rides recorded yet');
  });
});
