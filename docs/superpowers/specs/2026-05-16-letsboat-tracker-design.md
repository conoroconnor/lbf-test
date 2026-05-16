# Let's Boat — Trip Tracker (PWA)

**Date:** 2026-05-16
**Status:** Design approved, swarm-ready
**Owner:** Conor

## 1. What we're building

A no-login Progressive Web App for members of letsboat.club. Opened on a phone at the helm of a Let's Boat vessel leaving Puerto Banús, it tracks the trip and shows live speed, fuel burn, and estimated euro spend on a numbers-first dark dashboard. Alerts at €50 spent. Trip history stored locally. Emailable summaries to `matt@letsboat.club`.

**Brand:** Let's Boat Marbella — *"Freedom Shared at Sea"*. Navy + white. Luxury-but-accessible.

**Hard constraints (acknowledged, not bugs):**
- iOS Safari PWAs cannot run background GPS. App tracks while open in foreground only. Use model: phone propped at the helm, screen-wake-lock on.
- No login → all trip data lives in IndexedDB on the device.
- Fuel cost is GPS-derived (estimate ±15%), not measured from the engine.

## 2. Architecture

### 2a. The PWA
- **Stack:** Svelte + Vite + TypeScript. Vanilla CSS (no Tailwind needed at this scope).
- **Hosting:** Cloudflare Pages (free, HTTPS, instant deploys — HTTPS required for Geolocation + PWA install).
- **Browser APIs:** `navigator.geolocation.watchPosition`, `WakeLock`, `IndexedDB` (via `idb` wrapper), `serviceWorker` (Vite PWA plugin) for offline shell and installability.
- **Data inputs at startup (7-day cache):** `/data/fleet.json`, `/data/pricing.json`.

### 2b. Weekly data refresher
- **GitHub Actions cron** (`schedule: '0 6 * * 0'` — Sundays 06:00 UTC).
- Two jobs in one workflow:
  - **Fleet scrape:** fetch letsboat.club, parse boat cards → `static/data/fleet.json`.
  - **Pricing scrape:** call `https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/FiltroProvincia/29` (Spanish Min. of Industry fuel-price open API, province 29 = Málaga), filter for Puerto Banús stations, write `static/data/pricing.json` with `gasoline_eur_per_l`, `diesel_eur_per_l`, `last_updated_iso`.
- Workflow commits both JSON files. Cloudflare Pages auto-redeploys.
- Fail-loud: if either scrape returns 0 results, workflow fails and emails Conor — no silent stale data.

### 2c. Data flow per GPS tick (1 Hz)
```
geolocation → {lat, lng, speed_mps, timestamp}
            → distance += haversine(prev, current)
            → liters += lookup_lph(speed_kt, engine) × Δt_seconds / 3600
            → euros = liters × pricing.fuel_eur_per_l
            → if euros > alert_threshold && !alerted: notify("€50 reached"); alerted = true
            → on stop: persist Trip {id, boat_id, start, end, distance_nm, max_kt, avg_kt, liters, euros, points[]} to IndexedDB
```

## 3. The fuel model

Per engine, a speed-band → liters/hour table. Interpolate linearly between bands.

| Engine | idle (0–4 kt) | cruise (15–22 kt) | fast (28–32 kt) | WOT (38+ kt) |
|---|---|---|---|---|
| Suzuki DF250 (Flying Manta) | 3 L/h | 28 L/h | 55 L/h | 93 L/h |
| Volvo Penta 300 (Blue Marlin) | 3.5 L/h | 32 L/h | 62 L/h | 110 L/h |
| Suzuki DF150 (Sea Hawk) | 2 L/h | 18 L/h | 34 L/h | 56 L/h |

Curves are seeded from Suzuki/Volvo published consumption charts. Tune against real-world fuel-fill data after first 5–10 trips.

Jet skis (Vortex, Trixx) — out of v1 scope (different telemetry profile, not the primary use case).

## 4. Screens

1. **Splash / boat picker** — Logo, tagline, "Pick your boat" list from `fleet.json`. Persisted.
2. **Home (idle)** — Boat + engine header, big **Start Trip** button, "Marina fuel €X.XX/L · updated N days ago", recent trips list, **Send last trip to Matt** quick action.
3. **Trip (live)** — Dark dashboard. Big speed readout (kt). Below: fuel used (L), € spent, distance (NM), trip time. €/alert progress bar at bottom. Wake-lock active. **Stop Trip**.
4. **Trip detail** — Track rendered from saved GPS points (no live tile fetch needed; SVG polyline over a static base), totals, **Email to Matt** button.
5. **Settings** — Switch boat, override fuel price (with "reset to marina"), alert threshold (default €50), export all trips CSV, **Email all trips to Matt**, clear data, version + last-data-refresh timestamps.

### Geofence behavior
Puerto Banús marina center: **36.4843°N, -4.9540°W**, radius 500 m.
- Auto-start: on app open, if outside geofence + no trip running + first launch in last 30 min → banner "Looks like you're already underway — start tracking from here?" (one tap to start; cannot backfill pre-open time).
- Manual: Start/Stop always available regardless of geofence.

### Email to Matt
- `mailto:matt@letsboat.club` with subject `Trip {date} — {boat} — €{spent}` and the trip summary in the body (boat, date/time, distance, max/avg kt, liters, €, GPS points as CSV inline). iOS Safari PWA cannot attach files via `mailto:`, so inline body is the chosen path.

## 5. Error handling, testing, success

### 5a. Failure modes & responses
| Failure | Response |
|---|---|
| Geolocation permission denied | Block trip start. Inline message explaining the app cannot work without GPS, link to Settings. |
| GPS signal lost mid-trip | Pause accumulators until next valid fix, show "Searching for GPS" pill. Do not zero-out trip. |
| `fleet.json` / `pricing.json` fetch fails | Fall back to last cached copy. Show "Data X days old" warning when >14d. |
| `pricing.json` missing or stale >30d | Show "Set fuel price manually" inline prompt in Settings; block € display until set. |
| WakeLock not supported (older iOS) | Trip still runs, banner: "Keep screen on manually — auto-wake unavailable on your device." |
| IndexedDB write fails | Show toast, retain trip in memory, retry on next interaction. |
| User backgrounds app mid-trip | Browser pauses GPS. On return, show "Paused — Y minutes missed. Resume?" |

### 5b. Testing
- **Unit:** fuel-curve interpolation, haversine, alert threshold logic, geofence enclosure check — Vitest.
- **Integration:** mock `geolocation.watchPosition` with a recorded GPS trace from Puerto Banús → harbor exit → cruise → return; assert distance, liters, and € within ±2% of expected.
- **Manual:** install on iPhone via Safari "Add to Home Screen"; do one real short trip (or driving simulation in a car along the coast road) to validate end-to-end.

### 5c. v1 success criteria
1. Installs to iPhone home screen with Let's Boat logo + brand colors.
2. From home screen open → tap Start → big speed/€ readout updates live as device moves.
3. €50 alert fires once per trip when crossed.
4. Trip is saved on stop and visible in history.
5. "Email to Matt" opens Mail with a complete pre-filled message.
6. Weekly cron has run at least once and updated `pricing.json` with a real Puerto Banús marina price.
7. Works offline (after first load) except for the data refresh.

## 6. Out of scope for v1
- Login / multi-user accounts
- Cloud sync of trip history
- Bluetooth NMEA / Suzuki BMS engine telemetry
- Jet ski support (Vortex, Trixx)
- Weather overlay
- Push notifications when app is closed
- Android-specific testing (should work; not the primary target)

## 7. Repo layout
```
letsboat-app/
├── docs/superpowers/specs/         # this file
├── src/                            # Svelte app
│   ├── routes/
│   ├── lib/
│   │   ├── fuel.ts                 # curves + interpolation
│   │   ├── geo.ts                  # haversine, geofence
│   │   ├── trip.ts                 # Trip state machine
│   │   ├── storage.ts              # IndexedDB wrapper
│   │   └── email.ts                # mailto builder
│   ├── styles/                     # brand vars (navy, white)
│   └── app.html
├── static/
│   ├── data/
│   │   ├── fleet.json
│   │   └── pricing.json
│   ├── icons/                      # PWA icons (192, 512, maskable)
│   └── logo.svg
├── scripts/
│   ├── scrape-fleet.ts             # used by the workflow
│   └── scrape-pricing.ts
├── .github/workflows/weekly-refresh.yml
├── tests/
└── package.json
```
