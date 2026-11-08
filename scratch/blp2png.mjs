import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import zlib from 'zlib';

// Minimal ImageData polyfill for Node (mdx-m3-viewer BLP decoder).
class ImageDataPolyfill {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}
globalThis.ImageData = ImageDataPolyfill;

const require = createRequire(import.meta.url);
const { BlpImage } = require('mdx-m3-viewer/dist/cjs/parsers/blp/image.js');

function writePngRGBA(filePath, width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  function chunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.concat([typeBuf, data]);
    let c = 0xffffffff;
    for (let i = 0; i < crcBuf.length; i++) {
      c ^= crcBuf[i];
      for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    }
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE((c ^ 0xffffffff) >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const png = Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(filePath, png);
}

function avg(rgba) {
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 16) continue;
    r += rgba[i];
    g += rgba[i + 1];
    b += rgba[i + 2];
    n++;
  }
  return [Math.round(r / Math.max(1, n)), Math.round(g / Math.max(1, n)), Math.round(b / Math.max(1, n)), n];
}

function convert(blpPath, pngPath, swapRB = false) {
  const blp = new BlpImage();
  // Copy into aligned ArrayBuffer — Node Buffer views can trip BLP magic checks.
  const file = fs.readFileSync(blpPath);
  const ab = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  blp.load(ab);
  const imageData = blp.getMipmap(0);
  const { width, height, data } = imageData;
  const rgba = Buffer.from(data);
  if (swapRB) {
    for (let i = 0; i < rgba.length; i += 4) {
      const t = rgba[i];
      rgba[i] = rgba[i + 2];
      rgba[i + 2] = t;
    }
  }
  writePngRGBA(pngPath, width, height, rgba);
  const a = avg(rgba);
  console.log(
    path.basename(blpPath),
    `content=${blp.content}`,
    `${width}x${height}`,
    'avgRGB',
    a[0],
    a[1],
    a[2],
    'swap',
    swapRB,
    '->',
    path.basename(pngPath)
  );
}

const args = process.argv.slice(2);
const swap = args.includes('--swap-rb');
const files = args.filter((a) => !a.startsWith('--'));
for (let i = 0; i < files.length; i += 2) convert(files[i], files[i + 1], swap);
