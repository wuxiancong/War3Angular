/**
 * 战争迷雾（对战页与录像页共用）。
 *
 * 原版的实现见 War3Analysis/analyses/warcraft-iii-fog-of-war-implementation.md：
 * 迷雾栅格在 game.dll 里（每格每玩家「当前可见 / 已探索」两组位），war3map.j 只用原生函数开关与改写。
 * DotA 开局把整张图标记为已探索，因此只有「可见」与「迷雾」两态；迷雾里地面压暗、敌方单位隐藏、建筑照常显示。
 *
 * 这里按同样的规则在本端计算，只影响显示，不进入锁步模拟（开关迷雾不会失步）：
 *  - 视野 = 己方单位/建筑的 sight（白天）/ nsight（夜晚）
 *  - 视线遮挡：树木（DestructableData occH，DotA 的 ATtr = 230）与更高的悬崖层挡住视线
 *  - 迷雾中攻击暴露：FoggedAttackRevealRadius = 200（由调用方作为视野源传入，ignoreLos）
 *  - 渐变：每格的迷雾浓度随时间过渡（对应 MiscData FogFlashTime），绘制时再做 3×3 模糊，边缘不是硬方块
 */
import type { Project } from './overlay-draw';

export interface VisionSource {
  x: number;
  y: number;
  r: number;
  /** 不受树木/高地遮挡（迷雾中攻击暴露等） */
  ignoreLos?: boolean;
}

/** 视线遮挡数据：与迷雾格对齐（128 码一格） */
export interface VisionOccluders {
  /** 每格的悬崖层（越大越高） */
  level: Uint8Array;
  /** 每格是否有挡视线的树 */
  tree: Uint8Array;
}

/**
 * 迷雾里压掉的亮度比例。按原版实机截图量的：同一片草地，迷雾里约为有视野处的 0.4 倍
 * （War3Angular/scratch/terrain-scan/game/g_07_02.jpg）。
 */
export const FOG_ALPHA = 0.6;
/** 迷雾浓度从 0 到 1（或反向）所需时间，秒 */
const FADE_SEC = 0.6;
/** 绘制时把浓度量化成几档，每档一次 fill */
const LEVELS = 5;

export class VisionGrid {
  readonly cell = 128;
  readonly size: number;
  private readonly vis: Uint8Array;
  /** 当前显示的迷雾浓度 0（清晰）~ 1（迷雾），随时间向目标值过渡 */
  private readonly shade: Float32Array;
  private readonly blurred: Float32Array;
  private occ: VisionOccluders | null = null;
  private lastFade = 0;

  constructor(
    private readonly x0 = -8192,
    private readonly y0 = -8192,
    span = 16384
  ) {
    this.size = Math.ceil(span / this.cell);
    this.vis = new Uint8Array(this.size * this.size);
    this.shade = new Float32Array(this.size * this.size).fill(1);
    this.blurred = new Float32Array(this.size * this.size).fill(1);
  }

  /** 每格的迷雾浓度（已模糊，0 清晰 ~ 1 迷雾；行 0 在南）。fade() 原地更新，可直接交给 3D 查看器画 */
  get density(): Float32Array {
    return this.blurred;
  }

  get hasOccluders(): boolean {
    return !!this.occ;
  }

  setOccluders(o: VisionOccluders | null): void {
    if (o && o.level.length === this.size * this.size && o.tree.length === this.size * this.size) this.occ = o;
  }

  /** 按视野源重新计算可见格（带视线遮挡） */
  update(sources: VisionSource[]): void {
    const { vis, size, cell } = this;
    vis.fill(0);
    for (const s of sources) {
      const scx = Math.floor((s.x - this.x0) / cell);
      const scy = Math.floor((s.y - this.y0) / cell);
      if (scx < 0 || scy < 0 || scx >= size || scy >= size) continue;
      const rc = Math.ceil(s.r / cell);
      const r2 = s.r * s.r;
      const useLos = !!this.occ && !s.ignoreLos;
      const myLevel = useLos ? this.occ!.level[scy * size + scx] : 0;
      for (let cy = Math.max(0, scy - rc); cy <= Math.min(size - 1, scy + rc); cy++) {
        const dy = this.y0 + (cy + 0.5) * cell - s.y;
        for (let cx = Math.max(0, scx - rc); cx <= Math.min(size - 1, scx + rc); cx++) {
          const idx = cy * size + cx;
          if (vis[idx]) continue;
          const dx = this.x0 + (cx + 0.5) * cell - s.x;
          if (dx * dx + dy * dy > r2) continue;
          if (useLos && !this.lineOfSight(scx, scy, cx, cy, myLevel)) continue;
          vis[idx] = 1;
        }
      }
    }
  }

  /**
   * 格子间视线：沿直线逐格前进，途中遇到树或比观察者更高的悬崖层即被挡住；
   * 目标格本身比观察者高也看不到（低地看不到高地）。树所在的格子本身可见。
   */
  private lineOfSight(x0: number, y0: number, x1: number, y1: number, myLevel: number): boolean {
    const { level, tree } = this.occ!;
    const size = this.size;
    if (level[y1 * size + x1] > myLevel) return false;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = x0;
    let y = y0;
    for (;;) {
      if (x === x1 && y === y1) return true;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
      if (x === x1 && y === y1) return true;
      const i = y * size + x;
      if (tree[i] || level[i] > myLevel) return false;
    }
  }

  visible(x: number, y: number): boolean {
    const cx = Math.floor((x - this.x0) / this.cell);
    const cy = Math.floor((y - this.y0) / this.cell);
    if (cx < 0 || cy < 0 || cx >= this.size || cy >= this.size) return false;
    return this.vis[cy * this.size + cx] === 1;
  }

  /** 每帧调用：迷雾浓度向目标值过渡，并做一次 3×3 模糊供绘制 */
  fade(): void {
    const now = performance.now();
    const dt = this.lastFade ? Math.min(0.25, (now - this.lastFade) / 1000) : 1;
    this.lastFade = now;
    const step = dt / FADE_SEC;
    const { vis, shade, blurred, size } = this;
    for (let i = 0; i < shade.length; i++) {
      const target = vis[i] ? 0 : 1;
      const v = shade[i];
      shade[i] = v < target ? Math.min(target, v + step) : Math.max(target, v - step);
    }
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let sum = 0;
        let n = 0;
        for (let oy = -1; oy <= 1; oy++) {
          const yy = y + oy;
          if (yy < 0 || yy >= size) continue;
          for (let ox = -1; ox <= 1; ox++) {
            const xx = x + ox;
            if (xx < 0 || xx >= size) continue;
            sum += shade[yy * size + xx];
            n++;
          }
        }
        blurred[y * size + x] = sum / n;
      }
    }
  }

  /** 把浓度量化成 LEVELS 档；0 档（清晰）不画 */
  private level(i: number): number {
    return Math.round(this.blurred[i] * LEVELS);
  }

  /**
   * 3D 视口（2D 叠加层画法，已不用）：把镜头附近处于迷雾的格子按浓度分档压暗。
   * 现在两页都把 density 交给 Wc3MdxViewer.setFogDensity 在 WebGL 里画（边缘平滑、全图覆盖）。
   */
  drawWorld(ctx: CanvasRenderingContext2D, project: Project, height: (x: number, y: number) => number, focusX: number, focusY: number, radius = 3200): void {
    const { size, cell } = this;
    const c0x = Math.max(0, Math.floor((focusX - radius - this.x0) / cell));
    const c1x = Math.min(size - 1, Math.floor((focusX + radius - this.x0) / cell));
    const c0y = Math.max(0, Math.floor((focusY - radius - this.y0) / cell));
    const c1y = Math.min(size - 1, Math.floor((focusY + radius - this.y0) / cell));
    const w = c1x - c0x + 2;
    const pts: ({ x: number; y: number } | null)[] = new Array(w * (c1y - c0y + 2));
    const corner = (cx: number, cy: number) => {
      const k = (cy - c0y) * w + (cx - c0x);
      let p = pts[k];
      if (p === undefined) {
        const x = this.x0 + cx * cell;
        const y = this.y0 + cy * cell;
        p = project(x, y, height(x, y) + 4);
        pts[k] = p;
      }
      return p;
    };
    for (let lv = 1; lv <= LEVELS; lv++) {
      ctx.beginPath();
      let any = false;
      for (let cy = c0y; cy <= c1y; cy++) {
        for (let cx = c0x; cx <= c1x; cx++) {
          if (this.level(cy * size + cx) !== lv) continue;
          const a = corner(cx, cy);
          const b = corner(cx + 1, cy);
          const c = corner(cx + 1, cy + 1);
          const d = corner(cx, cy + 1);
          if (!a || !b || !c || !d) continue;
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.lineTo(c.x, c.y);
          ctx.lineTo(d.x, d.y);
          ctx.closePath();
          any = true;
        }
      }
      if (!any) continue;
      ctx.fillStyle = `rgba(0,0,0,${((FOG_ALPHA * lv) / LEVELS).toFixed(3)})`;
      ctx.fill('nonzero');
    }
  }

  /** 小地图：迷雾区域按浓度压暗 */
  drawMinimap(ctx: CanvasRenderingContext2D, S: number, toPx: (x: number, y: number) => { px: number; py: number }): void {
    const { size, cell } = this;
    for (let lv = 1; lv <= LEVELS; lv++) {
      ctx.fillStyle = `rgba(0,0,0,${((FOG_ALPHA * lv) / LEVELS).toFixed(3)})`;
      for (let cy = 0; cy < size; cy++) {
        for (let cx = 0; cx < size; cx++) {
          if (this.level(cy * size + cx) !== lv) continue;
          const a = toPx(this.x0 + cx * cell, this.y0 + cy * cell);
          const b = toPx(this.x0 + (cx + 1) * cell, this.y0 + (cy + 1) * cell);
          ctx.fillRect(Math.min(a.px, b.px), Math.min(a.py, b.py), Math.abs(b.px - a.px) + 0.5, Math.abs(b.py - a.py) + 0.5);
        }
      }
    }
  }
}
