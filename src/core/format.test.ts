import { describe, expect, it } from 'vitest';
import {
  formatAltitude,
  formatDistance,
  formatDuration,
  formatFixRate,
  formatSpeed,
  statisticRows,
} from './format';
import { emptyStats } from './statistics';
import type { Stats } from './types';

describe('formatDistance (REQ-SET-1)', () => {
  it('shows kilometres', () => {
    expect(formatDistance(12_400, 'km')).toEqual({ value: '12.40', unit: 'km' });
  });

  it('shows miles using the exact international mile', () => {
    // 1609.344 m by definition, so 1 mile reads as exactly 1.00.
    expect(formatDistance(1609.344, 'mi')).toEqual({ value: '1.00', unit: 'mi' });
  });

  it('handles zero', () => {
    expect(formatDistance(0, 'km').value).toBe('0.00');
  });
});

describe('formatSpeed', () => {
  it('converts m/s to km/h', () => {
    expect(formatSpeed(10, 'km')).toEqual({ value: '36.0', unit: 'km/h' });
  });

  it('converts m/s to mph', () => {
    expect(formatSpeed(10, 'mi')).toEqual({ value: '22.4', unit: 'mph' });
  });

  it('shows a motorway speed sensibly', () => {
    expect(formatSpeed(130 / 3.6, 'km').value).toBe('130.0');
  });
});

describe('formatAltitude (REQ-SET-2)', () => {
  it('shows metres', () => {
    expect(formatAltitude(212.4, 'km')).toEqual({ value: '212', unit: 'm' });
  });

  it('shows feet using the exact international foot', () => {
    expect(formatAltitude(0.3048, 'mi')).toEqual({ value: '1', unit: 'ft' });
  });

  it('renders a dash when no altitude was recorded (REQ-GPS-7)', () => {
    expect(formatAltitude(null, 'km').value).toBe('—');
    expect(formatAltitude(null, 'mi').unit).toBe('ft');
  });
});

describe('formatDuration', () => {
  it('shows minutes and seconds under an hour', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(9_000)).toBe('0:09');
    expect(formatDuration(125_000)).toBe('2:05');
  });

  it('shows hours once past one', () => {
    expect(formatDuration(3_661_000)).toBe('1:01:01');
    expect(formatDuration(7_200_000)).toBe('2:00:00');
  });

  it('clamps a negative duration to zero', () => {
    expect(formatDuration(-5_000)).toBe('0:00');
  });
});

describe('formatFixRate (REQ-GPS-6)', () => {
  it('shows one decimal', () => {
    expect(formatFixRate(1.03)).toBe('1.0 Hz');
  });

  it('shows a dash before the rate is known', () => {
    expect(formatFixRate(null)).toBe('—');
  });
});

describe('statisticRows (REQ-STAT-4…13)', () => {
  const stats: Stats = {
    distance: 42_195,
    overallTime: 7_265_000,
    movingTime: 7_000_000,
    avgSpeed: 5.8,
    maxSpeed: 12.4,
    minAlt: 110,
    maxAlt: 340,
    gain: 620,
    drop: 590,
  };

  it('returns all nine metrics', () => {
    expect(statisticRows(stats, 'km')).toHaveLength(9);
  });

  it('no longer includes average moving speed (REQ-STAT-9 withdrawn)', () => {
    const labels = statisticRows(stats, 'km').map((r) => r.label);
    expect(labels).not.toContain('Average moving speed');
  });

  it('leads with the metrics a rider actually watches', () => {
    const labels = statisticRows(stats, 'km').map((r) => r.label);
    expect(labels.slice(0, 3)).toEqual(['Distance', 'Overall time', 'Moving time']);
  });

  it('switches every unit together', () => {
    const imperial = statisticRows(stats, 'mi');
    expect(imperial.find((r) => r.label === 'Distance')?.unit).toBe('mi');
    expect(imperial.find((r) => r.label === 'Max speed')?.unit).toBe('mph');
    expect(imperial.find((r) => r.label === 'Height gained')?.unit).toBe('ft');
  });

  it('renders the empty state without blowing up (REQ-STAT-14)', () => {
    const rows = statisticRows(emptyStats(), 'km');
    expect(rows).toHaveLength(9);
    expect(rows.find((r) => r.label === 'Min height')?.value).toBe('—');
  });
});
