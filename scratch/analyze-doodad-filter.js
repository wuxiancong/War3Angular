const fs = require('fs');
const path = require('path');

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
  const idCol = col.DestructableID || col.doodID || col.DoodID || 1;
  for (const [yy, r] of rows) {
    if (+yy === 1) continue;
    const id = r[idCol];
    if (!id || String(id).length !== 4) continue;
    const obj = { id };
    for (const [name, xi] of Object.entries(col)) {
      if (r[xi] != null) obj[name] = r[xi];
    }
    byId.set(id, obj);
  }
  return { col, byId };
}

const dest = parseSlk(
  fs.readFileSync('D:/Qt/workspace/War3Angular/public/assets/wc3/Units/DestructableData.slk', 'utf8')
);
const dood = parseSlk(
  fs.readFileSync('D:/Qt/workspace/War3Angular/public/assets/wc3/Doodads/Doodads.slk', 'utf8')
);
console.log('dood cols', Object.keys(dood.col).slice(0, 20));

const ids = [
  'YTlb',
  'YTpb',
  'ZPsh',
  'ZPfw',
  'D00B',
  'NTtc',
  'ATtc',
  'NTtw',
  'ATtr',
  'AOsr',
  'AOnt',
  'APms',
  'LOsk',
  'D000',
  'D009',
  'CPct',
  'VOfs',
  'VOfl',
];
for (const id of ids) {
  const r = dest.byId.get(id) || dood.byId.get(id);
  if (!r) {
    console.log(id, 'MISSING BOTH');
    continue;
  }
  console.log(
    id,
    'file=',
    r.file,
    'name=',
    r.Name || r.name || r.comment,
    'cat=',
    r.category || r.doodClass
  );
}

// List LOSBlocker assets
const los = 'D:/Qt/workspace/War3Angular/public/assets/wc3/Doodads/Terrain/LOSBlocker';
if (fs.existsSync(los)) {
  console.log(
    'LOSBlocker files',
    fs.readdirSync(los).map((f) => f + ':' + fs.statSync(path.join(los, f)).size)
  );
}
const canopy =
  'D:/Qt/workspace/War3Angular/public/assets/wc3/Doodads/Ashenvale/Plants/AshenCanopyTree';
if (fs.existsSync(canopy)) {
  console.log('Canopy', fs.readdirSync(canopy));
}

// Simulate filter
function shouldSkip(file) {
  return /LOSBlocker|PathingBlocker|BlightDoodad|Invisible|PathTextures|ClickHelper/i.test(
    file || ''
  );
}
for (const id of ['YTlb', 'YTpb', 'ZPsh', 'NTtc', 'D00B']) {
  const r = dest.byId.get(id) || dood.byId.get(id);
  console.log('skip?', id, r?.file, '=>', r ? shouldSkip(r.file) : 'no-row');
}
