/**
 * Builds a LaneSimContent from plain JSON, so units, camps, pickups, labels
 * and balance numbers can be authored as data instead of code.
 */
import type {
  CampCfg,
  LaneSimContent,
  LaneSimTuning,
  PickupContent,
  PickupSpotCfg,
} from './lane-sim';
import type { Team, UnitSpec } from './types';

export interface WaveTemplate {
  /** Fills every slot of the wave except the last. */
  core: UnitSpec;
  /** Takes the last slot of the wave. Omit for a wave of core units only. */
  support?: UnitSpec;
  /** Added on top of the wave every `every`-th wave. */
  heavy?: { every: number; unit: UnitSpec };
}

export interface LaneSimContentData {
  waves: { team0: WaveTemplate; team1: WaveTemplate };
  campUnits: Record<string, UnitSpec>;
  /** Used for camps without a `composition`, keyed by `camp.tier`. */
  campTiers?: Record<string, { unit: string; count: number }>;
  /** Unit key used for unknown composition keys and unknown tiers. */
  defaultCampUnit: string;
  defaultCampCount?: number;
  neutralTeamColor?: number;
  labels: {
    hero: string;
    laneUnits: [string, string];
    neutral: string;
    /** `{spot}` and `{kind}` are replaced. */
    pickupMessage: string;
  };
  pickups?: PickupContent;
  defaultPickupSpots?: PickupSpotCfg[];
  laneGoals?: { team0: [number, number]; team1: [number, number] };
  tuning?: Partial<LaneSimTuning>;
}

function buildWave(template: WaveTemplate, waveSerial: number, waveSize: number): UnitSpec[] {
  const wave: UnitSpec[] = [];
  for (let i = 0; i < waveSize; i++) {
    wave.push(template.support && i === waveSize - 1 ? template.support : template.core);
  }
  if (template.heavy && template.heavy.every > 0 && waveSerial % template.heavy.every === 0) {
    wave.push(template.heavy.unit);
  }
  return wave;
}

export function createLaneSimContent(data: LaneSimContentData): LaneSimContent {
  const fallback = data.campUnits[data.defaultCampUnit];
  if (!fallback) {
    throw new Error(`defaultCampUnit "${data.defaultCampUnit}" is not in campUnits`);
  }

  const resolveCampUnits = (camp: CampCfg): UnitSpec[] => {
    if (camp.composition?.length) {
      return camp.composition.map((key) => data.campUnits[key] || fallback);
    }
    const tier = camp.tier ? data.campTiers?.[camp.tier] : undefined;
    const base = (tier && data.campUnits[tier.unit]) || fallback;
    const count = camp.count ?? tier?.count ?? data.defaultCampCount ?? 3;
    return Array.from({ length: count }, () => ({ ...base, scale: camp.scale ?? base.scale }));
  };

  return {
    buildWave: (team: Team, waveSerial, waveSize) =>
      buildWave(team === 0 ? data.waves.team0 : data.waves.team1, waveSerial, waveSize),
    resolveCampUnits,
    neutralTeamColor: data.neutralTeamColor ?? 12,
    labels: {
      hero: data.labels.hero,
      laneUnit: (team) => data.labels.laneUnits[team],
      neutral: data.labels.neutral,
      pickupMessage: (spot, kind) =>
        data.labels.pickupMessage.replace('{spot}', spot).replace('{kind}', kind),
    },
    pickups: data.pickups,
    defaultPickupSpots: data.defaultPickupSpots,
    laneGoals: data.laneGoals,
    tuning: data.tuning,
  };
}

export async function loadLaneSimContent(url: string): Promise<LaneSimContent> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load lane sim content from ${url}: HTTP ${res.status}`);
  return createLaneSimContent((await res.json()) as LaneSimContentData);
}
