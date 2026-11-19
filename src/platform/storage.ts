/**
 * Browser storage durability and usage (REQ-STO-4, REQ-STO-5).
 *
 * Platform code: guarded so it is harmless in Node during tests and on
 * browsers that lack the Storage API.
 */

/**
 * Ask the browser to make stored data exempt from eviction.
 *
 * Without this, IndexedDB is evictable under storage pressure, and Safari
 * clears script-writable storage for sites unused for seven days. Chrome
 * usually grants it silently for an installed PWA.
 *
 * Returns whether storage is persistent after the request; false is not an
 * error, just a weaker guarantee.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export interface StorageUsage {
  /** Bytes used by this origin, or null where the browser will not say. */
  usage: number | null;
  /** Bytes available to this origin, or null. */
  quota: number | null;
  persistent: boolean;
}

/** Current storage usage, for display in Settings (REQ-STO-5). */
export async function getStorageUsage(): Promise<StorageUsage> {
  const persistent = (await navigator?.storage?.persisted?.()) ?? false;

  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { usage: null, quota: null, persistent };
  }
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return { usage: usage ?? null, quota: quota ?? null, persistent };
  } catch {
    return { usage: null, quota: null, persistent };
  }
}
