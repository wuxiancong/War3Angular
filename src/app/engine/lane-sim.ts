/**
 * Content-neutral lane simulation: a controlled hero, timed unit waves that
 * walk lanes and fight, static camps that refill, towers, timed pickups,
 * gold and floating combat text.
 *
 * Which units exist, what they look like, where things stand and what they
 * are called all come from {@link LaneSimContent} and {@link LaneSimConfig}.
 */
import {
  findSequenceIndex,
  removeInstance,
  yawQuaternion,
  type HeightSampler,
  type ModelInstance,
  type ModelSpawner,
  type Team,
  type UnitSpec,
} from './types';

export interface LaneCfg {
  id: string;
  team0Spawn: [number, number];
  team1Spawn: [number, number];
  /** Ordered from team 0's end to team 1's end. */
  waypoints: [number, number][];
}

export interface CampCfg {
  id: string;
  name?: string;
  x: number;
  y: number;
  count?: number;
  tier?: string;
  scale?: number;
  /** Keys into the content's camp unit table. */
  composition?: string[];
}

export interface PickupSpotCfg {
  id: string;
  name: string;
  x: number;
  y: number;
}

export interface LaneSimConfig {
  enabled: boolean;
  heroMoveSpeed: number;
  waveIntervalMs: number;
  waveSize: number;
  laneUnitMoveSpeed: number;
  campRefreshMs: number;
  pickupRefreshMs?: number;
  startWavesAtMs: number;
  startCampsAtMs: number;
  lanes: LaneCfg[];
  camps: CampCfg[];
  pickupSpots?: PickupSpotCfg[];
}

export interface PickupKindSpec {
  label: string;
  teamColor: number;
  colorHex: string;
  scale: number;
  /** Gold granted on pickup. Kinds without it only show their label. */
  goldReward?: number;
}

export interface PickupContent {
  model: string;
  kinds: Record<string, PickupKindSpec>;
  /** Kind placed on every spot that is not the rotating one. */
  baseKind: string;
  /** Kinds cycled through on one spot per refresh. */
  rotatingKinds: string[];
}

export interface LaneSimLabels {
  hero: string;
  laneUnit(team: Team): string;
  neutral: string;
  pickupMessage(spotName: string, kindLabel: string): string;
}

/** Balance numbers. Every field has a default in {@link DEFAULT_TUNING}. */
export interface LaneSimTuning {
  heroHp: number;
  heroDps: number;
  heroMinHp: number;
  heroRegenPerSec: number;
  heroAcquireRange: number;
  /** Share of a target's dps the hero takes while fighting it. */
  heroDamageTakenFactor: number;
  startGold: number;
  laneBountyMin: number;
  /** Lane bounty is laneBountyMin + floor(random * laneBountySpread). */
  laneBountySpread: number;
  neutralBounty: number;
  towerHp: number;
  towerDps: number;
  towerRange: number;
  /** Towers are not destroyed; they are restored to this share of max hp. */
  towerRestoreFactor: number;
  towerAvoidRadius: number;
  laneAcquireRange: number;
  laneTowerRange: number;
  laneTowerDamageFactor: number;
  maxLaneUnits: number;
  campAggroRange: number;
  campProximityDps: number;
  campProximityBounty: number;
  /** A camp does not refill while the hero stands within this range. */
  campBlockRange: number;
  campRingRadius: number;
  pickupRange: number;
  pickupHoverHeight: number;
  deathRemoveDelayMs: number;
  /** Sideways gap between units of a spawning wave. */
  formationSpacing: number;
  /** Front-to-back stagger between units of a spawning wave. */
  formationDepth: number;
}

export const DEFAULT_TUNING: LaneSimTuning = {
  heroHp: 680,
  heroDps: 82,
  heroMinHp: 90,
  heroRegenPerSec: 5.5,
  heroAcquireRange: 260,
  heroDamageTakenFactor: 0.45,
  startGold: 603,
  laneBountyMin: 38,
  laneBountySpread: 11,
  neutralBounty: 52,
  towerHp: 1600,
  towerDps: 118,
  towerRange: 700,
  towerRestoreFactor: 0.65,
  towerAvoidRadius: 145,
  laneAcquireRange: 280,
  laneTowerRange: 235,
  laneTowerDamageFactor: 0.42,
  maxLaneUnits: 72,
  campAggroRange: 320,
  campProximityDps: 85,
  campProximityBounty: 68,
  campBlockRange: 360,
  campRingRadius: 85,
  pickupRange: 240,
  pickupHoverHeight: 18,
  deathRemoveDelayMs: 450,
  formationSpacing: 52,
  formationDepth: 22,
};

export interface LaneSimContent {
  /** Units of one wave for one team, in formation order. */
  buildWave(team: Team, waveSerial: number, waveSize: number): UnitSpec[];
  /** Units that fill an empty camp. */
  resolveCampUnits(camp: CampCfg): UnitSpec[];
  neutralTeamColor: number;
  labels: LaneSimLabels;
  pickups?: PickupContent;
  /** Used when the config lists no pickup spots. */
  defaultPickupSpots?: PickupSpotCfg[];
  /**
   * Final destination per team, appended to a lane path whose last waypoint
   * does not already sit on the goal's x coordinate.
   */
  laneGoals?: { team0: [number, number]; team1: [number, number] };
  /** Return false for tower models that cannot turn. Defaults to true. */
  towerCanRotate?(tower: SimTower): boolean;
  tuning?: Partial<LaneSimTuning>;
}

export interface SimUnit {
  id: string;
  kind: 'creep' | 'neutral';
  team: Team | -1;
  x: number;
  y: number;
  z: number;
  speed: number;
  scale: number;
  waypoints: [number, number][];
  wpIndex: number;
  instance: ModelInstance;
  alive: boolean;
  campId?: string;
  hp: number;
  maxHp: number;
  dps: number;
  walkSeq: number;
  standSeq: number;
  attackSeq: number;
  deathSeq: number;
  inCombat?: boolean;
}

export interface SimTower {
  id: string;
  name: string;
  team: Team;
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
  instance: ModelInstance | null;
}

export interface SimPickup {
  spotId: string;
  spotName: string;
  kind: string;
  label: string;
  x: number;
  y: number;
  z: number;
  teamColor: number;
  colorHex: string;
  spawnedAtMs: number;
  alive: boolean;
  yaw: number;
  instance: ModelInstance;
}

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
  team: Team | -1;
  kind: 'hero' | 'creep' | 'neutral' | 'tower';
  x: number;
  y: number;
  z: number;
  hp: number;
  maxHp: number;
}

export interface TowerPlacement {
  id: string;
  name: string;
  team: Team;
  x: number;
  y: number;
  instance: ModelInstance | null;
}

export interface LaneSimDeps {
  sampleHeight: HeightSampler;
  spawnModel: ModelSpawner;
  heroInstance: ModelInstance | null;
  /** Resolves a sequence name on the hero model to its index, or -1. */
  resolveHeroSeq(name: string): number;
  /** Source of randomness for bounties; defaults to Math.random. */
  random?: () => number;
  /** Schedules delayed removal of dead units; defaults to setTimeout. */
  defer?: (fn: () => void, delayMs: number) => void;
}

const FLOAT_GOLD_COLOR = '#fbbf24';

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

function moveToward(
  x: number,
  y: number,
  tx: number,
  ty: number,
  step: number
): { x: number; y: number; arrived: boolean } {
  const d = distance(x, y, tx, ty);
  if (d <= step || d < 1e-3) return { x: tx, y: ty, arrived: true };
  const k = step / d;
  return { x: x + (tx - x) * k, y: y + (ty - y) * k, arrived: false };
}

function replaySequence(instance: ModelInstance | null | undefined, seq: number): void {
  if (seq >= 0 && (instance?.sequence !== seq || instance?.sequenceEnded)) {
    instance?.setSequence?.(seq);
  }
}

export class LaneSim {
  config: LaneSimConfig;
  readonly tuning: LaneSimTuning;
  units: SimUnit[] = [];
  pickups: SimPickup[] = [];
  towers: SimTower[] = [];
  lastPickupMessage = '';
  heroTarget: { x: number; y: number } | null = null;
  clockMs = 0;
  heroHp: number;
  heroMaxHp: number;
  heroDps: number;
  heroTeam: Team = 0;
  goldTotal: number;
  floatingTexts: SimFloatingText[] = [];

  private nextWaveAt = 0;
  private nextCampAt = 0;
  private nextPickupAt = 0;
  private pickupSerial = 0;
  private lastRotatingIdx = -1;
  private spawningWave = false;
  private refreshingCamps = false;
  private refreshingPickups = false;
  private waveSerial = 0;
  private floatingSerial = 0;
  private readonly heroWalkSeq: number;
  private readonly heroStandSeq: number;
  private readonly heroAttackSeq: number;
  private readonly sampleHeight: HeightSampler;
  private readonly spawnModel: ModelSpawner;
  private readonly heroInstance: ModelInstance | null;
  private readonly random: () => number;
  private readonly defer: (fn: () => void, delayMs: number) => void;

  constructor(
    config: LaneSimConfig,
    protected readonly content: LaneSimContent,
    deps: LaneSimDeps
  ) {
    this.config = config;
    this.tuning = { ...DEFAULT_TUNING, ...content.tuning };
    this.sampleHeight = deps.sampleHeight;
    this.spawnModel = deps.spawnModel;
    this.heroInstance = deps.heroInstance;
    this.random = deps.random ?? Math.random;
    this.defer = deps.defer ?? ((fn, ms) => void setTimeout(fn, ms));
    this.heroWalkSeq = deps.resolveHeroSeq('Walk');
    this.heroStandSeq = deps.resolveHeroSeq('Stand');
    this.heroAttackSeq = deps.resolveHeroSeq('Attack');
    this.heroHp = this.tuning.heroHp;
    this.heroMaxHp = this.tuning.heroHp;
    this.heroDps = this.tuning.heroDps;
    this.goldTotal = this.tuning.startGold;
    this.nextWaveAt = config.startWavesAtMs;
    this.nextCampAt = config.startCampsAtMs;
    this.nextPickupAt = 0;
  }

  setLaneConfig(config: LaneSimConfig): void {
    this.config = config;
  }

  setEnabled(on: boolean): void {
    this.config.enabled = on;
  }

  registerTowers(placements: TowerPlacement[]): void {
    this.towers = placements.map((t) => ({
      id: t.id,
      name: t.name,
      team: t.team,
      x: t.x,
      y: t.y,
      hp: this.tuning.towerHp,
      maxHp: this.tuning.towerHp,
      dps: this.tuning.towerDps,
      range: this.tuning.towerRange,
      alive: true,
      standSeq: findSequenceIndex(t.instance, 'Stand', 0),
      attackSeq: findSequenceIndex(t.instance, 'Attack', 0),
      deathSeq: findSequenceIndex(t.instance, 'Death', 0),
      inCombat: false,
      instance: t.instance,
    }));
  }

  setHeroMoveTarget(x: number, y: number): void {
    this.heroTarget = { x, y };
    if (this.heroInstance && this.heroWalkSeq >= 0) {
      this.heroInstance.setSequence?.(this.heroWalkSeq);
    }
  }

  getHeroPosition(): { x: number; y: number; z: number } | null {
    if (!this.heroInstance) return null;
    const loc = this.heroInstance.localLocation || this.heroInstance.location || [0, 0, 0];
    return { x: loc[0] || 0, y: loc[1] || 0, z: loc[2] || 0 };
  }

  /** Arms the spawn timers. Nothing is spawned until the clock reaches them. */
  async bootstrap(): Promise<void> {
    if (!this.config.enabled) return;
    this.nextWaveAt = Math.max(0, this.config.startWavesAtMs ?? 90000);
    this.nextCampAt = Math.max(0, this.config.startCampsAtMs ?? 30000);
    this.nextPickupAt = 0;
  }

  /**
   * Aligns the simulation to an external game clock. Moving forward runs
   * catch-up ticks; moving backward clears lane units and re-arms the timers.
   */
  syncGameClock(gameTimeMs: number): void {
    const t = Math.max(0, gameTimeMs);
    if (Math.abs(t - this.clockMs) < 0.5) return;
    if (t + 50 < this.clockMs) {
      for (const u of [...this.units]) removeInstance(u.instance);
      this.units = [];
      this.clockMs = t;
      const interval = this.config.waveIntervalMs || 30000;
      const start = this.config.startWavesAtMs ?? 90000;
      this.nextWaveAt = Math.max(t, start);
      if (t >= start) {
        // Skip to the next slot instead of spawning every missed wave at once.
        const n = Math.floor((t - start) / interval) + 1;
        this.nextWaveAt = start + n * interval;
      }
      this.nextCampAt = Math.max(t, this.config.startCampsAtMs ?? 30000);
      this.nextPickupAt = t <= 0 ? 0 : Math.max(t, this.config.pickupRefreshMs || 120000);
      return;
    }
    let remain = t - this.clockMs;
    while (remain > 0) {
      const step = Math.min(remain, 50);
      this.tick(step);
      remain -= step;
    }
  }

  /** Per-frame update. Spawns are started without blocking the caller. */
  tick(dtMs: number): void {
    if (!this.config.enabled) return;
    this.clockMs += dtMs;
    const dt = dtMs / 1000;
    this.tickHero(dt);
    this.tickHeroCombat(dt);
    this.tickTowers(dt);
    this.tickUnits(dt);
    this.tickPickups(dt);
    this.tickFloatingTexts(dtMs);

    if (this.clockMs >= this.nextWaveAt) {
      this.nextWaveAt = this.clockMs + (this.config.waveIntervalMs || 30000);
      void this.spawnWave();
    }
    if (this.clockMs >= this.nextCampAt) {
      this.nextCampAt = this.clockMs + (this.config.campRefreshMs || 60000);
      void this.refreshEmptyCamps(false);
    }
    if (this.clockMs >= this.nextPickupAt) {
      this.nextPickupAt = this.clockMs + (this.config.pickupRefreshMs || 120000);
      void this.refreshPickups(false);
    }
  }

  dispose(): void {
    for (const u of this.units) {
      removeInstance(u.instance);
      u.alive = false;
    }
    this.units = [];
    for (const p of this.pickups) {
      removeInstance(p.instance);
      p.alive = false;
    }
    this.pickups = [];
  }

  private face(instance: ModelInstance | null | undefined, yaw: number): void {
    instance?.setRotation?.(yawQuaternion(yaw));
  }

  private tickHero(dt: number): void {
    if (!this.heroInstance || !this.heroTarget) return;
    const loc = this.heroInstance.localLocation || this.heroInstance.location || [0, 0, 0];
    const x0 = loc[0] || 0;
    const y0 = loc[1] || 0;
    const step = this.config.heroMoveSpeed * dt;
    const { x, y, arrived } = moveToward(x0, y0, this.heroTarget.x, this.heroTarget.y, step);
    this.heroInstance.setLocation?.([x, y, this.sampleHeight(x, y)]);
    try {
      this.face(this.heroInstance, Math.atan2(this.heroTarget.y - y0, this.heroTarget.x - x0));
    } catch {
      /* rotation is optional */
    }
    if (arrived) {
      this.heroTarget = null;
      if (this.heroStandSeq >= 0) this.heroInstance.setSequence?.(this.heroStandSeq);
    }
  }

  private tickHeroCombat(dt: number): void {
    const heroPos = this.getHeroPosition();
    if (!heroPos || !this.heroInstance) return;

    let target: SimUnit | null = null;
    let minDist = this.tuning.heroAcquireRange;
    for (const u of this.units) {
      if (!u.alive || u.team === this.heroTeam) continue;
      const d = distance(heroPos.x, heroPos.y, u.x, u.y);
      if (d < minDist) {
        minDist = d;
        target = u;
      }
    }

    if (target) {
      if (!this.heroTarget) {
        this.face(this.heroInstance, Math.atan2(target.y - heroPos.y, target.x - heroPos.x));
        replaySequence(this.heroInstance, this.heroAttackSeq);
      }
      target.hp -= this.heroDps * dt;
      this.heroHp = Math.max(
        this.tuning.heroMinHp,
        this.heroHp - target.dps * this.tuning.heroDamageTakenFactor * dt
      );
      if (target.hp <= 0) {
        this.killUnit(target, true, this.rollBounty(target));
      }
    } else if (this.heroHp < this.heroMaxHp) {
      this.heroHp = Math.min(this.heroMaxHp, this.heroHp + this.tuning.heroRegenPerSec * dt);
    }
  }

  private tickTowers(dt: number): void {
    const heroPos = this.getHeroPosition();
    for (const tower of this.towers) {
      if (!tower.alive) continue;
      let target: SimUnit | null = null;
      let minDist = tower.range;
      for (const u of this.units) {
        if (!u.alive || u.kind !== 'creep' || u.team === tower.team) continue;
        const d = distance(tower.x, tower.y, u.x, u.y);
        if (d < minDist) {
          minDist = d;
          target = u;
        }
      }

      if (target) {
        tower.inCombat = true;
        if (this.content.towerCanRotate?.(tower) ?? true) {
          this.face(tower.instance, Math.atan2(target.y - tower.y, target.x - tower.x));
        }
        replaySequence(tower.instance, tower.attackSeq);
        target.hp -= tower.dps * dt;
        if (target.hp <= 0) this.killUnit(target, false);
        continue;
      }

      // No lane unit in range: an enemy hero in range still triggers the attack animation.
      if (
        tower.team !== this.heroTeam &&
        heroPos &&
        distance(tower.x, tower.y, heroPos.x, heroPos.y) <= tower.range
      ) {
        tower.inCombat = true;
        replaySequence(tower.instance, tower.attackSeq);
        continue;
      }

      if (tower.inCombat) {
        tower.inCombat = false;
        if (tower.standSeq >= 0) tower.instance?.setSequence?.(tower.standSeq);
      } else if (tower.instance?.sequenceEnded && tower.standSeq >= 0) {
        tower.instance.setSequence?.(tower.standSeq);
      }
    }
  }

  private tickUnits(dt: number): void {
    const heroPos = this.getHeroPosition();
    for (const u of this.units) {
      if (!u.alive) continue;

      if (u.kind === 'creep') {
        let enemy: SimUnit | null = null;
        let minDist = this.tuning.laneAcquireRange;
        for (const other of this.units) {
          if (!other.alive || other.kind !== 'creep' || other.team === u.team) continue;
          const d = distance(u.x, u.y, other.x, other.y);
          if (d < minDist) {
            minDist = d;
            enemy = other;
          }
        }

        if (enemy) {
          u.inCombat = true;
          this.face(u.instance, Math.atan2(enemy.y - u.y, enemy.x - u.x));
          replaySequence(u.instance, u.attackSeq);
          // Both sides deal damage in their own turn of the loop.
          enemy.hp -= u.dps * dt;
          if (enemy.hp <= 0) this.killUnit(enemy, u.team === this.heroTeam);
          continue;
        }

        // No enemy unit nearby: stop at an enemy tower instead of walking through it.
        let enemyTower: SimTower | null = null;
        let minTowerDist = this.tuning.laneTowerRange;
        for (const tower of this.towers) {
          if (!tower.alive || tower.team === u.team) continue;
          const d = distance(u.x, u.y, tower.x, tower.y);
          if (d < minTowerDist) {
            minTowerDist = d;
            enemyTower = tower;
          }
        }

        if (enemyTower) {
          u.inCombat = true;
          this.face(u.instance, Math.atan2(enemyTower.y - u.y, enemyTower.x - u.x));
          replaySequence(u.instance, u.attackSeq);
          enemyTower.hp -= u.dps * this.tuning.laneTowerDamageFactor * dt;
          if (enemyTower.hp <= 0) {
            enemyTower.hp = enemyTower.maxHp * this.tuning.towerRestoreFactor;
          }
          continue;
        }

        if (u.inCombat) {
          u.inCombat = false;
          if (u.walkSeq >= 0) u.instance.setSequence?.(u.walkSeq);
        }
      } else if (u.kind === 'neutral' && heroPos) {
        if (distance(u.x, u.y, heroPos.x, heroPos.y) <= this.tuning.campAggroRange) {
          u.inCombat = true;
          this.face(u.instance, Math.atan2(heroPos.y - u.y, heroPos.x - u.x));
          replaySequence(u.instance, u.attackSeq);
          u.hp -= this.tuning.campProximityDps * dt;
          if (u.hp <= 0) this.killUnit(u, true, this.tuning.campProximityBounty);
          continue;
        } else if (u.inCombat) {
          u.inCombat = false;
          if (u.standSeq >= 0) u.instance.setSequence?.(u.standSeq);
        }
      }

      if (!u.waypoints.length) {
        if (u.instance.sequenceEnded && u.standSeq >= 0) {
          u.instance.setSequence?.(u.standSeq);
        }
        continue;
      }
      if (u.wpIndex >= u.waypoints.length) {
        // Lane units that finish their path despawn.
        if (u.kind === 'creep') {
          u.alive = false;
          removeInstance(u.instance);
        }
        continue;
      }
      const [tx, ty] = u.waypoints[u.wpIndex];
      const prevX = u.x;
      const prevY = u.y;
      const moved = moveToward(u.x, u.y, tx, ty, u.speed * dt);
      let nextX = moved.x;
      let nextY = moved.y;
      if (u.kind === 'creep') {
        const minR = this.tuning.towerAvoidRadius;
        for (const tower of this.towers) {
          if (!tower.alive) continue;
          const dxT = nextX - tower.x;
          const dyT = nextY - tower.y;
          const dT = Math.hypot(dxT, dyT);
          if (dT < minR) {
            const nx = dT > 1 ? dxT / dT : 0.707;
            const ny = dT > 1 ? dyT / dT : 0.707;
            nextX = tower.x + nx * minR;
            nextY = tower.y + ny * minR;
          }
        }
      }
      u.x = nextX;
      u.y = nextY;
      u.z = this.sampleHeight(u.x, u.y);
      u.instance.setLocation?.([u.x, u.y, u.z]);
      if (Math.hypot(tx - prevX, ty - prevY) > 1) {
        this.face(u.instance, Math.atan2(ty - prevY, tx - prevX));
      }
      if (u.instance.sequenceEnded && u.walkSeq >= 0) {
        u.instance.setSequence?.(u.walkSeq);
      }
      if (moved.arrived) u.wpIndex += 1;
    }
    this.units = this.units.filter((u) => u.alive);
  }

  private rollBounty(unit: SimUnit): number {
    return unit.kind === 'neutral'
      ? this.tuning.neutralBounty
      : Math.floor(this.random() * this.tuning.laneBountySpread) + this.tuning.laneBountyMin;
  }

  private killUnit(unit: SimUnit, grantGold: boolean, bountyOverride?: number): void {
    if (!unit.alive) return;
    unit.alive = false;
    unit.hp = 0;
    try {
      if (unit.deathSeq >= 0) unit.instance.setSequence?.(unit.deathSeq);
    } catch {
      /* ignore */
    }
    const remove = () => removeInstance(unit.instance);
    // Leave the death animation on screen briefly before removing the model.
    if (unit.deathSeq >= 0) {
      this.defer(remove, this.tuning.deathRemoveDelayMs);
    } else {
      remove();
    }
    if (grantGold) {
      const bounty = bountyOverride ?? this.rollBounty(unit);
      this.goldTotal += bounty;
      this.addFloatingText('+' + bounty, unit.x, unit.y, unit.z + 45, FLOAT_GOLD_COLOR);
    }
  }

  private async spawnWave(): Promise<void> {
    if (!this.config.lanes.length || this.spawningWave) return;
    const active = this.units.filter((u) => u.alive && u.kind === 'creep').length;
    if (active >= this.tuning.maxLaneUnits) return;
    this.spawningWave = true;
    try {
      this.waveSerial += 1;
      const goals = this.content.laneGoals;
      for (const lane of this.config.lanes) {
        const forward: [number, number][] = [...lane.waypoints.slice(1)];
        const reverse: [number, number][] = [...[...lane.waypoints].reverse().slice(1)];
        if (goals) {
          if (!forward.length || forward[forward.length - 1][0] !== goals.team0[0]) {
            forward.push([goals.team0[0], goals.team0[1]]);
          }
          if (!reverse.length || reverse[reverse.length - 1][0] !== goals.team1[0]) {
            reverse.push([goals.team1[0], goals.team1[1]]);
          }
        }
        await this.spawnLaneGroup(lane.id, 0, lane.team0Spawn, forward);
        await this.spawnLaneGroup(lane.id, 1, lane.team1Spawn, reverse);
      }
    } finally {
      this.spawningWave = false;
    }
  }

  private async spawnLaneGroup(
    laneId: string,
    team: Team,
    spawn: [number, number],
    waypoints: [number, number][]
  ): Promise<void> {
    const specs = this.content.buildWave(team, this.waveSerial, this.config.waveSize);
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      const x = spawn[0] + (i - (specs.length - 1) / 2) * this.tuning.formationSpacing;
      const depth = i * this.tuning.formationDepth;
      const y = spawn[1] + (team === 0 ? -depth : depth);
      const z = this.sampleHeight(x, y);
      const inst = await this.spawnModel({
        path: spec.model,
        x,
        y,
        z,
        teamColor: team,
        scale: spec.scale,
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
        speed: this.config.laneUnitMoveSpeed * (0.94 + (i % 3) * 0.03),
        scale: spec.scale,
        waypoints,
        wpIndex: 0,
        instance: inst,
        alive: true,
        hp: spec.hp,
        maxHp: spec.hp,
        dps: spec.dps,
        walkSeq: findSequenceIndex(inst, 'Walk', 0),
        standSeq: findSequenceIndex(inst, 'Stand', 0),
        attackSeq: findSequenceIndex(inst, 'Attack', 0),
        deathSeq: findSequenceIndex(inst, 'Death', 0),
      });
    }
  }

  private async refreshEmptyCamps(forceAll: boolean): Promise<void> {
    if (this.refreshingCamps) return;
    this.refreshingCamps = true;
    try {
      if (forceAll) {
        for (const u of this.units) {
          if (u.kind !== 'neutral') continue;
          u.alive = false;
          removeInstance(u.instance);
        }
        this.units = this.units.filter((u) => u.alive);
      }

      const heroPos = this.getHeroPosition();
      for (const camp of this.config.camps) {
        const occupied = this.units.some(
          (u) => u.alive && u.kind === 'neutral' && u.campId === camp.id
        );
        if (occupied) continue;
        if (
          !forceAll &&
          heroPos &&
          distance(camp.x, camp.y, heroPos.x, heroPos.y) < this.tuning.campBlockRange
        ) {
          continue;
        }

        const specs = this.content.resolveCampUnits(camp);
        for (let i = 0; i < specs.length; i++) {
          const spec = specs[i];
          const ang = (i / Math.max(1, specs.length)) * Math.PI * 2;
          const radius = specs.length === 1 ? 0 : this.tuning.campRingRadius;
          const x = camp.x + Math.cos(ang) * radius;
          const y = camp.y + Math.sin(ang) * radius;
          const z = this.sampleHeight(x, y);
          const inst = await this.spawnModel({
            path: spec.model,
            x,
            y,
            z,
            teamColor: this.content.neutralTeamColor,
            scale: spec.scale,
            sequenceHint: 'Stand',
          });
          if (!inst) continue;
          // Face the camp centre.
          this.face(inst, ang + Math.PI);
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
            walkSeq: findSequenceIndex(inst, 'Walk', 0),
            standSeq: findSequenceIndex(inst, 'Stand', 0),
            attackSeq: findSequenceIndex(inst, 'Attack', 0),
            deathSeq: findSequenceIndex(inst, 'Death', 0),
          });
        }
      }
    } finally {
      this.refreshingCamps = false;
    }
  }

  private pickNextRotatingKind(rotating: string[]): string {
    this.pickupSerial += 1;
    let idx = (this.pickupSerial * 3 + 1) % rotating.length;
    if (idx === this.lastRotatingIdx) {
      idx = (idx + 1) % rotating.length;
    }
    this.lastRotatingIdx = idx;
    return rotating[idx];
  }

  /**
   * Replaces all pickups. One spot (alternating each refresh) gets the next
   * rotating kind and the others get the base kind; with `allBase` every spot
   * gets the base kind.
   */
  private async refreshPickups(allBase: boolean): Promise<void> {
    const content = this.content.pickups;
    if (!content || this.refreshingPickups) return;
    this.refreshingPickups = true;
    try {
      for (const p of this.pickups) {
        p.alive = false;
        removeInstance(p.instance);
      }
      this.pickups = [];

      const spots = this.config.pickupSpots?.length
        ? this.config.pickupSpots
        : this.content.defaultPickupSpots || [];
      if (!spots.length) return;

      const rotatingSpot = this.pickupSerial % 2;
      const rotatingKind = content.rotatingKinds.length
        ? this.pickNextRotatingKind(content.rotatingKinds)
        : content.baseKind;

      for (let i = 0; i < spots.length; i++) {
        const spot = spots[i];
        const kind = allBase ? content.baseKind : i === rotatingSpot ? rotatingKind : content.baseKind;
        const spec = content.kinds[kind];
        if (!spec) continue;
        const z = this.sampleHeight(spot.x, spot.y) + this.tuning.pickupHoverHeight;
        const inst = await this.spawnModel({
          path: content.model,
          x: spot.x,
          y: spot.y,
          z,
          teamColor: spec.teamColor,
          scale: spec.scale,
          sequenceHint: 'Stand',
        });
        if (!inst) continue;
        this.pickups.push({
          spotId: spot.id,
          spotName: spot.name,
          kind,
          label: spec.label,
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
      this.refreshingPickups = false;
    }
  }

  private tickPickups(dt: number): void {
    const heroPos = this.getHeroPosition();
    const kinds = this.content.pickups?.kinds;
    for (const p of this.pickups) {
      if (!p.alive) continue;
      p.yaw = (p.yaw + dt * 1.6) % (Math.PI * 2);
      this.face(p.instance, p.yaw);
      if (p.instance.sequenceEnded) {
        p.instance.setSequence?.(p.instance.sequence || 0);
      }
      if (heroPos && distance(p.x, p.y, heroPos.x, heroPos.y) <= this.tuning.pickupRange) {
        p.alive = false;
        this.lastPickupMessage = this.content.labels.pickupMessage(p.spotName, p.label);
        const reward = kinds?.[p.kind]?.goldReward;
        if (reward) {
          this.goldTotal += reward;
          this.addFloatingText('+' + reward, p.x, p.y, p.z + 55, FLOAT_GOLD_COLOR);
        } else {
          this.addFloatingText(p.label, p.x, p.y, p.z + 55, p.colorHex);
        }
        removeInstance(p.instance);
      }
    }
    this.pickups = this.pickups.filter((p) => p.alive);
  }

  addFloatingText(
    text: string,
    x: number,
    y: number,
    z: number,
    color = FLOAT_GOLD_COLOR,
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
    const labels = this.content.labels;
    const heroPos = this.getHeroPosition();
    if (heroPos) {
      list.push({
        id: 'hero_main',
        name: labels.hero,
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
        name: u.kind === 'creep' && u.team !== -1 ? labels.laneUnit(u.team) : labels.neutral,
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
}
