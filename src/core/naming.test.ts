import { describe, expect, it } from 'vitest';
import { createLogId, formatLogName } from './naming';

describe('formatLogName (REQ-REC-2)', () => {
  it('formats as yyyymmdd-hhmm', () => {
    expect(formatLogName(Date.UTC(2026, 10, 19, 9, 14))).toBe('20261119-0914');
  });

  it('zero-pads every field', () => {
    expect(formatLogName(Date.UTC(2026, 0, 2, 3, 4))).toBe('20260102-0304');
  });

  it('uses UTC, not local time (ambiguity A2)', () => {
    // 23:30 UTC is the next day in some zones; the name must not drift.
    expect(formatLogName(Date.UTC(2026, 10, 19, 23, 30))).toBe('20261119-2330');
  });

  it('accepts a Date or an epoch value', () => {
    const ms = Date.UTC(2026, 5, 1, 12, 0);
    expect(formatLogName(new Date(ms))).toBe(formatLogName(ms));
  });
});

describe('createLogId', () => {
  it('sorts lexicographically by creation time', () => {
    const early = createLogId(Date.UTC(2026, 0, 1));
    const late = createLogId(Date.UTC(2026, 11, 31));
    expect(early < late).toBe(true);
  });

  it('differs for ids created in the same millisecond (ambiguity A1)', () => {
    // The name may collide; the id must not, or Cancel would delete the
    // wrong log.
    const t = Date.now();
    const ids = new Set(Array.from({ length: 500 }, () => createLogId(t)));
    expect(ids.size).toBeGreaterThan(490);
  });

  it('is fixed width, so string ordering stays stable', () => {
    const a = createLogId(Date.UTC(2026, 0, 1));
    const b = createLogId(Date.UTC(2030, 0, 1));
    expect(a).toHaveLength(16);
    expect(b).toHaveLength(16);
  });
});
