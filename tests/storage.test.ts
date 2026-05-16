import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import {
  DEFAULT_SETTINGS,
  _resetDbForTests,
  clearAllTrips,
  deleteTrip,
  exportTripsCsv,
  getSettings,
  getTrip,
  listTrips,
  saveSettings,
  saveTrip,
  type StoredTrip,
} from '../src/lib/storage';

function makeTrip(overrides: Partial<StoredTrip> = {}): StoredTrip {
  return {
    id: overrides.id ?? 'trip-1',
    boatId: 'flying-manta',
    startedAtIso: '2026-05-16T13:00:00.000Z',
    endedAtIso: '2026-05-16T14:30:00.000Z',
    distanceNm: 12.4,
    maxKt: 32.1,
    avgKt: 18.6,
    durationSec: 5400,
    liters: 42.3,
    euros: 65.79,
    pricePerLiter: 1.555,
    alertedAtEuros: 50,
    points: [
      { lat: 36.4843, lng: -4.954, kt: 0.1, tsMs: 1747400400000 },
      { lat: 36.4901, lng: -4.95, kt: 18.4, tsMs: 1747400460000 },
    ],
    ...overrides,
  };
}

// fake-indexeddb persists state in-process; reset between tests so each spec
// starts from a clean DB.
beforeEach(async () => {
  // Drop the cached connection then delete the underlying database.
  _resetDbForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('letsboat-tracker');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
});

describe('storage — trips', () => {
  it('saves and retrieves a trip by id', async () => {
    const trip = makeTrip();
    await saveTrip(trip);
    const got = await getTrip(trip.id);
    expect(got).toEqual(trip);
  });

  it('returns undefined for an unknown trip id', async () => {
    expect(await getTrip('does-not-exist')).toBeUndefined();
  });

  it('listTrips returns newest first', async () => {
    await saveTrip(makeTrip({ id: 'a', startedAtIso: '2026-05-10T10:00:00.000Z' }));
    await saveTrip(makeTrip({ id: 'b', startedAtIso: '2026-05-16T10:00:00.000Z' }));
    await saveTrip(makeTrip({ id: 'c', startedAtIso: '2026-05-12T10:00:00.000Z' }));

    const trips = await listTrips();
    expect(trips.map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });

  it('deleteTrip removes a single trip', async () => {
    await saveTrip(makeTrip({ id: 'a' }));
    await saveTrip(makeTrip({ id: 'b' }));
    await deleteTrip('a');
    const trips = await listTrips();
    expect(trips.map((t) => t.id)).toEqual(['b']);
  });

  it('clearAllTrips empties the store', async () => {
    await saveTrip(makeTrip({ id: 'a' }));
    await saveTrip(makeTrip({ id: 'b' }));
    await clearAllTrips();
    expect(await listTrips()).toEqual([]);
  });
});

describe('storage — CSV export', () => {
  it('produces just a header (plus trailing newline) when no trips exist', async () => {
    const csv = await exportTripsCsv();
    const lines = csv.split('\n');
    expect(lines[0]).toBe(
      'id,boatId,startedAtIso,endedAtIso,durationSec,distanceNm,maxKt,avgKt,liters,euros,pricePerLiter',
    );
    // header + trailing empty line from final \n
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('');
  });

  it('writes one row per trip with the correct header', async () => {
    await saveTrip(makeTrip({ id: 'a' }));
    await saveTrip(makeTrip({ id: 'b', startedAtIso: '2026-05-17T09:00:00.000Z' }));
    const csv = await exportTripsCsv();
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[0].split(',')).toEqual([
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
    ]);
    // listTrips orders newest-first, so 'b' is on row 1.
    expect(lines[1].startsWith('b,')).toBe(true);
    expect(lines[2].startsWith('a,')).toBe(true);
  });
});

describe('storage — settings', () => {
  it('returns defaults when nothing has been stored', async () => {
    const s = await getSettings();
    expect(s).toEqual(DEFAULT_SETTINGS);
  });

  it('partial updates merge into existing settings', async () => {
    await saveSettings({ selectedBoatId: 'flying-manta' });
    let s = await getSettings();
    expect(s.selectedBoatId).toBe('flying-manta');
    expect(s.alertThresholdEuros).toBe(50);

    await saveSettings({ alertThresholdEuros: 75 });
    s = await getSettings();
    expect(s.selectedBoatId).toBe('flying-manta'); // preserved
    expect(s.alertThresholdEuros).toBe(75);
    expect(s.fuelPriceOverride).toBeNull();
  });

  it('fuelPriceOverride can be set and cleared', async () => {
    await saveSettings({ fuelPriceOverride: 1.62 });
    expect((await getSettings()).fuelPriceOverride).toBe(1.62);

    await saveSettings({ fuelPriceOverride: null });
    expect((await getSettings()).fuelPriceOverride).toBeNull();
  });
});
