const fs = require('fs');
const text = fs.readFileSync(
  'D:/Qt/workspace/War3Angular/public/assets/wc3/TerrainArt/Terrain.slk',
  'utf8'
);
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
const header = rows.get(1);
const col = {};
for (const [xi, n] of Object.entries(header)) col[n] = +xi;
for (const id of ['Cgrs', 'Clvg', 'Zbks', 'Zvin', 'Cvin', 'Cdrt', 'Arck', 'Ndrd', 'Cdrd']) {
  for (const [, r] of rows) {
    if (r[col.tileID] === id) {
      console.log(id, {
        dir: r[col.dir],
        file: r[col.file],
        comment: r[col.comment],
      });
      break;
    }
  }
}
const cliff = fs.readFileSync(
  'D:/Qt/workspace/War3Angular/public/assets/wc3/TerrainArt/CliffTypes.slk',
  'utf8'
);
console.log('CCgr block', cliff.slice(cliff.indexOf('"CCgr"'), cliff.indexOf('"CCgr"') + 200));
