const fs = require('fs');
const path = require('path');

const ui = fs.readFileSync(path.join(__dirname, 'dota683_extract/units_unitui.slk'), 'utf8');
let x = 1;
let y = 1;
const rows = new Map();
for (const line of ui.split(/\r?\n/)) {
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
const byId = new Map();
for (const [, r] of rows) {
  if (r[1] && r[1].length === 4) {
    byId.set(r[1], { file: r[3] || '', scale: r[22] || '', sound: r[5] || '' });
  }
}
const ids = [
  'nfoh', 'n01F', 'hC95', 'n01K', 'nC38', 'e025', 'n00V', 'n00W', 'n002', 'n00X', 'n009', 'n0HE',
  'etol', 'e00R', 'e011', 'e00S', 'e019', 'eaom', 'eaoe', 'emow', 'eaow', 'edob', 'e008',
  'u00F', 'unpl', 'uzig',
];
for (const id of ids) console.log(id, byId.get(id) || 'MISSING');
