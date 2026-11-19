/**
 * The recorder: joins the state machine, a location source and storage.
 *
 * Owns the consequences of a transition — creating a log, powering the
 * receiver down on pause, persisting fixes as they arrive — while the
 * legality of each transition stays in `core/recordingMachine`.
 */

import { AcquisitionGate } from '../core/acquisition';
import { FixRateMeter } from '../core/fixRate';
import { canApply, nextState, type RecordingEvent } from '../core/recordingMachine';
import {
  addFix,
  createAccumulator,
  finalise,
  type StatsAccumulator,
} from '../core/statistics';
import type {
  Fix,
  LogMeta,
  PauseInterval,
  RecordingState,
  SignalState,
  Stats,
} from '../core/types';
import type { LogRepository } from '../data/logRepository';
import type {
  LocationErrorKind,
  LocationSource,
  RawFix,
} from '../platform/LocationSource';

/** No fix for this long means the signal is considered lost again. */
const SIGNAL_STALE_MS = 6_000;

export interface RecorderSnapshot {
  recording: RecordingState;
  signal: SignalState;
  log: LogMeta | null;
  stats: Stats;
  /** Observed fixes per second (REQ-GPS-6), or null before it is known. */
  fixRateHz: number | null;
  pointCount: number;
  lastError: LocationErrorKind | null;
}

export interface RecorderOptions {
  repository: LogRepository;
  source: LocationSource;
  /** Injectable clock, so tests do not depend on wall time. */
  now?: () => number;
}

type Listener = (snapshot: RecorderSnapshot) => void;

export class Recorder {
  private readonly repo: LogRepository;
  private readonly source: LocationSource;
  private readonly now: () => number;

  private recording: RecordingState = 'idle';
  private log: LogMeta | null = null;
  private pauses: PauseInterval[] = [];
  private acc: StatsAccumulator = createAccumulator();
  private seq = 0;
  private readonly gate = new AcquisitionGate();
  private readonly meter = new FixRateMeter();
  private lastError: LocationErrorKind | null = null;

  private readonly listeners = new Set<Listener>();

  /**
   * Serialises writes. Fixes arrive on a synchronous callback but persisting
   * them is async; without a queue a burst could interleave and corrupt the
   * sequence numbering.
   */
  private writes: Promise<unknown> = Promise.resolve();

  constructor(options: RecorderOptions) {
    this.repo = options.repository;
    this.source = options.source;
    this.now = options.now ?? (() => Date.now());
  }

  // --- Observation ----------------------------------------------------------

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot(): RecorderSnapshot {
    const now = this.now();
    return {
      recording: this.recording,
      signal: this.signalState(now),
      log: this.log,
      stats: this.currentStats(now),
      fixRateHz: this.recording === 'recording' ? this.meter.rate(now) : null,
      pointCount: this.acc.count,
      lastError: this.lastError,
    };
  }

  /** Resolves once every queued write has landed. For tests and for Stop. */
  async settled(): Promise<void> {
    await this.writes;
  }

  private signalState(now: number): SignalState {
    // Paused powers the receiver down (REQ-REC-7), so there is no signal
    // to report rather than a weak one.
    if (this.recording !== 'recording') return 'off';
    if (!this.gate.acquired) return 'acquiring';

    const since = this.meter.sinceLast(now);
    // Acquired, but nothing recently — a tunnel, or indoors (REQ-GPS-3).
    if (since === null || since > SIGNAL_STALE_MS) return 'acquiring';
    return 'tracking';
  }

  private currentStats(now: number): Stats {
    if (!this.log) return finalise(createAccumulator(), { startedAt: 0, endedAt: 0, pauses: [] });
    return finalise(this.acc, {
      startedAt: this.log.startedAt,
      endedAt: this.log.endedAt ?? now,
      pauses: this.pauses,
    });
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  // --- Commands -------------------------------------------------------------

  /** Begin a new log (REQ-REC-1). */
  async start(): Promise<LogMeta> {
    this.assertCanApply('START');

    const startedAt = this.now();
    this.log = await this.repo.createLog({ startedAt });
    this.pauses = [];
    this.acc = createAccumulator();
    this.seq = 0;
    this.gate.reset();
    this.lastError = null;
    this.meter.reset();

    this.recording = nextState(this.recording, 'START')!;
    await this.source.start({
      onFixes: (fixes) => this.handleFixes(fixes),
      onError: (error) => this.handleError(error),
    });

    this.emit();
    return this.log;
  }

  /** Finish the log and save it (REQ-REC-5). Works from paused too (REQ-REC-6a). */
  async stop(): Promise<LogMeta | null> {
    this.assertCanApply('STOP');
    const log = this.log;
    if (!log) return null;

    await this.source.stop();
    await this.settled();

    const endedAt = this.now();
    this.closeOpenPause(endedAt);

    const stats = finalise(this.acc, {
      startedAt: log.startedAt,
      endedAt,
      pauses: this.pauses,
    });

    await this.repo.setPauses(log.id, this.pauses);
    const finished = await this.repo.finaliseLog(log.id, {
      endedAt,
      status: 'finished',
      stats,
    });

    this.recording = nextState(this.recording, 'STOP')!;
    this.log = finished;
    this.emit();
    return finished;
  }

  /** Pause and power the receiver down (REQ-REC-7). */
  async pause(): Promise<void> {
    this.assertCanApply('PAUSE');
    const log = this.log;
    if (!log) return;

    await this.source.stop();
    await this.settled();

    this.pauses = [...this.pauses, { from: this.now(), to: null }];
    await this.repo.setPauses(log.id, this.pauses);

    this.recording = nextState(this.recording, 'PAUSE')!;
    this.meter.reset();
    this.emit();
  }

  /**
   * Resume into the same log (REQ-REC-9).
   *
   * The receiver was off, so acquisition starts again — the beginning of
   * the next section is not recorded until a fix returns (REQ-REC-9a).
   */
  async resume(): Promise<void> {
    this.assertCanApply('RESUME');
    const log = this.log;
    if (!log) return;

    this.closeOpenPause(this.now());
    await this.repo.setPauses(log.id, this.pauses);

    this.gate.reset();
    this.lastError = null;
    this.meter.reset();

    this.recording = nextState(this.recording, 'RESUME')!;
    await this.source.start({
      onFixes: (fixes) => this.handleFixes(fixes),
      onError: (error) => this.handleError(error),
    });

    this.emit();
  }

  /**
   * Discard the log entirely (REQ-REC-12, REQ-REC-13).
   *
   * Confirmation is the caller's responsibility — `requiresConfirmation`
   * in the state machine says which events need it.
   */
  async cancel(): Promise<void> {
    this.assertCanApply('CANCEL');
    const log = this.log;

    await this.source.stop();
    await this.settled();

    if (log) await this.repo.deleteLog(log.id);

    this.recording = nextState(this.recording, 'CANCEL')!;
    this.log = null;
    this.pauses = [];
    this.acc = createAccumulator();
    this.seq = 0;
    this.gate.reset();
    this.meter.reset();
    this.emit();
  }

  // --- Recovery -------------------------------------------------------------

  /**
   * Close a log left open by an interrupted session (REQ-REC-15…17).
   *
   * Called once at startup, before any recording begins. The log keeps
   * every position recorded up to the interruption and is marked
   * 'unfinished'; recording does not resume automatically.
   */
  async recoverInterrupted(): Promise<LogMeta | null> {
    const open = await this.repo.findOpenLog();
    if (!open) return null;

    const fixes = await this.repo.readPoints(open.id);
    const acc = createAccumulator();
    for (const fix of fixes) addFix(acc, fix);

    // The interruption time is unknown; the last recorded fix is the best
    // evidence of when recording actually stopped.
    const endedAt = fixes.length > 0 ? fixes[fixes.length - 1]!.t : open.startedAt;

    const stats = finalise(acc, {
      startedAt: open.startedAt,
      endedAt,
      pauses: open.pauses,
    });

    return this.repo.finaliseLog(open.id, { endedAt, status: 'unfinished', stats });
  }

  // --- Internals ------------------------------------------------------------

  private assertCanApply(event: RecordingEvent): void {
    if (!canApply(this.recording, event)) {
      throw new Error(`Cannot ${event} while ${this.recording}`);
    }
  }

  private closeOpenPause(at: number): void {
    this.pauses = this.pauses.map((p) => (p.to === null ? { ...p, to: at } : p));
  }

  private handleError(error: LocationErrorKind): void {
    this.lastError = error;
    this.emit();
  }

  private handleFixes(raw: readonly RawFix[]): void {
    // A batch can arrive just after Pause stopped the source; discard it
    // rather than writing positions into a paused log.
    if (this.recording !== 'recording' || !this.log) return;

    const now = this.now();
    const accepted: RawFix[] = [];

    for (const fix of raw) {
      this.meter.mark(now);

      // REQ-GPS-1/REQ-GPS-2: nothing is recorded until the receiver has
      // genuinely acquired. The gate holds qualifying fixes back and
      // releases them together once it opens, so the first real satellite
      // fix is kept rather than clipped off the start of the ride.
      accepted.push(...this.gate.consider(fix));
    }

    if (accepted.length === 0) {
      this.emit();
      return;
    }

    this.lastError = null;

    const logId = this.log.id;
    const toStore: Fix[] = accepted.map((fix) => ({
      logId,
      seq: this.seq++,
      t: fix.t,
      lat: fix.lat,
      lon: fix.lon,
      alt: fix.alt,
      acc: fix.acc,
      spd: fix.spd,
      hdg: fix.hdg,
    }));

    for (const fix of toStore) addFix(this.acc, fix);

    // Committed as they arrive, never buffered (REQ-STO-2) — this is what
    // makes an interrupted ride recoverable.
    this.writes = this.writes
      .then(() => this.repo.appendFixes(logId, toStore))
      .catch(() => {
        /* A failed write must not break the chain for subsequent fixes. */
      });

    this.emit();
  }
}
