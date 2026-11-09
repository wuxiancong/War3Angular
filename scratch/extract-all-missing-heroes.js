/**
 * Bulk-extract missing DotA hero MDX (+textures) from local MPQs / DotA map.
 * No X: drive. Uses scratch/mpq + War3Launcher/versions + DotA w3x.
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
const WC3 = path.join(ROOT, 'public/assets/wc3');
const MPQ_DIR = path.join(ROOT, 'scratch/mpq');
const VERS = 'D:\\Qt\\workspace\\War3Launcher\\versions';
const DOTA_MAPS = [
  'D:\\Maps\\DotA v6.83d.w3x',
  path.join(ROOT, '../War3Bot/war3files/maps/DotA v6.83d.w3x'),
];

function listMpqs() {
  const out = [];
  for (const p of [
    ...DOTA_MAPS,
    path.join(MPQ_DIR, 'War3x.mpq'),
    path.join(MPQ_DIR, 'war3.mpq'),
  ]) {
    if (fs.existsSync(p)) out.push(p);
  }
  if (fs.existsSync(VERS)) {
    for (const ver of fs.readdirSync(VERS)) {
      const dir = path.join(VERS, ver);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const name of ['War3Patch.mpq', 'war3patch.mpq', 'War3x.mpq', 'war3.mpq']) {
        const p = path.join(dir, name);
        if (fs.existsSync(p)) out.push(p);
      }
    }
  }
  return [...new Set(out)];
}

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
  if (fs.existsSync(outPath) && fs.statSync(outPath).size === bytes.byteLength) return false;
  fs.writeFileSync(outPath, Buffer.from(bytes));
  return true;
}

function normalizeModelRel(modelFile) {
  let rel = String(modelFile || '')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+/, '');
  if (!rel) return [];
  if (!rel.toLowerCase().includes('/')) {
    // bare name like VoidWalker
    rel = `Units/Creeps/${rel}/${rel}`;
  }
  const variants = new Set();
  const push = (r) => {
    const n = r.replace(/\/+/g, '/');
    variants.add(n);
    variants.add(n.replace(/^units\//i, 'Units/'));
    variants.add(n.replace(/^Units\//, 'units/'));
    // strip _V1
    variants.add(n.replace(/_V1$/i, ''));
    variants.add(n.replace(/_V1$/i, '').replace(/^units\//i, 'Units/'));
  };
  push(rel);
  return [...variants];
}

function mdxCandidates(relNoExt) {
  const out = [];
  for (const r of normalizeModelRel(relNoExt)) {
    out.push(r.replace(/\//g, '\\') + '.mdx');
    out.push(r.replace(/\//g, '\\') + '.MDX');
    out.push(r.toLowerCase().replace(/\//g, '\\') + '.mdx');
  }
  return [...new Set(out)];
}

function outPathFor(relNoExt) {
  // Prefer Units\... casing under public/assets/wc3
  let rel = normalizeModelRel(relNoExt)[0];
  rel = rel.replace(/^units\//i, 'Units/');
  // keep original leaf including _V1 if requested
  const requested = String(relNoExt)
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/');
  if (requested && requested.includes('/')) {
    rel = requested.replace(/^units\//i, 'Units/');
  } else if (requested && !requested.includes('/')) {
    rel = `Units/Creeps/${requested}/${requested}`;
  }
  return path.join(WC3, rel + '.mdxbin');
}

const missing = JSON.parse(fs.readFileSync(path.join(__dirname, 'missing-models.json'), 'utf8'));

console.log('loading MPQs...');
const archives = [];
for (const p of listMpqs()) {
  try {
    const a = new MpqArchive();
    a.load(fs.readFileSync(p), true);
    archives.push({ p, a });
    console.log('  loaded', p);
  } catch (e) {
    console.warn('  fail', p, e.message);
  }
}

function findFile(name) {
  for (const { a, p } of archives) {
    const f = a.get(name) || a.get(name.toLowerCase());
    if (f?.rawBuffer) return { a, f, p, name };
  }
  return null;
}

const texCache = new Set();
let ok = 0;
let fail = 0;
const failed = [];

for (const e of missing) {
  const cands = mdxCandidates(e.modelFile);
  let hit = null;
  for (const c of cands) {
    hit = findFile(c);
    if (hit) break;
    // portrait sibling not needed for primary
  }
  if (!hit) {
    fail++;
    failed.push({ code: e.code, name: e.name, modelFile: e.modelFile, tried: cands.slice(0, 6) });
    console.warn('MISS', e.code, e.name, e.modelFile);
    continue;
  }
  let bytes;
  try {
    bytes = decodeFile(hit.a, hit.f);
  } catch (err) {
    // 同一路径在多个 MPQ 中可能损坏，继续试其余候选
    let recovered = null;
    for (const c of cands) {
      for (const { a, p } of archives) {
        if (p === hit.p && c === hit.name) continue;
        const f = a.get(c) || a.get(c.toLowerCase());
        if (!f?.rawBuffer) continue;
        try {
          recovered = { bytes: decodeFile(a, f), name: c, p };
          break;
        } catch {
          /* try next */
        }
      }
      if (recovered) break;
    }
    if (!recovered) {
      fail++;
      failed.push({ code: e.code, name: e.name, modelFile: e.modelFile, error: String(err?.message || err) });
      console.warn('DECODE_FAIL', e.code, e.name, err.message);
      continue;
    }
    bytes = recovered.bytes;
    hit = { a: null, f: null, p: recovered.p, name: recovered.name };
  }
  const out = outPathFor(e.modelFile);
  const wrote = save(bytes, out);
  console.log(wrote ? 'WROTE' : 'KEEP', e.code, e.name, '<-', hit.name, 'from', path.basename(hit.p));
  ok++;

  // textures
  try {
    const model = new MdxModel();
    model.load(bytes);
    for (const t of model.textures || []) {
      const tex = String(t?.path || '')
        .replace(/\0/g, '')
        .trim();
      if (!tex || texCache.has(tex.toLowerCase())) continue;
      texCache.add(tex.toLowerCase());
      const leaf = path.basename(tex.replace(/\//g, '\\'));
      const texCands = [tex, tex.replace(/\//g, '\\'), `Textures\\${leaf}`, `textures\\${leaf}`, `war3mapImported\\${leaf}`];
      let th = null;
      for (const c of texCands) {
        th = findFile(c);
        if (th) break;
      }
      if (!th) {
        console.warn('  tex miss', tex);
        continue;
      }
      const tb = decodeFile(th.a, th.f);
      const rel = tex.replace(/\//g, '\\');
      let dest;
      if (/^Textures\\/i.test(rel) || !rel.includes('\\')) {
        dest = path.join(WC3, 'Textures', leaf);
      } else if (/^war3mapImported\\/i.test(rel)) {
        dest = path.join(WC3, 'war3mapImported', leaf);
      } else {
        dest = path.join(WC3, rel);
      }
      if (save(tb, dest)) console.log('  tex', dest);
    }
  } catch (err) {
    console.warn('  tex parse fail', e.code, err.message);
  }

  // optional portrait
  const portraitName = hit.name.replace(/\.mdx$/i, '_Portrait.mdx');
  const ph = findFile(portraitName);
  if (ph) {
    const pb = decodeFile(ph.a, ph.f);
    const pout = out.replace(/\.mdxbin$/i, '_Portrait.mdxbin');
    if (save(pb, pout)) console.log('  portrait', pout);
  }
}

console.log(JSON.stringify({ ok, fail, failed: failed.map((f) => `${f.code}:${f.name}`) }, null, 2));
fs.writeFileSync(path.join(__dirname, 'extract-missing-report.json'), JSON.stringify({ ok, fail, failed }, null, 2));
