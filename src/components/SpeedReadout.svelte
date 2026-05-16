<script lang="ts">
  /** Hero speed readout used on the live trip dashboard. */
  export let knots: number = 0;
  export let searching: boolean = false;

  $: display = Number.isFinite(knots) ? knots.toFixed(1) : '—';
</script>

<div class="readout" class:searching aria-live="polite">
  <span class="value">{display}</span>
  <span class="unit">kt</span>
  {#if searching}
    <span class="pill">Searching for GPS</span>
  {/if}
</div>

<style>
  .readout {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 8px;
    padding: 24px 0 16px;
    position: relative;
  }
  .value {
    font-size: 96px;
    font-weight: 200;
    line-height: 1;
    letter-spacing: -0.04em;
    font-variant-numeric: tabular-nums;
    color: var(--white);
  }
  .unit {
    font-size: 22px;
    font-weight: 400;
    color: var(--accent);
    letter-spacing: 0.04em;
  }
  .pill {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--warn);
    background: rgba(217, 119, 6, 0.12);
    padding: 4px 10px;
    border-radius: 999px;
  }
  .searching .value {
    opacity: 0.6;
  }
</style>
