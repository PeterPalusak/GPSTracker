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
import type { LogMeta, Units } from '../core/types';
import type { LogRepository } from '../data/logRepository';
import {
  openAppSettings,
  queryLocationPermission,
  requestLocationPermission,
  watchLocationPermission,
  type LocationPermission,
} from '../platform/permissions';
import { requestPersistentStorage } from '../platform/storage';
import { MainScreen } from './screens/MainScreen';

export type Screen = 'main' | 'logs' | 'settings';

interface AppProps {
  recorder: Recorder;
  repository: LogRepository;
}

export function App({ recorder, repository }: AppProps) {
  const [screen, setScreen] = useState<Screen>('main');
  const [permission, setPermission] = useState<LocationPermission>('unknown');
  const [lastLog, setLastLog] = useState<LogMeta | null>(null);
  const [recovered, setRecovered] = useState<LogMeta | null>(null);

  // Units are fixed until Settings exists (Phase 8).
  const units: Units = 'km';

  const refreshLogs = useCallback(async () => {
    const logs = await repository.listLogs();
    setLastLog(logs.find((log) => log.status !== 'recording') ?? null);
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

      {recovered && (
        <p class="notice">
          “{recovered.name}” was interrupted and has been saved as unfinished.
          <button type="button" class="notice-dismiss" onClick={() => setRecovered(null)}>
            Dismiss
          </button>
        </p>
      )}

      {screen === 'main' && (
        <MainScreen
          recorder={recorder}
          units={units}
          permission={permission}
          canOpenSettings={false}
          lastLog={lastLog}
          onRequestPermission={() => void handleRequestPermission()}
          onOpenSettings={() => void handleOpenSettings()}
          onLogsChanged={() => void refreshLogs()}
        />
      )}

      {screen === 'logs' && (
        <div class="screen placeholder">
          <p>The list of logs arrives in Phase 5.</p>
        </div>
      )}

      {screen === 'settings' && (
        <div class="screen placeholder">
          <p>Settings arrive in Phase 8.</p>
        </div>
      )}
    </div>
  );
}
