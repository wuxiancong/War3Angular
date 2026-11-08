const fs = require('fs');
const War3MapW3e = require('mdx-m3-viewer/dist/cjs/parsers/w3x/w3e/file.js').default;

const buf = fs.readFileSync('D:/Qt/workspace/War3Angular/public/assets/maps/dota683/named/war3map.w3e');
const w = new War3MapW3e();
w.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const gt = w.groundTilesets;
const cgrs = gt.indexOf('Cgrs');
const zvin = gt.indexOf('Zvin');
const clvg = gt.indexOf('Clvg');
const zbks = gt.indexOf('Zbks');
const marble = clvg;

const map = {
  corners: w.corners,
  columns: w.mapSize[0] - 1,
  rows: w.mapSize[1] - 1,
  isCliff(col, row) {
    if (col < 1 || col > this.columns - 1 || row < 1 || row > this.rows - 1) return false;
    const c00 = w.corners[row][col];
    const c10 = w.corners[row][col + 1];
    const c01 = w.corners[row + 1][col];
    const c11 = w.corners[row + 1][col + 1];
    if (c00.ramp || c10.ramp || c01.ramp || c11.ramp) return false;
    const a = c00.layerHeight;
    return a !== c10.layerHeight || a !== c01.layerHeight || a !== c11.layerHeight;
  },
};

function isCliffAdjacentCorner(column, row) {
  for (let y = -1; y < 1; y++) {
    for (let x = -1; x < 1; x++) {
      const cc = column + x;
      const rr = row + y;
      if (cc > 0 && cc < map.columns - 1 && rr > 0 && rr < map.rows - 1 && map.isCliff(cc, rr)) {
        return true;
      }
    }
  }
  return false;
}

function nearCliffCell(column, row, radius) {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const cc = column + dx;
      const rr = row + dy;
      if (cc > 0 && cc < map.columns - 1 && rr > 0 && rr < map.rows - 1 && map.isCliff(cc, rr)) {
        return true;
      }
    }
  }
  return false;
}

function countMarbleContext(column, row, radius) {
  let n = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (!dx && !dy) continue;
      const c = w.corners[row + dy]?.[column + dx];
      if (!c) continue;
      const t = c.groundTexture | 0;
      if (t === clvg || t === zbks) {
        n++;
        continue;
      }
      if (isCliffAdjacentCorner(column + dx, row + dy)) n++;
    }
  }
  return n;
}

function shouldForce(column, row, tex) {
  if (tex !== cgrs && tex !== zvin) return false;
  const corner = w.corners[row][column];
  if (countMarbleContext(column, row, 1) >= 2) return true;
  if ((corner.layerHeight | 0) >= 10 && nearCliffCell(column, row, 2) && countMarbleContext(column, row, 2) >= 1) {
    return true;
  }
  return false;
}

let cgrsFix = 0;
let zvinFix = 0;
let remainPlatformCgrs = 0;
for (let row = 1; row < w.mapSize[1] - 1; row++) {
  for (let col = 1; col < w.mapSize[0] - 1; col++) {
    const c = w.corners[row][col];
    const tex = c.groundTexture | 0;
    if (shouldForce(col, row, tex)) {
      if (tex === cgrs) cgrsFix++;
      if (tex === zvin) zvinFix++;
    } else if (tex === cgrs && (c.layerHeight | 0) >= 10 && nearCliffCell(col, row, 2)) {
      remainPlatformCgrs++;
    }
  }
}
console.log({ cgrsFix, zvinFix, remainPlatformCgrs });

// Sample rad fountain after virtual bake
const col0 = Math.round((-7200 - w.centerOffset[0]) / 128);
const row0 = Math.round((-6800 - w.centerOffset[1]) / 128);
console.log('rad_fount sample after force:');
for (let dy = -4; dy <= 4; dy++) {
  let line = '';
  for (let dx = -4; dx <= 4; dx++) {
    const c = w.corners[row0 + dy][col0 + dx];
    let id = gt[c.groundTexture];
    if (shouldForce(col0 + dx, row0 + dy, c.groundTexture | 0)) id = 'MRBL';
    line += id.padEnd(4) + ' ';
  }
  console.log(line);
}
