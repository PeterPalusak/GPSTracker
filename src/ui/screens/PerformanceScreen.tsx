/**
 * The Performance screen (Accelleration_Requirements.MD §3 to §8).
 *
 * Start and Stop record a performance log. On Stop the log is analysed and the
 * results appear under the Acceleration and Deceleration tabs. The wanted-speed
 * alert is set on the Deceleration tab and runs live while recording.
 *
 * This screen stays mounted while the app is open (the shell hides it rather
 * than unmounting), so the readiness and the wake lock keep working when the
 * user visits another screen during a run.
 */

import { useCallback, useEffect, useState } from 'preact/hooks';
import { useAnalysis, analyseAndCache } from '../../app/useAnalysis';
import { useReadiness } from '../../app/useReadiness';
import { useRecorderSnapshot } from '../../app/useRecorder';
import type { Recorder } from '../../app/recorder';
import { useWakeLock } from '../../app/useWakeLock';
import type { EventKind } from '../../core/performance/export';
import { VEHICLE_LABELS } from '../../core/performance/constants';
import type { Settings } from '../../core/settings';
import type { LogMeta, Units, VehicleType } from '../../core/types';
import type { LogRepository } from '../../data/logRepository';
import { alarmSoundReady, unlockAlarm } from '../../platform/alarm';
import type { LocationPermission } from '../../platform/permissions';
import type { Sharer } from '../../platform/Sharer';
import { KindTabs, PerformancePanel } from '../components/PerformancePanel';
import { PermissionGate } from '../components/PermissionGate';
import { ReadinessIndicator } from '../components/ReadinessIndicator';
import { WantedSpeedControl } from '../components/WantedSpeedControl';

interface PerformanceScreenProps {
  recorder: Recorder;
  repository: LogRepository;
  sharer: Sharer;
  settings: Settings;
  onSettingsChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  units: Units;
  permission: LocationPermission;
  canOpenSettings: boolean;
  /** True on the PWA, where readiness cannot check satellites (REQ-ACC-22). */
  indicative: boolean;
  onRequestPermission: () => void;
  onOpenSettings: () => void;
  /** Bumped when stored logs change, so the list reloads. */
  revision: number;
  onLogsChanged: () => void;
}

const VEHICLES: VehicleType[] = ['motorcycle', 'car', 'bicycle'];

export function PerformanceScreen({
  recorder,
  repository,
  sharer,
  settings,
  onSettingsChange,
  units,
  permission,
  canOpenSettings,
  indicative,
  onRequestPermission,
  onOpenSettings,
  revision,
  onLogsChanged,
}: PerformanceScreenProps) {
  const snapshot = useRecorderSnapshot(recorder);
  const readiness = useReadiness(recorder);
  const wakeLock = useWakeLock(snapshot.recording !== 'idle');

  const [tab, setTab] = useState<EventKind>('acceleration');
  const [logs, setLogs] = useState<LogMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = snapshot.recording !== 'idle';

  const reloadLogs = useCallback(async () => {
    const all = await repository.listLogs();
    setLogs(all.filter((log) => log.type === 'performance' && log.status !== 'recording'));
  }, [repository]);

  useEffect(() => {
    void reloadLogs();
  }, [reloadLogs, revision]);

  const selected = logs.find((log) => log.id === selectedId) ?? logs[0] ?? null;
  const analysis = useAnalysis(repository, selected);

  const start = async () => {
    // Tap = user gesture: unlock sound here, where the browser allows it.
    unlockAlarm();
    setBusy(true);
    setError(null);
    try {
      await recorder.start({ type: 'performance', vehicle: settings.vehicle });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The log could not be started.');
    } finally {
      setBusy(false);
      onLogsChanged();
    }
  };

  const stop = async () => {
    setBusy(true);
    setError(null);
    try {
      const finished = await recorder.stop();
      // REQ-ACC-15: Stop analyses the log and fills both tabs.
      if (finished) {
        await analyseAndCache(repository, finished);
        setSelectedId(finished.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The log could not be saved.');
    } finally {
      setBusy(false);
      await reloadLogs();
      onLogsChanged();
    }
  };

  const blocked = permission === 'denied' && !open;
  const soundBlocked = open && settings.wantedSpeedKmh !== null && !alarmSoundReady();

  return (
    <div class="screen performance">
      <div class="screen-top">
        <ReadinessIndicator view={readiness} fixRateHz={snapshot.fixRateHz} indicative={indicative} />

        {blocked ? (
          <PermissionGate
            permission={permission}
            canOpenSettings={canOpenSettings}
            onRequest={onRequestPermission}
            onOpenSettings={onOpenSettings}
          />
        ) : (
          <div class="controls">
            <button
              type="button"
              class={`btn btn-primary${open ? ' is-live' : ''}`}
              disabled={busy}
              onClick={() => void (open ? stop() : start())}
            >
              {open ? 'Stop' : 'Start'}
            </button>

            <div class="segmented perf-vehicle" role="group" aria-label="Vehicle">
              {VEHICLES.map((v) => (
                <button
                  key={v}
                  type="button"
                  class={`segment${settings.vehicle === v ? ' is-active' : ''}`}
                  aria-pressed={settings.vehicle === v}
                  disabled={open}
                  onClick={() => onSettingsChange('vehicle', v)}
                >
                  {VEHICLE_LABELS[v]}
                </button>
              ))}
            </div>
          </div>
        )}

        {open && (
          <p class="notice notice-inline muted">
            Recording {VEHICLE_LABELS[settings.vehicle].toLowerCase()}. Results appear when you press Stop.
            {wakeLock.held && ' The screen is kept on.'}
          </p>
        )}

        {soundBlocked && (
          <p class="notice notice-error">
            The alert sound is blocked by the browser. Tap this screen once to allow it.
          </p>
        )}

        {error && <p class="notice notice-error">{error}</p>}
      </div>

      <KindTabs value={tab} onChange={setTab} />

      {tab === 'deceleration' && (
        <WantedSpeedControl
          units={units}
          value={settings.wantedSpeedKmh}
          noticeSeen={settings.alertNoticeSeen}
          onChange={(kmh) => onSettingsChange('wantedSpeedKmh', kmh)}
          onNoticeSeen={() => onSettingsChange('alertNoticeSeen', true)}
        />
      )}

      {logs.length > 0 && (
        <label class="perf-log-select">
          <span class="muted">Performance log</span>
          <select
            value={selected?.id ?? ''}
            onChange={(e) => setSelectedId((e.target as HTMLSelectElement).value)}
          >
            {logs.map((log) => (
              <option key={log.id} value={log.id}>
                {log.name} · {VEHICLE_LABELS[log.vehicle ?? 'motorcycle']}
              </option>
            ))}
          </select>
        </label>
      )}

      <PerformancePanel
        key={`${selected?.id ?? 'none'}-${tab}`}
        log={selected}
        results={analysis.results}
        loading={analysis.loading}
        kind={tab}
        units={units}
        sharer={sharer}
      />
    </div>
  );
}
