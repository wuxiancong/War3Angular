import { DEFAULT_SCENE_SYNC_URL } from './dota-map';

export interface SceneLane {
  id: string;
  radiantSpawn: [number, number];
  direSpawn: [number, number];
  waypoints: [number, number][];
}

export interface NeutralCampCfg {
  id: string;
  x: number;
  y: number;
  count: number;
  scale?: number;
}

export interface SceneSyncConfig {
  enabled: boolean;
  heroMoveSpeed: number;
  creepWaveIntervalMs: number;
  creepWaveSize: number;
  creepMoveSpeed: number;
  neutralRefreshMs: number;
  startCreepsAtMs: number;
  startNeutralsAtMs: number;
  lanes: SceneLane[];
  neutralCamps: NeutralCampCfg[];
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
  startCreepsAtMs: 0,
  startNeutralsAtMs: 30000,
  lanes: [],
  neutralCamps: [],
};

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
  heroTarget: { x: number; y: number } | null = null;
  clockMs = 0;
  private nextWaveAt = 0;
  private nextNeutralAt = 0;
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
    await this.refreshAllNeutrals();
    await this.spawnWave();
  }

  /** Per-frame update (sync). Spawns are kicked off without blocking the render loop. */
  tick(dtMs: number): void {
    if (!this.cfg.enabled) return;
    this.clockMs += dtMs;
    this.tickHero(dtMs / 1000);
    this.tickUnits(dtMs / 1000);

    if (this.clockMs >= this.nextWaveAt) {
      this.nextWaveAt = this.clockMs + this.cfg.creepWaveIntervalMs;
      void this.spawnWave();
    }
    if (this.clockMs >= this.nextNeutralAt) {
      this.nextNeutralAt = this.clockMs + this.cfg.neutralRefreshMs;
      void this.refreshAllNeutrals();
    }
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
      this.heroInstance.setRotation?.(0, 0, ang);
      this.heroInstance.face?.(ang);
    } catch {
      /* optional API */
    }
    if (arrived) {
      this.heroTarget = null;
      if (this.heroStandSeq >= 0) this.heroInstance.setSequence(this.heroStandSeq);
    }
  }

  private tickUnits(dt: number): void {
    for (const u of this.units) {
      if (!u.alive || !u.waypoints.length) continue;
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
      const { x, y, arrived } = moveToward(u.x, u.y, tx, ty, step);
      u.x = x;
      u.y = y;
      u.z = this.sampleHeight(x, y);
      u.instance?.setLocation?.([u.x, u.y, u.z]);
      if (arrived) u.wpIndex += 1;
    }
    this.units = this.units.filter((u) => u.alive);
  }

  private async spawnWave(): Promise<void> {
    if (!this.cfg.lanes.length) return;
    this.waveSerial += 1;
    for (const lane of this.cfg.lanes) {
      const forward = lane.waypoints;
      const reverse = [...lane.waypoints].reverse();
      await this.spawnCreepGroup(lane.id, 0, lane.radiantSpawn, forward);
      await this.spawnCreepGroup(lane.id, 1, lane.direSpawn, reverse);
    }
  }

  private async spawnCreepGroup(
    laneId: string,
    team: 0 | 1,
    spawn: [number, number],
    waypoints: [number, number][]
  ): Promise<void> {
    const n = this.cfg.creepWaveSize;
    for (let i = 0; i < n; i++) {
      const ox = (i - (n - 1) / 2) * 48;
      const x = spawn[0] + ox;
      const y = spawn[1] + (team === 0 ? -i * 20 : i * 20);
      const z = this.sampleHeight(x, y);
      const inst = await this.spawnModel({
        path: this.creepModelPath,
        x,
        y,
        z,
        teamColor: team,
        scale: 0.55 + (i % 2) * 0.08,
        sequenceHint: 'Walk',
      });
      if (!inst) continue;
      this.units.push({
        id: `creep_${this.waveSerial}_${laneId}_${team}_${i}`,
        kind: 'creep',
        team,
        x,
        y,
        z,
        speed: this.cfg.creepMoveSpeed * (0.92 + (i % 3) * 0.04),
        scale: 0.6,
        waypoints,
        wpIndex: 0,
        instance: inst,
        alive: true,
      });
    }
  }

  private async refreshAllNeutrals(): Promise<void> {
    // Remove existing neutrals first (refresh).
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

    for (const camp of this.cfg.neutralCamps) {
      for (let i = 0; i < camp.count; i++) {
        const ang = (i / Math.max(1, camp.count)) * Math.PI * 2;
        const x = camp.x + Math.cos(ang) * 90;
        const y = camp.y + Math.sin(ang) * 90;
        const z = this.sampleHeight(x, y);
        const inst = await this.spawnModel({
          path: this.neutralModelPath,
          x,
          y,
          z,
          teamColor: 12,
          scale: camp.scale ?? 0.95,
          sequenceHint: 'Stand',
        });
        if (!inst) continue;
        this.units.push({
          id: `neutral_${camp.id}_${i}`,
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
        });
      }
    }
  }
}
