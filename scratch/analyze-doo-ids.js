const fs = require('fs');
const path = require('path');
const Doo = require('../node_modules/mdx-m3-viewer/dist/cjs/parsers/w3x/doo/file.js').default;

function parseSlk(text) {
  let x = 1;
  let y = 1;
  const rows = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('C;')) continue;
    let k = null;
    for (const part of line.split(';')) {
      if (part.startsWith('X')) x = +part.slice(1);
      else if (part.startsWith('Y')) y = +part.slice(1);
      else if (part.startsWith('K')) k = part.slice(1);
    }
    if (k == null) continue;
    if (k.startsWith('"') && k.endsWith('"')) k = k.slice(1, -1);
    if (!rows.has(y)) rows.set(y, {});
    rows.get(y)[x] = k;
  }
  const header = rows.get(1) || {};
  const col = {};
  for (const [xi, n] of Object.entries(header)) col[n] = +xi;
  const byId = new Map();
  const idCol = col.DestructableID || col.doodID || col.unitID || 1;
  for (const [yy, r] of rows) {
    if (+yy === 1) continue;
    const id = r[idCol];
    if (!id || id.length !== 4) continue;
    byId.set(id, {
      id,
      file: r[col.file],
      dir: r[col.dir],
      name: r[col.Name] || r[col.name] || r[col.comment] || '',
      category: r[col.category] || '',
      selectable: r[col.selectable],
      walkable: r[col.walkable],
      climber: r[col.climber],
      texFile: r[col.texFile] || r[col.texID] || '',
    });
  }
  return { col, byId };
}

const dest = parseSlk(
  fs.readFileSync('D:/Qt/workspace/War3Angular/public/assets/wc3/Units/DestructableData.slk', 'utf8')
);
console.log('dest cols', Object.keys(dest.col).slice(0, 30));

const doodPathCandidates = [
  'D:/Qt/workspace/War3Angular/public/assets/wc3/Doodads/DoodadData.slk',
  'D:/Qt/workspace/War3Angular/node_modules/mdx-m3-viewer/resources/doodads/DoodadData.slk',
];
let dood = null;
for (const p of doodPathCandidates) {
  if (fs.existsSync(p)) {
    dood = parseSlk(fs.readFileSync(p, 'utf8'));
    console.log('dood from', p);
    break;
  }
}

// Also parse map w3b/w3d mods for custom D00*
const buf = fs.readFileSync('D:/Qt/workspace/War3Angular/scratch/dota683d_official/war3map.doo');
const d = new Doo();
d.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 26);
const byId = new Map();
for (const x of d.doodads) {
  byId.set(x.id, (byId.get(x.id) || 0) + 1);
}
const sorted = [...byId.entries()].sort((a, b) => b[1] - a[1]);

function lookup(id) {
  return dest.byId.get(id) || dood?.byId.get(id) || null;
}

console.log('\n=== Top doodad IDs ===');
for (const [id, n] of sorted) {
  const r = lookup(id);
  console.log(
    `${id} x${n} | ${r ? `${r.name} | ${r.dir}\\${r.file}` : 'UNKNOWN (custom/mod)'}`
  );
}

// Radiant fountain-ish green square suspects: shrubs, plants, pathing tiles
const suspects = sorted.filter(([id]) => {
  const r = lookup(id);
  if (!r) return true;
  const blob = `${r.name} ${r.file} ${r.dir}`.toLowerCase();
  return /shrub|bush|plant|flower|grass|wheat|corn|lilypad|cattail|pathing|blight|rubble|barrel|crate|skull|bones|fire|torch|lantern|obelisk|totem|bird|fish|glow|rune|effects?/i.test(
    blob
  );
});
console.log('\n=== Suspect decorative/small ===');
for (const [id, n] of suspects) {
  const r = lookup(id);
  console.log(id, n, r?.name, r?.file);
}
