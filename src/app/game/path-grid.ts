import type { PathingData } from './game-data';

/**
 * 寻路栅格：由 war3map.wpm(32 码格) 降采样到 64 码格，8 向 A* + 视线拉直。
 * 全部整数/确定性运算，保证锁步同步下各端路径一致。
 */
export class PathGrid {
  readonly size: number;
  readonly cell = 64;
  readonly x0: number;
  readonly y0: number;
  private readonly blockedCells: Uint8Array;
  private readonly g: Float32Array;
  private readonly parent: Int32Array;
  private readonly mark: Uint32Array;
  private readonly closed: Uint32Array;
  private gen = 0;
  private heap: number[] = [];
  private heapF: number[] = [];

  constructor(data: PathingData) {
    const fine = new Uint8Array(data.width * data.height);
    let i = 0;
    let v = 0;
    for (const run of data.rle) {
      if (v) fine.fill(1, i, i + run);
      i += run;
      v ^= 1;
    }
    const ratio = Math.round(this.cell / data.cell);
    this.size = Math.floor(data.width / ratio);
    this.x0 = data.x0;
    this.y0 = data.y0;
    this.blockedCells = new Uint8Array(this.size * this.size);
    for (let cy = 0; cy < this.size; cy++) {
      for (let cx = 0; cx < this.size; cx++) {
        let n = 0;
        for (let dy = 0; dy < ratio; dy++) {
          for (let dx = 0; dx < ratio; dx++) n += fine[(cy * ratio + dy) * data.width + cx * ratio + dx];
        }
        // 4 个细格中 ≥2 个不可走即视为阻挡
        this.blockedCells[cy * this.size + cx] = n >= 2 ? 1 : 0;
      }
    }
    const total = this.size * this.size;
    this.g = new Float32Array(total);
    this.parent = new Int32Array(total);
    this.mark = new Uint32Array(total);
    this.closed = new Uint32Array(total);
  }

  cx(x: number): number {
    return Math.max(0, Math.min(this.size - 1, Math.floor((x - this.x0) / this.cell)));
  }
  cy(y: number): number {
    return Math.max(0, Math.min(this.size - 1, Math.floor((y - this.y0) / this.cell)));
  }
  private wx(cx: number): number {
    return this.x0 + (cx + 0.5) * this.cell;
  }
  private wy(cy: number): number {
    return this.y0 + (cy + 0.5) * this.cell;
  }

  blocked(x: number, y: number): boolean {
    return this.blockedCells[this.cy(y) * this.size + this.cx(x)] === 1;
  }
  private cellBlocked(cx: number, cy: number): boolean {
    if (cx < 0 || cy < 0 || cx >= this.size || cy >= this.size) return true;
    return this.blockedCells[cy * this.size + cx] === 1;
  }

  /** 给建筑等静态障碍盖章 / 拆除后清章 */
  stampCircle(x: number, y: number, r: number, block: boolean): void {
    const c0x = this.cx(x - r);
    const c1x = this.cx(x + r);
    const c0y = this.cy(y - r);
    const c1y = this.cy(y + r);
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const dx = this.wx(cx) - x;
        const dy = this.wy(cy) - y;
        if (dx * dx + dy * dy <= r * r) this.blockedCells[cy * this.size + cx] = block ? 1 : 0;
      }
    }
  }

  /** 两点间是否可直线行走（按半格步进采样） */
  los(ax: number, ay: number, bx: number, by: number): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.ceil(dist / (this.cell * 0.5));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (this.blocked(ax + dx * t, ay + dy * t)) return false;
    }
    return true;
  }

  /** 螺旋搜索最近可走格中心 */
  nearestFree(x: number, y: number): [number, number] {
    if (!this.blocked(x, y)) return [x, y];
    const bx = this.cx(x);
    const by = this.cy(y);
    for (let r = 1; r < 40; r++) {
      let best = -1;
      let bestD = 1e18;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const cx = bx + dx;
          const cy = by + dy;
          if (this.cellBlocked(cx, cy)) continue;
          const ddx = this.wx(cx) - x;
          const ddy = this.wy(cy) - y;
          const d = ddx * ddx + ddy * ddy;
          if (d < bestD) {
            bestD = d;
            best = cy * this.size + cx;
          }
        }
      }
      if (best >= 0) return [this.wx(best % this.size), this.wy(Math.floor(best / this.size))];
    }
    return [x, y];
  }

  // ---- 二叉堆 ----
  private push(node: number, f: number): void {
    const h = this.heap;
    const hf = this.heapF;
    let i = h.length;
    h.push(node);
    hf.push(f);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hf[p] <= f) break;
      h[i] = h[p];
      hf[i] = hf[p];
      i = p;
    }
    h[i] = node;
    hf[i] = f;
  }
  private pop(): number {
    const h = this.heap;
    const hf = this.heapF;
    const top = h[0];
    const last = h.pop() as number;
    const lastF = hf.pop() as number;
    const n = h.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = i * 2 + 1;
        if (c >= n) break;
        if (c + 1 < n && hf[c + 1] < hf[c]) c++;
        if (hf[c] >= lastF) break;
        h[i] = h[c];
        hf[i] = hf[c];
        i = c;
      }
      h[i] = last;
      hf[i] = lastF;
    }
    return top;
  }

  /** A* 寻路，返回拉直后的世界坐标路径点（不含起点）；不可达时走到最接近目标的格 */
  findPath(ax: number, ay: number, bx: number, by: number): [number, number][] {
    [bx, by] = this.nearestFree(bx, by);
    if (this.los(ax, ay, bx, by)) return [[bx, by]];
    const S = this.size;
    const [sx0, sy0] = this.nearestFree(ax, ay);
    const start = this.cy(sy0) * S + this.cx(sx0);
    const goalX = this.cx(bx);
    const goalY = this.cy(by);
    const goal = goalY * S + goalX;
    this.gen++;
    const gen = this.gen;
    this.heap.length = 0;
    this.heapF.length = 0;
    this.g[start] = 0;
    this.parent[start] = -1;
    this.mark[start] = gen;
    this.push(start, 0);
    let best = start;
    let bestH = 1e18;
    let expanded = 0;
    const SQ2 = 1.41421356;
    while (this.heap.length && expanded < 30000) {
      const cur = this.pop();
      if (this.closed[cur] === gen) continue;
      this.closed[cur] = gen;
      expanded++;
      const cx = cur % S;
      const cy = (cur - cx) / S;
      const hx = Math.abs(cx - goalX);
      const hy = Math.abs(cy - goalY);
      const h = Math.max(hx, hy) + (SQ2 - 1) * Math.min(hx, hy);
      if (h < bestH) {
        bestH = h;
        best = cur;
      }
      if (cur === goal) break;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (this.cellBlocked(nx, ny)) continue;
          // 禁止斜穿墙角
          if (dx && dy && (this.cellBlocked(cx + dx, cy) || this.cellBlocked(cx, cy + dy))) continue;
          const nb = ny * S + nx;
          if (this.closed[nb] === gen) continue;
          const ng = this.g[cur] + (dx && dy ? SQ2 : 1);
          if (this.mark[nb] !== gen || ng < this.g[nb]) {
            this.mark[nb] = gen;
            this.g[nb] = ng;
            this.parent[nb] = cur;
            const ax2 = Math.abs(nx - goalX);
            const ay2 = Math.abs(ny - goalY);
            this.push(nb, ng + Math.max(ax2, ay2) + (SQ2 - 1) * Math.min(ax2, ay2));
          }
        }
      }
    }
    // 回溯
    const cells: number[] = [];
    for (let c = best; c !== -1; c = this.parent[c]) cells.push(c);
    cells.reverse();
    const pts: [number, number][] = cells.map((c) => [this.wx(c % S), this.wy(Math.floor(c / S))]);
    if (best === goal) pts[pts.length - 1] = [bx, by];
    // 视线拉直
    const out: [number, number][] = [];
    let px = ax;
    let py = ay;
    let i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.los(px, py, pts[j][0], pts[j][1])) j--;
      out.push(pts[j]);
      px = pts[j][0];
      py = pts[j][1];
      i = j + 1;
    }
    return out;
  }
}
