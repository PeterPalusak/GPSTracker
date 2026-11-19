/**
 * Where settings are kept (REQ-SET-9…12).
 *
 * One interface, one implementation per build, so nothing above this line
 * knows which store is in use:
 *
 *  - PWA: localStorage (REQ-SET-10).
 *  - APK: @capacitor/preferences, backed by Android SharedPreferences
 *    (REQ-SET-11). localStorage would work inside the WebView, but it
 *    lives in WebView storage — clearable by the system or by "Clear
 *    data", and not reliably included in Android's app backup.
 *
 * Asynchronous because the native store is; localStorage simply resolves
 * immediately.
 */

import { DEFAULT_SETTINGS, parseSettingsJson, type Settings } from '../core/settings';

export const SETTINGS_KEY = 'gps-logger.settings';

export interface SettingsStore {
  load(): Promise<Settings>;
  save(settings: Settings): Promise<void>;
}

export class LocalSettingsStore implements SettingsStore {
  constructor(private readonly key: string = SETTINGS_KEY) {}

  async load(): Promise<Settings> {
    try {
      return parseSettingsJson(localStorage.getItem(this.key));
    } catch {
      // Private browsing and blocked storage both throw on access.
      return { ...DEFAULT_SETTINGS };
    }
  }

  async save(settings: Settings): Promise<void> {
    try {
      localStorage.setItem(this.key, JSON.stringify(settings));
    } catch {
      // A failed write is not worth interrupting a ride for; the setting
      // simply reverts on next launch.
    }
  }
}

/** In-memory store, for tests and for environments with no storage at all. */
export class MemorySettingsStore implements SettingsStore {
  private settings: Settings = { ...DEFAULT_SETTINGS };

  async load(): Promise<Settings> {
    return { ...this.settings };
  }

  async save(settings: Settings): Promise<void> {
    this.settings = { ...settings };
  }
}
