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
      .wc3-abs {
        position: absolute;
        box-sizing: border-box;
      }
      .wc3-mm {
        cursor: crosshair;
        overflow: hidden;
        border: 0;
        padding: 0;
        background: #050805;
      }
      .wc3-mm img {
        width: 100%;
        height: 100%;
        object-fit: fill;
        pointer-events: none;
        display: block;
      }
      .wc3-port {
        overflow: hidden;
        border-radius: 42% 42% 0 0 / 28% 28% 0 0;
        background: radial-gradient(circle at 35% 25%, #4a3a22, #120c08 72%);
      }
      .wc3-bar {
        position: relative;
        overflow: hidden;
        border: 1px solid rgba(0, 0, 0, 0.85);
        background: #0a0806;
      }
      .wc3-bar > i {
        position: absolute;
        inset: 0 auto 0 0;
        display: block;
      }
      .wc3-bar > span {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: clamp(8px, 0.72vw, 11px);
        font-weight: 800;
        color: #fff;
        text-shadow: 0 1px 2px #000, 0 0 3px #000;
        line-height: 1;
      }
      .wc3-hp > i {
        background: linear-gradient(180deg, #6ee06e, #1f7a2a 55%, #0f4a18);
      }
      .wc3-mp > i {
        background: linear-gradient(180deg, #6ab0ff, #1a4a9a 55%, #0a2858);
      }
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
    <main class="flex-grow flex flex-col bg-black text-[var(--text-main)] min-h-[calc(100vh-64px)] select-none">
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
        <button type="button" (click)="showDebug.set(!showDebug())" class="px-2 py-0.5 border border-white/20 rounded">
          {{ showDebug() ? '隐藏事件流' : '事件流/调试' }}
        </button>
      </div>

      <div class="flex flex-col lg:flex-row flex-grow min-h-0">
        <div class="relative flex-grow min-h-[520px] lg:min-h-0 bg-[#05080c] flex flex-col overflow-hidden">
          <!-- 魔兽争霸3 原生顶部资源与时钟栏 -->
          <div class="wc3-topbar">
            <div class="wc3-topbar-bg"></div>
            <div class="wc3-abs flex items-center gap-3 px-[1.2%] h-full z-10 text-[11px] font-bold text-[#f0e0b0]"
                 style="left:0.5%; right:54%; top:0">
              <span class="text-[#7ee787] font-black tracking-wide">DotA v6.83d</span>
              <span class="text-sky-300 flex items-center gap-1">
                <img [src]="heroIcon()" alt="" class="w-4 h-4 rounded-sm border border-amber-400/60" />
                {{ player() || 'wuxiancong' }} ({{ heroNameCn() }})
              </span>
              <span class="text-amber-200 font-mono">
                战绩 <b class="text-emerald-300">{{ kills() }}</b>/<b class="text-rose-400">{{ deaths() }}</b>/<b class="text-sky-300">{{ assists() }}</b>
              </span>
              <span class="text-amber-100/90 font-mono hidden sm:inline">
                正补 <b class="text-amber-300">{{ lastHits() }}</b> · 反补 <b>{{ denies() }}</b> · 野怪 <b>{{ neutrals() }}</b>
              </span>
            </div>

            <!-- 顶部中央日夜圆盘时钟读数 -->
            <div class="wc3-abs flex flex-col items-center justify-center z-20 pointer-events-none"
                 style="left:46%; width:8%; top:2px; height:58px">
              <span class="font-mono text-[11px] font-black text-amber-100 drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] bg-black/65 px-1.5 py-0.2 rounded">
                {{ currentTimeText() }}
              </span>
            </div>

            <div class="wc3-abs flex items-center justify-end gap-5 h-full pr-[1.8%] z-10 pointer-events-none text-[12px] font-bold text-[#f8e8b8]"
                 style="left:55%; right:0.5%; top:0">
              <span class="flex items-center gap-1" title="当前金币">
                <img class="w-4 h-4" src="/assets/wc3/ui/icons/gold.png" alt="金币" />
                <span class="font-mono text-amber-300">{{ gold() }}</span>
              </span>
              <span class="flex items-center gap-1" title="木材">
                <img class="w-4 h-4" src="/assets/wc3/ui/icons/lumber.png" alt="木材" />
                <span class="font-mono text-emerald-300">{{ lumber() }}</span>
              </span>
              <span class="flex items-center gap-1" title="英雄等级 / 上限">
                <img class="w-4 h-4" src="/assets/wc3/ui/icons/supply.png" alt="人口" />
                <span class="font-mono">{{ heroLevel() }} / 25</span>
              </span>
            </div>
          </div>

          <!-- 3D WebGL 渲染视口（直接显示硬件加速画布，#viewLayer 保持透明用于接收鼠标拖拽与滚轮事件） -->
          <div class="relative flex-grow min-h-0">
            <canvas #glCanvas width="1280" height="720"
                    class="absolute inset-0 w-full h-full block z-0 pointer-events-none"></canvas>
            <!-- --- AI 修改开始 [WEBGL-PERF]：移除遮挡 WebGL 画布的纯黑背景 bg-[#05080c]，保持交互层透明 --- -->
            <div #viewLayer
                 class="absolute inset-0 z-[1] pointer-events-auto bg-transparent cursor-grab active:cursor-grabbing"></div>
            <!-- --- AI 修改结束 [WEBGL-PERF]：移除遮挡 WebGL 画布的纯黑背景 bg-[#05080c]，保持交互层透明 --- -->

            <!-- 左上角实时动作指令浮动提示 -->
            <div class="absolute top-8 left-3 z-10 pointer-events-none space-y-1">
              <div class="px-2.5 py-1 rounded bg-black/65 border border-amber-400/30 text-[11px] text-amber-100 font-mono flex items-center gap-2">
                <span class="inline-block w-2 h-2 rounded-full" [ngClass]="isMoving() ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'"></span>
                <span>坐标 ({{ heroPos().x }}, {{ heroPos().y }})</span>
                <span class="text-amber-300">· {{ activeSequenceName() || 'Stand' }}</span>
              </div>
              @for (ev of recentEvents().slice(-3); track ev.timeMs + ev.text) {
                <div class="px-2 py-0.5 rounded bg-black/60 text-[10px] text-white/90 border-l-2 border-amber-400">
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
          </div>

          <!-- 魔兽争霸3 底部控制台 HUD (1600x342) -->
          <div class="wc3-console">
            <!-- 1. 小地图（含建筑点位、兵线野怪点、英雄轨迹、英雄高亮坐标与镜头视野框） -->
            <button type="button" class="wc3-abs wc3-mm" title="点击小地图跳转镜头"
                    [style.left.%]="cf.mm.l" [style.top.%]="cf.mm.t"
                    [style.width.%]="cf.mm.w" [style.height.%]="cf.mm.h"
                    (click)="onMinimapClick($event)">
              <img src="/assets/dota/dota683_minimap.png" alt="minimap" draggable="false" />
              <!-- 防御塔/兵营/遗迹标记 -->
              @for (b of minimapBuildings(); track b.id) {
                <span
                  class="position-absolute pointer-events-none rounded-full"
                  style="position:absolute;transform:translate(-50%,-50%)"
                  [style.left.%]="b.px"
                  [style.top.%]="b.py"
                  [style.width.px]="b.size"
                  [style.height.px]="b.size"
                  [style.background]="b.color"
                ></span>
              }
              <!-- 实时兵线与野怪点 -->
              @for (u of minimapSimUnits(); track $index) {
                <span
                  style="position:absolute;width:3px;height:3px;transform:translate(-50%,-50%);border-radius:999px;pointer-events:none"
                  [style.left.%]="u.px"
                  [style.top.%]="u.py"
                  [style.background]="u.color"
                ></span>
              }
              <!-- --- AI 修改开始 [SCENE-SIM-DOTA]：小地图渲染上下河道神符高亮标记 --- -->
              @for (r of minimapRunes(); track r.id) {
                <span
                  style="position:absolute;width:6px;height:6px;transform:translate(-50%,-50%) rotate(45deg);border:1px solid #fff;box-shadow:0 0 6px #38bdf8;pointer-events:none;z-index:4"
                  [style.left.%]="r.px"
                  [style.top.%]="r.py"
                  [style.background]="r.color"
                  [title]="r.name"
                ></span>
              }
              <!-- --- AI 修改结束 [SCENE-SIM-DOTA]：小地图渲染上下河道神符高亮标记 --- -->
              <!-- 英雄当前位置圆点 -->
              <span class="wc3-hero-dot"
                    [style.left.%]="minimapHeroPct().x"
                    [style.top.%]="minimapHeroPct().y"></span>
              <!-- 当前镜头视野框 -->
              <span class="wc3-cam"
                    [style.left.%]="minimapCamPct().x"
                    [style.top.%]="minimapCamPct().y"></span>
            </button>

            <!-- 2. 英雄头像与等级角标 -->
            <div class="wc3-abs wc3-port"
                 [style.left.%]="cf.port.l" [style.top.%]="cf.port.t"
                 [style.width.%]="cf.port.w" [style.height.%]="cf.port.h">
              <img class="w-full h-full object-cover"
                   [src]="heroIcon()"
                   alt="portrait"
                   draggable="false" />
              <span class="absolute bottom-1 right-1 px-1.5 py-0.2 rounded bg-black/80 border border-amber-400/70 text-[10px] font-black text-amber-300">
                Lv.{{ heroLevel() }}
              </span>
            </div>

            <!-- 3. 生命值与魔法值条 -->
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

            <!-- 4. 中央英雄属性面板 -->
            <div class="wc3-abs wc3-info"
                 [style.left.%]="cf.info.l" [style.top.%]="cf.info.t"
                 [style.width.%]="cf.info.w" [style.height.%]="cf.info.h">
              <div>
                <div class="name">{{ heroNameCn() }}</div>
                <div class="sub">等级 {{ heroLevel() }} · {{ heroTitle() }}</div>
                <!-- 经验条 -->
                <div class="w-full h-1.5 bg-black/80 border border-amber-500/40 rounded-sm overflow-hidden mt-1">
                  <div class="h-full bg-gradient-to-r from-purple-700 via-fuchsia-500 to-amber-300"
                       [style.width.%]="xpPercent()"></div>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-x-3 gap-y-1 my-auto pt-1">
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

                <!-- 力量 / 敏捷 / 智力 -->
                <div class="space-y-0.5">
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

  // --- AI 修改开始 [REPLAY-SYNC-UI]：录像播放控制与实时英雄状态信号 ---
  readonly matchList = signal<ReplayMatchSummary[]>([]);
  readonly selectedFile = signal('');
  readonly isPlaying = signal(true);
  readonly playSpeed = signal(1);
  readonly currentMs = signal(0);
  readonly durationMs = signal(200000);
  readonly currentTimeText = signal('00:00');
  readonly totalTimeText = signal('03:20');

  readonly minimapCamPct = signal({ x: 15, y: 85 });
  readonly minimapHeroPct = signal({ x: 15, y: 85 });
  readonly minimapBuildings = signal<{ id: string; px: number; py: number; size: number; color: string }[]>([]);
  readonly minimapSimUnits = signal<{ px: number; py: number; color: string }[]>([]);
  // --- AI 修改开始 [SCENE-SIM-DOTA]：小地图河道神符实时状态信号 ---
  readonly minimapRunes = signal<{ id: string; px: number; py: number; name: string; color: string }[]>([]);
  // --- AI 修改结束 [SCENE-SIM-DOTA]：小地图河道神符实时状态信号 ---

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

  // --- AI 修改开始 [SCENE-SIM-DOTA]：支持一键跳转镜头至商店、神秘商店、上下河道神符点与肉山巢穴 ---
  jumpToPoint(x: number, y: number): void {
    if (!this.mdx) return;
    this.mdx.panCameraTo(x, y);
    this.cameraMode.set('free');
    this.updateMinimapMarker();
  }
  // --- AI 修改结束 [SCENE-SIM-DOTA]：支持一键跳转镜头至商店、神秘商店、上下河道神符点与肉山巢穴 ---

  toggleSim(): void {
    const next = !this.simOn();
    this.simOn.set(next);
    this.mdx?.setSimEnabled(next);
  }

  onMinimapClick(ev: MouseEvent): void {
    const el = ev.currentTarget as HTMLElement | null;
    if (!el || !this.mdx) return;
    const rect = el.getBoundingClientRect();
    const px = Math.max(0, Math.min(rect.width, ev.clientX - rect.left));
    const py = Math.max(0, Math.min(rect.height, ev.clientY - rect.top));
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
          color: u.team === 0 ? '#34d399' : u.team === 1 ? '#f87171' : '#fbbf24',
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
          id: r.id,
          px: Math.max(0, Math.min(100, rp.px)),
          py: Math.max(0, Math.min(100, rp.py)),
          name: r.name,
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
      const list = (cfg.buildings || []).map((b: DotaBuilding) => {
        const { px, py } = worldToMapPixel(b.x, b.y, cfg.bounds, 100, 100);
        // --- AI 删除开始 [SCENE-SIM-DOTA]：删除仅区分近卫/天灾双色的建筑点着色，原因：商店与能量圈应使用金色/青色与防御塔区分 ---
        // return {
        //   id: b.id,
        //   px,
        //   py,
        //   size: b.kind === 'ancient' || b.kind === 'fountain' ? 6 : 4,
        //   color: b.team === 0 ? '#10b981' : '#ef4444',
        // };
        // --- AI 删除结束 [SCENE-SIM-DOTA] ---
        // --- AI 修改开始 [SCENE-SIM-DOTA]：小地图区分主基地商店/野外商店（金色）、基地遗迹/泉水（高亮大点）与防御塔/兵营 ---
        const isShop = b.kind === 'shop';
        return {
          id: b.id,
          px,
          py,
          size: b.kind === 'ancient' || b.kind === 'fountain' ? 6 : isShop ? 3 : 4,
          color: isShop ? '#facc15' : b.team === 0 ? '#10b981' : '#ef4444',
        };
        // --- AI 修改结束 [SCENE-SIM-DOTA]：小地图区分主基地商店/野外商店（金色）、基地遗迹/泉水（高亮大点）与防御塔/兵营 ---
      });
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
    this.heroNameCn.set(state.heroName);
    this.heroTitle.set(state.heroClassTitle);
    if (state.heroIcon) this.heroIcon.set(state.heroIcon);
    this.heroLevel.set(state.level);
    this.xpPercent.set(state.xpPercent);
    this.heroHp.set(state.hp);
    this.heroHpMax.set(state.maxHp);
    this.heroMp.set(state.mp);
    this.heroMpMax.set(state.maxMp);
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

  private async boot(): Promise<void> {
    const canvas = this.glCanvas()?.nativeElement;
    if (!canvas) {
      this.error.set('视口未就绪');
      this.loading.set(false);
      return;
    }

    void this.loadMinimapBuildings();
    void this.loadReplayData();

    try {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(640, Math.floor(rect.width) || 1280);
      canvas.height = Math.max(360, Math.floor(rect.height) || 720);

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
    }
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
      this.seqPoll = requestAnimationFrame(tick);
    };
    this.seqPoll = requestAnimationFrame(tick);
  }
}
