<script lang="ts">
  /** Single metric cell used in the live-trip 2x2 grid. */
  export let label: string;
  export let value: string;
  export let accent: boolean = false;
</script>

<div class="cell" class:accent>
  <span class="label">{label}</span>
  <span class="value">{value}</span>
</div>

<style>
  .cell {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 16px 14px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    border-left: 1px solid rgba(255, 255, 255, 0.08);
  }
  .label {
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .value {
    font-size: 28px;
    font-weight: 300;
    color: var(--white);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
  }
  .accent .value {
    color: var(--accent);
  }
</style>
