/**
 * Settings in native preferences (REQ-SET-11).
 *
 * Android SharedPreferences rather than localStorage: WebView storage can
 * be cleared by the system or by "Clear data", and is not reliably
 * included in Android's app backup.
 */

import { Preferences } from '@capacitor/preferences';
import { DEFAULT_SETTINGS, parseSettingsJson, type Settings } from '../core/settings';
import { SETTINGS_KEY, type SettingsStore } from './SettingsStore';

export class NativeSettingsStore implements SettingsStore {
  constructor(private readonly key: string = SETTINGS_KEY) {}

  async load(): Promise<Settings> {
    try {
      const { value } = await Preferences.get({ key: this.key });
      return parseSettingsJson(value);
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  async save(settings: Settings): Promise<void> {
    try {
      await Preferences.set({ key: this.key, value: JSON.stringify(settings) });
    } catch {
      // A failed write costs a preference, not data.
    }
  }
}
