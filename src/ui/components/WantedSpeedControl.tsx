/**
 * Setting the wanted speed for the deceleration alert (Accelleration_Requirements.MD §8.1).
 *
 * Presets for the four braking targets, a custom value, and Off. Values are
 * stored in km/h; with miles selected, the control reads and writes mph and
 * converts. The first time a wanted speed is set, a one-time safety notice is
 * shown and must be acknowledged (REQ-ACC-157).
 */

import { useState } from 'preact/hooks';
import { validWantedSpeed, WANTED_SPEED_MAX_KMH, WANTED_SPEED_MIN_KMH } from '../../core/settings';
import { BRAKE_TARGETS_KMH } from '../../core/performance/targets';
import type { Units } from '../../core/types';
import { unlockAlarm } from '../../platform/alarm';

const KM_PER_MILE = 1.609344;

interface WantedSpeedControlProps {
  units: Units;
  /** km/h, or null for Off. */
  value: number | null;
  noticeSeen: boolean;
  onChange: (kmh: number | null) => void;
  onNoticeSeen: () => void;
}

const toDisplay = (kmh: number, units: Units): number =>
  units === 'mi' ? Math.round(kmh / KM_PER_MILE) : kmh;

const unitLabel = (units: Units): string => (units === 'mi' ? 'mph' : 'km/h');

export function WantedSpeedControl({
  units,
  value,
  noticeSeen,
  onChange,
  onNoticeSeen,
}: WantedSpeedControlProps) {
  const [custom, setCustom] = useState('');
  const [rejected, setRejected] = useState(false);

  const choose = (kmh: number | null) => {
    // A tap is a user gesture: unlock sound here, where the browser allows it.
    unlockAlarm();
    onChange(kmh);
  };

  const submitCustom = () => {
    const entered = Number(custom);
    const kmh = units === 'mi' ? entered * KM_PER_MILE : entered;
    const valid = validWantedSpeed(kmh);
    if (valid === null) {
      setRejected(true);
      return;
    }
    setRejected(false);
    setCustom('');
    choose(valid);
  };

  const min = toDisplay(WANTED_SPEED_MIN_KMH, units);
  const max = toDisplay(WANTED_SPEED_MAX_KMH, units);

  return (
    <section class="wanted" aria-label="Wanted speed">
      <div class="setting-head">
        <span class="setting-label">Wanted speed</span>
        <span class="setting-hint">
          {value === null ? 'Off' : `Alert at ${toDisplay(value, units)} ${unitLabel(units)}`}
        </span>
      </div>

      <div class="segmented wanted-presets" role="group" aria-label="Preset wanted speeds">
        {BRAKE_TARGETS_KMH.map((kmh) => (
          <button
            key={kmh}
            type="button"
            class={`segment${value === kmh ? ' is-active' : ''}`}
            aria-pressed={value === kmh}
            onClick={() => choose(kmh)}
          >
            {toDisplay(kmh, units)} {unitLabel(units)}
          </button>
        ))}
        <button
          type="button"
          class={`segment${value === null ? ' is-active' : ''}`}
          aria-pressed={value === null}
          onClick={() => choose(null)}
        >
          Off
        </button>
      </div>

      <div class="wanted-custom">
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          placeholder={`${min}–${max} ${unitLabel(units)}`}
          value={custom}
          aria-label={`Custom wanted speed in ${unitLabel(units)}`}
          onInput={(e) => setCustom((e.target as HTMLInputElement).value)}
        />
        <button type="button" class="btn" disabled={custom === ''} onClick={submitCustom}>
          Set
        </button>
      </div>
      {rejected && (
        <p class="notice notice-error">
          Enter a speed between {min} and {max} {unitLabel(units)}.
        </p>
      )}

      {value !== null && !noticeSeen && (
        <div class="notice wanted-notice" role="note">
          <p>
            The alert is for controlled tests where it is safe and lawful to brake hard.
            Do not operate the phone while driving.
          </p>
          <button type="button" class="btn btn-primary" onClick={onNoticeSeen}>
            Understood
          </button>
        </div>
      )}
    </section>
  );
}
