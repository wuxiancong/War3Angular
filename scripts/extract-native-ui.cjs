/**
 * 原生控制台 UI 资源导出：按 Game.dll 读取皮肤的同一条路径取资源
 *   UI\war3skins.txt  →  [Default] + 种族段(NightElf/Undead…) 的键值  →  BLP/MDX 路径
 *   UI\FrameDef\FrameDef.toc → 各 .fdf（帧布局定义）
 *
 * MPQ 优先级与游戏一致：War3Patch.mpq > War3xlocal.mpq > War3x.mpq > war3.mpq
 *
 * 用法:
 *   node scripts/extract-native-ui.cjs dump   [游戏目录]   # 导出 war3skins.txt / fdf 到 War3Analysis/artifacts/wc3-native-ui
 *   node scripts/extract-native-ui.cjs assets [游戏目录]   # 导出并转换贴图到 public/assets/wc3/native-ui
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const MpqArchive = require(path.join(ROOT, 'node_modules/mdx-m3-viewer/dist/cjs/parsers/mpq/archive.js')).default;

// BLP 解码器依赖浏览器 ImageData，这里补一个最小实现
globalThis.ImageData = class {
  constructor(w, h) {
    this.width = w;
    this.height = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }
};
const { BlpImage } = require(path.join(ROOT, 'node_modules/mdx-m3-viewer/dist/cjs/parsers/blp/image.js'));

const mode = process.argv[2] || 'assets';
const GAME_DIR = process.argv[3] || 'C:/Program Files (x86)/iCCup Warcraft III';
const ARTIFACTS = 'D:/Qt/workspace/War3Analysis/artifacts/wc3-native-ui';
const OUT = path.join(ROOT, 'public/assets/wc3/native-ui');
const bs = (p) => p.split('/').join('\\');

const archives = [];
for (const name of ['War3Patch.mpq', 'War3xlocal.mpq', 'War3x.mpq', 'war3.mpq']) {
  const p = path.join(GAME_DIR, name);
  if (!fs.existsSync(p)) continue;
  const buf = fs.readFileSync(p);
  const a = new MpqArchive();
  a.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), true);
  archives.push({ name, a });
}
if (!archives.length) throw new Error('未找到 MPQ：' + GAME_DIR);

function getFile(name) {
  const n = bs(name);
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

function parseIni(text) {
  const out = {};
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('//')) continue;
    const h = s.match(/^\[(.+)\]$/);
    if (h) {
      cur = out[h[1]] = out[h[1]] || {};
      continue;
    }
    const i = s.indexOf('=');
    if (i > 0 && cur) cur[s.slice(0, i).trim()] = s.slice(i + 1).trim();
  }
  return out;
}

// ---------- PNG 写出 ----------
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
/** 皮肤键里的贴图路径常省略扩展名 */
function loadTexture(p) {
  const base = p.replace(/\.(blp|tga)$/i, '');
  const f = getFile(base + '.blp');
  if (!f) return null;
  try {
    return decodeBlp(f.bytes);
  } catch (e) {
    console.warn('BLP 解码失败', p, e.message);
    return null;
  }
}

// ---------------------------------------------------------------- dump
const skinsFile = getFile('UI/war3skins.txt');
if (!skinsFile) throw new Error('UI\\war3skins.txt 未找到');
const skins = parseIni(skinsFile.bytes.toString('utf8'));

if (mode === 'dump') {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  fs.writeFileSync(path.join(ARTIFACTS, 'war3skins.txt'), skinsFile.bytes);
  console.log('war3skins.txt 来自', skinsFile.arc, '段：', Object.keys(skins).join(', '));
  const toc = getFile('UI/FrameDef/FrameDef.toc');
  const list = toc ? toc.bytes.toString('latin1').split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [];
  if (toc) fs.writeFileSync(path.join(ARTIFACTS, 'FrameDef.toc'), toc.bytes);
  let n = 0;
  for (const rel of list) {
    const f = getFile(rel);
    if (!f) continue;
    fs.writeFileSync(path.join(ARTIFACTS, rel.split('\\').join('__')), f.bytes);
    n++;
  }
  for (const extra of ['UI/MiscData.txt', 'UI/FrameDef/GlobalStrings.fdf']) {
    const f = getFile(extra);
    if (f) fs.writeFileSync(path.join(ARTIFACTS, extra.split('/').join('__')), f.bytes);
  }
  console.log(`FrameDef.toc ${list.length} 项，导出 ${n} 个 fdf → ${ARTIFACTS}`);
  process.exit(0);
}

// ---------------------------------------------------------------- assets
const RACES = ['NightElf', 'Undead'];
const manifest = { source: GAME_DIR, races: {} };

/**
 * 按 UI\FrameDef\UI\ConsoleUI.fdf 的 9 个 Texture 块拼装（1 单位 = 2000 贴图像素，屏宽 0.8 = 1600px）：
 *   顶栏  高 0.032(64px)：Tile01 全宽 | Tile02 u0~0.3398(174px) | 中间留空给时间指示器模型 | Tile02 u0.793~1(106px) | Tile03 | Tile04
 *   底部  高 0.176(352px)：Tile01 v0.3125~1 | Tile02 v0.4141~1(高 0.15，贴底) | Tile03 | Tile04
 */
function assembleConsole(race, skin) {
  const tiles = ['ConsoleTexture01', 'ConsoleTexture02', 'ConsoleTexture03', 'ConsoleTexture04'].map((k) => loadTexture(skin[k]));
  if (tiles.some((t) => !t)) {
    console.warn(race, '控制台瓦片缺失');
    return null;
  }
  const [t1, t2, t3, t4] = tiles;
  const W = 1600;
  const blit = (dst, dw, t, sx, sy, sw, sh, dx, dy) => {
    for (let y = 0; y < sh; y++) {
      const so = ((sy + y) * t.w + sx) * 4;
      dst.set(t.data.subarray(so, so + sw * 4), ((dy + y) * dw + dx) * 4);
    }
  };
  // 顶栏 1600×64
  const top = new Uint8ClampedArray(W * 64 * 4);
  blit(top, W, t1, 0, 0, 512, 64, 0, 0);
  blit(top, W, t2, 0, 0, 174, 64, 512, 0);
  blit(top, W, t2, 406, 0, 106, 64, 918, 0);
  blit(top, W, t3, 0, 0, 512, 64, 1024, 0);
  blit(top, W, t4, 0, 0, 64, 64, 1536, 0);
  writePng(path.join(OUT, race, 'topbar.png'), W, 64, top);
  // 时间指示器位置的静态底图（Tile02 中段，模型加载失败时兜底）
  const tf = new Uint8ClampedArray(232 * 128 * 4);
  blit(tf, 232, t2, 174, 0, 232, 128, 0, 0);
  writePng(path.join(OUT, race, 'time-frame.png'), 232, 128, tf);
  // 底部 1600×352
  const H = 352;
  const bot = new Uint8ClampedArray(W * H * 4);
  blit(bot, W, t1, 0, 160, 512, 352, 0, 0);
  blit(bot, W, t2, 0, 212, 512, 300, 512, 52);
  blit(bot, W, t3, 0, 160, 512, 352, 1024, 0);
  blit(bot, W, t4, 0, 160, 64, 352, 1536, 0);
  writePng(path.join(OUT, race, 'console.png'), W, H, bot);
  return { topbarHeight: 64, consoleHeight: H, holes: findHoles(bot, W, H) };
}

// 孔洞顶部带半透明内阴影（alpha 渐变），阈值取高一些才能量到完整孔
const HOLE_ALPHA = Number(process.env.HOLE_ALPHA || 235);
function findHoles(rgba, W, H) {
  const seen = new Uint8Array(W * H);
  const out = [];
  const stack = [];
  for (let y0 = 0; y0 < H; y0++) {
    for (let x0 = 0; x0 < W; x0++) {
      const i0 = y0 * W + x0;
      if (seen[i0] || rgba[i0 * 4 + 3] > HOLE_ALPHA) continue;
      let minX = x0, maxX = x0, minY = y0, maxY = y0, area = 0, touchesEdge = false;
      stack.push(i0);
      seen[i0] = 1;
      while (stack.length) {
        const i = stack.pop();
        const x = i % W;
        const y = (i - x) / W;
        area++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x === 0 || x === W - 1) touchesEdge = true;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (seen[ni] || rgba[ni * 4 + 3] > HOLE_ALPHA) continue;
          seen[ni] = 1;
          stack.push(ni);
        }
      }
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      // 只保留规整的 UI 孔（面积占包围盒 ≥70%）
      if (area > 600 && !touchesEdge && area / (w * h) > 0.7) out.push({ x: minX, y: minY, w, h });
    }
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

const SINGLE = {
  // 皮肤键名（Game.dll 以这些键查 war3skins.txt）→ 输出文件名
  ConsoleInventoryCoverTexture: 'inventory-cover.png',
  ConsoleInventoryNoCapacity: 'inventory-slotfiller.png',
  UpperMenuButtonTexture: 'upper-button.png',
  MiniMapSignalButtonEnabled: 'mm-signal.png', MiniMapSignalButtonPushed: 'mm-signal-down.png',
  MiniMapTerrainButtonActiveEnabled: 'mm-terrain-on.png', MiniMapTerrainButtonActivePushed: 'mm-terrain-on-down.png',
  MiniMapTerrainButtonInactiveEnabled: 'mm-terrain-off.png', MiniMapTerrainButtonInactivePushed: 'mm-terrain-off-down.png',
  MiniMapAllyButtonActiveEnabled: 'mm-ally-on.png', MiniMapAllyButtonActivePushed: 'mm-ally-on-down.png',
  MiniMapAllyButtonInactiveEnabled: 'mm-ally-off.png', MiniMapAllyButtonInactivePushed: 'mm-ally-off-down.png',
  MiniMapCreepButtonActiveEnabled: 'mm-creep-on.png', MiniMapCreepButtonActivePushed: 'mm-creep-on-down.png',
  MiniMapCreepButtonInactiveEnabled: 'mm-creep-off.png', MiniMapCreepButtonInactivePushed: 'mm-creep-off-down.png',
  MiniMapFormationOnButtonEnabled: 'mm-formation-on.png', MiniMapFormationOnButtonEnabledPushed: 'mm-formation-on-down.png',
  MiniMapFormationOffButtonEnabled: 'mm-formation-off.png', MiniMapFormationOffButtonEnabledPushed: 'mm-formation-off-down.png',
  GoldIcon: 'res-gold.png', LumberIcon: 'res-lumber.png', SupplyIcon: 'res-supply.png', UpkeepIcon: 'res-upkeep.png',
  HeroStrengthIcon: 'attr-str.png', HeroAgilityIcon: 'attr-agi.png', HeroIntelligenceIcon: 'attr-int.png',
  InfoPanelIconHeroIconSTR: 'info-hero-str.png', InfoPanelIconHeroIconAGI: 'info-hero-agi.png', InfoPanelIconHeroIconINT: 'info-hero-int.png',
  InfoPanelIconDamageNormal: 'info-dmg-normal.png', InfoPanelIconDamagePierce: 'info-dmg-pierce.png', InfoPanelIconDamageSiege: 'info-dmg-siege.png',
  InfoPanelIconDamageMagic: 'info-dmg-magic.png', InfoPanelIconDamageChaos: 'info-dmg-chaos.png', InfoPanelIconDamageHero: 'info-dmg-hero.png',
  InfoPanelIconArmorSmall: 'info-armor-small.png', InfoPanelIconArmorMedium: 'info-armor-medium.png', InfoPanelIconArmorLarge: 'info-armor-large.png',
  InfoPanelIconArmorFort: 'info-armor-fort.png', InfoPanelIconArmorHero: 'info-armor-hero.png', InfoPanelIconArmorDivine: 'info-armor-divine.png',
  InfoPanelIconArmorNone: 'info-armor-none.png',
  CommandButtonActiveHighlight: 'cmd-active.png', CommandButtonNumberOverlay: 'cmd-number.png', CommandButtonHeroGlow: 'cmd-heroglow.png',
  SimpleHpBarConsole: 'bar-fill.png', SimpleXpBarConsole: 'xp-fill.png', SimpleXpBarBorder: 'xp-border.png',
  ToolTipBackground: 'tooltip-bg.png', ToolTipBorder: 'tooltip-border.png',
  ToolTipGoldIcon: 'tip-gold.png', ToolTipManaIcon: 'tip-mana.png', ToolTipLumberIcon: 'tip-lumber.png', ToolTipSupplyIcon: 'tip-supply.png',
  HeroBarBorder: 'hero-border.png',
  MinimapHeroTexture: 'mm-icon-hero.png', MinimapNeutralTexture: 'mm-icon-neutral.png',
  MinimapCreepCampTexture: 'mm-icon-creep.png', MinimapToughCreepCampTexture: 'mm-icon-creep-tough.png',
  EscMenuBackground: 'esc-bg.png', EscMenuBorder: 'esc-border.png',
  EscMenuButtonBackground: 'esc-btn.png', EscMenuButtonPushedBackground: 'esc-btn-down.png', EscMenuButtonMouseOverHighlight: 'esc-btn-hi.png',
  MultiboardIconBorder: 'editbox-border.png',
};

for (const race of RACES) {
  const skin = { ...(skins['Default'] || {}), ...(skins[race] || {}) };
  const info = { keys: {}, missing: [] };
  const con = assembleConsole(race, skin);
  if (con) Object.assign(info, con);
  for (const [key, file] of Object.entries(SINGLE)) {
    const p = skin[key];
    if (!p) continue;
    const t = loadTexture(p);
    if (!t) {
      info.missing.push(`${key}=${p}`);
      continue;
    }
    writePng(path.join(OUT, race, file), t.w, t.h, t.data);
    info.keys[key] = { path: p, file, w: t.w, h: t.h };
  }
  // 模型类（时间指示器等）原样导出为 .mdxbin，交给 mdx-m3-viewer 渲染
  for (const key of ['TimeOfDayIndicator']) {
    const p = skin[key];
    if (!p) continue;
    const f = getFile(p.replace(/\.mdl$/i, '.mdx'));
    if (f) {
      fs.mkdirSync(path.join(OUT, race), { recursive: true });
      fs.writeFileSync(path.join(OUT, race, 'time-indicator.mdxbin'), f.bytes);
      info.keys[key] = { path: p, file: 'time-indicator.mdxbin' };
    } else info.missing.push(`${key}=${p}`);
  }
  manifest.races[race] = info;
  console.log(`${race}: 顶栏 ${info.topbarHeight}px，控制台 ${info.consoleHeight}px，孔洞 ${info.holes ? info.holes.length : 0} 个，贴图 ${Object.keys(info.keys).length} 个，缺失 ${info.missing.length}`);
  if (info.missing.length) console.log('  缺失：', info.missing.join(' | '));
}
// ---------------------------------------------------------------- 公共贴图 / 九宫格 / 地图皮肤覆盖
/**
 * BACKDROP 边框贴图（BackdropEdgeFile）是 8 个等宽方块横排：左 右 上 下 左上 右上 左下 右下，
 * 其中「上/下」两块以旋转 90° 的方式存放。这里拼成 3×3 九宫格 PNG，前端用 border-image 使用。
 */
function nineSlice(edgePath, bgPath, outFile) {
  const e = loadTexture(edgePath);
  if (!e) return null;
  const t = e.h; // 单块边长
  const bg = bgPath ? loadTexture(bgPath) : null;
  const S = t * 3;
  const out = new Uint8ClampedArray(S * S * 4);
  const px = (img, x, y) => {
    const o = (y * img.w + x) * 4;
    return [img.data[o], img.data[o + 1], img.data[o + 2], img.data[o + 3]];
  };
  const put = (x, y, c) => {
    const o = (y * S + x) * 4;
    // 与已有像素做 alpha 混合（边框盖在底图上）
    const a = c[3] / 255;
    out[o] = c[0] * a + out[o] * (1 - a);
    out[o + 1] = c[1] * a + out[o + 1] * (1 - a);
    out[o + 2] = c[2] * a + out[o + 2] * (1 - a);
    out[o + 3] = Math.max(out[o + 3], c[3]);
  };
  if (bg) {
    // 底图平铺到中心并向外延伸到边框内侧（BackdropBackgroundInsets 约为边框的 40%）
    const inset = Math.round(t * 0.4);
    for (let y = inset; y < S - inset; y++) for (let x = inset; x < S - inset; x++) put(x, y, px(bg, x % bg.w, y % bg.h));
  }
  const tile = (idx, dx, dy, rot) => {
    for (let y = 0; y < t; y++) {
      for (let x = 0; x < t; x++) {
        // rot=true：把竖条顺时针转 90° 变成横条
        const c = rot ? px(e, idx * t + y, t - 1 - x) : px(e, idx * t + x, y);
        put(dx + x, dy + y, c);
      }
    }
  };
  tile(0, 0, t, false); // 左
  tile(1, 2 * t, t, false); // 右
  tile(2, t, 0, true); // 上
  tile(3, t, 2 * t, true); // 下
  tile(4, 0, 0, false);
  tile(5, 2 * t, 0, false);
  tile(6, 0, 2 * t, false);
  tile(7, 2 * t, 2 * t, false);
  writePng(path.join(OUT, outFile), S, S, out);
  return { file: outFile, size: S, slice: t };
}

const common = { nine: {}, icons: {} };
const D = skins['Default'] || {};
const NE = { ...D, ...(skins['NightElf'] || {}) };
common.nine.tooltip = nineSlice(D.ToolTipBorder, D.ToolTipBackground, 'common/tooltip-9.png');
common.nine.escNightElf = nineSlice(NE.EscMenuBorder, NE.EscMenuBackground, 'common/esc-nightelf-9.png');
const UDK = { ...D, ...(skins['Undead'] || {}) };
common.nine.escUndead = nineSlice(UDK.EscMenuBorder, UDK.EscMenuBackground, 'common/esc-undead-9.png');
common.nine.multiboard = nineSlice(D.MultiboardBorder || 'UI\Widgets\EscMenu\Human\human-options-menu-border', D.MultiboardBackground || D.EscMenuBackground, 'common/multiboard-9.png');

// 命令图标与地图皮肤覆盖（war3mapSkin.txt [CustomSkin]：DotA 把木材图标换成时钟、人口图标换成空白）
const mapSkinPath = 'D:/Qt/workspace/War3Analysis/artifacts/wc3-native-ui/dota683d-war3mapSkin.txt';
const mapSkin = fs.existsSync(mapSkinPath) ? parseIni(fs.readFileSync(mapSkinPath, 'utf8').replace(/^﻿/, '')) : {};
const custom = mapSkin['CustomSkin'] || {};
const extraTex = {
  'common/BTNCancel.png': D.CommandCancel,
  'common/BTNSkillz.png': D.CommandNewSkill,
  'common/BTNMove.png': D.CommandMove,
  'common/BTNStop.png': D.CommandStop,
  'common/BTNHoldPosition.png': D.CommandHoldPosition,
  'common/BTNAttack.png': D.CommandAttack,
  'common/BTNPatrol.png': D.CommandPatrol,
  'common/BTNStatUp.png': 'ReplaceableTextures\CommandButtons\BTNStatUp',
  'common/dota-lumber-clock.png': custom.LumberIcon,
  'common/dota-supply.png': custom.SupplyIcon,
  'common/mm-min-enabled.png': D.MultiboardMinimizeButtonEnabled,
  'common/mm-min-pushed.png': D.MultiboardMinimizeButtonPushed,
};
for (const [file, p] of Object.entries(extraTex)) {
  if (!p) continue;
  const t = loadTexture(p);
  if (!t) {
    console.warn('缺失', file, p);
    continue;
  }
  writePng(path.join(OUT, file), t.w, t.h, t.data);
  common.icons[file] = { path: p, w: t.w, h: t.h };
}

// 时间指示器模型引用的贴图：扫描 MDX 内的 .blp 路径，原样导出到 /assets/wc3/<原路径>（供 mdx-m3-viewer 解析）
for (const race of RACES) {
  const skin = { ...D, ...(skins[race] || {}) };
  const f = skin.TimeOfDayIndicator ? getFile(skin.TimeOfDayIndicator.replace(/.mdl$/i, '.mdx')) : null;
  if (!f) continue;
  const text = f.bytes.toString('latin1');
  const texs = [...new Set(text.match(/[A-Za-z0-9_\-. ]+.blp/gi) || [])];
  manifest.races[race].timeIndicatorTextures = texs;
  for (const tp of texs) {
    const tf = getFile(tp);
    if (!tf) continue;
    const dst = path.join(ROOT, 'public/assets/wc3', tp.split('\').join('/'));
    if (!fs.existsSync(dst)) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, tf.bytes);
    }
  }
}
manifest.common = common;
manifest.mapSkin = { CustomSkin: custom, FrameDef: mapSkin['FrameDef'] || {} };
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log('九宫格：', Object.entries(common.nine).map(([k, v]) => k + (v ? ':' + v.size : ':缺失')).join(' '), '| 时间指示器贴图：', JSON.stringify(manifest.races.NightElf.timeIndicatorTextures));
console.log('OK →', OUT);
