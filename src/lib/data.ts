/**
 * Loaders for /data/fleet.json and /data/pricing.json with 7-day cache in
 * localStorage. Falls back to last cached copy on network failure. Returns a
 * `staleDays` count so the UI can show "Data X days old" warnings.
 */
import { browser } from '$app/environment';

export interface FleetBoat {
  id: string;
  label: string;
  engineId: string;
  engineLabel: string;
}

export interface FleetJson {
  fetched_at_iso: string;
  boats: FleetBoat[];
}

export interface PricingJson {
  gasoline_eur_per_l: number;
  diesel_eur_per_l: number;
  last_updated_iso: string;
  source?: string;
}

interface CacheEnvelope<T> {
  fetched_at_ms: number;
  payload: T;
}

const FLEET_URL = '/data/fleet.json';
const PRICING_URL = '/data/pricing.json';
const FLEET_KEY = 'letsboat:cache:fleet';
const PRICING_KEY = 'letsboat:cache:pricing';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function readCache<T>(key: string): CacheEnvelope<T> | null {
  if (!browser) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEnvelope<T>;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, payload: T): void {
  if (!browser) return;
  try {
    const envelope: CacheEnvelope<T> = { fetched_at_ms: Date.now(), payload };
    localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Quota exceeded or private mode — ignore.
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Fetch ${url} returned ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Returns the cached payload if it is younger than 7 days, otherwise refetches.
 * On network failure, falls back to any cached copy (no matter how old).
 */
async function loadWithCache<T>(url: string, key: string): Promise<T> {
  const cached = readCache<T>(key);
  const isFresh = cached && Date.now() - cached.fetched_at_ms < SEVEN_DAYS_MS;
  if (cached && isFresh) return cached.payload;

  try {
    const fresh = await fetchJson<T>(url);
    writeCache(key, fresh);
    return fresh;
  } catch (err) {
    if (cached) return cached.payload;
    throw err;
  }
}

export async function loadFleet(): Promise<FleetJson> {
  return loadWithCache<FleetJson>(FLEET_URL, FLEET_KEY);
}

export async function loadPricing(): Promise<PricingJson> {
  return loadWithCache<PricingJson>(PRICING_URL, PRICING_KEY);
}

/** Whole days between an ISO timestamp and now. */
export function daysSinceIso(iso: string | undefined | null): number {
  if (!iso) return Infinity;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return Infinity;
  return Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000));
}
