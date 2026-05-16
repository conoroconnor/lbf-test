# Scripts

Weekly data-refresh scrapers for the Let's Boat Trip Tracker PWA.

Both scripts write to `static/data/` so Cloudflare Pages picks the new JSON up on the next deploy. The PWA reads `/data/fleet.json` and `/data/pricing.json` at runtime with a 7-day cache.

## `scrape-fleet.ts`

Fetches the public letsboat.club homepage, parses boat cards out of the HTML with `cheerio`, maps each free-text engine description to a stable `engineId` (used as the key into `src/lib/fuel.ts`), drops jet skis (v1 scope), and writes `static/data/fleet.json`.

Run manually:

```bash
npm run scrape:fleet
```

Output: `{ fetched_at_iso, source, boats: BoatRecord[] }`.

Fail-loud: if the page returns 0 powerboat candidates the script exits 1 without writing — the PWA keeps using the previously committed fleet.

## `scrape-pricing.ts`

Calls the Spanish Ministry of Industry open API:

```
https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/FiltroProvincia/29
```

(`29` = Málaga province.) Filters for stations whose `Municipio` is Marbella **and** whose address or locality mentions Puerto Banús / Nueva Andalucía. Falls back to all Marbella stations if the tight filter is empty. Takes the median gasoline 95 E5 and diesel A price and writes `static/data/pricing.json`.

Run manually:

```bash
npm run scrape:pricing
```

Output: `{ gasoline_eur_per_l, diesel_eur_per_l, last_updated_iso, source, sample_stations[] }`.

Fail-loud: if 0 Marbella-area stations are returned the script exits 1.

## Automatic schedule

`.github/workflows/weekly-refresh.yml` runs both scrapers every Sunday at 06:00 UTC (`cron: '0 6 * * 0'`) and commits the resulting JSON if it changed. `workflow_dispatch` is enabled for manual triggers from the GitHub UI.

`.github/workflows/test.yml` runs `npm run build` and `npm test` on every push and PR to `main`.

## Shared types

`scripts/lib/types.ts` exports `FleetJson`, `PricingJson`, `BoatRecord`, and `StationRecord` — the same shapes the PWA imports from `src/lib/*` so the runtime and the scrapers cannot drift.

## Seed JSON provenance

The committed `static/data/fleet.json` and `static/data/pricing.json` were produced by running the scrapers locally on **2026-05-16**. The first weekly cron will overwrite them with fresh data. If a scrape fails at seed time (network, upstream blocking), the seed files were populated from the spec's known fleet and a known marina-area price; the file's `source` field reads `"seed-fallback"` in that case and the next successful cron run will replace them.
