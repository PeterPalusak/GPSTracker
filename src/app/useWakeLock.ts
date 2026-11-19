/**
 * Hold the screen wake lock while a log is open (REQ-BG-1, REQ-BG-2).
 *
 * Held through pauses as well as while recording: the lock tracks whether
 * a log is open, released only on Stop or Cancel.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { createWakeLock, isWakeLockSupported } from '../platform/wakeLock';

export interface UseWakeLockResult {
  supported: boolean;
  held: boolean;
}

export function useWakeLock(active: boolean): UseWakeLockResult {
  const controller = useRef<ReturnType<typeof createWakeLock> | null>(null);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const wakeLock = createWakeLock();
    controller.current = wakeLock;
    return () => {
      wakeLock.dispose();
      controller.current = null;
    };
  }, []);

  useEffect(() => {
    const wakeLock = controller.current;
    if (!wakeLock) return;

    void (active ? wakeLock.acquire() : wakeLock.release()).then(() =>
      setHeld(wakeLock.held),
    );
  }, [active]);

  return { supported: isWakeLockSupported(), held };
}
