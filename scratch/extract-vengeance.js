/**
 * Extract DotA 复仇之魂 (Hvwd) from War3x.mpq.
 * Works around mdx-m3-viewer MPQ decoder bug: Uint32Array(data.buffer, 0, …)
 * ignores Buffer.byteOffset, so sector offsets are read from the wrong place.
 */
const fs = require('fs');
const path = require('path');
const bunzip = require('seek-bzip');
const MpqArchive = require('mdx-m3-viewer/dist/cjs/parsers/mpq/archive.js').default;
const explode = require('mdx-m3-viewer/dist/cjs/parsers/mpq/explode.js').default;
const { inflate } = require('pako');
const MdxModel = require('mdx-m3-viewer/dist/cjs/parsers/mdlx/model.js').default;
const constants = require('mdx-m3-viewer/dist/cjs/parsers/mpq/constants.js');

const ROOT = path.resolve(__dirname, '..');
const MPQ = 'X:\\单机游戏\\魔兽3-冰封王座\\War3x.mpq';
const OUT_UNIT = path.join(ROOT, 'public/assets/wc3/Units/NightElf/Vengeance');
const OUT_TEX = path.join(ROOT, 'public/assets/wc3/Textures');

function decompressSector(bytes, decompressedSize, name) {
  if (!bytes?.byteLength || bytes.byteLength === decompressedSize) return bytes;
  let compressionMask = bytes[0];
  let payload = bytes.subarray(1);
  // Algorithms applied in this order (Storm): Huffman → zlib → implode → bzip2 → adpcm…
  // For models we typically see single-flag bzip2/zlib/implode.
  if (compressionMask & constants.COMPRESSION_BZIP2) {
    payload = bunzip.decode(Buffer.from(payload));
    payload = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
    compressionMask &= ~constants.COMPRESSION_BZIP2;
    if (!compressionMask) return payload;
    // remaining flags on already-decoded buffer (rare)
    bytes = payload;
  } else {
    bytes = payload;
  }
  if (compressionMask & constants.COMPRESSION_IMPLODE) {
    bytes = explode(bytes);
    compressionMask &= ~constants.COMPRESSION_IMPLODE;
  }
  if (compressionMask & constants.COMPRESSION_DEFLATE) {
    bytes = inflate(bytes);
    compressionMask &= ~constants.COMPRESSION_DEFLATE;
  }
  if (compressionMask & constants.COMPRESSION_HUFFMAN) {
    throw new Error(`${name}: huffman not supported`);
  }
  if (compressionMask & (constants.COMPRESSION_ADPCM_MONO | constants.COMPRESSION_ADPCM_STEREO)) {
    throw new Error(`${name}: adpcm not supported (mask left 0x${compressionMask.toString(16)})`);
  }
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

function decodeFile(archive, file) {
  // IMPORTANT: copy out of Buffer pool so offsets are correct
  const data = Uint8Array.from(file.rawBuffer);
  const block = file.block;
  const flags = block.flags;
  const sectorSize = archive.sectorSize;

  if (flags === constants.FILE_EXISTS) {
    return data.slice(0, block.normalSize);
  }
  if (flags & constants.FILE_SINGLE_UNIT) {
    let sector = data.subarray(0, block.compressedSize);
    if (flags & constants.FILE_COMPRESSED) {
      sector = decompressSector(sector, block.normalSize, file.name);
    }
    return sector;
  }

  const sectorCount = Math.ceil(block.normalSize / sectorSize);
  const offsets = new Uint32Array(sectorCount + 1);
  for (let i = 0; i <= sectorCount; i++) {
    offsets[i] = data[i * 4] | (data[i * 4 + 1] << 8) | (data[i * 4 + 2] << 16) | (data[i * 4 + 3] << 24);
  }
  const out = new Uint8Array(block.normalSize);
  let offset = 0;
  for (let i = 0; i < sectorCount; i++) {
    const start = offsets[i];
    const end = offsets[i + 1];
    let sector = data.subarray(start, end);
    let uncompressedSize = sectorSize;
    if (block.normalSize - offset < uncompressedSize) uncompressedSize = block.normalSize - offset;
    if (flags & constants.FILE_COMPRESSED) {
      sector = decompressSector(sector, uncompressedSize, `${file.name}#${i}`);
    }
    out.set(sector.subarray(0, uncompressedSize), offset);
    offset += uncompressedSize;
  }
  return out;
}

function loadArchive(mpqPath) {
  console.log('load', mpqPath);
  const a = new MpqArchive();
  a.load(fs.readFileSync(mpqPath), true);
  return a;
}

function save(bytes, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(bytes));
  console.log('wrote', outPath, bytes.byteLength);
}

function texturesFromMdx(bytes) {
  const model = new MdxModel();
  model.load(bytes);
  return [
    ...new Set(
      (model.textures || [])
        .map((t) => String(t?.path || '').replace(/\0/g, '').trim())
        .filter(Boolean)
    ),
  ];
}

const archive = loadArchive(MPQ);
const modelPaths = [
  'Units\\NightElf\\Vengeance\\Vengeance.mdx',
  'Units\\NightElf\\Vengeance\\Vengeance_Portrait.mdx',
];

const extracted = [];
for (const name of modelPaths) {
  const file = archive.get(name);
  if (!file?.rawBuffer) {
    console.warn('missing', name);
    continue;
  }
  try {
    const bytes = decodeFile(archive, file);
    const out = path.join(OUT_UNIT, path.basename(name).replace(/\.mdx$/i, '.mdxbin'));
    save(bytes, out);
    extracted.push({ name, bytes });
  } catch (e) {
    console.error('decode failed', name, e.message);
  }
}

const texSet = new Set();
for (const e of extracted) {
  try {
    for (const t of texturesFromMdx(e.bytes)) texSet.add(t);
  } catch (err) {
    console.warn('tex parse', e.name, err.message);
  }
}
console.log('textures', [...texSet]);

for (const tex of texSet) {
  const leaf = path.basename(tex.replace(/\//g, '\\'));
  const candidates = [tex, tex.replace(/\//g, '\\'), `Textures\\${leaf}`, `textures\\${leaf}`];
  let file = null;
  for (const c of candidates) {
    file = archive.get(c);
    if (file?.rawBuffer) break;
  }
  if (!file?.rawBuffer) {
    console.warn('texture missing', tex);
    continue;
  }
  try {
    const bytes = decodeFile(archive, file);
    const rel = tex.replace(/\//g, '\\');
    if (/^Textures\\/i.test(rel) || !rel.includes('\\')) {
      save(bytes, path.join(OUT_TEX, leaf));
    } else {
      save(bytes, path.join(ROOT, 'public/assets/wc3', rel));
    }
  } catch (e) {
    console.error('tex decode failed', tex, e.message);
  }
}

console.log('done', fs.existsSync(OUT_UNIT) ? fs.readdirSync(OUT_UNIT) : []);
