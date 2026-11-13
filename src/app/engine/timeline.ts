/**
 * Content-neutral building blocks for scrubbing through a recorded match:
 * a motion track (where an actor is at time t), a snapshot track (the latest
 * discrete state at time t) and an event log.
 *
 * A replay format decodes its own records and feeds these tracks; sampling
 * at any time is then independent of the format.
 */

export interface MotionKeyframe {
  t0: number;
  t1: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  facingRad: number;
  /** Animation name to play while this keyframe is active. */
  anim: string;
}

export interface MotionSample {
  x: number;
  y: number;
  facingRad: number;
  /** Animation of the active keyframe, or `idleAnim` between keyframes. */
  anim: string;
  /** True while inside a keyframe. */
  active: boolean;
  /** Recent positions, oldest first. */
  trail: { x: number; y: number }[];
}

export interface MotionTrackOptions {
  x: number;
  y: number;
  facingRad?: number;
  /** Units per second. */
  speed: number;
  idleAnim?: string;
  moveAnim?: string;
  /** Minimum distance between two trail points. */
  trailSpacing?: number;
  trailLength?: number;
}

/**
 * Builds straight-line movement keyframes from a stream of timed orders and
 * interpolates between them. Orders must be issued in time order.
 */
export class MotionTrack {
  readonly keyframes: MotionKeyframe[] = [];
  speed: number;
  private readonly startX: number;
  private readonly startY: number;
  private readonly startFacing: number;
  private readonly idleAnim: string;
  private readonly moveAnim: string;
  private readonly trailSpacing: number;
  private readonly trailLength: number;
  private curX: number;
  private curY: number;
  private curFacing: number;
  private targetX: number;
  private targetY: number;
  private moveStartT = 0;
  private moveEndT = 0;

  constructor(opts: MotionTrackOptions) {
    this.startX = this.curX = this.targetX = opts.x;
    this.startY = this.curY = this.targetY = opts.y;
    this.startFacing = this.curFacing = opts.facingRad ?? 0;
    this.speed = opts.speed;
    this.idleAnim = opts.idleAnim ?? 'Stand';
    this.moveAnim = opts.moveAnim ?? 'Walk';
    this.trailSpacing = opts.trailSpacing ?? 120;
    this.trailLength = opts.trailLength ?? 30;
  }

  /** Position reached by the orders issued so far. */
  get position(): { x: number; y: number; facingRad: number } {
    return { x: this.curX, y: this.curY, facingRad: this.curFacing };
  }

  /** Order a move to (x, y) starting at time t. Moves shorter than `minDistance` are ignored. */
  moveTo(t: number, x: number, y: number, minDistance = 8): void {
    this.advanceTo(t);
    this.cutAt(t);
    const dist = Math.hypot(x - this.curX, y - this.curY);
    if (dist <= minDistance) return;
    this.curFacing = Math.atan2(y - this.curY, x - this.curX);
    this.moveStartT = t;
    this.moveEndT = t + (dist / Math.max(1, this.speed)) * 1000;
    this.targetX = x;
    this.targetY = y;
  }

  /** Stop where the actor stands at time t. */
  stop(t: number): void {
    this.advanceTo(t);
    this.cutAt(t);
    this.moveEndT = 0;
    this.moveStartT = t;
  }

  /** Hold position from t for `durationMs` while playing `anim` (a cast, a channel). */
  hold(t: number, durationMs: number, anim: string): void {
    this.advanceTo(t);
    this.keyframes.push({
      t0: t,
      t1: t + durationMs,
      x0: this.curX,
      y0: this.curY,
      x1: this.curX,
      y1: this.curY,
      facingRad: this.curFacing,
      anim,
    });
  }

  /** Commit the pending move up to time t. Call once with the end time when done. */
  advanceTo(t: number): void {
    if (this.moveEndT <= this.moveStartT || t <= this.moveStartT) return;
    const clampedT = Math.min(t, this.moveEndT);
    const ratio = (clampedT - this.moveStartT) / Math.max(1, this.moveEndT - this.moveStartT);
    const nx = this.curX + (this.targetX - this.curX) * ratio;
    const ny = this.curY + (this.targetY - this.curY) * ratio;
    this.keyframes.push({
      t0: this.moveStartT,
      t1: clampedT,
      x0: this.curX,
      y0: this.curY,
      x1: nx,
      y1: ny,
      facingRad: this.curFacing,
      anim: this.moveAnim,
    });
    this.curX = nx;
    this.curY = ny;
    this.moveStartT = clampedT;
    if (clampedT >= this.moveEndT) this.moveEndT = 0;
  }

  /** Truncate any keyframe still running at time t. */
  private cutAt(t: number): void {
    for (const kf of this.keyframes) {
      if (t > kf.t0 && t < kf.t1) {
        const r = (t - kf.t0) / Math.max(1, kf.t1 - kf.t0);
        kf.x1 = kf.x0 + (kf.x1 - kf.x0) * r;
        kf.y1 = kf.y0 + (kf.y1 - kf.y0) * r;
        kf.t1 = t;
      }
    }
  }

  sampleAt(t: number): MotionSample {
    let x = this.startX;
    let y = this.startY;
    let facingRad = this.startFacing;
    let anim = this.idleAnim;
    let active = false;
    const trail: { x: number; y: number }[] = [{ x, y }];

    for (const kf of this.keyframes) {
      if (t >= kf.t1) {
        x = kf.x1;
        y = kf.y1;
        facingRad = kf.facingRad;
        const last = trail[trail.length - 1];
        if (Math.hypot(x - last.x, y - last.y) > this.trailSpacing) trail.push({ x, y });
      } else if (t >= kf.t0) {
        const r = (t - kf.t0) / Math.max(1, kf.t1 - kf.t0);
        x = kf.x0 + (kf.x1 - kf.x0) * r;
        y = kf.y0 + (kf.y1 - kf.y0) * r;
        facingRad = kf.facingRad;
        anim = kf.anim;
        active = true;
        trail.push({ x, y });
        break;
      } else {
        break;
      }
    }
    return { x, y, facingRad, anim, active, trail: trail.slice(-this.trailLength) };
  }
}

/** Discrete state over time: `at(t)` returns the last snapshot pushed at or before t. */
export class SnapshotTrack<T> {
  private readonly times: number[] = [];
  private readonly states: T[] = [];

  constructor(initial: T) {
    this.times.push(0);
    this.states.push(initial);
  }

  /** Snapshots must be pushed in time order. The caller passes an independent copy. */
  push(timeMs: number, state: T): void {
    this.times.push(timeMs);
    this.states.push(state);
  }

  at(timeMs: number): T {
    let lo = 0;
    let hi = this.times.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.times[mid] <= timeMs) lo = mid;
      else hi = mid - 1;
    }
    return this.states[lo];
  }

  get length(): number {
    return this.states.length;
  }
}

export interface TimedEvent {
  timeMs: number;
}

export class EventLog<E extends TimedEvent> {
  private readonly events: E[] = [];

  /** Events must be added in time order. */
  add(event: E): void {
    this.events.push(event);
  }

  /** The last `count` events at or before `timeMs`. */
  recent(timeMs: number, count: number): E[] {
    let end = this.events.length;
    while (end > 0 && this.events[end - 1].timeMs > timeMs) end--;
    return this.events.slice(Math.max(0, end - count), end);
  }

  all(): readonly E[] {
    return this.events;
  }
}

/** Formats milliseconds as mm:ss. */
export function formatMsClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
