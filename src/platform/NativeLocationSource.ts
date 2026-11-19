/**
 * Android background location source (REQ-BG-7…11).
 *
 * Backed by @capacitor-community/background-geolocation, which runs a
 * foreground service with a persistent notification — an OS-sanctioned
 * exemption from Doze, and the only way to keep recording with the screen
 * off (see AppType_Analysis.md §2).
 *
 * The plugin delivers one location per callback rather than batches, so
 * this emits single-element arrays. The batching shape of the interface
 * (REQ-PLAT-6) costs nothing here and keeps the recorder unchanged if a
 * batching provider is ever swapped in.
 */

import { registerPlugin } from '@capacitor/core';
import type {
  LocationErrorKind,
  LocationSource,
  LocationSourceHandlers,
  RawFix,
} from './LocationSource';

/** The subset of the plugin's surface this app uses. */
interface PluginLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  altitudeAccuracy: number | null;
  bearing: number | null;
  speed: number | null;
  time: number | null;
  simulated: boolean;
}

interface PluginError {
  code?: string;
  message?: string;
}

interface BackgroundGeolocationPlugin {
  addWatcher(
    options: {
      backgroundMessage?: string;
      backgroundTitle?: string;
      requestPermissions?: boolean;
      stale?: boolean;
      distanceFilter?: number;
    },
    callback: (position?: PluginLocation, error?: PluginError) => void,
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
  openSettings(): Promise<void>;
}

export const BackgroundGeolocation =
  registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

export function toRawFix(location: PluginLocation): RawFix {
  return {
    // The plugin's time can be null; fall back to arrival time rather
    // than writing a fix with no timestamp.
    t: location.time ?? Date.now(),
    lat: location.latitude,
    lon: location.longitude,
    alt: location.altitude,
    acc: location.accuracy,
    spd: location.speed,
    hdg: location.bearing,
    // The plugin exposes neither, so acquisition falls back to altitude
    // and accuracy exactly as on the web (core/acquisition.ts).
    satellites: null,
    provider: null,
  };
}

export function toErrorKind(error: PluginError): LocationErrorKind {
  if (error.code === 'NOT_AUTHORIZED') return 'permission-denied';
  return 'unavailable';
}

export class NativeLocationSource implements LocationSource {
  readonly kind = 'native';
  private watcherId: string | null = null;

  async start(handlers: LocationSourceHandlers): Promise<void> {
    if (this.watcherId !== null) return;

    this.watcherId = await BackgroundGeolocation.addWatcher(
      {
        // Supplying a background message is what makes the plugin run a
        // foreground service rather than stopping when backgrounded.
        backgroundTitle: 'Recording a ride',
        backgroundMessage: 'Tap to return to GPS Logger.',
        requestPermissions: true,
        // Never accept a cached position: this is a track log.
        stale: false,
        // Record every fix the device produces (REQ-SET-3/4). A distance
        // filter would silently thin the track.
        distanceFilter: 0,
      },
      (position, error) => {
        if (error) {
          handlers.onError(toErrorKind(error));
          return;
        }
        if (position) handlers.onFixes([toRawFix(position)]);
      },
    );
  }

  /**
   * Remove the watcher, which stops the foreground service and powers the
   * receiver down (REQ-REC-7).
   */
  async stop(): Promise<void> {
    const id = this.watcherId;
    if (id === null) return;
    this.watcherId = null;
    await BackgroundGeolocation.removeWatcher({ id });
  }
}

/** Open this app's system settings page (REQ-PERM-2). */
export async function openNativeAppSettings(): Promise<boolean> {
  try {
    await BackgroundGeolocation.openSettings();
    return true;
  } catch {
    return false;
  }
}
