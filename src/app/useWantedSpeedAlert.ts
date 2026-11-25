/**
 * Runs the wanted-speed alert on the live fix stream (§8).
 *
 * Lives in the app shell rather than the Performance screen, so the alert
 * still fires while the user is on the Logs or Settings screen during a run.
 * Returns a counter that increases each time the alert fires.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { impliedSpeed } from '../core/geo';
import { WantedSpeedAlert } from '../core/performance/alert';
import { kmhToMps } from '../core/performance/constants';
import type { Fix } from '../core/types';
import type { Recorder } from './recorder';

export function useWantedSpeedAlert(recorder: Recorder, wantedSpeedKmh: number | null): number {
  const alertRef = useRef<WantedSpeedAlert | null>(null);
  if (alertRef.current === null) alertRef.current = new WantedSpeedAlert();
  const [fired, setFired] = useState(0);

  useEffect(() => {
    alertRef.current!.setTarget(wantedSpeedKmh === null ? null : kmhToMps(wantedSpeedKmh));
  }, [wantedSpeedKmh]);

  useEffect(() => {
    const alert = alertRef.current!;
    let prev: Fix | null = null;

    const unsubscribeFixes = recorder.subscribeFixes((fixes) => {
      for (const fix of fixes) {
        // Device speed where reported, otherwise from the previous fix (REQ-ACC-78).
        const speed =
          fix.spd !== null && fix.spd >= 0 ? fix.spd : prev ? impliedSpeed(prev, fix) : null;
        prev = fix;
        if (speed === null) continue;
        if (alert.consider(fix.t, speed)) {
          void recorder.markAlert();
          setFired((n) => n + 1);
        }
      }
    });

    // A new log must not inherit the last one's speed or armed state.
    const unsubscribeState = recorder.subscribe((snapshot) => {
      if (snapshot.recording === 'idle') {
        alert.reset();
        prev = null;
      }
    });

    return () => {
      unsubscribeFixes();
      unsubscribeState();
    };
  }, [recorder]);

  return fired;
}
