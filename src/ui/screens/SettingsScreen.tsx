/**
 * Settings (requirements §6).
 *
 * Two settings and a storage figure. The sampling-rate control that was
 * originally specified is deliberately absent — the app records at
 * whatever rate the device delivers (REQ-SET-3), and offering a choice
 * that phone GNSS hardware cannot honour would be a control that silently
 * does nothing.
 */

import { useEffect, useState } from 'preact/hooks';
import { formatBytes } from '../../core/format';
import type { Settings } from '../../core/settings';
import type { ExportFormat, Units } from '../../core/types';
import { getStorageUsage, type StorageUsage } from '../../platform/storage';

interface SettingsScreenProps {
  settings: Settings;
  logCount: number;
  onChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

interface ChoiceProps<T extends string> {
  label: string;
  hint?: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onSelect: (value: T) => void;
}

function Choice<T extends string>({ label, hint, value, options, onSelect }: ChoiceProps<T>) {
  return (
    <div class="setting">
      <div class="setting-head">
        <span class="setting-label">{label}</span>
        {hint && <span class="setting-hint">{hint}</span>}
      </div>
      <div class="segmented" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            class={`segment${option.value === value ? ' is-active' : ''}`}
            aria-pressed={option.value === value}
            onClick={() => onSelect(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SettingsScreen({ settings, logCount, onChange }: SettingsScreenProps) {
  const [usage, setUsage] = useState<StorageUsage | null>(null);

  useEffect(() => {
    void getStorageUsage().then(setUsage);
  }, [logCount]);

  return (
    <div class="screen settings">
      <Choice<Units>
        label="Units"
        hint="Display only — stored and exported data stay metric"
        value={settings.units}
        options={[
          { value: 'km', label: 'Kilometres' },
          { value: 'mi', label: 'Miles' },
        ]}
        onSelect={(value) => onChange('units', value)}
      />

      <Choice<ExportFormat>
        label="Export format"
        hint="GPX keeps times and elevation; KML is the route only"
        value={settings.exportFormat}
        options={[
          { value: 'gpx', label: 'GPX' },
          { value: 'kml', label: 'KML' },
        ]}
        onSelect={(value) => onChange('exportFormat', value)}
      />

      <div class="setting">
        <div class="setting-head">
          <span class="setting-label">Storage</span>
          <span class="setting-hint">
            {logCount} {logCount === 1 ? 'ride' : 'rides'} on this device
          </span>
        </div>
        <dl class="storage">
          <div>
            <dt>Used</dt>
            <dd>{formatBytes(usage?.usage ?? null)}</dd>
          </div>
          <div>
            <dt>Available</dt>
            <dd>{formatBytes(usage?.quota ?? null)}</dd>
          </div>
          <div>
            <dt>Protected from eviction</dt>
            <dd>{usage?.persistent ? 'Yes' : 'No'}</dd>
          </div>
        </dl>
        <p class="setting-note muted">
          Rides are stored on this device only. Clearing site data, uninstalling the
          app or losing the phone loses anything not exported.
        </p>
      </div>

      <div class="setting">
        <div class="setting-head">
          <span class="setting-label">Recording rate</span>
          <span class="setting-hint">Not configurable</span>
        </div>
        <p class="setting-note muted">
          Every position the device reports is recorded, at whatever rate it
          produces them — typically 1 Hz. Phone GNSS receivers do not offer a
          faster rate, and recording fewer points would only lose detail.
        </p>
      </div>
    </div>
  );
}
