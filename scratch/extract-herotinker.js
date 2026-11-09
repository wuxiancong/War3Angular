/**
 * Extract DotA 地精修补匠 (Ntin) model: Units\Creeps\HeroTinker\HeroTinker
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
const MPQ_DIR = path.join(ROOT, 'scratch/mpq');
const VERS = 'D:\\Qt\\workspace\\War3Launcher\\versions';
const MPQS = [
  // 禁止使用 X: 盘 MPQ（其它程序占用）；优先项目内拷贝与 War3Launcher/versions
  path.join(VERS, '1.24.1.6374', 'War3Patch.mpq'),
  path.join(VERS, '1.23.0.6352', 'War3Patch.mpq'),
  path.join(VERS, '1.22.0.6328', 'war3patch.mpq'),
  path.join(MPQ_DIR, 'War3x.mpq'),
  path.join(MPQ_DIR, 'war3.mpq'),
].filter((p) => fs.existsSync(p));
const OUT_UNIT = path.join(ROOT, 'public/assets/wc3/Units/Creeps/HeroTinker');
const OUT_TEX = path.join(ROOT, 'public/assets/wc3/Textures');
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

const modelPaths = [
  'Units\\Creeps\\HeroTinker\\HeroTinker.mdx',
  'Units\\Creeps\\HeroTinker\\HeroTinker_Portrait.mdx',
];
const extracted = [];
for (const name of modelPaths) {
  const hit = findFile(name);
  if (!hit) {
    console.warn('missing', name);
    continue;
  }
  const bytes = decodeFile(hit.a, hit.f);
  const out = path.join(OUT_UNIT, path.basename(name).replace(/\.mdx$/i, '.mdxbin'));
  save(bytes, out);
  extracted.push({ name, bytes });
}

const texSet = new Set();
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

const iconNames = ['ReplaceableTextures\\CommandButtons\\BTNHeroTinker.blp'];
for (const name of iconNames) {
  const hit = findFile(name);
  if (!hit) {
    console.warn('icon missing', name);
    continue;
  }
  const bytes = decodeFile(hit.a, hit.f);
  save(bytes, path.join(OUT_ICON, path.basename(name)));
}

console.log('done', fs.existsSync(OUT_UNIT) ? fs.readdirSync(OUT_UNIT) : []);
