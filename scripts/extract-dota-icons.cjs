/**
 * 物品 / 技能图标导出：直接从 BLP 原图解码，替换以前颜色被红蓝互换的 PNG。
 *
 * 之前 War3Bot/build/.../images/{itemIcons,abilityIcons} 里的 PNG 是用 BLP(JPEG) 解码时
 * 没按 WC3 的 BGRA 通道顺序处理导出的，红色图标（食人魔手套、魔棒…）变成蓝色；
 * 后来的 fix-icon-bgr 只能按色彩启发式挑着换回，所以有的对有的错。
 * 这里改用 3D 视口同一个 BLP 解码器（mdx-m3-viewer，通道顺序正确），从源文件重新导出。
 *
 * 查找顺序与游戏一致：地图自带导入 > War3Patch.mpq > War3xlocal.mpq > War3x.mpq > war3.mpq
 *
 * 用法: node scripts/extract-dota-icons.cjs [地图路径] [游戏目录]
 * 输出: public/assets/dota/itemIcons/<物品代码>.png、public/assets/dota/abilityIcons/<技能代码>.png
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const MpqArchive = require(path.join(ROOT, 'node_modules/mdx-m3-viewer/dist/cjs/parsers/mpq/archive.js')).default;
globalThis.ImageData = class {
  constructor(w, h) {
    this.width = w;
    this.height = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }
};
const { BlpImage } = require(path.join(ROOT, 'node_modules/mdx-m3-viewer/dist/cjs/parsers/blp/image.js'));

const MAP = process.argv[2] || 'D:/Maps/DotA v6.83d.w3x';
const GAME_DIR = process.argv[3] || 'C:/Program Files (x86)/iCCup Warcraft III';
const DATA = path.join(ROOT, 'public/assets/dota/gameplay-data.json');
const OUT = path.join(ROOT, 'public/assets/dota');

const archives = [];
function open(file, label) {
  if (!fs.existsSync(file)) return;
  const buf = fs.readFileSync(file);
  const a = new MpqArchive();
  a.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), true);
  archives.push({ name: label, a });
}
open(MAP, 'map');
for (const n of ['War3Patch.mpq', 'War3xlocal.mpq', 'War3x.mpq', 'war3.mpq']) open(path.join(GAME_DIR, n), n);
if (!archives.length) throw new Error('未找到地图或 MPQ');

function getFile(name) {
  const n = name.split('/').join('\\');
  for (const { name: arc, a } of archives) {
    const f = a.get(n);
    if (!f) continue;
    try {
      return { arc, bytes: Buffer.from(f.bytes()) };
    } catch {
      /* 损坏/加密块，继续找下一个包 */
    }
  }
  return null;
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function writePng(file, w, h, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
  );
}

function decodeBlp(bytes) {
  const blp = new BlpImage();
  blp.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const img = blp.getMipmap(0);
  return { w: img.width, h: img.height, data: new Uint8ClampedArray(img.data) };
}

/** 图标路径在 SLK 里有时写 .tga 或不带扩展名；也有地图用了不存在的路径 */
function loadIcon(art) {
  if (!art) return null;
  const base = art.replace(/\.(blp|tga)$/i, '');
  const f = getFile(base + '.blp');
  if (!f) return null;
  try {
    return { ...decodeBlp(f.bytes), arc: f.arc };
  } catch (e) {
    console.warn('BLP 解码失败', art, e.message);
    return null;
  }
}

const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const stats = { ok: 0, missing: [], fromMap: 0 };
function exportSet(table, dir) {
  for (const [code, def] of Object.entries(table)) {
    const img = loadIcon(def.art);
    if (!img) {
      stats.missing.push(`${dir}/${code} ${def.art || '(无图标)'}`);
      continue;
    }
    if (img.arc === 'map') stats.fromMap++;
    writePng(path.join(OUT, dir, code + '.png'), img.w, img.h, img.data);
    stats.ok++;
  }
}
exportSet(data.items, 'itemIcons');
exportSet(data.abilities, 'abilityIcons');
console.log(`导出 ${stats.ok} 个图标（其中 ${stats.fromMap} 个来自地图导入）`);
if (stats.missing.length) console.log(`未找到 ${stats.missing.length} 个：\n  ` + stats.missing.join('\n  '));
