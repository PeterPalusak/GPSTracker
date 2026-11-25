/**
 * Live readiness for the Performance screen (REQ-ACC-20…24).
 *
 * Fed by the stored fixes of the open log, so the indicator reflects what is
 * actually being recorded. Reset when a new log starts.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { ReadinessTracker } from '../core/performance/readiness';
import type { Recorder } from './recorder';

export type ReadyState = 'off' | 'acquiring' | 'ready';

export interface ReadinessView {
  state: ReadyState;
  accuracy: number | null;
  bestAccuracy: number | null;
  satellites: number | null;
}

const OFF: ReadinessView = { state: 'off', accuracy: null, bestAccuracy: null, satellites: null };

export function useReadiness(recorder: Recorder): ReadinessView {
  const trackerRef = useRef<ReadinessTracker | null>(null);
  if (trackerRef.current === null) trackerRef.current = new ReadinessTracker();
  const [view, setView] = useState<ReadinessView>(OFF);

  useEffect(() => {
    const tracker = trackerRef.current!;

    const unsubscribeFixes = recorder.subscribeFixes((fixes) => {
      for (const fix of fixes) tracker.consider(fix);
      setView({
        state: tracker.isReady ? 'ready' : 'acquiring',
        accuracy: tracker.accuracy,
        bestAccuracy: tracker.bestAccuracy,
        satellites: tracker.satellites,
      });
    });

    const unsubscribeState = recorder.subscribe((snapshot) => {
      if (snapshot.recording === 'idle') {
        tracker.reset();
        setView(OFF);
      } else if (snapshot.recording === 'recording' && snapshot.pointCount === 0) {
        // Opened, but no stored fix yet: acquiring, with nothing measured.
        setView((v) => (v.state === 'off' ? { ...OFF, state: 'acquiring' } : v));
      }
    });

    return () => {
      unsubscribeFixes();
      unsubscribeState();
    };
  }, [recorder]);

  return view;
}
