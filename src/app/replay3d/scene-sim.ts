import { DEFAULT_SCENE_SYNC_URL } from './dota-map';

export interface SceneLane {
  id: string;
  radiantSpawn: [number, number];
  direSpawn: [number, number];
  waypoints: [number, number][];
}

export interface NeutralCampCfg {
  id: string;
  // --- AI 修改开始 [SCENE-SIM]：支持野怪营地名称、等级 tier 与缺省数量兜底 ---
  name?: string;
  x: number;
  y: number;
  count?: number;
  tier?: 'small' | 'medium' | 'large' | 'ancient' | 'roshan';
  // --- AI 修改结束 [SCENE-SIM]：支持野怪营地名称、等级 tier 与缺省数量兜底 ---
  scale?: number;
  // --- AI 修改开始 [NEUTRAL-COMPOSITION]：营地可配置异种单位组合（对齐 DotA 小/中/大/远古/肉山差异） ---
  composition?: string[];
  // --- AI 修改结束 [NEUTRAL-COMPOSITION] ---
}

// --- AI 修改开始 [RUNE-SIM]：新增河道神符点配置与神符状态类型定义 ---
export interface RuneSpotCfg {
  id: string;
  name: string;
  x: number;
  y: number;
}

export type RuneKind = 'bounty' | 'dd' | 'haste' | 'illusion' | 'invis' | 'regen';

export interface SimRune {
  spotId: string;
  spotName: string;
  kind: RuneKind;
  nameCn: string;
  x: number;
  y: number;
  z: number;
  teamColor: number;
  colorHex: string;
  spawnedAtMs: number;
  alive: boolean;
  yaw: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  instance: any;
}
// --- AI 修改结束 [RUNE-SIM]：新增河道神符点配置与神符状态类型定义 ---

// --- AI 修改开始 [TOWER-COMBAT]：新增防御塔战斗实体定义，支持防御塔攻击小兵/英雄及小兵攻塔碰撞 ---
export interface SimTower {
  id: string;
  name: string;
  team: 0 | 1;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  dps: number;
  range: number;
  alive: boolean;
  standSeq: number;
  attackSeq: number;
  deathSeq: number;
  inCombat?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  instance: any;
}
// --- AI 修改结束 [TOWER-COMBAT]：新增防御塔战斗实体定义，支持防御塔攻击小兵/英雄及小兵攻塔碰撞 ---

export interface SceneSyncConfig {
  enabled: boolean;
  heroMoveSpeed: number;
  creepWaveIntervalMs: number;
  creepWaveSize: number;
  creepMoveSpeed: number;
  neutralRefreshMs: number;
  // --- AI 修改开始 [RUNE-SIM]：新增神符刷新间隔与河道神符点数组配置 ---
  runeRefreshMs?: number;
  // --- AI 修改结束 [RUNE-SIM]：新增神符刷新间隔与河道神符点数组配置 ---
  startCreepsAtMs: number;
  startNeutralsAtMs: number;
  lanes: SceneLane[];
  neutralCamps: NeutralCampCfg[];
  // --- AI 修改开始 [RUNE-SIM]：河道神符点配置列表 ---
  runeSpots?: RuneSpotCfg[];
  // --- AI 修改结束 [RUNE-SIM]：河道神符点配置列表 ---
}

export interface SimUnit {
  id: string;
  kind: 'creep' | 'neutral';
  team: 0 | 1 | -1;
  x: number;
  y: number;
  z: number;
  speed: number;
  scale: number;
  waypoints: [number, number][];
  wpIndex: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  instance: any;
  alive: boolean;
  campId?: string;
  // --- AI 修改开始 [SCENE-SIM]：新增兵线与野怪生命值、攻击力及动画序列索引，支持小兵交战与打野刷新 ---
  hp: number;
  maxHp: number;
  dps: number;
  walkSeq: number;
  standSeq: number;
  attackSeq: number;
  deathSeq: number;
  inCombat?: boolean;
  // --- AI 修改结束 [SCENE-SIM]：新增兵线与野怪生命值、攻击力及动画序列索引，支持小兵交战与打野刷新 ---
}

// --- AI 修改开始 [COMBAT-GOLD-SIM]：飘金数字与战斗血条实体接口定义 ---
export interface SimFloatingText {
  id: number;
  text: string;
  x: number;
  y: number;
  z: number;
  color: string;
  createdAtMs: number;
  durationMs: number;
}

export interface SimHealthEntity {
  id: string;
  name: string;
  team: 0 | 1 | -1;
  kind: 'hero' | 'creep' | 'neutral' | 'tower';
  x: number;
  y: number;
  z: number;
  hp: number;
  maxHp: number;
}
// --- AI 修改结束 [COMBAT-GOLD-SIM]：飘金数字与战斗血条实体接口定义 ---

export type HeightSampler = (x: number, y: number) => number;
export type ModelSpawner = (opts: {
  path: string;
  x: number;
  y: number;
  z: number;
  teamColor: number;
  scale: number;
  sequenceHint?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) => Promise<any | null>;

const DEFAULT_CFG: SceneSyncConfig = {
  enabled: true,
  heroMoveSpeed: 320,
  creepWaveIntervalMs: 30000,
  creepWaveSize: 4,
  creepMoveSpeed: 270,
  neutralRefreshMs: 60000,
  // --- AI 修改开始 [RUNE-SIM]：默认每 2 分钟（120000ms）刷新河道神符，并提供 war3map.j 标准神符点兜底 ---
  runeRefreshMs: 120000,
  // --- AI 修改结束 [RUNE-SIM]：默认每 2 分钟（120000ms）刷新河道神符，并提供 war3map.j 标准神符点兜底 ---
  startCreepsAtMs: 90000,
  startNeutralsAtMs: 30000,
  lanes: [],
  neutralCamps: [],
  // --- AI 修改开始 [RUNE-SIM]：DotA 6.83d 上/下河道神符点精确坐标（源自 war3map.j Rect G4/D4） ---
  runeSpots: [
    { id: 'rune_top', name: '上河道神符点', x: -2352, y: 1648 },
    { id: 'rune_bot', name: '下河道神符点', x: 3008, y: -2832 },
  ],
  // --- AI 修改结束 [RUNE-SIM]：DotA 6.83d 上/下河道神符点精确坐标（源自 war3map.j Rect G4/D4） ---
};

// --- AI 修改开始 [RUNE-SIM]：DotA 6.83d 6 种神符元数据定义 ---
const RUNE_SPECS: Record<
  RuneKind,
  { nameCn: string; teamColor: number; colorHex: string; scale: number }
> = {
  bounty: { nameCn: '赏金神符', teamColor: 9, colorHex: '#f59e0b', scale: 1.25 },
  dd: { nameCn: '双倍神符', teamColor: 1, colorHex: '#38bdf8', scale: 1.3 },
  haste: { nameCn: '极速神符', teamColor: 0, colorHex: '#ef4444', scale: 1.3 },
  illusion: { nameCn: '幻象神符', teamColor: 4, colorHex: '#facc15', scale: 1.3 },
  invis: { nameCn: '隐身神符', teamColor: 3, colorHex: '#a855f7', scale: 1.3 },
  regen: { nameCn: '恢复神符', teamColor: 6, colorHex: '#22c55e', scale: 1.3 },
};
const POWERUP_RUNES: RuneKind[] = ['dd', 'haste', 'illusion', 'invis', 'regen'];

function findSeqIndex(instance: any, hint: string, fallback = 0): number {
  const seqs = instance?.model?.sequences as { name?: string }[] | undefined;
  if (!seqs?.length) return fallback;
  const h = hint.toLowerCase();
  const exact = seqs.findIndex((s) => String(s.name || '').toLowerCase().trim() === h);
  if (exact >= 0) return exact;
  const sub = seqs.findIndex((s) => String(s.name || '').toLowerCase().includes(h));
  return sub >= 0 ? sub : fallback;
}
// --- AI 修改结束 [RUNE-SIM]：DotA 6.83d 6 种神符元数据定义 ---

// --- AI 修改开始 [NEUTRAL-COMPOSITION]：有限模型库下的 DotA 风格营地异种组合 ---
type NeutralSpec = { path: string; scale: number; hp: number; dps: number };

const NEUTRAL_SPECS: Record<string, NeutralSpec> = {
  kobold_foreman: { path: 'Units\\Creeps\\Kobold\\Kobold.mdx', scale: 1.15, hp: 420, dps: 22 },
  kobold: { path: 'Units\\Creeps\\Kobold\\Kobold.mdx', scale: 0.88, hp: 260, dps: 14 },
  forest_troll: { path: 'Units\\Creeps\\ForestTroll\\ForestTroll.mdx', scale: 1.0, hp: 560, dps: 28 },
  centaur_khan: { path: 'Units\\Creeps\\CentaurKhan\\CentaurKhan.mdx', scale: 1.12, hp: 950, dps: 36 },
  centaur: { path: 'Units\\Creeps\\CentaurKhan\\CentaurKhan.mdx', scale: 0.92, hp: 680, dps: 28 },
  furbolg: { path: 'Units\\Creeps\\Furbolg\\Furbolg.mdx', scale: 1.05, hp: 800, dps: 32 },
  rock_golem: { path: 'Units\\Creeps\\RockGolem\\RockGolem.mdx', scale: 1.15, hp: 1200, dps: 40 },
  roshan: { path: 'Units\\Creeps\\RockGolem\\RockGolem.mdx', scale: 1.55, hp: 4500, dps: 65 },
};

function resolveNeutralSpecs(camp: NeutralCampCfg): NeutralSpec[] {
  if (camp.composition?.length) {
    // composition 自带相对体型；不再乘 camp.scale，避免 Roshan 等被二次放大
    return camp.composition.map((key) => NEUTRAL_SPECS[key] || NEUTRAL_SPECS['kobold']);
  }
  const count =
    camp.count ??
    (camp.tier === 'roshan' ? 1 : camp.tier === 'large' || camp.tier === 'ancient' ? 2 : 3);
  const fallbackKey =
    camp.tier === 'roshan'
      ? 'roshan'
      : camp.tier === 'ancient'
        ? 'rock_golem'
        : camp.tier === 'large'
          ? camp.id.includes('2')
            ? 'furbolg'
            : 'centaur_khan'
          : camp.tier === 'medium'
            ? 'forest_troll'
            : 'kobold';
  const base = NEUTRAL_SPECS[fallbackKey];
  return Array.from({ length: count }, () => ({
    ...base,
    scale: camp.scale ?? base.scale,
  }));
}
// --- AI 修改结束 [NEUTRAL-COMPOSITION] ---

export async function loadSceneSyncConfig(url = DEFAULT_SCENE_SYNC_URL): Promise<SceneSyncConfig> {
  try {
    // --- AI 修改开始 [CACHE-BUST]：开发期给 scene-sync.json 加时间戳，避免浏览器一直用旧兵线/野怪配置 ---
    const bust = url.includes('?') ? `&_=${Date.now()}` : `?_=${Date.now()}`;
    const res = await fetch(url + bust, { cache: 'no-store' });
    // --- AI 修改结束 [CACHE-BUST] ---
    if (!res.ok) return { ...DEFAULT_CFG };
    const raw = (await res.json()) as Partial<SceneSyncConfig>;
    return { ...DEFAULT_CFG, ...raw };
  } catch {
    return { ...DEFAULT_CFG };
  }
}

/** Merge query/live overrides onto base sync config. */
export function applySyncOverrides(
  base: SceneSyncConfig,
  overrides?: Partial<SceneSyncConfig> | null
): SceneSyncConfig {
  if (!overrides) return base;
  return {
    ...base,
    ...overrides,
    lanes: overrides.lanes?.length ? overrides.lanes : base.lanes,
    neutralCamps: overrides.neutralCamps?.length ? overrides.neutralCamps : base.neutralCamps,
    // --- AI 修改开始 [RUNE-SIM]：合并神符点覆盖配置 ---
    runeSpots: overrides.runeSpots?.length ? overrides.runeSpots : base.runeSpots,
    // --- AI 修改结束 [RUNE-SIM]：合并神符点覆盖配置 ---
  };
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.hypot(dx, dy);
}

function moveToward(
  x: number,
  y: number,
  tx: number,
  ty: number,
  step: number
): { x: number; y: number; arrived: boolean } {
  const d = dist2(x, y, tx, ty);
  if (d <= step || d < 1e-3) return { x: tx, y: ty, arrived: true };
  const k = step / d;
  return { x: x + (tx - x) * k, y: y + (ty - y) * k, arrived: false };
}

/**
 * Lightweight DotA scene simulator: hero pathing, lane creeps, neutral refresh.
 * Driven by scene-sync.json (+ optional live overrides).
 */
export class DotaSceneSim {
  cfg: SceneSyncConfig;
  units: SimUnit[] = [];
  // --- AI 修改开始 [RUNE-SIM]：当前河道神符列表与神符刷新计时器 ---
  runes: SimRune[] = [];
  lastRunePickupMsg = '';
  // --- AI 修改结束 [RUNE-SIM]：当前河道神符列表与神符刷新计时器 ---
  // --- AI 修改开始 [TOWER-COMBAT]：当前场景防御塔列表 ---
  towers: SimTower[] = [];
  // --- AI 修改结束 [TOWER-COMBAT]：当前场景防御塔列表 ---
  heroTarget: { x: number; y: number } | null = null;
  clockMs = 0;
  private nextWaveAt = 0;
  private nextNeutralAt = 0;
  // --- AI 修改开始 [RUNE-SIM]：神符刷新时间戳与上一轮强化神符记录（对齐 war3map.j function CAO 不重复规则） ---
  private nextRuneAt = 0;
  private runeSerial = 0;
  private lastPowerupIdx = -1;
  private spawningWave = false;
  private refreshingNeutrals = false;
  private refreshingRunes = false;
  // --- AI 修改结束 [RUNE-SIM]：神符刷新时间戳与上一轮强化神符记录（对齐 war3map.j function CAO 不重复规则） ---
  private waveSerial = 0;
  private creepModelPath = 'Units\\NightElf\\Wisp\\Wisp.mdx';
  private neutralModelPath = 'Units\\NightElf\\Wisp\\Wisp.mdx';
  private heroWalkSeq = -1;
  private heroStandSeq = -1;
  // --- AI 修改开始 [COMBAT-GOLD-SIM]：英雄战斗属性、金钱统计与飘金粒子池 ---
  private heroAttackSeq = -1;
  heroHp = 680;
  heroMaxHp = 680;
  heroDps = 82;
  heroTeam: 0 | 1 = 0;
  goldTotal = 603;
  floatingTexts: SimFloatingText[] = [];
  private floatingSerial = 0;
  // --- AI 修改结束 [COMBAT-GOLD-SIM]：英雄战斗属性、金钱统计与飘金粒子池 ---

  constructor(
    cfg: SceneSyncConfig,
    private readonly sampleHeight: HeightSampler,
    private readonly spawnModel: ModelSpawner,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly heroInstance: any | null,
    private readonly resolveHeroSeq: (name: string) => number
  ) {
    this.cfg = cfg;
    this.heroWalkSeq = resolveHeroSeq('Walk');
    this.heroStandSeq = resolveHeroSeq('Stand');
    // --- AI 修改开始 [COMBAT-GOLD-SIM]：解析英雄 Attack 攻击动作序列索引 ---
    this.heroAttackSeq = resolveHeroSeq('Attack');
    // --- AI 修改结束 [COMBAT-GOLD-SIM]：解析英雄 Attack 攻击动作序列索引 ---
    this.nextWaveAt = cfg.startCreepsAtMs;
    this.nextNeutralAt = cfg.startNeutralsAtMs;
    // --- AI 修改开始 [RUNE-SIM]：0:00 开局首次刷符，之后每 120000ms（2分钟）刷新 ---
    this.nextRuneAt = 0;
    // --- AI 修改结束 [RUNE-SIM]：0:00 开局首次刷符，之后每 120000ms（2分钟）刷新 ---
  }

  setConfig(cfg: SceneSyncConfig): void {
    this.cfg = cfg;
  }

  // --- AI 修改开始 [TOWER-COMBAT]：注册地图上的近卫与天灾防御塔实例以参与兵线战斗与碰撞阻挡 ---
  registerTowers(
    rawTowers: {
      id: string;
      name: string;
      team: 0 | 1;
      x: number;
      y: number;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      instance: any;
    }[]
  ): void {
    this.towers = rawTowers.map((t) => ({
      id: t.id,
      name: t.name,
      team: t.team,
      x: t.x,
      y: t.y,
      hp: 1600,
      maxHp: 1600,
      dps: 118,
      range: 700,
      alive: true,
      standSeq: findSeqIndex(t.instance, 'Stand', 0),
      attackSeq: findSeqIndex(t.instance, 'Attack', 0),
      deathSeq: findSeqIndex(t.instance, 'Death', 0),
      inCombat: false,
      instance: t.instance,
    }));
  }
  // --- AI 修改结束 [TOWER-COMBAT]：注册地图上的近卫与天灾防御塔实例以参与兵线战斗与碰撞阻挡 ---

  setHeroMoveTarget(x: number, y: number): void {
    this.heroTarget = { x, y };
    if (this.heroInstance && this.heroWalkSeq >= 0) {
      this.heroInstance.setSequence(this.heroWalkSeq);
    }
  }

  getHeroPosition(): { x: number; y: number; z: number } | null {
    if (!this.heroInstance) return null;
    const loc = this.heroInstance.localLocation || this.heroInstance.location || [0, 0, 0];
    return { x: loc[0] || 0, y: loc[1] || 0, z: loc[2] || 0 };
  }

  async bootstrap(): Promise<void> {
    if (!this.cfg.enabled) return;
    // --- AI 修改开始 [CREEP-AFTER-HORN]：号角后 90s 才出第一波兵；bootstrap 不再立刻 spawnWave，避免家门口开局堵兵 ---
    this.nextWaveAt = Math.max(0, this.cfg.startCreepsAtMs ?? 90000);
    this.nextNeutralAt = Math.max(0, this.cfg.startNeutralsAtMs ?? 30000);
    this.nextRuneAt = 0;
    // 野怪/神符可在对局时钟推进到点后再刷；此处不预刷兵线
    // --- AI 修改结束 [CREEP-AFTER-HORN] ---
  }

  /**
   * 将模拟对齐到录像「号角后」对局时间。
   * 有录像时由 UI 每帧调用（墙钟 simSpeed=0），用 catch-up tick 推进，避免暂停仍刷兵。
   */
  syncGameClock(gameTimeMs: number): void {
    const t = Math.max(0, gameTimeMs);
    if (Math.abs(t - this.clockMs) < 0.5) return;
    // 回退：清兵并重置刷兵计时
    if (t + 50 < this.clockMs) {
      for (const u of [...this.units]) {
        try {
          u.instance?.detach?.();
          u.instance?.setScene?.(null);
        } catch {
          /* ignore */
        }
      }
      this.units = [];
      this.clockMs = t;
      this.nextWaveAt = Math.max(t, this.cfg.startCreepsAtMs ?? 90000);
      // 若已过首波时间，排到下一档 30s 周期，避免瞬间补刷多波
      const interval = this.cfg.creepWaveIntervalMs || 30000;
      const start = this.cfg.startCreepsAtMs ?? 90000;
      if (t >= start) {
        const n = Math.floor((t - start) / interval) + 1;
        this.nextWaveAt = start + n * interval;
      }
      this.nextNeutralAt = Math.max(t, this.cfg.startNeutralsAtMs ?? 30000);
      this.nextRuneAt = t <= 0 ? 0 : Math.max(t, this.cfg.runeRefreshMs || 120000);
      return;
    }
    // 前进：分段 tick，触发出兵/移动
    let remain = t - this.clockMs;
    while (remain > 0) {
      const step = Math.min(remain, 50);
      this.tick(step);
      remain -= step;
    }
  }

  /** Per-frame update (sync). Spawns are kicked off without blocking the render loop. */
  tick(dtMs: number): void {
    if (!this.cfg.enabled) return;
    this.clockMs += dtMs;
    this.tickHero(dtMs / 1000);
    // --- AI 修改开始 [COMBAT-GOLD-SIM]：每帧驱动英雄与敌方单位战斗及飘金粒子更新 ---
    this.tickHeroCombat(dtMs / 1000);
    // --- AI 修改结束 [COMBAT-GOLD-SIM]：每帧驱动英雄与敌方单位战斗及飘金粒子更新 ---
    // --- AI 修改开始 [TOWER-COMBAT]：每帧更新防御塔索敌攻击逻辑 ---
    this.tickTowers(dtMs / 1000);
    // --- AI 修改结束 [TOWER-COMBAT]：每帧更新防御塔索敌攻击逻辑 ---
    this.tickUnits(dtMs / 1000);
    // --- AI 修改开始 [RUNE-SIM]：每帧更新河道神符自转与英雄拾取判定，并按时触发自动出兵、自动刷野、自动刷符 ---
    this.tickRunes(dtMs / 1000);
    // --- AI 修改开始 [COMBAT-GOLD-SIM]：更新飘金粒子上浮与淡出生命周期 ---
    this.tickFloatingTexts(dtMs);
    // --- AI 修改结束 [COMBAT-GOLD-SIM]：更新飘金粒子上浮与淡出生命周期 ---

    if (this.clockMs >= this.nextWaveAt) {
      this.nextWaveAt = this.clockMs + (this.cfg.creepWaveIntervalMs || 30000);
      void this.spawnWave();
    }
    if (this.clockMs >= this.nextNeutralAt) {
      this.nextNeutralAt = this.clockMs + (this.cfg.neutralRefreshMs || 60000);
      void this.refreshEmptyNeutralCamps(false);
    }
    const runeInterval = this.cfg.runeRefreshMs || 120000;
    if (this.clockMs >= this.nextRuneAt) {
      this.nextRuneAt = this.clockMs + runeInterval;
      void this.refreshRunes(false);
    }
    // --- AI 修改结束 [RUNE-SIM]：每帧更新河道神符自转与英雄拾取判定，并按时触发自动出兵、自动刷野、自动刷符 ---
  }

  dispose(): void {
    for (const u of this.units) {
      try {
        u.instance?.detach?.();
        u.instance?.setScene?.(null);
      } catch {
        /* ignore */
      }
      u.alive = false;
    }
    this.units = [];
    // --- AI 修改开始 [RUNE-SIM]：清理河道神符 3D 实例 ---
    for (const r of this.runes) {
      try {
        r.instance?.detach?.();
        r.instance?.setScene?.(null);
      } catch {
        /* ignore */
      }
      r.alive = false;
    }
    this.runes = [];
    // --- AI 修改结束 [RUNE-SIM]：清理河道神符 3D 实例 ---
  }

  private tickHero(dt: number): void {
    if (!this.heroInstance || !this.heroTarget) return;
    const loc = this.heroInstance.localLocation || this.heroInstance.location || [0, 0, 0];
    const x0 = loc[0] || 0;
    const y0 = loc[1] || 0;
    const step = this.cfg.heroMoveSpeed * dt;
    const { x, y, arrived } = moveToward(x0, y0, this.heroTarget.x, this.heroTarget.y, step);
    const z = this.sampleHeight(x, y);
    this.heroInstance.setLocation([x, y, z]);
    // Face movement direction (WC3 Z-up; facing around Z).
    const ang = Math.atan2(this.heroTarget.y - y0, this.heroTarget.x - x0);
    try {
      // --- AI 删除开始 [SCENE-SIM]：删除错误的欧拉角 setRotation(0,0,ang) 与标量 face(ang)，原因：mdx-m3-viewer 的 setRotation 需要四元数数组且 face 需要三维目标向量，原写法会导致变换矩阵变为 NaN ---
      // this.heroInstance.setRotation?.(0, 0, ang);
      // this.heroInstance.face?.(ang);
      // --- AI 删除结束 [SCENE-SIM] ---
      // --- AI 修改开始 [SCENE-SIM]：使用绕 Z 轴四元数设置英雄朝向 ---
      this.heroInstance.setRotation?.([0, 0, Math.sin(ang / 2), Math.cos(ang / 2)]);
      // --- AI 修改结束 [SCENE-SIM]：使用绕 Z 轴四元数设置英雄朝向 ---
    } catch {
      /* optional API */
    }
    if (arrived) {
      this.heroTarget = null;
      if (this.heroStandSeq >= 0) this.heroInstance.setSequence(this.heroStandSeq);
    }
  }

  // --- AI 修改开始 [COMBAT-GOLD-SIM]：实现英雄与敌方小兵/野怪之间的双向普攻伤害与受击扣血 ---
  private tickHeroCombat(dt: number): void {
    const heroPos = this.getHeroPosition();
    if (!heroPos || !this.heroInstance) return;

    // 寻找 260 码内的敌方小兵或野怪作为攻击目标
    let targetEnemy: SimUnit | null = null;
    let minDist = 260;
    for (const u of this.units) {
      if (!u.alive || u.team === this.heroTeam) continue;
      const d = dist2(heroPos.x, heroPos.y, u.x, u.y);
      if (d < minDist) {
        minDist = d;
        targetEnemy = u;
      }
    }

    if (targetEnemy) {
      if (!this.heroTarget) {
        const ang = Math.atan2(targetEnemy.y - heroPos.y, targetEnemy.x - heroPos.x);
        this.heroInstance.setRotation?.([0, 0, Math.sin(ang / 2), Math.cos(ang / 2)]);
        if (
          this.heroAttackSeq >= 0 &&
          (this.heroInstance.sequence !== this.heroAttackSeq || this.heroInstance.sequenceEnded)
        ) {
          this.heroInstance.setSequence?.(this.heroAttackSeq);
        }
      }
      targetEnemy.hp -= this.heroDps * dt;
      this.heroHp = Math.max(90, this.heroHp - targetEnemy.dps * 0.45 * dt);

      if (targetEnemy.hp <= 0) {
        const bounty = targetEnemy.kind === 'neutral' ? 52 : Math.floor(Math.random() * 11) + 38;
        this.killUnit(targetEnemy, true, bounty);
      }
    } else if (this.heroHp < this.heroMaxHp) {
      this.heroHp = Math.min(this.heroMaxHp, this.heroHp + 5.5 * dt);
    }
  }
  // --- AI 修改结束 [COMBAT-GOLD-SIM]：实现英雄与敌方小兵/野怪之间的双向普攻伤害与受击扣血 ---

  // --- AI 修改开始 [TOWER-COMBAT]：防御塔自动攻击射程（700码）内的敌方小兵与英雄 ---
  private tickTowers(dt: number): void {
    const heroPos = this.getHeroPosition();
    for (const tower of this.towers) {
      if (!tower.alive) continue;
      let targetCreep: SimUnit | null = null;
      let minDist = tower.range;
      for (const u of this.units) {
        if (!u.alive || u.kind !== 'creep' || u.team === tower.team) continue;
        const d = dist2(tower.x, tower.y, u.x, u.y);
        if (d < minDist) {
          minDist = d;
          targetCreep = u;
        }
      }

      if (targetCreep) {
        tower.inCombat = true;
        const ang = Math.atan2(targetCreep.y - tower.y, targetCreep.x - tower.x);
        // WatchTower 无旋转骨骼，AncientProtector 可面向目标并播放 Attack 动画
        if (tower.team === 0) {
          tower.instance?.setRotation?.([0, 0, Math.sin(ang / 2), Math.cos(ang / 2)]);
        }
        if (
          tower.attackSeq >= 0 &&
          (tower.instance?.sequence !== tower.attackSeq || tower.instance?.sequenceEnded)
        ) {
          tower.instance?.setSequence?.(tower.attackSeq);
        }
        targetCreep.hp -= tower.dps * dt;
        if (targetCreep.hp <= 0) {
          this.killUnit(targetCreep, false);
        }
        continue;
      }

      // 若射程内无敌方小兵且敌方（天灾塔对近卫英雄）英雄进入 700 码射程，防御塔同样朝向英雄攻击
      if (tower.team === 1 && heroPos && dist2(tower.x, tower.y, heroPos.x, heroPos.y) <= tower.range) {
        tower.inCombat = true;
        if (
          tower.attackSeq >= 0 &&
          (tower.instance?.sequence !== tower.attackSeq || tower.instance?.sequenceEnded)
        ) {
          tower.instance?.setSequence?.(tower.attackSeq);
        }
        continue;
      }

      if (tower.inCombat) {
        tower.inCombat = false;
        if (tower.standSeq >= 0) {
          tower.instance?.setSequence?.(tower.standSeq);
        }
      } else if (tower.instance?.sequenceEnded && tower.standSeq >= 0) {
        tower.instance.setSequence(tower.standSeq);
      }
    }
  }
  // --- AI 修改结束 [TOWER-COMBAT]：防御塔自动攻击射程（700码）内的敌方小兵与英雄 ---

  private tickUnits(dt: number): void {
    // --- AI 修改开始 [SCENE-SIM]：实现近卫/天灾兵线相遇交战互砍、小兵攻击敌方防御塔与绕行防穿模、英雄刷野战斗及阵亡清理逻辑 ---
    const heroPos = this.getHeroPosition();
    for (const u of this.units) {
      if (!u.alive) continue;

      if (u.kind === 'creep') {
        // 查找 280 码内最近的敌方小兵进行交战
        let targetEnemy: SimUnit | null = null;
        let minDist = 280;
        for (const other of this.units) {
          if (!other.alive || other.kind !== 'creep' || other.team === u.team) continue;
          const d = dist2(u.x, u.y, other.x, other.y);
          if (d < minDist) {
            minDist = d;
            targetEnemy = other;
          }
        }

        if (targetEnemy) {
          u.inCombat = true;
          const ang = Math.atan2(targetEnemy.y - u.y, targetEnemy.x - u.x);
          u.instance?.setRotation?.([0, 0, Math.sin(ang / 2), Math.cos(ang / 2)]);
          if (u.attackSeq >= 0 && (u.instance?.sequence !== u.attackSeq || u.instance?.sequenceEnded)) {
            u.instance?.setSequence?.(u.attackSeq);
          }
          // 双方都在各自 tick 中输出伤害，形成互砍；同时确保 Attack 序列循环
          targetEnemy.hp -= u.dps * dt;
          if (targetEnemy.hp <= 0) {
            this.killUnit(targetEnemy, u.team === 0);
          }
          continue;
        }

        // 若附近无敌方小兵，检测 235 码内是否有敌方防御塔，停下攻塔而非直接穿塔而过
        let targetTower: SimTower | null = null;
        let minTowerDist = 235;
        for (const tower of this.towers) {
          if (!tower.alive || tower.team === u.team) continue;
          const d = dist2(u.x, u.y, tower.x, tower.y);
          if (d < minTowerDist) {
            minTowerDist = d;
            targetTower = tower;
          }
        }

        if (targetTower) {
          u.inCombat = true;
          const ang = Math.atan2(targetTower.y - u.y, targetTower.x - u.x);
          u.instance?.setRotation?.([0, 0, Math.sin(ang / 2), Math.cos(ang / 2)]);
          if (u.attackSeq >= 0 && (u.instance?.sequence !== u.attackSeq || u.instance?.sequenceEnded)) {
            u.instance?.setSequence?.(u.attackSeq);
          }
          targetTower.hp -= u.dps * 0.42 * dt;
          if (targetTower.hp <= 0) {
            // 防御塔在录像回放模式下保留耐久，避免建筑永久消失
            targetTower.hp = targetTower.maxHp * 0.65;
          }
          continue;
        }

        if (u.inCombat) {
          u.inCombat = false;
          if (u.walkSeq >= 0) u.instance?.setSequence?.(u.walkSeq);
        }
      } else if (u.kind === 'neutral' && heroPos) {
        // 英雄靠近野怪营地（320码内）时触发打野交战
        const dHero = dist2(u.x, u.y, heroPos.x, heroPos.y);
        if (dHero <= 320) {
          u.inCombat = true;
          const ang = Math.atan2(heroPos.y - u.y, heroPos.x - u.x);
          u.instance?.setRotation?.([0, 0, Math.sin(ang / 2), Math.cos(ang / 2)]);
          if (u.attackSeq >= 0 && (u.instance?.sequence !== u.attackSeq || u.instance?.sequenceEnded)) {
            u.instance?.setSequence?.(u.attackSeq);
          }
          u.hp -= 85 * dt;
          if (u.hp <= 0) {
            this.killUnit(u, true, u.kind === 'neutral' ? 68 : undefined);
          }
          continue;
        } else if (u.inCombat) {
          u.inCombat = false;
          if (u.standSeq >= 0) u.instance?.setSequence?.(u.standSeq);
        }
      }

      if (!u.waypoints.length) {
        if (u.instance?.sequenceEnded && u.standSeq >= 0) {
          u.instance.setSequence(u.standSeq);
        }
        continue;
      }
      if (u.wpIndex >= u.waypoints.length) {
        // Creeps that finish the lane despawn; neutrals idle.
        if (u.kind === 'creep') {
          u.alive = false;
          try {
            u.instance?.detach?.();
            u.instance?.setScene?.(null);
          } catch {
            /* ignore */
          }
        }
        continue;
      }
      const [tx, ty] = u.waypoints[u.wpIndex];
      const step = u.speed * dt;
      const prevX = u.x;
      const prevY = u.y;
      const moved = moveToward(u.x, u.y, tx, ty, step);
      let nextX = moved.x;
      let nextY = moved.y;
      const arrived = moved.arrived;
      // --- AI 修改开始 [TOWER-COMBAT]：小兵行进时对防御塔基座（半径 145 码）做碰撞排斥，防止小兵直接从防御塔模型中心穿过 ---
      if (u.kind === 'creep') {
        for (const tower of this.towers) {
          if (!tower.alive) continue;
          const dxT = nextX - tower.x;
          const dyT = nextY - tower.y;
          const dT = Math.hypot(dxT, dyT);
          const minR = 145;
          if (dT < minR) {
            const nx = dT > 1 ? dxT / dT : 0.707;
            const ny = dT > 1 ? dyT / dT : 0.707;
            nextX = tower.x + nx * minR;
            nextY = tower.y + ny * minR;
          }
        }
      }
      // --- AI 修改结束 [TOWER-COMBAT]：小兵行进时对防御塔基座（半径 145 码）做碰撞排斥，防止小兵直接从防御塔模型中心穿过 ---
      u.x = nextX;
      u.y = nextY;
      u.z = this.sampleHeight(u.x, u.y);
      u.instance?.setLocation?.([u.x, u.y, u.z]);
      if (Math.hypot(tx - prevX, ty - prevY) > 1) {
        const ang = Math.atan2(ty - prevY, tx - prevX);
        u.instance?.setRotation?.([0, 0, Math.sin(ang / 2), Math.cos(ang / 2)]);
      }
      if (u.instance?.sequenceEnded && u.walkSeq >= 0) {
        u.instance.setSequence(u.walkSeq);
      }
      if (arrived) u.wpIndex += 1;
    }
    this.units = this.units.filter((u) => u.alive);
    // --- AI 修改结束 [SCENE-SIM]：实现近卫/天灾兵线相遇交战互砍、小兵攻击敌方防御塔与绕行防穿模、英雄刷野战斗及阵亡清理逻辑 ---
  }

  // --- AI 修改开始 [COMBAT-DEATH]：统一阵亡：先切 Death 序列再移除，并按需飘金 ---
  private killUnit(unit: SimUnit, grantGold: boolean, bountyOverride?: number): void {
    if (!unit.alive) return;
    unit.alive = false;
    unit.hp = 0;
    try {
      if (unit.deathSeq >= 0) {
        unit.instance?.setSequence?.(unit.deathSeq);
      }
    } catch {
      /* ignore */
    }
    const remove = () => {
      try {
        unit.instance?.detach?.();
        unit.instance?.setScene?.(null);
      } catch {
        /* ignore */
      }
    };
    // 给 Death 动画一帧窗口；无 death 序列则立即移除
    if (unit.deathSeq >= 0) {
      setTimeout(remove, 450);
    } else {
      remove();
    }
    if (grantGold) {
      const bounty =
        bountyOverride ??
        (unit.kind === 'neutral' ? 52 : Math.floor(Math.random() * 11) + 38);
      this.goldTotal += bounty;
      this.addFloatingText('+' + bounty, unit.x, unit.y, unit.z + 45, '#fbbf24');
    }
  }
  // --- AI 修改结束 [COMBAT-DEATH] ---

  private async spawnWave(): Promise<void> {
    if (!this.cfg.lanes.length || this.spawningWave) return;
    // --- AI 修改开始 [SCENE-SIM]：限制场上兵线单位总数上限，防止长时间运行堆积过多实例 ---
    const activeCreeps = this.units.filter((u) => u.alive && u.kind === 'creep').length;
    if (activeCreeps >= 72) return;
    this.spawningWave = true;
    // --- AI 修改结束 [SCENE-SIM]：限制场上兵线单位总数上限，防止长时间运行堆积过多实例 ---
    try {
      this.waveSerial += 1;
      for (const lane of this.cfg.lanes) {
        // --- AI 删除开始 [LANE-WAYPOINTS]：删除包含自身出生点与终点反向折返的原始路径，原因：原写法导致天灾上路小兵出生后先往天灾基地冰封王座方向乱跑再折返 ---
        // const forward = lane.waypoints;
        // const reverse = [...lane.waypoints].reverse();
        // --- AI 删除结束 [LANE-WAYPOINTS] ---
        // --- AI 修改开始 [LANE-WAYPOINTS]：跳过出生点自身；终点使用 buildings.json 天灾/近卫遗迹坐标 ---
        const forward: [number, number][] = [...lane.waypoints.slice(1)];
        const reverse: [number, number][] = [...[...lane.waypoints].reverse().slice(1)];
        if (!forward.length || forward[forward.length - 1][0] !== 5184) {
          forward.push([5184, 4864]);
        }
        if (!reverse.length || reverse[reverse.length - 1][0] !== -5632) {
          reverse.push([-5632, -6144]);
        }
        // --- AI 修改结束 [LANE-WAYPOINTS] ---
        await this.spawnCreepGroup(lane.id, 0, lane.radiantSpawn, forward);
        await this.spawnCreepGroup(lane.id, 1, lane.direSpawn, reverse);
      }
    } finally {
      this.spawningWave = false;
    }
  }

  private async spawnCreepGroup(
    laneId: string,
    team: 0 | 1,
    spawn: [number, number],
    waypoints: [number, number][]
  ): Promise<void> {
    const n = this.cfg.creepWaveSize;
    // --- AI 修改开始 [SCENE-SIM]：每第 7 波兵（每 3分30秒）额外生成攻城车（投刃车/绞肉车） ---
    const includeSiege = this.waveSerial % 7 === 0;
    const totalCount = includeSiege ? n + 1 : n;
    for (let i = 0; i < totalCount; i++) {
      const ox = (i - (totalCount - 1) / 2) * 52;
      const x = spawn[0] + ox;
      const y = spawn[1] + (team === 0 ? -i * 22 : i * 22);
      const z = this.sampleHeight(x, y);
      const isSiege = includeSiege && i === totalCount - 1;
      const isRanged = !isSiege && i === n - 1;
      const modelPath = isSiege
        ? team === 0
          ? 'Units\\NightElf\\Ballista\\Ballista.mdx'
          : 'Units\\Undead\\MeatWagon\\MeatWagon.mdx'
        : team === 0
          ? isRanged
            ? 'Units\\NightElf\\DruidoftheTalon\\DruidoftheTalon.mdx'
            : 'Units\\NightElf\\Ent\\Ent.mdx'
          : isRanged
            ? 'Units\\Undead\\Necromancer\\Necromancer.mdx'
            : 'Units\\Undead\\Ghoul\\Ghoul.mdx';
      const unitScale = isSiege
        ? 0.82
        : team === 0
          ? isRanged
            ? 0.78
            : 0.68
          : isRanged
            ? 0.82
            : 0.85;
      // --- AI 修改结束 [SCENE-SIM]：每第 7 波兵（每 3分30秒）额外生成攻城车（投刃车/绞肉车） ---
      const inst = await this.spawnModel({
        // --- AI 删除开始 [SCENE-SIM]：删除单调的 Wisp 小兵模型与缩放，原因：改为使用近卫/天灾真实近战与远程小兵模型 ---
        // path: this.creepModelPath,
        // x,
        // y,
        // z,
        // teamColor: team,
        // scale: 0.55 + (i % 2) * 0.08,
        // --- AI 删除结束 [SCENE-SIM] ---
        // --- AI 修改开始 [SCENE-SIM]：传入真实小兵模型路径与缩放 ---
        path: modelPath,
        x,
        y,
        z,
        teamColor: team,
        scale: unitScale,
        // --- AI 修改结束 [SCENE-SIM]：传入真实小兵模型路径与缩放 ---
        sequenceHint: 'Walk',
      });
      if (!inst) continue;
      // --- AI 修改开始 [SCENE-SIM]：初始化小兵生命值、攻击力与动画索引 ---
      const maxHp = isSiege ? 550 : isRanged ? 300 : 550;
      const dps = isSiege ? 40 : isRanged ? 26 : 21;
      this.units.push({
        id: `creep_${this.waveSerial}_${laneId}_${team}_${i}`,
        kind: 'creep',
        team,
        x,
        y,
        z,
        speed: this.cfg.creepMoveSpeed * (0.94 + (i % 3) * 0.03),
        scale: unitScale,
        waypoints,
        wpIndex: 0,
        instance: inst,
        alive: true,
        hp: maxHp,
        maxHp,
        dps,
        walkSeq: findSeqIndex(inst, 'Walk', 0),
        standSeq: findSeqIndex(inst, 'Stand', 0),
        attackSeq: findSeqIndex(inst, 'Attack', 0),
        deathSeq: findSeqIndex(inst, 'Death', 0),
      });
      // --- AI 修改结束 [SCENE-SIM]：初始化小兵生命值、攻击力与动画索引 ---
    }
  }

  // --- AI 修改开始 [SCENE-SIM]：实现 DotA 6.83d 整分钟野怪营地判定刷新（空营地且无英雄封野时自动刷野） ---
  private async refreshEmptyNeutralCamps(forceAll = false): Promise<void> {
    if (this.refreshingNeutrals) return;
    this.refreshingNeutrals = true;
    try {
      if (forceAll) {
        for (const u of this.units) {
          if (u.kind !== 'neutral') continue;
          u.alive = false;
          try {
            u.instance?.detach?.();
            u.instance?.setScene?.(null);
          } catch {
            /* ignore */
          }
        }
        this.units = this.units.filter((u) => u.alive);
      }

      const heroPos = this.getHeroPosition();
      for (const camp of this.cfg.neutralCamps) {
        // 若营地内仍有存活野怪，则不重复刷出
        const hasLiving = this.units.some(
          (u) => u.alive && u.kind === 'neutral' && u.campId === camp.id
        );
        if (hasLiving) continue;

        // 对齐 war3map.j P3O 封野判定：若英雄站在营地刷新框内（360码内），本分钟被封野不刷
        if (!forceAll && heroPos && dist2(camp.x, camp.y, heroPos.x, heroPos.y) < 360) {
          continue;
        }

        // --- AI 修改开始 [NEUTRAL-COMPOSITION]：按 composition 刷异种野怪，避免全营同一模型 ---
        const specs = resolveNeutralSpecs(camp);
        for (let i = 0; i < specs.length; i++) {
          const spec = specs[i];
          const ang = (i / Math.max(1, specs.length)) * Math.PI * 2;
          const radius = specs.length === 1 ? 0 : 85;
          const x = camp.x + Math.cos(ang) * radius;
          const y = camp.y + Math.sin(ang) * radius;
          const z = this.sampleHeight(x, y);
          const inst = await this.spawnModel({
            path: spec.path,
            x,
            y,
            z,
            teamColor: 12,
            scale: spec.scale,
            sequenceHint: 'Stand',
          });
          if (!inst) continue;
          const faceAng = ang + Math.PI;
          inst.setRotation?.([0, 0, Math.sin(faceAng / 2), Math.cos(faceAng / 2)]);
          this.units.push({
            id: `neutral_${camp.id}_${i}_${Math.floor(this.clockMs)}`,
            kind: 'neutral',
            team: -1,
            x,
            y,
            z,
            speed: 0,
            scale: spec.scale,
            waypoints: [],
            wpIndex: 0,
            instance: inst,
            alive: true,
            campId: camp.id,
            hp: spec.hp,
            maxHp: spec.hp,
            dps: spec.dps,
            walkSeq: findSeqIndex(inst, 'Walk', 0),
            standSeq: findSeqIndex(inst, 'Stand', 0),
            attackSeq: findSeqIndex(inst, 'Attack', 0),
            deathSeq: findSeqIndex(inst, 'Death', 0),
          });
        }
        // --- AI 修改结束 [NEUTRAL-COMPOSITION] ---
      }
    } finally {
      this.refreshingNeutrals = false;
    }
  }
  // --- AI 修改结束 [SCENE-SIM]：实现 DotA 6.83d 整分钟野怪营地判定刷新（空营地且无英雄封野时自动刷野） ---

  // --- AI 修改开始 [RUNE-SIM]：实现 DotA 6.83d 河道双神符自动刷新（war3map.j function CBO 规则）与拾取逻辑 ---
  private pickNextPowerupRune(): RuneKind {
    this.runeSerial += 1;
    let idx = (this.runeSerial * 3 + 1) % POWERUP_RUNES.length;
    if (idx === this.lastPowerupIdx) {
      idx = (idx + 1) % POWERUP_RUNES.length;
    }
    this.lastPowerupIdx = idx;
    return POWERUP_RUNES[idx];
  }

  private async refreshRunes(isInitialZeroMinute: boolean): Promise<void> {
    if (this.refreshingRunes) return;
    this.refreshingRunes = true;
    try {
      // 移除上一轮未被拾取的河道神符（对齐 war3map.j EnumItemsInRect(G4/D4) -> RemoveItem）
      for (const r of this.runes) {
        r.alive = false;
        try {
          r.instance?.detach?.();
          r.instance?.setScene?.(null);
        } catch {
          /* ignore */
        }
      }
      this.runes = [];

      const spots = this.cfg.runeSpots?.length ? this.cfg.runeSpots : DEFAULT_CFG.runeSpots || [];
      if (!spots.length) return;

      // 0:00 开局上下河道均为赏金神符；之后每 2:00 一侧为赏金神符，另一侧为强化神符
      const powerSide = this.runeSerial % 2;
      const powerKind = this.pickNextPowerupRune();

      for (let i = 0; i < spots.length; i++) {
        const spot = spots[i];
        const kind: RuneKind = isInitialZeroMinute
          ? 'bounty'
          : i === powerSide
            ? powerKind
            : 'bounty';
        const spec = RUNE_SPECS[kind];
        const z = this.sampleHeight(spot.x, spot.y) + 18;
        const inst = await this.spawnModel({
          path: 'Objects\\InventoryItems\\runes\\runes.mdx',
          x: spot.x,
          y: spot.y,
          z,
          teamColor: spec.teamColor,
          scale: spec.scale,
          sequenceHint: 'Stand',
        });
        if (!inst) continue;
        this.runes.push({
          spotId: spot.id,
          spotName: spot.name,
          kind,
          nameCn: spec.nameCn,
          x: spot.x,
          y: spot.y,
          z,
          teamColor: spec.teamColor,
          colorHex: spec.colorHex,
          spawnedAtMs: this.clockMs,
          alive: true,
          yaw: 0,
          instance: inst,
        });
      }
    } finally {
      this.refreshingRunes = false;
    }
  }

  private tickRunes(dt: number): void {
    const heroPos = this.getHeroPosition();
    for (const r of this.runes) {
      if (!r.alive) continue;
      // 神符围绕 Z 轴缓慢旋转并保持动画循环
      r.yaw = (r.yaw + dt * 1.6) % (Math.PI * 2);
      r.instance?.setRotation?.([0, 0, Math.sin(r.yaw / 2), Math.cos(r.yaw / 2)]);
      if (r.instance?.sequenceEnded) {
        r.instance.setSequence(r.instance.sequence || 0);
      }
      // 英雄走近神符点（240码内）自动拾取神符
      if (heroPos && dist2(r.x, r.y, heroPos.x, heroPos.y) <= 240) {
        r.alive = false;
        this.lastRunePickupMsg = `拾取 ${r.spotName}：${r.nameCn}`;
        // --- AI 修改开始 [COMBAT-GOLD-SIM]：拾取赏金神符累加 250 金钱并在头顶弹出金色 +250 ---
        if (r.kind === 'bounty') {
          this.goldTotal += 250;
          this.addFloatingText('+250', r.x, r.y, r.z + 55, '#fbbf24');
        } else {
          this.addFloatingText(r.nameCn, r.x, r.y, r.z + 55, r.colorHex);
        }
        // --- AI 修改结束 [COMBAT-GOLD-SIM] ---
        try {
          r.instance?.detach?.();
          r.instance?.setScene?.(null);
        } catch {
          /* ignore */
        }
      }
    }
    this.runes = this.runes.filter((r) => r.alive);
  }
  // --- AI 修改结束 [RUNE-SIM]：实现 DotA 6.83d 河道双神符自动刷新（war3map.j function CBO 规则）与拾取逻辑 ---

  // --- AI 修改开始 [COMBAT-GOLD-SIM]：飘金粒子池管理、金钱总数统计与实时血条实体查询 ---
  addFloatingText(
    text: string,
    x: number,
    y: number,
    z: number,
    color = '#fbbf24',
    durationMs = 1500
  ): void {
    this.floatingSerial += 1;
    this.floatingTexts.push({
      id: this.floatingSerial,
      text,
      x,
      y,
      z,
      color,
      createdAtMs: this.clockMs,
      durationMs,
    });
  }

  private tickFloatingTexts(dtMs: number): void {
    const dt = dtMs / 1000;
    for (const ft of this.floatingTexts) {
      ft.z += 40 * dt;
    }
    this.floatingTexts = this.floatingTexts.filter(
      (ft) => this.clockMs - ft.createdAtMs < ft.durationMs
    );
  }

  getFloatingTexts(): SimFloatingText[] {
    return this.floatingTexts;
  }

  getGoldTotal(): number {
    return Math.floor(this.goldTotal);
  }

  getHealthEntities(): SimHealthEntity[] {
    const list: SimHealthEntity[] = [];
    const heroPos = this.getHeroPosition();
    if (heroPos) {
      list.push({
        id: 'hero_main',
        name: '英雄',
        team: this.heroTeam,
        kind: 'hero',
        x: heroPos.x,
        y: heroPos.y,
        z: heroPos.z + 78,
        hp: Math.max(0, this.heroHp),
        maxHp: this.heroMaxHp,
      });
    }
    for (const u of this.units) {
      if (!u.alive) continue;
      list.push({
        id: u.id,
        name: u.kind === 'creep' ? (u.team === 0 ? '近卫小兵' : '天灾小兵') : '中立野怪',
        team: u.team,
        kind: u.kind,
        x: u.x,
        y: u.y,
        z: u.z + (u.kind === 'neutral' ? 62 : 46),
        hp: Math.max(0, u.hp),
        maxHp: u.maxHp,
      });
    }
    for (const t of this.towers) {
      if (!t.alive) continue;
      list.push({
        id: t.id,
        name: t.name,
        team: t.team,
        kind: 'tower',
        x: t.x,
        y: t.y,
        z: this.sampleHeight(t.x, t.y) + 195,
        hp: Math.max(0, t.hp),
        maxHp: t.maxHp,
      });
    }
    return list;
  }
  // --- AI 修改结束 [COMBAT-GOLD-SIM]：飘金粒子池管理、金钱总数统计与实时血条实体查询 ---
}
