const fs = require('fs');
const path = require('path');
const bunzip = require('seek-bzip');
const MpqArchive = require('mdx-m3-viewer/dist/cjs/parsers/mpq/archive.js').default;
const explode = require('mdx-m3-viewer/dist/cjs/parsers/mpq/explode.js').default;
const { inflate } = require('pako');
const constants = require('mdx-m3-viewer/dist/cjs/parsers/mpq/constants.js');

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
  } else bytes = payload;
  if (compressionMask & constants.COMPRESSION_IMPLODE) bytes = explode(bytes);
  if (compressionMask & constants.COMPRESSION_DEFLATE) bytes = inflate(bytes);
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
    if (flags & constants.FILE_COMPRESSED) sector = decompressSector(sector, block.normalSize, file.name);
    return sector;
  }
  const sectorCount = Math.ceil(block.normalSize / sectorSize);
  const out = new Uint8Array(block.normalSize);
  let offset = 0;
  for (let i = 0; i < sectorCount; i++) {
    const start = data[i * 4] | (data[i * 4 + 1] << 8) | (data[i * 4 + 2] << 16) | (data[i * 4 + 3] << 24);
    const end =
      data[(i + 1) * 4] | (data[(i + 1) * 4 + 1] << 8) | (data[(i + 1) * 4 + 2] << 16) | (data[(i + 1) * 4 + 3] << 24);
    let sector = data.subarray(start, end);
    const uncompressedSize = Math.min(sectorSize, block.normalSize - offset);
    if (flags & constants.FILE_COMPRESSED) sector = decompressSector(sector, uncompressedSize, `${file.name}#${i}`);
    out.set(sector.subarray(0, uncompressedSize), offset);
    offset += uncompressedSize;
  }
  return out;
}

const mapPath = 'D:\\Maps\\DotA v6.83d.w3x';
const a = new MpqArchive();
a.load(fs.readFileSync(mapPath), true);
const names = [];
for (const f of a.files || []) {
  const n = String(f?.name || '');
  if (/icy|ghost|imported/i.test(n)) names.push(n);
}
// hash listfile
const lf = a.get('(listfile)');
if (lf?.rawBuffer) {
  try {
    const bytes = decodeFile(a, lf);
    const text = Buffer.from(bytes).toString('utf8');
    for (const line of text.split(/\r?\n/)) {
      if (/icy|ghost/i.test(line)) names.push(line.trim());
    }
  } catch (e) {
    console.warn('listfile', e.message);
  }
}
console.log('candidates', [...new Set(names)]);

const tries = [
  'war3mapImported\\IcyGhost.mdx',
  'war3mapImported\\IcyGhost.mdl',
  'War3mapImported\\IcyGhost.mdx',
  'war3mapimported\\icyghost.mdx',
];
for (const t of tries) {
  const f = a.get(t) || a.get(t.toLowerCase());
  if (!f?.rawBuffer) {
    console.log('no', t);
    continue;
  }
  try {
    const bytes = decodeFile(a, f);
    console.log('ok', t, bytes.byteLength, Buffer.from(bytes.slice(0, 8)).toString('ascii'), [...bytes.slice(0, 4)]);
    const out = path.join(__dirname, '../public/assets/wc3/war3mapImported/IcyGhost.mdxbin');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(bytes));
  } catch (e) {
    console.log('fail', t, e.message);
  }
}
