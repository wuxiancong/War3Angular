/**
 * DotA 6.83d 网页对战 —— 确定性逻辑引擎（不依赖渲染/DOM）。
 *
 * 对齐魔兽争霸 III 的执行模型：
 *   - 网络只传「指令」(Command)，各端以相同随机种子 + 相同指令序列本地模拟（锁步同步）
 *   - 固定逻辑帧 50ms；每 2 帧为一个网络回合（100ms，对应 W3GS_INCOMING_ACTION 的 sendInterval）
 *   - 攻击 = 前摇(dmgpt) → 伤害点结算/发射弹道 → 冷却(cool)；伤害经 攻击类型×护甲类型 克制表与护甲减伤公式
 * 数值全部取自地图 SLK / war3mapMisc.txt（见 scripts/build-gameplay-data.cjs）。
 */
import {
  resolveAbilityFx,
  resolveConsumable,
  type AbilityDef,
  type AttackDef,
  type GameplayData,
  type HeroDef,
  type ItemBonus,
  type ItemDef,
  type PathingData,
  type UnitDef,
} from './game-data';
import { PathGrid } from './path-grid';

export const TICK_MS = 50;
export const TICKS_PER_TURN = 2;
const DT = TICK_MS / 1000;

// ---------------------------------------------------------------------------
// 指令（等价于 WC3 的 Order / W3GS action）
// ---------------------------------------------------------------------------
export type Command =
  | { t: 'move'; x: number; y: number }
  | { t: 'amove'; x: number; y: number }
  | { t: 'attack'; id: number }
  | { t: 'stop' }
  | { t: 'hold' }
  | { t: 'cast'; slot: number; x?: number; y?: number; id?: number }
  | { t: 'learn'; slot: number }
  | { t: 'buy'; item: string }
  | { t: 'sell'; inv: number }
  | { t: 'use'; inv: number; x?: number; y?: number; id?: number }
  | { t: 'swap'; a: number; b: number };

export interface TurnCommand {
  slot: number;
  c: Command;
}

export interface PlayerSetup {
  slot: number; // 0-4 近卫，5-9 天灾
  name: string;
  heroCode: string;
  isBot: boolean;
}

export interface LaneCfg {
  id: string;
  waypoints: [number, number][];
}
export interface CampCfg {
  id: string;
  x: number;
  y: number;
  tier?: string;
}
export interface BuildingCfg {
  id: string;
  name: string;
  team: 0 | 1;
  kind: string;
  x: number;
  y: number;
}

export interface GameSetup {
  seed: number;
  /** 出兵前准备时间（秒）；原版为 90 秒，网页端默认缩短 */
  prepSec: number;
  players: PlayerSetup[];
  lanes: LaneCfg[];
  camps: CampCfg[];
  runeSpots: { id: string; x: number; y: number }[];
  buildings: BuildingCfg[];
  pathing: PathingData;
}

export type UnitKind = 'hero' | 'creep' | 'neutral' | 'tower' | 'rax' | 'ancient' | 'fountain';
export type Anim = 'stand' | 'walk' | 'attack' | 'spell' | 'death';

export interface Buff {
  kind: 'stun' | 'slow' | 'haste' | 'dd' | 'regen' | 'invis' | 'hot' | 'mot';
  until: number; // 结束 tick
  value: number;
}

export interface InvItem {
  code: string;
  charges: number;
  cdUntil: number;
}

export interface HeroState {
  slot: number;
  playerName: string;
  isBot: boolean;
  def: HeroDef;
  level: number;
  xp: number;
  gold: number;
  skillPoints: number;
  /** 对应 def.skills 的等级（最后一项通常为 属性附加 Aamk） */
  abilityLevels: number[];
  abilityCdUntil: number[];
  items: (InvItem | null)[];
  str: number;
  agi: number;
  int: number;
  bonus: Required<ItemBonus>;
  dmgMin: number;
  dmgMax: number;
  respawnAt: number;
  kills: number;
  deaths: number;
  assists: number;
  lastHits: number;
  denies: number;
  lane: number;
  aiNext: number;
  /** 最近对其造成伤害的敌方英雄 slot → tick（助攻判定） */
  damagedBy: Record<number, number>;
}

type Order =
  | { t: 'idle' }
  | { t: 'hold' }
  | { t: 'move'; x: number; y: number }
  | { t: 'amove'; x: number; y: number }
  | { t: 'attack'; id: number; resume?: Order }
  | { t: 'cast'; slot: number; x: number; y: number; id: number; item: number };

export interface Unit {
  id: number;
  kind: UnitKind;
  /** 0 近卫 / 1 天灾 / 2 中立 */
  team: 0 | 1 | 2;
  typeId: string;
  /** 建筑在 buildings.json 中的 id（塔/兵营/基地/泉水） */
  key: string;
  name: string;
  model: string;
  scale: number;
  x: number;
  y: number;
  facing: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  hpRegen: number;
  mpRegen: number;
  armor: number;
  armorType: string;
  speed: number;
  collision: number;
  atk: AttackDef | null;
  attackInterval: number;
  dmgBonus: number;
  level: number;
  bounty: [number, number, number];
  alive: boolean;
  diedAt: number;
  order: Order;
  path: [number, number][];
  pathIdx: number;
  repathAt: number;
  attackCd: number;
  windup: number;
  windupTarget: number;
  castWind: number;
  autoTarget: number;
  buffs: Buff[];
  anim: Anim;
  animSerial: number;
  hero: HeroState | null;
  // 兵线
  lane: number;
  waypoints: [number, number][];
  wpIdx: number;
  // 野怪
  campIdx: number;
  homeX: number;
  homeY: number;
  // 建筑保护链
  guard: number[];
  guardAny: boolean;
  lastHitBy: number;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  z: number;
  speed: number;
  srcId: number;
  targetId: number;
  dmg: number;
  atkType: string;
  isAttack: boolean;
  stun: number;
  slowPct: number;
  aoe: number;
  art: string;
  team: 0 | 1 | 2;
}

export interface Rune {
  spot: number;
  kind: 'bounty' | 'dd' | 'haste' | 'regen' | 'invis';
  x: number;
  y: number;
}

export type GameEvent =
  | { type: 'float'; x: number; y: number; text: string; color: string; slot?: number }
  | { type: 'msg'; text: string; color?: string }
  | { type: 'fx'; kind: 'spell' | 'blink' | 'levelup' | 'aoe'; x: number; y: number; r?: number; team: number }
  | { type: 'end'; winner: 0 | 1 };

export const RUNE_NAMES: Record<Rune['kind'], string> = {
  bounty: '赏金神符',
  dd: '双倍伤害神符',
  haste: '极速神符',
  regen: '恢复神符',
  invis: '隐身神符',
};

const ZERO_BONUS: Required<ItemBonus> = {
  str: 0, agi: 0, int: 0, dmg: 0, armor: 0, hp: 0, mana: 0, hpRegen: 0, manaRegenPct: 0, attackSpeed: 0,
  moveSpeed: 0, lifesteal: 0, evasion: 0, critChance: 0, critMult: 0, bashChance: 0, bashDmg: 0, bashDur: 0,
};

/** 野怪营地构成（DotA 6.83 常见组合；单位数值取自 SLK） */
const CAMP_POOL: Record<string, string[][]> = {
  small: [['nkob', 'nkob', 'nkob', 'nkot', 'nkol'], ['ngns', 'ngns', 'nfsh'], ['nftb', 'nftb', 'nfsh'], ['ngh1', 'npfl', 'npfl'], ['n0HW', 'n0HW', 'n0HX']],
  medium: [['ncen', 'ncnk'], ['nwlg', 'nwlg', 'n00S'], ['nsat', 'nsat', 'nstl', 'nstl'], ['nogm', 'nogm', 'nomg'], ['n026', 'n026']],
  large: [['ncnk', 'ncen'], ['nsth', 'nstl', 'nsat'], ['nfpu', 'nfpc'], ['ndtw', 'ndtr', 'ndtr'], ['nowe', 'nowb', 'nowb']],
  ancient: [['nbwm', 'nbdk', 'nbdk'], ['nggr', 'ngst', 'ngst'], ['njga', 'njg1', 'njg1'], ['n0LC', 'n0LD', 'n0LD']],
  roshan: [['n00L']],
};

/** 塔按层级取近卫单位数值（天灾对称）：T1 e00R / T2 e011 / T3 e00S / T4 e019 */
const TOWER_BY_TIER = ['e00R', 'e011', 'e00S', 'e019'];

export class GameEngine {
  tick = 0;
  readonly units = new Map<number, Unit>();
  readonly heroes: Unit[] = []; // 下标 = slot
  projectiles: Projectile[] = [];
  runes: (Rune | null)[] = [];
  events: GameEvent[] = [];
  winner: 0 | 1 | -1 = -1;
  readonly grid: PathGrid;
  readonly prepTicks: number;

  private nextId = 1;
  private rngState: number;
  private waveNo = 0;
  private megaLane: boolean[][] = [[false, false, false], [false, false, false]]; // [被强化方][lane]
  private megaRangedLane: boolean[][] = [[false, false, false], [false, false, false]];
  private readonly buildingByKey = new Map<string, Unit>();
  private readonly C;
  private unitList: Unit[] = [];

  constructor(
    readonly data: GameplayData,
    readonly setup: GameSetup
  ) {
    this.C = data.constants;
    this.rngState = setup.seed >>> 0 || 1;
    this.grid = new PathGrid(setup.pathing);
    this.prepTicks = Math.round(setup.prepSec / DT);
    this.initBuildings();
    this.initHeroes();
    this.runes = setup.runeSpots.map(() => null);
  }

  // ------------------------------------------------------------------ 基础
  /** mulberry32：各端一致的伪随机 */
  rand(): number {
    let t = (this.rngState += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  private randInt(lo: number, hi: number): number {
    return lo + Math.floor(this.rand() * (hi - lo + 1));
  }
  /** 对局时钟（秒）：出兵时刻为 0，准备阶段为负 */
  get clockSec(): number {
    return (this.tick - this.prepTicks) * DT;
  }
  get sec(): number {
    return this.tick * DT;
  }
  private ticks(sec: number): number {
    return Math.round(sec / DT);
  }

  private newUnit(kind: UnitKind, team: 0 | 1 | 2, def: UnitDef, x: number, y: number): Unit {
    const u: Unit = {
      id: this.nextId++,
      kind,
      team,
      typeId: def.id,
      key: '',
      name: def.name,
      model: def.model,
      scale: def.scale || 1,
      x,
      y,
      facing: team === 1 ? Math.PI * 1.25 : Math.PI * 0.25,
      hp: def.hp,
      maxHp: def.hp,
      mp: def.mana,
      maxMp: def.mana,
      hpRegen: def.hpRegen,
      mpRegen: def.manaRegen,
      armor: def.armor,
      armorType: def.armorType,
      speed: def.speed,
      collision: def.collision || 16,
      atk: def.atk,
      attackInterval: def.atk ? def.atk.cool : 1,
      dmgBonus: 0,
      level: def.level,
      bounty: def.bounty,
      alive: true,
      diedAt: 0,
      order: { t: 'idle' },
      path: [],
      pathIdx: 0,
      repathAt: 0,
      attackCd: 0,
      windup: -1,
      windupTarget: 0,
      castWind: -1,
      autoTarget: 0,
      buffs: [],
      anim: 'stand',
      animSerial: 0,
      hero: null,
      lane: -1,
      waypoints: [],
      wpIdx: 0,
      campIdx: -1,
      homeX: x,
      homeY: y,
      guard: [],
      guardAny: false,
      lastHitBy: 0,
    };
    this.units.set(u.id, u);
    return u;
  }

  // ------------------------------------------------------------------ 初始化
  private initBuildings(): void {
    const U = this.data.units;
    for (const b of this.setup.buildings) {
      let def: UnitDef | undefined;
      let kind: UnitKind | null = null;
      const tm = b.id.match(/^[rd]_t(\d)_/);
      if (b.kind === 'tower' && tm) {
        def = U[TOWER_BY_TIER[parseInt(tm[1], 10) - 1]];
        kind = 'tower';
      } else if (b.kind === 'rax_melee') {
        def = U['eaom'];
        kind = 'rax';
      } else if (b.kind === 'rax_range') {
        def = U['eaoe'];
        kind = 'rax';
      } else if (b.kind === 'ancient') {
        def = U['etol'];
        kind = 'ancient';
      } else if (b.kind === 'fountain') {
        def = U['nfoh'];
        kind = 'fountain';
      }
      if (!def || !kind) continue;
      const u = this.newUnit(kind, b.team, def, b.x, b.y);
      u.key = b.id;
      u.name = b.name;
      u.speed = 0;
      this.buildingByKey.set(b.id, u);
      if (kind !== 'fountain') this.grid.stampCircle(b.x, b.y, kind === 'ancient' ? 200 : 110, true);
    }
    // 保护链：T2←T1，T3←T2，兵营←T3，T4←任一 T3，基地←全部 T4
    for (const side of ['r', 'd']) {
      const key = (k: string) => this.buildingByKey.get(`${side}_${k}`);
      const t3: number[] = [];
      for (const lane of ['top', 'mid', 'bot']) {
        const t1 = key(`t1_${lane}`);
        const t2 = key(`t2_${lane}`);
        const t3u = key(`t3_${lane}`);
        if (t2 && t1) t2.guard = [t1.id];
        if (t3u && t2) t3u.guard = [t2.id];
        if (t3u) t3.push(t3u.id);
        for (const rk of [`rax_melee_${lane}`, `rax_range_${lane}`]) {
          const rax = key(rk);
          if (rax && t3u) rax.guard = [t3u.id];
        }
      }
      const t4: number[] = [];
      for (const s of ['a', 'b']) {
        const t = key(`t4_${s}`);
        if (t) {
          t.guard = t3;
          t.guardAny = true;
          t4.push(t.id);
        }
      }
      const anc = key('ancient');
      if (anc) anc.guard = t4;
    }
  }

  private fountainOf(team: number): Unit | undefined {
    return this.buildingByKey.get(team === 0 ? 'r_fountain' : 'd_fountain');
  }
  spawnPoint(team: number, slot: number): [number, number] {
    const f = this.fountainOf(team);
    const fx = f ? f.x : team === 0 ? -7000 : 6700;
    const fy = f ? f.y : team === 0 ? -6800 : 6200;
    const dir = team === 0 ? 1 : -1;
    const k = slot % 5;
    return this.grid.nearestFree(fx + dir * (260 + (k % 3) * 90), fy + dir * (260 + Math.floor(k / 3) * 110) - dir * (k % 3) * 60);
  }

  private initHeroes(): void {
    for (const p of this.setup.players) {
      const def = this.data.heroes[p.heroCode];
      if (!def) continue;
      const team: 0 | 1 = p.slot < 5 ? 0 : 1;
      const [x, y] = this.spawnPoint(team, p.slot);
      const u = this.newUnit('hero', team, def, x, y);
      u.name = def.name;
      const laneOrder = [0, 0, 1, 2, 2];
      u.hero = {
        slot: p.slot,
        playerName: p.name,
        isBot: p.isBot,
        def,
        level: 1,
        xp: 0,
        gold: 603,
        skillPoints: 1,
        abilityLevels: def.skills.map(() => 0),
        abilityCdUntil: def.skills.map(() => 0),
        items: [null, null, null, null, null, null],
        str: def.str,
        agi: def.agi,
        int: def.int,
        bonus: { ...ZERO_BONUS },
        dmgMin: 0,
        dmgMax: 0,
        respawnAt: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        lastHits: 0,
        denies: 0,
        lane: laneOrder[p.slot % 5],
        aiNext: 20 + p.slot * 3,
        damagedBy: {},
      };
      this.heroes[p.slot] = u;
      this.recalcHero(u, true);
    }
  }

  // ------------------------------------------------------------------ 英雄属性
  abilityOf(u: Unit, slot: number): AbilityDef | undefined {
    const code = u.hero?.def.skills[slot];
    return code ? this.data.abilities[code] : undefined;
  }

  /** 按 war3mapMisc.txt 系数重算英雄面板 */
  recalcHero(u: Unit, fill = false): void {
    const h = u.hero;
    if (!h) return;
    const C = this.C;
    const d = h.def;
    const b: Required<ItemBonus> = { ...ZERO_BONUS };
    let boots = 0;
    for (const it of h.items) {
      if (!it) continue;
      const def = this.data.items[it.code];
      if (!def) continue;
      const bo = def.bonus;
      for (const k of Object.keys(bo) as (keyof ItemBonus)[]) {
        const v = bo[k] || 0;
        if (k === 'moveSpeed') boots = Math.max(boots, v); // MoveSpeedBonusesStack=0：鞋类不叠加
        else if (k === 'critChance' || k === 'critMult' || k === 'bashChance' || k === 'bashDmg' || k === 'bashDur' || k === 'evasion')
          b[k] = Math.max(b[k], v);
        else b[k] += v;
      }
    }
    b.moveSpeed = boots;
    // 被动技能与属性附加
    let statLv = 0;
    let auraArmor = 0;
    let auraDmgPct = 0;
    let auraMovePct = 0;
    for (let i = 0; i < d.skills.length; i++) {
      const lv = h.abilityLevels[i];
      if (!lv) continue;
      const ab = this.data.abilities[d.skills[i]];
      if (!ab) continue;
      if (ab.code === 'Aamk') {
        statLv = lv;
        continue;
      }
      const p = resolveAbilityFx(ab).passive;
      if (!p) continue;
      const at = (arr?: number[]) => (arr && arr.length ? arr[Math.min(lv, arr.length) - 1] : 0);
      b.critChance = Math.max(b.critChance, at(p.critChance));
      b.critMult = Math.max(b.critMult, at(p.critMult));
      b.evasion = Math.max(b.evasion, at(p.evasion));
      b.bashChance = Math.max(b.bashChance, at(p.bashChance));
      b.bashDmg = Math.max(b.bashDmg, at(p.bashDmg));
      b.bashDur = Math.max(b.bashDur, at(p.bashDur));
      b.lifesteal += at(p.lifesteal);
      b.attackSpeed += at(p.auraAttackSpeed);
      auraArmor += at(p.auraArmor);
      auraDmgPct += at(p.auraDmgPct);
      auraMovePct += at(p.auraMovePct);
    }
    h.bonus = b;
    h.str = d.str + d.strGain * (h.level - 1) + statLv * 2 + b.str;
    h.agi = d.agi + d.agiGain * (h.level - 1) + statLv * 2 + b.agi;
    h.int = d.int + d.intGain * (h.level - 1) + statLv * 2 + b.int;
    const str = Math.floor(h.str);
    const agi = Math.floor(h.agi);
    const int = Math.floor(h.int);
    const hpPct = u.maxHp > 0 ? u.hp / u.maxHp : 1;
    const mpPct = u.maxMp > 0 ? u.mp / u.maxMp : 1;
    u.maxHp = Math.round(d.hp + str * C.strHp + b.hp);
    u.maxMp = Math.round(d.mana + int * C.intMana + b.mana);
    if (fill) {
      u.hp = u.maxHp;
      u.mp = u.maxMp;
    } else {
      u.hp = Math.max(1, Math.round(u.maxHp * hpPct));
      u.mp = Math.round(u.maxMp * mpPct);
    }
    u.armor = d.armor + C.agiArmorBase + agi * C.agiArmor + b.armor + auraArmor;
    u.hpRegen = d.hpRegen + str * C.strRegen + b.hpRegen;
    u.mpRegen = (d.manaRegen + int * C.intRegen) * (1 + b.manaRegenPct);
    u.speed = Math.min(C.maxUnitSpeed, (d.speed + b.moveSpeed) * (1 + auraMovePct));
    const primary = d.primary === 'str' ? str : d.primary === 'int' ? int : agi;
    if (d.atk) {
      const base = d.atk.base + primary;
      const pct = 1 + auraDmgPct;
      h.dmgMin = Math.round((base + d.atk.dice) * pct + b.dmg);
      h.dmgMax = Math.round((base + d.atk.dice * d.atk.sides) * pct + b.dmg);
      const ias = Math.min(4, agi * C.agiAttackSpeed + b.attackSpeed);
      u.attackInterval = d.atk.cool / (1 + ias);
    }
    u.level = h.level;
  }

  // ------------------------------------------------------------------ 主循环
  step(cmds: TurnCommand[]): void {
    if (this.winner >= 0) return;
    for (const tc of cmds) this.applyCommand(tc);
    this.tick++;
    const t = this.tick;
    const since = t - this.prepTicks;

    // 每 0.6 秒 +1 金（EW0 定时器，见 dota-gold-periodic-increment-mechanism.md）
    if (since > 0 && t % 12 === 0) {
      for (const h of this.heroes) if (h?.hero) h.hero.gold += 1;
    }
    if (since >= 0) {
      const wave = this.ticks(this.C.creepWaveIntervalSec);
      if (since % wave === 0) this.spawnWave();
      // 野怪：war3map.j IU2 号角时注册 30 秒单次（IQ2 → TriggerEvaluate(OH)）+ OH 每 60 秒，
      // 即 0:30、1:00、2:00、3:00…（以前算成 0:30、1:30、2:30）
      const camp = this.ticks(this.C.neutralSpawnIntervalSec);
      if (since === this.ticks(30) || (since > 0 && since % camp === 0)) this.spawnNeutrals();
      if (since % this.ticks(this.C.runeIntervalSec) === 0) this.spawnRunes(since === 0);
    }

    this.unitList = [...this.units.values()];
    for (const u of this.unitList) this.updateUnit(u);
    this.separate();
    this.updateProjectiles();
    this.pickupRunes();

    if (t % 10 === 0) {
      for (const h of this.heroes) {
        if (h?.hero?.isBot && h.alive && t >= h.hero.aiNext) this.runBot(h);
      }
    }
    // 尸体清理
    if (t % 20 === 0) {
      for (const u of this.unitList) {
        if (!u.alive && u.kind !== 'hero' && t - u.diedAt > this.ticks(u.kind === 'creep' || u.kind === 'neutral' ? 2.5 : 4)) {
          this.units.delete(u.id);
        }
      }
    }
  }

  /** 状态校验和（锁步失步检测；对应 W3GS_OUTGOING_KEEPALIVE 携带的 checksum） */
  checksum(): number {
    let h = 2166136261 >>> 0;
    const mix = (v: number) => {
      h ^= v & 0xffff;
      h = Math.imul(h, 16777619) >>> 0;
    };
    for (const u of this.units.values()) {
      mix(u.id);
      mix(Math.round(u.x));
      mix(Math.round(u.y));
      mix(Math.round(u.hp));
      if (u.hero) mix(u.hero.gold);
    }
    mix(this.tick);
    return h;
  }

  // ------------------------------------------------------------------ 指令
  private applyCommand(tc: TurnCommand): void {
    const u = this.heroes[tc.slot];
    if (!u || !u.hero) return;
    const c = tc.c;
    const h = u.hero;
    switch (c.t) {
      case 'learn':
        this.learn(u, c.slot);
        return;
      case 'buy':
        this.buy(u, c.item);
        return;
      case 'sell':
        this.sell(u, c.inv);
        return;
      case 'swap': {
        if (c.a >= 0 && c.a < 6 && c.b >= 0 && c.b < 6) {
          const tmp = h.items[c.a];
          h.items[c.a] = h.items[c.b];
          h.items[c.b] = tmp;
        }
        return;
      }
      default:
        break;
    }
    if (!u.alive) return;
    const cancelWind = () => {
      u.windup = -1;
      u.castWind = -1;
    };
    switch (c.t) {
      case 'move':
        if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) return;
        cancelWind();
        u.order = { t: 'move', x: c.x, y: c.y };
        this.setPath(u, c.x, c.y);
        break;
      case 'amove':
        if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) return;
        cancelWind();
        u.order = { t: 'amove', x: c.x, y: c.y };
        this.setPath(u, c.x, c.y);
        break;
      case 'attack': {
        const tg = this.units.get(c.id);
        if (!tg || !tg.alive || tg.id === u.id) return;
        // 反补：友方小兵 <50% 血、友方塔 <10% 血才允许攻击
        if (tg.team === u.team) {
          const ok = (tg.kind === 'creep' && tg.hp < tg.maxHp * 0.5) || (tg.kind === 'tower' && tg.hp < tg.maxHp * 0.1);
          if (!ok) {
            u.order = { t: 'move', x: tg.x, y: tg.y };
            this.setPath(u, tg.x, tg.y);
            return;
          }
        }
        cancelWind();
        u.order = { t: 'attack', id: c.id };
        break;
      }
      case 'stop':
        cancelWind();
        u.order = { t: 'idle' };
        u.autoTarget = 0;
        u.path = [];
        break;
      case 'hold':
        cancelWind();
        u.order = { t: 'hold' };
        u.path = [];
        break;
      case 'cast':
        this.orderCast(u, c.slot, c.x, c.y, c.id, -1);
        break;
      case 'use':
        this.orderUse(u, c.inv, c.x, c.y, c.id);
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------------ 学习技能
  canLearn(u: Unit, slot: number): boolean {
    const h = u.hero;
    const ab = this.abilityOf(u, slot);
    if (!h || !ab || h.skillPoints <= 0) return false;
    const lv = h.abilityLevels[slot];
    const maxLv = ab.code === 'Aamk' ? 10 : ab.levels;
    if (lv >= maxLv) return false;
    // WC3 规则：英雄等级 ≥ reqLevel + levelSkip × 当前技能等级
    return h.level >= ab.reqLevel + ab.levelSkip * lv;
  }
  private learn(u: Unit, slot: number): void {
    if (!this.canLearn(u, slot) || !u.hero) return;
    u.hero.abilityLevels[slot]++;
    u.hero.skillPoints--;
    this.recalcHero(u);
  }

  // ------------------------------------------------------------------ 商店 / 物品
  /** 物品所属商店类别：base 基地商店 / side 边路商店 / secret 神秘商店 */
  shopZoneOf(itemCode: string): 'base' | 'side' | 'secret' | null {
    let zone: 'base' | 'side' | 'secret' | null = null;
    for (const s of this.data.shops) {
      if (!s.items.includes(itemCode)) continue;
      const z = s.id === 'u010' || s.id === 'u00Z' ? 'side' : s.id === 'uC74' || s.id === 'nC35' ? 'secret' : 'base';
      if (z === 'base') return 'base';
      zone = zone === 'side' ? 'side' : z;
    }
    return zone;
  }
  nearShop(u: Unit, zone: 'base' | 'side' | 'secret'): boolean {
    if (zone === 'base') {
      const f = this.fountainOf(u.team);
      return !!f && dist(u.x, u.y, f.x, f.y) < 1500;
    }
    const kind = zone === 'side' ? 'side_shop' : 'secret_shop';
    return this.setup.buildings.some((b) => b.kind === kind && dist(u.x, u.y, b.x, b.y) < 800);
  }
  /** 返回空串表示可购买，否则为中文原因 */
  buyBlockReason(u: Unit, itemCode: string): string {
    const h = u.hero;
    const item = this.data.items[itemCode];
    if (!h || !item) return '物品不存在';
    const zone = this.shopZoneOf(itemCode);
    if (!zone) return '该物品不在任何商店出售';
    if (h.gold < item.cost) return '金钱不足';
    if (u.alive && !this.nearShop(u, zone)) {
      return zone === 'base' ? '需要回到基地商店附近' : zone === 'side' ? '需要靠近边路商店' : '需要靠近神秘商店';
    }
    if (!u.alive && zone !== 'base') return '阵亡时只能购买基地商店物品';
    const stack = item.stackable && h.items.some((it) => it?.code === itemCode);
    if (!stack && !h.items.includes(null) && !this.wouldCombine(h, itemCode)) return '物品栏已满';
    return '';
  }
  private wouldCombine(h: HeroState, adding: string): boolean {
    const have = h.items.filter((it): it is InvItem => !!it).map((it) => it.code);
    have.push(adding);
    return this.data.recipes.some((r) => r.components.includes(adding) && containsAll(have, r.components));
  }
  private buy(u: Unit, itemCode: string): void {
    const h = u.hero;
    if (!h || this.buyBlockReason(u, itemCode)) return;
    const item = this.data.items[itemCode];
    h.gold -= item.cost;
    this.giveItem(u, itemCode);
  }
  giveItem(u: Unit, itemCode: string): void {
    const h = u.hero;
    const item = this.data.items[itemCode];
    if (!h || !item) return;
    const charges = Math.max(1, item.uses || 1);
    const same = item.stackable ? h.items.find((it) => it?.code === itemCode) : null;
    if (same) same.charges += charges;
    else {
      const free = h.items.indexOf(null);
      const inv: InvItem = { code: itemCode, charges, cdUntil: 0 };
      if (free >= 0) h.items[free] = inv;
      else h.items.push(inv); // 临时第 7 格，随后必然被合成消耗
    }
    this.tryCombine(u);
    if (h.items.length > 6) h.items.length = 6;
    this.recalcHero(u);
  }
  /** 自动合成：材料齐全即合成，成品落在材料占用的最小格（对齐 warcraft-iii-dota-item-combine-slot-placement.md） */
  private tryCombine(u: Unit): void {
    const h = u.hero;
    if (!h) return;
    for (let guard = 0; guard < 6; guard++) {
      const have = h.items.map((it) => (it ? it.code : ''));
      const r = this.data.recipes.find((rc) => containsAll(have.filter(Boolean), rc.components));
      if (!r) return;
      let minSlot = 99;
      for (const comp of r.components) {
        const idx = h.items.findIndex((it) => it?.code === comp);
        if (idx >= 0) {
          h.items[idx] = null;
          minSlot = Math.min(minSlot, idx);
        }
      }
      const res = this.data.items[r.result];
      const slot = Math.min(minSlot, 5);
      h.items[slot] = { code: r.result, charges: Math.max(1, res?.uses || 1), cdUntil: 0 };
      this.events.push({ type: 'float', x: u.x, y: u.y, text: `合成 ${res?.name || r.result}`, color: '#fde68a', slot: h.slot });
    }
  }
  private sell(u: Unit, inv: number): void {
    const h = u.hero;
    const it = h?.items[inv];
    if (!h || !it) return;
    const def = this.data.items[it.code];
    if (!this.nearShop(u, 'base') && !this.nearShop(u, 'side') && !this.nearShop(u, 'secret')) return;
    h.gold += Math.floor((def?.cost || 0) * 0.5); // PawnItemRate=0.50
    h.items[inv] = null;
    this.recalcHero(u);
  }

  private orderUse(u: Unit, inv: number, x?: number, y?: number, id?: number): void {
    const h = u.hero;
    const it = h?.items[inv];
    if (!h || !it || this.tick < it.cdUntil) return;
    const def = this.data.items[it.code];
    if (!def) return;
    if (def.kind === 'blink' || def.kind === 'tp' || def.kind === 'travel') {
      if (x === undefined || y === undefined) return;
      u.order = { t: 'cast', slot: -1, x, y, id: 0, item: inv };
      return;
    }
    if (def.kind === 'force') {
      this.consumeItem(u, inv, def, 20);
      this.blinkTo(u, u.x + Math.cos(u.facing) * 600, u.y + Math.sin(u.facing) * 600, false);
      return;
    }
    if (def.kind === 'consumable') {
      const fx = resolveConsumable(def);
      if (!fx.hp && !fx.mana) return;
      const dur = fx.dur || 0;
      const tg = id ? this.units.get(id) : u;
      const target = tg && tg.alive && tg.team === u.team && dist(u.x, u.y, tg.x, tg.y) < 400 ? tg : u;
      if (dur > 0) {
        if (fx.hp) target.buffs.push({ kind: 'hot', until: this.tick + this.ticks(dur), value: fx.hp / dur });
        if (fx.mana) target.buffs.push({ kind: 'mot', until: this.tick + this.ticks(dur), value: fx.mana / dur });
      } else {
        target.hp = Math.min(target.maxHp, target.hp + fx.hp);
        target.mp = Math.min(target.maxMp, target.mp + fx.mana);
      }
      this.events.push({ type: 'float', x: target.x, y: target.y, text: def.name, color: '#86efac' });
      this.consumeItem(u, inv, def, def.active?.cool || 0);
    }
  }
  private consumeItem(u: Unit, inv: number, def: ItemDef, cool: number): void {
    const h = u.hero;
    const it = h?.items[inv];
    if (!h || !it) return;
    it.cdUntil = this.tick + this.ticks(cool);
    if (def.kind === 'consumable' || def.kind === 'tp') {
      it.charges--;
      if (it.charges <= 0) {
        h.items[inv] = null;
        this.recalcHero(u);
      }
    }
  }

  // ------------------------------------------------------------------ 施法
  /** 返回空串表示可施放 */
  castBlockReason(u: Unit, slot: number): string {
    const h = u.hero;
    const ab = this.abilityOf(u, slot);
    if (!h || !ab) return '无此技能';
    const lv = h.abilityLevels[slot];
    if (!lv) return '尚未学习';
    const fx = resolveAbilityFx(ab);
    if (fx.target === 'passive') return '被动技能';
    if (this.tick < h.abilityCdUntil[slot]) return '技能冷却中';
    if (u.mp < ab.cost[Math.min(lv, ab.cost.length) - 1]) return '魔法不足';
    if (this.hasBuff(u, 'stun')) return '被眩晕';
    return '';
  }
  private orderCast(u: Unit, slot: number, x?: number, y?: number, id?: number, item = -1): void {
    if (this.castBlockReason(u, slot)) return;
    const ab = this.abilityOf(u, slot) as AbilityDef;
    const fx = resolveAbilityFx(ab);
    let tx = x ?? u.x;
    let ty = y ?? u.y;
    let tid = 0;
    if (fx.target === 'unit') {
      const tg = id ? this.units.get(id) : undefined;
      if (!tg || !tg.alive) return;
      if (fx.ally ? tg.team !== u.team : tg.team === u.team) return;
      if (!fx.ally && !this.vulnerable(tg)) return;
      tid = tg.id;
      tx = tg.x;
      ty = tg.y;
    } else if (fx.target === 'none') {
      tx = u.x;
      ty = u.y;
    } else if (x === undefined || y === undefined) return;
    u.windup = -1;
    u.castWind = -1;
    u.order = { t: 'cast', slot, x: tx, y: ty, id: tid, item };
  }

  private execCast(u: Unit, o: Extract<Order, { t: 'cast' }>): void {
    const h = u.hero;
    if (!h) return;
    // ---- 物品主动 ----
    if (o.item >= 0) {
      const it = h.items[o.item];
      const def = it ? this.data.items[it.code] : undefined;
      if (!it || !def) return;
      if (def.kind === 'blink') {
        this.consumeItem(u, o.item, def, def.active?.cool || 12);
        this.blinkTo(u, o.x, o.y, true);
      } else {
        // 回城/飞鞋：传送到落点最近的友方建筑旁
        let best: Unit | undefined;
        let bd = 1e18;
        for (const b of this.buildingByKey.values()) {
          if (!b.alive || b.team !== u.team) continue;
          const d = dist(o.x, o.y, b.x, b.y);
          if (d < bd) {
            bd = d;
            best = b;
          }
        }
        if (best) {
          const [fx2, fy2] = this.grid.nearestFree(best.x + (u.team === 0 ? 180 : -180), best.y + (u.team === 0 ? 180 : -180));
          this.events.push({ type: 'fx', kind: 'blink', x: u.x, y: u.y, team: u.team });
          u.x = fx2;
          u.y = fy2;
          this.events.push({ type: 'fx', kind: 'blink', x: u.x, y: u.y, team: u.team });
        }
        this.consumeItem(u, o.item, def, def.active?.cool || 65);
      }
      return;
    }
    // ---- 技能 ----
    const ab = this.abilityOf(u, o.slot);
    if (!ab || this.castBlockReason(u, o.slot)) return;
    const lv = h.abilityLevels[o.slot];
    const li = (arr: number[]) => (arr.length ? arr[Math.min(lv, arr.length) - 1] : 0);
    const fx = resolveAbilityFx(ab);
    u.mp -= li(ab.cost);
    h.abilityCdUntil[o.slot] = this.tick + this.ticks(li(ab.cool));
    this.events.push({ type: 'fx', kind: 'spell', x: u.x, y: u.y, team: u.team });
    this.events.push({ type: 'float', x: u.x, y: u.y, text: ab.name, color: '#93c5fd' });
    if (!fx.implemented) {
      if (!h.isBot) {
        this.events.push({ type: 'msg', text: `「${ab.name}」为地图脚本技能，网页端暂未还原其特效（已正常扣蓝并进入冷却）`, color: '#fbbf24' });
      }
      return;
    }
    const dmg = li(fx.dmg);
    const stun = li(fx.stun);
    const slow = li(fx.slowPct);
    const heal = li(fx.heal);
    const aoe = li(fx.aoe);
    if (fx.blink) {
      const maxR = li(ab.dataA) || li(ab.range) || 1000;
      const d = dist(u.x, u.y, o.x, o.y);
      const k = d > maxR ? maxR / d : 1;
      this.blinkTo(u, u.x + (o.x - u.x) * k, u.y + (o.y - u.y) * k, true);
      return;
    }
    if (fx.target === 'unit') {
      const tg = this.units.get(o.id);
      if (!tg || !tg.alive) return;
      if (fx.ally) {
        tg.hp = Math.min(tg.maxHp, tg.hp + heal);
        this.events.push({ type: 'float', x: tg.x, y: tg.y, text: `+${Math.round(heal)}`, color: '#4ade80' });
        return;
      }
      if (ab.missileSpeed > 0) {
        this.projectiles.push({
          id: this.nextId++, x: u.x, y: u.y, z: 60, speed: ab.missileSpeed, srcId: u.id, targetId: tg.id, dmg,
          atkType: 'spells', isAttack: false, stun, slowPct: slow, aoe, art: ab.missileArt, team: u.team,
        });
      } else {
        this.spellHit(u, tg, dmg, stun, slow, aoe);
      }
      return;
    }
    // 点目标 / 无目标：范围结算
    const r = aoe || (fx.target === 'none' ? 300 : 250);
    const cx = fx.target === 'none' ? u.x : o.x;
    const cy = fx.target === 'none' ? u.y : o.y;
    this.events.push({ type: 'fx', kind: 'aoe', x: cx, y: cy, r, team: u.team });
    if (heal > 0 && !dmg) {
      for (const tg of this.unitList) {
        if (tg.alive && tg.team === u.team && tg.kind === 'hero' && dist(cx, cy, tg.x, tg.y) <= r) tg.hp = Math.min(tg.maxHp, tg.hp + heal);
      }
      return;
    }
    for (const tg of this.unitList) {
      if (!tg.alive || tg.team === u.team || !this.vulnerable(tg)) continue;
      if (tg.kind === 'tower' || tg.kind === 'rax' || tg.kind === 'ancient' || tg.kind === 'fountain') continue;
      if (dist(cx, cy, tg.x, tg.y) > r + tg.collision) continue;
      this.spellHit(u, tg, dmg, stun, slow, 0);
    }
  }

  private spellHit(src: Unit, tg: Unit, dmg: number, stun: number, slow: number, aoe: number): void {
    const targets: Unit[] = [tg];
    if (aoe > 0) {
      for (const o of this.unitList) {
        if (o !== tg && o.alive && o.team !== src.team && this.isMobile(o) && dist(tg.x, tg.y, o.x, o.y) <= aoe) targets.push(o);
      }
    }
    for (const t of targets) {
      if (stun > 0) this.addBuff(t, 'stun', stun, 0);
      if (slow > 0) this.addBuff(t, 'slow', 3, slow / 100);
      if (dmg > 0) this.dealDamage(src, t, dmg, 'spells', false);
    }
  }

  private blinkTo(u: Unit, x: number, y: number, fxOn: boolean): void {
    const [nx, ny] = this.grid.nearestFree(clamp(x, -7900, 7900), clamp(y, -7900, 7900));
    if (fxOn) this.events.push({ type: 'fx', kind: 'blink', x: u.x, y: u.y, team: u.team });
    u.x = nx;
    u.y = ny;
    u.path = [];
    if (fxOn) this.events.push({ type: 'fx', kind: 'blink', x: nx, y: ny, team: u.team });
  }

  // ------------------------------------------------------------------ Buff
  hasBuff(u: Unit, kind: Buff['kind']): boolean {
    for (const b of u.buffs) if (b.kind === kind && b.until > this.tick) return true;
    return false;
  }
  private addBuff(u: Unit, kind: Buff['kind'], sec: number, value: number): void {
    const until = this.tick + this.ticks(sec);
    const ex = u.buffs.find((b) => b.kind === kind);
    if (ex) {
      ex.until = Math.max(ex.until, until);
      ex.value = Math.max(ex.value, value);
    } else u.buffs.push({ kind, until, value });
    if (kind === 'stun') {
      u.windup = -1;
      u.castWind = -1;
    }
  }
  private buffValue(u: Unit, kind: Buff['kind']): number {
    for (const b of u.buffs) if (b.kind === kind && b.until > this.tick) return b.value;
    return 0;
  }
  moveSpeedOf(u: Unit): number {
    let s = u.speed;
    const slow = this.buffValue(u, 'slow');
    if (slow) s *= 1 - slow;
    if (this.hasBuff(u, 'haste')) s = this.C.maxUnitSpeed;
    return clamp(s, this.C.minUnitSpeed, this.C.maxUnitSpeed);
  }

  // ------------------------------------------------------------------ 单位更新
  private isMobile(u: Unit): boolean {
    return u.kind === 'hero' || u.kind === 'creep' || u.kind === 'neutral';
  }
  /** 建筑保护链：前置建筑未摧毁时无敌 */
  vulnerable(u: Unit): boolean {
    if (u.kind === 'fountain') return false;
    if (!u.guard.length) return true;
    let alive = 0;
    for (const id of u.guard) if (this.units.get(id)?.alive) alive++;
    return u.guardAny ? alive < u.guard.length : alive === 0;
  }

  private updateUnit(u: Unit): void {
    const t = this.tick;
    if (!u.alive) {
      if (u.hero && t >= u.hero.respawnAt) this.respawn(u);
      return;
    }
    // 回复
    if (u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.hpRegen * DT);
    if (u.mp < u.maxMp) u.mp = Math.min(u.maxMp, u.mp + u.mpRegen * DT);
    if (u.buffs.length) {
      for (const b of u.buffs) {
        if (b.until <= t) continue;
        if (b.kind === 'hot') u.hp = Math.min(u.maxHp, u.hp + b.value * DT);
        else if (b.kind === 'mot') u.mp = Math.min(u.maxMp, u.mp + b.value * DT);
        else if (b.kind === 'regen') {
          u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.05 * DT);
          u.mp = Math.min(u.maxMp, u.mp + u.maxMp * 0.05 * DT);
        }
      }
      if (t % 20 === 0) u.buffs = u.buffs.filter((b) => b.until > t);
    }
    if (u.attackCd > 0) u.attackCd -= DT;

    if (u.kind === 'fountain') {
      this.fountainTick(u);
      return;
    }
    if (this.hasBuff(u, 'stun')) {
      u.anim = 'stand';
      return;
    }
    if (u.kind === 'rax' || u.kind === 'ancient') return;

    const o = u.order;
    switch (o.t) {
      case 'idle': {
        if (u.kind === 'creep') {
          this.creepThink(u);
          break;
        }
        if (u.kind === 'neutral') {
          this.neutralThink(u);
          break;
        }
        const tg = this.autoAcquire(u);
        if (tg) this.attackStep(u, tg, u.kind !== 'tower');
        else if (u.windup < 0) u.anim = 'stand';
        break;
      }
      case 'hold': {
        const tg = this.autoAcquire(u);
        if (tg) this.attackStep(u, tg, false);
        else u.anim = 'stand';
        break;
      }
      case 'move':
        if (this.followPath(u)) u.order = { t: 'idle' };
        break;
      case 'amove': {
        const tg = this.autoAcquire(u);
        if (tg) this.attackStep(u, tg, true);
        else {
          if (!u.path.length || u.pathIdx >= u.path.length) this.setPath(u, o.x, o.y);
          if (this.followPath(u) && dist(u.x, u.y, o.x, o.y) < 80) u.order = { t: 'idle' };
        }
        break;
      }
      case 'attack': {
        const tg = this.units.get(o.id);
        if (!tg || !tg.alive || (tg.team !== u.team && !this.vulnerable(tg)) || (tg.kind === 'hero' && this.hasBuff(tg, 'invis'))) {
          u.windup = -1;
          u.order = o.resume || { t: 'idle' };
          break;
        }
        this.attackStep(u, tg, true);
        break;
      }
      case 'cast':
        this.castStep(u, o);
        break;
    }
  }

  private castStep(u: Unit, o: Extract<Order, { t: 'cast' }>): void {
    let range = 0;
    if (o.item >= 0) {
      const it = u.hero?.items[o.item];
      const def = it ? this.data.items[it.code] : undefined;
      range = def?.kind === 'blink' ? 99999 : 99999;
      if (def?.kind === 'blink') {
        // 闪烁匕首：超出最大距离时按 4/5 距离落点
        const maxR = def.active?.dataA || 1200;
        const d = dist(u.x, u.y, o.x, o.y);
        if (d > maxR) {
          const k = (maxR * 0.8) / d;
          o.x = u.x + (o.x - u.x) * k;
          o.y = u.y + (o.y - u.y) * k;
        }
      }
    } else {
      const ab = this.abilityOf(u, o.slot);
      if (!ab || !u.hero) {
        u.order = { t: 'idle' };
        return;
      }
      const lv = u.hero.abilityLevels[o.slot];
      const fx = resolveAbilityFx(ab);
      range = fx.target === 'none' ? 99999 : (ab.range[Math.min(lv, ab.range.length) - 1] || 600) + 50;
      if (fx.blink) range = 99999;
      if (o.id) {
        const tg = this.units.get(o.id);
        if (!tg || !tg.alive) {
          u.order = { t: 'idle' };
          return;
        }
        o.x = tg.x;
        o.y = tg.y;
      }
    }
    const d = dist(u.x, u.y, o.x, o.y);
    if (d > range && u.castWind < 0) {
      this.moveToward(u, o.x, o.y);
      return;
    }
    if (d > 1) u.facing = Math.atan2(o.y - u.y, o.x - u.x);
    if (u.castWind < 0) {
      u.castWind = 0.3; // 施法前摇（多数英雄 castpt≈0.3）
      u.anim = 'spell';
      u.animSerial++;
      return;
    }
    u.castWind -= DT;
    if (u.castWind <= 0) {
      u.castWind = -1;
      u.order = { t: 'idle' };
      this.execCast(u, o);
    }
  }

  /** 自动索敌：acquire 范围内最近的可攻击敌人（塔优先打小兵） */
  private autoAcquire(u: Unit): Unit | null {
    if (!u.atk) return null;
    const cur = u.autoTarget ? this.units.get(u.autoTarget) : undefined;
    const acq = Math.max(u.atk.acquire, u.atk.range) + 20;
    if (cur && cur.alive && this.canTarget(u, cur) && dist(u.x, u.y, cur.x, cur.y) <= acq + 150) return cur;
    let best: Unit | null = null;
    let bestScore = 1e18;
    for (const o of this.unitList) {
      if (!o.alive || o.team === u.team || !this.canTarget(u, o)) continue;
      const d = dist(u.x, u.y, o.x, o.y) - o.collision;
      if (d > acq) continue;
      let score = d;
      if (u.kind === 'tower' && o.kind === 'hero') score += 2000; // 塔：小兵优先
      if (u.kind !== 'tower' && !this.isMobile(o)) score += 400; // 其它单位：先打单位再打建筑
      if (score < bestScore) {
        bestScore = score;
        best = o;
      }
    }
    u.autoTarget = best ? best.id : 0;
    return best;
  }
  private canTarget(u: Unit, o: Unit): boolean {
    if (o.kind === 'fountain') return false;
    if (!this.vulnerable(o)) return false;
    if (o.kind === 'hero' && this.hasBuff(o, 'invis')) return false;
    // 中立野怪只与进入仇恨范围的单位交战；兵线单位不主动打野
    if (u.kind === 'creep' && o.team === 2) return false;
    if (u.team === 2 && o.kind !== 'hero' && o.kind !== 'creep') return false;
    if ((u.kind === 'tower' || u.kind === 'creep') && o.team === 2) return false;
    return true;
  }

  private creepThink(u: Unit): void {
    const tg = this.autoAcquire(u);
    if (tg) {
      this.attackStep(u, tg, true);
      return;
    }
    if (u.wpIdx >= u.waypoints.length) {
      u.anim = 'stand';
      return;
    }
    const [wx, wy] = u.waypoints[u.wpIdx];
    // 路点多取自防御塔/兵营坐标（已盖阻挡章，单位只能走到其边缘），因此到达半径要大于建筑占地
    if (dist(u.x, u.y, wx, wy) < 300) {
      u.wpIdx++;
      u.path = [];
      return;
    }
    this.moveToward(u, wx, wy);
  }

  private neutralThink(u: Unit): void {
    const dHome = dist(u.x, u.y, u.homeX, u.homeY);
    let tg = u.autoTarget ? this.units.get(u.autoTarget) : undefined;
    if (tg && (!tg.alive || dHome > 900 || (tg.kind === 'hero' && this.hasBuff(tg, 'invis')))) {
      tg = undefined;
      u.autoTarget = 0;
    }
    if (!tg) {
      // 仇恨范围 240（野怪被攻击时由 dealDamage 设置 autoTarget）
      for (const o of this.unitList) {
        if (o.alive && o.kind === 'hero' && !this.hasBuff(o, 'invis') && dist(u.x, u.y, o.x, o.y) < 240) {
          tg = o;
          u.autoTarget = o.id;
          break;
        }
      }
    }
    if (tg) {
      this.attackStep(u, tg, true);
      return;
    }
    if (dHome > 40) {
      this.moveToward(u, u.homeX, u.homeY);
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.1 * DT);
    } else u.anim = 'stand';
  }

  private fountainTick(f: Unit): void {
    for (const o of this.unitList) {
      if (!o.alive || !this.isMobile(o)) continue;
      const d = dist(f.x, f.y, o.x, o.y);
      if (o.team === f.team && o.kind === 'hero' && d < 1000) {
        o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.04 * DT);
        o.mp = Math.min(o.maxMp, o.mp + o.maxMp * 0.04 * DT);
      }
    }
    const tg = this.autoAcquire(f);
    if (tg) this.attackStep(f, tg, false);
  }

  /** 攻击循环：追击 → 前摇 → 伤害点 → 冷却 */
  private attackStep(u: Unit, tg: Unit, canMove: boolean): void {
    const atk = u.atk;
    if (!atk) return;
    const d = dist(u.x, u.y, tg.x, tg.y) - tg.collision;
    const range = atk.range + (u.windup >= 0 ? 250 : 0);
    if (d > range) {
      u.windup = -1;
      if (canMove && this.isMobile(u)) this.moveToward(u, tg.x, tg.y);
      else if (!canMove) {
        u.autoTarget = 0;
        u.anim = 'stand';
      }
      return;
    }
    u.facing = Math.atan2(tg.y - u.y, tg.x - u.x);
    const speedK = u.attackInterval / atk.cool; // 攻速对前摇的缩放
    if (u.windup < 0) {
      if (u.attackCd > 0) {
        if (u.anim === 'walk') u.anim = 'stand';
        return;
      }
      u.windup = atk.point * speedK;
      u.windupTarget = tg.id;
      u.anim = 'attack';
      u.animSerial++;
      return;
    }
    if (u.windupTarget !== tg.id) {
      u.windup = -1;
      return;
    }
    u.windup -= DT;
    if (u.windup > 0) return;
    // ---- 伤害点 ----
    u.windup = -1;
    u.attackCd = Math.max(0.05, u.attackInterval - atk.point * speedK);
    let dmg: number;
    if (u.hero) dmg = this.randInt(u.hero.dmgMin, u.hero.dmgMax);
    else {
      dmg = atk.base + u.dmgBonus;
      for (let i = 0; i < atk.dice; i++) dmg += this.randInt(1, Math.max(1, atk.sides));
    }
    if (this.hasBuff(u, 'dd')) dmg *= 2;
    if (u.hero && this.hasBuff(u, 'invis')) u.buffs = u.buffs.filter((b) => b.kind !== 'invis');
    if (atk.weapon === 'normal' || atk.missileSpeed <= 0 || atk.weapon === 'instant') {
      this.attackHit(u, tg, dmg);
    } else {
      this.projectiles.push({
        id: this.nextId++, x: u.x, y: u.y, z: u.kind === 'tower' ? 220 : 70, speed: atk.missileSpeed, srcId: u.id, targetId: tg.id, dmg,
        atkType: atk.type, isAttack: true, stun: 0, slowPct: 0, aoe: 0, art: atk.missileArt, team: u.team,
      });
    }
  }

  private attackHit(src: Unit, tg: Unit, dmg: number): void {
    if (!tg.alive) return;
    const sb = src.hero?.bonus;
    const tb = tg.hero?.bonus;
    if (tb && tb.evasion > 0 && this.rand() < tb.evasion) {
      this.events.push({ type: 'float', x: tg.x, y: tg.y, text: '丢失', color: '#f87171' });
      return;
    }
    if (sb) {
      if (sb.critChance > 0 && this.rand() < sb.critChance) {
        dmg *= Math.max(1, sb.critMult);
        this.events.push({ type: 'float', x: tg.x, y: tg.y, text: `${Math.round(dmg)}!`, color: '#ef4444' });
      }
      if (sb.bashChance > 0 && this.isMobile(tg) && this.rand() < sb.bashChance) {
        dmg += sb.bashDmg;
        this.addBuff(tg, 'stun', sb.bashDur || 1, 0);
      }
    }
    const dealt = this.dealDamage(src, tg, dmg, src.atk?.type || 'normal', true);
    if (sb && sb.lifesteal > 0 && src.alive && this.isMobile(tg)) src.hp = Math.min(src.maxHp, src.hp + dealt * sb.lifesteal);
  }

  /**
   * 伤害结算：
   *   攻击：伤害 × 克制表[攻击类型][护甲类型] × (1 - 护甲减伤)
   *   护甲减伤 = 0.06a / (1 + 0.06a)（a≥0）；a<0 时增伤 2 - 0.94^(-a)
   *   技能：按 spells 行（英雄护甲 0.75 即 25% 魔抗），不吃护甲
   */
  dealDamage(src: Unit, tg: Unit, amount: number, atkType: string, isAttack: boolean): number {
    if (!tg.alive || amount <= 0) return 0;
    const C = this.C;
    const row = C.damageTable[atkType] || C.damageTable['normal'];
    const idx = Math.max(0, C.armorOrder.indexOf(tg.armorType));
    let dmg = amount * (row[idx] ?? 1);
    if (isAttack) {
      const a = tg.armor;
      dmg *= a >= 0 ? 1 - (C.defenseArmor * a) / (1 + C.defenseArmor * a) : 2 - Math.pow(1 - C.defenseArmor, -a);
    }
    tg.hp -= dmg;
    tg.lastHitBy = src.id;
    if (tg.hero && src.hero && src.team !== tg.team) tg.hero.damagedBy[src.hero.slot] = this.tick;
    if (tg.kind === 'neutral' && !tg.autoTarget) {
      // 同营地野怪一起仇恨攻击者
      for (const o of this.unitList) if (o.alive && o.kind === 'neutral' && o.campIdx === tg.campIdx) o.autoTarget = src.id;
    }
    if (tg.hp <= 0) this.kill(tg, src);
    return dmg;
  }

  // ------------------------------------------------------------------ 击杀 / 经验 / 金钱
  /** 普通单位经验：f(1)=25，f(n)=f(n-1)+5n+6（GrantNormalXP 公式 A=1,B=5,C=6 → 2 级 41 / 3 级 62 / 4 级 88，与 DotA 小兵经验吻合） */
  private unitXp(level: number): number {
    let xp = 25;
    for (let n = 2; n <= level; n++) xp += 5 * n + 6;
    return xp;
  }
  private heroXp(level: number): number {
    const table = [100, 120, 160, 220, 300];
    return level <= 5 ? table[level - 1] : 300 + (level - 5) * 100;
  }

  private kill(tg: Unit, src: Unit): void {
    tg.alive = false;
    tg.hp = 0;
    tg.diedAt = this.tick;
    tg.anim = 'death';
    tg.animSerial++;
    tg.order = { t: 'idle' };
    tg.windup = -1;
    tg.castWind = -1;
    tg.buffs = [];
    const killerHero = src.hero ? src : null;
    const enemyTeam: 0 | 1 = tg.team === 0 ? 1 : 0;

    if (tg.kind === 'hero' && tg.hero) {
      const vh = tg.hero;
      vh.deaths++;
      vh.respawnAt = this.tick + this.ticks(Math.max(4, vh.level * 4));
      const lost = Math.min(vh.gold, vh.level * 30);
      vh.gold -= lost;
      const bountyGold = 200 + vh.level * 9;
      if (killerHero?.hero && killerHero.team !== tg.team) {
        killerHero.hero.kills++;
        killerHero.hero.gold += bountyGold;
        this.events.push({ type: 'float', x: tg.x, y: tg.y, text: `+${bountyGold}`, color: '#fbbf24', slot: killerHero.hero.slot });
      }
      const assists: Unit[] = [];
      for (const key of Object.keys(vh.damagedBy)) {
        const s = Number(key);
        if (this.tick - vh.damagedBy[s] > this.ticks(20)) continue;
        const a = this.heroes[s];
        if (a?.hero && a !== killerHero) assists.push(a);
      }
      for (const a of assists) {
        if (!a.hero) continue;
        a.hero.assists++;
        a.hero.gold += Math.floor(100 / assists.length) + vh.level * 3;
      }
      vh.damagedBy = {};
      this.shareXp(tg, enemyTeam, this.heroXp(vh.level));
      const killerName = killerHero?.hero ? `${killerHero.hero.playerName}(${killerHero.name})` : src.team === 2 ? '中立生物' : src.team === 0 ? '近卫军团' : '天灾军团';
      this.events.push({ type: 'msg', text: `${killerName} 击杀了 ${vh.playerName}(${tg.name})`, color: tg.team === 0 ? '#f87171' : '#4ade80' });
      return;
    }

    const bounty = tg.bounty[2] + sumDice(this, tg.bounty[0], tg.bounty[1]);
    if (tg.kind === 'creep' || tg.kind === 'neutral') {
      if (killerHero?.hero) {
        if (tg.team === killerHero.team) {
          killerHero.hero.denies++;
          this.events.push({ type: 'float', x: tg.x, y: tg.y, text: '!', color: '#e5e7eb' });
        } else {
          killerHero.hero.lastHits++;
          killerHero.hero.gold += bounty;
          this.events.push({ type: 'float', x: tg.x, y: tg.y, text: `+${bounty}`, color: '#fbbf24', slot: killerHero.hero.slot });
        }
      }
      if (tg.team === 2) {
        if (killerHero) this.shareXp(tg, killerHero.team as 0 | 1, this.unitXp(tg.level));
        if (tg.typeId === 'n00L' && killerHero) {
          for (const h of this.heroes) if (h?.hero && h.team === killerHero.team) h.hero.gold += 200;
          this.events.push({ type: 'msg', text: `${killerHero.team === 0 ? '近卫军团' : '天灾军团'} 击杀了 Roshan，全队获得 200 金`, color: '#fbbf24' });
        }
      } else this.shareXp(tg, enemyTeam, this.unitXp(tg.level));
      return;
    }

    // 建筑
    this.grid.stampCircle(tg.x, tg.y, tg.kind === 'ancient' ? 200 : 110, false);
    if (tg.kind === 'tower') {
      const denied = src.team === tg.team;
      for (const h of this.heroes) {
        if (h?.hero && h.team === enemyTeam) h.hero.gold += denied ? Math.floor(bounty / 2) : bounty;
      }
      this.events.push({ type: 'msg', text: `${tg.name} 被${denied ? '反补' : '摧毁'}，${enemyTeam === 0 ? '近卫' : '天灾'}全队 +${denied ? Math.floor(bounty / 2) : bounty} 金`, color: '#fbbf24' });
    } else if (tg.kind === 'rax') {
      const m = tg.key.match(/rax_(melee|range)_(top|mid|bot)/);
      if (m) {
        const lane = ['top', 'mid', 'bot'].indexOf(m[2]);
        if (m[1] === 'melee') this.megaLane[enemyTeam][lane] = true;
        else this.megaRangedLane[enemyTeam][lane] = true;
      }
      for (const h of this.heroes) if (h?.hero && h.team === enemyTeam) h.hero.gold += bounty;
      this.events.push({ type: 'msg', text: `${tg.name} 被摧毁，该路${enemyTeam === 0 ? '近卫' : '天灾'}将出超级兵`, color: '#fbbf24' });
    } else if (tg.kind === 'ancient') {
      this.winner = enemyTeam;
      this.events.push({ type: 'msg', text: `${enemyTeam === 0 ? '近卫军团' : '天灾军团'} 获得胜利！`, color: '#fde68a' });
      this.events.push({ type: 'end', winner: enemyTeam });
    }
  }

  /** 1300 范围内敌方英雄平分经验（GlobalExperience=0，DotA 由脚本分配） */
  private shareXp(dead: Unit, team: 0 | 1, xp: number): void {
    const near: Unit[] = [];
    for (const h of this.heroes) {
      if (h?.hero && h.alive && h.team === team && dist(h.x, h.y, dead.x, dead.y) <= 1300) near.push(h);
    }
    if (!near.length) return;
    const each = xp / near.length;
    for (const h of near) this.addXp(h, each);
  }
  private addXp(u: Unit, xp: number): void {
    const h = u.hero;
    if (!h) return;
    h.xp += xp;
    const need = this.C.needHeroXP;
    let up = false;
    while (h.level < this.C.maxHeroLevel && h.xp >= need[h.level - 1]) {
      h.level++;
      h.skillPoints++;
      up = true;
    }
    if (up) {
      this.recalcHero(u);
      this.events.push({ type: 'fx', kind: 'levelup', x: u.x, y: u.y, team: u.team });
      this.events.push({ type: 'float', x: u.x, y: u.y, text: `等级 ${h.level}`, color: '#fde047', slot: h.slot });
    }
  }

  private respawn(u: Unit): void {
    const h = u.hero;
    if (!h) return;
    const [x, y] = this.spawnPoint(u.team, h.slot);
    u.x = x;
    u.y = y;
    u.alive = true;
    u.anim = 'stand';
    u.animSerial++;
    u.order = { t: 'idle' };
    u.path = [];
    u.autoTarget = 0;
    this.recalcHero(u, true);
  }

  // ------------------------------------------------------------------ 移动
  private setPath(u: Unit, x: number, y: number): void {
    u.path = this.grid.findPath(u.x, u.y, clamp(x, -8000, 8000), clamp(y, -8000, 8000));
    u.pathIdx = 0;
    u.repathAt = this.tick + 12;
  }
  /** 沿当前路径前进；到达终点返回 true */
  private followPath(u: Unit): boolean {
    if (u.pathIdx >= u.path.length) {
      u.anim = 'stand';
      return true;
    }
    let step = this.moveSpeedOf(u) * DT;
    while (step > 0 && u.pathIdx < u.path.length) {
      const [tx, ty] = u.path[u.pathIdx];
      const dx = tx - u.x;
      const dy = ty - u.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= step) {
        u.x = tx;
        u.y = ty;
        step -= d;
        u.pathIdx++;
      } else {
        u.x += (dx / d) * step;
        u.y += (dy / d) * step;
        u.facing = Math.atan2(dy, dx);
        step = 0;
      }
    }
    u.anim = 'walk';
    return u.pathIdx >= u.path.length;
  }
  /** 追击/行军用：定期重算路径后前进 */
  private moveToward(u: Unit, x: number, y: number): void {
    const last = u.path.length ? u.path[u.path.length - 1] : null;
    if (!last || u.pathIdx >= u.path.length || (this.tick >= u.repathAt && dist(last[0], last[1], x, y) > 96)) {
      this.setPath(u, x, y);
    }
    this.followPath(u);
  }

  /** 轻量分离：重叠的可移动单位互相推开，避免小兵完全叠在一点 */
  private separate(): void {
    const list = this.unitList;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive || !this.isMobile(a)) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.alive || !this.isMobile(b)) continue;
        const dx = b.x - a.x;
        if (dx > 64 || dx < -64) continue;
        const dy = b.y - a.y;
        if (dy > 64 || dy < -64) continue;
        const min = (a.collision + b.collision) * 0.85;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2);
        let nx: number;
        let ny: number;
        if (d < 0.01) {
          const ang = ((a.id * 37 + b.id * 17) % 360) * (Math.PI / 180);
          nx = Math.cos(ang);
          ny = Math.sin(ang);
        } else {
          nx = dx / d;
          ny = dy / d;
        }
        const push = (min - d) * 0.25;
        const ax = a.x - nx * push;
        const ay = a.y - ny * push;
        const bx = b.x + nx * push;
        const by = b.y + ny * push;
        if (!this.grid.blocked(ax, ay)) {
          a.x = ax;
          a.y = ay;
        }
        if (!this.grid.blocked(bx, by)) {
          b.x = bx;
          b.y = by;
        }
      }
    }
  }

  // ------------------------------------------------------------------ 弹道
  private updateProjectiles(): void {
    if (!this.projectiles.length) return;
    const keep: Projectile[] = [];
    for (const p of this.projectiles) {
      const tg = this.units.get(p.targetId);
      if (!tg || !tg.alive) continue;
      const dx = tg.x - p.x;
      const dy = tg.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const step = p.speed * DT;
      if (d <= step + tg.collision * 0.5) {
        const src = this.units.get(p.srcId);
        if (src) {
          if (p.isAttack) this.attackHit(src, tg, p.dmg);
          else this.spellHit(src, tg, p.dmg, p.stun, p.slowPct, p.aoe);
        }
        continue;
      }
      p.x += (dx / d) * step;
      p.y += (dy / d) * step;
      keep.push(p);
    }
    this.projectiles = keep;
  }

  // ------------------------------------------------------------------ 出兵 / 野怪 / 神符
  /**
   * 对齐 war3map.j SPO()（TriggerRegisterTimerEventPeriodic(ZG,30.00)）：
   *   每路 近战×NI + 远程×SI；ModuloInteger(execCount,7)==0 时加 1 辆攻城车；
   *   NI 在 999/1999/2999 秒各 +1，SI 在 2699 秒 +1；对方该路兵营被毁则换超级兵。
   */
  private spawnWave(): void {
    this.waveNo++;
    const C = this.C;
    const sec = this.clockSec;
    let melee = C.creepMeleeCount;
    for (const s of C.creepMeleeExtraAtSec) if (sec >= s) melee++;
    let ranged = C.creepRangedCount;
    for (const s of C.creepRangedExtraAtSec) if (sec >= s) ranged++;
    const siege = this.waveNo % C.creepSiegeEveryNWaves === 0;
    const upg = Math.floor(sec / C.creepUpgradeIntervalSec); // 每 450 秒升级一次（R007 等：生命 +10、攻击 +1/+2）
    for (let lane = 0; lane < this.setup.lanes.length; lane++) {
      const wps = this.setup.lanes[lane].waypoints;
      for (const team of [0, 1] as const) {
        const raxKey = `${team === 0 ? 'r' : 'd'}_rax_melee_${this.setup.lanes[lane].id}`;
        const raxRKey = `${team === 0 ? 'r' : 'd'}_rax_range_${this.setup.lanes[lane].id}`;
        const set = team === 0 ? this.data.laneCreeps.sentinel : this.data.laneCreeps.scourge;
        const path = team === 0 ? wps.slice(1) : [...wps].reverse().slice(1);
        const origin = team === 0 ? wps[0] : wps[wps.length - 2] || wps[wps.length - 1];
        const meleeAlive = this.buildingByKey.get(raxKey)?.alive !== false;
        const rangedAlive = this.buildingByKey.get(raxRKey)?.alive !== false;
        const megaM = this.megaLane[team][lane];
        const megaR = this.megaRangedLane[team][lane];
        const spawn = (typeId: string, n: number, kind: 'm' | 'r' | 's', row: number) => {
          const def = this.data.units[typeId];
          if (!def) return;
          for (let i = 0; i < n; i++) {
            const dir = team === 0 ? 1 : -1;
            const ox = (i - (n - 1) / 2) * 70;
            const [x, y] = this.grid.nearestFree(origin[0] + ox, origin[1] - dir * row * 70);
            const u = this.newUnit('creep', team, def, x, y);
            u.lane = lane;
            u.waypoints = path;
            u.maxHp += upg * (kind === 's' ? 0 : 10);
            u.hp = u.maxHp;
            u.dmgBonus = upg * (kind === 'm' ? 1 : 2);
          }
        };
        if (meleeAlive) spawn(megaM ? set.megaMelee : set.melee, melee, 'm', 0);
        if (rangedAlive) spawn(megaR ? set.megaRanged : set.ranged, ranged, 'r', 1);
        if (siege && rangedAlive) spawn(megaR ? set.megaSiege : set.siege, 1, 's', 2);
      }
    }
  }

  /** 野怪：整分刷新，营地内仍有存活野怪或有英雄站位（封野）则不刷 */
  private spawnNeutrals(): void {
    const list = [...this.units.values()];
    this.setup.camps.forEach((camp, idx) => {
      for (const u of list) {
        if (!u.alive) continue;
        if (u.kind === 'neutral' && u.campIdx === idx) return;
        if (u.kind !== 'neutral' && this.isMobile(u) && dist(u.x, u.y, camp.x, camp.y) < 360) return;
      }
      const tier = camp.tier || 'small';
      if (tier === 'roshan' && this.clockSec < 0) return;
      const pool = CAMP_POOL[tier] || CAMP_POOL['small'];
      const comp = pool[this.randInt(0, pool.length - 1)];
      comp.forEach((typeId, i) => {
        const def = this.data.units[typeId];
        if (!def) return;
        const ang = (i / comp.length) * Math.PI * 2;
        const r = comp.length === 1 ? 0 : 90;
        const [x, y] = this.grid.nearestFree(camp.x + Math.cos(ang) * r, camp.y + Math.sin(ang) * r);
        const u = this.newUnit('neutral', 2, def, x, y);
        u.campIdx = idx;
        u.homeX = x;
        u.homeY = y;
        u.facing = ang;
      });
    });
  }

  private spawnRunes(first: boolean): void {
    const kinds: Rune['kind'][] = ['dd', 'haste', 'regen', 'invis'];
    const powerSide = this.randInt(0, Math.max(0, this.setup.runeSpots.length - 1));
    this.setup.runeSpots.forEach((s, i) => {
      const kind: Rune['kind'] = first || i !== powerSide ? 'bounty' : kinds[this.randInt(0, kinds.length - 1)];
      this.runes[i] = { spot: i, kind, x: s.x, y: s.y };
    });
  }
  private pickupRunes(): void {
    for (let i = 0; i < this.runes.length; i++) {
      const r = this.runes[i];
      if (!r) continue;
      for (const h of this.heroes) {
        if (!h?.hero || !h.alive || dist(h.x, h.y, r.x, r.y) > 130) continue;
        this.runes[i] = null;
        if (r.kind === 'bounty') {
          const g = 50 + Math.max(0, Math.floor(this.clockSec / 60)) * 2;
          h.hero.gold += g;
          this.addXp(h, 50 + Math.max(0, Math.floor(this.clockSec / 60)) * 5);
          this.events.push({ type: 'float', x: r.x, y: r.y, text: `+${g}`, color: '#fbbf24' });
        } else if (r.kind === 'dd') this.addBuff(h, 'dd', 45, 1);
        else if (r.kind === 'haste') this.addBuff(h, 'haste', 30, 1);
        else if (r.kind === 'regen') this.addBuff(h, 'regen', 30, 1);
        else this.addBuff(h, 'invis', 45, 1);
        this.events.push({ type: 'msg', text: `${h.hero.playerName}(${h.name}) 拾取了 ${RUNE_NAMES[r.kind]}`, color: '#a5b4fc' });
        break;
      }
    }
  }

  // ------------------------------------------------------------------ 电脑玩家
  /** 简易电脑：加点 → 残血回泉 → 跟随本路兵线推进 → 对射程内敌方英雄放技能（逻辑在引擎内，保证各端一致） */
  private runBot(u: Unit): void {
    const h = u.hero;
    if (!h) return;
    h.aiNext = this.tick + 10;
    // 加点：大招 > 普通技能轮流 > 属性
    if (h.skillPoints > 0) {
      const n = h.def.skills.length;
      const order: number[] = [];
      for (let i = n - 2; i >= 0; i--) if ((this.abilityOf(u, i)?.reqLevel || 1) >= 6) order.push(i);
      const normal: number[] = [];
      for (let i = 0; i < n - 1; i++) if ((this.abilityOf(u, i)?.reqLevel || 1) < 6) normal.push(i);
      normal.sort((a, b) => h.abilityLevels[a] - h.abilityLevels[b] || a - b);
      for (const s of [...order, ...normal, n - 1]) {
        if (this.canLearn(u, s)) {
          this.learn(u, s);
          break;
        }
      }
    }
    // 购物：在泉水附近按价格由高到低买得起的属性装
    if (this.nearShop(u, 'base') && h.items.includes(null) && h.gold >= 450) {
      let best: ItemDef | null = null;
      const hasBoots = h.items.some((x) => x && this.data.items[x.code]?.bonus.moveSpeed);
      const prim = h.def.primary;
      for (const s of this.data.shops) {
        for (const code of s.items) {
          const it = this.data.items[code];
          if (!it || it.kind !== 'normal' || it.cost > h.gold || this.shopZoneOf(code) !== 'base') continue;
          const bo = it.bonus;
          if (!hasBoots) {
            // 第一件先出鞋
            if (bo.moveSpeed && (!best || it.cost < best.cost)) best = it;
            continue;
          }
          if (bo.moveSpeed) continue;
          // 之后优先主属性 / 攻击 / 生命装，取买得起的最贵一件
          if (!(bo[prim] || bo.dmg || bo.hp || bo.attackSpeed || bo.armor)) continue;
          if (!best || it.cost > best.cost) best = it;
        }
      }
      if (best) this.buy(u, best.code);
    }
    const fountain = this.fountainOf(u.team);
    const hpPct = u.hp / u.maxHp;
    if (fountain && (hpPct < 0.28 || (u.order.t === 'move' && hpPct < 0.85 && dist(u.x, u.y, fountain.x, fountain.y) < 1200))) {
      if (u.order.t !== 'move') {
        u.order = { t: 'move', x: fountain.x, y: fountain.y };
        this.setPath(u, fountain.x + (u.team === 0 ? 200 : -200), fountain.y + (u.team === 0 ? 200 : -200));
      }
      return;
    }
    // 技能：对射程内最近敌方英雄施放已实现的伤害/控制技能
    let enemy: Unit | null = null;
    let ed = 900;
    for (const o of this.heroes) {
      if (!o || !o.alive || o.team === u.team || this.hasBuff(o, 'invis')) continue;
      const d = dist(u.x, u.y, o.x, o.y);
      if (d < ed) {
        ed = d;
        enemy = o;
      }
    }
    if (enemy && u.order.t !== 'cast') {
      for (let s = 0; s < h.def.skills.length; s++) {
        const ab = this.abilityOf(u, s);
        if (!ab || this.castBlockReason(u, s)) continue;
        const fx = resolveAbilityFx(ab);
        if (!fx.implemented || fx.ally || fx.blink) continue;
        const lv = h.abilityLevels[s];
        const range = ab.range[Math.min(lv, ab.range.length) - 1] || 600;
        if (fx.target === 'unit' && ed <= range + 100) {
          this.orderCast(u, s, undefined, undefined, enemy.id);
          return;
        }
        if (fx.target === 'point' && ed <= range + 100) {
          this.orderCast(u, s, enemy.x, enemy.y);
          return;
        }
        if (fx.target === 'none' && ed <= (fx.aoe[lv - 1] || 300)) {
          this.orderCast(u, s);
          return;
        }
      }
    }
    if (u.order.t === 'cast') return;
    // 避塔：敌方防御塔 900 码内且塔下没有己方小兵抗塔时后撤
    for (const tw of this.unitList) {
      if (!tw.alive || tw.kind !== 'tower' || tw.team === u.team) continue;
      if (dist(u.x, u.y, tw.x, tw.y) > 900) continue;
      let tanks = 0;
      for (const c of this.unitList) {
        if (c.alive && c.kind === 'creep' && c.team === u.team && dist(c.x, c.y, tw.x, tw.y) < 650) tanks++;
      }
      if (tanks === 0 && fountain) {
        const ang = Math.atan2(fountain.y - tw.y, fountain.x - tw.x);
        const bx = tw.x + Math.cos(ang) * 1150;
        const by = tw.y + Math.sin(ang) * 1150;
        u.order = { t: 'move', x: bx, y: by };
        this.setPath(u, bx, by);
        return;
      }
    }
    // 跟兵线：目标点 = 本路最靠前的友方小兵；没有则守本路最外侧存活的塔
    const laneCfg = this.setup.lanes[h.lane] || this.setup.lanes[0];
    if (!laneCfg) return;
    const wps = u.team === 0 ? laneCfg.waypoints : [...laneCfg.waypoints].reverse();
    let front: Unit | null = null;
    let frontIdx = -1;
    for (const c of this.unitList) {
      if (!c.alive || c.kind !== 'creep' || c.team !== u.team || c.lane !== h.lane) continue;
      if (c.wpIdx > frontIdx) {
        frontIdx = c.wpIdx;
        front = c;
      }
    }
    let tx: number;
    let ty: number;
    if (front && this.clockSec > 5) {
      const back = u.atk && u.atk.range > 200 ? 260 : 60;
      const prev = wps[Math.max(0, Math.min(wps.length - 1, front.wpIdx))];
      const ang = Math.atan2(prev[1] - front.y, prev[0] - front.x);
      tx = front.x - Math.cos(ang) * back;
      ty = front.y - Math.sin(ang) * back;
    } else {
      const side = u.team === 0 ? 'r' : 'd';
      const tower = ['t1', 't2', 't3'].map((t) => this.buildingByKey.get(`${side}_${t}_${laneCfg.id}`)).find((b) => b?.alive);
      const anchor = tower || fountain;
      if (!anchor) return;
      tx = anchor.x + (u.team === 0 ? 220 : -220);
      ty = anchor.y + (u.team === 0 ? 220 : -220);
    }
    const o = u.order;
    if (o.t === 'attack') return;
    if (o.t !== 'amove' || dist(o.x, o.y, tx, ty) > 200) {
      u.order = { t: 'amove', x: tx, y: ty };
      this.setPath(u, tx, ty);
    }
  }
}

// ---------------------------------------------------------------------------
function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function containsAll(have: string[], need: string[]): boolean {
  const pool = [...have];
  for (const n of need) {
    const i = pool.indexOf(n);
    if (i < 0) return false;
    pool.splice(i, 1);
  }
  return true;
}
function sumDice(e: GameEngine, dice: number, sides: number): number {
  let s = 0;
  for (let i = 0; i < dice; i++) s += 1 + Math.floor(e.rand() * Math.max(1, sides));
  return s;
}
