const fs = require('fs');
const path = require('path');
const bunzip = require('seek-bzip');
const MpqArchive = require('mdx-m3-viewer/dist/cjs/parsers/mpq/archive.js').default;
const explode = require('mdx-m3-viewer/dist/cjs/parsers/mpq/explode.js').default;
const { inflate } = require('pako');
const constants = require('mdx-m3-viewer/dist/cjs/parsers/mpq/constants.js');

const ROOT = 'X:\\单机游戏\\魔兽3-冰封王座';
const MPQS = [
  'War3x.mpq','war3.mpq','WAR3.MPQ','War3xlocal.mpq','war3patch.mpq','patch.mpq','Patch127.mpq','zhCN.mpq',
].map(n => path.join(ROOT, n)).filter(p => fs.existsSync(p));

function decompressSector(bytes, decompressedSize) {
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
  if (typeof file.bytes === 'function') {
    try { return new Uint8Array(file.bytes()); } catch {}
  }
  const data = Uint8Array.from(file.rawBuffer);
  const block = file.block;
  const flags = block.flags;
  const sectorSize = archive.sectorSize;
  if (flags === constants.FILE_EXISTS) return data.slice(0, block.normalSize);
  if (flags & constants.FILE_SINGLE_UNIT) {
    let sector = data.subarray(0, block.compressedSize);
    if (flags & constants.FILE_COMPRESSED) sector = decompressSector(sector, block.normalSize);
    return sector;
  }
  const sectorCount = Math.ceil(block.normalSize / sectorSize);
  const out = new Uint8Array(block.normalSize);
  let offset = 0;
  for (let i = 0; i < sectorCount; i++) {
    const start = data[i*4]|(data[i*4+1]<<8)|(data[i*4+2]<<16)|(data[i*4+3]<<24);
    const end = data[(i+1)*4]|(data[(i+1)*4+1]<<8)|(data[(i+1)*4+2]<<16)|(data[(i+1)*4+3]<<24);
    let sector = data.subarray(start, end);
    let uncompressedSize = Math.min(sectorSize, block.normalSize - offset);
    if (flags & constants.FILE_COMPRESSED) sector = decompressSector(sector, uncompressedSize);
    out.set(sector.subarray(0, uncompressedSize), offset);
    offset += uncompressedSize;
  }
  return out;
}

const probes = [
  'Units\\Creeps\\HeroTinker\\HeroTinker.mdx',
  'Units\\Creeps\\OgreMagi\\OgreMagi.mdx',
  'ReplaceableTextures\\CommandButtons\\BTNHeroTinker.blp',
  'ReplaceableTextures\\CommandButtons\\BTNOgreMagi.blp',
];

for (const p of MPQS) {
  console.log('===', path.basename(p));
  let a;
  try {
    a = new MpqArchive();
    a.load(fs.readFileSync(p), true);
  } catch (e) {
    console.log('  load fail', e.message);
    continue;
  }
  for (const name of probes) {
    const f = a.get(name) || a.get(name.toLowerCase());
    console.log(' ', name, !!f?.rawBuffer, f && typeof f.bytes);
  }
  // listfile search
  const lf = a.get('(listfile)');
  if (lf?.rawBuffer || typeof lf?.bytes === 'function') {
    try {
      const bytes = decodeFile(a, lf);
      const text = Buffer.from(bytes).toString('utf8');
      const hits = text.split(/\r?\n/).filter(l => /tinker/i.test(l));
      console.log('  listfile tinker hits', hits.length);
      hits.slice(0, 40).forEach(h => console.log('   ', h));
    } catch (e) {
      console.log('  listfile decode fail', e.message);
    }
  } else {
    console.log('  no listfile');
  }
}
