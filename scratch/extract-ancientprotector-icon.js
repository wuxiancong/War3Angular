/**
 * Extract icons for DotA 树精卫士 (Hamg / AncientProtector)
 */
const fs = require('fs');
const path = require('path');
const bunzip = require('seek-bzip');
const MpqArchive = require('mdx-m3-viewer/dist/cjs/parsers/mpq/archive.js').default;
const explode = require('mdx-m3-viewer/dist/cjs/parsers/mpq/explode.js').default;
const { inflate } = require('pako');
const constants = require('mdx-m3-viewer/dist/cjs/parsers/mpq/constants.js');

const ROOT = path.resolve(__dirname, '..');
const MPQS = [
  'X:\\单机游戏\\魔兽3-冰封王座\\War3x.mpq',
  'X:\\单机游戏\\魔兽3-冰封王座\\war3.mpq',
  'X:\\单机游戏\\魔兽3-冰封王座\\War3xLocal.mpq',
].filter((p) => fs.existsSync(p));
const OUT_ICON = path.join(ROOT, 'public/assets/wc3/ui/icons');

function decompressSector(bytes, decompressedSize, name) {
  if (!bytes?.byteLength || bytes.byteLength === decompressedSize) return bytes;
  let compressionMask = bytes[0];
  let payload = bytes.subarray(1);
  if (compressionMask & constants.COMPRESSION_BZIP2) {
    payload = bunzip.decode(Buffer.from(payload));
    payload = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
    compressionMask &= ~constants.COMPRESSION_BZIP2;
    if (!compressionMask) return payload;
    bytes = payload;
  } else {
    bytes = payload;
  }
  if (compressionMask & constants.COMPRESSION_IMPLODE) bytes = explode(bytes);
  if (compressionMask & constants.COMPRESSION_DEFLATE) bytes = inflate(bytes);
  if (compressionMask & constants.COMPRESSION_HUFFMAN) {
    throw new Error(`${name}: huffman not supported`);
  }
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

function decodeFile(archive, file) {
  const data = Uint8Array.from(file.rawBuffer);
  const block = file.block;
  const flags = block.flags;
  const sectorSize = archive.sectorSize;
  if (flags === constants.FILE_EXISTS) return data.slice(0, block.normalSize);
  if (flags & constants.FILE_SINGLE_UNIT) {
    let sector = data.subarray(0, block.compressedSize);
    if (flags & constants.FILE_COMPRESSED) {
      sector = decompressSector(sector, block.normalSize, file.name);
    }
    return sector;
  }
  const sectorCount = Math.ceil(block.normalSize / sectorSize);
  const out = new Uint8Array(block.normalSize);
  let offset = 0;
  for (let i = 0; i < sectorCount; i++) {
    const start =
      data[i * 4] | (data[i * 4 + 1] << 8) | (data[i * 4 + 2] << 16) | (data[i * 4 + 3] << 24);
    const end =
      data[(i + 1) * 4] |
      (data[(i + 1) * 4 + 1] << 8) |
      (data[(i + 1) * 4 + 2] << 16) |
      (data[(i + 1) * 4 + 3] << 24);
    let sector = data.subarray(start, end);
    let uncompressedSize = Math.min(sectorSize, block.normalSize - offset);
    if (flags & constants.FILE_COMPRESSED) {
      sector = decompressSector(sector, uncompressedSize, `${file.name}#${i}`);
    }
    out.set(sector.subarray(0, uncompressedSize), offset);
    offset += uncompressedSize;
  }
  return out;
}

const archives = [];
for (const p of MPQS) {
  try {
    console.log('load', p);
    const a = new MpqArchive();
    a.load(fs.readFileSync(p), true);
    archives.push({ p, a });
  } catch (e) {
    console.warn('fail', p, e.message);
  }
}

function findFile(name) {
  for (const { p, a } of archives) {
    const f = a.get(name) || a.get(name.toLowerCase());
    if (f?.rawBuffer) return { a, f, p };
  }
  return null;
}

const iconNames = [
  'ReplaceableTextures\\CommandButtons\\BTNAncientProtector.blp',
  'ReplaceableTextures\\CommandButtons\\BTNTreant.blp',
  'ReplaceableTextures\\CommandButtons\\BTNEnt.blp',
  'ReplaceableTextures\\CommandButtons\\BTNTreeOfLife.blp',
  'ReplaceableTextures\\CommandButtons\\BTNAncientOfWar.blp',
  'ReplaceableTextures\\CommandButtons\\BTNForceOfNature.blp',
  'ReplaceableTextures\\CommandButtons\\BTNSpellBreaker.blp',
];
for (const name of iconNames) {
  const hit = findFile(name);
  if (!hit) {
    console.warn('icon missing', name);
    continue;
  }
  const bytes = decodeFile(hit.a, hit.f);
  const dest = path.join(OUT_ICON, path.basename(name));
  fs.mkdirSync(OUT_ICON, { recursive: true });
  fs.writeFileSync(dest, Buffer.from(bytes));
  console.log('wrote', dest, bytes.byteLength, 'from', hit.p);
}
