/**
 * Thin reactive wrapper over navigator.geolocation.watchPosition.
 *
 * Exposes a Svelte `readable` store whose value is the latest fix or null
 * while we wait for one. A separate `geoError` store carries permission /
 * timeout errors so the UI can react.
 */
import { readable, writable, type Readable } from 'svelte/store';
import { browser } from '$app/environment';

export interface GeoFix {
  lat: number;
  lng: number;
  /** Metres / second, may be null on iOS until movement registers. */
  speed_mps: number | null;
  /** Accuracy radius in metres. */
  accuracy_m: number;
  /** Unix ms. */
  timestamp: number;
}

export const geoError = writable<GeolocationPositionError | null>(null);

const watchOptions: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 1000,
  timeout: 15_000
};

/** Latest GPS fix, or null while we wait for one. SSR-safe (always null). */
export const geoFix: Readable<GeoFix | null> = readable<GeoFix | null>(null, (set) => {
  if (!browser || !('geolocation' in navigator)) {
    return () => {};
  }
  let watchId: number | null = null;
  try {
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        geoError.set(null);
        set({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          speed_mps: pos.coords.speed,
          accuracy_m: pos.coords.accuracy,
          timestamp: pos.timestamp
        });
      },
      (err) => {
        geoError.set(err);
      },
      watchOptions
    );
  } catch (err) {
    // Some browsers throw synchronously when permissions policy blocks GPS.
    console.warn('geolocation.watchPosition threw', err);
  }
  return () => {
    if (watchId !== null && browser) {
      try {
        navigator.geolocation.clearWatch(watchId);
      } catch {
        /* ignore */
      }
    }
  };
});

/** Request a one-shot fix; useful for early permission prompts. */
export function getCurrentPosition(): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    if (!browser || !('geolocation' in navigator)) {
      reject(new Error('Geolocation unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          speed_mps: pos.coords.speed,
          accuracy_m: pos.coords.accuracy,
          timestamp: pos.timestamp
        });
      },
      reject,
      watchOptions
    );
  });
}
