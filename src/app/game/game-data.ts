/**
 * 网页对战玩法数据：类型定义 + 加载器 + 技能效果解析。
 * 数据文件 /assets/dota/gameplay-data.json 由 scripts/build-gameplay-data.cjs 从 DotA v6.83d.w3x 的 SLK 导出。
 */

export interface AttackDef {
  type: string; // normal / pierce / siege / magic / chaos / hero
  weapon: string; // normal(近战) / missile / msplash / artillery / instant
  cool: number;
  base: number;
  dice: number;
  sides: number;
  range: number;
  acquire: number;
  point: number; // 攻击前摇（伤害点）
  backswing: number;
  missileSpeed: number;
  missileArt: string;
  targets: string;
}

export interface UnitDef {
  id: string;
  name: string;
  hp: number;
  hpRegen: number;
  mana: number;
  manaRegen: number;
  armor: number;
  armorType: string;
  speed: number;
  level: number;
  sight: number;
  nsight: number;
  collision: number;
  isBuilding: boolean;
  bounty: [number, number, number];
  turnRate: number;
  moveType: string;
  atk: AttackDef | null;
  model: string;
  scale: number;
  art: string;
  abilities: string[];
}

export interface HeroDef extends UnitDef {
  proper: string;
  primary: 'str' | 'agi' | 'int';
  str: number;
  agi: number;
  int: number;
  strGain: number;
  agiGain: number;
  intGain: number;
  icon: string;
  desc: string;
  skills: string[];
}

export interface AbilityDef {
  code: string;
  base: string;
  name: string;
  enName: string;
  hotkey: string;
  levels: number;
  reqLevel: number;
  levelSkip: number;
  targs: string;
  cool: number[];
  cost: number[];
  range: number[];
  area: number[];
  dur: number[];
  heroDur: number[];
  cast: number[];
  dataA: number[];
  dataB: number[];
  dataC: number[];
  dataD: number[];
  order: string;
  pos: number[];
  art: string;
  missileArt: string;
  missileSpeed: number;
  tip: string;
  ubertip: string[];
}

export interface ItemBonus {
  str?: number;
  agi?: number;
  int?: number;
  dmg?: number;
  armor?: number;
  hp?: number;
  mana?: number;
  hpRegen?: number;
  manaRegenPct?: number;
  attackSpeed?: number;
  moveSpeed?: number;
  lifesteal?: number;
  evasion?: number;
  critChance?: number;
  critMult?: number;
  bashChance?: number;
  bashDmg?: number;
  bashDur?: number;
}

export interface ItemDef {
  code: string;
  name: string;
  enName: string;
  cost: number;
  kind: string; // normal / recipe / consumable / tp / blink / travel / force
  uses: number;
  stackable: boolean;
  bonus: ItemBonus;
  active: { code: string; base: string; cool: number; cost: number; range: number; dataA: number } | null;
  desc: string;
  art: string;
}

export interface GameConstants {
  defenseArmor: number;
  strHp: number;
  strRegen: number;
  intMana: number;
  intRegen: number;
  agiArmor: number;
  agiArmorBase: number;
  agiAttackSpeed: number;
  maxUnitSpeed: number;
  minUnitSpeed: number;
  maxHeroLevel: number;
  needHeroXP: number[];
  armorOrder: string[];
  damageTable: Record<string, number[]>;
  creepWaveIntervalSec: number;
  creepSiegeEveryNWaves: number;
  creepMeleeCount: number;
  creepRangedCount: number;
  creepMeleeExtraAtSec: number[];
  creepRangedExtraAtSec: number[];
  creepUpgradeIntervalSec: number;
  neutralSpawnIntervalSec: number;
  runeIntervalSec: number;
}

export interface LaneCreepSet {
  melee: string;
  ranged: string;
  siege: string;
  megaMelee: string;
  megaRanged: string;
  megaSiege: string;
}

export interface GameplayData {
  meta: { map: string; note: string };
  constants: GameConstants;
  heroes: Record<string, HeroDef>;
  abilities: Record<string, AbilityDef>;
  items: Record<string, ItemDef>;
  recipes: { result: string; components: string[] }[];
  shops: { id: string; name: string; items: string[]; onMap: boolean }[];
  taverns: { id: string; name: string; heroes: string[] }[];
  laneCreeps: { sentinel: LaneCreepSet; scourge: LaneCreepSet };
  neutrals: string[];
  units: Record<string, UnitDef>;
}

export interface PathingData {
  cell: number;
  width: number;
  height: number;
  x0: number;
  y0: number;
  rle: number[];
}

let cached: Promise<GameplayData> | null = null;
export function loadGameplayData(): Promise<GameplayData> {
  if (!cached) {
    cached = fetch('/assets/dota/gameplay-data.json').then((r) => {
      if (!r.ok) throw new Error('玩法数据加载失败，请先运行 node scripts/build-gameplay-data.cjs');
      return r.json() as Promise<GameplayData>;
    });
    cached.catch(() => (cached = null));
  }
  return cached;
}

export async function loadPathingData(): Promise<PathingData> {
  const r = await fetch('/assets/maps/dota683/pathing.json');
  if (!r.ok) throw new Error('寻路栅格加载失败，请先运行 node scripts/build-pathing.cjs');
  return (await r.json()) as PathingData;
}

// ---------------------------------------------------------------------------
// 技能效果解析：SLK 基类字段优先；ANcl(Channel) 等脚本技能回退到中文提示文本数值
// ---------------------------------------------------------------------------

export type AbilityTarget = 'none' | 'unit' | 'point' | 'passive';

export interface AbilityFx {
  target: AbilityTarget;
  /** 目标为友方（治疗类） */
  ally: boolean;
  dmg: number[];
  stun: number[];
  slowPct: number[];
  heal: number[];
  aoe: number[];
  blink: boolean;
  /** 被动：按基类映射到通用加成 */
  passive: {
    critChance?: number[];
    critMult?: number[];
    evasion?: number[];
    bashChance?: number[];
    bashDmg?: number[];
    bashDur?: number[];
    auraDmgPct?: number[];
    auraArmor?: number[];
    auraMovePct?: number[];
    auraAttackSpeed?: number[];
    lifesteal?: number[];
  } | null;
  /** false 表示效果完全由 war3map.j 触发器实现且无法从数据还原，网页端仅扣蓝进冷却 */
  implemented: boolean;
}

/** 基类 → 目标方式（非 ANcl） */
const BASE_TARGET: Record<string, AbilityTarget> = {
  AHtb: 'unit', AOcl: 'unit', AUfn: 'unit', ANfl: 'unit', AEsh: 'unit', ANfd: 'unit', AHhb: 'unit', AOhw: 'unit',
  AEer: 'unit', ANso: 'unit', ANdr: 'unit', AUdc: 'unit', ANab: 'unit', AOhx: 'unit', AHpm: 'unit', ACfb: 'unit',
  ANfb: 'unit', AUsl: 'unit', ANsi: 'unit', ANcr: 'unit', AOlb: 'unit', ANlb: 'unit', ANms: 'unit', AHdr: 'unit',
  AOsh: 'point', AHbz: 'point', AUcs: 'point', AHfs: 'point', AUim: 'point', ANbf: 'point', AEbl: 'point',
  ANrf: 'point', ANcs: 'point', ANsg: 'point', AEsf: 'point', ANvc: 'point', AHfa: 'point', ANmo: 'point',
  ANht: 'point', ACbf: 'point', ACsh: 'point', ACcs: 'point', ANbl: 'point', ANin: 'point', AOeq: 'point',
  AHtc: 'none', AOws: 'none', AEfk: 'none', AOwk: 'none', ANbr: 'none', AOre: 'none', AEim: 'none', ANst: 'none',
  AOmi: 'none', AHav: 'none', AHds: 'none', AEme: 'none', ANch: 'none', ANta: 'none', AEtq: 'none', AUan: 'none',
  ANrg: 'none', AOvd: 'none', ANef: 'none', ANmf: 'none', ANic: 'none', ANwm: 'none',
};
const PASSIVE_BASES = new Set([
  'AOcr', 'AEev', 'AHbh', 'ACac', 'AOac', 'AHad', 'AOae', 'AUav', 'AEar', 'AHab', 'AUau', 'AEah', 'ANca', 'AOr2',
  'AHca', 'ANic', 'AUts', 'ANpi', 'Assk', 'ANdb', 'ACct', 'AIcd', 'Apiv', 'AOre', 'ANr2', 'ACbh', 'ACev', 'ACce',
  'ANdo', 'ANia', 'Aamk', 'AIaa', 'AIab', 'ANak', 'ANfa', 'ANss', 'ANth', 'ACsk', 'ANba',
]);

function firstNum(text: string, patterns: RegExp[]): number {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return parseFloat(m[1]);
  }
  return 0;
}

/** 从「等级 n - ……」学习提示中取第 n 级描述 */
function levelLines(tip: string): string[] {
  const out: string[] = [];
  for (const line of tip.split('\n')) {
    const m = line.match(/^等级\s*(\d+)\s*[-－—]\s*(.*)$/);
    if (m) out[parseInt(m[1], 10) - 1] = m[2];
  }
  return out;
}

const fxCache = new Map<string, AbilityFx>();

export function resolveAbilityFx(ab: AbilityDef): AbilityFx {
  const hit = fxCache.get(ab.code);
  if (hit) return hit;
  const n = Math.min(ab.levels, 4) || 1;
  const lines = levelLines(ab.tip);
  const text = (i: number) => `${ab.ubertip[i] || ''}\n${lines[i] || ''}`;
  const fx: AbilityFx = {
    target: 'none',
    ally: false,
    dmg: [],
    stun: [],
    slowPct: [],
    heal: [],
    aoe: [],
    blink: ab.base === 'AEbl',
    passive: null,
    implemented: true,
  };

  // ---- 目标方式 ----
  const targs = ab.targs;
  if (ab.base === 'ANcl') {
    // Channel：DataB = 目标类型 0 无 / 1 单位 / 2 点 / 3 单位或点
    const tt = ab.dataB[0] | 0;
    fx.target = tt === 1 || tt === 3 ? 'unit' : tt === 2 ? 'point' : 'none';
    if (fx.target === 'none' && !ab.cool[0] && !ab.cost[0]) fx.target = 'passive';
  } else if (PASSIVE_BASES.has(ab.base)) {
    fx.target = 'passive';
  } else if (BASE_TARGET[ab.base]) {
    fx.target = BASE_TARGET[ab.base];
  } else if (!ab.cool[0] && !ab.cost[0] && !ab.range[0]) {
    fx.target = 'passive';
  } else if (ab.range[0] > 0) {
    fx.target = ab.area[0] > 0 && !/enem|friend|hero|organic/.test(targs) ? 'point' : 'unit';
  }
  fx.ally = /friend|allies|self/.test(targs) && !/enem/.test(targs);

  // ---- 被动映射 ----
  if (fx.target === 'passive') {
    const A = ab.dataA;
    const B = ab.dataB;
    const C = ab.dataC;
    switch (ab.base) {
      case 'AOcr':
      case 'ACct':
        fx.passive = { critChance: A.map((v) => v / 100), critMult: B };
        break;
      case 'AEev':
      case 'ACev':
        fx.passive = { evasion: A };
        break;
      case 'AHbh':
      case 'ACbh':
        fx.passive = { bashChance: A.map((v) => v / 100), bashDmg: C, bashDur: ab.heroDur.map((v) => v || 1) };
        break;
      case 'ACac':
      case 'AOac':
      case 'AEar':
        fx.passive = { auraDmgPct: A };
        break;
      case 'AHad':
        fx.passive = { auraArmor: A };
        break;
      case 'AOae':
      case 'AUau':
        fx.passive = { auraMovePct: A, auraAttackSpeed: B };
        break;
      case 'AUav':
        fx.passive = { lifesteal: A };
        break;
      default:
        fx.passive = {};
        fx.implemented = ab.code === 'Aamk';
    }
    fxCache.set(ab.code, fx);
    return fx;
  }

  // ---- 主动数值 ----
  for (let i = 0; i < n; i++) {
    const t = text(i);
    let dmg = 0;
    let stun = 0;
    if (ab.base === 'AHtb') {
      dmg = ab.dataA[i];
      stun = ab.heroDur[i] || ab.dur[i];
    } else if (['AOsh', 'AUcs', 'AHtc', 'AOws', 'AEfk', 'ANbf', 'AOcl', 'AUfn', 'ANfl', 'AEsh', 'ANfd', 'AUim'].includes(ab.base)) {
      dmg = ab.dataA[i];
      if (ab.base === 'AUim' || ab.base === 'AOws') stun = ab.heroDur[i] || ab.dur[i];
    }
    if (!dmg) {
      dmg = firstNum(t, [
        /造成(\d+(?:\.\d+)?)点(?:的)?(?:额外)?(?:魔法|物理|纯粹|神圣|混合)?伤害/,
        /(\d+(?:\.\d+)?)点(?:的)?(?:魔法|物理|纯粹|神圣|混合)?伤害/,
        /伤害[：:]\s*(\d+(?:\.\d+)?)/,
      ]);
    }
    if (!stun) {
      stun = firstNum(t, [
        /(?:晕眩|眩晕|击晕)(?:目标|敌人|敌方单位|他们)?(\d+(?:\.\d+)?)秒/,
        /(\d+(?:\.\d+)?)秒(?:的)?(?:晕眩|眩晕)/,
      ]);
    }
    let slow = 0;
    if (/减(?:少|缓|慢|低)|降低/.test(t)) {
      slow = firstNum(t, [/(\d+(?:\.\d+)?)%(?:的)?(?:移动速度|移速)/, /(?:移动速度|移速)(?:降低|减少|减缓)?(\d+(?:\.\d+)?)%/]);
    }
    const heal = firstNum(t, [/(?:恢复|治疗|回复)(?:目标|友军|友方单位)?(\d+(?:\.\d+)?)点(?:的)?生命/]);
    const aoe = ab.area[i] || firstNum(t, [/(\d+)(?:的)?范围/, /范围[：:]\s*(\d+)/]);
    fx.dmg.push(dmg);
    fx.stun.push(Math.min(stun, 8));
    fx.slowPct.push(Math.min(slow, 90));
    fx.heal.push(heal);
    fx.aoe.push(aoe);
  }
  if (fx.heal.some((v) => v > 0) && !fx.dmg.some((v) => v > 0)) fx.ally = true;
  fx.implemented =
    fx.blink || fx.dmg.some((v) => v > 0) || fx.stun.some((v) => v > 0) || fx.heal.some((v) => v > 0) || fx.slowPct.some((v) => v > 0);
  fxCache.set(ab.code, fx);
  return fx;
}

/** 消耗品效果：从物品说明中解析「恢复 N 点生命/魔法」「N 秒」 */
export function resolveConsumable(item: ItemDef): { hp: number; mana: number; dur: number } {
  const d = item.desc;
  const hp = firstNum(d, [/(?:恢复|回复|治疗)(\d+)点(?:的)?生命/]);
  const mana = firstNum(d, [/(?:恢复|回复)(\d+)点(?:的)?魔法/]);
  const dur = firstNum(d, [/持续(?:时间)?[：:]?\s*(\d+(?:\.\d+)?)秒/, /(\d+(?:\.\d+)?)秒内/]);
  return { hp, mana, dur };
}
