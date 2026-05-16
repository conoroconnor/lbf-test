<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { getTrip } from '$lib/storage';
  import type { StoredTrip } from '$lib/storage';
  import { loadFleet } from '$lib/data';
  import type { FleetBoat } from '$lib/data';
  import { buildTripEmail } from '$lib/email';
  import type { BoatLabel } from '$lib/email';
  import TrackSvg from '../../../components/TrackSvg.svelte';

  let trip: StoredTrip | null = null;
  let boat: FleetBoat | null = null;
  let loading = true;
  let error: string | null = null;

  $: id = $page.params.id;

  onMount(async () => {
    try {
      const t = await getTrip(id);
      if (!t) {
        error = 'Trip not found.';
        loading = false;
        return;
      }
      trip = t;
      try {
        const fleet = await loadFleet();
        boat = fleet.boats.find((b) => b.id === t.boatId) ?? null;
      } catch {
        /* boat label is nice-to-have */
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  });

  function formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatDuration(sec: number): string {
    if (!Number.isFinite(sec) || sec < 0) return '—';
    const total = Math.floor(sec);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  function emailToMatt() {
    if (!trip) return;
    const label: BoatLabel = {
      id: trip.boatId,
      label: boat?.label ?? trip.boatId,
      engineLabel: boat?.engineLabel ?? ''
    };
    const draft = buildTripEmail(trip, label);
    window.location.href = draft.mailto;
  }
</script>

<main>
  <header>
    <a class="back" href="{base}/" aria-label="Back to home">←</a>
    <h1>{boat?.label ?? trip?.boatId ?? 'Trip'}</h1>
    <p class="date">{trip ? formatDate(trip.startedAtIso) : ''}</p>
  </header>

  {#if loading}
    <p class="muted">Loading…</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else if trip}
    <div class="map">
      <TrackSvg points={trip.points} />
    </div>

    <section class="metrics">
      <div class="cell">
        <span class="label">Distance</span>
        <span class="value">{trip.distanceNm.toFixed(2)} NM</span>
      </div>
      <div class="cell">
        <span class="label">Max</span>
        <span class="value">{trip.maxKt.toFixed(1)} kt</span>
      </div>
      <div class="cell">
        <span class="label">Avg</span>
        <span class="value">{trip.avgKt.toFixed(1)} kt</span>
      </div>
      <div class="cell">
        <span class="label">Duration</span>
        <span class="value">{formatDuration(trip.durationSec)}</span>
      </div>
      <div class="cell">
        <span class="label">Fuel</span>
        <span class="value">{trip.liters.toFixed(2)} L</span>
      </div>
      <div class="cell">
        <span class="label">Spend</span>
        <span class="value">€{trip.euros.toFixed(2)}</span>
      </div>
      <div class="cell">
        <span class="label">Price</span>
        <span class="value">€{trip.pricePerLiter.toFixed(2)}/L</span>
      </div>
      <div class="cell">
        <span class="label">Alert hit</span>
        <span class="value">{trip.alertedAtEuros !== null ? 'Yes' : 'No'}</span>
      </div>
    </section>

    <button type="button" class="cta" on:click={emailToMatt}>Email to Matt</button>
  {/if}
</main>

<style>
  main {
    padding: 20px 20px 40px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  header {
    position: relative;
    padding-top: 8px;
  }
  .back {
    position: absolute;
    left: -6px;
    top: 0;
    text-decoration: none;
    color: var(--navy);
    font-size: 22px;
    padding: 4px 10px;
  }
  h1 {
    margin: 0;
    font-size: 22px;
    font-weight: 500;
    color: var(--navy);
    padding-left: 28px;
  }
  .date {
    margin: 2px 0 0;
    font-size: 13px;
    color: var(--text-muted);
    padding-left: 28px;
  }
  .map { width: 100%; }
  .metrics {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .cell {
    background: var(--white);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }
  .value {
    font-size: 18px;
    font-weight: 500;
    color: var(--navy);
    font-variant-numeric: tabular-nums;
  }
  .cta {
    margin-top: 6px;
    width: 100%;
    height: 56px;
    background: var(--navy);
    color: var(--white);
    border: none;
    border-radius: var(--radius);
    font-size: 17px;
    font-weight: 500;
    cursor: pointer;
  }
  .muted { color: var(--text-muted); }
  .error { color: var(--danger); }
</style>
