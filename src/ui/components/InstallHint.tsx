/**
 * Install prompt and platform hints (REQ-PLAT-1).
 *
 * Android Chrome fires `beforeinstallprompt`, which can be deferred and
 * replayed from a button. iOS Safari has no such event — installing is
 * Share → Add to Home Screen and nothing else — so it gets instructions
 * instead. On iOS that is worth doing: a home-screen install also escapes
 * Safari's seven-day eviction of storage for unused sites, which would
 * otherwise quietly delete recorded rides.
 */

import { useEffect, useState } from 'preact/hooks';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS reports installation this way rather than via display-mode.
    (navigator as { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export function InstallHint() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(true);

  useEffect(() => {
    setInstalled(isStandalone());

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || dismissed) return null;

  if (prompt) {
    return (
      <p class="notice">
        Install the app for full-screen use and offline access.
        <button
          type="button"
          class="notice-action"
          onClick={() => {
            void prompt.prompt();
            setPrompt(null);
          }}
        >
          Install
        </button>
        <button type="button" class="notice-dismiss" onClick={() => setDismissed(true)}>
          Not now
        </button>
      </p>
    );
  }

  if (isIosSafari()) {
    return (
      <p class="notice">
        Add to your Home Screen (Share → Add to Home Screen) so rides are not
        cleared after a week of not using the app.
        <button type="button" class="notice-dismiss" onClick={() => setDismissed(true)}>
          Dismiss
        </button>
      </p>
    );
  }

  return null;
}
