import { describe, expect, it } from 'vitest';
import {
  canApply,
  controlsFor,
  isLogOpen,
  nextState,
  requiresConfirmation,
  type RecordingEvent,
} from './recordingMachine';
import type { RecordingState } from './types';

const ALL_STATES: RecordingState[] = ['idle', 'recording', 'paused'];
const ALL_EVENTS: RecordingEvent[] = ['START', 'STOP', 'PAUSE', 'RESUME', 'CANCEL'];

describe('transitions', () => {
  it('starts a log from idle (REQ-REC-1)', () => {
    expect(nextState('idle', 'START')).toBe('recording');
  });

  it('pauses and resumes within one log (REQ-REC-7, REQ-REC-9)', () => {
    expect(nextState('recording', 'PAUSE')).toBe('paused');
    expect(nextState('paused', 'RESUME')).toBe('recording');
  });

  it('allows Pause/Re-Start any number of times (REQ-REC-9b)', () => {
    let state: RecordingState = 'recording';
    for (let i = 0; i < 5; i++) {
      state = nextState(state, 'PAUSE')!;
      expect(state).toBe('paused');
      state = nextState(state, 'RESUME')!;
      expect(state).toBe('recording');
    }
  });

  it('stops from both recording and paused (REQ-REC-6a)', () => {
    expect(nextState('recording', 'STOP')).toBe('idle');
    expect(nextState('paused', 'STOP')).toBe('idle');
  });

  it('cancels from both recording and paused (REQ-REC-12)', () => {
    expect(nextState('recording', 'CANCEL')).toBe('idle');
    expect(nextState('paused', 'CANCEL')).toBe('idle');
  });

  it('never starts a second log while one is open', () => {
    // The structural guarantee that replaced blocker B1.
    expect(nextState('recording', 'START')).toBeNull();
    expect(nextState('paused', 'START')).toBeNull();
  });

  it('rejects every other event from idle', () => {
    for (const event of ALL_EVENTS.filter((e) => e !== 'START')) {
      expect(nextState('idle', event)).toBeNull();
    }
  });

  it('rejects RESUME while recording and PAUSE while paused', () => {
    expect(nextState('recording', 'RESUME')).toBeNull();
    expect(nextState('paused', 'PAUSE')).toBeNull();
  });

  it('only ever reaches known states', () => {
    for (const state of ALL_STATES) {
      for (const event of ALL_EVENTS) {
        const next = nextState(state, event);
        if (next !== null) expect(ALL_STATES).toContain(next);
      }
    }
  });

  it('canApply agrees with nextState', () => {
    for (const state of ALL_STATES) {
      for (const event of ALL_EVENTS) {
        expect(canApply(state, event)).toBe(nextState(state, event) !== null);
      }
    }
  });
});

describe('isLogOpen', () => {
  it('is true while recording and paused, false when idle', () => {
    expect(isLogOpen('idle')).toBe(false);
    expect(isLogOpen('recording')).toBe(true);
    expect(isLogOpen('paused')).toBe(true);
  });
});

describe('control projection', () => {
  it('shows Start, unhighlighted, with Pause and Cancel disabled when idle (REQ-REC-0)', () => {
    const c = controlsFor('idle');
    expect(c.primary).toMatchObject({ label: 'Start', enabled: true, highlighted: false });
    expect(c.pause.enabled).toBe(false);
    expect(c.cancel.enabled).toBe(false);
  });

  it('shows a highlighted Stop with Pause and Cancel enabled while recording (REQ-REC-3, REQ-REC-4)', () => {
    const c = controlsFor('recording');
    expect(c.primary).toMatchObject({ label: 'Stop', enabled: true, highlighted: true });
    expect(c.pause).toMatchObject({ label: 'Pause', enabled: true });
    expect(c.cancel.enabled).toBe(true);
  });

  it('keeps Stop highlighted and enabled while paused, with Re-Start offered (REQ-REC-8, REQ-REC-11)', () => {
    const c = controlsFor('paused');
    expect(c.primary).toMatchObject({ label: 'Stop', enabled: true, highlighted: true });
    expect(c.pause).toMatchObject({ label: 'Re-Start', enabled: true });
    expect(c.cancel.enabled).toBe(true);
  });

  it('highlights the primary button exactly when a log is open', () => {
    for (const state of ALL_STATES) {
      expect(controlsFor(state).primary.highlighted).toBe(isLogOpen(state));
    }
  });

  it('keeps the primary button enabled in every state', () => {
    // The merge removed the disabled-but-highlighted control entirely.
    for (const state of ALL_STATES) {
      expect(controlsFor(state).primary.enabled).toBe(true);
    }
  });

  it('only offers events that are legal in the current state', () => {
    for (const state of ALL_STATES) {
      const c = controlsFor(state);
      for (const button of [c.primary, c.pause, c.cancel]) {
        if (button.enabled && button.event) {
          expect(canApply(state, button.event)).toBe(true);
        }
      }
    }
  });

  it('disables a button exactly when it has no event to dispatch', () => {
    for (const state of ALL_STATES) {
      const c = controlsFor(state);
      for (const button of [c.pause, c.cancel]) {
        expect(button.enabled).toBe(button.event !== null);
      }
    }
  });
});

describe('confirmation', () => {
  it('requires confirmation only for Cancel (REQ-REC-12a)', () => {
    expect(requiresConfirmation('CANCEL')).toBe(true);
    for (const event of ALL_EVENTS.filter((e) => e !== 'CANCEL')) {
      expect(requiresConfirmation(event)).toBe(false);
    }
  });
});
