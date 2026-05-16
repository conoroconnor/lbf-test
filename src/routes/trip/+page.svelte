<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { loadFleet, loadPricing } from '$lib/data';
  import type { FleetJson, PricingJson, FleetBoat } from '$lib/data';
  import { getSettings, saveTrip } from '$lib/storage';
  import type { AppSettings, StoredTrip, StoredTripPoint } from '$lib/storage';
  import { ENGINES, type EngineId } from '$lib/fuel';
  import { PUERTO_BANUS, PUERTO_BANUS_RADIUS_M, isInside, mpsToKt } from '$lib/geo';
  import { newTrip, start as startTripState, ingest, stop as stopTripState } from '$lib/trip';
  import type { TripState, Tick } from '$lib/trip';
  import { geoFix, geoError } from '$lib/geolocation';
  import { requestWakeLock, releaseWakeLock, wakeLockSupported } from '$lib/wakelock';
  import type { GeoFix } from '$lib/geolocation';
  import SpeedReadout from '../../components/SpeedReadout.svelte';
  import MetricCard from '../../components/MetricCard.svelte';
  import GeofenceBanner from '../../components/GeofenceBanner.svelte';

  let settings: AppSettings | null = null;
  let fleet: FleetJson | null = null;
  let pricing: PricingJson | null = null;
  let boat: FleetBoat | null = null;
  let tripState: TripState | null = null;
  let started = false;
  let stopping = false;
  let lastSeenFixTs = 0;
  let now = Date.now();
  let showGeofenceBanner = false;
  let wakeLockOk = true;
  let permissionDenied = false;
  let initError: string | null = null;

  $: liters = tripState?.totals.liters ?? 0;
  $: distanceNm = tripState?.totals.distanceNm ?? 0;
  $: euros = tripState?.totals.euros ?? 0;
  $: alertThreshold = tripState?.alertThreshold ?? 50;
  $: speedKt = computeSpeed($geoFix);
  $: searching = started && (!$geoFix || now - lastSeenFixTs > 5_000);
  $: elapsedMs = tripState?.startedAtMs ? now - tripState.startedAtMs : 0;
  $: progressPct = alertThreshold > 0 ? Math.min(100, (euros / alertThreshold) * 100) : 0;
  $: alertCrossed = euros >= alertThreshold;

  function computeSpeed(fix: GeoFix | null): number {
    if (!fix) return 0;
    if (typeof fix.speed_mps === 'number' && Number.isFinite(fix.speed_mps) && fix.speed_mps >= 0) {
      return mpsToKt(fix.speed_mps);
    }
    return 0;
  }

  function formatElapsed(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  let tickInterval: ReturnType<typeof setInterval> | null = null;

  onMount(async () => {
    try {
      settings = await getSettings();
    } catch {
      settings = null;
    }
    if (!settings?.selectedBoatId) {
      void goto(`${base}/setup`);
      return;
    }
    try {
      [fleet, pricing] = await Promise.all([
        loadFleet(),
        loadPricing().catch(() => null as unknown as PricingJson)
      ]);
    } catch (err) {
      initError = err instanceof Error ? err.message : String(err);
    }
    boat = fleet?.boats.find((b) => b.id === settings?.selectedBoatId) ?? null;

    if (boat) {
      const engineCurve = ENGINES[boat.engineId as EngineId];
      const pricePerLiter =
        settings.fuelPriceOverride ?? pricing?.gasoline_eur_per_l ?? 0;
      tripState = newTrip(engineCurve, pricePerLiter, settings.alertThresholdEuros);
    }

    wakeLockOk = wakeLockSupported();

    tickInterval = setInterval(() => {
      now = Date.now();
    }, 500);
  });

  // Surface geofence banner when we have a fix and we're outside the marina.
  $: if ($geoFix && !started && !isInside($geoFix, PUERTO_BANUS, PUERTO_BANUS_RADIUS_M)) {
    showGeofenceBanner = true;
  }

  // Push every new fix into the trip state machine while running.
  $: if (started && tripState && $geoFix) handleFix($geoFix);

  $: if ($geoError && $geoError.code === 1) permissionDenied = true;

  function handleFix(fix: GeoFix): void {
    if (!tripState) return;
    lastSeenFixTs = Date.now();
    const tick: Tick = {
      at: { lat: fix.lat, lng: fix.lng },
      speedKt: computeSpeed(fix),
      tsMs: fix.timestamp
    };
    const result = ingest(tripState, tick);
    tripState = result.state;
    if (result.thresholdJustCrossed) fireAlert();
  }

  function fireAlert(): void {
    try {
      if ('vibrate' in navigator) navigator.vibrate?.([200, 80, 200]);
    } catch {
      /* ignore */
    }
    try {
      // Short bleep generated via Web Audio so we don't ship any binary asset.
      type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
      const Ctx = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 880;
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
        osc.start();
        osc.stop(ctx.currentTime + 0.6);
      }
    } catch {
      /* ignore */
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(`€${alertThreshold} reached`, {
          body: 'Fuel spend alert.',
          icon: '/icons/icon-192.png'
        });
      } catch {
        /* ignore */
      }
    }
  }

  async function handleStart(): Promise<void> {
    if (!tripState || started || permissionDenied) return;
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {
        /* ignore */
      }
    }
    tripState = startTripState(tripState);
    started = true;
    showGeofenceBanner = false;
    void requestWakeLock();
  }

  async function handleStop(): Promise<void> {
    if (!tripState || !started || stopping || !boat) return;
    stopping = true;
    const finished = stopTripState(tripState);
    tripState = finished;
    void releaseWakeLock();
    try {
      const startedAtMs = finished.startedAtMs ?? Date.now();
      const endedAtMs = finished.endedAtMs ?? Date.now();
      const id = `trip-${startedAtMs}`;
      const points: StoredTripPoint[] = finished.points.map((p) => ({
        lat: p.at.lat,
        lng: p.at.lng,
        kt: p.speedKt,
        tsMs: p.tsMs
      }));
      const stored: StoredTrip = {
        id,
        boatId: boat.id,
        startedAtIso: new Date(startedAtMs).toISOString(),
        endedAtIso: new Date(endedAtMs).toISOString(),
        distanceNm: finished.totals.distanceNm,
        maxKt: finished.totals.maxKt,
        avgKt: finished.totals.avgKt,
        durationSec: finished.totals.durationSec,
        liters: finished.totals.liters,
        euros: finished.totals.euros,
        pricePerLiter: finished.pricePerLiter,
        alertedAtEuros: finished.alerted ? finished.alertThreshold : null,
        points
      };
      await saveTrip(stored);
      void goto(`${base}/trip/${id}`);
    } catch (err) {
      console.error('saveTrip failed', err);
      stopping = false;
    }
  }

  onDestroy(() => {
    if (tickInterval) clearInterval(tickInterval);
    void releaseWakeLock();
  });
</script>

<main>
  <header>
    <a class="back" href="{base}/" aria-label="Back to home">←</a>
    <p class="kicker">
      {boat?.label ?? '—'} · {boat?.engineLabel ?? ''}
    </p>
    {#if started}
      <span class="badge">Trip in progress · {formatElapsed(elapsedMs)}</span>
    {:else}
      <span class="badge idle">Ready</span>
    {/if}
  </header>

  {#if permissionDenied}
    <div class="notice danger">
      Location permission is denied. Enable it in iOS Settings → Safari → Location to track trips.
    </div>
  {/if}

  {#if !wakeLockOk}
    <div class="notice">
      Keep your screen on manually — auto-wake isn't available on this device.
    </div>
  {/if}

  {#if showGeofenceBanner && !started}
    <GeofenceBanner on:start={handleStart} on:dismiss={() => (showGeofenceBanner = false)} />
  {/if}

  {#if initError}
    <div class="notice">Data load issue: {initError}</div>
  {/if}

  <SpeedReadout knots={speedKt} {searching} />

  <section class="grid">
    <MetricCard label="Fuel used" value={`${liters.toFixed(2)} L`} />
    <MetricCard label="Spend" value={`€${euros.toFixed(2)}`} accent />
    <MetricCard label="Distance" value={`${distanceNm.toFixed(2)} NM`} />
    <MetricCard label="Trip time" value={formatElapsed(elapsedMs)} />
  </section>

  <div class="progress" class:warn={alertCrossed}>
    <div class="bar" style="width: {progressPct}%"></div>
    <p class="progress-label">
      €{euros.toFixed(2)} / €{alertThreshold.toFixed(0)} alert
    </p>
  </div>

  <div class="spacer"></div>

  {#if started}
    <button type="button" class="stop" on:click={handleStop} disabled={stopping}>
      {stopping ? 'Saving…' : 'Stop trip'}
    </button>
  {:else}
    <button
      type="button"
      class="start"
      on:click={handleStart}
      disabled={permissionDenied || !boat || !tripState}
    >
      Start trip
    </button>
  {/if}
</main>

<style>
  main {
    background: var(--navy);
    color: var(--white);
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    padding: 16px 20px calc(20px + env(safe-area-inset-bottom));
    gap: 16px;
  }
  header {
    position: relative;
    text-align: center;
    padding: 4px 0;
  }
  .back {
    position: absolute;
    left: 0;
    top: 0;
    color: var(--white);
    text-decoration: none;
    font-size: 22px;
    padding: 4px 10px;
    opacity: 0.85;
  }
  .kicker {
    margin: 0;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--accent);
  }
  .badge {
    display: inline-block;
    margin-top: 4px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--white);
    background: rgba(255, 255, 255, 0.08);
    padding: 3px 10px;
    border-radius: 999px;
  }
  .badge.idle { color: var(--accent); }

  .notice {
    background: rgba(255, 255, 255, 0.08);
    border-radius: var(--radius);
    padding: 10px 12px;
    font-size: 13px;
    line-height: 1.4;
  }
  .notice.danger {
    background: rgba(220, 38, 38, 0.15);
    color: #fecaca;
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .progress {
    position: relative;
    height: 8px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 999px;
    overflow: visible;
    margin-bottom: 22px;
  }
  .progress .bar {
    height: 100%;
    background: var(--accent);
    transition: width 200ms ease;
    border-radius: 999px;
  }
  .progress.warn .bar { background: var(--warn); }
  .progress-label {
    position: absolute;
    top: 14px;
    left: 0;
    font-size: 12px;
    color: var(--accent);
    margin: 0;
    letter-spacing: 0.04em;
  }

  .spacer { flex: 1; min-height: 24px; }

  .stop, .start {
    width: 100%;
    height: 56px;
    border-radius: var(--radius);
    font-size: 17px;
    font-weight: 500;
    cursor: pointer;
    border: none;
  }
  .stop {
    background: var(--danger);
    color: var(--white);
  }
  .start {
    background: var(--white);
    color: var(--navy);
  }
  .stop[disabled], .start[disabled] { opacity: 0.5; }
</style>
