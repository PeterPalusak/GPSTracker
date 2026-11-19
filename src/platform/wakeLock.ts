/**
 * Screen wake lock for the PWA build (REQ-BG-1…6).
 *
 * A web page stops receiving position callbacks seconds after the screen
 * switches off, so the only way the PWA can record continuously is to
 * keep the screen on. That is a testing arrangement, not the usage model:
 * screen-off recording is the APK's job (REQ-PLAT-4, REQ-BG-7…14).
 */

export interface WakeLockController {
  /** Hold the lock. Safe to call when already held. */
  acquire(): Promise<void>;
  release(): Promise<void>;
  readonly held: boolean;
  /** Stop managing the lock entirely, removing listeners. */
  dispose(): void;
}

export function isWakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

/**
 * Create a controller that keeps the lock alive across visibility changes.
 *
 * The browser **releases a wake lock whenever the page is hidden and does
 * not restore it** when the page returns. Without the `visibilitychange`
 * re-acquire below, one pull of the notification shade silently ends the
 * lock, and the next screen-off stops the recording with no error
 * anywhere. This is the single reason REQ-BG-3 exists.
 */
export function createWakeLock(): WakeLockController {
  let sentinel: WakeLockSentinel | null = null;
  let wanted = false;
  let disposed = false;

  async function request(): Promise<void> {
    if (!isWakeLockSupported() || sentinel !== null) return;
    try {
      sentinel = await navigator.wakeLock.request('screen');
      sentinel.addEventListener('release', () => {
        sentinel = null;
      });
    } catch {
      // Denied, or the document was not visible. Not fatal: recording
      // continues while the app is in the foreground either way.
      sentinel = null;
    }
  }

  const onVisibilityChange = () => {
    if (!disposed && wanted && document.visibilityState === 'visible') {
      void request();
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  return {
    get held() {
      return sentinel !== null;
    },

    async acquire() {
      wanted = true;
      await request();
    },

    async release() {
      wanted = false;
      const current = sentinel;
      sentinel = null;
      try {
        await current?.release();
      } catch {
        // Already released by the browser.
      }
    },

    dispose() {
      disposed = true;
      wanted = false;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      void sentinel?.release().catch(() => {});
      sentinel = null;
    },
  };
}
