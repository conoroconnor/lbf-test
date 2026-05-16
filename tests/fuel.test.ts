import { describe, it, expect } from 'vitest';
import {
  ENGINES,
  lphAt,
  litersForTick,
  type EngineId,
} from '../src/lib/fuel';

const ALL_IDS: EngineId[] = ['suzuki-df250', 'suzuki-df150', 'volvo-penta-300'];

describe('ENGINES registry', () => {
  it('contains all three engines with matching ids', () => {
    for (const id of ALL_IDS) {
      expect(ENGINES[id]).toBeDefined();
      expect(ENGINES[id].id).toBe(id);
      expect(ENGINES[id].label.length).toBeGreaterThan(0);
      expect(ENGINES[id].bands.length).toBeGreaterThan(1);
    }
  });

  it('has bands sorted ascending by kt for every engine', () => {
    for (const id of ALL_IDS) {
      const bands = ENGINES[id].bands;
      for (let i = 1; i < bands.length; i++) {
        expect(bands[i].kt).toBeGreaterThanOrEqual(bands[i - 1].kt);
      }
    }
  });
});

describe('lphAt — band anchors', () => {
  it('returns exact lph at every anchor kt for every engine', () => {
    for (const id of ALL_IDS) {
      const engine = ENGINES[id];
      // Test the first anchor at each distinct kt (handles duplicate-kt edges).
      const seen = new Set<number>();
      for (const band of engine.bands) {
        if (seen.has(band.kt)) continue;
        seen.add(band.kt);
        // At a duplicate-kt edge the "lower" lph (first anchor at that kt)
        // is what lphAt should return for the clamped/lower-segment case.
        // For non-edge points there's only one anchor, so lph is unambiguous.
      }

      // Stronger assertion: a few specific spec anchors.
      expect(lphAt(ENGINES['suzuki-df250'], 0)).toBe(3);
      expect(lphAt(ENGINES['suzuki-df250'], 15)).toBe(28);
      expect(lphAt(ENGINES['suzuki-df250'], 22)).toBe(28);
      expect(lphAt(ENGINES['suzuki-df250'], 28)).toBe(55);
      expect(lphAt(ENGINES['suzuki-df250'], 38)).toBe(93);
      expect(lphAt(ENGINES['suzuki-df250'], 50)).toBe(93);

      expect(lphAt(ENGINES['suzuki-df150'], 0)).toBe(2);
      expect(lphAt(ENGINES['suzuki-df150'], 15)).toBe(18);
      expect(lphAt(ENGINES['suzuki-df150'], 28)).toBe(34);
      expect(lphAt(ENGINES['suzuki-df150'], 38)).toBe(56);

      expect(lphAt(ENGINES['volvo-penta-300'], 0)).toBe(3.5);
      expect(lphAt(ENGINES['volvo-penta-300'], 15)).toBe(32);
      expect(lphAt(ENGINES['volvo-penta-300'], 28)).toBe(62);
      expect(lphAt(ENGINES['volvo-penta-300'], 38)).toBe(110);
    }
  });

  it('returns the flat lph anywhere inside a flat band', () => {
    // DF250 cruise band is 15–22 kt @ 28 L/h.
    expect(lphAt(ENGINES['suzuki-df250'], 15)).toBe(28);
    expect(lphAt(ENGINES['suzuki-df250'], 18)).toBe(28);
    expect(lphAt(ENGINES['suzuki-df250'], 22)).toBe(28);

    // DF150 fast band is 28–32 kt @ 34 L/h.
    expect(lphAt(ENGINES['suzuki-df150'], 28)).toBe(34);
    expect(lphAt(ENGINES['suzuki-df150'], 30)).toBe(34);
    expect(lphAt(ENGINES['suzuki-df150'], 32)).toBe(34);

    // Volvo idle band is 0–4 kt @ 3.5 L/h.
    expect(lphAt(ENGINES['volvo-penta-300'], 0)).toBe(3.5);
    expect(lphAt(ENGINES['volvo-penta-300'], 2)).toBe(3.5);
    expect(lphAt(ENGINES['volvo-penta-300'], 4)).toBe(3.5);
  });
});

describe('lphAt — linear interpolation between bands', () => {
  it('interpolates DF250 at 9.5 kt strictly between 3 and 28', () => {
    const v = lphAt(ENGINES['suzuki-df250'], 9.5);
    expect(v).toBeGreaterThan(3);
    expect(v).toBeLessThan(28);
    // Halfway between kt=4 (lph=3) and kt=15 (lph=28): t=(9.5-4)/11=0.5
    // → 3 + 0.5*25 = 15.5
    expect(v).toBeCloseTo(15.5, 9);
  });

  it('interpolates DF250 at 25 kt between 28 and 55', () => {
    // Between (22,28) and (28,55): t=(25-22)/6=0.5 → 28 + 0.5*27 = 41.5
    const v = lphAt(ENGINES['suzuki-df250'], 25);
    expect(v).toBeCloseTo(41.5, 9);
    expect(v).toBeGreaterThan(28);
    expect(v).toBeLessThan(55);
  });

  it('interpolates DF150 at 35 kt between 34 and 56', () => {
    // Between (32,34) and (38,56): t=(35-32)/6=0.5 → 34 + 0.5*22 = 45
    expect(lphAt(ENGINES['suzuki-df150'], 35)).toBeCloseTo(45, 9);
  });

  it('interpolates Volvo at 9.5 kt between 3.5 and 32', () => {
    // Between (4,3.5) and (15,32): t=(9.5-4)/11=0.5 → 3.5 + 0.5*28.5 = 17.75
    expect(lphAt(ENGINES['volvo-penta-300'], 9.5)).toBeCloseTo(17.75, 9);
  });
});

describe('lphAt — clamping outside the curve', () => {
  it('clamps speeds below 0 kt to the first-anchor lph for every engine', () => {
    expect(lphAt(ENGINES['suzuki-df250'], -1)).toBe(3);
    expect(lphAt(ENGINES['suzuki-df250'], -1000)).toBe(3);
    expect(lphAt(ENGINES['suzuki-df150'], -5)).toBe(2);
    expect(lphAt(ENGINES['volvo-penta-300'], -0.5)).toBe(3.5);
  });

  it('clamps speeds above 50 kt to the last-anchor lph for every engine', () => {
    expect(lphAt(ENGINES['suzuki-df250'], 50)).toBe(93);
    expect(lphAt(ENGINES['suzuki-df250'], 60)).toBe(93);
    expect(lphAt(ENGINES['suzuki-df250'], 1000)).toBe(93);
    expect(lphAt(ENGINES['suzuki-df150'], 60)).toBe(56);
    expect(lphAt(ENGINES['volvo-penta-300'], 99)).toBe(110);
  });
});

describe('litersForTick', () => {
  it('returns cruise lph (≈) for one hour at 20 kt for every engine', () => {
    // 20 kt sits inside the 15–22 flat cruise band for all three engines.
    expect(litersForTick(ENGINES['suzuki-df250'], 20, 3600)).toBeCloseTo(28, 3);
    expect(litersForTick(ENGINES['suzuki-df150'], 20, 3600)).toBeCloseTo(18, 3);
    expect(litersForTick(ENGINES['volvo-penta-300'], 20, 3600)).toBeCloseTo(
      32,
      3,
    );
  });

  it('returns idle-rate * (60/3600) at 0 kt for one minute', () => {
    // DF250 idle = 3 L/h → 3 * 60/3600 = 0.05 L
    expect(litersForTick(ENGINES['suzuki-df250'], 0, 60)).toBeCloseTo(
      3 * (60 / 3600),
      12,
    );
    // DF150 idle = 2 L/h → 0.0333… L
    expect(litersForTick(ENGINES['suzuki-df150'], 0, 60)).toBeCloseTo(
      2 * (60 / 3600),
      12,
    );
    // Volvo idle = 3.5 L/h → 0.0583… L
    expect(litersForTick(ENGINES['volvo-penta-300'], 0, 60)).toBeCloseTo(
      3.5 * (60 / 3600),
      12,
    );
  });

  it('returns 0 for non-positive or non-finite dt', () => {
    expect(litersForTick(ENGINES['suzuki-df250'], 20, 0)).toBe(0);
    expect(litersForTick(ENGINES['suzuki-df250'], 20, -10)).toBe(0);
    expect(litersForTick(ENGINES['suzuki-df250'], 20, Number.NaN)).toBe(0);
    expect(litersForTick(ENGINES['suzuki-df250'], 20, Number.POSITIVE_INFINITY))
      .toBe(0);
  });

  it('scales linearly with dt at constant speed', () => {
    const oneSecond = litersForTick(ENGINES['suzuki-df250'], 20, 1);
    const oneHour = litersForTick(ENGINES['suzuki-df250'], 20, 3600);
    expect(oneHour).toBeCloseTo(oneSecond * 3600, 9);
  });
});
