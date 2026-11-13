/**
 * 对战页（play）与录像页（replay）共用的 2D 叠加层绘制：头顶血条、地面圆圈、跳字、小地图。
 * 两边只负责把各自的数据（GameEngine 单位 / 录像场景模拟单位）整理成这里的结构，画法完全一致。
 */

/** 头顶血条颜色：己方 / 敌方 / 中立 */
export const TEAM_HP = ['#22c55e', '#ef4444', '#eab308'];
/** 小地图与名字颜色：WC3 10 个玩家颜色 */
export const PLAYER_COLORS = ['#0042ff', '#1ce6b9', '#540081', '#fffc01', '#fe8a0e', '#e55bb0', '#959697', '#7ebff1', '#106246', '#4e2a04'];
/** 头顶血条离地高度（世界单位） */
export const BAR_Z = { hero: 150, building: 300, unit: 105 } as const;

/** 世界坐标 → 叠加画布像素（CSS 像素） */
export type Project = (x: number, y: number, z: number) => { x: number; y: number } | null;

/** 把叠加画布尺寸对齐到显示尺寸（含 DPR）并清空，返回 CSS 像素宽高 */
export function prepareOverlay(c: HTMLCanvasElement, ctx: CanvasRenderingContext2D): { W: number; H: number } {
  const rect = c.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(1, Math.round(rect.width));
  const H = Math.max(1, Math.round(rect.height));
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  return { W, H };
}

/** 地面圆（世界半径 → 屏幕椭圆） */
export function drawGroundCircle(
  ctx: CanvasRenderingContext2D,
  project: Project,
  x: number,
  y: number,
  z: number,
  r: number,
  stroke: string,
  lw = 2,
  fill?: string
): void {
  ctx.beginPath();
  let started = false;
  for (let i = 0; i <= 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const p = project(x + Math.cos(a) * r, y + Math.sin(a) * r, z);
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
}

export interface UnitBar {
  /** 血条左上角所在的屏幕点（血条水平居中于 x） */
  x: number;
  y: number;
  kind: 'hero' | 'building' | 'unit';
  /** 0..1 */
  hp: number;
  color: string;
  /** 英雄专用：0..1 */
  mp?: number;
  /** 英雄专用：「玩家名 · 等级」 */
  label?: string;
  labelColor?: string;
  stunned?: boolean;
}

/** 头顶血条（英雄带魔法条与名字） */
export function drawUnitBar(ctx: CanvasRenderingContext2D, b: UnitBar): void {
  const w = b.kind === 'building' ? 64 : b.kind === 'hero' ? 62 : 36;
  const h = b.kind === 'hero' ? 7 : 5;
  const pct = Math.max(0, Math.min(1, b.hp));
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(b.x - w / 2 - 1, b.y - 1, w + 2, h + 2);
  ctx.fillStyle = b.color;
  ctx.fillRect(b.x - w / 2, b.y, w * pct, h);
  if (b.kind !== 'hero') return;
  const mp = Math.max(0, Math.min(1, b.mp ?? 0));
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(b.x - w / 2 - 1, b.y + h + 1, w + 2, 4);
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(b.x - w / 2, b.y + h + 1, w * mp, 3);
  if (b.label) {
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeText(b.label, b.x, b.y - 5);
    ctx.fillStyle = b.labelColor || '#fff';
    ctx.fillText(b.label, b.x, b.y - 5);
  }
  if (b.stunned) {
    ctx.fillStyle = '#fde047';
    ctx.fillText('眩晕', b.x, b.y - 20);
  }
}

/** 跳字（金钱 / 伤害） */
export function drawFloatText(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, alpha: number): void {
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.globalAlpha = 1;
}

/** 名字颜色：深紫玩家色在黑底上看不清，换成浅紫 */
export function readableColor(c: string): string {
  return c === '#540081' ? '#c084fc' : c;
}

// ============================================================ 小地图

export interface MinimapScene {
  /** 世界坐标 → 小地图像素 */
  toPx: (x: number, y: number) => { px: number; py: number };
  terrain?: HTMLImageElement | null;
  showTerrain: boolean;
  /** 非英雄单位：small=小兵/野怪小点，其余为带黑边的方块 */
  units: { x: number; y: number; color: string; kind: 'small' | 'tower' | 'rax' | 'ancient' }[];
  runes: { x: number; y: number }[];
  heroes: { x: number; y: number; fill: string; me: boolean }[];
  /** 镜头中心（世界坐标） */
  cam?: { x: number; y: number } | null;
  /** 信号：世界坐标 + 发出时刻（performance.now） */
  pings: { x: number; y: number; t: number }[];
  /** 战争迷雾：地形之后、单位之前绘制 */
  fog?: (ctx: CanvasRenderingContext2D) => void;
}

export function drawMinimap(ctx: CanvasRenderingContext2D, S: number, sc: MinimapScene): void {
  ctx.fillStyle = '#0a1210';
  ctx.fillRect(0, 0, S, S);
  if (sc.showTerrain && sc.terrain?.complete && sc.terrain.naturalWidth) ctx.drawImage(sc.terrain, 0, 0, S, S);
  sc.fog?.(ctx);
  for (const u of sc.units) {
    const { px, py } = sc.toPx(u.x, u.y);
    ctx.fillStyle = u.color;
    if (u.kind === 'small') ctx.fillRect(px - 1, py - 1, 2.5, 2.5);
    else {
      const r = u.kind === 'ancient' ? 5 : u.kind === 'tower' ? 3.5 : 3;
      ctx.fillRect(px - r, py - r, r * 2, r * 2);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.strokeRect(px - r, py - r, r * 2, r * 2);
    }
  }
  for (const r of sc.runes) {
    const { px, py } = sc.toPx(r.x, r.y);
    ctx.fillStyle = '#c084fc';
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const h of sc.heroes) {
    const { px, py } = sc.toPx(h.x, h.y);
    ctx.beginPath();
    ctx.arc(px, py, h.me ? 5 : 4, 0, Math.PI * 2);
    ctx.fillStyle = h.fill;
    ctx.fill();
    ctx.lineWidth = h.me ? 2 : 1;
    ctx.strokeStyle = h.me ? '#fff' : '#000';
    ctx.stroke();
  }
  // 镜头框
  if (sc.cam) {
    const { px, py } = sc.toPx(sc.cam.x, sc.cam.y);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(px - 18, py - 11, 36, 22);
  }
  // 信号：向外扩散的圆环
  const now = performance.now();
  for (const p of sc.pings) {
    if (now - p.t >= 3000) continue;
    const { px, py } = sc.toPx(p.x, p.y);
    const k = ((now - p.t) % 1000) / 1000;
    ctx.strokeStyle = `rgba(0,255,0,${1 - k})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, 4 + k * 16, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ============================================================ 昼夜
/**
 * 游戏内时刻（0~24）。war3map.j 开局触发器（IU2，"GameStart"）：
 *   SetFloatGameState(GAME_STATE_TIME_OF_DAY, 6.00) + SetTimeOfDayScale(0.625)，
 * 地图 war3mapMisc.txt DayLength=300 → 一整天 = 300 / 0.625 = 480 秒（白天 6~18 点 4 分钟，夜晚 4 分钟）。
 * @param secSinceHorn 号角（出兵）后的秒数；号角前时间暂停在 6:00
 */
export function timeOfDay(secSinceHorn: number): number {
  return (6 + (Math.max(0, secSinceHorn) / 480) * 24) % 24;
}

/** 时间指示器天空盘的 background-position-x（%） */
export function skyPosition(hours: number): number {
  return -50 + (((hours - 12 + 24) % 24) / 24) * 200;
}

/** 夜晚压暗的强度 0~1：18 点起半小时（游戏内）渐暗，6 点起半小时渐亮 */
export function nightAmount(hours: number): number {
  if (hours >= 18.5 || hours < 5.5) return 1;
  if (hours >= 18) return (hours - 18) / 0.5;
  if (hours < 6) return 1 - (hours - 5.5) / 0.5;
  return 0;
}
