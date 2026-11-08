/**
 * Detect & fix BGR-swapped WC3-exported PNGs (blue-biased icons).
 * Heuristic: if mean(B) - mean(R) is clearly larger than mean(R) - mean(B)
 * after considering saturation, swap R/B. Also force-swap known codes.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function decodePng(filePath) {
  const buf = fs.readFileSync(filePath);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  let i = 8;
  const idats = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('ascii', i + 4, i + 8);
    const data = buf.subarray(i + 8, i + 8 + len);
    if (type === 'IDAT') idats.push(data);
    if (type === 'IEND') break;
    i += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idats));
  const bpp = 4;
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let src = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[src++];
    const row = raw.subarray(src, src + stride);
    src += stride;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      let v = row[x];
      if (ft === 1) v = (v + out[dst + x - bpp]) & 255;
      else if (ft === 2) v = (v + out[dst - stride + x]) & 255;
      else if (ft === 3) {
        const a = x >= bpp ? out[dst + x - bpp] : 0;
        const b = out[dst - stride + x];
        v = (v + ((a + b) >> 1)) & 255;
      } else if (ft === 4) {
        const a = x >= bpp ? out[dst + x - bpp] : 0;
        const b = y > 0 ? out[dst - stride + x] : 0;
        const c = x >= bpp && y > 0 ? out[dst - stride + x - bpp] : 0;
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      out[dst + x] = v;
    }
  }
  return { w, h, rgba: out };
}

function writePng(filePath, w, h, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  function chunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.concat([typeBuf, data]);
    let c = 0xffffffff;
    for (let i = 0; i < crcBuf.length; i++) {
      c ^= crcBuf[i];
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE((c ^ 0xffffffff) >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  fs.writeFileSync(
    filePath,
    Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
  );
}

function stats(rgba) {
  let r = 0,
    g = 0,
    b = 0,
    n = 0,
    satBlue = 0,
    satRed = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 24) continue;
    const R = rgba[i],
      G = rgba[i + 1],
      B = rgba[i + 2];
    r += R;
    g += G;
    b += B;
    n++;
    if (B > R + 25 && B > G + 10) satBlue++;
    if (R > B + 25 && R > G + 10) satRed++;
  }
  if (!n) return null;
  return {
    r: r / n,
    g: g / n,
    b: b / n,
    satBlue,
    satRed,
    n,
    blueBias: b / n - r / n,
  };
}

function swapRB(rgba) {
  const out = Buffer.from(rgba);
  for (let i = 0; i < out.length; i += 4) {
    const t = out[i];
    out[i] = out[i + 2];
    out[i + 2] = t;
  }
  return out;
}

function shouldSwap(st, force) {
  if (force) return true;
  if (!st) return false;
  // Strong blue channel dominance vs red, and more blue-saturated pixels than red.
  return st.blueBias > 18 && st.satBlue > st.satRed * 1.25 && st.satBlue > st.n * 0.08;
}

const dir = process.argv[2];
const forceList = new Set((process.argv[3] || '').split(',').filter(Boolean));
if (!dir || !fs.existsSync(dir)) {
  console.error('Usage: node fix-icon-bgr.mjs <dir> [forceCode1,forceCode2]');
  process.exit(1);
}

let fixed = 0,
  skipped = 0,
  scanned = 0;
for (const name of fs.readdirSync(dir)) {
  if (!name.toLowerCase().endsWith('.png')) continue;
  const code = path.basename(name, '.png');
  const fp = path.join(dir, name);
  scanned++;
  let decoded;
  try {
    decoded = decodePng(fp);
  } catch {
    skipped++;
    continue;
  }
  const st = stats(decoded.rgba);
  const force = forceList.has(code) || forceList.has(name);
  if (!shouldSwap(st, force)) {
    skipped++;
    continue;
  }
  const swapped = swapRB(decoded.rgba);
  writePng(fp, decoded.w, decoded.h, swapped);
  const after = stats(swapped);
  console.log(
    'FIXED',
    name,
    'beforeBias',
    st?.blueBias.toFixed(1),
    'afterBias',
    after?.blueBias.toFixed(1),
    force ? '(forced)' : ''
  );
  fixed++;
}
console.log(JSON.stringify({ dir, scanned, fixed, skipped }));
