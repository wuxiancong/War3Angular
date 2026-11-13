/**
 * Scene simulation for the replay viewer: this file only holds the content
 * (unit tables, labels, default spots) and the scene-sync.json config shape.
 * The simulation itself is the content-neutral LaneSim in ../engine/lane-sim.
 */
import { DEFAULT_SCENE_SYNC_URL } from './dota-map';
import {
  LaneSim,
  type CampCfg,
  type LaneSimConfig,
  type LaneSimContent,
  type PickupKindSpec,
  type PickupSpotCfg,
  type SimPickup,
} from '../engine/lane-sim';
import type { HeightSampler, ModelInstance, ModelSpawner, Team, UnitSpec } from '../engine/types';

export type {
  SimFloatingText,
  SimHealthEntity,
  SimTower,
  SimUnit,
} from '../engine/lane-sim';
export type { HeightSampler, ModelSpawner } from '../engine/types';

export interface SceneLane {
  id: string;
  radiantSpawn: [number, number];
  direSpawn: [number, number];
  waypoints: [number, number][];
}

export interface NeutralCampCfg extends CampCfg {
  tier?: 'small' | 'medium' | 'large' | 'ancient' | 'roshan';
}

export type RuneSpotCfg = PickupSpotCfg;

export type RuneKind = 'bounty' | 'dd' | 'haste' | 'illusion' | 'invis' | 'regen';

export type SimRune = SimPickup;

/** Shape of scene-sync.json. */
export interface SceneSyncConfig {
  enabled: boolean;
  heroMoveSpeed: number;
  creepWaveIntervalMs: number;
  creepWaveSize: number;
  creepMoveSpeed: number;
  neutralRefreshMs: number;
  runeRefreshMs?: number;
  startCreepsAtMs: number;
  startNeutralsAtMs: number;
  lanes: SceneLane[];
  neutralCamps: NeutralCampCfg[];
  runeSpots?: RuneSpotCfg[];
}

const DEFAULT_RUNE_SPOTS: RuneSpotCfg[] = [
  { id: 'rune_top', name: '上河道神符点', x: -2352, y: 1648 },
  { id: 'rune_bot', name: '下河道神符点', x: 3008, y: -2832 },
];

const DEFAULT_CFG: SceneSyncConfig = {
  enabled: true,
  heroMoveSpeed: 320,
  creepWaveIntervalMs: 30000,
  creepWaveSize: 4,
  creepMoveSpeed: 270,
  neutralRefreshMs: 60000,
  runeRefreshMs: 120000,
  startCreepsAtMs: 90000,
  startNeutralsAtMs: 30000,
  lanes: [],
  neutralCamps: [],
  runeSpots: DEFAULT_RUNE_SPOTS,
};

const RUNE_SPECS: Record<RuneKind, PickupKindSpec> = {
  bounty: { label: '赏金神符', teamColor: 9, colorHex: '#f59e0b', scale: 1.25, goldReward: 250 },
  dd: { label: '双倍神符', teamColor: 1, colorHex: '#38bdf8', scale: 1.3 },
  haste: { label: '极速神符', teamColor: 0, colorHex: '#ef4444', scale: 1.3 },
  illusion: { label: '幻象神符', teamColor: 4, colorHex: '#facc15', scale: 1.3 },
  invis: { label: '隐身神符', teamColor: 3, colorHex: '#a855f7', scale: 1.3 },
  regen: { label: '恢复神符', teamColor: 6, colorHex: '#22c55e', scale: 1.3 },
};
const POWERUP_RUNES: RuneKind[] = ['dd', 'haste', 'illusion', 'invis', 'regen'];

const NEUTRAL_SPECS: Record<string, UnitSpec> = {
  kobold_foreman: { model: 'Units\\Creeps\\Kobold\\Kobold.mdx', scale: 1.15, hp: 420, dps: 22 },
  kobold: { model: 'Units\\Creeps\\Kobold\\Kobold.mdx', scale: 0.88, hp: 260, dps: 14 },
  forest_troll: { model: 'Units\\Creeps\\ForestTroll\\ForestTroll.mdx', scale: 1.0, hp: 560, dps: 28 },
  centaur_khan: { model: 'Units\\Creeps\\CentaurKhan\\CentaurKhan.mdx', scale: 1.12, hp: 950, dps: 36 },
  centaur: { model: 'Units\\Creeps\\CentaurKhan\\CentaurKhan.mdx', scale: 0.92, hp: 680, dps: 28 },
  furbolg: { model: 'Units\\Creeps\\Furbolg\\Furbolg.mdx', scale: 1.05, hp: 800, dps: 32 },
  rock_golem: { model: 'Units\\Creeps\\RockGolem\\RockGolem.mdx', scale: 1.15, hp: 1200, dps: 40 },
  roshan: { model: 'Units\\Creeps\\RockGolem\\RockGolem.mdx', scale: 1.55, hp: 4500, dps: 65 },
};

function resolveNeutralSpecs(camp: CampCfg): UnitSpec[] {
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

const WAVE_UNITS: Record<Team, { melee: UnitSpec; ranged: UnitSpec; siege: UnitSpec }> = {
  0: {
    melee: { model: 'Units\\NightElf\\Ent\\Ent.mdx', scale: 0.68, hp: 550, dps: 21 },
    ranged: { model: 'Units\\NightElf\\DruidoftheTalon\\DruidoftheTalon.mdx', scale: 0.78, hp: 300, dps: 26 },
    siege: { model: 'Units\\NightElf\\Ballista\\Ballista.mdx', scale: 0.82, hp: 550, dps: 40 },
  },
  1: {
    melee: { model: 'Units\\Undead\\Ghoul\\Ghoul.mdx', scale: 0.85, hp: 550, dps: 21 },
    ranged: { model: 'Units\\Undead\\Necromancer\\Necromancer.mdx', scale: 0.82, hp: 300, dps: 26 },
    siege: { model: 'Units\\Undead\\MeatWagon\\MeatWagon.mdx', scale: 0.82, hp: 550, dps: 40 },
  },
};

/** 每波最后一个为远程兵；每 7 波追加一辆攻城车 */
function buildCreepWave(team: Team, waveSerial: number, waveSize: number): UnitSpec[] {
  const units = WAVE_UNITS[team];
  const wave: UnitSpec[] = [];
  for (let i = 0; i < waveSize; i++) {
    wave.push(i === waveSize - 1 ? units.ranged : units.melee);
  }
  if (waveSerial % 7 === 0) wave.push(units.siege);
  return wave;
}

const SCENE_CONTENT: LaneSimContent = {
  buildWave: buildCreepWave,
  resolveCampUnits: resolveNeutralSpecs,
  neutralTeamColor: 12,
  labels: {
    hero: '英雄',
    laneUnit: (team) => (team === 0 ? '近卫小兵' : '天灾小兵'),
    neutral: '中立野怪',
    pickupMessage: (spotName, kindLabel) => `拾取 ${spotName}：${kindLabel}`,
  },
  pickups: {
    model: 'Objects\\InventoryItems\\runes\\runes.mdx',
    kinds: RUNE_SPECS,
    baseKind: 'bounty',
    rotatingKinds: POWERUP_RUNES,
  },
  defaultPickupSpots: DEFAULT_RUNE_SPOTS,
  laneGoals: { team0: [5184, 4864], team1: [-5632, -6144] },
  // WatchTower 无旋转骨骼，仅近卫方的塔可面向目标
  towerCanRotate: (tower) => tower.team === 0,
};

function toLaneConfig(cfg: SceneSyncConfig): LaneSimConfig {
  return {
    enabled: cfg.enabled,
    heroMoveSpeed: cfg.heroMoveSpeed,
    waveIntervalMs: cfg.creepWaveIntervalMs,
    waveSize: cfg.creepWaveSize,
    laneUnitMoveSpeed: cfg.creepMoveSpeed,
    campRefreshMs: cfg.neutralRefreshMs,
    pickupRefreshMs: cfg.runeRefreshMs,
    startWavesAtMs: cfg.startCreepsAtMs,
    startCampsAtMs: cfg.startNeutralsAtMs,
    lanes: cfg.lanes.map((lane) => ({
      id: lane.id,
      team0Spawn: lane.radiantSpawn,
      team1Spawn: lane.direSpawn,
      waypoints: lane.waypoints,
    })),
    camps: cfg.neutralCamps,
    pickupSpots: cfg.runeSpots,
  };
}

export async function loadSceneSyncConfig(url = DEFAULT_SCENE_SYNC_URL): Promise<SceneSyncConfig> {
  try {
    const bust = url.includes('?') ? `&_=${Date.now()}` : `?_=${Date.now()}`;
    const res = await fetch(url + bust, { cache: 'no-store' });
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
    runeSpots: overrides.runeSpots?.length ? overrides.runeSpots : base.runeSpots,
  };
}

/** LaneSim driven by scene-sync.json (+ optional live overrides). */
export class DotaSceneSim extends LaneSim {
  cfg: SceneSyncConfig;

  constructor(
    cfg: SceneSyncConfig,
    sampleHeight: HeightSampler,
    spawnModel: ModelSpawner,
    heroInstance: ModelInstance | null,
    resolveHeroSeq: (name: string) => number,
    /** 与对战页同一张寻路栅格；不传则小兵直线走路点 */
    findPath?: (ax: number, ay: number, bx: number, by: number) => [number, number][]
  ) {
    super(toLaneConfig(cfg), SCENE_CONTENT, { sampleHeight, spawnModel, heroInstance, resolveHeroSeq, findPath });
    this.cfg = cfg;
  }

  get runes(): SimRune[] {
    return this.pickups;
  }

  setConfig(cfg: SceneSyncConfig): void {
    this.cfg = cfg;
    this.setLaneConfig(toLaneConfig(cfg));
  }

  override setEnabled(on: boolean): void {
    this.cfg.enabled = on;
    super.setEnabled(on);
  }
}
