<script lang="ts">
  import type { StoredTrip } from '$lib/storage';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';

  export let trips: StoredTrip[] = [];
  export let emptyLabel: string = 'No trips yet — your first one will appear here.';
  export let limit: number = 5;
  /** Optional id→label lookup from fleet.json so we can show "The Flying Manta" instead of "flying-manta". */
  export let boatLabels: Record<string, string> = {};

  $: visible = trips.slice(0, limit);

  function formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function open(id: string) {
    void goto(`${base}/trip/${id}`);
  }
</script>

{#if visible.length === 0}
  <p class="empty">{emptyLabel}</p>
{:else}
  <ul class="list">
    {#each visible as trip (trip.id)}
      <li>
        <button type="button" on:click={() => open(trip.id)}>
          <span class="row">
            <span class="boat">{boatLabels[trip.boatId] ?? trip.boatId}</span>
            <span class="euros">€{trip.euros.toFixed(2)}</span>
          </span>
          <span class="meta">
            <span>{formatDate(trip.startedAtIso)}</span>
            <span aria-hidden="true">·</span>
            <span>{trip.distanceNm.toFixed(1)} NM</span>
          </span>
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .empty {
    color: var(--text-muted);
    font-size: 14px;
    margin: 8px 0 0;
  }
  .list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  button {
    width: 100%;
    background: var(--white);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 14px 16px;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  button:active {
    background: var(--paper);
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .boat {
    font-size: 15px;
    color: var(--text);
    font-weight: 500;
  }
  .euros {
    font-size: 15px;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .meta {
    font-size: 12px;
    color: var(--text-muted);
    display: flex;
    gap: 6px;
  }
</style>
