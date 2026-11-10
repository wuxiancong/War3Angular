/**
 * 从 DotA v6.83d.w3x（SLK 优化图）直接导出网页对战所需的玩法数据表。
 *
 * 数据来源（均在地图 MPQ 内，按标准路径名哈希命中，无需 listfile）：
 *   war3mapMisc.txt            —— DotA 覆盖的游戏常量（护甲/攻击类型克制表、经验表、三围系数）
 *   Units\UnitBalance.slk      —— 生命/护甲/移速/三围/赏金
 *   Units\UnitWeapons.slk      —— 攻击间隔/前摇/伤害骰子/射程/攻击类型
 *   Units\UnitUI.slk           —— 模型路径/缩放
 *   Units\UnitData.slk         —— 转身速度等
 *   Units\AbilityData.slk      —— 技能逐级 冷却/耗蓝/射程/范围/持续/DataA..D 与基类 code
 *   Units\ItemData.slk         —— 物品价格/技能列表/使用次数
 *   Units\*Func.txt/*Strings.txt —— 中文名称、提示文本、图标、弹道、商店货架(Sellunits)
 * 另读 War3Bot/images/dota_data.json（商店单位码 → 真实物品码、合成表、英雄技能槽位）。
 *
 * 用法: node scripts/build-gameplay-data.cjs ["D:/Maps/DotA v6.83d.w3x"]
 * 输出: public/assets/dota/gameplay-data.json
 */
const fs = require('fs');
const path = require('path');
const MpqArchive = require('../node_modules/mdx-m3-viewer/dist/cjs/parsers/mpq/archive.js').default;

const MAP_PATH = process.argv[2] || 'D:/Maps/DotA v6.83d.w3x';
const BOT_DATA = 'D:/Qt/workspace/War3Bot/images/dota_data.json';
const BOT_HEROES = 'D:/Qt/workspace/War3Bot/images/heroes.json';
const BUILDINGS = path.join(__dirname, '../public/assets/maps/dota683/buildings.json');
const OUT = path.join(__dirname, '../public/assets/dota/gameplay-data.json');

// ---------- MPQ ----------
const buf = fs.readFileSync(MAP_PATH);
const mpq = new MpqArchive();
mpq.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), true);
function mpqText(name, enc = 'utf8') {
  const f = mpq.get(name.split('/').join('\\'));
  if (!f) return '';
  return Buffer.from(f.bytes()).toString(enc);
}

// ---------- 解析器 ----------
function parseSlk(text) {
  const rows = [];
  let y = 0;
  let x = 0;
  for (const line of text.split(/\r?\n/)) {
    if (line[0] !== 'C') continue;
    let v;
    for (const q of line.split(';').slice(1)) {
      if (q[0] === 'X') x = +q.slice(1);
      else if (q[0] === 'Y') y = +q.slice(1);
      else if (q[0] === 'K') v = q.slice(1);
    }
    if (v === undefined) continue;
    if (v[0] === '"') v = v.slice(1, -1);
    (rows[y] = rows[y] || [])[x] = v;
  }
  const head = rows[1] || [];
  const table = {};
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[1]) continue;
    const o = {};
    head.forEach((k, j) => {
      if (k && r[j] !== undefined && r[j] !== '-' && r[j] !== '_' && r[j] !== '') o[k] = r[j];
    });
    table[r[1]] = o;
  }
  return table;
}
function parseProfile(text, into) {
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('//')) continue;
    const h = s.match(/^\[(.+)\]$/);
    if (h) {
      cur = into[h[1]] = into[h[1]] || {};
      continue;
    }
    const i = s.indexOf('=');
    if (i > 0 && cur) cur[s.slice(0, i)] = s.slice(i + 1);
  }
  return into;
}
const num = (v, d = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};
/** 拆分「a,b,"c,d"」形式的多级字符串 */
function splitLevels(s) {
  if (!s) return [];
  const out = [];
  let cur = '';
  let q = false;
  for (const ch of s) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}
/** 去除 WC3 颜色码，|n 转换行 */
function cleanText(s) {
  return String(s || '')
    .replace(/\|c[0-9a-fA-F]{8}/g, '')
    .replace(/\|r/g, '')
    .replace(/\|n/g, '\n')
    .trim();
}

// ---------- 读表 ----------
const UB = parseSlk(mpqText('Units/UnitBalance.slk', 'latin1'));
const UW = parseSlk(mpqText('Units/UnitWeapons.slk', 'latin1'));
const UU = parseSlk(mpqText('Units/UnitUI.slk', 'latin1'));
const UD = parseSlk(mpqText('Units/UnitData.slk', 'latin1'));
const UA = parseSlk(mpqText('Units/UnitAbilities.slk', 'latin1'));
const AD = parseSlk(mpqText('Units/AbilityData.slk', 'latin1'));
const ID = parseSlk(mpqText('Units/ItemData.slk', 'latin1'));

const PROF = {};
const RACES = ['Campaign', 'Human', 'Orc', 'Undead', 'NightElf', 'Neutral'];
for (const r of RACES) {
  for (const k of ['UnitFunc', 'UnitStrings', 'AbilityFunc', 'AbilityStrings']) {
    parseProfile(mpqText(`Units/${r}${k}.txt`), PROF);
  }
}
for (const k of ['ItemFunc', 'ItemStrings', 'ItemAbilityFunc', 'ItemAbilityStrings', 'CommonAbilityFunc', 'CommonAbilityStrings']) {
  parseProfile(mpqText(`Units/${k}.txt`), PROF);
}
const MISC = parseProfile(mpqText('war3mapMisc.txt'), {})['Misc'] || {};

const bot = JSON.parse(fs.readFileSync(BOT_DATA, 'utf8'));
const botHeroes = JSON.parse(fs.readFileSync(BOT_HEROES, 'utf8'));
const buildingsCfg = JSON.parse(fs.readFileSync(BUILDINGS, 'utf8'));

// ---------- 常量 ----------
const list = (k) => String(MISC[k] || '').split(',').map((v) => num(v));
const constants = {
  // 1.26 MiscGame.txt 基准值，DotA war3mapMisc.txt 未覆盖 DefenseArmor
  defenseArmor: 0.06,
  strHp: num(MISC.StrHitPointBonus, 19),
  strRegen: num(MISC.StrRegenBonus, 0.03),
  intMana: num(MISC.IntManaBonus, 13),
  intRegen: num(MISC.IntRegenBonus, 0.04),
  agiArmor: num(MISC.AgiDefenseBonus, 0.14),
  agiArmorBase: num(MISC.AgiDefenseBase, -1),
  agiAttackSpeed: num(MISC.AgiAttackSpeedBonus, 0.01),
  strAttackBonus: 1,
  maxUnitSpeed: num(MISC.MaxUnitSpeed, 522),
  minUnitSpeed: num(MISC.MinUnitSpeed, 100),
  maxHeroLevel: num(MISC.MaxHeroLevel, 25),
  chanceToMissUphill: 0.25,
  dayLength: num(MISC.DayLength, 300),
  needHeroXP: list('NeedHeroXP'),
  // 伤害类型 × 护甲类型：列顺序 small,medium,large,fort,normal,hero,divine,none
  armorOrder: ['small', 'medium', 'large', 'fort', 'normal', 'hero', 'divine', 'none'],
  damageTable: {
    normal: list('DamageBonusNormal'),
    pierce: list('DamageBonusPierce'),
    siege: list('DamageBonusSiege'),
    magic: list('DamageBonusMagic'),
    chaos: list('DamageBonusChaos'),
    spells: [1, 1, 1, 1, 1, 0.75, 0.05, 1],
    hero: [1, 1, 1, 0.5, 1, 1, 0.05, 1],
  },
  // 以下取自 war3map.j（见分析文档行号）
  creepWaveIntervalSec: 30,
  creepSiegeEveryNWaves: 7,
  creepMeleeCount: 3,
  creepRangedCount: 1,
  creepMeleeExtraAtSec: [999, 1999, 2999],
  creepRangedExtraAtSec: [2699],
  creepUpgradeIntervalSec: 450,
  neutralSpawnIntervalSec: 60,
  runeIntervalSec: 120,
};

// ---------- 单位 ----------
function unitRecord(id) {
  const b = UB[id];
  if (!b) return null;
  const w = UW[id] || {};
  const u = UU[id] || {};
  const d = UD[id] || {};
  const p = PROF[id] || {};
  const hasAtk = num(w.weapsOn) > 0 && w.cool1 !== undefined;
  return {
    id,
    name: cleanText(splitLevels(p.Name)[0] || u.name || id),
    hp: num(b.HP),
    hpRegen: num(b.regenHP),
    mana: num(b.manaN),
    manaRegen: num(b.regenMana),
    armor: num(b.def),
    armorType: b.defType || 'none',
    speed: num(b.spd),
    level: num(b.level),
    sight: num(b.sight, 1800),
    nsight: num(b.nsight, 800),
    collision: num(b.collision, 16),
    isBuilding: num(b.isbldg) === 1,
    bounty: [num(b.bountydice), num(b.bountysides), num(b.bountyplus)],
    turnRate: num(d.turnRate, 0.5),
    moveType: d.movetp || 'foot',
    atk: hasAtk
      ? {
          type: w.atkType1 || 'normal',
          weapon: w.weapTp1 || 'normal',
          cool: num(w.cool1, 1.7),
          base: num(w.dmgplus1),
          dice: num(w.dice1, 1),
          sides: num(w.sides1, 1),
          range: num(w.rangeN1, 100),
          acquire: num(w.acquire, 500),
          point: num(w.dmgpt1, 0.3),
          backswing: num(w.backSw1, 0.3),
          missileSpeed: num(splitLevels(p.Missilespeed)[0], 900),
          missileArt: splitLevels(p.Missileart)[0] || '',
          targets: w.targs1 || '',
        }
      : null,
    model: (u.file || '').replace(/\.md[lx]$/i, ''),
    scale: num(u.modelScale, 1),
    art: p.Art || '',
    abilities: String((UA[id] || {}).abilList || '').split(',').filter(Boolean),
  };
}

// ---------- 技能 ----------
function abilityRecord(code) {
  const a = AD[code];
  if (!a) return null;
  const p = PROF[code] || {};
  const levels = Math.max(1, num(a.levels, 1));
  const per = (k, asStr = false) => {
    const arr = [];
    for (let i = 1; i <= Math.min(levels, 4); i++) arr.push(asStr ? a[k + i] || '' : num(a[k + i]));
    return arr;
  };
  const tips = splitLevels(p.Tip).map(cleanText);
  const uber = splitLevels(p.Ubertip).map(cleanText);
  const pos = String(p.Buttonpos || '0,0').split(',').map((v) => num(v));
  return {
    code,
    base: a.code || '',
    name: cleanText((tips[0] || p.Name || code).replace(/\[.*$/, '')),
    enName: cleanText(p.Name || ''),
    hotkey: splitLevels(p.Hotkey)[0] || '',
    levels,
    reqLevel: num(a.reqLevel, 1),
    levelSkip: num(a.levelSkip, 2),
    isHeroAbility: num(a.hero) === 1,
    targs: a.targs1 || '',
    cool: per('Cool'),
    cost: per('Cost'),
    range: per('Rng'),
    area: per('Area'),
    dur: per('Dur'),
    heroDur: per('HeroDur'),
    cast: per('Cast'),
    dataA: per('DataA'),
    dataB: per('DataB'),
    dataC: per('DataC'),
    dataD: per('DataD'),
    buff: per('BuffID', true),
    order: p.Order || '',
    pos,
    art: p.Art || '',
    missileArt: splitLevels(p.Missileart)[0] || '',
    missileSpeed: num(splitLevels(p.Missilespeed)[0]),
    tip: cleanText(p.Researchubertip || ''),
    ubertip: uber,
  };
}

// ---------- 英雄 ----------
const heroes = {};
const abilities = {};
for (const code of Object.keys(bot.heroes || {})) {
  const base = unitRecord(code);
  if (!base) continue;
  const b = UB[code];
  const p = PROF[code] || {};
  const skills = [];
  for (const s of bot.heroes[code].skills || []) {
    if (!s.code || s.isExtra) continue;
    const ab = abilityRecord(s.code);
    if (!ab) continue;
    ab.name = s.name || ab.name;
    ab.hotkey = s.hotkey || ab.hotkey;
    abilities[s.code] = ab;
    skills.push(s.code);
  }
  heroes[code] = {
    ...base,
    name: bot.heroes[code].name || base.name,
    proper: cleanText(splitLevels(p.Propernames)[0] || ''),
    primary: String(b.Primary || 'STR').toLowerCase(),
    str: num(b.STR),
    agi: num(b.AGI),
    int: num(b.INT),
    strGain: num(b.STRplus),
    agiGain: num(b.AGIplus),
    intGain: num(b.INTplus),
    icon: (botHeroes[code] || {}).icon || '',
    desc: cleanText(p.Ubertip || ''),
    skills,
  };
}

// ---------- 物品 ----------
/** 被动加成按技能基类 code 归并；Aspb(魔法书) 递归展开 DataA 列表 */
function addBonus(bonus, abilCode, depth = 0) {
  const a = AD[abilCode];
  if (!a || depth > 3) return;
  const A = num(a.DataA1);
  const B = num(a.DataB1);
  const C = num(a.DataC1);
  const add = (k, v) => {
    if (v) bonus[k] = Math.round(((bonus[k] || 0) + v) * 1000) / 1000;
  };
  switch (a.code) {
    case 'AIab':
      add('agi', A);
      add('int', B);
      add('str', C);
      break;
    case 'AIat':
    case 'AIaa':
      add('dmg', A);
      break;
    case 'AIde':
    case 'AIdd':
      add('armor', A);
      break;
    case 'Arel':
      add('hpRegen', A);
      break;
    case 'AIas':
      add('attackSpeed', A);
      break;
    case 'AIrm':
      add('manaRegenPct', A);
      break;
    case 'AIml':
      add('hp', A);
      break;
    case 'AImm':
      add('mana', A);
      break;
    case 'AIms':
      add('moveSpeed', A);
      break;
    case 'AIva':
      add('lifesteal', A);
      break;
    case 'AEev':
      add('evasion', A);
      break;
    case 'AOcr':
      bonus.critChance = Math.max(bonus.critChance || 0, A);
      bonus.critMult = Math.max(bonus.critMult || 0, B);
      break;
    case 'AHbh':
      bonus.bashChance = Math.max(bonus.bashChance || 0, A);
      bonus.bashDmg = Math.max(bonus.bashDmg || 0, C);
      bonus.bashDur = Math.max(bonus.bashDur || 0, num(a.HeroDur1, 1));
      break;
    case 'Aspb':
      for (const sub of String(a.DataA1 || '').split(',')) addBonus(bonus, sub.trim(), depth + 1);
      break;
    default:
      break;
  }
}

const items = {};
function itemRecord(realCode) {
  if (items[realCode]) return items[realCode];
  const r = ID[realCode];
  if (!r) return null;
  const p = PROF[realCode] || {};
  const botItem = bot.items[realCode] || {};
  const bonus = {};
  const abil = String(r.abilList || '').split(',').filter(Boolean);
  for (const ab of abil) addBonus(bonus, ab);
  // 主动技能：取第一个带冷却的非被动技能
  let active = null;
  for (const ab of abil) {
    const a = AD[ab];
    if (!a) continue;
    if (num(a.Cool1) > 0 && ['ANcl', 'AEbl', 'AIrg', 'AOwk', 'AImr', 'Aprg', 'AEfk', 'AHbz'].includes(a.code)) {
      active = { code: ab, base: a.code, cool: num(a.Cool1), cost: num(a.Cost1), range: num(a.Rng1), dataA: num(a.DataA1) };
      break;
    }
  }
  const nameRaw = cleanText(p.Name || botItem.name || realCode);
  const rec = {
    code: realCode,
    name: botItem.name || nameRaw.split('\n')[0],
    enName: nameRaw.split('\n')[1] || '',
    cost: num(r.goldcost, botItem.cost || 0),
    kind: botItem.type || 'normal',
    uses: num(r.uses),
    stackable: !!botItem.stackable,
    bonus,
    active,
    desc: cleanText(p.Ubertip || ''),
    art: p.Art || '',
  };
  items[realCode] = rec;
  return rec;
}

// 商店：Sellunits 为「商店占位单位」(h0xx)，经 dota_data.items[shopCode].realCode 映射到真实物品
const shops = [];
const taverns = [];
const buildingIds = new Set(buildingsCfg.buildings.map((b) => b.unitId).filter(Boolean));
for (const id of Object.keys(PROF)) {
  const p = PROF[id];
  if (!p.Sellunits) continue;
  const sells = p.Sellunits.split(',').filter(Boolean);
  if (sells.every((c) => heroes[c] || /^[A-Z]/.test(c))) {
    const hs = sells.filter((c) => heroes[c]);
    if (hs.length) taverns.push({ id, name: cleanText(p.Name), heroes: hs });
    continue;
  }
  const stock = [];
  for (const sc of sells) {
    const bi = bot.items[sc];
    if (!bi || !bi.realCode) continue;
    const it = itemRecord(bi.realCode);
    if (it && !stock.includes(it.code)) stock.push(it.code);
  }
  if (stock.length >= 4) shops.push({ id, name: cleanText(p.Name), items: stock, onMap: buildingIds.has(id) });
}

// 合成表：只保留成品与材料均可解析的配方
const recipes = [];
const seenRecipe = new Set();
for (const r of Object.values(bot.recipes || {})) {
  const key = r.result + '<' + [...r.components].sort().join('+');
  if (seenRecipe.has(key)) continue;
  seenRecipe.add(key);
  const res = itemRecord(r.result);
  const comps = r.components.map((c) => itemRecord(c));
  if (!res || comps.some((c) => !c)) continue;
  recipes.push({ result: r.result, components: r.components });
}

// ---------- 兵线 / 建筑 / 野怪 ----------
const units = {};
const laneCreeps = {
  sentinel: { melee: 'esen', ranged: 'edry', siege: 'ebal', megaMelee: 'e00V', megaRanged: 'e00W', megaSiege: 'e026' },
  scourge: { melee: 'ugho', ranged: 'unec', siege: 'umtw', megaMelee: 'u001', megaRanged: 'u002', megaSiege: 'u00R' },
};
for (const side of Object.values(laneCreeps)) for (const id of Object.values(side)) units[id] = unitRecord(id);
for (const id of buildingIds) {
  const u = unitRecord(id);
  if (u) units[id] = u;
}
// 野怪池：UnitData.race=creeps 且有赏金、非建筑、有攻击，按等级归档（营地构成由引擎按档位抽取）
const neutrals = [];
for (const id of Object.keys(UB)) {
  if (units[id] || heroes[id]) continue;
  const d = UD[id] || {};
  if (d.race !== 'creeps') continue;
  const u = unitRecord(id);
  if (!u || !u.atk || u.isBuilding || !u.model || u.hp < 200 || u.bounty[2] <= 0 || !u.speed) continue;
  if (!/^n/.test(id)) continue;
  if (/^Custom_/.test(u.name) || /^n[0-9A-Z]{3}$/.test(u.name)) continue;
  units[id] = u;
  neutrals.push(id);
}

const out = {
  meta: {
    map: path.basename(MAP_PATH),
    generatedBy: 'scripts/build-gameplay-data.cjs',
    note: '由地图内 SLK / Profile 文本自动导出，请勿手改；重跑脚本即可再生成。',
  },
  constants,
  heroes,
  abilities,
  items,
  recipes,
  shops,
  taverns,
  laneCreeps,
  neutrals,
  units,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(
  `OK ${OUT}\n heroes=${Object.keys(heroes).length} abilities=${Object.keys(abilities).length} items=${Object.keys(items).length}` +
    ` recipes=${recipes.length} shops=${shops.length} taverns=${taverns.length} units=${Object.keys(units).length} neutrals=${neutrals.length}` +
    ` size=${(fs.statSync(OUT).size / 1024).toFixed(0)}KB`
);
