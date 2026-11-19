/** Geodesic helpers. Pure functions, SI units throughout. */

/** Mean Earth radius in metres (IUGG). */
const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

export interface LatLon {
  lat: number;
  lon: number;
}

/**
 * Great-circle distance in metres between two points.
 *
 * Haversine is accurate to ~0.5% and is numerically stable for the short
 * distances between consecutive fixes, which is all it is used for here.
 */
export function haversine(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);

  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Speed in m/s implied by the displacement between two timestamped points.
 *
 * Used only as a fallback where the device reports no speed of its own;
 * REQ-GPS-5 prefers the device's Doppler-derived value. Returns null when
 * the points share a timestamp or go backwards in time.
 */
export function impliedSpeed(
  a: LatLon & { t: number },
  b: LatLon & { t: number },
): number | null {
  const dt = (b.t - a.t) / 1000;
  if (dt <= 0) return null;
  return haversine(a, b) / dt;
}
