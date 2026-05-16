<script lang="ts">
  import { onMount } from 'svelte';
  import { loadFleet, loadPricing } from '$lib/data';
  import type { FleetJson, PricingJson } from '$lib/data';
  import {
    getSettings,
    saveSettings,
    listTrips,
    clearAllTrips,
    exportTripsCsv
  } from '$lib/storage';
  import type { AppSettings, StoredTrip } from '$lib/storage';
  import { buildAllTripsEmail } from '$lib/email';
  import type { BoatLabel } from '$lib/email';

  const APP_VERSION = '0.1.0';

  let fleet: FleetJson | null = null;
  let pricing: PricingJson | null = null;
  let settings: AppSettings | null = null;
  let trips: StoredTrip[] = [];
  let saving = false;
  let confirmClear = false;
  let loadError: string | null = null;

  let boatId = '';
  let fuelOverrideStr = '';
  let thresholdStr = '50';

  onMount(async () => {
    try {
      [fleet, pricing] = await Promise.all([
        loadFleet().catch(() => null as unknown as FleetJson),
        loadPricing().catch(() => null as unknown as PricingJson)
      ]);
      settings = await getSettings();
      trips = await listTrips().catch(() => []);
      boatId = settings.selectedBoatId ?? '';
      fuelOverrideStr =
        settings.fuelPriceOverride !== null && settings.fuelPriceOverride !== undefined
          ? String(settings.fuelPriceOverride)
          : '';
      thresholdStr = String(settings.alertThresholdEuros ?? 50);
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
    }
  });

  async function persist() {
    saving = true;
    try {
      const override = fuelOverrideStr.trim();
      const next: Partial<AppSettings> = {
        selectedBoatId: boatId || null,
        alertThresholdEuros: Number.parseFloat(thresholdStr) || 50,
        fuelPriceOverride: override === '' ? null : Number.parseFloat(override)
      };
      await saveSettings(next);
      settings = await getSettings();
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
    } finally {
      saving = false;
    }
  }

  function resetFuelToMarina() {
    fuelOverrideStr = '';
  }

  async function exportCsv() {
    try {
      const csv = await exportTripsCsv();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `letsboat-trips-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
    }
  }

  function emailAllTrips() {
    const labels: BoatLabel[] = (fleet?.boats ?? []).map((b) => ({
      id: b.id,
      label: b.label,
      engineLabel: b.engineLabel
    }));
    const draft = buildAllTripsEmail(trips, labels);
    window.location.href = draft.mailto;
  }

  async function doClear() {
    await clearAllTrips();
    trips = [];
    confirmClear = false;
  }

  $: marinaText = pricing ? `€${pricing.gasoline_eur_per_l.toFixed(2)}` : null;
</script>

<main>
  <header>
    <a class="back" href="/" aria-label="Back to home">←</a>
    <h1>Settings</h1>
  </header>

  {#if loadError}
    <p class="error">{loadError}</p>
  {/if}

  <section class="card">
    <h2>Boat</h2>
    {#if fleet && fleet.boats.length > 0}
      <ul class="radio-list" role="radiogroup" aria-label="Boats">
        {#each fleet.boats as b (b.id)}
          <li>
            <label class:selected={boatId === b.id}>
              <input type="radio" name="boat" value={b.id} bind:group={boatId} />
              <span>
                <span class="name">{b.label}</span>
                <span class="engine">{b.engineLabel}</span>
              </span>
            </label>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="muted">Fleet unavailable.</p>
    {/if}
  </section>

  <section class="card">
    <h2>Fuel price override</h2>
    <div class="row">
      <label class="field">
        <span class="field-label">€/L</span>
        <input
          inputmode="decimal"
          type="number"
          step="0.01"
          min="0"
          placeholder={marinaText ? marinaText.replace('€', '') : '1.85'}
          bind:value={fuelOverrideStr}
        />
      </label>
      {#if marinaText}
        <button type="button" class="link" on:click={resetFuelToMarina}>
          Reset to marina ({marinaText})
        </button>
      {/if}
    </div>
  </section>

  <section class="card">
    <h2>Alert threshold</h2>
    <label class="field">
      <span class="field-label">€ spent before alert</span>
      <input inputmode="numeric" type="number" step="1" min="0" bind:value={thresholdStr} />
    </label>
  </section>

  <button type="button" class="primary" on:click={persist} disabled={saving}>
    {saving ? 'Saving…' : 'Save changes'}
  </button>

  <section class="card">
    <h2>Trips</h2>
    <div class="stack">
      <button type="button" class="secondary" on:click={exportCsv}>
        Export all trips (CSV)
      </button>
      <button type="button" class="secondary" on:click={emailAllTrips}>
        Email all trips to Matt
      </button>
      {#if confirmClear}
        <div class="confirm">
          <p>Delete every saved trip on this device? This cannot be undone.</p>
          <div class="confirm-actions">
            <button type="button" class="danger" on:click={doClear}>Yes, clear</button>
            <button type="button" class="secondary" on:click={() => (confirmClear = false)}>
              Cancel
            </button>
          </div>
        </div>
      {:else}
        <button type="button" class="danger-ghost" on:click={() => (confirmClear = true)}>
          Clear all data
        </button>
      {/if}
    </div>
  </section>

  <footer>
    <p>Version {APP_VERSION}</p>
    {#if fleet?.fetched_at_iso}
      <p>Fleet data: {new Date(fleet.fetched_at_iso).toLocaleDateString()}</p>
    {/if}
    {#if pricing?.last_updated_iso}
      <p>Marina price: {new Date(pricing.last_updated_iso).toLocaleDateString()}</p>
    {/if}
  </footer>
</main>

<style>
  main {
    padding: 20px 20px 40px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  header { position: relative; padding-top: 8px; }
  .back {
    position: absolute; left: -6px; top: 0;
    text-decoration: none; color: var(--navy);
    font-size: 22px; padding: 4px 10px;
  }
  h1 {
    margin: 0;
    font-size: 22px;
    font-weight: 500;
    color: var(--navy);
    padding-left: 28px;
  }
  .card {
    background: var(--white);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .card h2 {
    margin: 0;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-muted);
    font-weight: 500;
  }
  .radio-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .radio-list label {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 12px;
    cursor: pointer;
  }
  .radio-list label.selected {
    border-color: var(--navy);
  }
  .radio-list input { accent-color: var(--navy); width: 18px; height: 18px; }
  .name { display: block; color: var(--navy); font-weight: 500; }
  .engine { display: block; color: var(--text-muted); font-size: 13px; }

  .row { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
  .field { display: flex; flex-direction: column; gap: 4px; flex: 1; }
  .field-label {
    font-size: 12px;
    color: var(--text-muted);
    letter-spacing: 0.04em;
  }
  input[type='number'] {
    height: 44px;
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 0 12px;
    font-size: 16px;
    font-family: inherit;
    color: var(--navy);
    background: var(--white);
  }

  .link {
    background: none; border: none; padding: 0;
    color: var(--navy); text-decoration: underline;
    font-size: 13px; cursor: pointer;
  }

  .primary {
    width: 100%; height: 56px;
    background: var(--navy); color: var(--white);
    border: none; border-radius: var(--radius);
    font-size: 17px; font-weight: 500; cursor: pointer;
  }
  .primary[disabled] { opacity: 0.5; }

  .stack { display: flex; flex-direction: column; gap: 8px; }
  .secondary {
    height: 44px;
    background: var(--white);
    color: var(--navy);
    border: 1px solid var(--navy);
    border-radius: var(--radius);
    font-size: 15px;
    cursor: pointer;
  }
  .danger {
    height: 44px;
    background: var(--danger);
    color: var(--white);
    border: none;
    border-radius: var(--radius);
    font-size: 15px;
    cursor: pointer;
  }
  .danger-ghost {
    height: 44px;
    background: var(--white);
    color: var(--danger);
    border: 1px solid var(--danger);
    border-radius: var(--radius);
    font-size: 15px;
    cursor: pointer;
  }
  .confirm {
    padding: 12px;
    border: 1px solid var(--danger);
    border-radius: 12px;
    background: rgba(220, 38, 38, 0.05);
  }
  .confirm p { margin: 0 0 8px; font-size: 14px; color: var(--text); }
  .confirm-actions { display: flex; gap: 8px; }
  .confirm-actions button { flex: 1; }

  footer {
    margin-top: 12px;
    color: var(--text-muted);
    font-size: 12px;
    text-align: center;
  }
  footer p { margin: 2px 0; }

  .muted { color: var(--text-muted); font-size: 13px; }
  .error { color: var(--danger); font-size: 13px; margin: 0; }
</style>
