/**
 * scrape-fleet.ts
 *
 * Fetches https://letsboat.club, parses the boat cards out of the HTML, maps
 * each boat to a stable engine id, drops jet skis (v1 scope per spec §6) and
 * writes static/data/fleet.json.
 *
 * Run manually: `npm run scrape:fleet`
 * Run automatically: Sundays 06:00 UTC via .github/workflows/weekly-refresh.yml
 *
 * Fail-loud contract: if the page yields 0 powerboat candidates, the script
 * exits 1 without writing anything. The PWA reads the previously-committed
 * fleet.json so the worst case is "data is stale", never "data is empty".
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

import type { BoatRecord, FleetJson } from './lib/types.js';

const SOURCE_URL = 'https://letsboat.club';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUTPUT_PATH = resolve(__dirname, '..', 'static', 'data', 'fleet.json');

/**
 * Slugify a boat label into a stable id.
 * "The Flying Manta" -> "flying-manta"
 */
function slugify(label: string): string {
  return label
    .replace(/^The\s+/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Map a free-text engine description (e.g. "Suzuki 250 hp", "Volvo Penta 300")
 * to the {engineId, engineLabel, hp} tuple used by src/lib/fuel.ts.
 *
 * Returns null if the text does not look like a known powerboat engine —
 * which is how we filter out jet skis (no recognizable outboard engine).
 */
function mapEngine(
  raw: string,
): { engineId: string; engineLabel: string; hp: number } | null {
  const text = raw.toLowerCase();

  // Suzuki DF250 / Suzuki 250
  if (/suzuki/.test(text) && /\b250\b/.test(text)) {
    return { engineId: 'suzuki-df250', engineLabel: 'Suzuki DF250', hp: 250 };
  }
  // Suzuki DF150 / Suzuki 150
  if (/suzuki/.test(text) && /\b150\b/.test(text)) {
    return { engineId: 'suzuki-df150', engineLabel: 'Suzuki DF150', hp: 150 };
  }
  // Volvo Penta 300
  if (/volvo/.test(text) && /\b300\b/.test(text)) {
    return {
      engineId: 'volvo-penta-300',
      engineLabel: 'Volvo Penta 300',
      hp: 300,
    };
  }
  return null;
}

/**
 * Walk the parsed DOM and pull out {label, engineText} pairs for any element
 * that looks like a boat card. The letsboat.club page can change markup so we
 * cast a wide net: any heading/strong containing "The X" where X is a likely
 * vessel name, plus the surrounding text for engine hints.
 */
function extractBoatCandidates(
  $: cheerio.CheerioAPI,
): Array<{ label: string; engineText: string }> {
  const candidates: Array<{ label: string; engineText: string }> = [];
  const seenLabels = new Set<string>();

  // Strategy 1: scan all headings + bold text for "The X" patterns.
  $('h1, h2, h3, h4, h5, h6, strong, b').each((_, el) => {
    const text = $(el).text().trim();
    const match = text.match(/^(The\s+[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)$/);
    if (!match) return;
    const label = match[1].trim();
    if (seenLabels.has(label)) return;
    seenLabels.add(label);

    // Engine hint: combine the next ~500 chars of the surrounding container.
    const container = $(el).parent();
    const engineText = container.text().slice(0, 800);
    candidates.push({ label, engineText });
  });

  // Strategy 2: fallback — search full body text for known fleet names if
  // markup parsing found nothing. This lets the scraper survive minor redesigns.
  if (candidates.length === 0) {
    const body = $('body').text();
    const knownLabels = [
      'The Flying Manta',
      'The Blue Marlin',
      'The Sea Hawk',
      'The Vortex',
      'The Trixx',
    ];
    for (const label of knownLabels) {
      const idx = body.indexOf(label);
      if (idx === -1) continue;
      if (seenLabels.has(label)) continue;
      seenLabels.add(label);
      const engineText = body.slice(idx, idx + 800);
      candidates.push({ label, engineText });
    }
  }

  return candidates;
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[scrape-fleet] GET ${SOURCE_URL}`);

  let html: string;
  try {
    const res = await fetch(SOURCE_URL, {
      headers: {
        // Be a polite, identifiable bot.
        'User-Agent':
          'letsboat-tracker-bot/1.0 (+https://github.com/letsboat-app)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    html = await res.text();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[scrape-fleet] fetch failed: ${(err as Error).message}`);
    process.exit(1);
  }

  const $ = cheerio.load(html);
  const candidates = extractBoatCandidates($);
  // eslint-disable-next-line no-console
  console.log(`[scrape-fleet] found ${candidates.length} boat candidates`);

  const boats: BoatRecord[] = [];
  for (const { label, engineText } of candidates) {
    const engine = mapEngine(engineText);
    if (!engine) {
      // No recognizable powerboat engine = jet ski or unknown -> drop.
      // eslint-disable-next-line no-console
      console.log(`[scrape-fleet] skipping ${label} (no powerboat engine)`);
      continue;
    }
    boats.push({
      id: slugify(label),
      label,
      engineId: engine.engineId,
      engineLabel: engine.engineLabel,
      hp: engine.hp,
      category: 'powerboat',
    });
  }

  if (boats.length === 0) {
    // eslint-disable-next-line no-console
    console.error(
      '[scrape-fleet] 0 powerboat candidates after engine mapping — refusing to write empty fleet.',
    );
    process.exit(1);
  }

  const out: FleetJson = {
    fetched_at_iso: new Date().toISOString(),
    source: SOURCE_URL,
    boats,
  };

  writeFileSync(OUTPUT_PATH, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  // eslint-disable-next-line no-console
  console.log(
    `[scrape-fleet] wrote ${boats.length} boats to ${OUTPUT_PATH}`,
  );
  for (const b of boats) {
    // eslint-disable-next-line no-console
    console.log(`  - ${b.label} (${b.engineLabel}, ${b.hp} hp)`);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[scrape-fleet] unexpected error:', err);
  process.exit(1);
});
