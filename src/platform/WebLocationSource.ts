/**
 * Browser geolocation source for the PWA build.
 *
 * Note what is *not* here: any notion of a sampling rate. The Geolocation
 * API offers no interval control, so fixes arrive at whatever rate the
 * device produces them — which is exactly the behaviour REQ-SET-3 asks for.
 */

import type {
  LocationErrorKind,
  LocationSource,
  LocationSourceHandlers,
  RawFix,
} from './LocationSource';

const OPTIONS: PositionOptions = {
  // Satellite fixes rather than network positioning (REQ-GPS-1).
  enableHighAccuracy: true,
  // Never hand back a cached position; this is a track log.
  maximumAge: 0,
  // Generous: indoors or in a tunnel, waiting is correct behaviour.
  timeout: 30_000,
};

export function toRawFix(position: GeolocationPosition): RawFix {
  const c = position.coords;
  return {
    t: position.timestamp,
    lat: c.latitude,
    lon: c.longitude,
    alt: c.altitude ?? null,
    acc: c.accuracy ?? null,
    spd: c.speed ?? null,
    hdg: c.heading ?? null,
    // The web API exposes neither; acquisition falls back to altitude and
    // accuracy (see core/acquisition.ts).
    satellites: null,
    provider: null,
  };
}

export function toErrorKind(error: GeolocationPositionError): LocationErrorKind {
  switch (error.code) {
    case 1:
      return 'permission-denied';
    case 3:
      return 'timeout';
    default:
      return 'unavailable';
  }
}

export class WebLocationSource implements LocationSource {
  readonly kind = 'web';
  private watchId: number | null = null;

  constructor(private readonly geolocation: Geolocation = navigator.geolocation) {}

  async start(handlers: LocationSourceHandlers): Promise<void> {
    if (this.watchId !== null) return;

    this.watchId = this.geolocation.watchPosition(
      (position) => handlers.onFixes([toRawFix(position)]),
      (error) => handlers.onError(toErrorKind(error)),
      OPTIONS,
    );
  }

  async stop(): Promise<void> {
    if (this.watchId === null) return;
    this.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }
}
