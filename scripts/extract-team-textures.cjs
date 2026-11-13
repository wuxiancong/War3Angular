/**
 * 导出原版队伍色贴图：ReplaceableTextures\TeamColor\TeamColorNN.blp 与 TeamGlow\TeamGlowNN.blp。
 *
 * 以前目录里除了 00/01/06/08 之外都是 8×8 的纯色 PNG 占位图。TeamColor 本身就是纯色，问题不大；
 * 但 TeamGlow 原图是带透明度的径向光晕，用纯色方块代替后，英雄出生光环（能量圈）等模型的
 * 队伍色光晕会变成一整块实心方块。这里把原版 BLP 原样拷出来，查找顺序与游戏一致。
 *
 * 用法: node scripts/extract-team-textures.cjs [游戏目录]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MpqArchive = require(path.join(ROOT, 'node_modules/mdx-m3-viewer/dist/cjs/parsers/mpq/archive.js')).default;
const GAME_DIR = process.argv[2] || 'C:/Program Files (x86)/iCCup Warcraft III';
const OUT = path.join(ROOT, 'public/assets/wc3/ReplaceableTextures');

const archives = [];
for (const n of ['War3Patch.mpq', 'War3xlocal.mpq', 'War3x.mpq', 'war3.mpq']) {
  const p = path.join(GAME_DIR, n);
  if (!fs.existsSync(p)) continue;
  const b = fs.readFileSync(p);
  const a = new MpqArchive();
  a.load(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), true);
  archives.push(a);
}
function getFile(name) {
  for (const a of archives) {
    const f = a.get(name);
    if (!f) continue;
    try {
      return Buffer.from(f.bytes());
    } catch {
      /* 继续找下一个包 */
    }
  }
  return null;
}

const found = [];
for (const kind of ['TeamColor', 'TeamGlow']) {
  for (let i = 0; i < 16; i++) {
    const nn = String(i).padStart(2, '0');
    const bytes = getFile(`ReplaceableTextures\\${kind}\\${kind}${nn}.blp`);
    if (!bytes) continue;
    fs.mkdirSync(path.join(OUT, kind), { recursive: true });
    fs.writeFileSync(path.join(OUT, kind, `${kind}${nn}.blp`), bytes);
    found.push(`${kind}${nn}`);
  }
}
console.log(`导出 ${found.length} 张：${found.join(' ')}`);
