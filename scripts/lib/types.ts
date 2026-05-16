/**
 * Shared TypeScript interfaces for weekly-refresh scraper output.
 *
 * These shapes are the public contract between the scrapers
 * (scripts/scrape-fleet.ts, scripts/scrape-pricing.ts) and the PWA
 * (src/lib/*) which reads /data/fleet.json + /data/pricing.json at runtime.
 *
 * Keep in sync with the JSON files written under static/data/.
 */

export type BoatCategory = 'powerboat' | 'jetski';

export interface BoatRecord {
  /** url-safe slug, derived from label minus leading "The ". e.g. "flying-manta" */
  id: string;
  /** human-facing name, e.g. "The Flying Manta" */
  label: string;
  /** stable engine id used to key into the fuel-curve table in src/lib/fuel.ts */
  engineId: string;
  /** human-facing engine description, e.g. "Suzuki DF250" */
  engineLabel: string;
  /** rated horsepower */
  hp: number;
  /** v1 only ships powerboats; jetskis filtered out before write */
  category: BoatCategory;
}

export interface FleetJson {
  /** ISO-8601 UTC timestamp of when the scrape ran */
  fetched_at_iso: string;
  /** source URL the fleet was scraped from */
  source: string;
  /** powerboats only, in the order the page presented them */
  boats: BoatRecord[];
}

export interface StationRecord {
  /** station brand or rotulo, e.g. "REPSOL" */
  name: string;
  /** street address as returned by the API */
  address: string;
  /** gasoline 95 E5 price in EUR/L, or null if station does not sell it */
  gasoline: number | null;
  /** diesel A price in EUR/L, or null if station does not sell it */
  diesel: number | null;
}

export interface PricingJson {
  /** representative gasoline 95 E5 price in EUR/L for Puerto Banús area */
  gasoline_eur_per_l: number;
  /** representative diesel A price in EUR/L for Puerto Banús area */
  diesel_eur_per_l: number;
  /** ISO-8601 UTC timestamp of when the scrape ran */
  last_updated_iso: string;
  /** human label of the upstream data source */
  source: string;
  /** the stations the representative price was derived from */
  sample_stations: StationRecord[];
}
