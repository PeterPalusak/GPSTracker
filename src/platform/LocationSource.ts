/**
 * The boundary between the recorder and whatever is producing positions
 * (REQ-PLAT-5).
 *
 * Two implementations: `WebLocationSource` wraps the browser's
 * `watchPosition`; a native source backed by a foreground service arrives
 * in Phase 10. Nothing above this interface knows which is in use.
 */

/** A position as delivered by a source, before it is assigned to a log. */
export interface RawFix {
  /** Epoch milliseconds, UTC. */
  t: number;
  lat: number;
  lon: number;
  /** Metres, or null where the device reports none (REQ-GPS-7). */
  alt: number | null;
  /** Horizontal accuracy in metres, or null. */
  acc: number | null;
  /** Metres per second as reported by the device (REQ-GPS-5), or null. */
  spd: number | null;
  /** Degrees from true north, or null. */
  hdg: number | null;

  /**
   * Number of satellites used in the fix, where the platform reports it.
   *
   * Always null on the web — the Geolocation API does not expose it. The
   * native build can supply it from Android's GnssStatus, which turns
   * acquisition detection from a heuristic into a fact (REQ-GPS-1).
   */
  satellites?: number | null;

  /**
   * Position provider, where the platform reports it: 'gps', 'network',
   * 'fused'. Always null on the web.
   */
  provider?: string | null;
}

export type LocationErrorKind =
  /** The user has not granted location permission (REQ-PERM-1). */
  | 'permission-denied'
  /** Location services are off, or the device cannot produce a position. */
  | 'unavailable'
  /** No fix within the timeout — normal indoors, and before acquisition. */
  | 'timeout';

export interface LocationSourceHandlers {
  /**
   * Called with one or more fixes.
   *
   * An array rather than a single fix because a native background provider
   * may deliver several at once (REQ-PLAT-6). The browser implementation
   * delivers single-element batches, so nothing downstream has to care.
   */
  onFixes(fixes: readonly RawFix[]): void;
  onError(error: LocationErrorKind): void;
}

export interface LocationSource {
  /** Identifies the implementation in diagnostics. */
  readonly kind: string;
  /** Begin delivering fixes. Idempotent. */
  start(handlers: LocationSourceHandlers): Promise<void>;
  /**
   * Stop delivering fixes and power the receiver down.
   *
   * Pause calls this, which is why resuming has to reacquire a fix
   * (REQ-REC-7, REQ-REC-9a).
   */
  stop(): Promise<void>;
}
