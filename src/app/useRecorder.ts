/**
 * Preact bindings for the recorder.
 *
 * Two sources of change drive the panel: the recorder itself (a fix
 * arrives, a button is pressed) and the passage of time (elapsed duration
 * must tick even when no fix has arrived — in a tunnel, or while
 * acquiring). The ticker runs only while a log is open.
 */

import { useEffect, useState } from 'preact/hooks';
import type { Recorder, RecorderSnapshot } from './recorder';

const TICK_MS = 1000;

export function useRecorderSnapshot(recorder: Recorder): RecorderSnapshot {
  const [snapshot, setSnapshot] = useState<RecorderSnapshot>(() => recorder.snapshot());

  useEffect(() => recorder.subscribe(setSnapshot), [recorder]);

  const open = snapshot.recording !== 'idle';
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setSnapshot(recorder.snapshot()), TICK_MS);
    return () => clearInterval(id);
  }, [recorder, open]);

  return snapshot;
}
