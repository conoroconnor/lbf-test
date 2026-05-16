/**
 * Fuel-burn model for Let's Boat Marbella vessels.
 *
 * Each engine has a sorted table of (speed_kt, liters_per_hour) anchors.
 * Within a "band" (between two anchors at the same kt, e.g. 4→15 has flat
 * shoulders at 4 kt and 15 kt) the rate is treated as flat; between bands
 * (different kt values) the rate is linearly interpolated.
 *
 * The encoding trick: a band like "flat at 3 L/h from 0–4 kt, then climbing
 * to 28 L/h at 15 kt" is expressed as anchors (0,3) (4,3) (15,28). Standard
 * linear interpolation through these sorted anchors yields exactly the
 * desired piecewise shape.
 *
 * Source curves: spec §3 (seeded from Suzuki/Volvo published consumption
 * charts; tune against real-world fuel-fill data after first 5–10 trips).
 *
 * Pure functions only — no I/O, no DOM, no IndexedDB.
 */

export type EngineId = 'suzuki-df250' | 'suzuki-df150' | 'volvo-penta-300';

export interface EngineCurve {
  id: EngineId;
  label: string;
  /** Sorted (ascending kt) speed-band anchors mapping knots → liters/hour. */
  bands: Array<{ kt: number; lph: number }>;
}

export const ENGINES: Record<EngineId, EngineCurve> = {
  'suzuki-df250': {
    id: 'suzuki-df250',
    label: 'Suzuki DF250',
    bands: [
      { kt: 0, lph: 3 },
      { kt: 4, lph: 3 },
      { kt: 15, lph: 28 },
      { kt: 22, lph: 28 },
      { kt: 28, lph: 55 },
      { kt: 32, lph: 55 },
      { kt: 38, lph: 93 },
      { kt: 50, lph: 93 },
    ],
  },
  'suzuki-df150': {
    id: 'suzuki-df150',
    label: 'Suzuki DF150',
    bands: [
      { kt: 0, lph: 2 },
      { kt: 4, lph: 2 },
      { kt: 15, lph: 18 },
      { kt: 22, lph: 18 },
      { kt: 28, lph: 34 },
      { kt: 32, lph: 34 },
      { kt: 38, lph: 56 },
      { kt: 50, lph: 56 },
    ],
  },
  'volvo-penta-300': {
    id: 'volvo-penta-300',
    label: 'Volvo Penta 300',
    bands: [
      { kt: 0, lph: 3.5 },
      { kt: 4, lph: 3.5 },
      { kt: 15, lph: 32 },
      { kt: 22, lph: 32 },
      { kt: 28, lph: 62 },
      { kt: 32, lph: 62 },
      { kt: 38, lph: 110 },
      { kt: 50, lph: 110 },
    ],
  },
};

/**
 * Linearly interpolate liters/hour at a given speed (knots).
 *
 * Walks the sorted band list, clamps below the first anchor and above the
 * last anchor, returns exact lph at any anchor kt, and interpolates linearly
 * between adjacent anchors. When two adjacent anchors share the same kt
 * (band edge) the segment has zero width and is skipped; the next segment
 * is consulted instead, which naturally produces the flat-within-band /
 * linear-between-bands shape from the spec.
 */
export function lphAt(engine: EngineCurve, speedKt: number): number {
  const bands = engine.bands;
  if (bands.length === 0) {
    throw new Error(`Engine ${engine.id} has no bands`);
  }

  // Clamp below first anchor.
  if (speedKt <= bands[0].kt) {
    return bands[0].lph;
  }
  // Clamp above last anchor.
  const last = bands[bands.length - 1];
  if (speedKt >= last.kt) {
    return last.lph;
  }

  // Find the segment [a, b] such that a.kt <= speedKt <= b.kt.
  // Prefer segments where speedKt is strictly inside (handles duplicate-kt
  // edges cleanly by skipping the zero-width segment).
  for (let i = 0; i < bands.length - 1; i++) {
    const a = bands[i];
    const b = bands[i + 1];
    if (speedKt >= a.kt && speedKt <= b.kt) {
      const span = b.kt - a.kt;
      if (span === 0) {
        // Zero-width segment (band edge). If speedKt exactly matches, pick
        // the upper anchor — at a true band edge the "in-band" flat rate is
        // already shared between a and b in our encoding, so either is fine.
        // Continue scanning to prefer a non-zero segment if one exists at
        // the same kt boundary.
        if (speedKt === a.kt) {
          return a.lph;
        }
        continue;
      }
      const t = (speedKt - a.kt) / span;
      return a.lph + t * (b.lph - a.lph);
    }
  }

  // Unreachable given the clamps above, but TypeScript needs a return.
  return last.lph;
}

/**
 * Liters burned in a single tick at constant speed for `dtSeconds`.
 *
 * Pure: liters = lph(speed) × dtSeconds / 3600. Negative or zero dt yields 0.
 */
export function litersForTick(
  engine: EngineCurve,
  speedKt: number,
  dtSeconds: number,
): number {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) {
    return 0;
  }
  return (lphAt(engine, speedKt) * dtSeconds) / 3600;
}
