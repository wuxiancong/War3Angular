import fs from 'fs';
import zlib from 'zlib';

function decodePng(path) {
  const buf = fs.readFileSync(path);
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
        v = (v + Math.floor((a + b) / 2)) & 255;
      } else if (ft === 4) {
        const a = x >= bpp ? out[dst + x - bpp] : 0;
        const b = y > 0 ? out[dst - stride + x] : 0;
        const c = x >= bpp && y > 0 ? out[dst - stride + x - bpp] : 0;
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        v = (v + pr) & 255;
      }
      out[dst + x] = v;
    }
  }
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let p = 0; p < out.length; p += 4) {
    if (out[p + 3] < 16) continue;
    r += out[p];
    g += out[p + 1];
    b += out[p + 2];
    n++;
  }
  console.log(
    path.split(/[\\/]/).pop(),
    `${w}x${h}`,
    'avgRGB',
    Math.round(r / Math.max(1, n)),
    Math.round(g / Math.max(1, n)),
    Math.round(b / Math.max(1, n)),
    'n',
    n
  );
}

for (const p of process.argv.slice(2)) decodePng(p);
