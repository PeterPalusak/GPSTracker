/**
 * Location permission state (REQ-PERM-1…3).
 *
 * The Permissions API is advisory: it tells you the current state without
 * prompting, which is exactly what the UI needs to decide whether to show
 * the controls or a Permit Location button.
 */

export type LocationPermission = 'granted' | 'denied' | 'prompt' | 'unknown';

function permissions(): Permissions | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.permissions;
}

/** Current permission state, without prompting. */
export async function queryLocationPermission(): Promise<LocationPermission> {
  const api = permissions();
  // Safari historically lacked geolocation in the Permissions API; the
  // only way to learn the state there is to ask for a position.
  if (!api?.query) return 'unknown';
  try {
    const status = await api.query({ name: 'geolocation' as PermissionName });
    return status.state as LocationPermission;
  } catch {
    return 'unknown';
  }
}

/**
 * Observe permission changes — for example the user granting it in system
 * settings and returning to the app.
 */
export async function watchLocationPermission(
  onChange: (state: LocationPermission) => void,
): Promise<() => void> {
  const api = permissions();
  if (!api?.query) return () => {};
  try {
    const status = await api.query({ name: 'geolocation' as PermissionName });
    const handler = () => onChange(status.state as LocationPermission);
    status.addEventListener('change', handler);
    return () => status.removeEventListener('change', handler);
  } catch {
    return () => {};
  }
}

/**
 * Trigger the browser's permission prompt.
 *
 * There is no "request permission" call in the Geolocation API — asking
 * for a position is the request. Resolves to the resulting state.
 */
export async function requestLocationPermission(): Promise<LocationPermission> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return 'unknown';

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve('granted'),
      (error) => resolve(error.code === 1 ? 'denied' : 'unknown'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: Infinity },
    );
  });
}

/**
 * Open the operating system's settings page for this app (REQ-PERM-2).
 *
 * Returns false on the web, where no such capability exists — the caller
 * then falls back to instructions (REQ-PERM-3). The native build overrides
 * this in Phase 10.
 */
export async function openAppSettings(): Promise<boolean> {
  return false;
}
