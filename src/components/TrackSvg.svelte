<script lang="ts">
  import { PUERTO_BANUS } from '$lib/geo';

  /** Saved GPS points to render as an SVG polyline. */
  export let points: Array<{ lat: number; lng: number }> = [];
  export let width: number = 320;
  export let height: number = 200;
  export let padding: number = 16;

  interface ViewPoint {
    x: number;
    y: number;
  }

  function project(pts: Array<{ lat: number; lng: number }>): {
    line: ViewPoint[];
    marina: ViewPoint;
  } {
    const all = pts.length ? [...pts, PUERTO_BANUS] : [PUERTO_BANUS];
    const lats = all.map((p) => p.lat);
    const lngs = all.map((p) => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const dLat = Math.max(maxLat - minLat, 1e-6);
    const dLng = Math.max(maxLng - minLng, 1e-6);
    // Mercator-ish flat projection — fine at trip scale.
    const innerW = width - padding * 2;
    const innerH = height - padding * 2;
    const scale = Math.min(innerW / dLng, innerH / dLat);
    const offsetX = padding + (innerW - dLng * scale) / 2;
    const offsetY = padding + (innerH - dLat * scale) / 2;

    const toView = (p: { lat: number; lng: number }): ViewPoint => ({
      x: offsetX + (p.lng - minLng) * scale,
      // y inverted: higher lat = up on screen
      y: offsetY + (maxLat - p.lat) * scale
    });

    return {
      line: pts.map(toView),
      marina: toView(PUERTO_BANUS)
    };
  }

  $: projected = project(points);
  $: polyline = projected.line.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
</script>

<svg
  viewBox="0 0 {width} {height}"
  width="100%"
  height={height}
  role="img"
  aria-label="Trip GPS track"
  preserveAspectRatio="xMidYMid meet"
>
  <rect x="0" y="0" width={width} height={height} fill="var(--paper)" />
  {#if projected.line.length > 1}
    <polyline
      points={polyline}
      fill="none"
      stroke="var(--navy)"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <circle cx={projected.line[0].x} cy={projected.line[0].y} r="4" fill="var(--navy)" />
    <circle
      cx={projected.line[projected.line.length - 1].x}
      cy={projected.line[projected.line.length - 1].y}
      r="4"
      fill="var(--success)"
    />
  {:else if projected.line.length === 1}
    <circle cx={projected.line[0].x} cy={projected.line[0].y} r="4" fill="var(--navy)" />
  {/if}
  <circle cx={projected.marina.x} cy={projected.marina.y} r="5" fill="var(--accent)" stroke="var(--navy)" stroke-width="1" />
</svg>

<style>
  svg {
    display: block;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--paper);
  }
</style>
