/**
 * Smoke tests for the presentational components.
 *
 * The button *rules* are tested in core/recordingMachine.test.ts; these
 * check that the rendered markup actually reflects them, and that the
 * panel copes with the awkward inputs — the empty state and missing
 * altitudes.
 */

import render from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { emptyStats } from '../../core/statistics';
import type { Stats } from '../../core/types';
import { ControlButtons } from './ControlButtons';
import { PermissionGate } from './PermissionGate';
import { SignalIndicator } from './SignalIndicator';
import { StatisticsPanel } from './StatisticsPanel';

const noop = () => {};

const stats: Stats = {
  distance: 42_195,
  overallTime: 7_265_000,
  movingTime: 7_000_000,
  avgSpeed: 5.8,
  maxSpeed: 12.4,
  minAlt: 110,
  maxAlt: 340,
  gain: 620,
  drop: 590,
};

describe('ControlButtons', () => {
  it('offers Start with the others disabled when idle (REQ-REC-0)', () => {
    const html = render(<ControlButtons state="idle" busy={false} onEvent={noop} />);
    expect(html).toContain('>Start<');
    expect(html).not.toContain('>Stop<');
    // Pause and Cancel both disabled.
    expect(html.match(/disabled/g)).toHaveLength(2);
  });

  it('shows a highlighted Stop while recording (REQ-REC-3)', () => {
    const html = render(<ControlButtons state="recording" busy={false} onEvent={noop} />);
    expect(html).toContain('>Stop<');
    expect(html).toContain('is-live');
    expect(html).toContain('>Pause<');
    expect(html).not.toContain('disabled');
  });

  it('shows Re-Start while paused, with Stop still highlighted (REQ-REC-8, REQ-REC-11)', () => {
    const html = render(<ControlButtons state="paused" busy={false} onEvent={noop} />);
    expect(html).toContain('>Stop<');
    expect(html).toContain('is-live');
    expect(html).toContain('>Re-Start<');
  });

  it('never renders the primary button disabled', () => {
    // The merge removed the disabled-but-highlighted control entirely.
    for (const state of ['idle', 'recording', 'paused'] as const) {
      const html = render(<ControlButtons state={state} busy={false} onEvent={noop} />);
      const primary = html.slice(html.indexOf('btn-primary'), html.indexOf('</button>'));
      expect(primary).not.toContain('disabled');
    }
  });

  it('disables everything while a transition is in flight', () => {
    const html = render(<ControlButtons state="recording" busy onEvent={noop} />);
    expect(html.match(/disabled/g)).toHaveLength(3);
  });
});

describe('StatisticsPanel', () => {
  it('shows an empty state when nothing has been recorded (REQ-STAT-14)', () => {
    const html = render(<StatisticsPanel stats={null} units="km" caption={null} />);
    expect(html).toContain('No rides recorded yet');
    expect(html).not.toContain('stat-value');
  });

  it('renders all nine metrics (REQ-STAT-4…13)', () => {
    const html = render(<StatisticsPanel stats={stats} units="km" caption="20261119-0914" />);
    for (const label of [
      'Distance',
      'Overall time',
      'Moving time',
      'Average speed',
      'Max speed',
      'Min height',
      'Max height',
      'Height gained',
      'Height dropped',
    ]) {
      expect(html).toContain(label);
    }
    expect(html.match(/stat-value/g)).toHaveLength(9);
  });

  it('gives the first three metrics more weight', () => {
    const html = render(<StatisticsPanel stats={stats} units="km" caption={null} />);
    expect(html.match(/stat-large/g)).toHaveLength(3);
  });

  it('switches units together (REQ-SET-2)', () => {
    const html = render(<StatisticsPanel stats={stats} units="mi" caption={null} />);
    expect(html).toContain('mi');
    expect(html).toContain('mph');
    expect(html).toContain('ft');
    expect(html).not.toContain('km/h');
  });

  it('renders a dash for altitudes that were never recorded (REQ-GPS-7)', () => {
    const html = render(
      <StatisticsPanel
        stats={{ ...emptyStats(), distance: 100 }}
        units="km"
        caption={null}
      />,
    );
    expect(html).toContain('—');
  });

  it('shows the log name as a caption', () => {
    const html = render(<StatisticsPanel stats={stats} units="km" caption="20261119-0914" />);
    expect(html).toContain('20261119-0914');
  });
});

describe('SignalIndicator (REQ-GPS-2, REQ-GPS-6)', () => {
  it('reports acquiring plainly rather than as an error', () => {
    const html = render(
      <SignalIndicator signal="acquiring" fixRateHz={null} pointCount={0} />,
    );
    expect(html).toContain('Acquiring signal');
    expect(html).toContain('signal-acquiring');
  });

  it('shows the fix rate and point count while tracking', () => {
    const html = render(<SignalIndicator signal="tracking" fixRateHz={1.02} pointCount={1234} />);
    expect(html).toContain('1.0 Hz');
    expect(html).toContain('1,234');
  });

  it('says the receiver is off while paused (REQ-REC-7)', () => {
    const html = render(<SignalIndicator signal="off" fixRateHz={null} pointCount={9} />);
    expect(html).toContain('Receiver off');
  });
});

describe('PermissionGate (REQ-PERM-1…3)', () => {
  it('always offers a Permit Location button', () => {
    const html = render(
      <PermissionGate
        permission="prompt"
        canOpenSettings={false}
        onRequest={noop}
        onOpenSettings={noop}
      />,
    );
    expect(html).toContain('Permit Location');
  });

  it('points at browser settings on the web when permission was refused (REQ-PERM-3)', () => {
    const html = render(
      <PermissionGate
        permission="denied"
        canOpenSettings={false}
        onRequest={noop}
        onOpenSettings={noop}
      />,
    );
    expect(html).toContain('browser settings');
  });

  it('points at app settings where they can be opened (REQ-PERM-2)', () => {
    const html = render(
      <PermissionGate
        permission="denied"
        canOpenSettings
        onRequest={noop}
        onOpenSettings={noop}
      />,
    );
    expect(html).toContain('app settings');
  });
});
