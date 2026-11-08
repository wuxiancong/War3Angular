import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';

function analyze(data) {
  let r = 0,
    g = 0,
    b = 0,
    n = 0,
    satBlue = 0,
    satRed = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 8) continue;
    const R = data[i],
      G = data[i + 1],
      B = data[i + 2];
    // Ignore near-black / near-white chrome for bias
    if (R + G + B < 40 || R + G + B > 720) continue;
    r += R;
    g += G;
    b += B;
    n++;
    if (B > R + 30 && B >= G) satBlue++;
    if (R > B + 30 && R >= G) satRed++;
  }
  if (!n) return null;
  return { blueBias: b / n - r / n, satBlue, satRed, n, r: r / n, g: g / n, b: b / n };
}

function shouldSwap(st) {
  if (!st) return false;
  return st.blueBias > 22 && st.satBlue > st.satRed * 1.2 && st.satBlue > 20;
}

function processFile(fp) {
  const buf = fs.readFileSync(fp);
  const png = PNG.sync.read(buf);
  const st = analyze(png.data);
  if (!shouldSwap(st)) return false;
  for (let i = 0; i < png.data.length; i += 4) {
    const t = png.data[i];
    png.data[i] = png.data[i + 2];
    png.data[i + 2] = t;
  }
  fs.writeFileSync(fp, PNG.sync.write(png));
  const after = analyze(png.data);
  console.log(
    'FIXED',
    path.basename(fp),
    'bias',
    st.blueBias.toFixed(1),
    '->',
    after?.blueBias.toFixed(1),
    'n',
    st.n
  );
  return true;
}

const dir = process.argv[2];
let fixed = 0,
  scanned = 0;
for (const name of fs.readdirSync(dir)) {
  if (!name.toLowerCase().endsWith('.png')) continue;
  scanned++;
  try {
    if (processFile(path.join(dir, name))) fixed++;
  } catch (e) {
    console.warn('skip', name, e.message);
  }
}
console.log(JSON.stringify({ dir, scanned, fixed }));
