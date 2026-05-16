/**
 * Pure-logic trip state machine. No DOM, no IndexedDB, no timers — it
 * receives `Tick`s from the UI/geolocation layer and returns updated state
 * plus derived totals (distance, time-weighted avg speed, liters, euros).
 *
 * See docs/superpowers/specs/2026-05-16-letsboat-tracker-design.md §2c.
 */

import { haversineMeters, metersToNm, type LatLng } from './geo';
import { litersForTick, type EngineCurve } from './fuel';

/** A single GPS sample fed into the trip machine at ~1 Hz. */
export interface Tick {
  at: LatLng;
  /** Instantaneous speed in knots (convert from geolocation.coords.speed m/s upstream). */
  speedKt: number;
  /** Sample timestamp in ms since epoch (Date.now()). */
  tsMs: number;
}

export type TripStatus = 'idle' | 'active' | 'stopped';

export interface TripTotals {
  distanceM: number;
  distanceNm: number;
  maxKt: number;
  /** Time-weighted mean of speed across all ticks. */
  avgKt: number;
  /** Sum of dt (capped per-tick) between consecutive ticks, in seconds. */
  durationSec: number;
  liters: number;
  euros: number;
}

export interface TripState {
  status: TripStatus;
  startedAtMs: number | null;
  endedAtMs: number | null;
  engine: EngineCurve;
  pricePerLiter: number;
  /** Euros — when totals.euros first crosses this, `thresholdJustCrossed` fires. */
  alertThreshold: number;
  alerted: boolean;
  points: Tick[];
  totals: TripTotals;
}

/**
 * Clamp dt between ticks. GPS gaps (background, signal loss) can produce
 * huge jumps — we never want a single tick to charge 5 minutes of fuel.
 */
const MAX_TICK_DT_SEC = 60;

function zeroTotals(): TripTotals {
  return {
    distanceM: 0,
    distanceNm: 0,
    maxKt: 0,
    avgKt: 0,
    durationSec: 0,
    liters: 0,
    euros: 0,
  };
}

/** Build a fresh, idle trip. */
export function newTrip(
  engine: EngineCurve,
  pricePerLiter: number,
  alertThreshold = 50,
): TripState {
  return {
    status: 'idle',
    startedAtMs: null,
    endedAtMs: null,
    engine,
    pricePerLiter,
    alertThreshold,
    alerted: false,
    points: [],
    totals: zeroTotals(),
  };
}

/**
 * Move an idle (or already-active) trip into `active` state.
 * Idempotent on an already-active trip.
 */
export function start(state: TripState, now: number = Date.now()): TripState {
  if (state.status === 'active') return state;
  return {
    ...state,
    status: 'active',
    startedAtMs: now,
    endedAtMs: null,
    alerted: false,
    points: [],
    totals: zeroTotals(),
  };
}

/**
 * Ingest one GPS tick. Updates derived totals and returns the new state
 * plus a flag that fires exactly once — the first tick where euros
 * crosses `alertThreshold`.
 *
 * Behavior:
 * - No-op (returns same state, `false`) when status !== 'active'.
 * - The first tick after `start` seeds lastTick; no distance or fuel
 *   accrues from it.
 * - dt is clamped to [0, 60] seconds to absorb GPS gaps.
 * - avgKt is time-weighted: Σ(speed × dt) / Σ dt.
 */
export function ingest(
  state: TripState,
  tick: Tick,
): { state: TripState; thresholdJustCrossed: boolean } {
  if (state.status !== 'active') {
    return { state, thresholdJustCrossed: false };
  }

  const lastTick = state.points[state.points.length - 1];

  // First tick: just seed.
  if (!lastTick) {
    const totals: TripTotals = {
      ...state.totals,
      maxKt: Math.max(state.totals.maxKt, tick.speedKt),
    };
    return {
      state: {
        ...state,
        startedAtMs: state.startedAtMs ?? tick.tsMs,
        points: [...state.points, tick],
        totals,
      },
      thresholdJustCrossed: false,
    };
  }

  const rawDt = (tick.tsMs - lastTick.tsMs) / 1000;
  const dt = Math.max(0, Math.min(MAX_TICK_DT_SEC, rawDt));

  const segmentM = haversineMeters(lastTick.at, tick.at);
  const litersAdded = litersForTick(state.engine, tick.speedKt, dt);

  const newDuration = state.totals.durationSec + dt;
  const prevSpeedSum = state.totals.avgKt * state.totals.durationSec;
  const newAvgKt = newDuration > 0 ? (prevSpeedSum + tick.speedKt * dt) / newDuration : 0;

  const distanceM = state.totals.distanceM + segmentM;
  const liters = state.totals.liters + litersAdded;
  const euros = liters * state.pricePerLiter;

  const totals: TripTotals = {
    distanceM,
    distanceNm: metersToNm(distanceM),
    maxKt: Math.max(state.totals.maxKt, tick.speedKt),
    avgKt: newAvgKt,
    durationSec: newDuration,
    liters,
    euros,
  };

  const crossed = !state.alerted && euros >= state.alertThreshold;

  return {
    state: {
      ...state,
      points: [...state.points, tick],
      totals,
      alerted: state.alerted || crossed,
    },
    thresholdJustCrossed: crossed,
  };
}

/** Stop the trip. Idempotent on a non-active trip. */
export function stop(state: TripState, now: number = Date.now()): TripState {
  if (state.status !== 'active') return state;
  return {
    ...state,
    status: 'stopped',
    endedAtMs: now,
  };
}
