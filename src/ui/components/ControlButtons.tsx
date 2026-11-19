/**
 * The three recording controls (requirements §3).
 *
 * This component contains no rules of its own: it renders whatever
 * `controlsFor` says, so the button specification lives in one tested
 * table rather than in JSX.
 */

import { controlsFor, type RecordingEvent } from '../../core/recordingMachine';
import type { RecordingState } from '../../core/types';

interface ControlButtonsProps {
  state: RecordingState;
  busy: boolean;
  onEvent: (event: RecordingEvent) => void;
}

export function ControlButtons({ state, busy, onEvent }: ControlButtonsProps) {
  const controls = controlsFor(state);

  return (
    <div class="controls">
      <button
        type="button"
        class={`btn btn-primary${controls.primary.highlighted ? ' is-live' : ''}`}
        disabled={busy}
        onClick={() => controls.primary.event && onEvent(controls.primary.event)}
      >
        {controls.primary.label}
      </button>

      <div class="controls-secondary">
        <button
          type="button"
          class="btn"
          disabled={!controls.pause.enabled || busy}
          onClick={() => controls.pause.event && onEvent(controls.pause.event)}
        >
          {controls.pause.label}
        </button>
        <button
          type="button"
          class="btn btn-danger-outline"
          disabled={!controls.cancel.enabled || busy}
          onClick={() => controls.cancel.event && onEvent(controls.cancel.event)}
        >
          {controls.cancel.label}
        </button>
      </div>
    </div>
  );
}
