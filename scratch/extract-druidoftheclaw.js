/**
 * Extract DotA ??? (N01O) + ?? (n004):
 *   units\nightelf\DruidoftheClaw\DruidoftheClaw
 *   units\creeps\GrizzlyBear\GrizzlyBear
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
const MPQS = [
  'X:\\单机游戏\\魔兽3-冰封王座\\War3x.mpq',
  'X:\\单机游戏\\魔兽3-冰封王座\\war3.mpq',
].filter((p) => fs.existsSync(p));
const OUT_TEX = path.join(ROOT, 'public/assets/wc3/Textures');
const OUT_ICON = path.join(ROOT, 'public/assets/wc3/ui/icons');

const UNITS = [
  {
    outDir: path.join(ROOT, 'public/assets/wc3/Units/NightElf/DruidoftheClaw'),
    models: [
      'Units\\NightElf\\DruidoftheClaw\\DruidoftheClaw.mdx',
      'Units\\NightElf\\DruidoftheClaw\\DruidoftheClaw_Portrait.mdx',
    ],
  },
  {
    outDir: path.join(ROOT, 'public/assets/wc3/Units/Creeps/GrizzlyBear'),
    models: [
      'Units\\Creeps\\GrizzlyBear\\GrizzlyBear.mdx',
      'Units\\Creeps\\GrizzlyBear\\GrizzlyBear_Portrait.mdx',
    ],
  },
];

const ICONS = [
  'ReplaceableTextures\\CommandButtons\\BTNDruidOfTheClaw.blp',
  'ReplaceableTextures\\CommandButtons\\BTNGrizzlyBear.blp',
];

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

function save(bytes, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(bytes));
  console.log('wrote', outPath, bytes.byteLength);
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
  for (const { a } of archives) {
    const f = a.get(name) || a.get(name.toLowerCase());
    if (f?.rawBuffer) return { a, f };
  }
  return null;
}

const texSet = new Set();
for (const unit of UNITS) {
  const extracted = [];
  for (const name of unit.models) {
    const hit = findFile(name);
    if (!hit) {
      console.warn('missing', name);
      continue;
    }
    const bytes = decodeFile(hit.a, hit.f);
    const out = path.join(unit.outDir, path.basename(name).replace(/\.mdx$/i, '.mdxbin'));
    save(bytes, out);
    extracted.push({ name, bytes });
  }
  for (const e of extracted) {
    try {
      const model = new MdxModel();
      model.load(e.bytes);
      for (const t of model.textures || []) {
        const p = String(t?.path || '')
          .replace(/\0/g, '')
          .trim();
        if (p) texSet.add(p);
      }
    } catch (err) {
      console.warn('tex parse', e.name, err.message);
    }
  }
  console.log(
    'done unit',
    unit.outDir,
    fs.existsSync(unit.outDir) ? fs.readdirSync(unit.outDir) : []
  );
}

console.log('textures', [...texSet]);
for (const tex of texSet) {
  const leaf = path.basename(tex.replace(/\//g, '\\'));
  const candidates = [tex, tex.replace(/\//g, '\\'), `Textures\\${leaf}`, `textures\\${leaf}`];
  let hit = null;
  for (const c of candidates) {
    hit = findFile(c);
    if (hit) break;
  }
  if (!hit) {
    console.warn('texture missing', tex);
    continue;
  }
  const bytes = decodeFile(hit.a, hit.f);
  const rel = tex.replace(/\//g, '\\');
  if (/^Textures\\/i.test(rel) || !rel.includes('\\')) {
    save(bytes, path.join(OUT_TEX, leaf));
  } else {
    save(bytes, path.join(ROOT, 'public/assets/wc3', rel));
  }
}

for (const name of ICONS) {
  const hit = findFile(name);
  if (!hit) {
    console.warn('icon missing', name);
    continue;
  }
  const bytes = decodeFile(hit.a, hit.f);
  save(bytes, path.join(OUT_ICON, path.basename(name)));
}

console.log('all done');
