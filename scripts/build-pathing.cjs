/**
 * 由 DotA v6.83d.w3x 的 war3map.wpm（地形通行图）+ war3map.doo（树木/可破坏物）
 * 烘焙网页对战用的寻路栅格。
 *
 *   wpm：512×512 格，每格 32 码；标志位 0x02 = 不可行走（悬崖/深水/边界）
 *   doo：树木在运行时才盖通行章，wpm 内不含，因此这里按标准树 PathTextures\4x4Default（4×4 格 = 128 码）补盖
 *
 * 输出 public/assets/maps/dota683/pathing.json：
 *   { cell: 32, width: 512, height: 512, x0, y0, rle: [...] }  —— 行优先，1=阻挡，游程编码
 *
 * 用法: node scripts/build-pathing.cjs ["D:/Maps/DotA v6.83d.w3x"]
 */
const fs = require('fs');
const path = require('path');
const MpqArchive = require('../node_modules/mdx-m3-viewer/dist/cjs/parsers/mpq/archive.js').default;

const MAP_PATH = process.argv[2] || 'D:/Maps/DotA v6.83d.w3x';
const OUT = path.join(__dirname, '../public/assets/maps/dota683/pathing.json');

const buf = fs.readFileSync(MAP_PATH);
const mpq = new MpqArchive();
mpq.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), true);
const get = (n) => Buffer.from(mpq.get(n).bytes());

// ---- wpm ----
const wpm = get('war3map.wpm');
if (wpm.toString('latin1', 0, 4) !== 'MP3W') throw new Error('wpm 魔数不符');
const W = wpm.readInt32LE(8);
const H = wpm.readInt32LE(12);
const grid = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) grid[i] = wpm[16 + i] & 0x02 ? 1 : 0;

// ---- w3e：取地图中心偏移 ----
const w3e = get('war3map.w3e');
let o = 4 + 4 + 1 + 4; // 'W3E!' + version + tileset + customTileset
const nGround = w3e.readInt32LE(o);
o += 4 + nGround * 4;
const nCliff = w3e.readInt32LE(o);
o += 4 + nCliff * 4;
o += 8; // mapSize x,y
const x0 = w3e.readFloatLE(o);
const y0 = w3e.readFloatLE(o + 4);

// ---- doo：统计 ID 并给树盖章 ----
const doo = get('war3map.doo');
if (doo.toString('latin1', 0, 4) !== 'W3do') throw new Error('doo 魔数不符');
const ver = doo.readInt32LE(4);
const count = doo.readInt32LE(12);
let p = 16;
const freq = {};
const trees = [];
// 树木 ID：标准树 xTxx（ATtr/LTlt/NTtw/FTtw/CTtr/BTtw/WTst/YTct…）及 DotA 自定义树（B00x 系列在盖章前按频次判定）
// 注意排除 YTlb/YTlc（视线阻断器，z≈1152 悬空，仅挡视野不挡路）等 YT* 辅助可破坏物
const isTreeId = (id) => /^[A-Z]T[a-z0-9]{2}$/.test(id) && !/^YT/.test(id);
for (let i = 0; i < count; i++) {
  const id = doo.toString('latin1', p, p + 4);
  const x = doo.readFloatLE(p + 8);
  const y = doo.readFloatLE(p + 12);
  p += 4 + 4 + 12 + 4 + 12 + 1 + 1;
  if (ver >= 8) {
    p += 4; // 掉落表指针
    const sets = doo.readInt32LE(p);
    p += 4;
    for (let s = 0; s < sets; s++) {
      const n = doo.readInt32LE(p);
      p += 4 + n * 8;
    }
  }
  p += 4; // 编辑器内 ID
  freq[id] = (freq[id] || 0) + 1;
  if (isTreeId(id)) trees.push([x, y]);
}
for (const [x, y] of trees) {
  const cx = Math.floor((x - x0) / 32);
  const cy = Math.floor((y - y0) / 32);
  for (let dy = -2; dy <= 1; dy++) {
    for (let dx = -2; dx <= 1; dx++) {
      const gx = cx + dx;
      const gy = cy + dy;
      if (gx >= 0 && gy >= 0 && gx < W && gy < H) grid[gy * W + gx] = 1;
    }
  }
}

// ---- 游程编码 ----
const rle = [];
let cur = 0;
let run = 0;
for (let i = 0; i < grid.length; i++) {
  if (grid[i] === cur) run++;
  else {
    rle.push(run);
    cur = grid[i];
    run = 1;
  }
}
rle.push(run);

fs.writeFileSync(OUT, JSON.stringify({ cell: 32, width: W, height: H, x0, y0, rle }));
const blocked = grid.reduce((a, b) => a + b, 0);
console.log(`OK ${OUT}`);
console.log(` wpm ${W}x${H} origin=(${x0},${y0}) doodads=${count} trees=${trees.length} blocked=${((blocked / grid.length) * 100).toFixed(1)}% rle=${rle.length}`);
console.log(' 可破坏物 ID 频次 Top:', Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}×${v}`).join(' '));
