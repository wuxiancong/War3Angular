/**
 * Content-neutral engine types.
 *
 * Nothing in `src/app/engine` may import game-specific content (unit tables,
 * map coordinates, model paths, display strings). Content is handed in through
 * the interfaces below.
 *
 * Conventions: world space is Z-up, positions are [x, y, z], facing is a yaw
 * angle around +Z in radians (0 = +X), passed to models as a quaternion
 * [0, 0, sin(yaw / 2), cos(yaw / 2)].
 */

/** The renderer-side handle of a spawned model. Every member is optional. */
export interface ModelInstance {
  model?: { sequences?: { name?: string }[] };
  /** Index of the animation sequence currently playing. */
  sequence?: number;
  /** True once a non-looping sequence has finished. */
  sequenceEnded?: boolean;
  localLocation?: ArrayLike<number>;
  location?: ArrayLike<number>;
  setLocation?(location: number[]): unknown;
  setRotation?(quaternion: number[]): unknown;
  setSequence?(index: number): unknown;
  detach?(): unknown;
  setScene?(scene: null): unknown;
}

export type HeightSampler = (x: number, y: number) => number;

export interface ModelSpawnRequest {
  path: string;
  x: number;
  y: number;
  z: number;
  teamColor: number;
  scale: number;
  sequenceHint?: string;
}

export type ModelSpawner = (opts: ModelSpawnRequest) => Promise<ModelInstance | null>;

/** A playable side. Neutral units use -1. */
export type Team = 0 | 1;

/** Model and combat numbers for one spawned unit. */
export interface UnitSpec {
  model: string;
  scale: number;
  hp: number;
  dps: number;
}

export function yawQuaternion(yaw: number): number[] {
  return [0, 0, Math.sin(yaw / 2), Math.cos(yaw / 2)];
}

/** Finds a sequence by exact name, then by substring; `fallback` if neither matches. */
export function findSequenceIndex(
  instance: ModelInstance | null | undefined,
  hint: string,
  fallback = 0
): number {
  const seqs = instance?.model?.sequences;
  if (!seqs?.length) return fallback;
  const h = hint.toLowerCase();
  const exact = seqs.findIndex((s) => String(s.name || '').toLowerCase().trim() === h);
  if (exact >= 0) return exact;
  const sub = seqs.findIndex((s) => String(s.name || '').toLowerCase().includes(h));
  return sub >= 0 ? sub : fallback;
}

export function removeInstance(instance: ModelInstance | null | undefined): void {
  try {
    instance?.detach?.();
    instance?.setScene?.(null);
  } catch {
    /* renderer already dropped it */
  }
}
