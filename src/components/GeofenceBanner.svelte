<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  /**
   * Shown when the app opens outside the Puerto Banús geofence and no trip
   * is running. Offers a one-tap start (we cannot backfill pre-open time).
   */
  const dispatch = createEventDispatcher<{ start: void; dismiss: void }>();
</script>

<aside class="banner" role="status">
  <p>Looks like you're already underway — start tracking from here?</p>
  <div class="actions">
    <button type="button" class="primary" on:click={() => dispatch('start')}>
      Start tracking
    </button>
    <button type="button" class="ghost" on:click={() => dispatch('dismiss')}>Not now</button>
  </div>
</aside>

<style>
  .banner {
    background: rgba(168, 208, 230, 0.12);
    border: 1px solid rgba(168, 208, 230, 0.3);
    border-radius: var(--radius);
    padding: 14px 14px 12px;
    margin: 12px 0;
    color: var(--white);
  }
  p {
    margin: 0 0 10px;
    font-size: 14px;
    line-height: 1.4;
  }
  .actions {
    display: flex;
    gap: 10px;
  }
  button {
    flex: 1;
    height: 40px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
  }
  .primary {
    background: var(--accent);
    color: var(--navy);
    border: none;
  }
  .ghost {
    background: transparent;
    color: var(--white);
    border: 1px solid rgba(255, 255, 255, 0.3);
  }
</style>
