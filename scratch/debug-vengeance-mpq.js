const fs = require('fs');
const bunzip = require('seek-bzip');
const MpqArchive = require('mdx-m3-viewer/dist/cjs/parsers/mpq/archive.js').default;
const MpqFile = require('mdx-m3-viewer/dist/cjs/parsers/mpq/file.js').default;
const constants = require('mdx-m3-viewer/dist/cjs/parsers/mpq/constants.js');
const orig = MpqFile.prototype.decompressSector;

MpqFile.prototype.decompressSector = function (bytes, sz) {
  if (!bytes || !bytes.byteLength || bytes.byteLength === sz) return bytes || new Uint8Array(0);
  const mask = bytes[0];
  if (mask & constants.COMPRESSION_BZIP2) {
    const payload = Buffer.from(bytes.subarray(1));
    console.log(
      'SEC',
      this.name,
      'mask',
      '0x' + mask.toString(16),
      'paylen',
      payload.length,
      'hex',
      payload.slice(0, 8).toString('hex'),
      'ascii',
      JSON.stringify(payload.slice(0, 3).toString('ascii'))
    );
    try {
      const d = bunzip.decode(payload);
      console.log('bzip ok', d.length);
      return d instanceof Uint8Array ? d : new Uint8Array(d);
    } catch (e) {
      console.log('bzip err', e.message);
      throw e;
    }
  }
  return orig.call(this, bytes, sz);
};

const a = new MpqArchive();
a.load(fs.readFileSync('X:/单机游戏/魔兽3-冰封王座/War3x.mpq'), true);
const name = 'Units\\NightElf\\Vengeance\\Vengeance.mdx';
const f = a.get(name);
console.log('file', !!f, f && f.name, f && f.block && {
  flags: '0x' + f.block.flags.toString(16),
  csize: f.block.compressedSize,
  nsize: f.block.normalSize,
});
if (f) {
  console.log('raw head', Buffer.from(f.rawBuffer.subarray(0, 48)).toString('hex'));
  try {
    console.log('decoded', f.bytes().byteLength);
  } catch (e) {
    console.log('decode', e.message);
  }
}
