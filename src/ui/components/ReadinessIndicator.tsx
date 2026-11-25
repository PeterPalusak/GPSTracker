/**
 * The Performance screen's precision light (REQ-ACC-20…24).
 *
 * Off, Acquiring (amber) or Ready (green). While acquiring it reports the
 * current accuracy and the best seen, so the user can judge the wait.
 */

import type { ReadinessView } from '../../app/useReadiness';
import { formatFixRate } from '../../core/format';

interface ReadinessIndicatorProps {
  view: ReadinessView;
  fixRateHz: number | null;
  /** True on the PWA, where satellites and provider cannot be checked (REQ-ACC-22). */
  indicative: boolean;
}

export function ReadinessIndicator({ view, fixRateHz, indicative }: ReadinessIndicatorProps) {
  const label = {
    off: 'Not recording',
    acquiring: 'Acquiring precision…',
    ready: 'Ready',
  }[view.state];

  const detail = (() => {
    if (view.state === 'off') return null;
    const parts: string[] = [];
    if (view.accuracy !== null) parts.push(`accuracy ${view.accuracy.toFixed(1)} m`);
    if (view.bestAccuracy !== null) parts.push(`best ${view.bestAccuracy.toFixed(1)} m`);
    if (view.satellites !== null) parts.push(`${view.satellites} satellites`);
    if (fixRateHz !== null) parts.push(formatFixRate(fixRateHz));
    return parts.join(' · ');
  })();

  return (
    <div class={`readiness readiness-${view.state}`} role="status">
      <span class="readiness-dot" aria-hidden="true" />
      <span class="readiness-label">{label}</span>
      {detail && <span class="readiness-detail">{detail}</span>}
      {indicative && view.state !== 'off' && (
        <span class="readiness-detail">Indicative: the browser does not report satellites</span>
      )}
    </div>
  );
}
