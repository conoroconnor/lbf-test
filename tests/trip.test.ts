import { describe, it, expect } from 'vitest';
import { newTrip, start, ingest, stop, type Tick } from '../src/lib/trip';
import { ENGINES } from '../src/lib/fuel';
import { PUERTO_BANUS, type LatLng } from '../src/lib/geo';

const DF250 = ENGINES['suzuki-df250'];

/** Offset a LatLng east by `meters` for synthetic GPS traces. */
function eastOf(p: LatLng, meters: number): LatLng {
  const dLng = meters / (111_320 * Math.cos((p.lat * Math.PI) / 180));
  return { lat: p.lat, lng: p.lng + dLng };
}

describe('newTrip', () => {
  it('starts idle with zero totals', () => {
    const t = newTrip(DF250, 1.8);
    expect(t.status).toBe('idle');
    expect(t.startedAtMs).toBeNull();
    expect(t.endedAtMs).toBeNull();
    expect(t.alerted).toBe(false);
    expect(t.points).toEqual([]);
    expect(t.totals.distanceM).toBe(0);
    expect(t.totals.liters).toBe(0);
    expect(t.totals.euros).toBe(0);
    expect(t.totals.maxKt).toBe(0);
    expect(t.totals.avgKt).toBe(0);
    expect(t.totals.durationSec).toBe(0);
    expect(t.alertThreshold).toBe(50);
  });

  it('honors a custom alert threshold', () => {
    const t = newTrip(DF250, 1.8, 100);
    expect(t.alertThreshold).toBe(100);
  });
});

describe('ingest on idle state', () => {
  it('is a no-op and returns thresholdJustCrossed = false', () => {
    const t = newTrip(DF250, 1.8);
    const tick: Tick = { at: PUERTO_BANUS, speedKt: 20, tsMs: 1000 };
    const result = ingest(t, tick);
    expect(result.state).toBe(t);
    expect(result.thresholdJustCrossed).toBe(false);
  });
});

describe('start + ingest', () => {
  it('accrues liters, distance, and euros across 10 ticks at 20 kt', () => {
    const price = 1.8;
    let state = newTrip(DF250, price);
    state = start(state, 0);

    const startMs = 1_000_000;
    let cur: LatLng = PUERTO_BANUS;
    // First tick seeds — no accrual.
    let res = ingest(state, { at: cur, speedKt: 20, tsMs: startMs });
    state = res.state;

    // 10 more ticks, 1 s apart, moving ~10 m east per tick.
    for (let i = 1; i <= 10; i++) {
      cur = eastOf(cur, 10);
      res = ingest(state, { at: cur, speedKt: 20, tsMs: startMs + i * 1000 });
      state = res.state;
    }

    expect(state.totals.liters).toBeGreaterThan(0);
    expect(state.totals.distanceM).toBeGreaterThan(0);
    expect(state.totals.euros).toBeCloseTo(state.totals.liters * price, 6);
    expect(state.totals.durationSec).toBe(10);
    expect(state.totals.avgKt).toBeCloseTo(20, 6);
  });
});

describe('thresholdJustCrossed', () => {
  it('fires exactly once when euros crosses the alert threshold', () => {
    // Force fast crossing: low threshold + high price.
    const price = 100; // €/L — pushes euros up fast.
    let state = newTrip(DF250, price, 50);
    state = start(state, 0);

    const startMs = 1_000_000;
    let cur: LatLng = PUERTO_BANUS;
    let crossCount = 0;

    // Seed.
    let res = ingest(state, { at: cur, speedKt: 32, tsMs: startMs });
    state = res.state;
    if (res.thresholdJustCrossed) crossCount++;

    for (let i = 1; i <= 200; i++) {
      cur = eastOf(cur, 5);
      res = ingest(state, { at: cur, speedKt: 32, tsMs: startMs + i * 1000 });
      state = res.state;
      if (res.thresholdJustCrossed) crossCount++;
    }

    expect(state.totals.euros).toBeGreaterThanOrEqual(50);
    expect(state.alerted).toBe(true);
    expect(crossCount).toBe(1);
  });
});

describe('maxKt', () => {
  it('tracks the highest speed seen across ticks', () => {
    let state = newTrip(DF250, 1.8);
    state = start(state, 0);

    const speeds = [5, 12, 30, 18, 22];
    let t = 1_000_000;
    for (const s of speeds) {
      const res = ingest(state, { at: PUERTO_BANUS, speedKt: s, tsMs: t });
      state = res.state;
      t += 1000;
    }
    expect(state.totals.maxKt).toBe(30);
  });
});

describe('dt clamping', () => {
  it('clamps dt > 60s so a 5-minute gap only adds 60s of fuel', () => {
    let state = newTrip(DF250, 1.8);
    state = start(state, 0);

    const t0 = 1_000_000;
    // Seed.
    state = ingest(state, { at: PUERTO_BANUS, speedKt: 20, tsMs: t0 }).state;

    // 5 minutes later — dt should clamp to 60 s.
    const gapped = ingest(state, {
      at: PUERTO_BANUS,
      speedKt: 20,
      tsMs: t0 + 5 * 60 * 1000,
    });
    state = gapped.state;

    expect(state.totals.durationSec).toBe(60);
    // Liters added must equal ~60 s worth at 20 kt, not 300 s.
    // At 20 kt the engine should burn somewhere between idle (3 L/h) and
    // cruise (28 L/h). Bound generously: under 60 s that's < 0.5 L,
    // never the ~2.3 L a 5-minute charge would produce.
    expect(state.totals.liters).toBeLessThan(0.6);
    expect(state.totals.liters).toBeGreaterThan(0);
  });
});

describe('stop', () => {
  it('sets status to stopped and records endedAtMs', () => {
    let state = newTrip(DF250, 1.8);
    state = start(state, 0);
    state = stop(state, 12345);
    expect(state.status).toBe('stopped');
    expect(state.endedAtMs).toBe(12345);
  });

  it('is a no-op on a non-active trip', () => {
    const t = newTrip(DF250, 1.8);
    const after = stop(t, 999);
    expect(after).toBe(t);
  });
});
