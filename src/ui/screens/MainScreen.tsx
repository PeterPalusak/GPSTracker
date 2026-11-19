/**
 * The main screen: three controls above, statistics below (REQ-STAT-1).
 *
 * Statistics show the current log while recording and the most recent one
 * otherwise (REQ-STAT-2, REQ-STAT-3). No tabs here — the tabbed view
 * belongs to the log list (REQ-STAT-1, analysis §9b #7).
 */

import { useCallback, useState } from 'preact/hooks';
import type { Recorder } from '../../app/recorder';
import { useRecorderSnapshot } from '../../app/useRecorder';
import { useWakeLock } from '../../app/useWakeLock';
import { requiresConfirmation, type RecordingEvent } from '../../core/recordingMachine';
import type { LogMeta, Units } from '../../core/types';
import type { LocationPermission } from '../../platform/permissions';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ControlButtons } from '../components/ControlButtons';
import { PermissionGate } from '../components/PermissionGate';
import { SignalIndicator } from '../components/SignalIndicator';
import { StatisticsPanel } from '../components/StatisticsPanel';

interface MainScreenProps {
  recorder: Recorder;
  units: Units;
  permission: LocationPermission;
  canOpenSettings: boolean;
  /** Most recent finished log, for the idle statistics panel (REQ-STAT-3). */
  lastLog: LogMeta | null;
  onRequestPermission: () => void;
  onOpenSettings: () => void;
  onLogsChanged: () => void;
}

export function MainScreen({
  recorder,
  units,
  permission,
  canOpenSettings,
  lastLog,
  onRequestPermission,
  onOpenSettings,
  onLogsChanged,
}: MainScreenProps) {
  const snapshot = useRecorderSnapshot(recorder);
  const [pending, setPending] = useState<RecordingEvent | null>(null);
  const [busy, setBusy] = useState(false);

  // REQ-BG-1/REQ-BG-2: held while a log is open, through pauses as well,
  // released on Stop or Cancel.
  const wakeLock = useWakeLock(snapshot.recording !== 'idle');

  const apply = useCallback(
    async (event: RecordingEvent) => {
      setBusy(true);
      try {
        switch (event) {
          case 'START':
            await recorder.start();
            break;
          case 'STOP':
            await recorder.stop();
            break;
          case 'PAUSE':
            await recorder.pause();
            break;
          case 'RESUME':
            await recorder.resume();
            break;
          case 'CANCEL':
            await recorder.cancel();
            break;
        }
        onLogsChanged();
      } finally {
        setBusy(false);
      }
    },
    [recorder, onLogsChanged],
  );

  const handleEvent = useCallback(
    (event: RecordingEvent) => {
      // REQ-REC-12a: Cancel discards a ride irreversibly.
      if (requiresConfirmation(event)) setPending(event);
      else void apply(event);
    },
    [apply],
  );

  const open = snapshot.recording !== 'idle';
  const stats = open ? snapshot.stats : (lastLog?.stats ?? null);
  const caption = open ? snapshot.log?.name ?? null : lastLog?.name ?? null;
  const blocked = permission === 'denied' && !open;

  return (
    <div class="screen">
      <div class="screen-top">
        <SignalIndicator
          signal={snapshot.signal}
          fixRateHz={snapshot.fixRateHz}
          pointCount={snapshot.pointCount}
        />

        {blocked ? (
          <PermissionGate
            permission={permission}
            canOpenSettings={canOpenSettings}
            onRequest={onRequestPermission}
            onOpenSettings={onOpenSettings}
          />
        ) : (
          <ControlButtons state={snapshot.recording} busy={busy} onEvent={handleEvent} />
        )}

        {/* REQ-BG-4: say that the screen is being held on, and why. */}
        {open && wakeLock.held && (
          <p class="notice notice-inline muted">
            Keeping the screen on so recording continues.
          </p>
        )}

        {open && wakeLock.supported === false && (
          <p class="notice notice-inline muted">
            This browser cannot keep the screen awake — recording stops when the
            screen switches off.
          </p>
        )}

        {snapshot.lastError === 'permission-denied' && open && (
          <p class="notice notice-error">
            Location permission was withdrawn — recording has stopped receiving fixes.
          </p>
        )}
      </div>

      <StatisticsPanel stats={stats} units={units} caption={caption} />

      {pending && (
        <ConfirmDialog
          title="Discard this ride?"
          message="The recording and every position in it will be deleted. This cannot be undone."
          confirmLabel="Discard"
          onConfirm={() => {
            const event = pending;
            setPending(null);
            void apply(event);
          }}
          onDismiss={() => setPending(null)}
        />
      )}
    </div>
  );
}
