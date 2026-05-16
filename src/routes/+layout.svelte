<script lang="ts">
  import '../styles/brand.css';
</script>

<div class="frame">
  <slot />
</div>

<style>
  :global(*, *::before, *::after) {
    box-sizing: border-box;
  }
  :global(button) {
    font-family: inherit;
  }
  :global(html), :global(body) {
    height: 100%;
  }
  .frame {
    min-height: 100dvh;
    max-width: 640px;
    margin: 0 auto;
    padding: env(safe-area-inset-top) env(safe-area-inset-right)
      env(safe-area-inset-bottom) env(safe-area-inset-left);
    background: var(--paper);
    position: relative;
  }
</style>
