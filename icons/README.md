# PWA Icons

Three icon files are required for PWA install:

| File | Size | Purpose |
|---|---|---|
| `icon-192.png` | 192×192 | Standard home-screen icon |
| `icon-512.png` | 512×512 | High-res / splash |
| `icon-maskable.png` | 512×512 | Android maskable (safe-zone aware) |

## Source of truth

`/static/logo.svg` is the brand mark (navy `#0A2540` circle with white `LB` monogram + `LETSBOAT` wordmark).

The placeholder PNGs in this folder are minimal solid-navy squares so the manifest validates and `npm run build` succeeds. **Before launch, replace them with real renders from the SVG.**

## Regenerate from logo.svg

Quick local regenerate using `sharp-cli` (no global install needed):

```bash
# 192x192 standard
npx --yes sharp-cli -i static/logo.svg -o static/icons/icon-192.png resize 192 192

# 512x512 standard
npx --yes sharp-cli -i static/logo.svg -o static/icons/icon-512.png resize 512 512

# 512x512 maskable — pad to keep brand inside the safe-zone (inner ~80%)
npx --yes sharp-cli \
  -i static/logo.svg -o static/icons/icon-maskable.png \
  resize 410 410 \
  -- extend top=51 bottom=51 left=51 right=51 background "#0A2540"
```

Or use any design tool (Figma, Sketch) to export from `logo.svg` at the sizes above.
