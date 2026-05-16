import { describe, it, expect, beforeEach } from 'vitest';
import fixture from '../fixtures/puerto-banus-trip.json';
import { ENGINES } from '../../src/lib/fuel';
import { mpsToKt } from '../../src/lib/geo';
import { newTrip, start, ingest, stop, type Tick } from '../../src/lib/trip';
import { saveTrip, listTrips, clearAllTrips, type StoredTrip } from '../../src/lib/storage';
import { buildTripEmail, MATT_EMAIL } from '../../src/lib/email';

interface FixturePoint {
  lat: number;
  lng: number;
  speedMps: number;
  tsMs: number;
}

const PRICE = 1.85;
const trace = fixture.points as FixturePoint[];

describe('full trip integration: fixture trace → trip → storage → email', () => {
  beforeEach(async () => {
    await clearAllTrips();
  });

  it('runs an end-to-end trip and produces consistent totals, persistence, and a mailto', async () => {
    let state = newTrip(ENGINES['suzuki-df250'], PRICE);
    state = start(state, trace[0].tsMs - 1);

    let crossedCount = 0;
    for (const p of trace) {
      const tick: Tick = {
        at: { lat: p.lat, lng: p.lng },
        speedKt: mpsToKt(p.speedMps),
        tsMs: p.tsMs
      };
      const result = ingest(state, tick);
      state = result.state;
      if (result.thresholdJustCrossed) crossedCount++;
    }
    state = stop(state, trace[trace.length - 1].tsMs);

    expect(state.status).toBe('stopped');
    expect(state.totals.distanceNm).toBeGreaterThan(7);
    expect(state.totals.distanceNm).toBeLessThan(14);
    expect(state.totals.maxKt).toBeGreaterThan(18);
    expect(state.totals.maxKt).toBeLessThan(22);
    expect(state.totals.liters).toBeGreaterThan(0);
    expect(state.totals.euros).toBeCloseTo(state.totals.liters * PRICE, 6);

    if (state.totals.euros > state.alertThreshold) {
      expect(state.alerted).toBe(true);
      expect(crossedCount).toBe(1);
    } else {
      expect(state.alerted).toBe(false);
      expect(crossedCount).toBe(0);
    }

    const stored: StoredTrip = {
      id: 'integration-trip-1',
      boatId: 'flying-manta',
      startedAtIso: new Date(state.startedAtMs!).toISOString(),
      endedAtIso: new Date(state.endedAtMs!).toISOString(),
      distanceNm: state.totals.distanceNm,
      maxKt: state.totals.maxKt,
      avgKt: state.totals.avgKt,
      durationSec: state.totals.durationSec,
      liters: state.totals.liters,
      euros: state.totals.euros,
      pricePerLiter: PRICE,
      alertedAtEuros: state.alerted ? state.alertThreshold : null,
      points: state.points.map((t) => ({ lat: t.at.lat, lng: t.at.lng, kt: t.speedKt, tsMs: t.tsMs }))
    };

    await saveTrip(stored);
    const list = await listTrips();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('integration-trip-1');
    expect(list[0].euros).toBeCloseTo(state.totals.euros, 6);

    const { subject, body, mailto } = buildTripEmail(stored, {
      id: 'flying-manta',
      label: 'The Flying Manta',
      engineLabel: 'Suzuki DF250'
    });

    expect(mailto).toContain(MATT_EMAIL);
    expect(mailto.startsWith('mailto:')).toBe(true);
    expect(subject).toContain('The Flying Manta');
    expect(subject).toContain(stored.euros.toFixed(2));
    expect(body).toContain('Suzuki DF250');
    expect(body).toContain(stored.liters.toFixed(1));
  });
});
