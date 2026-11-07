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
  startCreepsAtMs: 0,
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

export async function loadSceneSyncConfig(url = DEFAULT_SCENE_SYNC_URL): Promise<SceneSyncConfig> {
  try {
    const res = await fetch(url);
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
    this.nextWaveAt = cfg.startCreepsAtMs;
    this.nextNeutralAt = cfg.startNeutralsAtMs;
    // --- AI 修改开始 [RUNE-SIM]：0:00 开局首次刷符，之后每 120000ms（2分钟）刷新 ---
    this.nextRuneAt = 0;
    // --- AI 修改结束 [RUNE-SIM]：0:00 开局首次刷符，之后每 120000ms（2分钟）刷新 ---
  }

  setConfig(cfg: SceneSyncConfig): void {
    this.cfg = cfg;
  }

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
    await this.refreshEmptyNeutralCamps(true);
    await this.spawnWave();
    // --- AI 修改开始 [RUNE-SIM]：开局初始化 0:00 双赏金神符并设定下次刷新时间 ---
    await this.refreshRunes(true);
    this.nextWaveAt = this.cfg.creepWaveIntervalMs;
    this.nextNeutralAt = this.cfg.neutralRefreshMs;
    this.nextRuneAt = this.cfg.runeRefreshMs || 120000;
    // --- AI 修改结束 [RUNE-SIM]：开局初始化 0:00 双赏金神符并设定下次刷新时间 ---
  }

  /** Per-frame update (sync). Spawns are kicked off without blocking the render loop. */
  tick(dtMs: number): void {
    if (!this.cfg.enabled) return;
    this.clockMs += dtMs;
    this.tickHero(dtMs / 1000);
    this.tickUnits(dtMs / 1000);
    // --- AI 修改开始 [RUNE-SIM]：每帧更新河道神符自转与英雄拾取判定，并按时触发自动出兵、自动刷野、自动刷符 ---
    this.tickRunes(dtMs / 1000);

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

  private tickUnits(dt: number): void {
    // --- AI 修改开始 [SCENE-SIM]：实现近卫/天灾兵线相遇交战互砍、英雄刷野战斗及阵亡清理逻辑 ---
    const heroPos = this.getHeroPosition();
    for (const u of this.units) {
      if (!u.alive) continue;

      if (u.kind === 'creep') {
        // 查找 260 码内最近的敌方小兵进行交战
        let targetEnemy: SimUnit | null = null;
        let minDist = 260;
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
          targetEnemy.hp -= u.dps * dt;
          if (targetEnemy.hp <= 0) {
            targetEnemy.alive = false;
            try {
              targetEnemy.instance?.detach?.();
              targetEnemy.instance?.setScene?.(null);
            } catch {
              /* ignore */
            }
          }
          continue;
        }

        if (u.inCombat) {
          u.inCombat = false;
          if (u.walkSeq >= 0) u.instance?.setSequence?.(u.walkSeq);
        }
      } else if (u.kind === 'neutral' && heroPos) {
        // 英雄靠近野怪营地（320码内）时触发打野交战，野怪掉血阵亡后等待下一整分钟自动刷新
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
            u.alive = false;
            try {
              u.instance?.detach?.();
              u.instance?.setScene?.(null);
            } catch {
              /* ignore */
            }
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
      const { x, y, arrived } = moveToward(u.x, u.y, tx, ty, step);
      u.x = x;
      u.y = y;
      u.z = this.sampleHeight(x, y);
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
    // --- AI 修改结束 [SCENE-SIM]：实现近卫/天灾兵线相遇交战互砍、英雄刷野战斗及阵亡清理逻辑 ---
  }

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
        const forward = lane.waypoints;
        const reverse = [...lane.waypoints].reverse();
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

        const count =
          camp.count ??
          (camp.tier === 'roshan' ? 1 : camp.tier === 'large' || camp.tier === 'ancient' ? 2 : 3);
        const neutralModel =
          camp.tier === 'roshan' || camp.id === 'roshan'
            ? 'Units\\Creeps\\RockGolem\\RockGolem.mdx'
            : camp.tier === 'ancient'
              ? 'Units\\Creeps\\RockGolem\\RockGolem.mdx'
              : camp.tier === 'large'
                ? camp.id.includes('2')
                  ? 'Units\\Creeps\\Furbolg\\Furbolg.mdx'
                  : 'Units\\Creeps\\CentaurKhan\\CentaurKhan.mdx'
                : camp.tier === 'medium'
                  ? 'Units\\Creeps\\ForestTroll\\ForestTroll.mdx'
                  : 'Units\\Creeps\\Kobold\\Kobold.mdx';
        const maxHp =
          camp.tier === 'roshan'
            ? 4500
            : camp.tier === 'ancient'
              ? 1100
              : camp.tier === 'large'
                ? 750
                : camp.tier === 'medium'
                  ? 500
                  : 320;
        for (let i = 0; i < count; i++) {
          const ang = (i / Math.max(1, count)) * Math.PI * 2;
          const radius = count === 1 ? 0 : 85;
          const x = camp.x + Math.cos(ang) * radius;
          const y = camp.y + Math.sin(ang) * radius;
          const z = this.sampleHeight(x, y);
          const inst = await this.spawnModel({
            path: neutralModel,
            x,
            y,
            z,
            teamColor: 12,
            scale: camp.scale ?? (camp.tier === 'roshan' ? 1.45 : 0.9),
            sequenceHint: 'Stand',
          });
          if (!inst) continue;
          // 让野怪朝向营地中心外侧
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
            scale: camp.scale ?? 0.95,
            waypoints: [],
            wpIndex: 0,
            instance: inst,
            alive: true,
            campId: camp.id,
            hp: maxHp,
            maxHp,
            dps: 25,
            walkSeq: findSeqIndex(inst, 'Walk', 0),
            standSeq: findSeqIndex(inst, 'Stand', 0),
            attackSeq: findSeqIndex(inst, 'Attack', 0),
            deathSeq: findSeqIndex(inst, 'Death', 0),
          });
        }
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
}
