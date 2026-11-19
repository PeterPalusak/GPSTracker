/**
 * IndexedDB schema and connection (REQ-STO-1, REQ-STO-3).
 *
 * Two object stores, deliberately separate: appending a fix must not
 * require rewriting the whole log. `points` uses a compound key of
 * [logId, seq], which makes an append O(1), reading a log one cursor over
 * a range, and deleting a log one range delete.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Fix, LogMeta, LogStatus } from '../core/types';

export const DB_NAME = 'gps-logger';
export const DB_VERSION = 1;

export interface GpsLoggerDB extends DBSchema {
  logs: {
    key: string;
    value: LogMeta;
    indexes: {
      'by-status': LogStatus;
      'by-startedAt': number;
    };
  };
  points: {
    key: [string, number];
    value: Fix;
    indexes: {
      'by-log': string;
    };
  };
}

export type Database = IDBPDatabase<GpsLoggerDB>;

export function openDatabase(name: string = DB_NAME): Promise<Database> {
  return openDB<GpsLoggerDB>(name, DB_VERSION, {
    upgrade(db) {
      const logs = db.createObjectStore('logs', { keyPath: 'id' });
      // Finding the log left open by a kill (REQ-REC-15) must not scan.
      logs.createIndex('by-status', 'status');
      // Newest-first listing (REQ-NAV-2).
      logs.createIndex('by-startedAt', 'startedAt');

      const points = db.createObjectStore('points', { keyPath: ['logId', 'seq'] });
      points.createIndex('by-log', 'logId');
    },
  });
}

/**
 * Key range covering every point of one log.
 *
 * `seq` starts at 0 and increments, so bounding by MAX_SAFE_INTEGER covers
 * any log that could realistically exist — a 1 Hz recording would need
 * ~285 million years to reach it.
 */
export function pointRange(logId: string): IDBKeyRange {
  return IDBKeyRange.bound([logId, 0], [logId, Number.MAX_SAFE_INTEGER]);
}
