import { describe, expect, it } from 'vitest';
import {
  buildAllTripsEmail,
  buildTripEmail,
  MATT_EMAIL,
  type BoatLabel,
} from '../src/lib/email';
import type { StoredTrip } from '../src/lib/storage';

const FLYING_MANTA: BoatLabel = {
  id: 'flying-manta',
  label: 'Flying Manta',
  engineLabel: 'Suzuki DF250',
};

const BLUE_MARLIN: BoatLabel = {
  id: 'blue-marlin',
  label: 'Blue Marlin',
  engineLabel: 'Volvo Penta 300',
};

function canonicalTrip(overrides: Partial<StoredTrip> = {}): StoredTrip {
  return {
    id: 'trip-1',
    boatId: 'flying-manta',
    // 16 May 2026 14:32 local time (use a fixed offset-free ISO so the
    // assertions are stable in any TZ where the test runs — we only assert
    // on the date, not the wall-clock time portion).
    startedAtIso: '2026-05-16T13:32:00.000Z',
    endedAtIso: '2026-05-16T15:05:00.000Z',
    distanceNm: 14.27,
    maxKt: 31.84,
    avgKt: 18.65,
    durationSec: 5580,
    liters: 47.31,
    euros: 73.59,
    pricePerLiter: 1.555,
    alertedAtEuros: 50,
    points: [
      { lat: 36.4843, lng: -4.954, kt: 0.12, tsMs: 1747402320000 },
      { lat: 36.491, lng: -4.95, kt: 18.4, tsMs: 1747402380000 },
      { lat: 36.5, lng: -4.93, kt: 28.7, tsMs: 1747402440000 },
    ],
    ...overrides,
  };
}

describe('buildTripEmail', () => {
  it('formats the subject with date, boat label, and euros', () => {
    const { subject } = buildTripEmail(canonicalTrip(), FLYING_MANTA);
    expect(subject).toBe('Trip 16 May 2026 — Flying Manta — €73.59');
  });

  it('body contains every required field formatted correctly', () => {
    const { body } = buildTripEmail(canonicalTrip(), FLYING_MANTA);
    expect(body).toContain('Boat: Flying Manta (Suzuki DF250)');
    expect(body).toContain('Distance: 14.3 NM');
    expect(body).toContain('Max speed: 31.8 kt');
    expect(body).toContain('Avg speed: 18.7 kt');
    expect(body).toContain('Fuel used: 47.3 L');
    expect(body).toContain('€ spent: €73.59');
    expect(body).toContain('(at €1.56/L)');
    expect(body).toContain('GPS track (3 points):');
    expect(body).toContain('ts_ms,lat,lng,kt');
    expect(body).toContain('1747402320000,36.4843,-4.954,0.12');
    expect(body).toContain('1747402380000,36.491,-4.95,18.40');
  });

  it('mailto is properly URL-encoded and addresses Matt', () => {
    const { subject, body, mailto } = buildTripEmail(canonicalTrip(), FLYING_MANTA);
    expect(mailto.startsWith(`mailto:${MATT_EMAIL}?`)).toBe(true);
    // Round-trip: parse the query string and ensure we get our subject/body
    // back exactly.  Using URL with a base because mailto: lacks a host.
    const url = new URL(mailto);
    expect(url.protocol).toBe('mailto:');
    expect(url.pathname).toBe(MATT_EMAIL);
    expect(url.searchParams.get('subject')).toBe(subject);
    expect(url.searchParams.get('body')).toBe(body);
    // No raw spaces or newlines should appear in the encoded URL.
    const queryPart = mailto.split('?')[1] ?? '';
    expect(queryPart.includes(' ')).toBe(false);
    expect(queryPart.includes('\n')).toBe(false);
  });

  it('falls back gracefully when the boat label is unknown (defensive)', () => {
    // buildTripEmail takes a boat directly; this test exercises the contract
    // where the caller has already looked it up — the function should just
    // use whatever it is given.
    const mystery: BoatLabel = { id: 'unknown', label: 'Mystery Boat', engineLabel: '?' };
    const { subject } = buildTripEmail(canonicalTrip({ boatId: 'unknown' }), mystery);
    expect(subject).toContain('Mystery Boat');
  });
});

describe('buildAllTripsEmail', () => {
  it('subject reports the count and total spend', () => {
    const trips = [
      canonicalTrip({ id: 'a', euros: 65.79, startedAtIso: '2026-05-10T10:00:00.000Z' }),
      canonicalTrip({ id: 'b', euros: 42.1, startedAtIso: '2026-05-12T10:00:00.000Z' }),
      canonicalTrip({ id: 'c', euros: 73.59, startedAtIso: '2026-05-16T10:00:00.000Z' }),
    ];
    const { subject } = buildAllTripsEmail(trips, [FLYING_MANTA, BLUE_MARLIN]);
    expect(subject).toBe("Let's Boat — All trips (3 trips, total €181.48)");
  });

  it('body contains every trip date and uses the boat label lookup', () => {
    const trips = [
      canonicalTrip({
        id: 'a',
        boatId: 'flying-manta',
        startedAtIso: '2026-05-10T10:00:00.000Z',
      }),
      canonicalTrip({
        id: 'b',
        boatId: 'blue-marlin',
        startedAtIso: '2026-05-12T10:00:00.000Z',
      }),
      canonicalTrip({
        id: 'c',
        boatId: 'flying-manta',
        startedAtIso: '2026-05-16T10:00:00.000Z',
      }),
    ];
    const { body } = buildAllTripsEmail(trips, [FLYING_MANTA, BLUE_MARLIN]);
    expect(body).toContain('10 May 2026');
    expect(body).toContain('12 May 2026');
    expect(body).toContain('16 May 2026');
    expect(body).toContain('Flying Manta');
    expect(body).toContain('Blue Marlin');
    // CSV section should have a header line and one row per trip.
    expect(body).toContain(
      'id,boatId,startedAtIso,endedAtIso,durationSec,distanceNm,maxKt,avgKt,liters,euros,pricePerLiter',
    );
    expect(body).toMatch(/^a,flying-manta,/m);
    expect(body).toMatch(/^b,blue-marlin,/m);
    expect(body).toMatch(/^c,flying-manta,/m);
  });

  it('handles an empty trip list without throwing', () => {
    const { subject, body, mailto } = buildAllTripsEmail([], []);
    expect(subject).toBe("Let's Boat — All trips (0 trips, total €0.00)");
    expect(body).toContain('Total trips: 0');
    expect(mailto.startsWith(`mailto:${MATT_EMAIL}?`)).toBe(true);
  });

  it('uses a placeholder label when the boat id is not in the lookup', () => {
    const trips = [
      canonicalTrip({ id: 'x', boatId: 'ghost-ship', startedAtIso: '2026-05-14T10:00:00.000Z' }),
    ];
    const { body } = buildAllTripsEmail(trips, [FLYING_MANTA]);
    // findBoat fallback uses the id as the label.
    expect(body).toContain('ghost-ship');
  });
});
