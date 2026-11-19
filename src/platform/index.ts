/**
 * Choosing the implementations for the running build.
 *
 * The only module that knows both builds exist. Every native import is
 * dynamic and behind a runtime check, so the web bundle contains no
 * Capacitor code at all — not even `@capacitor/core`, which is why the
 * platform check reads the global rather than importing it.
 */

import type { LocationSource } from './LocationSource';
import type { SettingsStore } from './SettingsStore';
import type { Sharer } from './Sharer';

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

function capacitor(): CapacitorGlobal | undefined {
  return (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
}

/** True inside the Android APK, false in any browser. */
export function isNativePlatform(): boolean {
  return capacitor()?.isNativePlatform?.() === true;
}

export function platformName(): string {
  return capacitor()?.getPlatform?.() ?? 'web';
}

export async function createLocationSource(): Promise<LocationSource> {
  if (isNativePlatform()) {
    const { NativeLocationSource } = await import('./NativeLocationSource');
    return new NativeLocationSource();
  }
  const { WebLocationSource } = await import('./WebLocationSource');
  return new WebLocationSource();
}

export async function createSettingsStore(): Promise<SettingsStore> {
  if (isNativePlatform()) {
    const { NativeSettingsStore } = await import('./NativeSettingsStore');
    return new NativeSettingsStore();
  }
  const { LocalSettingsStore } = await import('./SettingsStore');
  return new LocalSettingsStore();
}

export async function createSharer(): Promise<Sharer> {
  if (isNativePlatform()) {
    const { NativeSharer } = await import('./NativeSharer');
    return new NativeSharer();
  }
  const { WebSharer } = await import('./Sharer');
  return new WebSharer();
}

/**
 * Open this app's settings page (REQ-PERM-2).
 *
 * Only possible natively; the web build falls back to instructions
 * (REQ-PERM-3).
 */
export async function openAppSettings(): Promise<boolean> {
  if (!isNativePlatform()) return false;
  const { openNativeAppSettings } = await import('./NativeLocationSource');
  return openNativeAppSettings();
}

/**
 * Keep the UI in step with a recording that continued while it was gone
 * (REQ-BG-12).
 *
 * The foreground service outlives the interface, so returning to the app
 * must restore the Recording state and backfill the statistics — not show
 * the initial Idle state.
 */
export async function onAppResume(handler: () => void): Promise<() => void> {
  if (!isNativePlatform()) {
    // The browser equivalent: the page being shown again.
    const onVisible = () => {
      if (document.visibilityState === 'visible') handler();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }

  const { App } = await import('@capacitor/app');
  const listener = await App.addListener('resume', handler);
  return () => void listener.remove();
}
