const fs = require('fs');
const Doo = require('../node_modules/mdx-m3-viewer/dist/cjs/parsers/w3x/doo/file.js').default;

function parseSlk(text) {
  let x = 1,
    y = 1;
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
  const idCol = col.DestructableID || col.doodID || 1;
  for (const [yy, r] of rows) {
    if (+yy === 1) continue;
    const id = r[idCol];
    if (!id || String(id).length !== 4) continue;
    byId.set(id, {
      file: r[col.file] || '',
      category: r[col.category] || r[col.doodClass] || '',
      Name: r[col.Name] || '',
    });
  }
  return byId;
}

const dest = parseSlk(
  fs.readFileSync('D:/Qt/workspace/War3Angular/public/assets/wc3/Units/DestructableData.slk', 'utf8')
);
const dood = parseSlk(
  fs.readFileSync('D:/Qt/workspace/War3Angular/public/assets/wc3/Doodads/Doodads.slk', 'utf8')
);

function shouldSkip(id, row, file) {
  const cat = String(row?.category || '');
  const name = String(row?.Name || '');
  if (cat === 'P') return true;
  if (/YTlb|YTpb|YTfc|YTpc/i.test(id)) return true;
  if (/LOSBlocker|PathingBlocker|BlightDoodad|InvisiblePlatform|ClickHelper/i.test(file)) return true;
  if (/WESTRING_DEST_LOS|WESTRING_DEST_PATH/i.test(name)) return true;
  if (/^(D00B|D009|D000|D001)$/i.test(id)) return true;
  if (/^Abilities\\/i.test(file) || /FaerieFire/i.test(file)) return true;
  if (
    /Ruins_Shrub|Ruins_Flower|AshenShrooms|AshenCanopyTree|FelwoodCatTail|AshenCatTail|Wheat|CornField/i.test(
      file
    )
  )
    return true;
  if (/^(ZPsh|ZPfw|NTtc|ATtc|APms|CPct|CPms)$/i.test(id)) return true;
  if (/SkullPile|Bones|Bush\b|Shrub/i.test(file)) return true;
  return false;
}

const buf = fs.readFileSync('D:/Qt/workspace/War3Angular/scratch/dota683d_official/war3map.doo');
const d = new Doo();
d.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 26);

let keep = 0,
  skip = 0;
const skipBy = {};
for (const x of d.doodads) {
  const row = dest.get(x.id) || dood.get(x.id) || {};
  const file = row.file || '';
  if (!file && !/^(D00B|D009|D000|D001|YTlb|YTpb)$/i.test(x.id)) {
    // no row - originally skipped by !row || !file
    skip++;
    skipBy['NO_ROW:' + x.id] = (skipBy['NO_ROW:' + x.id] || 0) + 1;
    continue;
  }
  if (shouldSkip(x.id, row, file) || !file) {
    skip++;
    skipBy[x.id] = (skipBy[x.id] || 0) + 1;
  } else keep++;
}
console.log({ total: d.doodads.length, keep, skip });
console.log(
  'top skipped',
  Object.entries(skipBy)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
);
