/**
 * Application shell: navigation between the three screens, and the
 * one-time startup work (recover an interrupted log, ask for persistent
 * storage, read the permission state).
 *
 * Navigation is a piece of state rather than a router — there are three
 * screens, and a routing library would be more code than the feature.
 */

import { useCallback, useEffect, useState } from 'preact/hooks';
import type { Recorder } from '../app/recorder';
import { useSettings } from '../app/useSettings';
import { useWantedSpeedAlert } from '../app/useWantedSpeedAlert';
import { kmhToMps } from '../core/performance/constants';
import { formatSpeed } from '../core/format';
import type { LogMeta } from '../core/types';
import type { LogRepository } from '../data/logRepository';
import { isNativePlatform, onAppResume, openAppSettings } from '../platform';
import {
  queryLocationPermission,
  requestLocationPermission,
  watchLocationPermission,
  type LocationPermission,
} from '../platform/permissions';
import type { SettingsStore } from '../platform/SettingsStore';
import type { Sharer } from '../platform/Sharer';
import { requestPersistentStorage } from '../platform/storage';
import { AlertOverlay } from './components/AlertOverlay';
import { InstallHint } from './components/InstallHint';
import { PerformanceScreen } from './screens/PerformanceScreen';
import { LogListScreen } from './screens/LogListScreen';
import { MainScreen } from './screens/MainScreen';
import { SettingsScreen } from './screens/SettingsScreen';

export type Screen = 'main' | 'performance' | 'logs' | 'settings';

interface AppProps {
  recorder: Recorder;
  repository: LogRepository;
  sharer: Sharer;
  settingsStore: SettingsStore;
}

export function App({ recorder, repository, sharer, settingsStore }: AppProps) {
  const [screen, setScreen] = useState<Screen>('main');
  const [permission, setPermission] = useState<LocationPermission>('unknown');
  const [lastLog, setLastLog] = useState<LogMeta | null>(null);
  const [logCount, setLogCount] = useState(0);
  const [recovered, setRecovered] = useState<LogMeta | null>(null);
  /** Bumped whenever stored logs change, so dependent screens reload. */
  const [revision, setRevision] = useState(0);

  const { settings, update } = useSettings(settingsStore);
  const { units, exportFormat } = settings;

  // The alert runs in the shell, so it still fires on another screen (§8).
  const alarmCount = useWantedSpeedAlert(recorder, settings.wantedSpeedKmh);
  const wantedLabel = (() => {
    if (settings.wantedSpeedKmh === null) return null;
    const speed = formatSpeed(kmhToMps(settings.wantedSpeedKmh), units);
    return `${speed.value} ${speed.unit}`;
  })();

  const refreshLogs = useCallback(async () => {
    const logs = await repository.listLogs();
    setLastLog(logs.find((log) => log.status !== 'recording') ?? null);
    setLogCount(logs.filter((log) => log.status !== 'recording').length);
    setRevision((n) => n + 1);
  }, [repository]);

  useEffect(() => {
    void (async () => {
      // REQ-REC-15…17: close anything left open by a killed session before
      // the user can start a new ride on top of it.
      const interrupted = await recorder.recoverInterrupted();
      if (interrupted) setRecovered(interrupted);

      await requestPersistentStorage();
      setPermission(await queryLocationPermission());
      await refreshLogs();
    })();
  }, [recorder, refreshLogs]);

  useEffect(() => {
    let dispose = () => {};
    void watchLocationPermission(setPermission).then((fn) => {
      dispose = fn;
    });
    return () => dispose();
  }, []);

  // REQ-BG-12: a recording can continue while the interface is away, so
  // returning to the app must bring the panel up to date rather than show
  // whatever it last rendered.
  useEffect(() => {
    let dispose = () => {};
    void onAppResume(() => {
      void refreshLogs();
      void queryLocationPermission().then(setPermission);
    }).then((fn) => {
      dispose = fn;
    });
    return () => dispose();
  }, [refreshLogs]);

  const handleRequestPermission = useCallback(async () => {
    setPermission(await requestLocationPermission());
  }, []);

  const handleOpenSettings = useCallback(async () => {
    await openAppSettings();
  }, []);

  return (
    <div class="app">
      <header class="app-bar">
        <h1 onClick={() => setScreen('main')}>GPS Logger</h1>
        <nav>
          <button
            type="button"
            class={`nav-btn${screen === 'performance' ? ' is-active' : ''}`}
            onClick={() => setScreen('performance')}
          >
            Performance
          </button>
          <button
            type="button"
            class={`nav-btn${screen === 'logs' ? ' is-active' : ''}`}
            onClick={() => setScreen('logs')}
          >
            Logs
          </button>
          <button
            type="button"
            class={`nav-btn${screen === 'settings' ? ' is-active' : ''}`}
            onClick={() => setScreen('settings')}
          >
            Settings
          </button>
        </nav>
      </header>

      <InstallHint />

      {recovered && (
        <p class="notice">
          “{recovered.name}” was interrupted and has been saved as unfinished.
          <button type="button" class="notice-dismiss" onClick={() => setRecovered(null)}>
            Dismiss
          </button>
        </p>
      )}

      {/*
        Mounted for the life of the app and hidden when not in use, so that
        readiness, the wake lock and the wanted-speed alert keep running while
        the user is on another screen during a run.
      */}
      <div hidden={screen !== 'performance'}>
        <PerformanceScreen
          recorder={recorder}
          repository={repository}
          sharer={sharer}
          settings={settings}
          onSettingsChange={update}
          units={units}
          permission={permission}
          canOpenSettings={isNativePlatform()}
          indicative={!isNativePlatform()}
          onRequestPermission={() => void handleRequestPermission()}
          onOpenSettings={() => void handleOpenSettings()}
          revision={revision}
          onLogsChanged={() => void refreshLogs()}
        />
      </div>

      <AlertOverlay
        count={alarmCount}
        vibrate={settings.alertVibration}
        wantedLabel={wantedLabel}
      />

      {screen === 'main' && (
        <MainScreen
          recorder={recorder}
          units={units}
          permission={permission}
          canOpenSettings={isNativePlatform()}
          lastLog={lastLog}
          onRequestPermission={() => void handleRequestPermission()}
          onOpenSettings={() => void handleOpenSettings()}
          onLogsChanged={() => void refreshLogs()}
        />
      )}

      {screen === 'logs' && (
        <LogListScreen
          repository={repository}
          sharer={sharer}
          units={units}
          exportFormat={exportFormat}
          revision={revision}
          onLogsChanged={() => void refreshLogs()}
        />
      )}

      {screen === 'settings' && (
        <SettingsScreen settings={settings} logCount={logCount} onChange={update} />
      )}
    </div>
  );
}
