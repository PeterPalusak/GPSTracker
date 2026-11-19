/**
 * Wake lock behaviour (REQ-BG-1…6), against a stand-in for the browser API.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWakeLock, isWakeLockSupported } from './wakeLock';

class FakeSentinel {
  released = false;
  private listeners: Array<() => void> = [];

  addEventListener(_type: string, listener: () => void) {
    this.listeners.push(listener);
  }

  async release() {
    this.released = true;
    for (const listener of this.listeners) listener();
  }

  /** Simulate the browser dropping the lock when the page is hidden. */
  dropSilently() {
    this.released = true;
    for (const listener of this.listeners) listener();
  }
}

let sentinels: FakeSentinel[] = [];
let visibility: DocumentVisibilityState = 'visible';
let visibilityListeners: Array<() => void> = [];
let requestShouldFail = false;

beforeEach(() => {
  sentinels = [];
  visibility = 'visible';
  visibilityListeners = [];
  requestShouldFail = false;

  vi.stubGlobal('navigator', {
    wakeLock: {
      request: async () => {
        if (requestShouldFail) throw new Error('denied');
        const sentinel = new FakeSentinel();
        sentinels.push(sentinel);
        return sentinel;
      },
    },
  });

  vi.stubGlobal('document', {
    get visibilityState() {
      return visibility;
    },
    addEventListener: (_type: string, listener: () => void) => {
      visibilityListeners.push(listener);
    },
    removeEventListener: (_type: string, listener: () => void) => {
      visibilityListeners = visibilityListeners.filter((l) => l !== listener);
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const fireVisibilityChange = () => visibilityListeners.forEach((l) => l());

describe('support detection', () => {
  it('reports support when the API is present', () => {
    expect(isWakeLockSupported()).toBe(true);
  });

  it('reports no support when it is absent', () => {
    vi.stubGlobal('navigator', {});
    expect(isWakeLockSupported()).toBe(false);
  });
});

describe('acquire and release (REQ-BG-1, REQ-BG-2)', () => {
  it('takes a lock on acquire', async () => {
    const wakeLock = createWakeLock();
    await wakeLock.acquire();

    expect(wakeLock.held).toBe(true);
    expect(sentinels).toHaveLength(1);
  });

  it('releases on release', async () => {
    const wakeLock = createWakeLock();
    await wakeLock.acquire();
    await wakeLock.release();

    expect(wakeLock.held).toBe(false);
    expect(sentinels[0]!.released).toBe(true);
  });

  it('does not stack locks when acquired twice', async () => {
    const wakeLock = createWakeLock();
    await wakeLock.acquire();
    await wakeLock.acquire();

    expect(sentinels).toHaveLength(1);
  });

  it('tolerates releasing when nothing is held', async () => {
    const wakeLock = createWakeLock();
    await expect(wakeLock.release()).resolves.toBeUndefined();
  });

  it('survives the browser refusing the request', async () => {
    requestShouldFail = true;
    const wakeLock = createWakeLock();

    await expect(wakeLock.acquire()).resolves.toBeUndefined();
    expect(wakeLock.held).toBe(false);
  });
});

describe('re-acquiring after the page is hidden (REQ-BG-3)', () => {
  it('takes a fresh lock when the page becomes visible again', async () => {
    // This is the whole point of REQ-BG-3: the browser silently drops the
    // lock when the page hides and never restores it. Without this, one
    // pull of the notification shade ends the recording at the next
    // screen-off, with no error anywhere.
    const wakeLock = createWakeLock();
    await wakeLock.acquire();

    sentinels[0]!.dropSilently();
    expect(wakeLock.held).toBe(false);

    visibility = 'visible';
    fireVisibilityChange();
    await Promise.resolve();
    await Promise.resolve();

    expect(sentinels).toHaveLength(2);
    expect(wakeLock.held).toBe(true);
  });

  it('does not re-acquire while the page is still hidden', async () => {
    const wakeLock = createWakeLock();
    await wakeLock.acquire();
    sentinels[0]!.dropSilently();

    visibility = 'hidden';
    fireVisibilityChange();
    await Promise.resolve();

    expect(sentinels).toHaveLength(1);
  });

  it('does not re-acquire once released deliberately', async () => {
    // After Stop, returning to the app must not quietly hold the screen on.
    const wakeLock = createWakeLock();
    await wakeLock.acquire();
    await wakeLock.release();

    fireVisibilityChange();
    await Promise.resolve();

    expect(wakeLock.held).toBe(false);
    expect(sentinels).toHaveLength(1);
  });
});

describe('dispose', () => {
  it('releases the lock and stops listening', async () => {
    const wakeLock = createWakeLock();
    await wakeLock.acquire();

    wakeLock.dispose();
    expect(visibilityListeners).toHaveLength(0);

    fireVisibilityChange();
    await Promise.resolve();
    expect(sentinels).toHaveLength(1);
  });
});
