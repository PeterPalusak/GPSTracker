/**
 * Observed fix rate (REQ-GPS-6).
 *
 * The app does not choose a sampling rate — it records whatever the device
 * delivers (REQ-SET-3). This meter exists so that rate is visible: a
 * healthy receiver reads about 1.0 Hz, and a degraded one visibly drops.
 */

/** Arrivals older than this are forgotten, so the reading tracks the present. */
const WINDOW_MS = 10_000;

/** Below this many samples the rate is not meaningful yet. */
const MIN_SAMPLES = 2;

export class FixRateMeter {
  private readonly arrivals: number[] = [];

  /** Record that a fix arrived at `t` (wall-clock, not the fix's own timestamp). */
  mark(t: number): void {
    this.arrivals.push(t);
    this.prune(t);
  }

  /**
   * Fixes per second over the recent window, or null before enough have
   * arrived to say anything.
   */
  rate(now: number): number | null {
    this.prune(now);
    if (this.arrivals.length < MIN_SAMPLES) return null;

    const first = this.arrivals[0]!;
    const last = this.arrivals[this.arrivals.length - 1]!;
    const span = last - first;
    if (span <= 0) return null;

    return ((this.arrivals.length - 1) * 1000) / span;
  }

  /** Milliseconds since the most recent arrival, or null if none. */
  sinceLast(now: number): number | null {
    const last = this.arrivals[this.arrivals.length - 1];
    return last === undefined ? null : now - last;
  }

  reset(): void {
    this.arrivals.length = 0;
  }

  private prune(now: number): void {
    const cutoff = now - WINDOW_MS;
    while (this.arrivals.length > 0 && this.arrivals[0]! < cutoff) {
      this.arrivals.shift();
    }
  }
}
