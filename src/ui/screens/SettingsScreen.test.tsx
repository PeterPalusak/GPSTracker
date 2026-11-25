import render from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { formatBytes } from '../../core/format';
import { DEFAULT_SETTINGS } from '../../core/settings';
import { LocalSettingsStore, MemorySettingsStore } from '../../platform/SettingsStore';
import { SettingsScreen } from './SettingsScreen';

const noop = () => {};

describe('SettingsScreen (requirements §6)', () => {
  it('offers kilometres and miles (REQ-SET-1)', () => {
    const html = render(
      <SettingsScreen settings={DEFAULT_SETTINGS} logCount={0} onChange={noop} />,
    );
    expect(html).toContain('Kilometres');
    expect(html).toContain('Miles');
  });

  it('offers GPX and KML (REQ-SET-7)', () => {
    const html = render(
      <SettingsScreen settings={DEFAULT_SETTINGS} logCount={0} onChange={noop} />,
    );
    expect(html).toContain('>GPX<');
    expect(html).toContain('>KML<');
  });

  it('marks the active choice', () => {
    const html = render(
      <SettingsScreen
        settings={{ ...DEFAULT_SETTINGS, units: 'mi', exportFormat: 'kml' }}
        logCount={0}
        onChange={noop}
      />,
    );
    expect(html).toContain('aria-pressed="true"');
  });

  it('offers no sampling-rate control (REQ-SET-3, REQ-SET-5 withdrawn)', () => {
    const html = render(
      <SettingsScreen settings={DEFAULT_SETTINGS} logCount={0} onChange={noop} />,
    );
    expect(html).toContain('Not configurable');
    expect(html).not.toContain('20 Hz');
    expect(html).not.toContain('0.5 Hz');
  });

  it('says units are display-only (REQ-SET-2a)', () => {
    const html = render(
      <SettingsScreen settings={DEFAULT_SETTINGS} logCount={0} onChange={noop} />,
    );
    expect(html).toContain('Display only');
  });

  it('shows storage usage (REQ-STO-5)', () => {
    const html = render(
      <SettingsScreen settings={DEFAULT_SETTINGS} logCount={3} onChange={noop} />,
    );
    expect(html).toContain('Storage');
    expect(html).toContain('3 rides');
  });

  it('warns that local storage is not a backup', () => {
    const html = render(
      <SettingsScreen settings={DEFAULT_SETTINGS} logCount={1} onChange={noop} />,
    );
    expect(html).toContain('not exported');
    expect(html).toContain('1 ride');
  });
});

describe('formatBytes (REQ-STO-5)', () => {
  it('scales through the binary units', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(2 * 1024 ** 3)).toBe('2.0 GB');
  });

  it('drops the decimal once the number is large enough not to need it', () => {
    expect(formatBytes(64 * 1024 * 1024)).toBe('64 MB');
  });

  it('says unknown where the browser will not report (REQ-STO-5)', () => {
    expect(formatBytes(null)).toBe('unknown');
  });
});

describe('SettingsStore (REQ-SET-9…12)', () => {
  it('round-trips through memory', async () => {
    const store = new MemorySettingsStore();
    await store.save({ ...DEFAULT_SETTINGS, units: 'mi', exportFormat: 'kml' });
    expect(await store.load()).toEqual({ ...DEFAULT_SETTINGS, units: 'mi', exportFormat: 'kml' });
  });

  it('starts at the defaults', async () => {
    expect(await new MemorySettingsStore().load()).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults when localStorage is unavailable', async () => {
    // Node has no localStorage, which is the same situation as a browser
    // blocking storage in private mode: degrade, do not throw.
    const store = new LocalSettingsStore('test-key');
    expect(await store.load()).toEqual(DEFAULT_SETTINGS);
    await expect(store.save({ ...DEFAULT_SETTINGS, units: 'mi', exportFormat: 'kml' })).resolves.toBeUndefined();
  });
});
