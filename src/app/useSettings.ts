/**
 * Settings state for the UI.
 *
 * Applied optimistically: the change shows immediately and persists in
 * the background. Nothing here is destructive, so a failed write costs a
 * preference rather than data.
 */

import { useCallback, useEffect, useState } from 'preact/hooks';
import { DEFAULT_SETTINGS, type Settings } from '../core/settings';
import type { SettingsStore } from '../platform/SettingsStore';

export interface UseSettingsResult {
  settings: Settings;
  loaded: boolean;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

export function useSettings(store: SettingsStore): UseSettingsResult {
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void store.load().then((stored) => {
      if (cancelled) return;
      setSettings(stored);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  const update = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((current) => {
        const next = { ...current, [key]: value };
        void store.save(next);
        return next;
      });
    },
    [store],
  );

  return { settings, loaded, update };
}
