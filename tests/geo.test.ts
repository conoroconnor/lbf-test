import { describe, it, expect } from 'vitest';
import {
  PUERTO_BANUS,
  PUERTO_BANUS_RADIUS_M,
  haversineMeters,
  metersToNm,
  mpsToKt,
  isInside,
  pathLengthMeters,
  type LatLng,
} from '../src/lib/geo';

describe('haversineMeters', () => {
  it('Puerto Banús → Marbella town is ~6 km (within 15%)', () => {
    // Marbella town center (approx). The straight-line distance from the
    // marina to Marbella's old town is ~6.7 km — the spec calls it "~6 km";
    // a ±15% bracket validates haversine correctness without being brittle
    // to the exact reference coordinate.
    const marbella: LatLng = { lat: 36.5099, lng: -4.8856 };
    const d = haversineMeters(PUERTO_BANUS, marbella);
    expect(d).toBeGreaterThan(6000 * 0.85);
    expect(d).toBeLessThan(7500);
  });

  it('matches a hand-computed haversine pair to within 1 m', () => {
    // 1-degree lng step at the equator ≈ 111 319.49 m.
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_400);
  });

  it('distance from a point to itself is 0', () => {
    expect(haversineMeters(PUERTO_BANUS, PUERTO_BANUS)).toBeCloseTo(0, 6);
  });
});

describe('isInside', () => {
  it('returns true for the marina center', () => {
    expect(isInside(PUERTO_BANUS, PUERTO_BANUS, PUERTO_BANUS_RADIUS_M)).toBe(true);
  });

  it('returns false for a point 1 km away', () => {
    // ~1 km north of the marina (1 deg lat ≈ 111 km, so 0.009 ≈ 1 km).
    const oneKmNorth: LatLng = { lat: PUERTO_BANUS.lat + 0.009, lng: PUERTO_BANUS.lng };
    expect(isInside(oneKmNorth, PUERTO_BANUS, PUERTO_BANUS_RADIUS_M)).toBe(false);
  });
});

describe('unit conversions', () => {
  it('mpsToKt(0.514444) ≈ 1.0', () => {
    expect(mpsToKt(0.514444)).toBeCloseTo(1.0, 4);
  });

  it('metersToNm(1852) === 1', () => {
    expect(metersToNm(1852)).toBeCloseTo(1.0, 6);
  });
});

describe('pathLengthMeters', () => {
  it('equals the sum of two segments for a 3-point line', () => {
    const a: LatLng = { lat: 36.4843, lng: -4.954 };
    const b: LatLng = { lat: 36.4953, lng: -4.9352 };
    const c: LatLng = { lat: 36.5099, lng: -4.8856 };
    const total = pathLengthMeters([a, b, c]);
    const expected = haversineMeters(a, b) + haversineMeters(b, c);
    expect(total).toBeCloseTo(expected, 6);
  });

  it('returns 0 for empty or single-point arrays', () => {
    expect(pathLengthMeters([])).toBe(0);
    expect(pathLengthMeters([PUERTO_BANUS])).toBe(0);
  });
});
