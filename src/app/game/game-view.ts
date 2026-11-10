/**
 * 对战表现层：把 GameEngine 的单位状态同步到 mdx-m3-viewer 模型实例，
 * 并在 2D 叠加画布上绘制血条 / 弹道 / 神符 / 跳字 / 选择圈 / 技能指示器。
 * 只读引擎状态，不参与逻辑（对应 WC3「表现层只读模拟层」）。
 */
import type { Wc3MdxViewer } from '../replay3d/wc3-mdx-viewer';
import { getHeroByCode } from '../replay3d/dota-hero-roster';
import { RUNE_NAMES, type GameEngine, type GameEvent, type Unit } from './game-engine';

interface Visual {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inst: any | null;
  loading: boolean;
  vx: number;
  vy: number;
  vf: number;
  seq: Record<string, number>;
  serial: number;
  anim: string;
  isBuilding: boolean;
  dead: boolean;
}

interface FloatText {
  x: number;
  y: number;
  z: number;
  text: string;
  color: string;
  age: number;
}
interface RingFx {
  x: number;
  y: number;
  r: number;
  color: string;
  age: number;
  life: number;
}

/** WC3 玩家颜色：近卫 1-5（蓝/青/紫/黄/橙），天灾 7-11（粉/灰/浅蓝/深绿/棕） */
export const PLAYER_COLORS = ['#0042ff', '#1ce6b9', '#540081', '#fffc01', '#fe8a0e', '#e55bb0', '#959697', '#7ebff1', '#106246', '#4e2a04'];
const TEAM_HP = ['#22c55e', '#ef4444', '#eab308'];
const RUNE_COLOR: Record<string, string> = { bounty: '#f59e0b', dd: '#38bdf8', haste: '#ef4444', regen: '#22c55e', invis: '#a855f7' };

export interface TargetingHint {
  /** 施法距离圈 */
  range: number;
  /** 落点范围圈 */
  aoe: number;
  mode: 'unit' | 'point';
}

export class GameView {
  private readonly visuals = new Map<number, Visual>();
  private readonly ctx: CanvasRenderingContext2D;
  private floats: FloatText[] = [];
  private rings: RingFx[] = [];
  private pointer = { x: 0, y: 0, wx: 0, wy: 0, has: false };
  selectedId = 0;
  hoverId = 0;
  targeting: TargetingHint | null = null;
  showHpBars = true;
  private moveMarker: { x: number; y: number; age: number; attack: boolean } | null = null;
  private disposed = false;

  constructor(
    private readonly viewer: Wc3MdxViewer,
    private readonly engine: GameEngine,
    private readonly overlay: HTMLCanvasElement,
    private readonly mySlot: number
  ) {
    this.ctx = overlay.getContext('2d') as CanvasRenderingContext2D;
    // 建筑：复用 viewer 已铺好的实例
    const placed = new Map(viewer.getPlacedBuildings().map((b) => [b.id, b.instance]));
    for (const u of engine.units.values()) {
      if (!u.key) continue;
      const inst = placed.get(u.key) || null;
      this.visuals.set(u.id, {
        inst,
        loading: false,
        vx: u.x,
        vy: u.y,
        vf: u.facing,
        seq: inst ? this.resolveSeqs(inst) : {},
        serial: 0,
        anim: 'stand',
        isBuilding: true,
        dead: false,
      });
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const v of this.visuals.values()) {
      if (!v.isBuilding) this.detach(v);
    }
    this.visuals.clear();
  }

  setPointer(clientX: number, clientY: number): void {
    const rect = this.overlay.getBoundingClientRect();
    this.pointer.x = clientX - rect.left;
    this.pointer.y = clientY - rect.top;
    const w = this.viewer.pickGroundAt(clientX, clientY);
    if (w) {
      this.pointer.wx = w.x;
      this.pointer.wy = w.y;
      this.pointer.has = true;
    }
  }

  markMove(x: number, y: number, attack: boolean): void {
    this.moveMarker = { x, y, age: 0, attack };
  }

  /** 屏幕拾取：返回指针附近最近的存活单位 */
  pick(clientX: number, clientY: number, filter?: (u: Unit) => boolean): Unit | null {
    const rect = this.overlay.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    let best: Unit | null = null;
    let bestD = 1e9;
    for (const u of this.engine.units.values()) {
      if (!u.alive || (filter && !filter(u))) continue;
      if (u.kind === 'hero' && u.team !== this.myTeam() && this.engine.hasBuff(u, 'invis')) continue;
      const v = this.visuals.get(u.id);
      const x = v ? v.vx : u.x;
      const y = v ? v.vy : u.y;
      const z = this.viewer.sampleHeight(x, y);
      const big = u.kind === 'tower' || u.kind === 'rax' || u.kind === 'ancient' || u.kind === 'fountain';
      const p = this.project(x, y, z + (big ? 110 : 50), rect.width, rect.height);
      if (!p) continue;
      const r = big ? 62 : u.kind === 'hero' ? 40 : 30;
      const d = Math.hypot(p.x - px, p.y - py);
      if (d < r && d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }

  private myTeam(): number {
    return this.mySlot < 5 ? 0 : 1;
  }

  private project(x: number, y: number, z: number, w: number, h: number): { x: number; y: number } | null {
    const p = this.viewer.projectWorldToScreen(x, y, z);
    return p ? { x: (p.sx / 100) * w, y: (p.sy / 100) * h } : null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private resolveSeqs(inst: any): Record<string, number> {
    const seqs = (inst?.model?.sequences || []) as { name?: string }[];
    const names = seqs.map((s) => String(s.name || '').toLowerCase().replace(/\0/g, '').trim());
    const find = (...prefixes: string[]): number => {
      for (const p of prefixes) {
        const exact = names.findIndex((n) => n === p);
        if (exact >= 0) return exact;
      }
      for (const p of prefixes) {
        const i = names.findIndex((n) => n.startsWith(p) && !n.includes('alternate') && !n.includes('swim'));
        if (i >= 0) return i;
      }
      return -1;
    };
    const stand = Math.max(0, find('stand', 'stand - 1', 'stand 1'));
    const attack = find('attack', 'attack - 1', 'attack 1');
    return {
      stand,
      walk: find('walk') >= 0 ? find('walk') : stand,
      attack: attack >= 0 ? attack : stand,
      spell: find('spell') >= 0 ? find('spell') : attack >= 0 ? attack : stand,
      death: find('death'),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private detach(v: Visual): void {
    try {
      v.inst?.detach?.();
      v.inst?.setScene?.(null);
    } catch {
      /* ignore */
    }
    v.inst = null;
  }

  private spawnVisual(u: Unit): Visual {
    const v: Visual = { inst: null, loading: true, vx: u.x, vy: u.y, vf: u.facing, seq: {}, serial: -1, anim: '', isBuilding: false, dead: false };
    this.visuals.set(u.id, v);
    let path = u.model;
    let assetBaseUrl: string | undefined;
    let scale = u.scale || 1;
    let teamColor = u.team === 0 ? 0 : u.team === 1 ? 6 : 12;
    const fallbacks: string[] = [];
    if (u.hero) {
      const roster = getHeroByCode(u.typeId);
      if (roster) {
        path = roster.modelUrl;
        assetBaseUrl = roster.assetBaseUrl;
        fallbacks.push(u.model);
      }
      fallbacks.push(u.team === 0 ? 'Units\\Human\\HeroPaladin\\HeroPaladin' : 'Units\\Demon\\HeroPitLord\\HeroPitLord');
      scale = 1;
      teamColor = u.hero.slot < 5 ? u.hero.slot + 1 : u.hero.slot + 2;
    } else if (u.kind === 'creep') {
      fallbacks.push(u.team === 0 ? 'Units\\NightElf\\Ent\\Ent' : 'Units\\Undead\\Ghoul\\Ghoul');
      scale = Math.min(1, scale) * 0.85;
    } else {
      fallbacks.push('Units\\Creeps\\Kobold\\Kobold', 'Units\\Creeps\\ForestTroll\\ForestTroll');
      scale = Math.min(1.5, scale);
    }
    void this.viewer.spawnUnit({ path, assetBaseUrl, fallbacks, x: u.x, y: u.y, teamColor, scale }).then((inst) => {
      v.loading = false;
      if (this.disposed || !this.visuals.has(u.id) || !inst) {
        try {
          inst?.detach?.();
          inst?.setScene?.(null);
        } catch {
          /* ignore */
        }
        return;
      }
      v.inst = inst;
      v.seq = this.resolveSeqs(inst);
      v.serial = -1;
    });
    return v;
  }

  /** 消费引擎事件（跳字/特效圈），其余事件原样返回给 HUD */
  consumeEvents(events: GameEvent[]): GameEvent[] {
    const rest: GameEvent[] = [];
    for (const e of events) {
      if (e.type === 'float') {
        if (e.slot !== undefined && e.slot !== this.mySlot) continue;
        this.floats.push({ x: e.x, y: e.y, z: this.viewer.sampleHeight(e.x, e.y) + 110, text: e.text, color: e.color, age: 0 });
      } else if (e.type === 'fx') {
        const color = e.kind === 'levelup' ? '#fde047' : e.kind === 'blink' ? '#c4b5fd' : e.team === 0 ? '#6ee7b7' : '#fca5a5';
        this.rings.push({ x: e.x, y: e.y, r: e.r || (e.kind === 'aoe' ? 250 : 110), color, age: 0, life: e.kind === 'aoe' ? 0.6 : 0.45 });
      } else rest.push(e);
    }
    return rest;
  }

  /** 每个渲染帧调用 */
  sync(dtMs: number): void {
    const dt = dtMs / 1000;
    const engine = this.engine;
    const k = Math.min(1, dtMs / 70); // 位置指数平滑，掩盖 50ms 逻辑步进
    const seen = new Set<number>();
    const myTeam = this.myTeam();
    for (const u of engine.units.values()) {
      seen.add(u.id);
      let v = this.visuals.get(u.id);
      if (!v) v = this.spawnVisual(u);
      if (v.isBuilding) {
        if (!u.alive && !v.dead) {
          v.dead = true;
          const inst = v.inst;
          if (inst) {
            if (v.seq['death'] >= 0) {
              inst.setSequenceLoopMode?.(1);
              inst.setSequence(v.seq['death']);
            }
            setTimeout(() => {
              try {
                inst.detach?.();
                inst.setScene?.(null);
              } catch {
                /* ignore */
              }
            }, v.seq['death'] >= 0 ? 2600 : 0);
          }
        } else if (u.alive && v.inst && u.kind === 'tower') {
          const want = u.anim === 'attack' ? 'attack' : 'stand';
          if (v.serial !== u.animSerial || v.anim !== want) {
            v.serial = u.animSerial;
            v.anim = want;
            if (v.seq[want] >= 0) v.inst.setSequence(v.seq[want]);
          } else if (v.inst.sequenceEnded) v.inst.setSequence(v.seq['stand'] ?? 0);
        }
        continue;
      }
      // 平滑位置；瞬移（闪烁/复活）直接对齐
      const dx = u.x - v.vx;
      const dy = u.y - v.vy;
      if (dx * dx + dy * dy > 350 * 350) {
        v.vx = u.x;
        v.vy = u.y;
      } else {
        v.vx += dx * k;
        v.vy += dy * k;
      }
      let da = u.facing - v.vf;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      v.vf += da * Math.min(1, dtMs / 90);
      const inst = v.inst;
      if (!inst) continue;
      const hidden = u.kind === 'hero' && u.team !== myTeam && u.alive && engine.hasBuff(u, 'invis');
      if (u.hero && !u.alive && engine.tick - u.diedAt > 50) {
        // 阵亡英雄尸体 2.5 秒后隐藏，复活时再显示
        if (!v.dead) {
          v.dead = true;
          inst.hide?.();
        }
        continue;
      }
      if (v.dead && u.alive) {
        v.dead = false;
        inst.show?.();
        v.serial = -1;
      }
      if (hidden) inst.hide?.();
      else if (!v.dead) inst.show?.();
      inst.setLocation([v.vx, v.vy, this.viewer.sampleHeight(v.vx, v.vy)]);
      inst.setRotation?.([0, 0, Math.sin(v.vf / 2), Math.cos(v.vf / 2)]);
      const want = u.anim;
      if (v.serial !== u.animSerial || v.anim !== want) {
        v.serial = u.animSerial;
        v.anim = want;
        const idx = v.seq[want];
        if (idx !== undefined && idx >= 0) {
          inst.setSequenceLoopMode?.(want === 'death' ? 1 : want === 'stand' || want === 'walk' ? 2 : 0);
          inst.setSequence(idx);
        }
      } else if (inst.sequenceEnded && want !== 'death') {
        inst.setSequence(inst.sequence);
      }
    }
    // 引擎已移除的单位
    for (const [id, v] of this.visuals) {
      if (seen.has(id) || v.isBuilding) continue;
      this.detach(v);
      this.visuals.delete(id);
    }
    this.drawOverlay(dt);
  }

  /** 单位平滑后的显示坐标（镜头跟随用） */
  visualPos(id: number): { x: number; y: number } | null {
    const v = this.visuals.get(id);
    return v ? { x: v.vx, y: v.vy } : null;
  }

  private drawOverlay(dt: number): void {
    const c = this.overlay;
    const rect = c.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(1, Math.round(rect.width));
    const H = Math.max(1, Math.round(rect.height));
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const engine = this.engine;
    const myTeam = this.myTeam();
    const H0 = (x: number, y: number) => this.viewer.sampleHeight(x, y);

    // 地面圆（世界半径 → 屏幕椭圆）
    const groundCircle = (x: number, y: number, r: number, stroke: string, lw = 2, fill?: string) => {
      const z = H0(x, y) + 6;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i <= 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        const p = this.project(x + Math.cos(a) * r, y + Math.sin(a) * r, z, W, H);
        if (!p) continue;
        if (!started) {
          ctx.moveTo(p.x, p.y);
          started = true;
        } else ctx.lineTo(p.x, p.y);
      }
      if (!started) return;
      ctx.closePath();
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.stroke();
    };

    // 选择圈 / 悬停圈
    for (const id of [this.selectedId, this.hoverId]) {
      const u = id ? engine.units.get(id) : undefined;
      if (!u || !u.alive) continue;
      const v = this.visuals.get(u.id);
      const col = u.team === myTeam ? '#22c55e' : u.team === 2 ? '#eab308' : '#ef4444';
      groundCircle(v ? v.vx : u.x, v ? v.vy : u.y, Math.max(40, u.collision * 1.6), id === this.selectedId ? col : col + '88', id === this.selectedId ? 2.5 : 1.5);
    }

    // 技能指示器
    const me = engine.heroes[this.mySlot];
    if (this.targeting && me?.alive) {
      const mv = this.visuals.get(me.id);
      if (this.targeting.range > 0 && this.targeting.range < 5000) {
        groundCircle(mv ? mv.vx : me.x, mv ? mv.vy : me.y, this.targeting.range, 'rgba(96,165,250,0.75)', 1.5);
      }
      if (this.targeting.aoe > 0 && this.pointer.has) {
        groundCircle(this.pointer.wx, this.pointer.wy, this.targeting.aoe, 'rgba(250,204,21,0.9)', 2, 'rgba(250,204,21,0.12)');
      }
    }

    // 移动/攻击点击标记
    if (this.moveMarker) {
      const m = this.moveMarker;
      m.age += dt;
      if (m.age > 0.5) this.moveMarker = null;
      else groundCircle(m.x, m.y, 60 * (1 - m.age / 0.5) + 10, m.attack ? '#ef4444' : '#22c55e', 2.5);
    }

    // 技能特效圈
    this.rings = this.rings.filter((r) => (r.age += dt) < r.life);
    for (const r of this.rings) {
      const t = r.age / r.life;
      ctx.globalAlpha = 1 - t;
      groundCircle(r.x, r.y, r.r * (0.35 + 0.65 * t), r.color, 3, r.color + '22');
      ctx.globalAlpha = 1;
    }

    // 神符
    for (const rune of engine.runes) {
      if (!rune) continue;
      const p = this.project(rune.x, rune.y, H0(rune.x, rune.y) + 60, W, H);
      if (!p) continue;
      const pulse = 1 + Math.sin(performance.now() / 250) * 0.12;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = RUNE_COLOR[rune.kind];
      ctx.shadowColor = RUNE_COLOR[rune.kind];
      ctx.shadowBlur = 14;
      ctx.fillRect(-9 * pulse, -9 * pulse, 18 * pulse, 18 * pulse);
      ctx.restore();
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(RUNE_NAMES[rune.kind], p.x, p.y - 18);
      ctx.fillText(RUNE_NAMES[rune.kind], p.x, p.y - 18);
    }

    // 弹道
    for (const pr of engine.projectiles) {
      const p = this.project(pr.x, pr.y, H0(pr.x, pr.y) + pr.z, W, H);
      if (!p) continue;
      const col = pr.isAttack ? (pr.team === 0 ? '#bbf7d0' : pr.team === 1 ? '#fecaca' : '#fde68a') : '#93c5fd';
      ctx.beginPath();
      ctx.arc(p.x, p.y, pr.isAttack ? 4 : 6, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // 血条
    if (this.showHpBars) {
      for (const u of engine.units.values()) {
        if (!u.alive || u.kind === 'fountain') continue;
        if (u.kind === 'hero' && u.team !== myTeam && engine.hasBuff(u, 'invis')) continue;
        const v = this.visuals.get(u.id);
        const x = v ? v.vx : u.x;
        const y = v ? v.vy : u.y;
        const isB = u.kind === 'tower' || u.kind === 'rax' || u.kind === 'ancient';
        if (isB && u.hp >= u.maxHp && u.id !== this.selectedId && u.id !== this.hoverId) continue;
        const p = this.project(x, y, H0(x, y) + (isB ? 300 : u.kind === 'hero' ? 150 : 105), W, H);
        if (!p) continue;
        const w = isB ? 64 : u.kind === 'hero' ? 62 : 36;
        const h = u.kind === 'hero' ? 7 : 5;
        const pct = Math.max(0, Math.min(1, u.hp / u.maxHp));
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(p.x - w / 2 - 1, p.y - 1, w + 2, h + 2);
        ctx.fillStyle = u.team === 2 ? TEAM_HP[2] : u.team === myTeam ? TEAM_HP[0] : TEAM_HP[1];
        ctx.fillRect(p.x - w / 2, p.y, w * pct, h);
        if (u.hero) {
          const mp = u.maxMp > 0 ? u.mp / u.maxMp : 0;
          ctx.fillStyle = 'rgba(0,0,0,0.8)';
          ctx.fillRect(p.x - w / 2 - 1, p.y + h + 1, w + 2, 4);
          ctx.fillStyle = '#3b82f6';
          ctx.fillRect(p.x - w / 2, p.y + h + 1, w * mp, 3);
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          const label = `${u.hero.playerName} · ${u.hero.level}`;
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 3;
          ctx.strokeText(label, p.x, p.y - 5);
          ctx.fillStyle = PLAYER_COLORS[u.hero.slot] === '#540081' ? '#c084fc' : PLAYER_COLORS[u.hero.slot];
          ctx.fillText(label, p.x, p.y - 5);
          if (engine.hasBuff(u, 'stun')) {
            ctx.fillStyle = '#fde047';
            ctx.fillText('眩晕', p.x, p.y - 20);
          }
        }
      }
    }

    // 跳字
    this.floats = this.floats.filter((f) => (f.age += dt) < 1.4);
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    for (const f of this.floats) {
      const p = this.project(f.x, f.y, f.z + f.age * 70, W, H);
      if (!p) continue;
      ctx.globalAlpha = Math.max(0, 1 - f.age / 1.4);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(f.text, p.x, p.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }
}
