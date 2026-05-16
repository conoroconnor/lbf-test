/**
 * scrape-pricing.ts
 *
 * Hits the Spanish Ministry of Industry open API for province 29 (Málaga),
 * filters for stations near Puerto Banús / Nueva Andalucía / Marbella, and
 * writes a representative gasoline + diesel price to static/data/pricing.json.
 *
 * API docs: https://geoportalgasolineras.es/geoportal-instalaciones/
 * Endpoint returns JSON with Spanish keys and prices as comma-decimal strings
 * (e.g. "1,859" means 1.859 EUR/L).
 *
 * Run manually: `npm run scrape:pricing`
 * Run automatically: Sundays 06:00 UTC via .github/workflows/weekly-refresh.yml
 *
 * Fail-loud contract: if 0 Marbella-area stations are returned the script
 * exits 1 without writing — the PWA falls back to the last committed pricing.
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PricingJson, StationRecord } from './lib/types.js';

const API_URL =
  'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/FiltroProvincia/29';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUTPUT_PATH = resolve(__dirname, '..', 'static', 'data', 'pricing.json');

/**
 * The upstream API's relevant fields. Many more fields exist; we ignore them.
 */
interface ApiStation {
  Municipio?: string;
  Localidad?: string;
  Provincia?: string;
  'Dirección'?: string;
  Direccion?: string; // some payloads omit the accent
  Rótulo?: string;
  Rotulo?: string;
  'Precio Gasolina 95 E5'?: string;
  'Precio Gasoleo A'?: string;
}

interface ApiResponse {
  ListaEESSPrecio?: ApiStation[];
}

/**
 * Parse "1,859" -> 1.859. Returns null for empty string, missing, or NaN.
 */
function parsePrice(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const normalized = trimmed.replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * Case- and accent-insensitive includes.
 * "Nueva Andalucía".normalize() handles the diacritic.
 */
function ciIncludes(haystack: string | undefined, needle: string): boolean {
  if (!haystack) return false;
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  return norm(haystack).includes(norm(needle));
}

/**
 * Median of a numeric array. Undefined for empty input.
 */
function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function getAddress(s: ApiStation): string {
  return s['Dirección'] ?? s.Direccion ?? '';
}

function getName(s: ApiStation): string {
  return s['Rótulo'] ?? s.Rotulo ?? '';
}

function toStationRecord(s: ApiStation): StationRecord {
  return {
    name: getName(s) || 'Unknown',
    address: getAddress(s),
    gasoline: parsePrice(s['Precio Gasolina 95 E5']),
    diesel: parsePrice(s['Precio Gasoleo A']),
  };
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[scrape-pricing] GET ${API_URL}`);

  let payload: ApiResponse;
  try {
    const res = await fetch(API_URL, {
      headers: {
        'User-Agent':
          'letsboat-tracker-bot/1.0 (+https://github.com/letsboat-app)',
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    payload = (await res.json()) as ApiResponse;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[scrape-pricing] fetch failed: ${(err as Error).message}`);
    process.exit(1);
  }

  const all: ApiStation[] = payload.ListaEESSPrecio ?? [];
  // eslint-disable-next-line no-console
  console.log(`[scrape-pricing] province 29 returned ${all.length} stations`);

  // Tight filter: Marbella municipality AND any Puerto Banús-area marker.
  const banusKeywords = ['Puerto Banús', 'Banus', 'Banús', 'Nueva Andalucía', 'Nueva Andalucia'];
  const isMarbella = (s: ApiStation): boolean =>
    ciIncludes(s.Municipio, 'Marbella') || ciIncludes(s.Localidad, 'Marbella');
  const isBanus = (s: ApiStation): boolean =>
    banusKeywords.some(
      (kw) =>
        ciIncludes(getAddress(s), kw) ||
        ciIncludes(s.Localidad, kw) ||
        ciIncludes(s.Municipio, kw),
    );

  const banusStations = all.filter((s) => isMarbella(s) && isBanus(s));
  // eslint-disable-next-line no-console
  console.log(
    `[scrape-pricing] ${banusStations.length} stations near Puerto Banús / Nueva Andalucía`,
  );

  // Fall back to all Marbella stations if the tight filter is empty.
  const marbellaStations = all.filter(isMarbella);
  // eslint-disable-next-line no-console
  console.log(
    `[scrape-pricing] ${marbellaStations.length} stations in Marbella municipality`,
  );

  const chosen = banusStations.length > 0 ? banusStations : marbellaStations;

  if (chosen.length === 0) {
    // eslint-disable-next-line no-console
    console.error(
      '[scrape-pricing] 0 Marbella-area stations found — refusing to write empty pricing.',
    );
    process.exit(1);
  }

  const records = chosen.map(toStationRecord);
  const gasolinePrices = records
    .map((r) => r.gasoline)
    .filter((v): v is number => v !== null);
  const dieselPrices = records
    .map((r) => r.diesel)
    .filter((v): v is number => v !== null);

  const gasolineMedian = median(gasolinePrices);
  const dieselMedian = median(dieselPrices);

  if (gasolineMedian === undefined || dieselMedian === undefined) {
    // eslint-disable-next-line no-console
    console.error(
      `[scrape-pricing] missing prices (gasoline=${gasolinePrices.length}, diesel=${dieselPrices.length}) — refusing to write.`,
    );
    process.exit(1);
  }

  // Round to 3 decimals — Spanish fuel prices are reported to 3dp.
  const round3 = (n: number): number => Math.round(n * 1000) / 1000;

  const out: PricingJson = {
    gasoline_eur_per_l: round3(gasolineMedian),
    diesel_eur_per_l: round3(dieselMedian),
    last_updated_iso: new Date().toISOString(),
    source: 'geoportalgasolineras.es',
    sample_stations: records,
  };

  writeFileSync(OUTPUT_PATH, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  // eslint-disable-next-line no-console
  console.log(
    `[scrape-pricing] wrote pricing: gasoline=${out.gasoline_eur_per_l} EUR/L, diesel=${out.diesel_eur_per_l} EUR/L (from ${records.length} stations) -> ${OUTPUT_PATH}`,
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[scrape-pricing] unexpected error:', err);
  process.exit(1);
});
