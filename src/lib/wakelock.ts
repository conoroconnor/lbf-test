/**
 * Request and auto-release a screen wake lock. Re-acquires automatically when
 * the page becomes visible again (iOS releases the lock on background).
 */
import { browser } from '$app/environment';

let sentinel: WakeLockSentinel | null = null;
let active = false;
let visibilityBound = false;

function isSupported(): boolean {
  return browser && typeof navigator !== 'undefined' && !!navigator.wakeLock;
}

async function acquire(): Promise<void> {
  if (!isSupported() || !active) return;
  try {
    sentinel = await navigator.wakeLock!.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
  } catch (err) {
    console.warn('wakeLock request failed', err);
  }
}

function onVisibility(): void {
  if (document.visibilityState === 'visible' && active && !sentinel) {
    void acquire();
  }
}

/** Request the wake lock and keep it alive across visibility flips. */
export async function requestWakeLock(): Promise<boolean> {
  if (!isSupported()) return false;
  active = true;
  if (!visibilityBound) {
    document.addEventListener('visibilitychange', onVisibility);
    visibilityBound = true;
  }
  await acquire();
  return sentinel !== null;
}

/** Release the wake lock and stop re-acquiring on visibility. */
export async function releaseWakeLock(): Promise<void> {
  active = false;
  if (visibilityBound) {
    document.removeEventListener('visibilitychange', onVisibility);
    visibilityBound = false;
  }
  if (sentinel) {
    try {
      await sentinel.release();
    } catch {
      /* ignore */
    }
    sentinel = null;
  }
}

export function wakeLockSupported(): boolean {
  return isSupported();
}
