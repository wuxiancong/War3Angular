/**
 * Build DotA 6.83d hero archive from map Unit*.slk + War3Bot heroes.json names.
 * Note: DotA stores STR/AGI/INT/Primary/gains inside UnitBalance.slk (not UnitData).
 */
const fs = require('fs');
const path = require('path');

function parseSlk(text) {
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
  const header = rows.get(1) || {};
  const col = {};
  for (const [xi, name] of Object.entries(header)) col[name] = +xi;
  const byId = new Map();
  const idCol =
    col.unitBalanceID || col.unitID || col.unitUIID || col.unitAbilID || col.unitWeaponID || 1;
  for (const [yy, r] of rows) {
    if (+yy === 1) continue;
    const id = r[idCol];
    if (!id || id.length !== 4) continue;
    const obj = { id };
    for (const [name, xi] of Object.entries(col)) {
      if (r[xi] != null && r[xi] !== '') obj[name] = r[xi];
    }
    byId.set(id, obj);
  }
  return { col, byId };
}

const root = path.join(__dirname, 'dota683d_heroes');
const balance = parseSlk(fs.readFileSync(path.join(root, 'Units_UnitBalance.slk'), 'utf8'));
const ui = parseSlk(fs.readFileSync(path.join(root, 'Units_UnitUI.slk'), 'utf8'));
const weapons = parseSlk(fs.readFileSync(path.join(root, 'Units_UnitWeapons.slk'), 'utf8'));
const names = JSON.parse(fs.readFileSync('D:/Qt/workspace/War3Bot/images/heroes.json', 'utf8'));
const heroIds = Object.keys(names).filter((k) => k);

function num(v, d = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
}

const primaryMap = { STR: 'str', AGI: 'agi', INT: 'int' };

const archive = {
  mapId: 'dota-6.83d',
  source: 'D:\\Maps\\DotA v6.83d.w3x Units\\Unit*.slk + War3Bot/images/heroes.json',
  formulas: {
    hp: 'baseHp(HP) + STR * 19',
    mp: 'prefer realM；否则 manaN + INT * 13',
    armor: 'baseArmor(def) + AGI * 0.14',
    damage: 'weaponBase + primaryAttribute (+ dice*sides for max)',
  },
  count: 0,
  heroes: [],
};

for (const id of heroIds) {
  const b = balance.byId.get(id) || {};
  const u = ui.byId.get(id) || {};
  const w = weapons.byId.get(id) || {};

  const strBase = num(b.STR, 0);
  const agiBase = num(b.AGI, 0);
  const intBase = num(b.INT, 0);
  const strGain = num(b.STRplus, 0);
  const agiGain = num(b.AGIplus, 0);
  const intGain = num(b.INTplus, 0);
  const primary = primaryMap[String(b.Primary || '').toUpperCase()] || 'agi';

  const baseHp = num(b.HP, 150);
  const baseMp = num(b.manaN, 0);
  const realHp = num(b.realHP, 0);
  const realMp = num(b.realM, 0);
  const mana0 = num(b.mana0, 0);
  const regenHp = num(b.regenHP, 0.25);
  const regenMana = num(b.regenMana, 0.01);
  const baseArmor = num(b.def, 0);
  const moveSpeed = num(b.spd, 300);

  const attackDmg1 = num(w.dmgplus1, 0);
  const attackDice = num(w.dice1, 1);
  const attackSides = num(w.sides1, 1);
  const range = num(w.rangeN1, 100);
  const cool1 = num(w.cool1, 1.7);

  const hp1 = Math.round(baseHp + strBase * 19);
  const mp1 = realMp > 0 ? Math.round(realMp) : Math.round(baseMp + intBase * 13);
  const armor1 = Math.round((baseArmor + agiBase * 0.14) * 10) / 10;
  const primary1 = primary === 'str' ? strBase : primary === 'int' ? intBase : agiBase;
  const dmgMin1 = Math.round(attackDmg1 + primary1);
  const dmgMax1 = Math.round(attackDmg1 + attackDice * attackSides + primary1);

  archive.heroes.push({
    id,
    name: names[id].name,
    icon: names[id].icon || '',
    primary,
    attackType: range > 128 ? 'ranged' : 'melee',
    modelFile: String(u.file || ''),
    modelScale: num(u.modelScale, 1),
    strBase,
    agiBase,
    intBase,
    strGain,
    agiGain,
    intGain,
    baseHp,
    realHp,
    baseMp,
    realMp,
    mana0,
    regenHp,
    regenMana,
    baseArmor,
    moveSpeed,
    attackDmgBase: attackDmg1,
    attackDice,
    attackSides,
    attackRange: range,
    attackCooldown: cool1,
    hpLevel1: hp1,
    mpLevel1: mp1,
    armorLevel1: armor1,
    damageMinLevel1: dmgMin1,
    damageMaxLevel1: dmgMax1,
  });
}

archive.count = archive.heroes.length;
archive.heroes.sort((a, b) => a.name.localeCompare(b.name, 'zh'));

const outDir = 'D:/Qt/workspace/War3Angular/public/assets/maps/dota683';
fs.mkdirSync(outDir, { recursive: true });
const outJson = path.join(outDir, 'heroes-archive.json');
fs.writeFileSync(outJson, JSON.stringify(archive, null, 2) + '\n');

const lines = [
  `# DotA 6.83d 英雄列表（${archive.count}）`,
  '',
  '数据来源：`D:\\Maps\\DotA v6.83d.w3x` 的 `Units\\UnitBalance.slk` / `UnitUI.slk` / `UnitWeapons.slk`，中文名对齐 `War3Bot/images/heroes.json`。',
  '',
  '完整数值档案：`heroes-archive.json`（初始三维、成长、生命/魔法、攻速射程、1 级推导面板等）。',
  '',
  '| # | 代码 | 中文名 | 主属性 | 攻击 | 力量 | 敏捷 | 智力 | 力成长 | 敏成长 | 智成长 | 1级生命 | 1级魔法 | 移速 |',
  '|---|------|--------|--------|------|------|------|------|--------|--------|--------|---------|---------|------|',
];
archive.heroes.forEach((h, i) => {
  lines.push(
    `| ${i + 1} | \`${h.id}\` | ${h.name} | ${h.primary} | ${h.attackType} | ${h.strBase} | ${h.agiBase} | ${h.intBase} | ${h.strGain} | ${h.agiGain} | ${h.intGain} | ${h.hpLevel1} | ${h.mpLevel1} | ${h.moveSpeed} |`
  );
});
fs.writeFileSync(path.join(outDir, 'heroes-list.md'), lines.join('\n') + '\n');

const missing = archive.heroes.filter((h) => !h.strBase && !h.agiBase && !h.intBase);
console.log('heroes', archive.count, 'missingAttrs', missing.length);
console.log('Juggernaut', archive.heroes.find((h) => h.id === 'Nbbc'));
if (missing.length) console.log('missing', missing.map((h) => h.id + ':' + h.name).join(', '));
