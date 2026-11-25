/**
 * Persistence for logs and their recorded positions.
 *
 * The only module that knows IndexedDB exists. Everything above it works
 * in terms of LogMeta and Fix.
 */

import { createLogId, formatLogName } from '../core/naming';
import type { Fix, LogMeta, LogType, PauseInterval, Stats, VehicleType } from '../core/types';
import type { PerformanceResults } from '../core/performance/analysis';
import { DEFAULT_VEHICLE } from '../core/performance/constants';
import { openDatabase, pointRange, type Database } from './db';

export interface NewLogOptions {
  startedAt?: number;
  id?: string;
  name?: string;
  type?: LogType | undefined;
  vehicle?: VehicleType | undefined;
}

/**
 * Fill in the fields added after logs were first stored (see LogMeta).
 * Every read goes through here, so the rest of the app can rely on them.
 */
export function withDefaults(meta: LogMeta): LogMeta {
  return {
    ...meta,
    type: meta.type ?? 'route',
    vehicle: meta.vehicle ?? null,
    alertMarks: meta.alertMarks ?? [],
    performance: meta.performance ?? null,
  };
}

export class LogRepository {
  private constructor(private readonly db: Database) {}

  static async open(name?: string): Promise<LogRepository> {
    return new LogRepository(await openDatabase(name));
  }

  close(): void {
    this.db.close();
  }

  // --- Lifecycle ------------------------------------------------------------

  /** Create a log in the `recording` state (REQ-REC-1, REQ-REC-2). */
  async createLog(options: NewLogOptions = {}): Promise<LogMeta> {
    const startedAt = options.startedAt ?? Date.now();
    const type = options.type ?? 'route';
    const meta: LogMeta = withDefaults({
      id: options.id ?? createLogId(startedAt),
      name: options.name ?? formatLogName(startedAt),
      startedAt,
      endedAt: null,
      status: 'recording',
      pauses: [],
      stats: null,
      pointCount: 0,
      type,
      vehicle: type === 'performance' ? (options.vehicle ?? DEFAULT_VEHICLE) : null,
      alertMarks: [],
      performance: null,
    });
    await this.db.put('logs', meta);
    return meta;
  }

  /**
   * Append fixes and update the point count in a single transaction.
   *
   * Takes an array because a native background source may deliver several
   * fixes at once (REQ-PLAT-6). Writing them atomically with the count
   * keeps `pointCount` from drifting if the process dies mid-write.
   */
  async appendFixes(logId: string, fixes: readonly Fix[]): Promise<void> {
    if (fixes.length === 0) return;

    const tx = this.db.transaction(['logs', 'points'], 'readwrite');
    const logs = tx.objectStore('logs');
    const points = tx.objectStore('points');

    const meta = await logs.get(logId);
    if (!meta) throw new Error(`No such log: ${logId}`);

    for (const fix of fixes) {
      await points.put({ ...fix, logId });
    }
    meta.pointCount += fixes.length;
    await logs.put(meta);

    await tx.done;
  }

  /** Next sequence number for a log, so appends resume correctly after a restart. */
  async nextSeq(logId: string): Promise<number> {
    const cursor = await this.db
      .transaction('points')
      .store.openCursor(pointRange(logId), 'prev');
    return cursor ? cursor.value.seq + 1 : 0;
  }

  /** Close a log normally (REQ-REC-5) or as interrupted (REQ-REC-16). */
  async finaliseLog(
    logId: string,
    update: { endedAt: number; status: 'finished' | 'unfinished'; stats: Stats },
  ): Promise<LogMeta> {
    const tx = this.db.transaction('logs', 'readwrite');
    const meta = await tx.store.get(logId);
    if (!meta) throw new Error(`No such log: ${logId}`);

    // Close any pause interval still open, so stored data is self-consistent.
    const pauses = meta.pauses.map((p) => (p.to === null ? { ...p, to: update.endedAt } : p));

    const next: LogMeta = { ...meta, ...update, pauses };
    await tx.store.put(next);
    await tx.done;
    return withDefaults(next);
  }

  /** Record a pause or resume (REQ-REC-7, REQ-REC-9, REQ-STAT-15). */
  async setPauses(logId: string, pauses: readonly PauseInterval[]): Promise<void> {
    const tx = this.db.transaction('logs', 'readwrite');
    const meta = await tx.store.get(logId);
    if (!meta) throw new Error(`No such log: ${logId}`);
    await tx.store.put({ ...meta, pauses: [...pauses] });
    await tx.done;
  }

  /** Change the vehicle of a performance log (REQ-ACC-7). Analysis must be rerun. */
  async setVehicle(logId: string, vehicle: VehicleType): Promise<void> {
    await this.patch(logId, { vehicle });
  }

  /** Record the moment the wanted-speed alert fired (§8, REQ-ACC-149). */
  async addAlertMark(logId: string, at: number): Promise<void> {
    const tx = this.db.transaction('logs', 'readwrite');
    const meta = await tx.store.get(logId);
    if (!meta) return;
    const marks = [...(meta.alertMarks ?? []), at];
    await tx.store.put({ ...meta, alertMarks: marks });
    await tx.done;
  }

  /** Cache the performance analysis, or clear it with null (REQ-ACC-108). */
  async setPerformance(logId: string, results: PerformanceResults | null): Promise<void> {
    await this.patch(logId, { performance: results });
  }

  /** Cache computed statistics so reopening a log does not rescan points. */
  async setStats(logId: string, stats: Stats): Promise<void> {
    const tx = this.db.transaction('logs', 'readwrite');
    const meta = await tx.store.get(logId);
    if (!meta) return;
    await tx.store.put({ ...meta, stats });
    await tx.done;
  }

  /**
   * Delete a log and every position belonging to it
   * (REQ-REC-13 via Cancel, REQ-NAV-8 via the log list).
   */
  async deleteLog(logId: string): Promise<void> {
    const tx = this.db.transaction(['logs', 'points'], 'readwrite');
    await tx.objectStore('points').delete(pointRange(logId));
    await tx.objectStore('logs').delete(logId);
    await tx.done;
  }

  /** Update some fields of a stored log in one transaction. */
  private async patch(logId: string, changes: Partial<LogMeta>): Promise<void> {
    const tx = this.db.transaction('logs', 'readwrite');
    const meta = await tx.store.get(logId);
    if (!meta) throw new Error(`No such log: ${logId}`);
    await tx.store.put({ ...meta, ...changes });
    await tx.done;
  }

  // --- Queries --------------------------------------------------------------

  async getLog(logId: string): Promise<LogMeta | undefined> {
    const meta = await this.db.get('logs', logId);
    return meta ? withDefaults(meta) : undefined;
  }

  /** All logs, newest first (REQ-NAV-2). */
  async listLogs(): Promise<LogMeta[]> {
    const logs = await this.db.getAllFromIndex('logs', 'by-startedAt');
    return logs.reverse().map(withDefaults);
  }

  /**
   * The log left open by an interrupted session, if any (REQ-REC-15).
   *
   * At most one log can be open at a time — the state machine has no
   * transition that opens a second — so the first match is the one.
   */
  async findOpenLog(): Promise<LogMeta | undefined> {
    const meta = await this.db.getFromIndex('logs', 'by-status', 'recording');
    return meta ? withDefaults(meta) : undefined;
  }

  async readPoints(logId: string): Promise<Fix[]> {
    return this.db.getAll('points', pointRange(logId));
  }

  /**
   * Stream a log's points in `seq` order.
   *
   * Preferred over readPoints for long logs: statistics and exports fold
   * over the points one at a time and never need the whole array resident.
   */
  async *streamPoints(logId: string): AsyncGenerator<Fix> {
    let cursor = await this.db.transaction('points').store.openCursor(pointRange(logId));
    while (cursor) {
      yield cursor.value;
      cursor = await cursor.continue();
    }
  }

  async countPoints(logId: string): Promise<number> {
    return this.db.count('points', pointRange(logId));
  }
}
