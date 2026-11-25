/**
 * Static shape of the Performance screen and its panels (REQ-ACC-1, §7.1, §8.1).
 *
 * Server rendering does not run effects, so these check what is on screen for
 * a given state, not the recording flow (that is in performanceFlow.test.ts).
 */

import 'fake-indexeddb/auto';
import render from 'preact-render-to-string';
import { beforeEach, describe, expect, it } from 'vitest';
import { Recorder } from '../../app/recorder';
import { analysePerformance } from '../../core/performance/analysis';
import { DEFAULT_SETTINGS } from '../../core/settings';
import { T0 } from '../../core/testFixtures';
import { LogRepository } from '../../data/logRepository';
import { FakeLocationSource } from '../../platform/FakeLocationSource';
import { FakeSharer } from '../../platform/FakeSharer';
import { fixAt } from '../../core/testFixtures';
import type { LogMeta } from '../../core/types';
import { PerformancePanel } from '../components/PerformancePanel';
import { WantedSpeedControl } from '../components/WantedSpeedControl';
import { PerformanceScreen } from './PerformanceScreen';

let repo: LogRepository;
let recorder: Recorder;
let dbCounter = 0;

beforeEach(async () => {
  repo = await LogRepository.open(`performance-screen-db-${dbCounter++}`);
  recorder = new Recorder({ repository: repo, source: new FakeLocationSource(), now: () => T0 });
});

function screen(overrides: Partial<Parameters<typeof PerformanceScreen>[0]> = {}): string {
  return render(
    <PerformanceScreen
      recorder={recorder}
      repository={repo}
      sharer={new FakeSharer()}
      settings={{ ...DEFAULT_SETTINGS }}
      onSettingsChange={() => {}}
      units="km"
      permission="granted"
      canOpenSettings={false}
      indicative={true}
      onRequestPermission={() => {}}
      onOpenSettings={() => {}}
      revision={0}
      onLogsChanged={() => {}}
      {...overrides}
    />,
  );
}

describe('Performance screen', () => {
  it('offers Start, the vehicle choice and the two tabs', () => {
    const html = screen();
    expect(html).toContain('>Start<');
    expect(html).toContain('>Motorcycle<');
    expect(html).toContain('>Car<');
    expect(html).toContain('>Bicycle<');
    expect(html).toContain('>Acceleration<');
    expect(html).toContain('>Deceleration<');
  });

  it('shows the readiness light as Not recording when idle', () => {
    expect(screen()).toContain('Not recording');
  });

  it('says on the PWA that readiness is indicative only once recording', () => {
    // Indicative is only shown while a log is open; idle shows the off state.
    expect(screen({ indicative: true })).not.toContain('Indicative');
  });

  it('shows the wanted-speed control on the Deceleration tab only', () => {
    expect(screen()).not.toContain('Wanted speed');
    expect(screen({ settings: { ...DEFAULT_SETTINGS } })).not.toContain('Alert at');
  });
});

describe('PerformancePanel', () => {
  const log: LogMeta = {
    id: 'l1',
    name: '20261125-0900',
    startedAt: T0,
    endedAt: T0 + 30_000,
    status: 'finished',
    pauses: [],
    stats: null,
    pointCount: 0,
    type: 'performance',
    vehicle: 'motorcycle',
    alertMarks: [],
    performance: null,
  };

  it('asks for a log when none is chosen', () => {
    const html = render(
      <PerformancePanel log={null} results={null} loading={false} kind="acceleration" units="km" sharer={null} />,
    );
    expect(html).toContain('Choose a performance log');
  });

  it('says it is analysing while the results are not ready', () => {
    const html = render(
      <PerformancePanel log={log} results={null} loading={true} kind="acceleration" units="km" sharer={null} />,
    );
    expect(html).toContain('Analysing');
  });

  it('shows the standing-start measurements as a table', () => {
    const fixes = Array.from({ length: 400 }, (_, i) =>
      fixAt(i, i * 200, 0, { spd: Math.min(3 * Math.max(0, i * 0.2 - 2), 50), acc: 4 }),
    );
    const results = analysePerformance(fixes, 'motorcycle');
    const html = render(
      <PerformancePanel log={log} results={results} loading={false} kind="acceleration" units="km" sharer={null} />,
    );
    expect(html).toContain('0–100 km/h');
    expect(html).toContain('1/4 mile');
    expect(html).toContain('standing');
    expect(html).toContain('acceleration phase');
  });

  it('lists the four braking targets on the Deceleration tab, even when empty', () => {
    const html = render(
      <PerformancePanel log={log} results={analysePerformance([], 'motorcycle')} loading={false} kind="deceleration" units="km" sharer={null} />,
    );
    expect(html).toContain('No braking to a stop from 130, 100, 80 or 50 km/h');
  });
});

describe('WantedSpeedControl', () => {
  it('offers the four braking targets, in km/h or mph', () => {
    const km = render(<WantedSpeedControl units="km" value={null} noticeSeen={true} onChange={() => {}} onNoticeSeen={() => {}} />);
    expect(km).toContain('130 km/h');
    expect(km).toContain('50 km/h');
    const mi = render(<WantedSpeedControl units="mi" value={null} noticeSeen={true} onChange={() => {}} onNoticeSeen={() => {}} />);
    expect(mi).toContain('81 mph');
  });

  it('shows the one-time safety notice the first time a speed is set', () => {
    const html = render(<WantedSpeedControl units="km" value={130} noticeSeen={false} onChange={() => {}} onNoticeSeen={() => {}} />);
    expect(html).toContain('Do not operate the phone while driving');
    expect(html).toContain('Alert at 130 km/h');
  });

  it('does not repeat the notice once acknowledged', () => {
    const html = render(<WantedSpeedControl units="km" value={130} noticeSeen={true} onChange={() => {}} onNoticeSeen={() => {}} />);
    expect(html).not.toContain('Do not operate the phone while driving');
  });
});
