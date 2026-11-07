/**
 * Extract authentic WC3 CommandButton / UI icons from WAR3.MPQ → PNG.
 * Uses mdx-m3-viewer MPQ + BLP parsers.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const MpqArchive = require(path.join(root, 'node_modules/mdx-m3-viewer/dist/cjs/parsers/mpq/archive.js')).default;
const { BlpImage } = require(path.join(root, 'node_modules/mdx-m3-viewer/dist/cjs/parsers/blp/image.js'));

const MPQ_CANDIDATES = [
  'X:\\单机游戏\\魔兽3-冰封王座\\WAR3.MPQ',
  'X:\\单机游戏\\魔兽3-冰封王座\\War3x.mpq',
  'D:\\Qt\\workspace\\War3Bot\\updates\\versions\\1.27.0.52240\\war3.mpq',
];

const FILES = [
  // Command card
  'ReplaceableTextures\\CommandButtons\\BTNMove.blp',
  'ReplaceableTextures\\CommandButtons\\BTNStop.blp',
  'ReplaceableTextures\\CommandButtons\\BTNHoldPosition.blp',
  'ReplaceableTextures\\CommandButtons\\BTNAttack.blp',
  'ReplaceableTextures\\CommandButtons\\BTNPatrol.blp',
  'ReplaceableTextures\\CommandButtons\\BTNSkillz.blp',
  'ReplaceableTextures\\CommandButtons\\BTNStatUp.blp',
  // Blademaster
  'ReplaceableTextures\\CommandButtons\\BTNCriticalStrike.blp',
  'ReplaceableTextures\\CommandButtons\\BTNMirrorImage.blp',
  'ReplaceableTextures\\CommandButtons\\BTNWindWalk.blp',
  'ReplaceableTextures\\CommandButtons\\BTNWhirlwind.blp',
  'ReplaceableTextures\\CommandButtons\\BTNHeroBlademaster.blp',
  'ReplaceableTextures\\CommandButtons\\BTNChaosBlademaster.blp',
  // Items
  'ReplaceableTextures\\CommandButtons\\BTNBootsOfSpeed.blp',
  // Night Elf console tiles (if present)
  'UI\\Console\\NightElf\\NightElfUITile01.blp',
  'UI\\Console\\NightElf\\NightElfUITile02.blp',
  'UI\\Console\\NightElf\\NightElfUITile03.blp',
  'UI\\Console\\NightElf\\NightElfUITile04.blp',
  'UI\\Console\\NightElf\\NightElfUITile-InventoryCover.blp',
  'UI\\Console\\NightElf\\NightElfUITile-TimeIndicator.blp',
  'UI\\Console\\NightElf\\NightElfUI-ReplayCover.blp',
  'UI\\Console\\Human\\HumanUITile01.blp',
  'UI\\Console\\Human\\HumanUITile02.blp',
  'UI\\Console\\Human\\HumanUITile03.blp',
  'UI\\Console\\Human\\HumanUITile04.blp',
];

const outBlp = path.join(root, 'public/assets/wc3/ui/extracted/blp');
const outPng = path.join(root, 'public/assets/wc3/ui/extracted/png');
fs.mkdirSync(outBlp, { recursive: true });
fs.mkdirSync(outPng, { recursive: true });

function loadArchive(filePath) {
  const buf = fs.readFileSync(filePath);
  const archive = new MpqArchive();
  archive.load(buf, true);
  return archive;
}

function blpToPngBuffer(blpBytes) {
  const img = new BlpImage();
  img.load(blpBytes);
  const mip = img.getMipmap(0);
  // mip is ImageData-like { data, width, height }
  const { data, width, height } = mip;
  // Minimal PNG encoder (RGBA) via zlib
  return encodePng(width, height, data);
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcBuf), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const { deflateSync } = require('zlib');
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1
    );
  }
  const idat = deflateSync(raw);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const archives = [];
for (const p of MPQ_CANDIDATES) {
  if (!fs.existsSync(p)) {
    console.warn('skip missing', p);
    continue;
  }
  try {
    console.log('loading', p);
    archives.push({ path: p, archive: loadArchive(p) });
  } catch (e) {
    console.warn('fail load', p, e.message);
  }
}

if (!archives.length) {
  console.error('No MPQ loaded');
  process.exit(1);
}

let ok = 0;
let miss = 0;
for (const rel of FILES) {
  const base = path.basename(rel).replace(/\.blp$/i, '');
  let found = null;
  let from = '';
  for (const { path: mpqPath, archive } of archives) {
    try {
      const f = archive.get(rel);
      if (f) {
        found = f.bytes();
        from = mpqPath;
        break;
      }
    } catch {
      /* try next */
    }
  }
  if (!found) {
    console.warn('MISS', rel);
    miss++;
    continue;
  }
  const blpPath = path.join(outBlp, `${base}.blp`);
  const pngPath = path.join(outPng, `${base}.png`);
  fs.writeFileSync(blpPath, found);
  try {
    fs.writeFileSync(pngPath, blpToPngBuffer(found));
    console.log('OK', base, 'from', path.basename(from));
    ok++;
  } catch (e) {
    console.warn('BLP convert fail', base, e.message);
    miss++;
  }
}

console.log(`done ok=${ok} miss=${miss}`);
console.log('png →', outPng);
