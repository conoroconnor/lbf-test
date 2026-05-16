<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { loadFleet } from '$lib/data';
  import type { FleetJson } from '$lib/data';
  import { getSettings, saveSettings } from '$lib/storage';

  let fleet: FleetJson | null = null;
  let loading = true;
  let error: string | null = null;
  let selectedId: string | null = null;
  let saving = false;

  onMount(async () => {
    try {
      const existing = await getSettings();
      if (existing.selectedBoatId) selectedId = existing.selectedBoatId;
      fleet = await loadFleet();
      if (!selectedId && fleet.boats.length > 0) {
        selectedId = fleet.boats[0].id;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  });

  async function confirm() {
    if (!selectedId) return;
    saving = true;
    try {
      await saveSettings({ selectedBoatId: selectedId });
      void goto('/');
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      saving = false;
    }
  }
</script>

<main>
  <header class="splash">
    <div class="mark" aria-hidden="true">⚓</div>
    <h1>Let's Boat</h1>
    <p class="tagline">Freedom shared at sea.</p>
  </header>

  <section class="picker">
    <h2>Pick your boat</h2>
    {#if loading}
      <p class="muted">Loading fleet…</p>
    {:else if error}
      <p class="error">Couldn't load the fleet: {error}</p>
    {:else if fleet && fleet.boats.length > 0}
      <ul class="list" role="radiogroup" aria-label="Boats">
        {#each fleet.boats as boat (boat.id)}
          <li>
            <label class:selected={selectedId === boat.id}>
              <input
                type="radio"
                name="boat"
                value={boat.id}
                bind:group={selectedId}
              />
              <span class="label">
                <span class="name">{boat.label}</span>
                <span class="engine">{boat.engineLabel}</span>
              </span>
            </label>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="muted">No boats available.</p>
    {/if}
  </section>

  <button class="cta" type="button" on:click={confirm} disabled={!selectedId || saving}>
    {saving ? 'Saving…' : 'Use this boat'}
  </button>
</main>

<style>
  main {
    padding: 32px 20px 40px;
    display: flex;
    flex-direction: column;
    gap: 28px;
    min-height: 100dvh;
  }
  .splash {
    text-align: center;
    margin-top: 24px;
  }
  .mark {
    font-size: 40px;
    color: var(--navy);
  }
  h1 {
    margin: 8px 0 4px;
    font-size: 32px;
    font-weight: 300;
    letter-spacing: -0.01em;
    color: var(--navy);
  }
  .tagline {
    margin: 0;
    color: var(--text-muted);
    font-size: 14px;
    letter-spacing: 0.02em;
  }
  .picker h2 {
    margin: 0 0 12px;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-muted);
    font-weight: 500;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  label {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    background: var(--white);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    cursor: pointer;
  }
  label.selected {
    border-color: var(--navy);
    box-shadow: inset 0 0 0 1px var(--navy);
  }
  input[type='radio'] {
    width: 18px;
    height: 18px;
    accent-color: var(--navy);
  }
  .label {
    display: flex;
    flex-direction: column;
  }
  .name {
    font-size: 15px;
    font-weight: 500;
    color: var(--navy);
  }
  .engine {
    font-size: 13px;
    color: var(--text-muted);
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
    margin-top: auto;
  }
  .cta[disabled] {
    opacity: 0.5;
  }
  .muted { color: var(--text-muted); font-size: 14px; }
  .error { color: var(--danger); font-size: 14px; }
</style>
