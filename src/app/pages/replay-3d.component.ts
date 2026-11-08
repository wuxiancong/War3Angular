import {
  Component,
  ElementRef,
  PLATFORM_ID,
  afterNextRender,
  inject,
  signal,
  viewChild,
  OnDestroy,
} from '@angular/core';
import { isPlatformBrowser, NgClass } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Wc3MdxViewer, type Wc3SequenceInfo } from '../replay3d/wc3-mdx-viewer';
import {
  DOTA_MAP_BOUNDS,
  DEFAULT_DOTA_MAP_URL,
  loadDotaMapConfig,
  mapPixelToWorld,
  worldToMapPixel,
  type DotaBuilding,
} from '../replay3d/dota-map';
// --- AI 修改开始 [REPLAY-SYNC-UI]：引入 wuxiancong 录像时间轴引擎与数据结构 ---
import {
  ReplayTimelineEngine,
  formatMsClock,
  type ReplayEventLogItem,
  type ReplayInventorySlot,
  type ReplayMatchPayload,
  type ReplayMatchSummary,
} from '../replay3d/replay-timeline';
// --- AI 修改结束 [REPLAY-SYNC-UI]：引入 wuxiancong 录像时间轴引擎与数据结构 ---

// --- AI 删除开始 [HUD-LAYOUT]：删除旧版夜精灵错位百分比布局参数，原因：已按 1600x342 真实提取的人族控制台切图精确测量各区域坐标 ---
// const CF = {
//   mm: { l: 1.37, t: 22.12, w: 16.99, h: 72.35 },
//   port: { l: 27.54, t: 25.35, w: 8.11, h: 55.3 },
//   hp: { l: 27.54, t: 82.03, w: 8.11, h: 6.45 },
//   mp: { l: 27.54, t: 88.94, w: 8.11, h: 5.53 },
//   info: { l: 38.57, t: 25.35, w: 23.44, h: 66.82 },
//   inv: { l: 63.48, t: 22.12, w: 12.21, h: 72.35 },
//   cmd: { l: 76.66, t: 19.35, w: 21.97, h: 75.12 },
// };
// --- AI 删除结束 [HUD-LAYOUT] ---
// --- AI 修改开始 [HUD-LAYOUT]：基于 1600x342 console-assembled.png 像素孔位精确对齐的小地图、头像、血蓝条、信息栏、6格背包、12格技能槽百分比 ---
const CF = {
  mm: { l: 1.25, t: 13.45, w: 17.25, h: 81.87 },
  port: { l: 26.94, t: 33.63, w: 9.38, h: 52.63 },
  hp: { l: 26.94, t: 87.13, w: 9.38, h: 5.85 },
  mp: { l: 26.94, t: 93.57, w: 9.38, h: 5.26 },
  info: { l: 37.81, t: 32.75, w: 25.0, h: 65.5 },
  inv: { l: 64.25, t: 32.16, w: 9.38, h: 66.08 },
  cmd: { l: 77.0, t: 18.13, w: 21.38, h: 77.78 },
};
// --- AI 修改结束 [HUD-LAYOUT]：基于 1600x342 console-assembled.png 像素孔位精确对齐的小地图、头像、血蓝条、信息栏、6格背包、12格技能槽百分比 ---

export interface CommandCardSlot {
  id: string;
  hotkey: string;
  name: string;
  level: number;
  maxLevel?: number;
  icon: string;
  unlearned?: boolean;
  /** 当前基本指令激活（绿色外边框） */
  active?: boolean;
}

@Component({
  selector: 'app-replay-3d',
  standalone: true,
  imports: [RouterLink, NgClass],
  host: { class: 'flex flex-col flex-grow' },
  styles: [
    `
      /* --- AI 修改开始 [WC3-UI-AUTHENTIC]：使用魔兽争霸3原生人族铁护手手指鼠标指针与小地图准星指针 --- */
      .wc3-root {
        cursor: url('/assets/wc3/ui/cursor-human-pointer.png') 2 2, auto;
      }
      .wc3-root button,
      .wc3-root a,
      .wc3-root select,
      .wc3-root input[type='range'] {
        cursor: url('/assets/wc3/ui/cursor-human-active.png') 2 2, pointer;
      }
      /* --- AI 修改结束 [WC3-UI-AUTHENTIC]：使用魔兽争霸3原生人族铁护手手指鼠标指针与小地图准星指针 --- */
      .wc3-topbar {
        position: absolute;
        left: 0;
        right: 0;
        top: 0;
        height: 36px;
        z-index: 25;
        pointer-events: none;
      }
      .wc3-topbar-bg {
        position: absolute;
        left: 0;
        right: 0;
        top: 0;
        height: 68px;
        width: 100%;
        background: url('/assets/wc3/ui/topbar-assembled.png') top center / 100% 100% no-repeat;
        pointer-events: none;
        z-index: 0;
      }
      /* --- AI 修改开始 [WC3-TOP-MENU-TEXTURE]：采用魔兽争霸3原生 upper-btn-normal.png / highlight / pushed 贴图与严丝合缝对齐 --- */
      .wc3-top-menu-btn {
        pointer-events: auto;
        display: flex;
        align-items: center;
        justify-content: center;
        background: url('/assets/wc3/ui/upper-btn-normal.png') center / 100% 100% no-repeat;
        color: #fcd34d;
        font-size: clamp(9px, 0.76vw, 11px);
        font-weight: 900;
        letter-spacing: 0.02em;
        text-shadow: 0 1px 2px #000, 0 0 3px #000;
        border: 0;
        padding: 0 2px;
        transition: filter 0.1s;
      }
      .wc3-top-menu-btn:hover {
        background-image: url('/assets/wc3/ui/upper-btn-highlight.png');
        filter: brightness(1.15);
        color: #ffffff;
      }
      .wc3-top-menu-btn:active,
      .wc3-top-menu-btn.active {
        background-image: url('/assets/wc3/ui/upper-btn-pushed.png');
        color: #ffffff;
      }
      /* --- AI 修改结束 [WC3-TOP-MENU-TEXTURE]：采用魔兽争霸3原生 upper-btn-normal.png / highlight / pushed 贴图与严丝合缝对齐 --- */
      /* --- AI 修改开始 [COMBAT-GOLD-OVERLAY]：魔兽原生风格头顶血条与飘金跳字样式 --- */
      .wc3-overhead-hp {
        position: absolute;
        transform: translate(-50%, -100%);
        pointer-events: none;
        z-index: 25;
        background: rgba(0, 0, 0, 0.85);
        border: 1px solid #000000;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
      }
      .wc3-floating-gold {
        position: absolute;
        transform: translate(-50%, -100%);
        pointer-events: none;
        z-index: 30;
        font-family: monospace, sans-serif;
        font-weight: 900;
        font-size: 13px;
        text-shadow: 0 1px 2px #000, 0 0 4px #000;
        white-space: nowrap;
      }
      /* --- AI 修改结束 [COMBAT-GOLD-OVERLAY] --- */
      .wc3-res-box {
        position: absolute;
        top: 2px;
        height: 23px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 0.65%;
        font-size: clamp(10px, 0.85vw, 13px);
        font-weight: 900;
        color: #f8e8b8;
        text-shadow: 0 1px 2px #000, 0 0 3px #000;
        z-index: 15;
        pointer-events: auto;
      }
      /* --- AI 修改开始 [WC3-CONSOLE-OVERLAP]：将底部控制台绝对定位于 3D 视口底部，使透明镂空上沿透出 3D 画面，彻底消除上方黑条 --- */
      .wc3-console {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        /* --- AI 修改开始 [CONSOLE-HEIGHT]：限制控制台高度，避免 16:9 下占屏过高遮挡 3D --- */
        aspect-ratio: 1600 / 342;
        max-height: 26vh;
        height: min(26vh, calc(100vw * 342 / 1600));
        background: url('/assets/wc3/ui/console-assembled.png') center / 100% 100% no-repeat;
        /* --- AI 修改结束 [CONSOLE-HEIGHT] --- */
        z-index: 20;
        pointer-events: none;
      }
      .wc3-console-hit {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 84%;
        pointer-events: auto;
      }
      /* --- AI 修改结束 [WC3-CONSOLE-OVERLAP]：将底部控制台绝对定位于 3D 视口底部，使透明镂空上沿透出 3D 画面，彻底消除上方黑条 --- */
      .wc3-abs {
        position: absolute;
        box-sizing: border-box;
        pointer-events: auto;
      }
      .wc3-mm {
        cursor: url('/assets/wc3/ui/cursor-human-crosshair.png') 16 16, crosshair !important;
        overflow: hidden;
        border: 0;
        padding: 0;
        background: #050805;
      }
      .wc3-mm img.mm-base {
        width: 100%;
        height: 100%;
        object-fit: fill;
        pointer-events: none;
        display: block;
      }
      .wc3-mm-sidebtn {
        position: absolute;
        left: 19.48%;
        width: 2.58%;
        height: 11.4%;
        padding: 0;
        border: 1px solid rgba(212, 175, 85, 0.45);
        border-radius: 2px;
        background: #14100c;
        overflow: hidden;
        pointer-events: auto;
        box-shadow: inset 0 0 3px rgba(0, 0, 0, 0.9);
        transition: filter 0.12s, transform 0.08s;
      }
      .wc3-mm-sidebtn:hover {
        filter: brightness(1.25);
        border-color: rgba(255, 215, 110, 0.9);
      }
      .wc3-mm-sidebtn:active,
      .wc3-mm-sidebtn.active-btn {
        transform: scale(0.95);
        box-shadow: inset 0 0 0 1.5px #fbbf24, 0 0 6px rgba(251, 191, 36, 0.65);
      }
      .wc3-mm-sidebtn img {
        width: 100%;
        height: 100%;
        object-fit: fill;
        display: block;
        pointer-events: none;
      }
      .wc3-port {
        overflow: hidden;
        border-radius: 42% 42% 0 0 / 28% 28% 0 0;
        background: radial-gradient(circle at 35% 25%, #3a2e1c, #0d0906 74%);
      }
      /* --- AI 修改开始 [WC3-BAR-TEXTURES]：使用从 war3.mpq 提取的真实人族生命条/魔法条/经验条贴图渲染 --- */
      .wc3-bar {
        position: relative;
        overflow: hidden;
        border: 1px solid rgba(20, 15, 8, 0.95);
        background: #070605 url('/assets/wc3/ui/bar-border.png') center / 100% 100% no-repeat;
        box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.95);
      }
      .wc3-bar > i {
        position: absolute;
        inset: 1px auto 1px 1px;
        display: block;
        transition: width 0.12s linear;
      }
      .wc3-bar::after {
        content: '';
        position: absolute;
        inset: 0;
        background: url('/assets/wc3/ui/bar-stat-highlight.png') center / 100% 100% no-repeat;
        opacity: 0.55;
        pointer-events: none;
      }
      .wc3-bar > span {
        position: absolute;
        inset: 0;
        z-index: 2;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: clamp(8px, 0.72vw, 11px);
        font-weight: 900;
        color: #ffffff;
        text-shadow: 0 1px 2px #000, 0 0 4px #000, 1px 0 1px #000;
        line-height: 1;
        letter-spacing: 0.02em;
      }
      .wc3-hp > i {
        background: url('/assets/wc3/ui/bar-hp-fill.png') left center / 100% 100% repeat-x;
        filter: saturate(1.3) brightness(1.05);
      }
      .wc3-mp > i {
        background: url('/assets/wc3/ui/bar-mp-fill.png') left center / 100% 100% repeat-x;
        filter: saturate(1.35) brightness(1.1);
      }
      /* --- AI 修改开始 [XP-BAR-NATIVE]：使用 war3.mpq UI/Feedback/XpBar 原生贴图；灰阶 fill 乘紫色（人族经验条），去掉错误的 hue-rotate 变蓝 --- */
      .wc3-xp-bar {
        position: relative;
        width: 100%;
        height: 10px;
        margin-top: 4px;
        background: #050403;
        overflow: hidden;
        border-radius: 0;
        box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.85);
      }
      .wc3-xp-bar > i {
        position: absolute;
        inset: 2px auto 2px 2px;
        background-color: #9b4dff;
        background-image: url('/assets/wc3/ui/bar-xp-fill.png');
        background-position: left center;
        background-size: 100% 100%;
        background-repeat: repeat-x;
        background-blend-mode: multiply;
        filter: none;
      }
      .wc3-xp-bar::after {
        content: '';
        position: absolute;
        inset: 0;
        background: url('/assets/wc3/ui/bar-xp-border.png') center / 100% 100% no-repeat;
        pointer-events: none;
        z-index: 1;
      }
      .wc3-xp-bar > span {
        position: absolute;
        inset: 0;
        z-index: 2;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 9px;
        font-weight: 800;
        color: #f5e6c4;
        text-shadow: 0 1px 2px #000, 0 0 3px #000;
        pointer-events: none;
      }
      /* --- AI 修改结束 [XP-BAR-NATIVE] --- */
      /* --- AI 修改结束 [WC3-BAR-TEXTURES]：使用从 war3.mpq 提取的真实人族生命条/魔法条/经验条贴图渲染 --- */
      .wc3-info {
        color: #e8d5a3;
        font-size: clamp(10px, 0.95vw, 13px);
        text-shadow: 0 1px 2px #000;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 4px 10px;
        pointer-events: none;
      }
      .wc3-info .name {
        font-weight: 900;
        color: #f8e8b0;
        font-size: 1.15em;
        text-align: center;
      }
      .wc3-info .sub {
        color: #c8a868;
        font-size: 0.86em;
        text-align: center;
      }
      .wc3-grid {
        display: grid;
        width: 100%;
        height: 100%;
      }
      /* --- AI 修改开始 [ICON-FIT-COLOR]：缩小槽间距，使 64x64 图标在容器内完整显示不被裁切 --- */
      .wc3-grid-inv {
        grid-template-columns: 1fr 1fr;
        grid-template-rows: 1fr 1fr 1fr;
        gap: 2.5% 3%;
        padding: 1.2%;
      }
      .wc3-grid-cmd {
        grid-template-columns: 1fr 1fr 1fr 1fr;
        grid-template-rows: 1fr 1fr 1fr;
        gap: 2% 1.8%;
        padding: 1%;
      }
      /* --- AI 修改结束 [ICON-FIT-COLOR] --- */
      /* --- AI 修改开始 [ICON-SLOT]：清掉 button 默认 padding；图标绝对铺满槽位（与 WC3 CommandButton 一致），不用 contain 留边 --- */
      .wc3-slot {
        position: relative;
        border: 0;
        margin: 0;
        padding: 0;
        background: transparent;
        overflow: hidden;
        min-width: 0;
        min-height: 0;
        box-sizing: border-box;
        appearance: none;
        -webkit-appearance: none;
        font: inherit;
        color: inherit;
        cursor: default;
      }
      button.wc3-slot {
        cursor: pointer;
      }
      .wc3-slot.has-item,
      .wc3-slot.has-cmd {
        background: #000;
        box-shadow: none;
      }
      .wc3-slot.unlearned .ico {
        filter: grayscale(0.9) brightness(0.42);
      }
      .wc3-slot.active-toggle {
        box-shadow: inset 0 0 0 2px #ff6b2b, 0 0 8px rgba(255, 107, 43, 0.75);
      }
      /* --- AI 修改开始 [CMD-ACTIVE-GREEN]：移动/停止/保持原位/攻击/巡逻等当前指令绿色外边框 --- */
      .wc3-slot.active-cmd {
        outline: 2px solid #22c55e;
        outline-offset: -2px;
        box-shadow: inset 0 0 0 2px #22c55e, 0 0 10px rgba(34, 197, 94, 0.85);
      }
      .wc3-slot.active-cmd.active-toggle {
        outline: 2px solid #22c55e;
        outline-offset: -2px;
        box-shadow: inset 0 0 0 2px #22c55e, 0 0 10px rgba(34, 197, 94, 0.85);
      }
      /* --- AI 修改结束 [CMD-ACTIVE-GREEN] --- */
      .wc3-slot .hk {
        position: absolute;
        right: 1px;
        top: 0;
        font-size: clamp(7px, 0.62vw, 10px);
        font-weight: 900;
        color: #ffe08a;
        text-shadow: 0 1px 2px #000, 0 0 3px #000;
        background: rgba(0, 0, 0, 0.55);
        padding: 0 2px;
        border-radius: 2px;
        z-index: 2;
        line-height: 1.1;
        pointer-events: none;
      }
      .wc3-slot .lv {
        position: absolute;
        left: 1px;
        bottom: 0;
        font-size: clamp(7px, 0.62vw, 10px);
        font-weight: 900;
        color: #b8ff7a;
        text-shadow: 0 1px 2px #000, 0 0 3px #000;
        background: rgba(0, 0, 0, 0.65);
        padding: 0 3px;
        border-radius: 2px;
        z-index: 2;
        line-height: 1.1;
        pointer-events: none;
      }
      .wc3-slot .ico {
        /* WC3 64x64 内容常略偏右上：略放大并向左下偏移，让主体在槽内更居中 */
        position: absolute;
        left: -5%;
        top: -3%;
        width: 110%;
        height: 110%;
        object-fit: fill;
        image-rendering: pixelated;
        pointer-events: none;
        display: block;
        filter: none;
      }
      /* --- AI 修改结束 [ICON-SLOT] --- */
      .wc3-cam {
        position: absolute;
        width: 14%;
        height: 11%;
        transform: translate(-50%, -50%);
        border: 1.5px solid #ffffff;
        background: rgba(255, 255, 255, 0.08);
        pointer-events: none;
      }
      .wc3-hero-dot {
        position: absolute;
        width: 9px;
        height: 9px;
        transform: translate(-50%, -50%);
        border-radius: 9999px;
        background: #ffe14a;
        border: 1.5px solid #ffffff;
        box-shadow: 0 0 6px #ffe14a;
        pointer-events: none;
        z-index: 5;
      }
    `,
  ],
  template: `
    <main class="wc3-root flex-grow flex flex-col bg-black text-[var(--text-main)] min-h-[calc(100vh-64px)] select-none">
      <!-- 顶部录像播放与对局切换控制栏 -->
      <div class="flex flex-wrap items-center gap-2 px-3 py-1.5 border-b border-white/10 bg-[#080c12] text-[11px] shrink-0 z-30">
        <a routerLink="/matches" class="opacity-70 hover:opacity-100 hover:text-accent flex items-center gap-1">
          <span class="material-icons text-sm">arrow_back</span>返回
        </a>
        <span class="text-accent font-black italic uppercase tracking-tight">DotA 6.83d 3D 录像回放</span>

        <!-- wuxiancong 录像选择器 -->
        <select
          class="bg-[#111824] border border-white/20 rounded px-2 py-0.5 text-[11px] text-amber-200 max-w-[260px]"
          [value]="selectedFile()"
          (change)="onSelectMatchFile($any($event.target).value)"
          title="切换 wuxiancong 录像文件"
        >
          @for (m of matchList(); track m.fileName) {
            <option [value]="m.fileName">
              {{ m.heroName }} · {{ m.matchId }} ({{ formatDuration(m.durationMs) }} / {{ m.moveActions }}步)
            </option>
          }
        </select>

        <!-- 播放/暂停与进度条 -->
        <button
          type="button"
          (click)="togglePlay()"
          class="px-2.5 py-0.5 rounded font-bold border border-amber-400/60 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30"
        >
          {{ isPlaying() ? '⏸ 暂停' : '▶ 播放' }}
        </button>

        <div class="flex items-center gap-1.5 flex-1 min-w-[180px] max-w-[420px]">
          <span class="font-mono text-[10px] text-amber-300 w-10 text-right">{{ currentTimeText() }}</span>
          <input
            type="range"
            min="0"
            [max]="durationMs()"
            [value]="currentMs()"
            (input)="onScrub(+$any($event.target).value)"
            class="flex-1 accent-amber-400 cursor-pointer h-1.5"
          />
          <span class="font-mono text-[10px] text-white/60 w-10">{{ totalTimeText() }}</span>
        </div>

        <!-- 倍速切换 -->
        <div class="flex items-center gap-0.5">
          @for (spd of [1, 2, 4, 8]; track spd) {
            <button
              type="button"
              (click)="playSpeed.set(spd)"
              class="px-1.5 py-0.5 rounded border text-[10px] font-mono"
              [ngClass]="playSpeed() === spd ? 'border-amber-400 bg-amber-400/20 text-amber-200 font-bold' : 'border-white/15 text-white/60'"
            >
              {{ spd }}x
            </button>
          }
        </div>

        <div class="flex-1"></div>

        <!-- 镜头与模拟开关 -->
        <!-- --- AI 修改开始 [SCENE-SIM-DOTA]：增加商店、河道神符、神秘商店与肉山快捷镜头定位按钮 --- -->
        <div class="flex items-center gap-1 border-l border-white/15 pl-2">
          <button type="button" (click)="jumpToPoint(-6950, -6750)" class="px-1.5 py-0.5 border border-amber-400/40 text-amber-200 rounded hover:bg-amber-400/15" title="跳转近卫基地商店广场">近卫商店</button>
          <button type="button" (click)="jumpToPoint(-4544, 1152)" class="px-1.5 py-0.5 border border-amber-400/40 text-amber-200 rounded hover:bg-amber-400/15" title="跳转近卫神秘商店">神秘商店</button>
          <button type="button" (click)="jumpToPoint(-2352, 1648)" class="px-1.5 py-0.5 border border-cyan-400/40 text-cyan-200 rounded hover:bg-cyan-400/15" title="跳转上河道神符点 (-2352, 1648)">上河神符</button>
          <button type="button" (click)="jumpToPoint(3008, -2832)" class="px-1.5 py-0.5 border border-cyan-400/40 text-cyan-200 rounded hover:bg-cyan-400/15" title="跳转下河道神符点 (3008, -2832)">下河神符</button>
          <button type="button" (click)="jumpToPoint(4176, -2288)" class="px-1.5 py-0.5 border border-rose-400/40 text-rose-200 rounded hover:bg-rose-400/15" title="跳转肉山巢穴 (4176, -2288)">肉山</button>
        </div>
        <!-- --- AI 修改结束 [SCENE-SIM-DOTA]：增加商店、河道神符、神秘商店与肉山快捷镜头定位按钮 --- -->
        <button type="button" (click)="setCameraMode('hero')" class="px-2 py-0.5 border rounded"
                [ngClass]="cameraMode() === 'hero' ? 'border-accent text-accent font-bold' : 'border-white/20'">跟随英雄</button>
        <button type="button" (click)="setCameraMode('free')" class="px-2 py-0.5 border rounded"
                [ngClass]="cameraMode() === 'free' ? 'border-accent text-accent font-bold' : 'border-white/20'">自由镜头</button>
        <button type="button" (click)="setCameraMode('map')" class="px-2 py-0.5 border rounded"
                [ngClass]="cameraMode() === 'map' ? 'border-accent text-accent font-bold' : 'border-white/20'">全图俯视</button>
        <button type="button" (click)="toggleSim()" class="px-2 py-0.5 border rounded"
                [ngClass]="simOn() ? 'border-emerald-400 text-emerald-300' : 'border-white/20'">
          {{ simOn() ? '兵线野怪ON' : '兵线野怪OFF' }}
        </button>
        <!-- --- AI 修改开始 [COMBAT-GOLD-AND-PA]：血条开关（默认开启）与英雄 3D 模型切换器（支持幻影刺客茉崔蒂） --- -->
        <button
          type="button"
          (click)="toggleHealthBars()"
          class="px-2 py-0.5 border rounded"
          [ngClass]="showHealthBars() ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300 font-bold' : 'border-white/20 text-white/50'"
          title="开关 3D 战场头顶生命值血条 (默认开启)"
        >
          血条: {{ showHealthBars() ? '开' : '关' }}
        </button>

        <select
          class="bg-[#111824] border border-amber-400/40 rounded px-2 py-0.5 text-[11px] text-amber-300"
          [value]="currentHeroKey()"
          (change)="onSelectHeroPreset($any($event.target).value)"
          title="切换英雄 3D 体验模型"
        >
          <option value="pa">幻影刺客 · 茉崔蒂 (PA)</option>
          <option value="blademaster">剑圣 · 尤涅若 (Juggernaut)</option>
          <option value="antimage">敌法师 · 玛吉纳 (AM)</option>
          <option value="sniper">火枪手 · 卡德尔 (Sniper)</option>
          <option value="tauren">牛头人酋长 (TC)</option>
          <option value="paladin">全能骑士 (Omni)</option>
          <option value="lich">巫妖 · 诺瓦 (Lich)</option>
        </select>
        <!-- --- AI 修改结束 [COMBAT-GOLD-AND-PA] --- -->
        <button type="button" (click)="showDebug.set(!showDebug())" class="px-2 py-0.5 border border-white/20 rounded">
          {{ showDebug() ? '隐藏事件流' : '事件流/调试' }}
        </button>
      </div>

      <div class="flex flex-col lg:flex-row flex-grow min-h-0">
        <div class="relative flex-grow min-h-[580px] lg:min-h-0 bg-[#05080c] overflow-hidden">
          <!-- --- AI 修改开始 [WC3-TOPBAR-AUTHENTIC]：还原魔兽争霸3左上四联菜单按钮（地图信息F9/菜单F10/盟友F11/聊天F12）、中央时间分秒及右侧四格资源框 --- -->
          <div class="wc3-topbar">
            <div class="wc3-topbar-bg"></div>

            <!-- 左上角 4 个原生魔兽菜单槽（精确对齐 UpperButtonBar.fdf 孔位与原生贴图，严丝合缝） -->
            <button type="button" class="wc3-abs wc3-top-menu-btn"
                    [class.active]="activeTopMenu() === 'quests'"
                    style="left:0.25%; width:10.625%; top:2px; height:24px; z-index:15"
                    (click)="toggleTopMenu('quests')"
                    title="查看地图信息与机制说明 (F9)">
              地图信息 (<span class="text-white underline">F9</span>)
            </button>
            <button type="button" class="wc3-abs wc3-top-menu-btn"
                    [class.active]="activeTopMenu() === 'menu'"
                    style="left:10.875%; width:10.625%; top:2px; height:24px; z-index:15"
                    (click)="toggleTopMenu('menu')"
                    title="打开游戏菜单 (F10)">
              菜单 (<span class="text-white underline">F10</span>)
            </button>
            <button type="button" class="wc3-abs wc3-top-menu-btn"
                    [class.active]="activeTopMenu() === 'allies'"
                    style="left:21.5%; width:10.625%; top:2px; height:24px; z-index:15"
                    (click)="toggleTopMenu('allies')"
                    title="查看盟友与对局阵容 (F11)">
              盟友 (<span class="text-white underline">F11</span>)
            </button>
            <button type="button" class="wc3-abs wc3-top-menu-btn"
                    [class.active]="activeTopMenu() === 'chat'"
                    style="left:32.125%; width:10.625%; top:2px; height:24px; z-index:15"
                    (click)="toggleTopMenu('chat')"
                    title="查看对局聊天与事件记录 (F12)">
              聊天 (<span class="text-white underline">F12</span>)
            </button>

            <!-- 顶部中央日夜球时钟读数（分 : 秒 精确居中） -->
            <div class="wc3-abs flex flex-col items-center justify-end z-20 pointer-events-none"
                 style="left:46%; width:8%; top:2px; height:58px">
              <div class="font-mono text-[11px] font-black text-[#fff3c4] drop-shadow-[0_1px_2px_rgba(0,0,0,0.98)] bg-black/75 border border-amber-500/40 px-1.5 py-0.2 rounded flex items-center gap-0.5"
                   title="游戏时间（分:秒）">
                <span>{{ clockMinText() }}</span>
                <span class="text-amber-400">:</span>
                <span>{{ clockSecText() }}</span>
              </div>
            </div>

            <!-- 右侧 4 个原生魔兽资源槽（精确对齐 ResourceBar.fdf 4个凹槽：金币 / 木材 / 人口等级 / 地图版本） -->
            <div class="wc3-res-box" style="left:57.75%; width:9.1%" title="当前金钱">
              <img class="w-4 h-4 shrink-0" src="/assets/wc3/ui/icons/gold.png" alt="金币" />
              <span class="font-mono text-[#ffd74a] pr-1">{{ gold() }}</span>
            </div>
            <div class="wc3-res-box" style="left:68.55%; width:9.1%" title="当前木材">
              <img class="w-4 h-4 shrink-0" src="/assets/wc3/ui/icons/lumber.png" alt="木材" />
              <span class="font-mono text-[#6ee7b7] pr-1">{{ lumber() }}</span>
            </div>
            <div class="wc3-res-box" style="left:79.35%; width:9.1%" title="当前英雄等级 / 等级上限">
              <img class="w-4 h-4 shrink-0" src="/assets/wc3/ui/icons/supply.png" alt="人口" />
              <span class="font-mono text-[#fde68a] pr-1">{{ heroLevel() }} / 25</span>
            </div>
            <div class="wc3-res-box justify-center" style="left:90.15%; width:9.3%" title="DotA 地图版本与维修费状态">
              <span class="font-mono text-[#5eff5e] tracking-tight">v6.83d</span>
            </div>
          </div>
          <!-- --- AI 修改结束 [WC3-TOPBAR-AUTHENTIC]：还原魔兽争霸3左上四联菜单按钮（地图信息F9/菜单F10/盟友F11/聊天F12）、中央时间分秒及右侧四格资源框 --- -->

          <!-- 3D WebGL 全屏视口（底部控制台与顶部栏直接叠在视口上，消除控制台上方黑条） -->
          <div class="absolute inset-0">
            <canvas #glCanvas width="1280" height="720"
                    class="absolute inset-0 w-full h-full block z-0 pointer-events-none"></canvas>
            <div #viewLayer
                 class="absolute inset-0 z-[1] pointer-events-auto bg-transparent"></div>

            <!-- --- AI 修改开始 [COMBAT-GOLD-OVERLAY]：3D 战场实时头顶血条（血条开关默认开启）与击杀/拾取飘金动画 --- -->
            @if (showHealthBars()) {
              @for (bar of overheadHpBars(); track bar.id) {
                <div
                  class="wc3-overhead-hp"
                  [style.left.%]="bar.sx"
                  [style.top.%]="bar.sy"
                  [style.width.px]="bar.isTower ? 54 : bar.isHero ? 48 : 34"
                  [style.height.px]="bar.isTower ? 7 : bar.isHero ? 6 : 4"
                >
                  <div
                    class="h-full transition-all duration-75"
                    [style.width.%]="bar.hpPct"
                    [style.background]="bar.color"
                  ></div>
                </div>
              }
            }

            @for (ft of activeFloatingTexts(); track ft.id) {
              <div
                class="wc3-floating-gold"
                [style.left.%]="ft.sx"
                [style.top.%]="ft.sy"
                [style.color]="ft.color"
                [style.opacity]="ft.opacity"
              >
                {{ ft.text }}
              </div>
            }
            <!-- --- AI 修改结束 [COMBAT-GOLD-OVERLAY] --- -->

            <!-- 左上角实时动作指令浮动提示 -->
            <div class="absolute top-11 left-3 z-10 pointer-events-none space-y-1">
              <div class="px-2.5 py-1 rounded bg-black/70 border border-amber-400/35 text-[11px] text-amber-100 font-mono flex items-center gap-2">
                <span class="inline-block w-2 h-2 rounded-full" [ngClass]="isMoving() ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'"></span>
                <span>坐标 ({{ heroPos().x }}, {{ heroPos().y }})</span>
                <span class="text-amber-300">· {{ activeSequenceName() || 'Stand' }}</span>
                <span class="text-emerald-300 font-bold">· 指令 {{ basicCommandLabel() }}</span>
              </div>
              @for (ev of recentEvents().slice(-3); track ev.timeMs + ev.text) {
                <div class="px-2 py-0.5 rounded bg-black/65 text-[10px] text-white/90 border-l-2 border-amber-400">
                  <span class="font-mono text-amber-300 mr-1">[{{ ev.timeText }}]</span>{{ ev.text }}
                </div>
              }
            </div>

            <!-- 右上角经典 DotA 6.83d 计分板（Multiboard） -->
            <div class="absolute top-9 right-2.5 z-10 pointer-events-none bg-black/72 border border-[#a88948]/65 rounded px-2.5 py-1.5 text-[11px] text-[#f0e0b0] shadow-lg min-w-[235px]">
              <div class="flex items-center justify-between border-b border-[#a88948]/35 pb-0.5 mb-1">
                <span class="text-[#7ee787] font-black tracking-wide">DotA Allstars v6.83d</span>
                <span class="font-mono text-amber-300">{{ clockMinText() }}:{{ clockSecText() }}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-sky-300 font-bold flex items-center gap-1">
                  <img [src]="heroIcon()" alt="" class="w-4 h-4 rounded-sm border border-amber-400/60" />
                  {{ player() || 'wuxiancong' }} ({{ heroNameCn() }})
                </span>
                <span class="font-mono">
                  <b class="text-emerald-300">{{ kills() }}</b>/<b class="text-rose-400">{{ deaths() }}</b>/<b class="text-sky-300">{{ assists() }}</b>
                </span>
              </div>
              <div class="flex items-center justify-between text-[10px] text-amber-100/85 font-mono mt-0.5">
                <span>正补/反补: <b class="text-amber-300">{{ lastHits() }}</b>/{{ denies() }}</span>
                <span>野怪: <b class="text-amber-300">{{ neutrals() }}</b></span>
                <span>位置: ({{ heroPos().x }},{{ heroPos().y }})</span>
              </div>
            </div>

            <!-- 顶部四联菜单弹窗（地图信息 F9 / 菜单 F10 / 盟友 F11 / 聊天 F12） -->
            @if (activeTopMenu()) {
              <div class="absolute top-12 left-1/2 -translate-x-1/2 z-30 w-[92%] max-w-lg bg-[#120e09]/95 border-2 border-[#d4af37] rounded shadow-[0_0_28px_rgba(0,0,0,0.95)] p-4 text-[#f5e6c4]">
                <div class="flex items-center justify-between border-b border-[#d4af37]/40 pb-2 mb-3">
                  <h3 class="text-sm font-black text-[#fcd34d] tracking-wider">
                    @switch (activeTopMenu()) {
                      @case ('quests') { 📜 地图信息与任务说明 (F9) }
                      @case ('menu') { ⚙️ 魔兽争霸 III 游戏菜单 (F10) }
                      @case ('allies') { 🛡️ 盟友与对局阵容 (F11) }
                      @case ('chat') { 💬 对局聊天与事件日志 (F12) }
                    }
                  </h3>
                  <button type="button" (click)="activeTopMenu.set(null)"
                          class="px-2 py-0.5 text-xs font-bold bg-[#2a1f12] border border-[#d4af37]/70 rounded text-amber-200 hover:bg-[#3b2c1a]">
                    关闭 ✕
                  </button>
                </div>

                @if (activeTopMenu() === 'quests') {
                  <div class="space-y-2 text-xs leading-relaxed">
                    <div class="p-2 rounded bg-black/50 border border-amber-500/30">
                      <div class="font-bold text-amber-300">DotA Allstars v6.83d (地形与物件原版还原)</div>
                      <p class="text-amber-100/85 mt-0.5">近卫军团（左下翠绿森林）迎战天灾军团（右上荒芜之地），摧毁敌方遗迹（世界之树 / 冰封王座）即可获胜。</p>
                    </div>
                    <ul class="list-disc list-inside space-y-1 text-[11px] text-amber-100/90">
                      <li><b>自动出兵</b>：每 30 秒三路兵营刷出近战/远程小兵（每第 7 波附带攻城车），沿各路推进并与敌军和防御塔交战。</li>
                      <li><b>防御塔防线</b>：各路防御塔主动攻击 700 码内敌方小兵与英雄，小兵遇塔停步攻塔并自动绕行防穿模。</li>
                      <li><b>野怪与神符</b>：12 处野怪营地每整分钟判空刷新；上下河道神符点每 2 分钟刷新赏金/强化神符。</li>
                    </ul>
                  </div>
                }

                @if (activeTopMenu() === 'menu') {
                  <div class="grid grid-cols-2 gap-2 text-xs">
                    <button type="button" (click)="togglePlay(); activeTopMenu.set(null)"
                            class="py-2 px-3 rounded bg-[#241a0e] border border-[#d4af37]/60 text-amber-200 font-bold hover:bg-[#352615]">
                      {{ isPlaying() ? '⏸ 暂停录像播放' : '▶ 继续录像播放' }}
                    </button>
                    <button type="button" (click)="resetCamera(); activeTopMenu.set(null)"
                            class="py-2 px-3 rounded bg-[#241a0e] border border-[#d4af37]/60 text-amber-200 font-bold hover:bg-[#352615]">
                      🎥 复位魔兽标准视角
                    </button>
                    <button type="button" (click)="toggleSim()"
                            class="py-2 px-3 rounded bg-[#241a0e] border border-[#d4af37]/60 text-amber-200 font-bold hover:bg-[#352615]">
                      {{ simOn() ? '✅ 兵线/野怪/神符模拟：开启' : '⭕ 兵线/野怪/神符模拟：关闭' }}
                    </button>
                    <button type="button" (click)="reload(); activeTopMenu.set(null)"
                            class="py-2 px-3 rounded bg-[#241a0e] border border-[#d4af37]/60 text-amber-200 font-bold hover:bg-[#352615]">
                      🔄 重新加载 3D 场景
                    </button>
                  </div>
                }

                @if (activeTopMenu() === 'allies') {
                  <div class="space-y-2 text-xs">
                    <div class="text-emerald-300 font-bold">🌿 近卫军团 (Sentinel)</div>
                    <div class="flex items-center justify-between p-2 rounded bg-black/55 border border-emerald-500/40">
                      <div class="flex items-center gap-2">
                        <img [src]="heroIcon()" alt="" class="w-7 h-7 rounded border border-amber-400" />
                        <div>
                          <div class="font-bold text-sky-300">{{ player() || 'wuxiancong' }} · {{ heroNameCn() }} (Lv.{{ heroLevel() }})</div>
                          <div class="text-[10px] text-amber-200/80">{{ heroTitle() }} · 坐标 ({{ heroPos().x }}, {{ heroPos().y }})</div>
                        </div>
                      </div>
                      <div class="text-right font-mono">
                        <div class="text-amber-300">金钱 {{ gold() }}</div>
                        <div class="text-[10px]">KDA {{ kills() }}/{{ deaths() }}/{{ assists() }} · CS {{ lastHits() }}/{{ denies() }}</div>
                      </div>
                    </div>
                    <div class="flex items-center justify-between text-[11px] text-amber-200/85 pt-1">
                      <span>共享视野：已开启</span>
                      <span>小地图盟友颜色模式：{{ mmAllyColorMode() ? '阵营双色(绿/红)' : '玩家原色(蓝/青/紫)' }}</span>
                    </div>
                  </div>
                }

                @if (activeTopMenu() === 'chat') {
                  <div class="space-y-1.5 max-h-60 overflow-y-auto pr-1 text-xs font-mono">
                    @for (ev of recentEvents(); track ev.timeMs + ev.text) {
                      <div class="px-2 py-1 rounded bg-black/55 border-l-2 border-amber-400">
                        <span class="text-amber-300 mr-1.5">[{{ ev.timeText }}]</span>
                        <span class="text-sky-300 mr-1">{{ player() }}:</span>
                        <span class="text-amber-100">{{ ev.text }}</span>
                      </div>
                    } @empty {
                      <div class="text-amber-200/60 py-4 text-center">暂无动作聊天记录</div>
                    }
                  </div>
                }
              </div>
            }

            @if (loading()) {
              <div class="absolute top-12 right-3 z-10 pointer-events-none">
                <div class="flex items-center gap-2 px-3 py-1.5 rounded bg-black/75 border border-white/15 text-accent font-bold uppercase tracking-widest text-[11px]">
                  <span class="material-icons animate-spin text-sm">autorenew</span>
                  加载 3D 地形与录像中…
                </div>
              </div>
            }
            @if (error()) {
              <div class="absolute inset-0 flex items-center justify-center bg-black/70 z-10 p-6">
                <div class="max-w-md text-center space-y-3">
                  <p class="text-red-400 font-bold">{{ error() }}</p>
                  <button type="button" (click)="reload()"
                          class="px-4 py-2 bg-accent text-black font-black uppercase text-xs rounded">重试</button>
                </div>
              </div>
            }

            <!-- 魔兽争霸3 底部控制台 HUD (1600x342，直接叠在 3D 视口底部，消除黑边) -->
            <div class="wc3-console">
              <div class="wc3-console-hit"></div>
              <!-- 1. 小地图（含原版野怪营地、商店、河道神符、兵线方块点、英雄图标、信号波纹与镜头视野框） -->
              <button type="button" class="wc3-abs wc3-mm" title="左键点击跳转镜头 / 点击右侧发信号按钮发送小地图信号"
                      [style.left.%]="cf.mm.l" [style.top.%]="cf.mm.t"
                      [style.width.%]="cf.mm.w" [style.height.%]="cf.mm.h"
                      (click)="onMinimapClick($event)">
                <img class="mm-base"
                     src="/assets/dota/dota683_minimap.png"
                     alt="minimap"
                     [style.opacity]="mmShowTerrain() ? 1 : 0.12"
                     draggable="false" />

                <!-- 原版野怪营地小地图图标（绿=小野 / 橙=中大野 / 红=远古与肉山，可通过右侧第4个按钮开关） -->
                @if (mmShowCamps()) {
                  @for (c of minimapCamps; track c.id) {
                    <img
                      src="/assets/wc3/ui/mm-icon-camp.png"
                      alt=""
                      style="position:absolute;width:11px;height:11px;transform:translate(-50%,-50%);pointer-events:none;z-index:2"
                      [style.left.%]="c.px"
                      [style.top.%]="c.py"
                      [style.filter]="c.filter"
                      [title]="c.name"
                    />
                  }
                }

                <!-- 防御塔/兵营/遗迹/商店标记（商店使用原版 mm-icon-shop.png，防御塔与兵营使用魔兽原生锐利小方块） -->
                @for (b of minimapBuildings(); track b.id) {
                  @if (b.isShop) {
                    <img
                      src="/assets/wc3/ui/mm-icon-shop.png"
                      alt=""
                      style="position:absolute;width:10px;height:10px;transform:translate(-50%,-50%);pointer-events:none;z-index:3"
                      [style.left.%]="b.px"
                      [style.top.%]="b.py"
                    />
                  } @else {
                    <span
                      style="position:absolute;transform:translate(-50%,-50%);border:0.5px solid rgba(0,0,0,0.85);pointer-events:none;z-index:2"
                      [style.left.%]="b.px"
                      [style.top.%]="b.py"
                      [style.width.px]="b.size"
                      [style.height.px]="b.size"
                      [style.background]="mmAllyColorMode() ? b.color : (b.color === '#10b981' ? '#38bdf8' : '#a855f7')"
                    ></span>
                  }
                }

                <!-- 实时兵线小兵与存活野怪点（还原魔兽3原生锐利像素小方块） -->
                @for (u of minimapSimUnits(); track $index) {
                  <span
                    style="position:absolute;width:3px;height:3px;transform:translate(-50%,-50%);pointer-events:none;z-index:3;box-shadow:0 0 1px #000"
                    [style.left.%]="u.px"
                    [style.top.%]="u.py"
                    [style.background]="mmAllyColorMode() ? u.color : (u.team === 0 ? '#60a5fa' : u.team === 1 ? '#f43f5e' : '#fbbf24')"
                  ></span>
                }

                <!-- 上下河道神符高亮标记 -->
                @for (r of minimapRunes(); track r.id) {
                  <img
                    src="/assets/wc3/ui/mm-icon-rune.png"
                    alt=""
                    style="position:absolute;width:10px;height:10px;transform:translate(-50%,-50%);pointer-events:none;z-index:4;filter:drop-shadow(0 0 3px #38bdf8)"
                    [style.left.%]="r.px"
                    [style.top.%]="r.py"
                    [title]="r.name"
                  />
                }

                <!-- 英雄当前位置（魔兽原生英雄小地图图标 + 高亮光环） -->
                <img
                  src="/assets/wc3/ui/mm-icon-hero.png"
                  alt=""
                  style="position:absolute;width:14px;height:14px;transform:translate(-50%,-50%);pointer-events:none;z-index:6;filter:drop-shadow(0 0 4px #ffe14a)"
                  [style.left.%]="minimapHeroPct().x"
                  [style.top.%]="minimapHeroPct().y"
                />

                <!-- 小地图信号波纹动画 -->
                @if (minimapPing()) {
                  <img
                    src="/assets/wc3/ui/mm-icon-ping.png"
                    alt=""
                    class="animate-ping"
                    style="position:absolute;width:22px;height:22px;transform:translate(-50%,-50%);pointer-events:none;z-index:8"
                    [style.left.%]="minimapPing()!.x"
                    [style.top.%]="minimapPing()!.y"
                  />
                }

                <!-- 当前镜头视野框 -->
                <span class="wc3-cam"
                      [style.left.%]="minimapCamPct().x"
                      [style.top.%]="minimapCamPct().y"></span>
              </button>

              <!-- --- AI 修改开始 [MINIMAP-SIDE-BUTTONS]：补齐小地图右侧 5 个魔兽争霸3原生按钮（发信号、显示地形、盟友颜色、野怪营地、队形开关） --- -->
              <button type="button"
                      class="wc3-mm-sidebtn"
                      [class.active-btn]="mmPingMode()"
                      style="top:15.8%"
                      (click)="triggerMinimapPing()"
                      title="发送小地图信号 (Alt+G)">
                <img src="/assets/wc3/ui/minimap-btn-ping.png" alt="发信号" />
              </button>
              <button type="button"
                      class="wc3-mm-sidebtn"
                      [class.active-btn]="mmShowTerrain()"
                      style="top:28.9%"
                      (click)="mmShowTerrain.set(!mmShowTerrain())"
                      title="切换显示小地图地形 (Alt+T)">
                <img src="/assets/wc3/ui/minimap-btn-terrain.png" alt="显示地形" />
              </button>
              <button type="button"
                      class="wc3-mm-sidebtn"
                      [class.active-btn]="mmAllyColorMode()"
                      style="top:41.8%"
                      (click)="mmAllyColorMode.set(!mmAllyColorMode())"
                      title="切换盟友颜色模式 (Alt+A)">
                <img src="/assets/wc3/ui/minimap-btn-ally.png" alt="盟友颜色" />
              </button>
              <button type="button"
                      class="wc3-mm-sidebtn"
                      [class.active-btn]="mmShowCamps()"
                      style="top:55.8%; background:#19130c"
                      (click)="mmShowCamps.set(!mmShowCamps())"
                      title="显示/隐藏中立野怪营地标记 (Alt+C)">
                <img src="/assets/wc3/ui/mm-icon-camp.png" alt="野怪营地" style="padding:2px" />
              </button>
              <button type="button"
                      class="wc3-mm-sidebtn"
                      [class.active-btn]="formationOn()"
                      style="top:74.8%; height:12.2%"
                      (click)="formationOn.set(!formationOn())"
                      [title]="formationOn() ? '队形移动：已开启 (Alt+F)' : '队形移动：已关闭 (Alt+F)'">
                <img [src]="formationOn() ? '/assets/wc3/ui/minimap-btn-formation-on.png' : '/assets/wc3/ui/minimap-btn-formation-off.png'"
                     alt="队形开关" />
              </button>
              <!-- --- AI 修改结束 [MINIMAP-SIDE-BUTTONS]：补齐小地图右侧 5 个魔兽争霸3原生按钮（发信号、显示地形、盟友颜色、野怪营地、队形开关） --- -->

              <!-- 2. 3D 动态英雄肖像（实时播放 Portrait / Portrait Talk 呼吸对白动作）与等级角标 -->
              <div class="wc3-abs wc3-port"
                   [style.left.%]="cf.port.l" [style.top.%]="cf.port.t"
                   [style.width.%]="cf.port.w" [style.height.%]="cf.port.h"
                   (click)="setCameraMode('hero')"
                   title="点击聚焦英雄（3D 实时动态英雄对白肖像）">
                <img class="absolute inset-0 w-full h-full object-cover opacity-35"
                     [src]="heroIcon()"
                     alt="portrait-fallback"
                     draggable="false" />
                <canvas #portraitCanvas width="140" height="150"
                        class="relative z-[1] w-full h-full block"></canvas>
                <span class="absolute bottom-1 right-1 z-[2] px-1.5 py-0.2 rounded bg-black/85 border border-amber-400/75 text-[10px] font-black text-amber-300">
                  Lv.{{ heroLevel() }}
                </span>
              </div>

              <!-- 3. 原生贴图生命值与魔法值条 -->
              <div class="wc3-abs wc3-bar wc3-hp"
                   [style.left.%]="cf.hp.l" [style.top.%]="cf.hp.t"
                   [style.width.%]="cf.hp.w" [style.height.%]="cf.hp.h">
                <i [style.width.%]="heroHpPct()"></i>
                <span>{{ heroHp() }} / {{ heroHpMax() }}</span>
              </div>
              <div class="wc3-abs wc3-bar wc3-mp"
                   [style.left.%]="cf.mp.l" [style.top.%]="cf.mp.t"
                   [style.width.%]="cf.mp.w" [style.height.%]="cf.mp.h">
                <i [style.width.%]="heroMpPct()"></i>
                <span>{{ heroMp() }} / {{ heroMpMax() }}</span>
              </div>

              <!-- 4. 中央英雄属性面板（力量/敏捷/智力往右微调） -->
              <div class="wc3-abs wc3-info"
                   [style.left.%]="cf.info.l" [style.top.%]="cf.info.t"
                   [style.width.%]="cf.info.w" [style.height.%]="cf.info.h">
                <div>
                  <div class="name">{{ heroNameCn() }}</div>
                  <!-- 原生贴图经验条（仅显示等级文案；进度来自录像真实经验，无数据时为 0） -->
                  <div class="wc3-xp-bar" [title]="'等级 ' + heroLevel()">
                    <i [style.width.%]="xpPercent()"></i>
                  </div>
                  <div class="sub" style="margin-top:2px">等级 {{ heroLevel() }} · {{ heroTitle() }}</div>
                </div>

                <div class="grid grid-cols-2 gap-x-4 gap-y-1 my-auto pt-1">
                  <!-- 攻击与护甲 -->
                  <div class="space-y-1">
                    <div class="flex items-center gap-1.5">
                      <img class="w-5 h-5 shrink-0" src="/assets/wc3/ui/icons/infocard-attack-melee.png" alt="攻击" />
                      <div class="leading-tight">
                        <div class="text-[10px] text-amber-200/75">攻击力</div>
                        <div class="font-bold text-white">
                          {{ heroAtk() }}
                          @if (heroAtkBonus() > 0) {
                            <span class="text-emerald-400">+{{ heroAtkBonus() }}</span>
                          }
                        </div>
                      </div>
                    </div>
                    <div class="flex items-center gap-1.5">
                      <img class="w-5 h-5 shrink-0" src="/assets/wc3/ui/icons/infocard-armor-hero.png" alt="护甲" />
                      <div class="leading-tight">
                        <div class="text-[10px] text-amber-200/75">护甲 · 移速 {{ heroMoveSpeed() }}</div>
                        <div class="font-bold text-white">
                          {{ heroArmor() }}
                          @if (heroArmorBonus() > 0) {
                            <span class="text-emerald-400">+{{ heroArmorBonus() }}</span>
                          }
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- --- AI 修改开始 [ATTR-SHIFT-RIGHT]：将力量、敏捷、智力属性栏往右移动一点 --- -->
                  <div class="space-y-0.5 pl-5 ml-2">
                    <div class="flex items-center gap-1.5">
                      <img class="w-4 h-4 shrink-0" src="/assets/wc3/ui/icons/infocard-str.png" alt="力量" />
                      <span class="text-amber-200/80 text-[10px] w-7">力量</span>
                      <span class="font-bold text-white">{{ heroStr() }}</span>
                      @if (heroStrBonus() > 0) {
                        <span class="text-emerald-400 font-bold">+{{ heroStrBonus() }}</span>
                      }
                    </div>
                    <div class="flex items-center gap-1.5">
                      <img class="w-4 h-4 shrink-0" src="/assets/wc3/ui/icons/infocard-agi.png" alt="敏捷" />
                      <span class="text-amber-200/80 text-[10px] w-7">敏捷</span>
                      <span class="font-bold text-white">{{ heroAgi() }}</span>
                      @if (heroAgiBonus() > 0) {
                        <span class="text-emerald-400 font-bold">+{{ heroAgiBonus() }}</span>
                      }
                    </div>
                    <div class="flex items-center gap-1.5">
                      <img class="w-4 h-4 shrink-0" src="/assets/wc3/ui/icons/infocard-int.png" alt="智力" />
                      <span class="text-amber-200/80 text-[10px] w-7">智力</span>
                      <span class="font-bold text-white">{{ heroInt() }}</span>
                      @if (heroIntBonus() > 0) {
                        <span class="text-emerald-400 font-bold">+{{ heroIntBonus() }}</span>
                      }
                    </div>
                  </div>
                  <!-- --- AI 修改结束 [ATTR-SHIFT-RIGHT]：将力量、敏捷、智力属性栏往右移动一点 --- -->
                </div>
              </div>

              <!-- 5. 6格物品栏（实时同步 PUI/DRI、合成与臂章开关状态） -->
              <div class="wc3-abs"
                   [style.left.%]="cf.inv.l" [style.top.%]="cf.inv.t"
                   [style.width.%]="cf.inv.w" [style.height.%]="cf.inv.h">
                <div class="wc3-grid wc3-grid-inv">
                  @for (it of itemSlots(); track it.slot) {
                    <div class="wc3-slot"
                         [class.has-item]="!!it.icon"
                         [class.active-toggle]="!!it.activeToggle"
                         [title]="it.code ? it.name + ' (' + it.hotkey + ')' : '物品栏 (' + it.hotkey + ')'">
                      @if (it.icon) {
                        <img class="ico" [src]="it.icon" [alt]="it.name" draggable="false" />
                        <span class="hk">{{ it.hotkey }}</span>
                        @if (it.charges > 1) {
                          <span class="lv">{{ it.charges }}</span>
                        }
                      }
                    </div>
                  }
                </div>
              </div>

              <!-- 6. 12格命令与英雄技能面板 -->
              <div class="wc3-abs"
                   [style.left.%]="cf.cmd.l" [style.top.%]="cf.cmd.t"
                   [style.width.%]="cf.cmd.w" [style.height.%]="cf.cmd.h">
                <div class="wc3-grid wc3-grid-cmd">
                  @for (sk of commandSlots(); track sk.id) {
                    <button type="button"
                            class="wc3-slot"
                            [class.has-cmd]="!!sk.icon"
                            [class.unlearned]="!!sk.unlearned"
                            [class.active-cmd]="!!sk.active"
                            [title]="sk.name ? sk.name + (sk.hotkey ? ' [' + sk.hotkey + ']' : '') : ''">
                      @if (sk.icon) {
                        <img class="ico" [src]="sk.icon" [alt]="sk.name" draggable="false" />
                      }
                      @if (sk.hotkey) {
                        <span class="hk">{{ sk.hotkey }}</span>
                      }
                      @if (sk.level > 0) {
                        <span class="lv">Lv.{{ sk.level }}</span>
                      }
                    </button>
                  }
                </div>
              </div>
            </div>
          </div>
        </div>

        @if (showDebug()) {
          <aside class="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-white/10 bg-[#0b1118] p-3 space-y-3 overflow-y-auto max-h-[85vh]">
            <section class="space-y-1.5">
              <h2 class="text-xs font-black uppercase tracking-widest text-accent">录像事件流 ({{ recentEvents().length }})</h2>
              <div class="space-y-1 max-h-56 overflow-y-auto pr-1 text-[11px]">
                @for (ev of recentEvents(); track ev.timeMs + ev.text) {
                  <div class="px-2 py-1 rounded bg-white/5 border border-white/10">
                    <span class="font-mono text-amber-300 mr-1">[{{ ev.timeText }}]</span>
                    <span>{{ ev.text }}</span>
                  </div>
                }
              </div>
            </section>
            <section class="space-y-1.5">
              <h2 class="text-xs font-black uppercase tracking-widest text-accent">3D 模型动作序列</h2>
              <div class="flex flex-wrap gap-1 max-h-40 overflow-y-auto">
                @for (seq of sequences(); track seq.index) {
                  <button type="button" (click)="playSequence(seq.index)"
                          class="px-2 py-1 rounded text-[10px] border"
                          [ngClass]="activeSequence() === seq.index
                            ? 'border-accent text-accent bg-accent/15'
                            : 'border-white/10 bg-white/5'">
                    {{ seq.name }}
                  </button>
                }
              </div>
            </section>
            <section class="text-[11px] space-y-1 text-[var(--text-muted)]">
              <p>场景建筑/装饰 {{ buildingCount() }} · 兵线野怪 {{ simUnits() }}</p>
              <p>当前序列 {{ activeSequenceName() || '—' }}</p>
              <button type="button" (click)="resetCamera()"
                      class="mt-1 px-2 py-1 border border-white/20 rounded text-[10px]">复位镜头</button>
            </section>
          </aside>
        }
      </div>
    </main>
  `,
})
export class Replay3dComponent implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly route = inject(ActivatedRoute);
  private readonly glCanvas = viewChild<ElementRef<HTMLCanvasElement>>('glCanvas');
  private readonly viewLayer = viewChild<ElementRef<HTMLDivElement>>('viewLayer');
  // --- AI 修改开始 [PORTRAIT-3D]：获取底部控制台 3D 动态英雄肖像画布引用 ---
  private readonly portraitCanvas = viewChild<ElementRef<HTMLCanvasElement>>('portraitCanvas');
  // --- AI 修改结束 [PORTRAIT-3D]：获取底部控制台 3D 动态英雄肖像画布引用 ---

  readonly cf = CF;

  readonly loading = signal(true);
  readonly error = signal('');
  readonly modelName = signal('');
  readonly sequences = signal<Wc3SequenceInfo[]>([]);
  readonly activeSequence = signal(-1);
  readonly activeSequenceName = signal('');
  readonly matchId = signal('');
  readonly player = signal('wuxiancong');
  readonly hero = signal('');
  readonly timelineSec = signal(0);
  readonly isLive = signal(false);
  readonly matchLabel = signal('加载中…');
  readonly cameraMode = signal<'hero' | 'map' | 'free'>('hero');
  readonly buildingCount = signal(0);
  readonly simUnits = signal(0);
  readonly simOn = signal(true);
  readonly showDebug = signal(false);

  // --- AI 修改开始 [REPLAY-SYNC-UI]：录像播放控制、顶部菜单弹窗、小地图侧边五按钮与实时英雄状态信号 ---
  readonly matchList = signal<ReplayMatchSummary[]>([]);
  readonly selectedFile = signal('');
  readonly isPlaying = signal(true);
  readonly playSpeed = signal(1);
  readonly currentMs = signal(0);
  readonly durationMs = signal(200000);
  readonly currentTimeText = signal('00:00');
  readonly clockMinText = signal('00');
  readonly clockSecText = signal('00');
  readonly totalTimeText = signal('03:20');

  readonly activeTopMenu = signal<'quests' | 'menu' | 'allies' | 'chat' | null>(null);
  readonly mmPingMode = signal(false);
  readonly mmShowTerrain = signal(true);
  readonly mmAllyColorMode = signal(true);
  readonly mmShowCamps = signal(true);
  readonly formationOn = signal(true);
  readonly minimapPing = signal<{ x: number; y: number } | null>(null);

  readonly minimapCamps: { id: string; name: string; px: number; py: number; filter: string }[] = [
    { id: 'rad_small', name: '近卫小野点', x: 2960, y: -5008, tier: 'small' },
    { id: 'rad_med_1', name: '近卫中野点(东)', x: 1584, y: -3984, tier: 'medium' },
    { id: 'rad_med_2', name: '近卫中野点(西)', x: -1056, y: -4592, tier: 'medium' },
    { id: 'rad_large_1', name: '近卫大野点(东)', x: 3072, y: -3712, tier: 'large' },
    { id: 'rad_large_2', name: '近卫大野点(中)', x: -416, y: -3584, tier: 'large' },
    { id: 'rad_ancient', name: '近卫远古野', x: -3216, y: -256, tier: 'ancient' },
    { id: 'dire_small', name: '天灾小野点', x: -3088, y: 4256, tier: 'small' },
    { id: 'dire_med_1', name: '天灾中野点(西)', x: -1648, y: 2352, tier: 'medium' },
    { id: 'dire_med_2', name: '天灾中野点(中)', x: -288, y: 3456, tier: 'medium' },
    { id: 'dire_large_1', name: '天灾大野点(西)', x: -4512, y: 3408, tier: 'large' },
    { id: 'dire_large_2', name: '天灾大野点(东)', x: 1232, y: 3040, tier: 'large' },
    { id: 'dire_ancient', name: '天灾远古野', x: 4640, y: -976, tier: 'ancient' },
    { id: 'roshan', name: '肉山巢穴 (Roshan)', x: 4176, y: -2288, tier: 'roshan' },
  ].map((c) => {
    const p = worldToMapPixel(c.x, c.y, DOTA_MAP_BOUNDS, 100, 100);
    const filter =
      c.tier === 'small'
        ? 'hue-rotate(85deg) saturate(1.8) brightness(1.15)'
        : c.tier === 'ancient' || c.tier === 'roshan'
          ? 'hue-rotate(-25deg) saturate(2.2) brightness(1.1)'
          : 'saturate(1.6) brightness(1.1)';
    return { id: c.id, name: c.name, px: p.px, py: p.py, filter };
  });

  readonly minimapCamPct = signal({ x: 15, y: 85 });
  readonly minimapHeroPct = signal({ x: 15, y: 85 });
  readonly minimapBuildings = signal<{ id: string; px: number; py: number; size: number; color: string; isShop?: boolean }[]>([]);
  readonly minimapSimUnits = signal<{ px: number; py: number; color: string; team: 0 | 1 | -1 }[]>([]);
  // --- AI 修改开始 [SCENE-SIM-DOTA]：小地图河道神符实时状态信号 ---
  readonly minimapRunes = signal<{ id: string; px: number; py: number; name: string; color: string }[]>([]);
  // --- AI 修改结束 [SCENE-SIM-DOTA]：小地图河道神符实时状态信号 ---
  // --- AI 修改开始 [COMBAT-GOLD-SIM]：头顶血条开关、投影血条与飘金跳字信号 ---
  readonly showHealthBars = signal(true);
  readonly overheadHpBars = signal<{ id: string; sx: number; sy: number; hpPct: number; color: string; isHero?: boolean; isTower?: boolean; name?: string }[]>([]);
  readonly activeFloatingTexts = signal<{ id: number; sx: number; sy: number; text: string; color: string; opacity: number }[]>([]);
  readonly currentHeroKey = signal<'pa' | 'blademaster' | 'antimage' | 'sniper' | 'tauren' | 'paladin' | 'lich'>('blademaster');
  // --- AI 修改结束 [COMBAT-GOLD-SIM] ---

  readonly heroNameCn = signal('主宰');
  readonly heroTitle = signal('尤涅若 · 近战敏捷');
  readonly heroIcon = signal('/assets/wc3/ui/icons/BTNHeroBlademaster.png');
  readonly heroLevel = signal(1);
  readonly xpPercent = signal(0);
  readonly heroHp = signal(530);
  readonly heroHpMax = signal(530);
  readonly heroMp = signal(182);
  readonly heroMpMax = signal(182);
  readonly heroStr = signal(20);
  readonly heroStrBonus = signal(0);
  readonly heroAgi = signal(26);
  readonly heroAgiBonus = signal(0);
  readonly heroInt = signal(14);
  readonly heroIntBonus = signal(0);
  readonly heroAtk = signal('50-54');
  readonly heroAtkBonus = signal(0);
  readonly heroArmor = signal(4.6);
  readonly heroArmorBonus = signal(0);
  readonly heroMoveSpeed = signal(305);
  readonly heroHpPct = signal(100);
  readonly heroMpPct = signal(100);
  readonly gold = signal(825);
  readonly lumber = signal(0);
  readonly food = signal(1);
  readonly kills = signal(0);
  readonly deaths = signal(0);
  readonly assists = signal(0);
  readonly lastHits = signal(0);
  readonly denies = signal(0);
  readonly neutrals = signal(0);
  readonly heroPos = signal({ x: -6864, y: -6800 });
  readonly isMoving = signal(false);
  readonly basicCommandLabel = signal('无');
  readonly recentEvents = signal<ReplayEventLogItem[]>([]);

  readonly itemSlots = signal<ReplayInventorySlot[]>([
    { slot: 0, hotkey: 'Num7', code: '', name: '', icon: '', charges: 0 },
    { slot: 1, hotkey: 'Num8', code: '', name: '', icon: '', charges: 0 },
    { slot: 2, hotkey: 'Num4', code: '', name: '', icon: '', charges: 0 },
    { slot: 3, hotkey: 'Num5', code: '', name: '', icon: '', charges: 0 },
    { slot: 4, hotkey: 'Num1', code: '', name: '', icon: '', charges: 0 },
    { slot: 5, hotkey: 'Num2', code: '', name: '', icon: '', charges: 0 },
  ]);

  // --- AI 修改开始 [CMD-CARD-NATIVE]：基础命令用本地正确解码的 WC3 图标；属性附加/学习技能默认空槽，有等级或技能点时再显示 ---
  readonly commandSlots = signal<CommandCardSlot[]>([
    { id: 'move', hotkey: 'M', name: '移动', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNMove.png' },
    { id: 'stop', hotkey: 'S', name: '停止', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNStop.png' },
    { id: 'hold', hotkey: 'H', name: '保持原位', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNHoldPosition.png' },
    { id: 'attack', hotkey: 'A', name: '攻击', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNAttack.png' },
    { id: 'patrol', hotkey: 'P', name: '巡逻', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNPatrol.png' },
    { id: 'empty1', hotkey: '', name: '', level: 0, icon: '' },
    { id: 'empty_statup', hotkey: '', name: '', level: 0, icon: '' },
    {
      id: 'learn',
      hotkey: 'O',
      name: '学习技能',
      level: 1,
      icon: '/assets/wc3/ui/icons/cmd/BTNSkillz.png',
    },
    { id: 'sk1', hotkey: 'F', name: '剑刃风暴', level: 0, icon: '/assets/dota/abilityIcons/A05G.png', unlearned: true },
    { id: 'sk2', hotkey: 'G', name: '治疗守卫', level: 0, icon: '/assets/dota/abilityIcons/A047.png', unlearned: true },
    { id: 'sk3', hotkey: 'C', name: '剑舞', level: 0, icon: '/assets/dota/abilityIcons/A00K.png', unlearned: true },
    { id: 'sk4', hotkey: 'E', name: '无敌斩', level: 0, icon: '/assets/dota/abilityIcons/A0M1.png', unlearned: true },
  ]);
  // --- AI 修改结束 [CMD-CARD-NATIVE] ---

  private timeline?: ReplayTimelineEngine;
  private lastTickTime = 0;
  private currentHeroModelUrl = '/assets/models/blademaster/HeroBladeMaster.mdxbin';
  // --- AI 修改结束 [REPLAY-SYNC-UI]：录像播放控制与实时英雄状态信号 ---

  private mdx?: Wc3MdxViewer;
  private seqPoll = 0;
  private disposed = false;
  private readonly minimapSize = 176;

  constructor() {
    afterNextRender(() => {
      if (!isPlatformBrowser(this.platformId)) {
        return;
      }
      this.readQuery();
      void this.boot();
    });
  }

  ngOnDestroy(): void {
    this.disposed = true;
    if (typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.seqPoll);
    }
    this.mdx?.dispose();
    this.mdx = undefined;
  }

  formatDuration(ms: number): string {
    return formatMsClock(ms);
  }

  togglePlay(): void {
    if (!this.isPlaying() && this.currentMs() >= this.durationMs()) {
      this.currentMs.set(this.timeline?.firstMoveMs || 0);
    }
    this.isPlaying.set(!this.isPlaying());
    this.lastTickTime = performance.now();
  }

  onScrub(ms: number): void {
    this.currentMs.set(Math.max(0, Math.min(this.durationMs(), ms)));
    this.applyReplayFrame(this.currentMs());
  }

  async onSelectMatchFile(fileName: string): Promise<void> {
    if (!fileName) return;
    this.selectedFile.set(fileName);
    await this.loadReplayData({ file: fileName });
  }

  reload(): void {
    this.error.set('');
    this.loading.set(true);
    this.mdx?.dispose();
    this.mdx = undefined;
    void this.boot();
  }

  playSequence(idOrName: number | string): void {
    this.mdx?.playSequence(idOrName);
    this.syncActiveSequence();
  }

  resetCamera(): void {
    this.mdx?.resetCamera();
    this.cameraMode.set(this.mdx?.cameraMode || 'hero');
  }

  setCameraMode(mode: 'hero' | 'map' | 'free'): void {
    this.cameraMode.set(mode);
    this.mdx?.setCameraMode(mode);
  }

  // --- AI 修改开始 [SCENE-SIM-DOTA]：支持一键跳转镜头至商店、神秘商店、上下河道神符点与肉山巢穴，以及顶部菜单与小地图信号 ---
  toggleTopMenu(menu: 'quests' | 'menu' | 'allies' | 'chat'): void {
    this.activeTopMenu.set(this.activeTopMenu() === menu ? null : menu);
  }

  triggerMinimapPing(): void {
    const nextMode = !this.mmPingMode();
    this.mmPingMode.set(nextMode);
    const pos = this.minimapHeroPct();
    this.minimapPing.set({ x: pos.x, y: pos.y });
    setTimeout(() => {
      this.minimapPing.set(null);
      this.mmPingMode.set(false);
    }, 2400);
  }

  jumpToPoint(x: number, y: number): void {
    if (!this.mdx) return;
    this.mdx.panCameraTo(x, y);
    this.cameraMode.set('free');
    this.updateMinimapMarker();
  }
  // --- AI 修改结束 [SCENE-SIM-DOTA]：支持一键跳转镜头至商店、神秘商店、上下河道神符点与肉山巢穴，以及顶部菜单与小地图信号 ---

  toggleSim(): void {
    const next = !this.simOn();
    this.simOn.set(next);
    this.mdx?.setSimEnabled(next);
  }

  // --- AI 修改开始 [COMBAT-GOLD-AND-PA]：血条开关切换与预设英雄（含幻影刺客茉崔蒂）切换方法 ---
  toggleHealthBars(): void {
    this.showHealthBars.set(!this.showHealthBars());
  }

  onSelectHeroPreset(key: 'pa' | 'blademaster' | 'antimage' | 'sniper' | 'tauren' | 'paladin' | 'lich'): void {
    this.currentHeroKey.set(key);
    if (!this.mdx) return;
    if (key === 'pa') {
      void this.mdx.switchHeroModel('/assets/models/warden/HeroWarden.mdxbin', '/assets/models/warden/').then(() => {
        this.sequences.set(this.mdx?.sequences || []);
      });
      this.heroNameCn.set('茉崔蒂');
      this.heroTitle.set('幻影刺客 · 近战敏捷');
      this.heroIcon.set('/assets/wc3/ui/icons/BTNHeroWarden.png');
      this.heroHp.set(620);
      this.heroHpMax.set(620);
      this.heroMp.set(234);
      this.heroMpMax.set(234);
      this.heroAtk.set('48-50');
      this.heroArmor.set(4.2);
      this.heroMoveSpeed.set(310);
      // --- AI 修改开始 [PA-COMMAND-SLOTS]：PA 技能写入 commandSlots；不预置属性附加 U ---
      this.commandSlots.set([
        { id: 'move', hotkey: 'M', name: '移动', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNMove.png' },
        { id: 'stop', hotkey: 'S', name: '停止', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNStop.png' },
        { id: 'hold', hotkey: 'H', name: '保持原位', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNHoldPosition.png' },
        { id: 'attack', hotkey: 'A', name: '攻击', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNAttack.png' },
        { id: 'patrol', hotkey: 'P', name: '巡逻', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNPatrol.png' },
        { id: 'empty1', hotkey: '', name: '', level: 0, icon: '' },
        { id: 'empty_statup', hotkey: '', name: '', level: 0, icon: '' },
        {
          id: 'learn',
          hotkey: 'O',
          name: '学习技能',
          level: 1,
          icon: '/assets/wc3/ui/icons/cmd/BTNSkillz.png',
        },
        { id: 'pa_stifling', hotkey: 'D', name: '窒息之刃', level: 1, icon: '/assets/wc3/ui/icons/BTNHeroWarden.png' },
        { id: 'pa_phantom', hotkey: 'B', name: '幻影突袭', level: 1, icon: '/assets/wc3/ui/icons/BTNBlink.png' },
        { id: 'pa_blur', hotkey: 'R', name: '模糊', level: 1, icon: '/assets/wc3/ui/icons/BTNBlur.png' },
        { id: 'pa_coup', hotkey: 'C', name: '恩赐解脱', level: 1, icon: '/assets/wc3/ui/icons/BTNCrit.png' },
      ]);
      // --- AI 修改结束 [PA-COMMAND-SLOTS] ---
    } else if (key === 'blademaster') {
      void this.mdx.switchHeroModel('/assets/models/blademaster/HeroBladeMaster.mdxbin', '/assets/models/blademaster/').then(() => {
        this.sequences.set(this.mdx?.sequences || []);
      });
      this.heroNameCn.set('主宰');
      this.heroTitle.set('尤涅若 · 近战敏捷');
      this.heroIcon.set('/assets/wc3/ui/icons/BTNHeroBlademaster.png');
      this.heroHp.set(530);
      this.heroHpMax.set(530);
      this.heroAtk.set('50-54');
    } else if (key === 'antimage') {
      void this.mdx.switchHeroModel('/assets/wc3/Units/NightElf/HeroDemonHunter/HeroDemonHunter.mdxbin', '/assets/wc3/').then(() => {
        this.sequences.set(this.mdx?.sequences || []);
      });
      this.heroNameCn.set('敌法师');
      this.heroTitle.set('玛吉纳 · 近战敏捷');
      this.heroIcon.set('/assets/wc3/ui/icons/BTNHeroDemonHunter.png');
    } else if (key === 'sniper') {
      void this.mdx.switchHeroModel('/assets/wc3/Units/Human/Rifleman/Rifleman.mdxbin', '/assets/wc3/').then(() => {
        this.sequences.set(this.mdx?.sequences || []);
      });
      this.heroNameCn.set('狙击手');
      this.heroTitle.set('卡德尔 · 远程敏捷');
      this.heroIcon.set('/assets/wc3/ui/icons/BTNRifleman.png');
    } else if (key === 'tauren') {
      void this.mdx.switchHeroModel('/assets/wc3/Units/Orc/HeroTaurenChieftain/HeroTaurenChieftain.mdxbin', '/assets/wc3/').then(() => {
        this.sequences.set(this.mdx?.sequences || []);
      });
      this.heroNameCn.set('牛头人酋长');
      this.heroTitle.set('卡恩 · 近战力量');
      this.heroIcon.set('/assets/wc3/ui/icons/BTNHeroTaurenChieftain.png');
    } else if (key === 'paladin') {
      void this.mdx.switchHeroModel('/assets/wc3/Units/Human/HeroPaladin/HeroPaladin.mdxbin', '/assets/wc3/').then(() => {
        this.sequences.set(this.mdx?.sequences || []);
      });
      this.heroNameCn.set('全能骑士');
      this.heroTitle.set('普利斯特 · 近战力量');
      this.heroIcon.set('/assets/wc3/ui/icons/BTNHeroPaladin.png');
    } else if (key === 'lich') {
      void this.mdx.switchHeroModel('/assets/wc3/Units/Undead/HeroLich/HeroLich.mdxbin', '/assets/wc3/').then(() => {
        this.sequences.set(this.mdx?.sequences || []);
      });
      this.heroNameCn.set('巫妖');
      this.heroTitle.set('诺瓦 · 远程智力');
      this.heroIcon.set('/assets/wc3/ui/icons/BTNHeroLich.png');
    }
  }
  // --- AI 修改结束 [COMBAT-GOLD-AND-PA] ---

  onMinimapClick(ev: MouseEvent): void {
    const el = ev.currentTarget as HTMLElement | null;
    if (!el || !this.mdx) return;
    const rect = el.getBoundingClientRect();
    const px = Math.max(0, Math.min(rect.width, ev.clientX - rect.left));
    const py = Math.max(0, Math.min(rect.height, ev.clientY - rect.top));
    if (this.mmPingMode() || ev.altKey) {
      this.minimapPing.set({
        x: (px / Math.max(1, rect.width)) * 100,
        y: (py / Math.max(1, rect.height)) * 100,
      });
      setTimeout(() => {
        this.minimapPing.set(null);
        this.mmPingMode.set(false);
      }, 2400);
      return;
    }
    const bounds = this.mdx.getMapBounds?.() || DOTA_MAP_BOUNDS;
    const { x, y } = mapPixelToWorld(px, py, bounds, rect.width, rect.height);
    this.mdx.panCameraTo(x, y);
    this.cameraMode.set('free');
    this.updateMinimapMarker();
  }

  private updateMinimapMarker(): void {
    if (!this.mdx) return;
    const focus = this.mdx.getCameraFocus();
    const bounds = this.mdx.getMapBounds?.() || DOTA_MAP_BOUNDS;
    const { px, py } = worldToMapPixel(
      focus.x,
      focus.y,
      bounds,
      this.minimapSize,
      this.minimapSize
    );
    this.minimapCamPct.set({
      x: Math.max(0, Math.min(100, (px / this.minimapSize) * 100)),
      y: Math.max(0, Math.min(100, (py / this.minimapSize) * 100)),
    });

    const hp = this.heroPos();
    const hPx = worldToMapPixel(hp.x, hp.y, bounds, this.minimapSize, this.minimapSize);
    this.minimapHeroPct.set({
      x: Math.max(0, Math.min(100, (hPx.px / this.minimapSize) * 100)),
      y: Math.max(0, Math.min(100, (hPx.py / this.minimapSize) * 100)),
    });

    const units = this.mdx.getSimUnits();
    this.minimapSimUnits.set(
      units.map((u) => {
        const up = worldToMapPixel(u.x, u.y, bounds, 100, 100);
        return {
          px: Math.max(0, Math.min(100, up.px)),
          py: Math.max(0, Math.min(100, up.py)),
          color: u.team === 0 ? '#22c55e' : u.team === 1 ? '#ef4444' : '#fbbf24',
          team: u.team,
        };
      })
    );
    // --- AI 修改开始 [SCENE-SIM-DOTA]：同步渲染上下河道神符在小地图上的实时位置与颜色 ---
    const runes = this.mdx.getSimRunes?.() || [];
    const runeColors: Record<string, string> = {
      bounty: '#fbbf24',
      dd: '#38bdf8',
      haste: '#f43f5e',
      illusion: '#fde047',
      invis: '#a855f7',
      regen: '#22c55e',
    };
    this.minimapRunes.set(
      runes.map((r) => {
        const rp = worldToMapPixel(r.x, r.y, bounds, 100, 100);
        return {
          id: r.spotId,
          px: Math.max(0, Math.min(100, rp.px)),
          py: Math.max(0, Math.min(100, rp.py)),
          name: `${r.spotName}：${r.nameCn}`,
          color: runeColors[r.kind] || '#38bdf8',
        };
      })
    );
    // --- AI 修改结束 [SCENE-SIM-DOTA]：同步渲染上下河道神符在小地图上的实时位置与颜色 ---
  }

  private readQuery(): void {
    const q = this.route.snapshot.queryParamMap;
    this.matchId.set(q.get('matchId') || '');
    this.player.set(q.get('player') || 'wuxiancong');
    this.hero.set(q.get('hero') || '');
    this.timelineSec.set(Number(q.get('t') || 0) || 0);
    this.isLive.set(q.get('live') === '1');
  }

  private syncOverridesFromQuery(): Record<string, unknown> | null {
    const q = this.route.snapshot.queryParamMap;
    const overrides: Record<string, unknown> = {};
    const creep = Number(q.get('creepMs') || 0);
    const neutral = Number(q.get('neutralMs') || 0);
    const enabled = q.get('sim');
    if (creep > 0) overrides['creepWaveIntervalMs'] = creep;
    if (neutral > 0) overrides['neutralRefreshMs'] = neutral;
    if (enabled === '0') overrides['enabled'] = false;
    if (enabled === '1') overrides['enabled'] = true;
    return Object.keys(overrides).length ? overrides : null;
  }

  private async loadMinimapBuildings(): Promise<void> {
    try {
      const cfg = await loadDotaMapConfig(DEFAULT_DOTA_MAP_URL);
      const list = (cfg.buildings || [])
        .map((b: DotaBuilding) => {
          // --- AI 修改开始 [MINIMAP-SHOPS-AUTHENTIC]：对齐原版 DotA 6.83d 小地图，仅在 2 个神秘商店与 2 个边路商店显示中立商店图标，基地内部 10 个 NPC 商人不在小地图显示小房子 ---
          if (b.kind === 'shop') return null;
          if (b.id === 'shop_side_top_2' || b.id === 'shop_side_bot_2') return null;
          const { px, py } = worldToMapPixel(b.x, b.y, cfg.bounds, 100, 100);
          const isShop = b.kind === 'side_shop' || b.kind === 'secret_shop';
          return {
            id: b.id,
            px,
            py,
            size: b.kind === 'ancient' || b.kind === 'fountain' ? 7 : 5,
            color: isShop ? '#facc15' : b.team === 0 ? '#10b981' : '#ef4444',
            isShop,
          };
          // --- AI 修改结束 [MINIMAP-SHOPS-AUTHENTIC] ---
        })
        .filter(Boolean) as { id: string; px: number; py: number; size: number; color: string; isShop?: boolean }[];
      this.minimapBuildings.set(list);
    } catch {
      /* ignore */
    }
  }

  private async loadReplayData(opts?: { file?: string }): Promise<void> {
    try {
      const player = this.player() || 'wuxiancong';
      if (!this.matchList().length) {
        const listRes = await fetch(`/api/replay/matches?player=${encodeURIComponent(player)}`);
        if (listRes.ok) {
          const listJson = await listRes.json();
          this.matchList.set(listJson.matches || []);
        }
      }

      const params = new URLSearchParams({ player });
      if (opts?.file) {
        params.set('file', opts.file);
      } else if (this.matchId()) {
        params.set('matchId', this.matchId());
      }
      if (this.isLive()) {
        params.set('live', '1');
      }

      const res = await fetch(`/api/replay/match?${params.toString()}`);
      if (!res.ok) return;
      const payload = (await res.json()) as ReplayMatchPayload;
      this.selectedFile.set(payload.fileName);
      this.matchId.set(payload.matchId);
      this.player.set(payload.player || player);
      this.matchLabel.set(`${payload.player} · ${payload.heroName} · ${payload.matchId}`);

      const engine = new ReplayTimelineEngine(payload);
      this.timeline = engine;
      this.durationMs.set(engine.durationMs);
      this.totalTimeText.set(formatMsClock(engine.durationMs));

      const startMs =
        this.timelineSec() > 0
          ? this.timelineSec() * 1000
          : Math.max(0, (engine.firstMoveMs || 2000) - 500);
      this.currentMs.set(Math.min(engine.durationMs, startMs));
      this.lastTickTime = performance.now();
      this.applyReplayFrame(this.currentMs());
    } catch (e) {
      console.warn('[replay-3d] loadReplayData failed', e);
    }
  }

  private applyReplayFrame(ms: number): void {
    if (!this.timeline) return;
    const state = this.timeline.sampleAt(ms);
    this.currentTimeText.set(state.gameClockText);
    const parts = String(state.gameClockText || '00:00').split(':');
    this.clockMinText.set(parts[0] || '00');
    this.clockSecText.set(parts[1] || '00');
    this.heroNameCn.set(state.heroName);
    this.heroTitle.set(state.heroClassTitle);
    if (state.heroIcon) this.heroIcon.set(state.heroIcon);
    this.heroLevel.set(state.level);
    this.xpPercent.set(state.xpPercent);
    this.heroHp.set(state.hp);
    this.heroHpMax.set(state.maxHp);
    this.heroMp.set(state.mp);
    this.heroMpMax.set(state.maxMp);
    this.heroHpPct.set(Math.max(1, Math.min(100, Math.round((state.hp / Math.max(1, state.maxHp)) * 100))));
    this.heroMpPct.set(Math.max(1, Math.min(100, Math.round((state.mp / Math.max(1, state.maxMp)) * 100))));
    this.heroStr.set(state.strBase);
    this.heroStrBonus.set(state.strBonus);
    this.heroAgi.set(state.agiBase);
    this.heroAgiBonus.set(state.agiBonus);
    this.heroInt.set(state.intBase);
    this.heroIntBonus.set(state.intBonus);
    this.heroAtk.set(`${state.damageMin}-${state.damageMax}`);
    this.heroAtkBonus.set(state.damageBonus);
    this.heroArmor.set(state.armor);
    this.heroArmorBonus.set(state.armorBonus);
    this.heroMoveSpeed.set(state.moveSpeed);
    this.gold.set(state.gold);
    this.kills.set(state.kills);
    this.deaths.set(state.deaths);
    this.assists.set(state.assists);
    this.lastHits.set(state.lastHits);
    this.denies.set(state.denies);
    this.neutrals.set(state.neutrals);
    this.heroPos.set({ x: state.x, y: state.y });
    this.isMoving.set(state.isMoving);
    this.recentEvents.set(state.recentEvents);
    this.itemSlots.set(state.inventory);

    const s0 = state.skills[0];
    const s1 = state.skills[1];
    const s2 = state.skills[2];
    const s3 = state.skills[3];
    // --- AI 修改开始 [CMD-CARD-NATIVE]：属性附加仅已学时显示；学习技能（O）始终保留（无点数灰显）；系统命令图标走本地 BLP 解码资源 ---
    const statUpSlot: CommandCardSlot =
      state.attrBonusLevel > 0
        ? {
            id: 'statup',
            hotkey: 'T',
            name: '属性附加',
            level: state.attrBonusLevel,
            icon: '/assets/wc3/ui/icons/cmd/BTNStatUp.png',
          }
        : { id: 'empty_statup', hotkey: '', name: '', level: 0, icon: '' };
    const learnSlot: CommandCardSlot = {
      id: 'learn',
      hotkey: 'O',
      name:
        state.unspentSkillPoints > 0
          ? `学习技能（剩余 ${state.unspentSkillPoints} 点）`
          : '学习技能',
      level: state.unspentSkillPoints,
      icon: '/assets/wc3/ui/icons/cmd/BTNSkillz.png',
      unlearned: state.unspentSkillPoints === 0,
    };
    // 正在走路但尚未记下指令时，按移动高亮（避免只播动画看不到绿框）
    const cmd =
      state.basicCommand ||
      (state.isMoving ? 'move' : ('' as const));
    const cmdLabels: Record<string, string> = {
      move: '移动',
      stop: '停止',
      hold: '保持原位',
      attack: '攻击',
      patrol: '巡逻',
    };
    this.basicCommandLabel.set(cmdLabels[cmd] || '无');
    this.commandSlots.set([
      { id: 'move', hotkey: 'M', name: '移动', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNMove.png', active: cmd === 'move' },
      { id: 'stop', hotkey: 'S', name: '停止', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNStop.png', active: cmd === 'stop' },
      { id: 'hold', hotkey: 'H', name: '保持原位', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNHoldPosition.png', active: cmd === 'hold' },
      { id: 'attack', hotkey: 'A', name: '攻击', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNAttack.png', active: cmd === 'attack' },
      { id: 'patrol', hotkey: 'P', name: '巡逻', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNPatrol.png', active: cmd === 'patrol' },
      { id: 'empty1', hotkey: '', name: '', level: 0, icon: '' },
      statUpSlot,
      learnSlot,
      s0
        ? { id: s0.code, hotkey: s0.hotkey, name: s0.name, level: s0.level, maxLevel: s0.maxLevel, icon: s0.icon, unlearned: s0.level === 0 }
        : { id: 'sk1', hotkey: '', name: '', level: 0, icon: '' },
      s1
        ? { id: s1.code, hotkey: s1.hotkey, name: s1.name, level: s1.level, maxLevel: s1.maxLevel, icon: s1.icon, unlearned: s1.level === 0 }
        : { id: 'sk2', hotkey: '', name: '', level: 0, icon: '' },
      s2
        ? { id: s2.code, hotkey: s2.hotkey, name: s2.name, level: s2.level, maxLevel: s2.maxLevel, icon: s2.icon, unlearned: s2.level === 0 }
        : { id: 'sk3', hotkey: '', name: '', level: 0, icon: '' },
      s3
        ? { id: s3.code, hotkey: s3.hotkey, name: s3.name, level: s3.level, maxLevel: s3.maxLevel, icon: s3.icon, unlearned: s3.level === 0 }
        : { id: 'sk4', hotkey: '', name: '', level: 0, icon: '' },
    ]);
    // --- AI 修改结束 [CMD-CARD-NATIVE] ---

    if (this.mdx) {
      if (state.heroModelUrl && state.heroModelUrl !== this.currentHeroModelUrl) {
        this.currentHeroModelUrl = state.heroModelUrl;
        void this.mdx.switchHeroModel(state.heroModelUrl, state.heroAssetBaseUrl).then(() => {
          this.sequences.set(this.mdx?.sequences || []);
        });
      }
      this.mdx.applyHeroAction({
        x: state.x,
        y: state.y,
        facingRad: state.facingRad,
        sequence: state.sequence,
      });
    }
  }

  /** 等 flex 布局给出真实宽高，避免首帧 0 尺寸建 WebGL 导致黑屏 */
  private async waitForViewport(canvas: HTMLCanvasElement, maxMs = 2500): Promise<void> {
    const t0 = performance.now();
    while (performance.now() - t0 < maxMs) {
      const r = canvas.getBoundingClientRect();
      const p = canvas.parentElement?.getBoundingClientRect();
      const w = Math.max(r.width, p?.width || 0);
      const h = Math.max(r.height, p?.height || 0);
      if (w >= 64 && h >= 64) return;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  }

  private async boot(attempt = 0): Promise<void> {
    // --- AI 修改开始 [BOOT-RETRY]：canvas/布局未就绪时短延迟重试，减少必须点「重新加载」 ---
    const canvas = this.glCanvas()?.nativeElement;
    if (!canvas) {
      if (attempt < 30 && !this.disposed) {
        await new Promise((r) => setTimeout(r, 50));
        return this.boot(attempt + 1);
      }
      this.error.set('视口未就绪');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set('');
    await this.waitForViewport(canvas);

    void this.loadMinimapBuildings();
    void this.loadReplayData();

    try {
      const rect = canvas.getBoundingClientRect();
      const parent = canvas.parentElement?.getBoundingClientRect();
      canvas.width = Math.max(640, Math.floor(Math.max(rect.width, parent?.width || 0)) || 1280);
      canvas.height = Math.max(360, Math.floor(Math.max(rect.height, parent?.height || 0)) || 720);

      const mdx = await Wc3MdxViewer.create({
        canvas,
        viewLayer: this.viewLayer()?.nativeElement,
        modelUrl: '/assets/models/blademaster/HeroBladeMaster.mdxbin',
        assetBaseUrl: '/assets/models/blademaster/',
        teamColor: 0,
        initialSequence: 'Stand',
        syncOverrides: this.syncOverridesFromQuery() as any,
      });
      this.mdx = mdx;
      try {
        await mdx.load();
      } finally {
        this.modelName.set('HeroBladeMaster');
        this.sequences.set(mdx.sequences || []);
        this.buildingCount.set(mdx.buildings?.length || 0);
        this.cameraMode.set(mdx.cameraMode || 'hero');
        this.simOn.set(!!mdx.simEnabled);
        this.simUnits.set(mdx.simUnitCount || 0);
        this.applyReplayFrame(this.currentMs());
        this.syncActiveSequence();
        // --- AI 修改开始 [PORTRAIT-3D]：初始化底部控制台 3D 动态英雄对白肖像渲染 ---
        const pCanvas = this.portraitCanvas()?.nativeElement;
        if (pCanvas) {
          void mdx.attachPortraitCanvas(pCanvas);
        }
        // --- AI 修改结束 [PORTRAIT-3D]：初始化底部控制台 3D 动态英雄对白肖像渲染 ---
        // 布局可能在 load 结束后才稳定，连续两帧强制 resize
        mdx.resizeToContainer();
        requestAnimationFrame(() => {
          mdx.resizeToContainer();
          requestAnimationFrame(() => mdx.resizeToContainer());
        });
        this.pollSequence();
        this.loading.set(false);
      }
      if (this.disposed) {
        mdx.dispose();
        return;
      }
    } catch (e) {
      console.error(e);
      const msg =
        e instanceof Error
          ? e.message || e.name || String(e)
          : typeof e === 'string'
            ? e
            : JSON.stringify(e);
      this.error.set(msg || '未知错误');
      this.loading.set(false);
      // 偶发 WebGL 首启失败：自动再试一次
      if (attempt < 1 && !this.disposed) {
        this.mdx?.dispose();
        this.mdx = undefined;
        await new Promise((r) => setTimeout(r, 200));
        return this.boot(attempt + 1);
      }
    }
    // --- AI 修改结束 [BOOT-RETRY] ---
  }

  private syncActiveSequence(): void {
    const id = this.mdx?.currentSequence() ?? -1;
    this.activeSequence.set(id);
    const name = this.sequences().find((s) => s.index === id)?.name || '';
    this.activeSequenceName.set(name);
  }

  private pollSequence(): void {
    this.lastTickTime = performance.now();
    const tick = () => {
      if (this.disposed) return;
      const now = performance.now();
      const dt = Math.min(100, Math.max(0, now - this.lastTickTime));
      this.lastTickTime = now;

      if (this.isPlaying() && this.timeline) {
        const nextMs = this.currentMs() + dt * this.playSpeed();
        if (nextMs >= this.durationMs()) {
          this.currentMs.set(this.durationMs());
          this.isPlaying.set(false);
        } else {
          this.currentMs.set(nextMs);
        }
        this.applyReplayFrame(this.currentMs());
      }

      this.syncActiveSequence();
      // --- AI 修改开始 [SCENE-SIM-DOTA]：同步回放倍速与暂停状态至 3D 兵线/野怪/神符模拟器 ---
      // --- AI 修改开始 [SCENE-SIM-ALWAYS]：回放暂停时仍以 1x 推进兵线/野怪模拟，便于验收攻击与掉血 ---
      this.mdx?.setSimSpeed(this.isPlaying() ? this.playSpeed() : 1);
      // --- AI 修改结束 [SCENE-SIM-ALWAYS] ---
      // --- AI 修改结束 [SCENE-SIM-DOTA]：同步回放倍速与暂停状态至 3D 兵线/野怪/神符模拟器 ---
      this.cameraMode.set(this.mdx?.cameraMode || this.cameraMode());
      this.simUnits.set(this.mdx?.simUnitCount || 0);
      this.updateMinimapMarker();

      // --- AI 修改开始 [COMBAT-GOLD-SIM]：每帧将 3D 战场战斗单位血条与飘金跳字投影至视口屏幕，并同步金钱统计 ---
      if (this.mdx) {
        if (this.showHealthBars()) {
          const rawEntities = this.mdx.getSimHealthEntities();
          const bars: { id: string; sx: number; sy: number; hpPct: number; color: string; isHero?: boolean; isTower?: boolean; name?: string }[] = [];
          for (const ent of rawEntities) {
            const screen = this.mdx.projectWorldToScreen(ent.x, ent.y, ent.z);
            if (screen) {
              const color = ent.team === 0 ? '#22c55e' : ent.team === 1 ? '#ef4444' : '#f59e0b';
              bars.push({
                id: ent.id,
                sx: screen.sx,
                sy: screen.sy,
                hpPct: Math.min(100, Math.max(0, (ent.hp / Math.max(1, ent.maxHp)) * 100)),
                color,
                isHero: ent.kind === 'hero',
                isTower: ent.kind === 'tower',
                name: ent.name,
              });
            }
          }
          this.overheadHpBars.set(bars);
        } else if (this.overheadHpBars().length) {
          this.overheadHpBars.set([]);
        }

        const rawFts = this.mdx.getSimFloatingTexts();
        const fts: { id: number; sx: number; sy: number; text: string; color: string; opacity: number }[] = [];
        for (const ft of rawFts) {
          const screen = this.mdx.projectWorldToScreen(ft.x, ft.y, ft.z);
          if (screen) {
            fts.push({
              id: ft.id,
              sx: screen.sx,
              sy: screen.sy,
              text: ft.text,
              color: ft.color,
              opacity: 0.95,
            });
          }
        }
        this.activeFloatingTexts.set(fts);
        this.gold.set(this.mdx.getSimGoldTotal());
      }
      // --- AI 修改结束 [COMBAT-GOLD-SIM] ---

      this.seqPoll = requestAnimationFrame(tick);
    };
    this.seqPoll = requestAnimationFrame(tick);
  }
}
