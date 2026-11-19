/** Log naming and identity. */

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/**
 * Display name for a log: `yyyymmdd-hhmm` in UTC (REQ-REC-2).
 *
 * Minute resolution is deliberate (ambiguity A1 — accepted): two logs are
 * not expected to start within the same minute. Uniqueness is carried by
 * `LogMeta.id`, not by this name, so a collision is cosmetic rather than
 * destructive.
 */
export function formatLogName(at: Date | number): string {
  const d = at instanceof Date ? at : new Date(at);
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`
  );
}

/**
 * Sortable unique id, lexicographically ordered by creation time.
 *
 * 48-bit timestamp in base36, zero-padded, plus random suffix — a reduced
 * ULID. Avoids a dependency for something this small, and sorting by id
 * gives chronological order for free.
 */
export function createLogId(at: Date | number = Date.now(), random = Math.random): string {
  const ms = at instanceof Date ? at.getTime() : at;
  const time = ms.toString(36).padStart(10, '0');
  const suffix = Math.floor(random() * 36 ** 6)
    .toString(36)
    .padStart(6, '0');
  return `${time}${suffix}`;
}
