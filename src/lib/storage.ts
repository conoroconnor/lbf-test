import { openDB, type IDBPDatabase, type DBSchema } from 'idb';

/**
 * Persistence layer for Let's Boat Trip Tracker.
 *
 * Single IndexedDB database 'letsboat-tracker' (v1) with two object stores:
 *   - 'trips'    keyed by trip.id
 *   - 'settings' keyed by the fixed string 'app'
 *
 * All public functions are async and resolve once the underlying transaction
 * has committed.  Errors from IDB bubble up so the UI layer can surface a
 * toast and retry (spec §5a — "IndexedDB write fails").
 */

export interface StoredTripPoint {
  lat: number;
  lng: number;
  kt: number;
  tsMs: number;
}

export interface StoredTrip {
  id: string;
  boatId: string; // e.g. 'flying-manta'
  startedAtIso: string;
  endedAtIso: string;
  distanceNm: number;
  maxKt: number;
  avgKt: number;
  durationSec: number;
  liters: number;
  euros: number;
  pricePerLiter: number;
  alertedAtEuros: number | null;
  points: StoredTripPoint[];
}

export interface AppSettings {
  selectedBoatId: string | null;
  fuelPriceOverride: number | null; // null = use marina from pricing.json
  alertThresholdEuros: number; // default 50
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DB_NAME = 'letsboat-tracker';
export const DB_VERSION = 1;
export const TRIPS_STORE = 'trips';
export const SETTINGS_STORE = 'settings';
export const SETTINGS_KEY = 'app';

export const DEFAULT_SETTINGS: AppSettings = {
  selectedBoatId: null,
  fuelPriceOverride: null,
  alertThresholdEuros: 50,
};

// ---------------------------------------------------------------------------
// DB schema for idb's typed wrapper
// ---------------------------------------------------------------------------

interface LetsBoatSchema extends DBSchema {
  trips: {
    key: string;
    value: StoredTrip;
  };
  settings: {
    key: string;
    value: AppSettings;
  };
}

// ---------------------------------------------------------------------------
// Connection management.  We memoize the open promise so concurrent callers
// share a single connection rather than racing to open the DB.
// ---------------------------------------------------------------------------

let dbPromise: Promise<IDBPDatabase<LetsBoatSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<LetsBoatSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<LetsBoatSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(TRIPS_STORE)) {
          db.createObjectStore(TRIPS_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          db.createObjectStore(SETTINGS_STORE);
        }
      },
    });
  }
  return dbPromise;
}

/** Test-only helper: close any open connection and forget the cache so a fresh open occurs. */
export async function _resetDbForTests(): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      db.close();
    } catch {
      // ignore — caller wants a clean slate regardless
    }
  }
  dbPromise = null;
}

// ---------------------------------------------------------------------------
// Trip CRUD
// ---------------------------------------------------------------------------

export async function saveTrip(trip: StoredTrip): Promise<void> {
  const db = await getDb();
  await db.put(TRIPS_STORE, trip);
}

export async function getTrip(id: string): Promise<StoredTrip | undefined> {
  const db = await getDb();
  return db.get(TRIPS_STORE, id);
}

/** Returns all trips, newest first by startedAtIso. */
export async function listTrips(): Promise<StoredTrip[]> {
  const db = await getDb();
  const all = await db.getAll(TRIPS_STORE);
  return all.sort((a, b) => (a.startedAtIso < b.startedAtIso ? 1 : -1));
}

export async function deleteTrip(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(TRIPS_STORE, id);
}

export async function clearAllTrips(): Promise<void> {
  const db = await getDb();
  await db.clear(TRIPS_STORE);
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

const CSV_COLUMNS = [
  'id',
  'boatId',
  'startedAtIso',
  'endedAtIso',
  'durationSec',
  'distanceNm',
  'maxKt',
  'avgKt',
  'liters',
  'euros',
  'pricePerLiter',
] as const;

function csvEscape(value: string | number): string {
  const s = String(value);
  // Quote when the value contains a delimiter, quote, or newline.
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function exportTripsCsv(): Promise<string> {
  const trips = await listTrips();
  const header = CSV_COLUMNS.join(',');
  const rows = trips.map((t) =>
    CSV_COLUMNS.map((col) => csvEscape(t[col] as string | number)).join(','),
  );
  // Trailing newline keeps POSIX tools happy.
  return [header, ...rows].join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSettings(): Promise<AppSettings> {
  const db = await getDb();
  const stored = await db.get(SETTINGS_STORE, SETTINGS_KEY);
  if (!stored) return { ...DEFAULT_SETTINGS };
  // Merge in case we add new fields in a later version.
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  const db = await getDb();
  const current = await getSettings();
  const next: AppSettings = { ...current, ...settings };
  await db.put(SETTINGS_STORE, next, SETTINGS_KEY);
}
