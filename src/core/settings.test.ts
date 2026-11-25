import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings, parseSettingsJson } from './settings';

describe('defaults (REQ-SET-1, REQ-SET-8)', () => {
  it('uses kilometres and GPX', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      units: 'km',
      exportFormat: 'gpx',
      vehicle: 'motorcycle',
      wantedSpeedKmh: null,
      alertVibration: true,
      alertNoticeSeen: false,
    });
  });
});

describe('parseSettings', () => {
  it('accepts valid settings unchanged', () => {
    expect(parseSettings({ units: 'mi', exportFormat: 'kml' })).toEqual({
      ...DEFAULT_SETTINGS,
      units: 'mi',
      exportFormat: 'kml',
    });
  });

  it('falls back per field, keeping the valid ones', () => {
    // One bad value must not discard the whole object.
    expect(parseSettings({ units: 'furlongs', exportFormat: 'kml' })).toEqual({
      ...DEFAULT_SETTINGS,
      units: 'km',
      exportFormat: 'kml',
    });
  });

  it('ignores unknown fields', () => {
    const parsed = parseSettings({ units: 'mi', sampleRateHz: 20 });
    expect(parsed).toEqual({ ...DEFAULT_SETTINGS, units: 'mi' });
    expect('sampleRateHz' in parsed).toBe(false);
  });

  it('defaults on null, undefined and non-objects', () => {
    for (const raw of [null, undefined, 42, 'nope', []]) {
      expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('returns a fresh object, never the shared default', () => {
    const parsed = parseSettings(null);
    parsed.units = 'mi';
    expect(DEFAULT_SETTINGS.units).toBe('km');
  });
});

describe('parseSettingsJson', () => {
  it('reads stored JSON', () => {
    expect(parseSettingsJson('{"units":"mi","exportFormat":"kml"}')).toEqual({
      ...DEFAULT_SETTINGS,
      units: 'mi',
      exportFormat: 'kml',
    });
  });

  it('reads the performance settings, and rejects out-of-range wanted speeds', () => {
    expect(
      parseSettingsJson('{"vehicle":"car","wantedSpeedKmh":130,"alertVibration":false}'),
    ).toEqual({ ...DEFAULT_SETTINGS, vehicle: 'car', wantedSpeedKmh: 130, alertVibration: false });
    expect(parseSettingsJson('{"wantedSpeedKmh":900}').wantedSpeedKmh).toBeNull();
    expect(parseSettingsJson('{"vehicle":"tractor"}').vehicle).toBe('motorcycle');
  });

  it('defaults on nothing stored yet', () => {
    expect(parseSettingsJson(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettingsJson('')).toEqual(DEFAULT_SETTINGS);
  });

  it('defaults on corrupt JSON rather than throwing', () => {
    expect(parseSettingsJson('{not json')).toEqual(DEFAULT_SETTINGS);
  });
});
