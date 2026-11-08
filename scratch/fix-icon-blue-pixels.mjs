/**
 * Selective R/B swap: only pixels that are clearly blue-dominant.
 * Preserves gold/yellow/red regions (e.g. Bladestorm gold blade).
 */
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';

function processFile(fp) {
  const png = PNG.sync.read(fs.readFileSync(fp));
  let changed = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] < 8) continue;
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    // Blue-dominant (not near-gray): swap to recover warm WC3 hues
    if (b > r + 28 && b >= g - 5 && b - Math.min(r, g) > 18) {
      png.data[i] = b;
      png.data[i + 2] = r;
      changed++;
    }
  }
  if (changed < 30) return 0;
  fs.writeFileSync(fp, PNG.sync.write(png));
  console.log('FIXED', path.basename(fp), 'pixels', changed);
  return changed;
}

const dir = process.argv[2];
let fixed = 0,
  scanned = 0;
for (const name of fs.readdirSync(dir)) {
  if (!name.toLowerCase().endsWith('.png')) continue;
  scanned++;
  try {
    if (processFile(path.join(dir, name)) > 0) fixed++;
  } catch (e) {
    console.warn('skip', name, e.message);
  }
}
console.log(JSON.stringify({ dir, scanned, fixed }));
