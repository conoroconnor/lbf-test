# Let's Boat — Trip Tracker

A no-login Progressive Web App for letsboat.club members. Opens on a phone at the helm of a Let's Boat vessel leaving Puerto Banús, tracks the trip via foreground GPS, and shows live speed, fuel burn, and estimated euro spend on a numbers-first dashboard. Alerts at €50 spent. Trip history stored locally in IndexedDB. Trip summaries are emailable to `matt@letsboat.club`. Built with SvelteKit + Vite + TypeScript, deployed to Cloudflare Pages.

See `docs/superpowers/specs/2026-05-16-letsboat-tracker-design.md` for the full design spec.

## Run

```bash
npm install
npm run dev        # local dev server on :5173
npm run build      # static build to ./build (Cloudflare Pages)
npm run preview    # preview the built site
npm test           # vitest run
npm run test:watch # vitest watch mode
```

## Weekly data refresh (manual run)

```bash
npm run scrape:fleet     # writes static/data/fleet.json
npm run scrape:pricing   # writes static/data/pricing.json
```

These run automatically via GitHub Actions every Sunday 06:00 UTC.

## Stack

- SvelteKit 2 (adapter-static, deploys to Cloudflare Pages)
- Vite 5
- TypeScript 5 (strict)
- `@vite-pwa/sveltekit` for service worker + offline shell
- `idb` for IndexedDB
- Vitest + `@testing-library/svelte` for tests
