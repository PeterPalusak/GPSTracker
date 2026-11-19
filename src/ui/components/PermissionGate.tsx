/**
 * Shown in place of the recording controls when location is unavailable
 * (REQ-PERM-1…3).
 *
 * A blank or dead screen is the usual failure here, so each cause gets its
 * own message and its own next step.
 */

import type { LocationPermission } from '../../platform/permissions';

interface PermissionGateProps {
  permission: LocationPermission;
  /** True in the APK, where system settings can be opened (REQ-PERM-2). */
  canOpenSettings: boolean;
  onRequest: () => void;
  onOpenSettings: () => void;
}

export function PermissionGate({
  permission,
  canOpenSettings,
  onRequest,
  onOpenSettings,
}: PermissionGateProps) {
  const denied = permission === 'denied';

  return (
    <section class="permission">
      <h2>Location needed</h2>

      {denied ? (
        <p>
          Location permission has been refused, so no ride can be recorded.
          {canOpenSettings
            ? ' Grant it in the app settings, then come back.'
            : ' Allow it for this site in your browser settings — tap the icon beside the address bar — then reload.'}
        </p>
      ) : (
        <p>This app records your position, so it needs permission to use location.</p>
      )}

      <button
        type="button"
        class="btn btn-primary"
        onClick={denied && canOpenSettings ? onOpenSettings : onRequest}
      >
        Permit Location
      </button>
    </section>
  );
}
