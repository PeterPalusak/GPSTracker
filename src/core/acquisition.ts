/**
 * Deciding when a satellite fix has been acquired (REQ-GPS-1).
 *
 * The web Geolocation API never says which provider produced a position,
 * so on the PWA this is necessarily a heuristic. The native build can
 * answer definitively, and this module uses that answer when it is there.
 *
 * Signals, strongest first:
 *
 *  1. Satellite count, where the platform reports it. Four satellites are
 *     the minimum for a 3-D fix.
 *  2. Provider name, where the platform reports it.
 *  3. A non-null altitude. Wi-Fi and cell positioning are inherently 2-D —
 *     their lookup tables map an access point or tower to a lat/lon and
 *     contain no height — so an altitude implies satellites.
 *  4. Accuracy, as a fallback. Ambiguous in the 15-40 m band, where a good
 *     Wi-Fi fix and a converging GNSS fix overlap, hence the tight bound.
 */

import type { RawFix } from '../platform/LocationSource';

/** Fallback accuracy bound, used only when nothing better is available. */
export const ACQUISITION_ACCURACY_M = 25;

/** Minimum satellites for a three-dimensional fix. */
export const MIN_SATELLITES = 4;

/**
 * Qualifying fixes required before recording starts.
 *
 * Two, so that a single fluke — one plausible-looking Wi-Fi fix — does not
 * open the gate. Costs about a second, and avoids a bogus first point
 * dragging a visible spur across the start of the track.
 */
export const ACQUISITION_CONSECUTIVE = 2;

/** Whether one fix looks like it came from satellites. */
export function looksLikeSatelliteFix(fix: RawFix): boolean {
  // 1. Definitive, where the platform provides it (native build).
  if (fix.satellites !== null && fix.satellites !== undefined) {
    return fix.satellites >= MIN_SATELLITES;
  }

  // 2. Also definitive for the two unambiguous provider names. 'fused'
  //    blends sources and tells us nothing, so it falls through.
  if (fix.provider === 'gps') return true;
  if (fix.provider === 'network') return false;

  // 3. A 2-D source cannot produce an altitude.
  if (fix.alt !== null) return true;

  // 4. Accuracy alone.
  return fix.acc !== null && fix.acc <= ACQUISITION_ACCURACY_M;
}

/**
 * Tracks progress towards acquisition.
 *
 * Once open the gate stays open: the check is for *acquiring* a fix, not
 * for filtering the ones that follow. Outlier rejection was deliberately
 * not adopted (trap T2 — see REQ-GEN-3), so every fix after acquisition is
 * recorded exactly as received.
 */
export class AcquisitionGate {
  /**
   * Qualifying fixes seen so far, held back until the gate opens.
   *
   * Buffered rather than discarded: once two consecutive good fixes prove
   * the receiver has acquired, the first of them is a real satellite fix
   * and belongs in the track. Throwing it away would clip a second off the
   * start of every ride for no benefit.
   */
  private readonly pending: RawFix[] = [];
  private open = false;

  get acquired(): boolean {
    return this.open;
  }

  /** Qualifying fixes seen so far, for an "acquiring" indication. */
  get streak(): number {
    return this.open ? ACQUISITION_CONSECUTIVE : this.pending.length;
  }

  /**
   * Offer a fix to the gate.
   *
   * Returns the fixes that should now be recorded: empty while still
   * acquiring, the whole buffered run at the moment of acquisition, and
   * just the fix itself thereafter.
   */
  consider(fix: RawFix): RawFix[] {
    if (this.open) return [fix];

    if (!looksLikeSatelliteFix(fix)) {
      // Must be consecutive: a poor fix discards the run so far.
      this.pending.length = 0;
      return [];
    }

    this.pending.push(fix);
    if (this.pending.length >= ACQUISITION_CONSECUTIVE) {
      this.open = true;
      const flushed = [...this.pending];
      this.pending.length = 0;
      return flushed;
    }
    return [];
  }

  /** Called on Pause, which powers the receiver down (REQ-REC-7/9a). */
  reset(): void {
    this.pending.length = 0;
    this.open = false;
  }
}
