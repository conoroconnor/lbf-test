# Tests

Three layers.

**1. Unit tests** (one file per module)
- `fuel.test.ts` — engine-curve interpolation
- `geo.test.ts` — haversine, geofence, unit conversions
- `trip.test.ts` — trip state machine (start/ingest/stop, alert threshold, dt-clamp)
- `storage.test.ts` — IndexedDB CRUD via `fake-indexeddb`
- `email.test.ts` — mailto subject/body formatting

Run one file: `npx vitest run tests/fuel.test.ts`

**2. Integration test**
- `integration/full-trip.test.ts` — feeds a deterministic 78-point Puerto Banús GPS trace through `fuel + geo + trip + storage + email` and asserts end-to-end totals, persistence, and the produced mailto.

Fixture: `fixtures/puerto-banus-trip.json` — 2 min idle, 5 min accel to 20 kt, 25 min cruise SW, 5 min decel, 2 min idle. Distances chosen to land in the 8–14 NM range with the DF250 curve.

**3. CI**
- `.github/workflows/test.yml` runs `npm ci`, `npm run build`, `npm test` on every push and PR to `main`.

## Run everything

```bash
npm test                       # full suite
npm run test:watch             # watch mode for TDD
```

## Setup

`tests/setup.ts` (loaded via `vitest.config.ts`) imports `fake-indexeddb/auto` so storage tests work in jsdom, and polyfills `crypto.randomUUID` for older Node.
