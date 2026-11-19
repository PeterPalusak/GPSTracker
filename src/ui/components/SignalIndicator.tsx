/**
 * Signal state and observed fix rate (REQ-GPS-2, REQ-GPS-6).
 *
 * "Acquiring" is a normal state that can last 30-60 seconds from cold, so
 * it is reported plainly rather than as a warning.
 */

import { formatFixRate } from '../../core/format';
import type { SignalState } from '../../core/types';

const LABELS: Record<SignalState, string> = {
  off: 'Receiver off',
  acquiring: 'Acquiring signal…',
  tracking: 'Tracking',
};

interface SignalIndicatorProps {
  signal: SignalState;
  fixRateHz: number | null;
  pointCount: number;
}

export function SignalIndicator({ signal, fixRateHz, pointCount }: SignalIndicatorProps) {
  return (
    <div class={`signal signal-${signal}`}>
      <span class="signal-dot" aria-hidden="true" />
      <span class="signal-label">{LABELS[signal]}</span>
      {signal === 'tracking' && (
        <span class="signal-detail">
          {formatFixRate(fixRateHz)} · {pointCount.toLocaleString()} points
        </span>
      )}
    </div>
  );
}
