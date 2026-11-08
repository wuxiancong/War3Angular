const fs = require('fs');
const path = require('path');
const MpqArchive = require('../node_modules/mdx-m3-viewer/dist/cjs/parsers/mpq/archive.js').default;

const out = path.join(__dirname, 'dota683d_heroes');
fs.mkdirSync(out, { recursive: true });
const buf = fs.readFileSync('D:/Maps/DotA v6.83d.w3x');
const archive = new MpqArchive();
archive.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), true);

const files = [
  'Units\\UnitBalance.slk',
  'Units\\UnitData.slk',
  'Units\\UnitUI.slk',
  'Units\\UnitWeapons.slk',
  'Units\\UnitAbilities.slk',
  'Scripts\\war3map.j',
];
for (const n of files) {
  const f = archive.get(n);
  if (!f) {
    console.log('MISS', n);
    continue;
  }
  const b = Buffer.from(f.bytes());
  fs.writeFileSync(path.join(out, n.replace(/\\/g, '_')), b);
  console.log('OK', n, b.length);
}
