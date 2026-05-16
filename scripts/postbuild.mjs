import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const base = process.env.BASE_PATH ?? '';

// Substitute __BASE__ in any text artifact that needs the deploy base path.
for (const path of ['build/manifest.webmanifest', 'build/404.html']) {
  if (!existsSync(path)) continue;
  const original = readFileSync(path, 'utf8');
  const replaced = original.replaceAll('__BASE__', base);
  if (original !== replaced) {
    writeFileSync(path, replaced);
    console.log(`[postbuild] substituted __BASE__ → "${base}" in ${path}`);
  }
}
