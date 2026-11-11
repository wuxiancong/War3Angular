import { describe, expect, it } from 'vitest';
import { createLaneSimContent, type LaneSimContentData } from './content-loader';
import { LaneSim, type LaneSimConfig } from './lane-sim';
import { EventLog, MotionTrack, SnapshotTrack, formatMsClock } from './timeline';
import type { ModelInstance, ModelSpawnRequest } from './types';

class FakeInstance implements ModelInstance {
  model = { sequences: [{ name: 'Stand' }, { name: 'Walk' }, { name: 'Attack' }, { name: 'Death' }] };
  sequence = 0;
  sequenceEnded = false;
  location: number[];
  removed = false;
  constructor(readonly request: ModelSpawnRequest) {
    this.location = [request.x, request.y, request.z];
  }
  setLocation(loc: number[]) {
    this.location = loc;
  }
  setRotation() {}
  setSequence(i: number) {
    this.sequence = i;
  }
  detach() {
    this.removed = true;
  }
  setScene() {}
}

const unit = (model: string, hp: number, dps: number) => ({ model, scale: 1, hp, dps });

const CONTENT: LaneSimContentData = {
  waves: {
    team0: {
      core: unit('a/core.glb', 100, 50),
      support: unit('a/support.glb', 60, 70),
      heavy: { every: 2, unit: unit('a/heavy.glb', 300, 90) },
    },
    team1: { core: unit('b/core.glb', 100, 50) },
  },
  campUnits: { small: unit('n/small.glb', 80, 10), big: unit('n/big.glb', 400, 30) },
  campTiers: { hard: { unit: 'big', count: 1 } },
  defaultCampUnit: 'small',
  labels: {
    hero: 'Hero',
    laneUnits: ['Blue trooper', 'Red trooper'],
    neutral: 'Wild',
    pickupMessage: '{kind} taken at {spot}',
  },
  pickups: {
    model: 'p/orb.glb',
    kinds: {
      coin: { label: 'Coin', teamColor: 0, colorHex: '#ff0', scale: 1, goldReward: 100 },
      surge: { label: 'Surge', teamColor: 1, colorHex: '#0ff', scale: 1 },
    },
    baseKind: 'coin',
    rotatingKinds: ['surge'],
  },
};

function makeConfig(overrides: Partial<LaneSimConfig> = {}): LaneSimConfig {
  return {
    enabled: true,
    heroMoveSpeed: 300,
    waveIntervalMs: 10000,
    waveSize: 3,
    laneUnitMoveSpeed: 200,
    campRefreshMs: 60000,
    pickupRefreshMs: 120000,
    startWavesAtMs: 1000,
    startCampsAtMs: 500,
    lanes: [
      {
        id: 'mid',
        team0Spawn: [-1000, 0],
        team1Spawn: [1000, 0],
        waypoints: [
          [-1000, 0],
          [1000, 0],
        ],
      },
    ],
    camps: [],
    pickupSpots: [],
    ...overrides,
  };
}

function makeSim(config: LaneSimConfig, hero: FakeInstance | null = null) {
  const spawned: FakeInstance[] = [];
  const sim = new LaneSim(config, createLaneSimContent(CONTENT), {
    sampleHeight: () => 0,
    spawnModel: async (req) => {
      const inst = new FakeInstance(req);
      spawned.push(inst);
      return inst;
    },
    heroInstance: hero,
    resolveHeroSeq: () => 0,
    random: () => 0,
    defer: (fn) => fn(),
  });
  return { sim, spawned };
}

/** Advance in 50 ms steps, yielding so async spawns can land. */
async function run(sim: LaneSim, ms: number): Promise<void> {
  for (let t = 0; t < ms; t += 50) {
    sim.tick(50);
    for (let i = 0; i < 20; i++) await Promise.resolve();
  }
}

const heroAt = (x: number, y: number) =>
  new FakeInstance({ path: 'hero', x, y, z: 0, teamColor: 0, scale: 1 });

describe('LaneSim', () => {
  it('spawns nothing before the first wave time, then one wave per team', async () => {
    const { sim, spawned } = makeSim(makeConfig());
    await sim.bootstrap();
    await run(sim, 900);
    expect(sim.units).toHaveLength(0);
    await run(sim, 200);
    expect(sim.units.filter((u) => u.team === 0)).toHaveLength(3);
    expect(sim.units.filter((u) => u.team === 1)).toHaveLength(3);
    expect(spawned.map((s) => s.request.path)).toEqual([
      'a/core.glb',
      'a/core.glb',
      'a/support.glb',
      'b/core.glb',
      'b/core.glb',
      'b/core.glb',
    ]);
  });

  it('adds the heavy unit on every second wave', async () => {
    const { sim, spawned } = makeSim(makeConfig({ waveIntervalMs: 1000 }));
    await sim.bootstrap();
    await run(sim, 2200);
    expect(spawned.filter((s) => s.request.path === 'a/heavy.glb')).toHaveLength(1);
  });

  it('walks lane units toward the other end and resolves the fight in the middle', async () => {
    const { sim } = makeSim(makeConfig());
    await sim.bootstrap();
    await run(sim, 2000);
    const blue = sim.units.find((u) => u.team === 0)!;
    expect(blue.x).toBeGreaterThan(-1000);
    await run(sim, 20000);
    const firstWaveAlive = sim.units.filter((u) => u.id.startsWith('creep_1_'));
    expect(firstWaveAlive.length).toBeLessThan(6);
    for (const u of sim.units) expect(u.hp).toBeGreaterThan(0);
  });

  it('refills an empty camp and pays the hero for clearing it', async () => {
    const hero = heroAt(5000, 5000);
    const config = makeConfig({
      lanes: [],
      camps: [
        { id: 'c1', x: 0, y: 0, tier: 'hard' },
        { id: 'c2', x: 3000, y: 0, composition: ['small', 'missing'] },
      ],
    });
    const { sim } = makeSim(config, hero);
    await sim.bootstrap();
    await run(sim, 600);
    expect(sim.units.filter((u) => u.campId === 'c1')).toHaveLength(1);
    expect(sim.units.filter((u) => u.campId === 'c2')).toHaveLength(2);

    const goldBefore = sim.getGoldTotal();
    hero.location = [0, 0, 0];
    await run(sim, 5000);
    expect(sim.units.filter((u) => u.campId === 'c1')).toHaveLength(0);
    expect(sim.getGoldTotal()).toBeGreaterThan(goldBefore);
    expect(sim.getHealthEntities().find((e) => e.kind === 'hero')?.name).toBe('Hero');
  });

  it('places pickups and grants the gold reward when the hero reaches one', async () => {
    const hero = heroAt(5000, 5000);
    const config = makeConfig({
      lanes: [],
      pickupSpots: [
        { id: 'north', name: 'North', x: 0, y: 500 },
        { id: 'south', name: 'South', x: 0, y: -500 },
      ],
    });
    const { sim } = makeSim(config, hero);
    await sim.bootstrap();
    await run(sim, 100);
    expect(sim.pickups.map((p) => p.kind).sort()).toEqual(['coin', 'surge']);

    const coin = sim.pickups.find((p) => p.kind === 'coin')!;
    const goldBefore = sim.getGoldTotal();
    hero.location = [coin.x, coin.y, 0];
    await run(sim, 100);
    expect(sim.getGoldTotal()).toBe(goldBefore + 100);
    expect(sim.lastPickupMessage).toBe(`Coin taken at ${coin.spotName}`);
    expect(sim.pickups).toHaveLength(1);
  });

  it('clears lane units when the clock is moved backwards', async () => {
    const { sim, spawned } = makeSim(makeConfig());
    await sim.bootstrap();
    await run(sim, 1500);
    expect(sim.units.length).toBeGreaterThan(0);
    sim.syncGameClock(0);
    expect(sim.units).toHaveLength(0);
    expect(spawned.every((s) => s.removed)).toBe(true);
  });

  it('does nothing while disabled', async () => {
    const { sim } = makeSim(makeConfig());
    sim.setEnabled(false);
    await run(sim, 3000);
    expect(sim.clockMs).toBe(0);
    expect(sim.units).toHaveLength(0);
  });
});

describe('timeline tracks', () => {
  it('interpolates a move and reports the idle animation after arrival', () => {
    const track = new MotionTrack({ x: 0, y: 0, speed: 100 });
    track.moveTo(1000, 200, 0);
    track.advanceTo(10000);
    expect(track.sampleAt(500)).toMatchObject({ x: 0, y: 0, anim: 'Stand', active: false });
    expect(track.sampleAt(2000)).toMatchObject({ x: 100, y: 0, anim: 'Walk', active: true });
    expect(track.sampleAt(5000)).toMatchObject({ x: 200, y: 0, anim: 'Stand', active: false });
  });

  it('cuts a move short when a new order or a stop arrives', () => {
    const track = new MotionTrack({ x: 0, y: 0, speed: 100 });
    track.moveTo(0, 1000, 0);
    track.moveTo(2000, 200, 300);
    track.stop(3000);
    track.advanceTo(20000);
    expect(track.sampleAt(2000).x).toBeCloseTo(200);
    const end = track.sampleAt(20000);
    expect(end.x).toBeCloseTo(200);
    expect(end.y).toBeCloseTo(100);
    expect(end.active).toBe(false);
  });

  it('holds position with a custom animation', () => {
    const track = new MotionTrack({ x: 5, y: 5, speed: 100 });
    track.hold(1000, 2000, 'Spell');
    expect(track.sampleAt(1500)).toMatchObject({ x: 5, y: 5, anim: 'Spell', active: true });
  });

  it('returns the latest snapshot at or before a time', () => {
    const snaps = new SnapshotTrack({ level: 1 });
    snaps.push(1000, { level: 2 });
    snaps.push(5000, { level: 3 });
    expect(snaps.at(0).level).toBe(1);
    expect(snaps.at(999).level).toBe(1);
    expect(snaps.at(1000).level).toBe(2);
    expect(snaps.at(99999).level).toBe(3);
  });

  it('returns recent events up to a time', () => {
    const log = new EventLog<{ timeMs: number; text: string }>();
    for (let i = 1; i <= 5; i++) log.add({ timeMs: i * 1000, text: `e${i}` });
    expect(log.recent(3500, 2).map((e) => e.text)).toEqual(['e2', 'e3']);
    expect(log.recent(500, 2)).toEqual([]);
  });

  it('formats a clock', () => {
    expect(formatMsClock(0)).toBe('00:00');
    expect(formatMsClock(125000)).toBe('02:05');
  });
});

describe('createLaneSimContent', () => {
  it('rejects a default camp unit that does not exist', () => {
    expect(() => createLaneSimContent({ ...CONTENT, defaultCampUnit: 'nope' })).toThrow(/nope/);
  });
});
