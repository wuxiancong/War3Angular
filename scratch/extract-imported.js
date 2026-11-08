const fs = require('fs');
const path = require('path');
const MpqArchive = require('../node_modules/mdx-m3-viewer/dist/cjs/parsers/mpq/archive.js').default;

const buf = fs.readFileSync(path.join(__dirname, 'dota683d.w3x'));
const archive = new MpqArchive();
archive.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), true);

const ui = fs.readFileSync(path.join(__dirname, 'dota683_extract/units_unitui.slk'), 'utf8');
const imports = [...ui.matchAll(/war3mapImported\\[^"\r\n]+/gi)].map((m) => m[0]);
const uniq = [...new Set(imports)];
console.log('imported refs', uniq.length);
for (const p of uniq) console.log(' ', p);

const outDir = path.join(__dirname, 'dota683_extract/imported');
fs.mkdirSync(outDir, { recursive: true });

let ok = 0;
for (const p of uniq) {
  const candidates = [
    p,
    p + '.mdx',
    p + '.MDX',
    p + '.mdl',
    p.replace(/\\/g, '/'),
    p.replace(/\\/g, '/') + '.mdx',
  ];
  let found = false;
  for (const n of candidates) {
    const f = archive.get(n);
    if (!f) continue;
    const b = Buffer.from(f.bytes());
    const safe = n.replace(/[\\/]/g, '_');
    fs.writeFileSync(path.join(outDir, safe), b);
    console.log('OK', n, b.length);
    ok++;
    found = true;
    break;
  }
  if (!found) console.log('MISS', p);
}
console.log({ ok, total: uniq.length });

function peekId(id) {
  const needle = `;K"${id}"`;
  const idx = ui.indexOf(needle);
  if (idx < 0) {
    console.log(id, 'NOT FOUND');
    return;
  }
  console.log(id, ui.slice(idx, idx + 280).replace(/\r?\n/g, ' | '));
}
peekId('n01F');
peekId('etol');
peekId('e008');
peekId('ncp2');
peekId('ncp3');
