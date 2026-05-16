<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { loadFleet, loadPricing, daysSinceIso } from '$lib/data';
  import type { FleetJson, PricingJson } from '$lib/data';
  import { getSettings, listTrips } from '$lib/storage';
  import type { StoredTrip, AppSettings } from '$lib/storage';
  import { buildTripEmail, MATT_EMAIL } from '$lib/email';
  import type { BoatLabel } from '$lib/email';
  import TripList from '../components/TripList.svelte';

  let settings: AppSettings | null = null;
  let fleet: FleetJson | null = null;
  let pricing: PricingJson | null = null;
  let trips: StoredTrip[] = [];
  let loading = true;
  let dataError: string | null = null;

  $: selectedBoat = fleet?.boats.find((b) => b.id === settings?.selectedBoatId) ?? null;
  $: marinaPrice = pricing?.gasoline_eur_per_l ?? null;
  $: marinaAgeDays = pricing ? daysSinceIso(pricing.last_updated_iso) : Infinity;
  $: effectivePrice = settings?.fuelPriceOverride ?? marinaPrice ?? null;
  $: boatLabels = Object.fromEntries((fleet?.boats ?? []).map((b) => [b.id, b.label]));
  $: lastTrip = trips[0] ?? null;

  onMount(async () => {
    try {
      settings = await getSettings();
    } catch (err) {
      console.warn('getSettings failed', err);
    }
    if (!settings?.selectedBoatId) {
      void goto(`${base}/setup`);
      return;
    }
    try {
      [fleet, pricing, trips] = await Promise.all([
        loadFleet(),
        loadPricing().catch(() => null as unknown as PricingJson),
        listTrips().catch(() => [] as StoredTrip[])
      ]);
    } catch (err) {
      dataError = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  });

  function startTrip() {
    void goto(`${base}/trip`);
  }

  function emailLastTrip() {
    if (!lastTrip || !selectedBoat) return;
    const boat: BoatLabel = {
      id: selectedBoat.id,
      label: selectedBoat.label,
      engineLabel: selectedBoat.engineLabel
    };
    const draft = buildTripEmail(lastTrip, boat);
    window.location.href = draft.mailto;
  }

  function formatPrice(eur: number): string {
    return `€${eur.toFixed(2)}`;
  }
</script>

<main>
  <header class="head">
    <a class="settings" href="{base}/settings" aria-label="Settings">Settings</a>
    <p class="kicker">Let's Boat Marbella</p>
    <h1>{selectedBoat?.label ?? '—'}</h1>
    <p class="sub">{selectedBoat?.engineLabel ?? ''}</p>
  </header>

  <button class="cta" type="button" on:click={startTrip} disabled={loading || !selectedBoat}>
    Start trip
  </button>

  {#if marinaPrice !== null}
    <p class="fuel" class:warn={marinaAgeDays > 14}>
      Marina fuel: <strong>{formatPrice(marinaPrice)}/L</strong>
      <span aria-hidden="true">·</span>
      updated
      {marinaAgeDays === 0 ? 'today' : `${marinaAgeDays} day${marinaAgeDays === 1 ? '' : 's'} ago`}
    </p>
  {:else if !loading}
    <p class="fuel warn">Marina fuel price unavailable — set one in Settings.</p>
  {/if}

  {#if settings?.fuelPriceOverride !== null && settings?.fuelPriceOverride !== undefined && effectivePrice !== null}
    <p class="override">Using your override: {formatPrice(effectivePrice)}/L</p>
  {/if}

  {#if dataError}
    <p class="error">Couldn't refresh data: {dataError}</p>
  {/if}

  <section class="recent">
    <h2>Recent trips</h2>
    <TripList {trips} {boatLabels} limit={5} />
  </section>

  {#if lastTrip}
    <button type="button" class="link" on:click={emailLastTrip}>Send last trip to Matt</button>
  {/if}
</main>

<style>
  main {
    padding: 20px 20px 40px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .head {
    position: relative;
    padding-top: 8px;
  }
  .kicker {
    margin: 0;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--text-muted);
  }
  h1 {
    margin: 4px 0 2px;
    font-size: 26px;
    font-weight: 500;
    letter-spacing: -0.01em;
    color: var(--navy);
  }
  .sub {
    margin: 0;
    font-size: 14px;
    color: var(--text-muted);
  }
  .settings {
    position: absolute;
    top: 4px;
    right: 0;
    font-size: 13px;
    color: var(--navy);
    text-decoration: none;
    padding: 6px 10px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--white);
  }
  .cta {
    width: 100%;
    height: 56px;
    background: var(--navy);
    color: var(--white);
    border: none;
    border-radius: var(--radius);
    font-size: 17px;
    font-weight: 500;
    cursor: pointer;
    letter-spacing: 0.01em;
  }
  .cta[disabled] {
    opacity: 0.5;
  }
  .fuel {
    margin: 0;
    font-size: 14px;
    color: var(--text);
  }
  .fuel.warn {
    color: var(--warn);
  }
  .override {
    margin: -10px 0 0;
    font-size: 12px;
    color: var(--text-muted);
  }
  .error {
    margin: 0;
    font-size: 13px;
    color: var(--danger);
  }
  .recent h2 {
    margin: 0 0 10px;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-muted);
    font-weight: 500;
  }
  .link {
    background: none;
    border: none;
    padding: 0;
    color: var(--navy);
    text-decoration: underline;
    font-size: 14px;
    cursor: pointer;
    align-self: flex-start;
  }
</style>
