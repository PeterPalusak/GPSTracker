/**
 * The wanted-speed alert as seen and heard (Accelleration_Requirements.MD §8.3).
 *
 * Each new firing (a change in `count`) plays the sound and shows a full-screen
 * blinking panel for ALERT_DURATION_MS. A tap dismisses it early (REQ-ACC-151).
 * The blink runs at 3 cycles a second, the photosensitivity limit in §8.3.
 */

import { useEffect, useState } from 'preact/hooks';
import { ALERT_DURATION_MS } from '../../core/performance/constants';
import { playAlarm } from '../../platform/alarm';

interface AlertOverlayProps {
  /** Increases by one each time the alert fires. */
  count: number;
  vibrate: boolean;
  /** The wanted speed, already formatted for display. */
  wantedLabel: string | null;
}

export function AlertOverlay({ count, vibrate, wantedLabel }: AlertOverlayProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (count === 0) return;
    setVisible(true);
    playAlarm(vibrate);
    const id = setTimeout(() => setVisible(false), ALERT_DURATION_MS);
    return () => clearTimeout(id);
    // Only a new firing should start the alarm; `vibrate` is read at that moment.
  }, [count]);

  if (!visible) return null;

  return (
    <div
      class="alert-overlay"
      role="alertdialog"
      aria-live="assertive"
      onClick={() => setVisible(false)}
      onPointerDown={() => setVisible(false)}
    >
      <p class="alert-title">Wanted speed reached</p>
      <p class="alert-action">Start braking</p>
      {wantedLabel && <p class="alert-detail">{wantedLabel}</p>}
      <p class="alert-detail">Tap to dismiss</p>
    </div>
  );
}
