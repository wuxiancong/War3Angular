const fs = require('fs');
const arch = JSON.parse(
  fs.readFileSync('D:/Qt/workspace/War3Angular/public/assets/maps/dota683/heroes-archive.json', 'utf8')
);
const map = {};
for (const h of arch.heroes) {
  map[h.id] = {
    name: h.name,
    primary: h.primary,
    attackType: h.attackType,
    strBase: h.strBase,
    agiBase: h.agiBase,
    intBase: h.intBase,
    strGain: h.strGain,
    agiGain: h.agiGain,
    intGain: h.intGain,
    baseHp: h.baseHp,
    baseMp: h.baseMp,
    realMp: h.realMp,
    mana0: h.mana0,
    regenHp: h.regenHp,
    regenMana: h.regenMana,
    baseArmor: h.baseArmor,
    moveSpeed: h.moveSpeed,
    attackDmgBase: h.attackDmgBase,
    attackDice: h.attackDice,
    attackSides: h.attackSides,
    attackRange: h.attackRange,
    attackCooldown: h.attackCooldown,
    hpLevel1: h.hpLevel1,
    mpLevel1: h.mpLevel1,
    modelFile: h.modelFile,
  };
}

const body = `/* Auto-generated from DotA v6.83d UnitBalance.slk — do not hand-edit.
 * Source map: D:\\\\Maps\\\\DotA v6.83d.w3x
 * Regenerate: node scratch/build-hero-archive.js && node scratch/gen-hero-ts.js
 */
export type DotaHeroPrimary = 'str' | 'agi' | 'int';

export interface DotaHeroStats {
  name: string;
  primary: DotaHeroPrimary;
  attackType: 'melee' | 'ranged';
  strBase: number;
  agiBase: number;
  intBase: number;
  strGain: number;
  agiGain: number;
  intGain: number;
  baseHp: number;
  baseMp: number;
  realMp: number;
  mana0: number;
  regenHp: number;
  regenMana: number;
  baseArmor: number;
  moveSpeed: number;
  attackDmgBase: number;
  attackDice: number;
  attackSides: number;
  attackRange: number;
  attackCooldown: number;
  hpLevel1: number;
  mpLevel1: number;
  modelFile: string;
}

export const DOTA_HERO_STATS: Record<string, DotaHeroStats> = ${JSON.stringify(map, null, 2)};

export const DOTA_HERO_COUNT = ${arch.count};

export function getDotaHeroStats(code: string): DotaHeroStats | undefined {
  if (!code) return undefined;
  return DOTA_HERO_STATS[code] || DOTA_HERO_STATS[code.toUpperCase()] || DOTA_HERO_STATS[code.toLowerCase()];
}

/** 按等级计算三维属性（不含物品/属性附加） */
export function heroAttrsAtLevel(s: DotaHeroStats, level: number) {
  const lv = Math.max(1, Math.min(25, level | 0));
  const str = s.strBase + (lv - 1) * s.strGain;
  const agi = s.agiBase + (lv - 1) * s.agiGain;
  const int = s.intBase + (lv - 1) * s.intGain;
  const hp = Math.round(s.baseHp + str * 19);
  const mp =
    s.realMp > 0
      ? Math.round(s.realMp + (int - s.intBase) * 13)
      : Math.round(s.baseMp + int * 13);
  const armor = Math.round((s.baseArmor + agi * 0.14) * 10) / 10;
  const primary = s.primary === 'str' ? str : s.primary === 'int' ? int : agi;
  return { str, agi, int, hp, mp, armor, primary };
}
`;

fs.writeFileSync('D:/Qt/workspace/War3Angular/src/app/replay3d/dota-heroes-archive.ts', body);
console.log('wrote dota-heroes-archive.ts', Object.keys(map).length);
