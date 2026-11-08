const fs = require('fs');
const War3MapW3e = require('mdx-m3-viewer/dist/cjs/parsers/w3x/w3e/file.js').default;

const buf = fs.readFileSync('D:/Qt/workspace/War3Angular/public/assets/maps/dota683/named/war3map.w3e');
const w = new War3MapW3e();
w.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const gt = w.groundTilesets;
const cgrs = gt.indexOf('Cgrs');

function isCliff(col, row) {
  if (col < 1 || col > w.mapSize[0] - 2 || row < 1 || row > w.mapSize[1] - 2) return false;
  const c00 = w.corners[row][col];
  const c10 = w.corners[row][col + 1];
  const c01 = w.corners[row + 1][col];
  const c11 = w.corners[row + 1][col + 1];
  if (c00.ramp || c10.ramp || c01.ramp || c11.ramp) return false;
  const a = c00.layerHeight;
  return a !== c10.layerHeight || a !== c01.layerHeight || a !== c11.layerHeight;
}

function nearCliff(col, row, r) {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (isCliff(col + dx, row + dy)) return true;
    }
  }
  return false;
}

function cliffAdj(col, row) {
  for (let y = -1; y < 1; y++) {
    for (let x = -1; x < 1; x++) {
      const cc = col + x;
      const rr = row + y;
      if (cc > 0 && cc < w.mapSize[0] - 1 && rr > 0 && rr < w.mapSize[1] - 1 && isCliff(cc, rr)) {
        return true;
      }
    }
  }
  return false;
}

for (const [wx0, wy0, label] of [
  [-7200, -6800, 'rad_fount'],
  [-6500, -6200, 'rad_shop'],
  [-6900, -7000, 'rad_pad2'],
]) {
  const col0 = Math.round((wx0 - w.centerOffset[0]) / 128);
  const row0 = Math.round((wy0 - w.centerOffset[1]) / 128);
  console.log('\n==', label, col0, row0);
  for (let dy = -5; dy <= 5; dy++) {
    let line = '';
    for (let dx = -5; dx <= 5; dx++) {
      const c = w.corners[row0 + dy][col0 + dx];
      const id = gt[c.groundTexture];
      let mark = ' ';
      if (cliffAdj(col0 + dx, row0 + dy)) mark = '*';
      else if (nearCliff(col0 + dx, row0 + dy, 2) && c.groundTexture === cgrs && c.layerHeight >= 10)
        mark = '!';
      line += id + mark + ' ';
    }
    console.log(line);
  }
}

// Count how many island Cgrs would be fixed by nearCliff(2)+lh>=10 vs nearCliff(3)
let a = 0;
let b = 0;
for (let row = 1; row < w.mapSize[1] - 1; row++) {
  for (let col = 1; col < w.mapSize[0] - 1; col++) {
    const c = w.corners[row][col];
    if (c.groundTexture !== cgrs) continue;
    if (cliffAdj(col, row)) continue;
    if (c.layerHeight < 10) continue;
    if (nearCliff(col, row, 2)) a++;
    if (nearCliff(col, row, 3)) b++;
  }
}
console.log({ islandFixR2: a, islandFixR3: b });
