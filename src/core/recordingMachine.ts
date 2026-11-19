/**
 * The recording state machine (REQ-REC-0…14) and its projection onto the
 * three on-screen controls.
 *
 * Pure: no side effects, no storage, no platform APIs. The recorder in
 * `app/recorder.ts` owns the consequences of a transition; this module only
 * says which transitions are legal and what the buttons should look like.
 */

import type { RecordingState } from './types';

export type RecordingEvent = 'START' | 'STOP' | 'PAUSE' | 'RESUME' | 'CANCEL';

/**
 * Legal transitions. Anything absent is rejected rather than ignored, so a
 * UI bug surfaces as a thrown error in development instead of silent
 * nonsense in a log.
 */
const TRANSITIONS: Record<RecordingState, Partial<Record<RecordingEvent, RecordingState>>> = {
  idle: {
    START: 'recording',
  },
  recording: {
    // Stop and Cancel are reachable from both open states (REQ-REC-6a).
    STOP: 'idle',
    CANCEL: 'idle',
    PAUSE: 'paused',
  },
  paused: {
    STOP: 'idle',
    CANCEL: 'idle',
    RESUME: 'recording',
  },
};

/** The state reached by applying `event`, or null if the event is not legal. */
export function nextState(
  state: RecordingState,
  event: RecordingEvent,
): RecordingState | null {
  return TRANSITIONS[state][event] ?? null;
}

export function canApply(state: RecordingState, event: RecordingEvent): boolean {
  return nextState(state, event) !== null;
}

/** True while a log is open, whether or not it is currently paused. */
export function isLogOpen(state: RecordingState): boolean {
  return state !== 'idle';
}

// --- Control projection -----------------------------------------------------

export interface ButtonView<Label extends string> {
  label: Label;
  enabled: boolean;
  /** Highlighted means "a log is open" — true while recording and paused. */
  highlighted: boolean;
  /** The event this press dispatches, or null when the button is disabled. */
  event: RecordingEvent | null;
}

export interface ControlsView {
  /** Combined Start / Stop button (requirements §3.1). */
  primary: ButtonView<'Start' | 'Stop'>;
  /** Combined Pause / Re-Start button (requirements §3.3). */
  pause: ButtonView<'Pause' | 'Re-Start'>;
  cancel: ButtonView<'Cancel'>;
}

/**
 * Map a state to the three controls.
 *
 * This table is the whole of the button specification: Start and Stop share
 * one control, the highlight tracks whether a log is open rather than
 * whether it is recording, and nothing but the label changes between the
 * recording and paused rows of the primary button.
 */
export function controlsFor(state: RecordingState): ControlsView {
  const open = isLogOpen(state);

  return {
    primary: {
      label: open ? 'Stop' : 'Start',
      enabled: true,
      highlighted: open,
      event: open ? 'STOP' : 'START',
    },
    pause: {
      label: state === 'paused' ? 'Re-Start' : 'Pause',
      enabled: open,
      highlighted: false,
      event: open ? (state === 'paused' ? 'RESUME' : 'PAUSE') : null,
    },
    cancel: {
      label: 'Cancel',
      enabled: open,
      highlighted: false,
      event: open ? 'CANCEL' : null,
    },
  };
}

/**
 * Whether an event needs the user to confirm before it is applied
 * (REQ-REC-12a). Delete confirmation (REQ-NAV-8a) is handled in the log
 * list, not here.
 */
export function requiresConfirmation(event: RecordingEvent): boolean {
  return event === 'CANCEL';
}
