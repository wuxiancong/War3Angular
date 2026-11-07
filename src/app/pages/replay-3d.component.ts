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
        width: 100%;
        height: 36px;
        position: relative;
        z-index: 25;
        flex-shrink: 0;
      }
      .wc3-topbar-bg {
        position: absolute;
        left: 0;
        right: 0;
        top: 0;
        height: 68px;
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
      .wc3-console {
        width: 100%;
        aspect-ratio: 1600 / 342;
        background: url('/assets/wc3/ui/console-assembled.png') center / 100% 100% no-repeat;
        position: relative;
        z-index: 20;
        flex-shrink: 0;
        pointer-events: auto;
      }
        pointer-events: auto;
      }
      /* --- AI 修改开始 [WC3-CONSOLE-OVERLAP]：将底部控制台绝对定位于 3D 视口底部，使透明镂空上沿透出 3D 画面，彻底消除上方黑条 --- */
      .wc3-console {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        /* --- AI 修改开始 [CONSOLE-HEIGHT]：略降控制台高度（约 7%），避免遮挡过多 3D 视口 --- */
        aspect-ratio: 1600 / 318;
        /* --- AI 修改结束 [CONSOLE-HEIGHT] --- */
        background: url('/assets/wc3/ui/console-assembled.png') center / 100% 100% no-repeat;
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
        background: radial-gradient(circle at 35% 25%, #4a3a22, #120c08 72%);
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
      .wc3-xp-bar {
        position: relative;
        width: 100%;
        height: 12px;
        margin-top: 3px;
        background: #090705;
        overflow: hidden;
        border-radius: 1px;
      }
      .wc3-xp-bar > i {
        position: absolute;
        inset: 1px auto 1px 1px;
        background: url('/assets/wc3/ui/bar-xp-fill.png') left center / 100% 100% repeat-x;
        filter: hue-rotate(245deg) saturate(1.55) brightness(0.95);
      }
      .wc3-xp-bar::after {
        content: '';
        position: absolute;
        inset: 0;
        background: url('/assets/wc3/ui/bar-xp-border.png') center / 100% 100% no-repeat;
        pointer-events: none;
      }
      .wc3-xp-bar > span {
        position: absolute;
        inset: 0;
        z-index: 2;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: clamp(8px, 0.72vw, 11px);
        font-weight: 800;
        color: #f5e6c4;
        text-shadow: 0 1px 2px #000, 0 0 3px #000;
        line-height: 1;
      }
      .wc3-hp > i {
        background: linear-gradient(180deg, #6ee06e, #1f7a2a 55%, #0f4a18);
      }
      .wc3-mp > i {
        background: linear-gradient(180deg, #6ab0ff, #1a4a9a 55%, #0a2858);
      }
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
      .wc3-grid-inv {
        grid-template-columns: 1fr 1fr;
        grid-template-rows: 1fr 1fr 1fr;
        gap: 4% 5%;
        padding: 2%;
      }
      .wc3-grid-cmd {
        grid-template-columns: 1fr 1fr 1fr 1fr;
        grid-template-rows: 1fr 1fr 1fr;
        gap: 3.5% 2.8%;
        padding: 1.5%;
      }
      .wc3-slot {
        position: relative;
        border: 0;
        padding: 0;
        background: transparent;
        overflow: hidden;
      }
      .wc3-slot.has-item,
      .wc3-slot.has-cmd {
        background: #0a0a0a;
        box-shadow: inset 0 0 0 1px rgba(210, 175, 95, 0.55);
      }
      .wc3-slot.unlearned .ico {
        filter: grayscale(0.85) brightness(0.48);
      }
      .wc3-slot.active-toggle {
        box-shadow: inset 0 0 0 2px #ff6b2b, 0 0 8px rgba(255, 107, 43, 0.75);
      }
      .wc3-slot .hk {
        position: absolute;
        right: 2px;
        top: 1px;
        font-size: clamp(7px, 0.62vw, 10px);
        font-weight: 900;
        color: #ffe08a;
        text-shadow: 0 1px 2px #000, 0 0 3px #000;
        background: rgba(0, 0, 0, 0.55);
        padding: 0 2px;
        border-radius: 2px;
      }
      .wc3-slot .lv {
        position: absolute;
        left: 2px;
        bottom: 1px;
        font-size: clamp(7px, 0.62vw, 10px);
        font-weight: 900;
        color: #b8ff7a;
        text-shadow: 0 1px 2px #000, 0 0 3px #000;
        background: rgba(0, 0, 0, 0.65);
        padding: 0 3px;
        border-radius: 2px;
      }
      .wc3-slot .ico {
        width: 100%;
        height: 100%;
        object-fit: cover;
        pointer-events: none;
        display: block;
      }
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
        <div class="relative flex-grow min-h-[580px] bg-[#05080c] flex flex-col overflow-hidden">
            </div>
          </div>
          <!-- --- AI 修改结束 [WC3-TOPBAR-AUTHENTIC]：还原魔兽争霸3左上四联菜单按钮（地图信息F9/菜单F10/盟友F11/聊天F12）、中央时间分秒及右侧四格资源框 --- -->

          <!-- 3D WebGL 全屏视口（底部控制台与顶部栏直接叠在视口上，消除控制台上方黑条） -->
          <div class="absolute inset-0">
            <!-- --- AI 修改开始 [FIRST-LOAD-WEBGL]：无固有 width/height，避免首屏按 1280×720 建 GL 后再被 flex 拉扯丢上下文；epoch 用于重载时换新画布 --- -->
            @if (glSurfaceEpoch() > 0) {
              <canvas #glCanvas
                      class="absolute inset-0 w-full h-full block z-[1] pointer-events-auto bg-[#05080c]"></canvas>
            }
            <div #viewLayer
                 class="absolute inset-0 z-0 pointer-events-auto bg-transparent cursor-grab active:cursor-grabbing"></div>
            <!-- --- AI 修改结束 [FIRST-LOAD-WEBGL] --- -->
                <span class="inline-block w-2 h-2 rounded-full" [ngClass]="isMoving() ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'"></span>
                <span>坐标 ({{ heroPos().x }}, {{ heroPos().y }})</span>
                <span class="text-amber-300">· {{ activeSequenceName() || 'Stand' }}</span>
              </div>
              @for (ev of recentEvents().slice(-3); track ev.timeMs + ev.text) {
                <div class="px-2 py-0.5 rounded bg-black/65 text-[10px] text-white/90 border-l-2 border-amber-400">
                  <span class="font-mono text-amber-300 mr-1">[{{ ev.timeText }}]</span>{{ ev.text }}
                </div>
              }
            </div>
            @if (loading()) {
              <div class="absolute top-3 right-3 z-10 pointer-events-none">
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

                @for (u of minimapSimUnits(); track $index) {
                  <span
                    style="position:absolute;width:3px;height:3px;transform:translate(-50%,-50%);pointer-events:none;z-index:3;box-shadow:0 0 1px #000"
                    [style.left.%]="u.px"
                    [style.top.%]="u.py"
                    [style.background]="mmAllyColorMode() ? u.color : (u.team === 0 ? '#60a5fa' : u.team === 1 ? '#f43f5e' : '#fbbf24')"
                  ></span>
                }

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

                <img
                  src="/assets/wc3/ui/mm-icon-hero.png"
                  alt=""
                  style="position:absolute;width:14px;height:14px;transform:translate(-50%,-50%);pointer-events:none;z-index:6;filter:drop-shadow(0 0 4px #ffe14a)"
                  [style.left.%]="minimapHeroPct().x"
                  [style.top.%]="minimapHeroPct().y"
                />

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

                <span class="wc3-cam"
                      [style.left.%]="minimapCamPct().x"
                      [style.top.%]="minimapCamPct().y"></span>
              </button>

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

              <div class="wc3-abs wc3-info"
                   [style.left.%]="cf.info.l" [style.top.%]="cf.info.t"
                   [style.width.%]="cf.info.w" [style.height.%]="cf.info.h">
                <div>
                  <div class="name">{{ heroNameCn() }}</div>
                  <div class="wc3-xp-bar" [title]="'等级 ' + heroLevel() + ' · 经验进度 ' + xpPercent() + '%'">
                    <i [style.width.%]="xpPercent()"></i>
                    <span>等级 {{ heroLevel() }} · {{ heroTitle() }}</span>
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-x-4 gap-y-1 my-auto pt-1">
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
                </div>
              </div>

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

              <div class="wc3-abs"
                   [style.left.%]="cf.cmd.l" [style.top.%]="cf.cmd.t"
                   [style.width.%]="cf.cmd.w" [style.height.%]="cf.cmd.h">
                <div class="wc3-grid wc3-grid-cmd">
                  @for (sk of commandSlots(); track sk.id) {
                    <button type="button"
                            class="wc3-slot"
                            [class.has-cmd]="!!sk.icon"
                            [class.unlearned]="!!sk.unlearned"
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

              <div class="wc3-abs"
                   [style.left.%]="cf.cmd.l" [style.top.%]="cf.cmd.t"
                   [style.width.%]="cf.cmd.w" [style.height.%]="cf.cmd.h">
                <div class="wc3-grid wc3-grid-cmd">
                  @for (sk of commandSlots(); track sk.id) {
                    <button type="button"
                            class="wc3-slot"
                            [class.has-cmd]="!!sk.icon"
                            [class.unlearned]="!!sk.unlearned"
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
  readonly minimapRunes = signal<{ id: string; px: number; py: number; name: string; color: string }[]>([]);
  readonly showHealthBars = signal(true);
  readonly overheadHpBars = signal<{ id: string; sx: number; sy: number; hpPct: number; color: string; isHero?: boolean; isTower?: boolean; name?: string }[]>([]);
  readonly activeFloatingTexts = signal<{ id: number; sx: number; sy: number; text: string; color: string; opacity: number }[]>([]);
  readonly currentHeroKey = signal<'pa' | 'blademaster' | 'antimage' | 'sniper' | 'tauren' | 'paladin' | 'lich'>('blademaster');

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
  readonly recentEvents = signal<ReplayEventLogItem[]>([]);

  readonly itemSlots = signal<ReplayInventorySlot[]>([
    { slot: 0, hotkey: 'Num7', code: '', name: '', icon: '', charges: 0 },
    { slot: 1, hotkey: 'Num8', code: '', name: '', icon: '', charges: 0 },
    { slot: 2, hotkey: 'Num4', code: '', name: '', icon: '', charges: 0 },
    { slot: 3, hotkey: 'Num5', code: '', name: '', icon: '', charges: 0 },
    { slot: 4, hotkey: 'Num1', code: '', name: '', icon: '', charges: 0 },
    { slot: 5, hotkey: 'Num2', code: '', name: '', icon: '', charges: 0 },
  ]);

  readonly commandSlots = signal<CommandCardSlot[]>([
    { id: 'move', hotkey: 'M', name: '移动', level: 0, icon: '/assets/dota/cmdIcons/BTNMove.png' },
    { id: 'stop', hotkey: 'S', name: '停止', level: 0, icon: '/assets/dota/cmdIcons/BTNStop.png' },
    { id: 'hold', hotkey: 'H', name: '保持原位', level: 0, icon: '/assets/dota/cmdIcons/BTNHoldPosition.png' },
    { id: 'attack', hotkey: 'A', name: '攻击', level: 0, icon: '/assets/dota/cmdIcons/BTNAttack.png' },
    { id: 'patrol', hotkey: 'P', name: '巡逻', level: 0, icon: '/assets/dota/cmdIcons/BTNPatrol.png' },
    { id: 'empty1', hotkey: '', name: '', level: 0, icon: '' },
    { id: 'statup', hotkey: 'U', name: '属性附加', level: 0, icon: '/assets/dota/cmdIcons/BTNStatUp.png' },
    { id: 'learn', hotkey: 'O', name: '学习技能', level: 1, icon: '/assets/dota/cmdIcons/BTNSkillz.png' },
    { id: 'sk1', hotkey: 'F', name: '剑刃风暴', level: 0, icon: '/assets/dota/abilityIcons/A05G.png', unlearned: true },
    { id: 'sk2', hotkey: 'G', name: '治疗守卫', level: 0, icon: '/assets/dota/abilityIcons/A047.png', unlearned: true },
    { id: 'sk3', hotkey: 'C', name: '剑舞', level: 0, icon: '/assets/dota/abilityIcons/A00K.png', unlearned: true },
    { id: 'sk4', hotkey: 'E', name: '无敌斩', level: 0, icon: '/assets/dota/abilityIcons/A0M1.png', unlearned: true },
  ]);

  private timeline?: ReplayTimelineEngine;
  private lastTickTime = 0;
  private currentHeroModelUrl = '/assets/models/blademaster/HeroBladeMaster.mdxbin';
  // --- AI 修改结束 [REPLAY-SYNC-UI]：录像播放控制与实时英雄状态信号 ---

  private mdx?: Wc3MdxViewer;
  private seqPoll = 0;
  private disposed = false;
  private bootGen = 0;
  private viewportRo?: ResizeObserver;
  private readonly minimapSize = 176;
  /** 递增以销毁并重建 WebGL 画布，避免旧上下文残留导致 getContext 返回 null。 */
  readonly glSurfaceEpoch = signal(1);

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
    this.bootGen++;
    this.viewportRo?.disconnect();
    this.viewportRo = undefined;
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
    void this.remountAndBoot();
  }

  /** 销毁 viewer + 换新 canvas，再启动，保证 WebGL 上下文可重新创建。 */
  private async remountAndBoot(): Promise<void> {
    this.bootGen++;
    this.viewportRo?.disconnect();
    this.viewportRo = undefined;
    if (typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.seqPoll);
    }
    this.seqPoll = 0;
    this.mdx?.dispose();
    this.mdx = undefined;
    // 先卸下旧画布，释放/丢弃失效的 WebGL 上下文
    this.glSurfaceEpoch.set(0);
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    if (this.disposed) return;
    this.glSurfaceEpoch.update((n) => n + 1);
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    if (this.disposed) return;
    await this.boot();
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

  // --- AI 修改结束 [SCENE-SIM-DOTA]：支持一键跳转镜头至商店、神秘商店、上下河道神符点与肉山巢穴，以及顶部菜单与小地图信号 ---
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
      // --- AI 修改开始 [PA-COMMAND-SLOTS]：修复回退后 skillSlots 不存在的编译错误，改为更新 commandSlots ---
      this.commandSlots.set([
        { id: 'move', hotkey: 'M', name: '移动', level: 0, icon: '/assets/dota/cmdIcons/BTNMove.png' },
        { id: 'stop', hotkey: 'S', name: '停止', level: 0, icon: '/assets/dota/cmdIcons/BTNStop.png' },
        { id: 'hold', hotkey: 'H', name: '保持原位', level: 0, icon: '/assets/dota/cmdIcons/BTNHoldPosition.png' },
        { id: 'attack', hotkey: 'A', name: '攻击', level: 0, icon: '/assets/dota/cmdIcons/BTNAttack.png' },
        { id: 'patrol', hotkey: 'P', name: '巡逻', level: 0, icon: '/assets/dota/cmdIcons/BTNPatrol.png' },
        { id: 'empty1', hotkey: '', name: '', level: 0, icon: '' },
        { id: 'statup', hotkey: 'U', name: '属性附加', level: 0, icon: '/assets/dota/cmdIcons/BTNStatUp.png' },
        { id: 'learn', hotkey: 'O', name: '学习技能', level: 1, icon: '/assets/dota/cmdIcons/BTNSkillz.png' },
        { id: 'A001', hotkey: 'D', name: '窒息之刃', level: 1, maxLevel: 4, icon: '/assets/wc3/ui/icons/BTNHeroWarden.png' },
        { id: 'A002', hotkey: 'B', name: '幻影突袭', level: 1, maxLevel: 4, icon: '/assets/wc3/ui/icons/BTNBlink.png' },
        { id: 'A003', hotkey: 'R', name: '模糊', level: 1, maxLevel: 4, icon: '/assets/wc3/ui/icons/BTNBlur.png' },
        { id: 'A004', hotkey: 'C', name: '恩赐解脱', level: 1, maxLevel: 3, icon: '/assets/wc3/ui/icons/BTNCrit.png' },
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
          id: r.spotId ?? r.id,
          px: Math.max(0, Math.min(100, rp.px)),
          py: Math.max(0, Math.min(100, rp.py)),
          name: r.spotName ? `${r.spotName}：${r.nameCn}` : r.name,
          color: runeColors[r.kind] || '#38bdf8',

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
    this.commandSlots.set([
      { id: 'move', hotkey: 'M', name: '移动', level: 0, icon: '/assets/dota/cmdIcons/BTNMove.png' },
      { id: 'stop', hotkey: 'S', name: '停止', level: 0, icon: '/assets/dota/cmdIcons/BTNStop.png' },
      { id: 'hold', hotkey: 'H', name: '保持原位', level: 0, icon: '/assets/dota/cmdIcons/BTNHoldPosition.png' },
      { id: 'attack', hotkey: 'A', name: '攻击', level: 0, icon: '/assets/dota/cmdIcons/BTNAttack.png' },
      { id: 'patrol', hotkey: 'P', name: '巡逻', level: 0, icon: '/assets/dota/cmdIcons/BTNPatrol.png' },
      { id: 'empty1', hotkey: '', name: '', level: 0, icon: '' },
      {
        id: 'statup',
        hotkey: 'U',
        name: '属性附加',
        level: state.attrBonusLevel,
        icon: '/assets/dota/cmdIcons/BTNStatUp.png',
        unlearned: state.attrBonusLevel === 0,
      },
      {
        id: 'learn',
        hotkey: 'O',
        name: `学习技能（剩余 ${state.unspentSkillPoints} 点）`,
        level: state.unspentSkillPoints,
        icon: '/assets/dota/cmdIcons/BTNSkillz.png',
        unlearned: state.unspentSkillPoints === 0,
      },
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

  /** 等待画布 CSS 宽高非零且连续多帧稳定，避免按固有尺寸建 GL 后再被 flex 改尺寸丢上下文。 */
  private waitForStableCanvasLayout(
    canvas: HTMLCanvasElement,
    timeoutMs = 12000
  ): Promise<DOMRect> {
    const read = () => canvas.getBoundingClientRect();
    const ready = (r: DOMRect) => r.width >= 64 && r.height >= 64;
    const waitGen = this.bootGen;
    const needStable = 3;
    return new Promise((resolve) => {
      let finished = false;
      let stableCount = 0;
      let lastW = -1;
      let lastH = -1;
      const ro = new ResizeObserver(() => sample());
      const cleanup = () => {
        ro.disconnect();
        if (this.viewportRo === ro) this.viewportRo = undefined;
        clearTimeout(timer);
      };
      const finish = (rect: DOMRect) => {
        if (finished) return;
        finished = true;
        cleanup();
        resolve(rect);
      };
      const sample = () => {
        if (waitGen !== this.bootGen) {
          finish(read());
          return;
        }
        const r = read();
        if (!ready(r)) {
          stableCount = 0;
          lastW = -1;
          lastH = -1;
          return;
        }
        const w = Math.round(r.width);
        const h = Math.round(r.height);
        if (w === lastW && h === lastH) {
          stableCount++;
        } else {
          stableCount = 1;
          lastW = w;
          lastH = h;
        }
        if (stableCount >= needStable) finish(r);
      };
      this.viewportRo?.disconnect();
      this.viewportRo = ro;
      ro.observe(canvas);
      const parent = canvas.parentElement;
      if (parent) ro.observe(parent);
      const timer = setTimeout(() => finish(read()), timeoutMs);
      const tick = () => {
        if (finished || waitGen !== this.bootGen) return;
        sample();
        if (!finished) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  private attachViewportResizeWatch(canvas: HTMLCanvasElement, gen: number): void {
    this.viewportRo?.disconnect();
    this.viewportRo = new ResizeObserver(() => {
      if (this.disposed || gen !== this.bootGen) return;
      this.mdx?.forceResize();
    });
    this.viewportRo.observe(canvas);
    const parent = canvas.parentElement;
    if (parent) this.viewportRo.observe(parent);
  }
  private async boot(): Promise<void> {
    // --- AI 修改开始 [FIRST-LOAD-WEBGL]：布局尺寸稳定后再创建 WebGL；bootGen 丢弃过期启动 ---
    const gen = ++this.bootGen;
    // 等 Angular 把 @if 画布挂上
    for (let i = 0; i < 30 && !this.glCanvas()?.nativeElement; i++) {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (this.disposed || gen !== this.bootGen) return;
    }
    const canvas = this.glCanvas()?.nativeElement;
    if (!canvas) {
      this.error.set('视口未就绪');
      this.loading.set(false);
      return;
    }

    void this.loadMinimapBuildings();
    void this.loadReplayData();

    try {
      await this.waitForStableCanvasLayout(canvas);
      if (this.disposed || gen !== this.bootGen) return;

      const rect = canvas.getBoundingClientRect();
      const cssW = Math.max(1, Math.floor(rect.width));
      const cssH = Math.max(1, Math.floor(rect.height));
      if (cssW < 64 || cssH < 64) {
        throw new Error(`视口尺寸无效 (${cssW}×${cssH})，请重试`);
      }
      const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
      // 建上下文前一次性对齐缓冲尺寸；之后同尺寸 forceResize 为 no-op，避免无谓重置 GL
      canvas.width = Math.max(64, Math.floor(cssW * dpr));
      canvas.height = Math.max(64, Math.floor(cssH * dpr));

      const mdx = await Wc3MdxViewer.create({
        canvas,
        viewLayer: canvas,
        modelUrl: '/assets/models/blademaster/HeroBladeMaster.mdxbin',
        assetBaseUrl: '/assets/models/blademaster/',
        teamColor: 0,
        initialSequence: 'Stand',
        syncOverrides: this.syncOverridesFromQuery() as any,
      });
      if (this.disposed || gen !== this.bootGen) {
        mdx.dispose();
        return;
      }
      this.mdx = mdx;
      this.attachViewportResizeWatch(canvas, gen);
      try {
        await mdx.load();
      } finally {
        if (this.disposed || gen !== this.bootGen) {
          mdx.dispose();
          if (this.mdx === mdx) this.mdx = undefined;
          return;
        }
        mdx.forceResize();
        this.modelName.set('HeroBladeMaster');
        this.sequences.set(mdx.sequences || []);
        this.buildingCount.set(mdx.buildings?.length || 0);
        this.cameraMode.set(mdx.cameraMode || 'hero');
        this.simOn.set(!!mdx.simEnabled);
        this.simUnits.set(mdx.simUnitCount || 0);
        this.applyReplayFrame(this.currentMs());
        this.syncActiveSequence();
        const pCanvas = this.portraitCanvas()?.nativeElement;
        if (pCanvas) {
          void mdx.attachPortraitCanvas(pCanvas);
        }
        requestAnimationFrame(() => {
          if (!this.disposed && gen === this.bootGen) this.mdx?.forceResize();
        });
        this.pollSequence();
        this.loading.set(false);
      }
    } catch (e) {
      if (gen !== this.bootGen) return;
      console.error(e);
      const msg =
        e instanceof Error
          ? e.message || e.name || String(e)
          : typeof e === 'string'
            ? e
            : JSON.stringify(e);
      this.error.set(msg || '未知错误');
      this.loading.set(false);
    }
    // --- AI 修改结束 [FIRST-LOAD-WEBGL]：布局尺寸稳定后再创建 WebGL；bootGen 丢弃过期启动 ---
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
      this.mdx?.setSimSpeed(this.isPlaying() ? this.playSpeed() : 0);
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
