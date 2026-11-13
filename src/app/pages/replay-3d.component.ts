import {
  Component,
  ElementRef,
  PLATFORM_ID,
  afterNextRender,
  inject,
  signal,
  viewChild,
  computed,
  OnDestroy,
} from '@angular/core';
import { isPlatformBrowser, NgClass } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { B, NUI, U, W3_LAYOUT } from '../game/w3-hud';
import { FOG_ALPHA, VisionGrid, type VisionSource } from '../game/fog';
import {
  BAR_Z,
  PLAYER_COLORS,
  TEAM_HP,
  drawFloatText,
  drawGroundCircle,
  drawMinimap,
  drawUnitBar,
  prepareOverlay,
  readableColor,
  type MinimapScene,
  nightAmount,
  skyPosition,
  timeOfDay,
} from '../game/overlay-draw';
import { Wc3MdxViewer, type Wc3SequenceInfo } from '../replay3d/wc3-mdx-viewer';
import {
  DOTA_MAP_BOUNDS,
  DEFAULT_DOTA_MAP_URL,
  loadDotaMapConfig,
  mapPixelToWorld,
  worldToMapPixel,
  type DotaBuilding,
} from '../replay3d/dota-map';
// 引入 wuxiancong 录像时间轴引擎与数据结构
import {
  ReplayTimelineEngine,
  formatMsClock,
  type ReplayEventLogItem,
  type ReplayInventorySlot,
  type ReplayMatchPayload,
  type ReplayMatchSummary,
} from '../replay3d/replay-timeline';
import {
  DOTA_HERO_ROSTER,
  getHeroByCode,
  getHeroByKey,
  type DotaHeroRosterEntry,
} from '../replay3d/dota-hero-roster';


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
  imports: [NgClass],
  host: { class: 'flex flex-col flex-grow' },
  styleUrl: '../game/w3-hud.css',
  styles: [
    `
      .wc3-root {
        cursor: url('/assets/wc3/ui/cursor-human-pointer.png') 2 2, auto;
      }
      .wc3-root button,
      .wc3-root a,
      .wc3-root select,
      .wc3-root input[type='range'] {
        cursor: url('/assets/wc3/ui/cursor-human-active.png') 2 2, pointer;
      }
      .replay-toolbar {
        background: #080c12;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        top: var(--app-header-height, 4.5rem);
        margin-top: 0;
      }
      .replay-toolbar .rt-collapse-btn {
        pointer-events: auto;
        display: inline-flex;
        align-items: center;
        gap: 0.15rem;
        padding: 0.25rem 0.55rem;
        border-radius: 0.4rem;
        border: 1px solid rgba(212, 175, 55, 0.4);
        background: rgba(12, 16, 24, 0.92);
        color: #f0e0b0;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
      }
      .replay-toolbar .rt-collapse-btn:hover {
        border-color: rgba(240, 192, 96, 0.75);
        color: #e0b84a;
      }
      .replay-toolbar input[type='range'] {
        min-width: 0;
      }
      /* 工具条下拉：结构对齐语言选择，配色跟随回放页黑金主题（不吃站点红/浅色变量）*/
      .replay-toolbar .rt-dd {
        position: relative;
        display: flex;
        min-width: 0;
        --rt-dd-bg: #0c1018;
        --rt-dd-bg-elevated: #101622;
        --rt-dd-border: rgba(212, 175, 55, 0.38);
        --rt-dd-border-hot: rgba(240, 192, 96, 0.72);
        --rt-dd-text: #f0e0b0;
        --rt-dd-muted: #a89870;
        --rt-dd-accent: #e0b84a;
        --rt-dd-hover: rgba(212, 175, 55, 0.12);
      }
      .replay-toolbar .rt-dd-fill {
        flex: 1 1 auto;
      }
      .replay-toolbar .rt-dd-sm {
        width: 4.75rem;
        flex: 0 0 auto;
      }
      .replay-toolbar .rt-dd-md {
        min-width: 7.5rem;
        flex: 1 1 7.5rem;
      }
      .replay-toolbar .rt-dd-lg {
        min-width: 10rem;
        flex: 1 1 10rem;
      }
      @media (min-width: 640px) {
        .replay-toolbar .rt-dd-md {
          flex: 0 1 auto;
          max-width: 11rem;
        }
        .replay-toolbar .rt-dd-lg {
          flex: 0 1 auto;
          max-width: 16rem;
        }
      }
      .replay-toolbar .rt-dd-trigger {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 0.35rem;
        min-height: 30px;
        padding: 0.3rem 0.55rem;
        border-radius: 0.5rem;
        border: 1px solid var(--rt-dd-border);
        background: var(--rt-dd-bg) !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        cursor: pointer;
        transition: all 0.15s ease;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03), 0 4px 12px rgba(0, 0, 0, 0.35);
      }
      .replay-toolbar .rt-dd-trigger:hover {
        border-color: var(--rt-dd-border-hot);
        background: var(--rt-dd-bg-elevated) !important;
      }
      .replay-toolbar .rt-dd-trigger.open {
        border-color: var(--rt-dd-border-hot);
      }
      .replay-toolbar .rt-dd-label {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        text-align: left;
        font-size: 11px;
        font-weight: 600;
        color: var(--rt-dd-text);
      }
      .replay-toolbar .rt-dd-trigger .material-icons {
        color: var(--rt-dd-accent);
      }
      .replay-toolbar .rt-dd-panel {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        min-width: 100%;
        max-height: min(360px, 55vh);
        overflow-y: auto;
        border-radius: 0.5rem;
        padding: 0.4rem 0;
        z-index: 80;
        border: 1px solid var(--rt-dd-border) !important;
        background: var(--rt-dd-bg) !important;
        backdrop-filter: blur(18px) saturate(140%) !important;
        -webkit-backdrop-filter: blur(18px) saturate(140%) !important;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.65) !important;
        transition: opacity 0.15s ease, transform 0.15s ease;
      }
      .replay-toolbar .rt-dd-panel.wide {
        min-width: min(22rem, 92vw);
      }
      .replay-toolbar .rt-dd-panel::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }
      .replay-toolbar .rt-dd-panel::-webkit-scrollbar-track {
        background: transparent;
      }
      .replay-toolbar .rt-dd-panel::-webkit-scrollbar-thumb {
        background: rgba(212, 175, 55, 0.35);
        border-radius: 10px;
      }
      .replay-toolbar .rt-dd-panel::-webkit-scrollbar-thumb:hover {
        background: var(--rt-dd-accent);
      }
      .replay-toolbar .rt-dd-item {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.45rem 0.85rem;
        text-align: left;
        border: 0;
        background: transparent;
        color: var(--rt-dd-muted);
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.12s ease, color 0.12s ease;
      }
      .replay-toolbar .rt-dd-item:hover {
        background: var(--rt-dd-hover);
        color: var(--rt-dd-accent);
      }
      .replay-toolbar .rt-dd-item.active {
        color: var(--rt-dd-accent);
      }
      .replay-toolbar .rt-dd-item .material-icons {
        color: var(--rt-dd-accent);
      }
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
    <main class="wc3-root flex-grow flex flex-col bg-black text-[var(--text-main)] h-[calc(100vh-var(--app-header-height,4.5rem))] min-h-[560px] select-none">
      <!-- 录像工具栏：默认隐藏，与对战页同样整屏都是游戏画面；在 菜单 (F10) 里打开 -->
      @if (!toolbarCollapsed()) {
      <div class="replay-toolbar sticky z-30 shrink-0 text-[11px] px-2 sm:px-3 py-2 flex flex-col gap-1.5">
        <!-- 第1行：隐藏 + 标题 + 录像 -->
        <div class="flex items-center gap-2 min-w-0">
          <button
            type="button"
            class="rt-collapse-btn shrink-0"
            (click)="setToolbarCollapsed(true)"
            title="隐藏工具栏"
          >
            <span class="material-icons text-[16px]">visibility_off</span>
            隐藏
          </button>
          <span class="hidden md:inline text-accent font-black italic uppercase tracking-tight shrink-0">
            DotA 6.83d 3D 录像回放
          </span>
          <span class="md:hidden text-accent font-black italic shrink-0">3D 回放</span>
          <div class="rt-dd rt-dd-fill" data-rt-dd="match">
            <button
              type="button"
              class="rt-dd-trigger"
              [class.open]="toolbarMenu() === 'match'"
              (click)="toggleToolbarMenu('match')"
              title="切换录像文件"
            >
              <span class="rt-dd-label">{{ matchMenuLabel() }}</span>
              <span class="material-icons text-[14px] opacity-50 transition-transform" [class.rotate-180]="toolbarMenu() === 'match'">expand_more</span>
            </button>
            @if (toolbarMenu() === 'match') {
              <div class="rt-dd-panel wide">
                @for (m of matchList(); track m.fileName) {
                  <button
                    type="button"
                    class="rt-dd-item"
                    [class.active]="selectedFile() === m.fileName"
                    (click)="pickMatchFile(m.fileName)"
                  >
                    <span class="truncate">{{ m.heroName }} · {{ m.matchId }} ({{ formatDuration(m.durationMs) }} / {{ m.moveActions }})</span>
                    @if (selectedFile() === m.fileName) {
                      <span class="material-icons text-accent text-sm ml-auto shrink-0">check</span>
                    }
                  </button>
                }
              </div>
            }
          </div>
        </div>

        <!-- 第2行：播放 + 进度 + 倍速 -->
        <div class="flex items-center gap-2 min-w-0 w-full">
          <button
            type="button"
            (click)="togglePlay()"
            class="px-2.5 py-1 rounded font-bold border border-amber-400/60 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 shrink-0"
          >
            {{ isPlaying() ? '暂停' : '播放' }}
          </button>
          <span class="font-mono text-[10px] text-amber-300 w-11 sm:w-12 shrink-0 text-right tabular-nums">{{ currentTimeText() }}</span>
          <input
            type="range"
            min="0"
            [max]="durationMs()"
            [value]="currentMs()"
            (input)="onScrub(+$any($event.target).value)"
            class="flex-1 min-w-0 accent-amber-400 cursor-pointer h-1.5"
          />
          <span class="font-mono text-[10px] text-white/60 w-11 sm:w-12 shrink-0 tabular-nums">{{ totalTimeText() }}</span>
          <div class="rt-dd rt-dd-sm" data-rt-dd="speed">
            <button
              type="button"
              class="rt-dd-trigger"
              [class.open]="toolbarMenu() === 'speed'"
              (click)="toggleToolbarMenu('speed')"
              title="播放倍速"
            >
              <span class="rt-dd-label font-mono">{{ playSpeed() }}x</span>
              <span class="material-icons text-[14px] opacity-50 transition-transform" [class.rotate-180]="toolbarMenu() === 'speed'">expand_more</span>
            </button>
            @if (toolbarMenu() === 'speed') {
              <div class="rt-dd-panel">
                @for (spd of playSpeedOptions; track spd) {
                  <button
                    type="button"
                    class="rt-dd-item font-mono"
                    [class.active]="playSpeed() === spd"
                    (click)="pickPlaySpeed(spd)"
                  >
                    <span>{{ spd }}x</span>
                    @if (playSpeed() === spd) {
                      <span class="material-icons text-accent text-sm ml-auto">check</span>
                    }
                  </button>
                }
              </div>
            }
          </div>
        </div>

        <!-- 第3行：跳转 / 镜头 / 血条 / 英雄 / 调试 -->
        <div class="flex flex-wrap items-center gap-1.5">
          <div class="rt-dd rt-dd-md" data-rt-dd="jump">
            <button
              type="button"
              class="rt-dd-trigger"
              [class.open]="toolbarMenu() === 'jump'"
              (click)="toggleToolbarMenu('jump')"
              title="跳转商店 / 神符 / 肉山"
            >
              <span class="rt-dd-label">{{ jumpMenuLabel() }}</span>
              <span class="material-icons text-[14px] opacity-50 transition-transform" [class.rotate-180]="toolbarMenu() === 'jump'">expand_more</span>
            </button>
            @if (toolbarMenu() === 'jump') {
              <div class="rt-dd-panel">
                @for (opt of jumpMenuOptions; track opt.value) {
                  <button
                    type="button"
                    class="rt-dd-item"
                    [class.active]="jumpTargetKey() === opt.value"
                    (click)="pickJumpTarget(opt.value)"
                  >
                    <span>{{ opt.label }}</span>
                    @if (jumpTargetKey() === opt.value) {
                      <span class="material-icons text-accent text-sm ml-auto">check</span>
                    }
                  </button>
                }
              </div>
            }
          </div>

          <div class="rt-dd rt-dd-md" data-rt-dd="camera">
            <button
              type="button"
              class="rt-dd-trigger"
              [class.open]="toolbarMenu() === 'camera'"
              (click)="toggleToolbarMenu('camera')"
              title="镜头模式"
            >
              <span class="rt-dd-label">{{ cameraMenuLabel() }}</span>
              <span class="material-icons text-[14px] opacity-50 transition-transform" [class.rotate-180]="toolbarMenu() === 'camera'">expand_more</span>
            </button>
            @if (toolbarMenu() === 'camera') {
              <div class="rt-dd-panel">
                @for (opt of cameraMenuOptions; track opt.value) {
                  <button
                    type="button"
                    class="rt-dd-item"
                    [class.active]="cameraMode() === opt.value"
                    (click)="pickCameraMode(opt.value)"
                  >
                    <span>{{ opt.label }}</span>
                    @if (cameraMode() === opt.value) {
                      <span class="material-icons text-accent text-sm ml-auto">check</span>
                    }
                  </button>
                }
              </div>
            }
          </div>

          <button
            type="button"
            (click)="toggleHealthBars()"
            class="px-2 py-1 border rounded shrink-0"
            [ngClass]="showHealthBars() ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300 font-bold' : 'border-white/20 text-white/50'"
            title="开关 3D 战场头顶生命值血条"
          >
            血条{{ showHealthBars() ? '开' : '关' }}
          </button>

          <button type="button" (click)="showDebug.set(!showDebug())" class="px-2 py-1 border border-white/20 rounded shrink-0">
            {{ showDebug() ? '隐藏调试' : '事件流' }}
          </button>
        </div>
      </div>

      }


      <div class="flex flex-col lg:flex-row flex-grow min-h-0">
        <div class="relative flex-grow min-h-[42vh] sm:min-h-[520px] lg:min-h-0 bg-[#05080c] overflow-hidden">
          <!-- 3D WebGL 全屏视口（底部控制台与顶部栏直接叠在视口上，消除控制台上方黑条） -->
          <div class="absolute inset-0">
            <canvas #glCanvas width="1280" height="720"
                    class="absolute inset-0 w-full h-full block z-0 pointer-events-none"></canvas>
            <!-- 夜晚：按原版夜间截图校准的地面颜色倍率（R 0.61 / G 0.76 / B 0.72，即 rgb(156,194,184) 正片叠底），血条与 HUD 不受影响 -->
            <!-- 头顶血条 / 选择圈 / 跳字：与对战页共用画法（game/overlay-draw.ts） -->
            <canvas #overlay class="absolute inset-0 w-full h-full block z-[1] pointer-events-none"></canvas>
            <div #viewLayer
                 class="absolute inset-0 z-[2] pointer-events-auto bg-transparent"></div>

            @if (loading()) {
              <div class="absolute top-12 right-3 z-10 pointer-events-none">
                <div class="flex items-center gap-2 px-3 py-1.5 rounded bg-black/75 border border-white/15 text-accent font-bold uppercase tracking-widest text-[11px]">
                  <span class="material-icons animate-spin text-sm">autorenew</span>
                  加载 3D 地形与录像中…
                </div>
              </div>
            }
            @if (error()) {
              <div class="absolute inset-0 flex items-center justify-center bg-black/70 z-40 p-6">
                <div class="max-w-md text-center space-y-3">
                  <p class="text-red-400 font-bold">{{ error() }}</p>
                  <button type="button" (click)="reload()"
                          class="px-4 py-2 bg-accent text-black font-black uppercase text-xs rounded">重试</button>
                </div>
              </div>
            }

            <!-- ============ 原生控制台 HUD：与在线对战页 /play 共用同一套坐标与样式（game/w3-hud.ts） ============ -->
            <div class="w3" style="z-index: 26">
              <div class="w3-top" [style.background-image]="skin('topbar.png')"></div>

              <!-- 左上四个菜单按钮 -->
              @for (b of upperButtons; track b.id) {
                <button type="button" class="w3-upper" [class.on]="activeTopMenu() === b.id" [style]="b.style"
                        [style.--tex]="skin('upper-button.png')" (click)="toggleTopMenu(b.id)">
                  {{ b.text }} (<em>{{ b.key }}</em>)
                </button>
              }

              <!-- 时间指示器 -->
              <div class="w3-time" [style]="L.time">
                <div class="w3-time-sky" [style.background-image]="skin('ti-HumanUITile-TimeIndicator.png')" [style.background-position-x.%]="skyPos()"></div>
                <div class="w3-time-frame" [style.background-image]="skin('ti-NightElfUITile-TimeIndicatorFrame.png')"></div>
              </div>

              <!-- 资源栏：金钱 / 分 / 秒 / 版本号 -->
              <img class="w3-abs" [style]="L.resGoldIcon" src="/assets/wc3/native-ui/NightElf/res-gold.png" alt="" />
              <div class="w3-res" [style]="L.resGold" (mouseenter)="showNativeTip('黄金', '录像中该玩家当前持有的金钱。')" (mouseleave)="hideTip()">{{ gold() }}</div>
              <img class="w3-abs" [style]="L.resLumberIcon" src="/assets/wc3/native-ui/common/dota-lumber-clock.png" alt="" />
              <div class="w3-res" [style]="L.resLumber" (mouseenter)="showNativeTip('分：', '对局已进行的分钟数。')" (mouseleave)="hideTip()">{{ clockMinText() }}</div>
              <div class="w3-res" [style]="L.resSupply" (mouseenter)="showNativeTip('秒：', '对局已进行的秒数。')" (mouseleave)="hideTip()">{{ clockSecText() }}</div>
              <div class="w3-res w3-upkeep" [style]="L.resUpkeep">v6.83d</div>

              <!-- 多面板（DotA 计分板） -->
              <div class="w3-mb-title" [style]="L.mbTitle">( {{ kills() }}/{{ deaths() }}/{{ assists() }} - {{ lastHits() }}/{{ denies() }} - {{ heroLevel() }} )</div>
              <button type="button" class="w3-mb-btn" [class.open]="showScore()" [style]="L.mbBtn" (click)="showScore.set(!showScore())" aria-label="展开或收起计分板"></button>
              @if (showScore()) {
                <div class="w3-mb-board" [style]="L.mbBoard">
                  <div class="w3-mb-row w3-mb-head"><span>近卫军团</span><span>{{ kills() }}</span></div>
                  <div class="w3-mb-row">
                    <img [src]="heroIcon()" alt="" />
                    <span class="nm">{{ player() || 'wuxiancong' }}</span>
                    <span class="lv">{{ heroLevel() }}</span>
                    <span>{{ kills() }}/{{ deaths() }}/{{ assists() }}</span>
                    <span>{{ lastHits() }}/{{ denies() }}</span>
                    <span class="rs"></span>
                  </div>
                </div>
              }

              <!-- 3D 肖像（在控制台贴图之下，由贴图镂空露出）；点击聚焦英雄 -->
              <div class="w3-abs w3-portrait" [style]="L.portrait" (click)="setCameraMode('hero')">
                <img [src]="heroIcon()" alt="" draggable="false" style="position: absolute; inset: 0; opacity: 0.35" />
                <canvas #portraitCanvas width="144" height="168" style="position: relative"></canvas>
              </div>

              <div class="w3-hit"></div><div class="w3-hit l"></div><div class="w3-hit r"></div>
              <div class="w3-console" [style.background-image]="skin('console.png')"></div>

              <!-- 小地图 -->
              <div class="w3-abs w3-minimap" [style]="L.minimap">
                <canvas #minimap width="256" height="256" style="display: block; width: 100%; height: 100%"
                        (click)="onMinimapClick($event)" (contextmenu)="$event.preventDefault()"></canvas>
              </div>

              <!-- 小地图右侧五个按钮：信号 / 地形 / 盟友颜色 / 野怪营地 / 阵型 -->
              @for (b of mmButtons(); track b.id) {
                <button type="button" class="w3-abs w3-mmbtn" [style]="b.style" [style.background-image]="b.img"
                        (click)="onMmButton(b.id)" (mouseenter)="showNativeTip(b.title, b.tip)" (mouseleave)="hideTip()" [attr.aria-label]="b.title"></button>
              }

              <!-- 生命 / 魔法 文本（肖像下方两条镂空） -->
              <div class="w3-abs w3-hp" [style]="L.hpText" [style.color]="hpColor()">{{ heroHp() }} / {{ heroHpMax() }}</div>
              <div class="w3-abs w3-mp" [style]="L.mpText">{{ heroMp() }} / {{ heroMpMax() }}</div>

              <!-- 信息面板：SimpleInfoPanelUnitDetail -->
              <div class="w3-abs w3-info" [style]="L.info">
                <div class="w3-name">{{ heroNameCn() }}</div>
                <div class="w3-xp" (mouseenter)="showNativeTip('经验值', '当前等级进度 ' + xpPercent().toFixed(0) + '%')" (mouseleave)="hideTip()">
                  <i [style.width.%]="xpPercent()"></i>
                  <span>等级 {{ heroLevel() }} {{ heroTitle() }}</span>
                </div>
                <div class="w3-icon-row" style="top: 27.4%">
                  <img [src]="dmgIcon" alt="" />
                  <div><span class="lb">攻击力:</span><span class="vl">{{ heroAtk() }}@if (heroAtkBonus() > 0) { <span style="color: #20ff20">+{{ heroAtkBonus() }}</span> }</span></div>
                </div>
                <div class="w3-icon-row" style="top: 54.8%">
                  <img [src]="armorIcon" alt="" />
                  <div><span class="lb">护甲:</span><span class="vl">{{ heroArmor() }}@if (heroArmorBonus() > 0) { <span style="color: #20ff20">+{{ heroArmorBonus() }}</span> }</span></div>
                </div>
                <div class="w3-hero-attr">
                  <img [src]="attrIcon()" alt="" />
                  <div>
                    <span class="lb">力量:</span><span class="vl">{{ heroStr() }}@if (heroStrBonus() > 0) { <span style="color: #20ff20">+{{ heroStrBonus() }}</span> }</span>
                    <span class="lb">敏捷:</span><span class="vl">{{ heroAgi() }}@if (heroAgiBonus() > 0) { <span style="color: #20ff20">+{{ heroAgiBonus() }}</span> }</span>
                    <span class="lb">智力:</span><span class="vl">{{ heroInt() }}@if (heroIntBonus() > 0) { <span style="color: #20ff20">+{{ heroIntBonus() }}</span> }</span>
                  </div>
                </div>
              </div>

              <!-- 物品栏 6 格 -->
              @for (it of itemSlots(); track it.slot) {
                <button type="button" class="w3-abs w3-btn" [class.empty]="!it.icon" [class.act]="!!it.activeToggle" [style]="L.inv[$index]"
                        (mouseenter)="it.icon && showNativeTip(it.name, '物品栏热键：' + it.hotkey)" (mouseleave)="hideTip()" [attr.aria-label]="it.name || '空物品栏'">
                  @if (it.icon) {
                    <img [src]="it.icon" alt="" draggable="false" />
                    @if (it.charges > 1) { <b class="num">{{ it.charges }}</b> }
                  }
                </button>
              }

              <!-- 命令卡 4×3 -->
              @for (sk of commandSlots(); track sk.id) {
                @if (sk.icon && $index < 12) {
                  <button type="button" class="w3-abs w3-btn" [class.dim]="!!sk.unlearned" [class.act]="!!sk.active" [style]="L.cmd[$index]" (click)="onCommandSlotClick(sk)"
                          (mouseenter)="showNativeTip(cmdTipTitle(sk), cmdTipBody(sk))" (mouseleave)="hideTip()" [attr.aria-label]="sk.name">
                    <img [src]="sk.icon" alt="" draggable="false" />
                    @if (sk.level > 0) { <b class="num">{{ sk.level }}</b> }
                  </button>
                }
              }

              <!-- 原生提示框：固定在命令卡上方、贴右 -->
              @if (tip(); as t) {
                <div class="w3-tip">
                  <div class="tt">{{ t.title }}</div>
                  @if (t.body) { <div class="bd">{{ t.body }}</div> }
                </div>
              }

              <!-- F9~F12 对话框（EscMenu 边框九宫格） -->
              @if (activeTopMenu(); as mn) {
                <div class="w3-dialog" style="--nine: url(/assets/wc3/native-ui/common/esc-nightelf-9.png)">
                  @if (mn === 'quests') {
                    <div class="hd">地图信息</div>
                    <div class="tx">DotA Allstars v6.83d · 录像回放

近卫军团（左下）迎战天灾军团（右上），摧毁敌方遗迹即获胜。
自动出兵：每 30 秒三路兵营刷新小兵，每第 7 波附带攻城车。
防御塔：主动攻击 700 码内的敌方小兵与英雄。
野怪与神符：12 处野怪营地每整分钟刷新；河道神符每 2 分钟刷新。
播放、倍速、跳转与镜头：在 菜单 (F10) 里打开录像工具栏。</div>
                  } @else if (mn === 'menu') {
                    <div class="hd">游戏菜单</div>
                    <button type="button" class="w3-dbtn" (click)="togglePlay(); activeTopMenu.set(null)">{{ isPlaying() ? '暂停录像' : '继续播放' }}</button>
                    <button type="button" class="w3-dbtn" (click)="showHealthBars.set(!showHealthBars())">显示生命条：{{ showHealthBars() ? '开' : '关' }}</button>
                    <button type="button" class="w3-dbtn" (click)="toggleFog()">战争迷雾：{{ fogOn() ? '开' : '关' }}</button>
                    <button type="button" class="w3-dbtn" (click)="resetCamera(); activeTopMenu.set(null)">复位镜头</button>
                    <button type="button" class="w3-dbtn" (click)="setToolbarCollapsed(!toolbarCollapsed()); activeTopMenu.set(null)">录像工具栏：{{ toolbarCollapsed() ? '关' : '开' }}</button>
                    <button type="button" class="w3-dbtn" (click)="reload(); activeTopMenu.set(null)">重新加载场景</button>
                  } @else if (mn === 'allies') {
                    <div class="hd">盟友</div>
                    <div class="ally"><img [src]="heroIcon()" alt="" /><span>{{ player() || 'wuxiancong' }}</span><span>{{ heroNameCn() }} · 等级 {{ heroLevel() }}</span><span class="g">{{ gold() }}</span></div>
                  } @else {
                    <div class="hd">消息记录</div>
                    <div class="tx log">{{ logText() }}</div>
                  }
                  <button type="button" class="w3-dbtn ret" (click)="activeTopMenu.set(null)">返回录像</button>
                </div>
              }
            </div>
          </div>
        </div>

        @if (showDebug()) {
          <aside class="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-white/10 bg-[#0b1118] p-3 space-y-3 overflow-y-auto max-h-[85vh]">
            <section class="space-y-1.5">
              <h2 class="text-xs font-black uppercase tracking-widest text-accent">英雄模型</h2>
              <select class="w-full px-2 py-1.5 rounded bg-[#0c1018] border border-white/15 text-[11px] text-[#f0e0b0] disabled:opacity-45 disabled:cursor-not-allowed"
                      [disabled]="!debugMode()" [value]="heroPresetLocked() ? currentHeroKey() : ''"
                      (change)="onDebugHeroSelect($any($event.target).value)"
                      [title]="debugMode() ? '调试：临时换成其它英雄模型' : '地址加 ?debug 后才能切换'">
                <option value="">跟随录像：{{ replayHeroLabel() }}</option>
                @for (h of heroRoster; track h.key) {
                  <option [value]="h.key">{{ h.index }}. {{ h.nameZh }}</option>
                }
              </select>
              @if (!debugMode()) {
                <p class="text-[10px] text-[var(--text-muted)]">调试模式（地址加 <code>?debug</code>）才能切换，默认使用当前录像的英雄。</p>
              }
            </section>
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
  private readonly overlayRef = viewChild<ElementRef<HTMLCanvasElement>>('overlay');
  private readonly minimapRef = viewChild<ElementRef<HTMLCanvasElement>>('minimap');
  // 获取底部控制台 3D 动态英雄肖像画布引用
  private readonly portraitCanvas = viewChild<ElementRef<HTMLCanvasElement>>('portraitCanvas');

  /** 各帧矩形与顶部菜单按钮：与在线对战页共用（game/w3-hud.ts） */
  readonly L = W3_LAYOUT;
  readonly upperButtons: { id: 'quests' | 'menu' | 'allies' | 'chat'; text: string; key: string; style: string }[] = [
    { id: 'quests', text: '地图信息', key: 'F9', style: U(0.002, 0, 0.085, 0.022) },
    { id: 'menu', text: '菜单', key: 'F10', style: U(0.087, 0, 0.085, 0.022) },
    { id: 'allies', text: '盟友', key: 'F11', style: U(0.172, 0, 0.085, 0.022) },
    { id: 'chat', text: '聊天', key: 'F12', style: U(0.257, 0, 0.085, 0.022) },
  ];
  readonly dmgIcon = `${NUI}/NightElf/info-dmg-hero.png`;
  readonly armorIcon = `${NUI}/NightElf/info-armor-hero.png`;
  readonly showScore = signal(false);
  readonly tip = signal<{ title: string; body: string } | null>(null);
  skin(file: string): string {
    return `url(${NUI}/NightElf/${file})`;
  }
  showNativeTip(title: string, body: string): void {
    this.tip.set({ title, body });
  }
  hideTip(): void {
    this.tip.set(null);
  }
  cmdTipTitle(sk: CommandCardSlot): string {
    return sk.name + (sk.hotkey ? ` [${sk.hotkey}]` : '');
  }
  cmdTipBody(sk: CommandCardSlot): string {
    if (sk.unlearned) return '尚未学习。';
    return sk.level > 0 && sk.maxLevel ? `等级 ${sk.level} / ${sk.maxLevel}` : '';
  }
  logText(): string {
    const evs = this.recentEvents();
    return evs.length ? evs.map((e) => `[${e.timeText}] ${e.text}`).join('\n') : '暂无记录';
  }
  onMmButton(id: string): void {
    if (id === 'signal') this.triggerMinimapPing();
    else if (id === 'terrain') this.mmShowTerrain.set(!this.mmShowTerrain());
    else if (id === 'ally') this.mmAllyColorMode.set(!this.mmAllyColorMode());
    else if (id === 'creep') this.mmShowCamps.set(!this.mmShowCamps());
    else if (id === 'formation') this.formationOn.set(!this.formationOn());
  }

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
  readonly matchLabel = signal('加载中');
  readonly cameraMode = signal<'hero' | 'map' | 'free'>('hero');
  readonly buildingCount = signal(0);
  readonly simUnits = signal(0);
  readonly simOn = signal(true);
  readonly showDebug = signal(false);
  /** 调试模式：地址带 ?debug 时才允许在事件流面板里换英雄模型 */
  readonly debugMode = signal(false);

  // 录像播放控制、顶部菜单弹窗、小地图侧边五按钮与实时英雄状态信息
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
  /** 小地图信号（世界坐标 + 发出时刻），画法与对战页共用 */
  private pings: { x: number; y: number; t: number }[] = [];
  /** 战争迷雾：以录像玩家（近卫）的视野为准；只影响显示 */
  readonly fogOn = signal(true);
  private readonly fog = new VisionGrid();
  private fogAt = 0;
  private minimapImg?: HTMLImageElement;
  private minimapDrawnAt = 0;

  /** 小地图上的建筑（塔 / 兵营 / 遗迹 / 泉水），与对战页一样画成带黑边的方块 */
  readonly minimapBuildings = signal<{ x: number; y: number; team: 0 | 1; kind: 'tower' | 'rax' | 'ancient' }[]>([]);
  // 头顶血条开关、投影血条与飘金跳字信号
  readonly showHealthBars = signal(true);
  /** 英雄下拉（ZH_HERO_NAMES 顺序） */
  readonly heroRoster = DOTA_HERO_ROSTER;
  /** 当前选中英雄 key（unit code 小写）；手动选择后锁定不被录像覆盖 */
  readonly currentHeroKey = signal('emns');
  /** true = 调试中手动换了模型；默认 false，始终使用当前录像的英雄 */
  readonly heroPresetLocked = signal(false);

  readonly heroNameCn = signal('芙莉莲');
  readonly heroTitle = signal('先知 · 远程智力');
  readonly heroIcon = signal('/assets/wc3/ui/icons/BTNFurion.png');
  readonly heroLevel = signal(1);
  readonly xpPercent = signal(0);
  readonly heroHp = signal(511);
  readonly heroHpMax = signal(511);
  readonly heroMp = signal(270);
  readonly heroMpMax = signal(270);
  readonly heroStr = signal(23);
  readonly heroStrBonus = signal(0);
  readonly heroAgi = signal(18);
  readonly heroAgiBonus = signal(0);
  readonly heroInt = signal(16);
  readonly heroIntBonus = signal(0);
  readonly heroAtk = signal('24-38');
  readonly heroAtkBonus = signal(0);
  readonly heroArmor = signal(4.6);
  readonly heroArmorBonus = signal(0);
  readonly heroMoveSpeed = signal(295);
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

  // 基础命令用本地正确解码的 WC3 图标；属性附加/学习技能默认空槽，有等级或技能点时再显示
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


  /** 以下派生量依赖上面的信号，须在其之后声明 */
  readonly mmButtons = computed(() => {
    const img = (f: string) => `url(${NUI}/NightElf/${f}.png)`;
    return [
      { id: 'signal', style: B(310, 66, 44, 40), img: img(this.mmPingMode() ? 'mm-signal-down' : 'mm-signal'), title: '小地图信号 (Alt+G)', tip: '点击后在小地图上点选位置发出信号。' },
      { id: 'terrain', style: B(310, 110, 44, 40), img: img(this.mmShowTerrain() ? 'mm-terrain-on' : 'mm-terrain-off'), title: '切换地形显示 (Alt+T)', tip: '在小地图上显示或隐藏地形。' },
      { id: 'ally', style: B(310, 154, 44, 40), img: img(this.mmAllyColorMode() ? 'mm-ally-on' : 'mm-ally-off'), title: '切换盟友颜色 (Alt+A)', tip: '在「玩家颜色」与「敌我颜色」之间切换小地图标记。' },
      { id: 'creep', style: B(310, 198, 44, 40), img: img(this.mmShowCamps() ? 'mm-creep-on' : 'mm-creep-off'), title: '显示中立生物营地 (Alt+R)', tip: '在小地图上显示或隐藏野怪营地。' },
      { id: 'formation', style: B(309, 248, 46, 46), img: img(this.formationOn() ? 'mm-formation-on' : 'mm-formation-off'), title: '切换队形移动 (Alt+F)', tip: '录像回放中此开关仅保留外观。' },
    ];
  });
  readonly attrIcon = computed(() => `${NUI}/NightElf/info-hero-${getHeroByKey(this.currentHeroKey())?.primary || 'str'}.png`);
  readonly hpColor = computed(() => {
    const p = this.heroHp() / Math.max(1, this.heroHpMax());
    return p > 0.66 ? '#20ff20' : p > 0.33 ? '#ffff20' : '#ff3030';
  });
  /** 天空盘随游戏时间滚动：DotA 一昼夜 8 分钟，开局为清晨 6 点 */
  /** 游戏内时刻：按号角（出兵）后的时间算，号角前停在 6:00 */
  readonly hours = computed(() => {
    const horn = this.timeline?.gameHornMs || 0;
    return timeOfDay(horn > 0 ? (this.currentMs() - horn) / 1000 : 0);
  });
  readonly skyPos = computed(() => skyPosition(this.hours()));
  readonly night = computed(() => nightAmount(this.hours()));

  private timeline?: ReplayTimelineEngine;
  private lastTickTime = 0;
  private currentHeroModelUrl = '/assets/wc3/Units/NightElf/MalFurion/MalFurionNoStag.mdxbin';
  private readonly spiritBearModelUrl = '/assets/wc3/Units/Creeps/GrizzlyBear/GrizzlyBear.mdxbin';
  private spiritBearSummoned = false;

  private mdx?: Wc3MdxViewer;
  private seqPoll = 0;
  private disposed = false;

  constructor() {
    afterNextRender(() => {
      if (!isPlatformBrowser(this.platformId)) {
        return;
      }
      document.addEventListener('pointerdown', this.onDocPointerDown, true);
      this.readQuery();
      void this.boot();
    });
  }

  ngOnDestroy(): void {
    this.disposed = true;
    if (isPlatformBrowser(this.platformId)) {
      document.removeEventListener('pointerdown', this.onDocPointerDown, true);
    }
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

  // 支持一键跳转镜头至商店、神秘商店、上下河道神符点与肉山巢穴，以及顶部菜单与小地图信号
  toggleTopMenu(menu: 'quests' | 'menu' | 'allies' | 'chat'): void {
    this.activeTopMenu.set(this.activeTopMenu() === menu ? null : menu);
  }

  triggerMinimapPing(): void {
    const nextMode = !this.mmPingMode();
    this.mmPingMode.set(nextMode);
    const pos = this.heroPos();
    this.pings.push({ x: pos.x, y: pos.y, t: performance.now() });
    setTimeout(() => this.mmPingMode.set(false), 2400);
  }

  readonly jumpTargetKey = signal('');
  /** 工具条自定义下拉（对齐语言选择：dropdown-blur + custom-scrollbar） */
  readonly toolbarMenu = signal<'match' | 'speed' | 'jump' | 'camera' | 'hero' | null>(null);
  readonly toolbarCollapsed = signal(true);

  setToolbarCollapsed(collapsed: boolean): void {
    this.toolbarCollapsed.set(collapsed);
    if (collapsed) this.toolbarMenu.set(null);
  }
  readonly playSpeedOptions = [1, 2, 4, 8] as const;
  readonly jumpMenuOptions: { value: string; label: string }[] = [
    { value: '', label: '镜头跳转' },
    { value: 'radiant_shop', label: '近卫商店' },
    { value: 'dire_shop', label: '天灾商店' },
    { value: 'side_top', label: '上路边路商店' },
    { value: 'side_bot', label: '下路边路商店' },
    { value: 'secret_radiant', label: '近卫神秘商店' },
    { value: 'secret_dire', label: '天灾神秘商店' },
    { value: 'rune_top', label: '上河神符' },
    { value: 'rune_bot', label: '下河神符' },
    { value: 'roshan', label: '肉山' },
  ];
  readonly cameraMenuOptions: { value: 'hero' | 'free' | 'map'; label: string }[] = [
    { value: 'hero', label: '跟随英雄' },
    { value: 'free', label: '自由镜头' },
    { value: 'map', label: '全图俯视' },
  ];

  private readonly jumpTargets: Record<string, { x: number; y: number }> = {
    radiant_shop: { x: -6950, y: -6750 },
    dire_shop: { x: 6816, y: 5984 },
    side_top: { x: -7296, y: 4320 },
    side_bot: { x: 7360, y: -4320 },
    secret_radiant: { x: -4544, y: 1152 },
    secret_dire: { x: 3200, y: -64 },
    rune_top: { x: -2352, y: 1648 },
    rune_bot: { x: 3008, y: -2832 },
    roshan: { x: 4176, y: -2288 },
  };

  private onDocPointerDown = (ev: Event): void => {
    const t = ev.target as HTMLElement | null;
    if (!t?.closest?.('[data-rt-dd]')) {
      this.toolbarMenu.set(null);
    }
  };

  toggleToolbarMenu(menu: 'match' | 'speed' | 'jump' | 'camera' | 'hero'): void {
    this.toolbarMenu.update((cur) => (cur === menu ? null : menu));
  }

  matchMenuLabel(): string {
    const file = this.selectedFile();
    const m = this.matchList().find((x) => x.fileName === file);
    if (!m) return file || '选择录像…';
    return `${m.heroName} · ${m.matchId} (${this.formatDuration(m.durationMs)} / ${m.moveActions})`;
  }

  jumpMenuLabel(): string {
    return this.jumpMenuOptions.find((o) => o.value === this.jumpTargetKey())?.label || '镜头跳转';
  }

  cameraMenuLabel(): string {
    return this.cameraMenuOptions.find((o) => o.value === this.cameraMode())?.label || '镜头模式';
  }

  heroMenuLabel(): string {
    const h = getHeroByKey(this.currentHeroKey());
    return h ? `${h.index}. ${h.nameZh}` : '选择英雄…';
  }

  pickMatchFile(fileName: string): void {
    this.toolbarMenu.set(null);
    this.onSelectMatchFile(fileName);
  }

  pickPlaySpeed(spd: number): void {
    this.playSpeed.set(spd);
    this.toolbarMenu.set(null);
  }

  pickJumpTarget(key: string): void {
    this.toolbarMenu.set(null);
    this.onSelectJumpTarget(key);
  }

  pickCameraMode(mode: 'hero' | 'free' | 'map'): void {
    this.toolbarMenu.set(null);
    this.setCameraMode(mode);
  }

  pickHeroPreset(key: string): void {
    this.toolbarMenu.set(null);
    this.onSelectHeroPreset(key);
  }

  jumpToPoint(x: number, y: number): void {
    if (!this.mdx) return;
    this.mdx.panCameraTo(x, y);
    this.cameraMode.set('free');
    this.updateMinimapMarker();
  }

  onSelectJumpTarget(key: string): void {
    this.jumpTargetKey.set(key);
    const pt = this.jumpTargets[key];
    if (!pt) return;
    this.jumpToPoint(pt.x, pt.y);
  }

  /** 兵线/野怪/神符始终运行，不再提供开关 */
  private ensureSimAlwaysOn(): void {
    this.simOn.set(true);
    this.mdx?.setSimEnabled(true);
  }

  // 血条开关切换与预设英雄（含幻影刺客茉崔蒂）切换方法
  toggleHealthBars(): void {
    this.showHealthBars.set(!this.showHealthBars());
  }

  // 德鲁伊命令卡 + 1 技能召唤独立熊灵
  private applyLoneDruidCommandSlots(basicCmd = ''): void {
    this.commandSlots.set([
      { id: 'move', hotkey: 'M', name: '移动', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNMove.png', active: basicCmd === 'move' },
      { id: 'stop', hotkey: 'S', name: '停止', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNStop.png', active: basicCmd === 'stop' },
      { id: 'hold', hotkey: 'H', name: '保持原位', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNHoldPosition.png', active: basicCmd === 'hold' },
      { id: 'attack', hotkey: 'A', name: '攻击', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNAttack.png', active: basicCmd === 'attack' },
      { id: 'patrol', hotkey: 'P', name: '巡逻', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNPatrol.png', active: basicCmd === 'patrol' },
      { id: 'empty1', hotkey: '', name: '', level: 0, icon: '' },
      { id: 'empty_statup', hotkey: '', name: '', level: 0, icon: '' },
      {
        id: 'learn',
        hotkey: 'O',
        name: '学习技能',
        level: 1,
        icon: '/assets/wc3/ui/icons/cmd/BTNSkillz.png',
      },
      {
        id: 'ld_spirit_bear',
        hotkey: 'B',
        name: '熊灵伙伴',
        level: 1,
        maxLevel: 4,
        icon: '/assets/wc3/ui/icons/BTNGrizzlyBear.png',
        active: this.spiritBearSummoned,
      },
      {
        id: 'ld_rabid',
        hotkey: 'R',
        name: '狂猛',
        level: 1,
        maxLevel: 4,
        icon: '/assets/wc3/ui/icons/BTNDruidOfTheClaw.png',
      },
      {
        id: 'ld_synergy',
        hotkey: 'D',
        name: '协同',
        level: 1,
        maxLevel: 4,
        icon: '/assets/wc3/ui/icons/BTNDruidOfTheClaw.png',
      },
      {
        id: 'ld_true_form',
        hotkey: 'F',
        name: '真实形态',
        level: 1,
        maxLevel: 3,
        icon: '/assets/wc3/ui/icons/BTNGrizzlyBear.png',
      },
    ]);
  }

  onCommandSlotClick(sk: CommandCardSlot): void {
    if (!sk?.id || sk.unlearned) return;
    // 1 技能：召唤独立熊灵模型（不替换德鲁伊本体）
    if (sk.id === 'ld_spirit_bear' && this.currentHeroKey() === 'n01o') {
      this.summonSpiritBear();
    }
  }

  private summonSpiritBear(): void {
    if (!this.mdx || this.currentHeroKey() !== 'n01o') return;
    if (this.spiritBearSummoned) {
      // 已存在则仅刷新位置跟随，不换德鲁伊模型
      this.mdx.clearPreviewCompanion();
    }
    this.spiritBearSummoned = true;
    void this.mdx
      .setPreviewCompanion(this.spiritBearModelUrl, {
        offsetX: 150,
        offsetY: 100,
        scale: 1.1,
      })
      .then(() => this.applyLoneDruidCommandSlots());
  }

  private readonly legacyHeroKeys: Record<string, string> = {
    ursa: 'huth',
    ogremagi: 'hmkg',
    tinker: 'ntin',
    furion: 'emns',
    kotl: 'hblm',
    tauren: 'o015',
    treant: 'hamg',
    silencer: 'n01a',
    lina: 'h004',
    lonedruid: 'n01o',
    riki: 'hc92',
    earthshaker: 'otch',
    nagasiren: 'hc49',
    sven: 'h001',
    crystalmaiden: 'hjai',
    morphling: 'o00p',
    enchantress: 'emoo',
    zeus: 'hmbr',
    pa: 'ewar',
    blademaster: 'nbbc',
    antimage: 'edem',
    sniper: 'usyl',
    paladin: 'harf',
    lich: 'ulic',
  };

  /** 事件流面板里的英雄下拉：空值 = 跟随录像英雄 */
  onDebugHeroSelect(value: string): void {
    if (!this.debugMode()) return;
    if (value) this.onSelectHeroPreset(value);
    else this.followReplayHero();
  }

  /** 当前录像英雄的名字（下拉第一项） */
  replayHeroLabel(): string {
    const code = this.timeline?.sampleAt(this.currentMs()).heroCode || '';
    const h = code ? getHeroByCode(code) : undefined;
    return h ? `${h.index}. ${h.nameZh}` : '加载中…';
  }

  /** 解除调试锁定，模型回到当前录像的英雄 */
  private followReplayHero(): void {
    this.heroPresetLocked.set(false);
    const code = this.timeline?.sampleAt(this.currentMs()).heroCode || '';
    const h = code ? getHeroByCode(code) : undefined;
    if (h) this.applyHeroRosterEntry(h, false);
    this.applyReplayFrame(this.currentMs());
  }

  onSelectHeroPreset(rawKey: string): void {
    // 只有调试模式才允许用别的英雄模型，正常播放始终是录像里的英雄
    if (!this.debugMode()) return;
    const key = this.legacyHeroKeys[rawKey] || rawKey;
    const hero = getHeroByKey(key);
    if (!hero) {
      console.warn('[replay-3d] unknown hero preset', rawKey);
      return;
    }
    this.applyHeroRosterEntry(hero, true);
  }

  private applyHeroRosterEntry(hero: DotaHeroRosterEntry, lockPreset: boolean): void {
    this.currentHeroKey.set(hero.key);
    this.heroPresetLocked.set(lockPreset);
    this.heroNameCn.set(hero.nameZh);
    this.heroTitle.set(hero.classTitle);
    this.heroIcon.set(hero.iconUrl);
    const s = hero.stats;
    this.heroHp.set(s.hpLevel1);
    this.heroHpMax.set(s.hpLevel1);
    this.heroMp.set(s.mpLevel1);
    this.heroMpMax.set(s.mpLevel1);
    this.heroStr.set(s.strBase);
    this.heroAgi.set(s.agiBase);
    this.heroInt.set(s.intBase);
    const dmgMax = s.attackDmgBase + s.attackDice * s.attackSides;
    this.heroAtk.set(`${s.attackDmgBase}-${dmgMax}`);
    this.heroArmor.set(s.baseArmor);
    this.heroMoveSpeed.set(s.moveSpeed);
    this.currentHeroModelUrl = hero.modelUrl;
    this.modelName.set(hero.code);

    if (!this.mdx) return;
    this.mdx.clearPreviewCompanion();
    this.spiritBearSummoned = false;
    void this.mdx.switchHeroModel(hero.modelUrl, hero.assetBaseUrl).then(() => {
      this.sequences.set(this.mdx?.sequences || []);
      if (hero.key === 'n01o') {
        this.applyLoneDruidCommandSlots();
      }
    });
  }


  onMinimapClick(ev: MouseEvent): void {
    const el = ev.currentTarget as HTMLElement | null;
    if (!el || !this.mdx) return;
    const rect = el.getBoundingClientRect();
    const px = Math.max(0, Math.min(rect.width, ev.clientX - rect.left));
    const py = Math.max(0, Math.min(rect.height, ev.clientY - rect.top));
    const { x, y } = mapPixelToWorld(px, py, DOTA_MAP_BOUNDS, rect.width, rect.height);
    if (this.mmPingMode() || ev.altKey) {
      this.pings.push({ x, y, t: performance.now() });
      this.mmPingMode.set(false);
      return;
    }
    this.mdx.panCameraTo(x, y);
    this.cameraMode.set('free');
    this.updateMinimapMarker();
  }

  toggleFog(): void {
    this.fogOn.set(!this.fogOn());
    this.fogAt = 0;
    if (!this.fogOn()) this.mdx?.setSimUnitsHidden(() => false);
  }

  /** 敌方 / 中立单位在录像玩家视野外即处于迷雾中 */
  private fogged(x: number, y: number, team: number): boolean {
    return this.fogOn() && team !== 0 && !this.fog.visible(x, y);
  }

  /** 每 150ms 按近卫一方的视野（英雄、小兵、建筑；白天/夜晚）重算迷雾，并隐藏迷雾里的敌方模型 */
  private updateFog(): void {
    const mdx = this.mdx;
    const now = performance.now();
    if (!mdx || !this.fogOn() || now < this.fogAt) return;
    this.fogAt = now + 150;
    const night = this.night() > 0.5;
    if (!this.fog.hasOccluders) this.fog.setOccluders(mdx.getVisionOccluders());
    const hp = this.heroPos();
    const src: VisionSource[] = [{ x: hp.x, y: hp.y, r: night ? 800 : 1800 }];
    for (const u of mdx.getSimUnits()) if (u.team === 0) src.push({ x: u.x, y: u.y, r: night ? 800 : 1400 });
    for (const b of this.minimapBuildings()) {
      if (b.team !== 0) continue;
      src.push({ x: b.x, y: b.y, r: b.kind === 'tower' ? (night ? 800 : 1800) : 900 });
    }
    this.fog.update(src);
    mdx.setSimUnitsHidden((x, y, team) => this.fogged(x, y, team));
  }

  /** 小地图：与对战页同一套画法（overlay-draw.ts drawMinimap），数据来自录像与场景模拟 */
  private updateMinimapMarker(): void {
    const c = this.minimapRef()?.nativeElement;
    const mdx = this.mdx;
    if (!c || !mdx) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const S = c.width;
    const myTeam = 0;
    const units: MinimapScene['units'] = this.minimapBuildings().map((b) => ({
      x: b.x,
      y: b.y,
      color: b.team === myTeam ? '#22c55e' : '#ef4444',
      kind: b.kind,
    }));
    for (const u of mdx.getSimUnits()) {
      if (u.kind === 'neutral' && !this.mmShowCamps()) continue;
      if (this.fogged(u.x, u.y, u.team)) continue;
      units.push({ x: u.x, y: u.y, color: u.team === -1 ? '#eab308' : u.team === myTeam ? '#22c55e' : '#ef4444', kind: 'small' });
    }
    const now = performance.now();
    this.pings = this.pings.filter((p) => now - p.t < 3000);
    const hp = this.heroPos();
    drawMinimap(ctx, S, {
      toPx: (x, y) => worldToMapPixel(x, y, DOTA_MAP_BOUNDS, S, S),
      terrain: this.minimapImg,
      showTerrain: this.mmShowTerrain(),
      units,
      runes: (mdx.getSimRunes?.() || []).filter((r) => !this.fogged(r.x, r.y, -1)),
      heroes: [{ x: hp.x, y: hp.y, fill: this.mmAllyColorMode() ? '#ffffff' : PLAYER_COLORS[0], me: true }],
      cam: mdx.getCameraFocus(),
      pings: this.pings,
      fog: this.fogOn() ? (c) => this.fog.drawMinimap(c, S, (x, y) => worldToMapPixel(x, y, DOTA_MAP_BOUNDS, S, S)) : undefined,
    });
  }

  /** 头顶血条 / 英雄选择圈 / 跳字：与对战页同一套画法（overlay-draw.ts） */
  private drawReplayOverlay(): void {
    const c = this.overlayRef()?.nativeElement;
    const mdx = this.mdx;
    if (!c || !mdx) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const { W, H } = prepareOverlay(c, ctx);
    const project = (x: number, y: number, z: number) => {
      const p = mdx.projectWorldToScreen(x, y, z);
      return p ? { x: (p.sx / 100) * W, y: (p.sy / 100) * H } : null;
    };
    const H0 = (x: number, y: number) => mdx.sampleHeight(x, y);
    const myTeam = 0;
    // 场景模拟里的英雄坐标会滞后于模型，英雄一律用录像当前位置（模型也按它摆放）
    const hp = this.heroPos();
    const ents = mdx.getSimHealthEntities().map((e) => (e.kind === 'hero' ? { ...e, x: hp.x, y: hp.y } : e));
    // 战争迷雾的压暗在 WebGL 里画（平滑、全图），这里只推进浓度渐变
    if (this.fogOn()) {
      this.fog.fade();
      mdx.setFogDensity(this.fog.density, FOG_ALPHA);
    } else {
      mdx.setFogDensity(null);
    }
    // 录像里选中的始终是该玩家的英雄：脚下画与对战页相同的绿色选择圈
    drawGroundCircle(ctx, project, hp.x, hp.y, H0(hp.x, hp.y) + 6, 40, TEAM_HP[0], 2.5);
    if (this.showHealthBars()) {
      for (const e of ents) {
        const isB = e.kind === 'tower';
        if (isB && e.hp >= e.maxHp) continue;
        if (e.kind !== 'tower' && this.fogged(e.x, e.y, e.team)) continue;
        const kind = isB ? 'building' : e.kind === 'hero' ? 'hero' : 'unit';
        const p = project(e.x, e.y, H0(e.x, e.y) + BAR_Z[kind]);
        if (!p) continue;
        const isHero = kind === 'hero';
        drawUnitBar(ctx, {
          x: p.x,
          y: p.y,
          kind,
          hp: isHero ? this.heroHp() / Math.max(1, this.heroHpMax()) : e.hp / Math.max(1, e.maxHp),
          color: e.team === -1 ? TEAM_HP[2] : e.team === myTeam ? TEAM_HP[0] : TEAM_HP[1],
          mp: isHero ? this.heroMp() / Math.max(1, this.heroMpMax()) : 0,
          label: isHero ? `${this.player() || 'wuxiancong'} · ${this.heroLevel()}` : undefined,
          labelColor: readableColor(PLAYER_COLORS[0]),
        });
      }
    }
    for (const ft of mdx.getSimFloatingTexts()) {
      const p = project(ft.x, ft.y, ft.z);
      if (p) drawFloatText(ctx, p.x, p.y, ft.text, ft.color, 0.95);
    }
  }

  private readQuery(): void {
    const q = this.route.snapshot.queryParamMap;
    this.matchId.set(q.get('matchId') || '');
    this.player.set(q.get('player') || 'wuxiancong');
    this.hero.set(q.get('hero') || '');
    this.timelineSec.set(Number(q.get('t') || 0) || 0);
    this.isLive.set(q.get('live') === '1');
    this.debugMode.set(q.has('debug'));
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
      // 与对战页引擎一致：塔、兵营、遗迹、泉水上小地图，商店不显示
      const list = (cfg.buildings || []).flatMap((b: DotaBuilding) => {
        const kind =
          b.kind === 'tower' ? 'tower' : b.kind === 'ancient' ? 'ancient' : b.kind === 'rax_melee' || b.kind === 'rax_range' || b.kind === 'fountain' ? 'rax' : null;
        return kind && (b.team === 0 || b.team === 1) ? [{ x: b.x, y: b.y, team: b.team as 0 | 1, kind: kind as 'tower' | 'rax' | 'ancient' }] : [];
      });
      this.minimapBuildings.set(list);
    } catch {
      /* ignore */
    }
  }

  private async readApiJson<T>(res: Response): Promise<T | null> {
    const ct = res.headers.get('content-type') || '';
    if (!res.ok) return null;
    // Vite CSR 回退到 index.html 时不是 JSON，避免把录像列表/技能冲成空
    if (!ct.includes('application/json')) {
      console.warn('[replay-3d] API 未返回 JSON（可能 SSR/Express 未启动）', res.url, ct);
      return null;
    }
    return (await res.json()) as T;
  }

  private async loadReplayData(opts?: { file?: string }): Promise<void> {
    try {
      const player = this.player() || 'wuxiancong';
      if (!this.matchList().length) {
        const listRes = await fetch(`/api/replay/matches?player=${encodeURIComponent(player)}`);
        const listJson = await this.readApiJson<{ matches?: ReplayMatchSummary[] }>(listRes);
        if (listJson?.matches?.length) {
          this.matchList.set(listJson.matches);
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
      const payload = await this.readApiJson<ReplayMatchPayload>(res);
      if (!payload) return;
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
    // 手动选中英雄预设时，不被录像英雄覆盖名称/图标
    if (!this.heroPresetLocked()) {
      // 模型始终是当前录像的英雄：按单位代码对到 112 英雄表，换英雄时连模型一起换
      const replayHero = getHeroByCode(state.heroCode);
      if (replayHero && replayHero.key !== this.currentHeroKey()) this.applyHeroRosterEntry(replayHero, false);
      this.heroNameCn.set(state.heroName);
      this.heroTitle.set(state.heroClassTitle);
      if (state.heroIcon) this.heroIcon.set(state.heroIcon);
    }
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
    // 属性附加仅已学时显示；学习技能（O）始终保留（无点数灰显）；系统命令图标走本地 BLP 解码资源
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
    // basicCommand 已在 timeline.sampleAt 与 isMoving 收敛（到达后不再锁死「移动」）
    const cmd = state.basicCommand || '';
    const cmdLabels: Record<string, string> = {
      move: '移动',
      stop: '停止',
      hold: '保持原位',
      attack: '攻击',
      patrol: '巡逻',
    };
    this.basicCommandLabel.set(cmdLabels[cmd] || '无');
    // 德鲁伊预设锁定命令卡（含独立 1 技能熊灵），不被录像技能覆盖
    if (this.currentHeroKey() === 'n01o') {
      this.applyLoneDruidCommandSlots(cmd);
    } else {
      const prev = this.commandSlots();
      const mapSkill = (
        s: (typeof s0) | undefined,
        fallbackId: string,
        prevIdx: number
      ): CommandCardSlot => {
        // 录像缺技能或图标路径为空时保留旧槽，避免把命令卡冲成空白
        if (s && s.icon) {
          return {
            id: s.code,
            hotkey: s.hotkey,
            name: s.name,
            level: s.level,
            maxLevel: s.maxLevel,
            icon: s.icon,
            unlearned: s.level === 0,
          };
        }
        const keep = prev[prevIdx];
        if (keep?.icon) return keep;
        return { id: fallbackId, hotkey: '', name: '', level: 0, icon: '' };
      };
      this.commandSlots.set([
        { id: 'move', hotkey: 'M', name: '移动', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNMove.png', active: cmd === 'move' },
        { id: 'stop', hotkey: 'S', name: '停止', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNStop.png', active: cmd === 'stop' },
        { id: 'hold', hotkey: 'H', name: '保持原位', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNHoldPosition.png', active: cmd === 'hold' },
        { id: 'attack', hotkey: 'A', name: '攻击', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNAttack.png', active: cmd === 'attack' },
        { id: 'patrol', hotkey: 'P', name: '巡逻', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNPatrol.png', active: cmd === 'patrol' },
        { id: 'empty1', hotkey: '', name: '', level: 0, icon: '' },
        statUpSlot,
        learnSlot,
        mapSkill(s0, 'sk1', 8),
        mapSkill(s1, 'sk2', 9),
        mapSkill(s2, 'sk3', 10),
        mapSkill(s3, 'sk4', 11),
      ]);
    }

    if (this.mdx) {
      // 手动预设锁定期间跳过录像模型切换
      if (
        !this.heroPresetLocked() &&
        !getHeroByCode(state.heroCode) &&
        state.heroModelUrl &&
        state.heroModelUrl !== this.currentHeroModelUrl
      ) {
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

  /** 等 flex 布局给出真实宽高；已有尺寸则立刻返回 */
  private async waitForViewport(canvas: HTMLCanvasElement, maxMs = 400): Promise<void> {
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
    // 地形就绪即结束 loading 并开渲，不再等英雄/兵线全部加载完
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
    const replayReady = this.loadReplayData();

    try {
      // 先等录像数据（最多 8 秒）：拿到录像英雄再建模型，免得先出现先知再换成录像英雄
      await Promise.race([replayReady, new Promise<void>((r) => setTimeout(r, 8000))]);
      if (this.disposed) return;
      const rect = canvas.getBoundingClientRect();
      const parent = canvas.parentElement?.getBoundingClientRect();
      canvas.width = Math.max(640, Math.floor(Math.max(rect.width, parent?.width || 0)) || 1280);
      canvas.height = Math.max(360, Math.floor(Math.max(rect.height, parent?.height || 0)) || 720);

      // 直接加载当前录像的英雄；录像读不到时才用先知 MalFurionNoStag 兜底
      const furion = getHeroByKey('emns');
      const replayHeroCode = this.timeline?.sampleAt(this.currentMs()).heroCode || '';
      const firstHero = (replayHeroCode && getHeroByCode(replayHeroCode)) || furion;
      const modelUrl =
        firstHero?.modelUrl || '/assets/wc3/Units/NightElf/MalFurion/MalFurionNoStag.mdxbin';
      const assetBaseUrl =
        firstHero?.assetBaseUrl || '/assets/wc3/Units/NightElf/MalFurion/';

      const mdx = await Wc3MdxViewer.create({
        canvas,
        viewLayer: this.viewLayer()?.nativeElement,
        modelUrl,
        assetBaseUrl,
        teamColor: 0,
        initialSequence: 'Stand',
        syncOverrides: this.syncOverridesFromQuery() as any,
      });
      this.mdx = mdx;
      // 调试模式：控制台可用 __wc3.setBakedShadows(false) / __wc3.setTimeOfDay(h) 对比
      if (this.debugMode()) (globalThis as unknown as { __wc3?: unknown }).__wc3 = mdx;
      this.currentHeroModelUrl = modelUrl;

      this.minimapImg = new Image();
      this.minimapImg.src = '/assets/dota/dota683_minimap.png';

      const loadPromise = mdx.load();
      // 地形 mesh 一就绪就显示画面（startLoop 已在 load 内启动）
      const terrainWaitStart = performance.now();
      while (!mdx.terrainReady && performance.now() - terrainWaitStart < 60000 && !this.disposed) {
        await new Promise<void>((r) => setTimeout(r, 30));
      }
      mdx.resizeToContainer();
      this.pollSequence();
      this.loading.set(false);

      try {
        await loadPromise;
      } finally {
        if (this.disposed) {
          mdx.dispose();
          return;
        }
        // 模型用当前录像的英雄；录像还没到时先用先知占位（不锁定，录像一到即切换）
        const replayCode = this.timeline?.sampleAt(this.currentMs()).heroCode || '';
        const startHero = (replayCode && getHeroByCode(replayCode)) || furion;
        if (startHero) this.applyHeroRosterEntry(startHero, false);
        this.spiritBearSummoned = false;
        this.sequences.set(mdx.sequences || []);
        this.buildingCount.set(mdx.buildings?.length || 0);
        this.cameraMode.set(mdx.cameraMode || 'hero');
        this.ensureSimAlwaysOn();
        this.simUnits.set(mdx.simUnitCount || 0);
        this.applyReplayFrame(this.currentMs());
        this.syncActiveSequence();
        const pCanvas = this.portraitCanvas()?.nativeElement;
        if (pCanvas) {
          void mdx.attachPortraitCanvas(pCanvas);
        }
        mdx.resizeToContainer();
        requestAnimationFrame(() => {
          mdx.resizeToContainer();
          requestAnimationFrame(() => mdx.resizeToContainer());
        });
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
      if (attempt < 1 && !this.disposed) {
        this.mdx?.dispose();
        this.mdx = undefined;
        await new Promise((r) => setTimeout(r, 200));
        return this.boot(attempt + 1);
      }
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

      // 寻路栅格就绪后给时间线接上寻路（只做一次）：英雄按命令点寻路行走，不再直线穿地形
      if (this.timeline && !this.timeline.hasPathFinder && this.mdx?.pathReady) {
        const mdx = this.mdx;
        this.timeline.setPathFinder((ax, ay, bx, by) => mdx.findPath(ax, ay, bx, by));
        this.applyReplayFrame(this.currentMs());
      }

      this.syncActiveSequence();
      // 仅号角后时钟驱动；无 GameStart 时 gameT=0 绝不刷兵；有录像时墙钟恒为 0
      if (this.timeline) {
        const horn = this.timeline.gameHornMs || 0;
        // 未解析到战鼓号角前，对局时钟视为未开始（避免 firstMove 被误当成已开打）
        // 负数 = 战鼓还没响：模拟不出兵、不刷野、不刷神符，并清掉拖回开局前残留的单位
        const gameT = horn > 0 ? this.currentMs() - horn : -1;
        this.mdx?.setSimSpeed(0);
        this.mdx?.syncSimGameTime(gameT);
      } else {
        // 录像未到：保持模拟暂停，禁止墙钟空转出兵
        this.mdx?.setSimSpeed(0);
      }
      this.cameraMode.set(this.mdx?.cameraMode || this.cameraMode());
      this.simUnits.set(this.mdx?.simUnitCount || 0);
      if (now - this.minimapDrawnAt >= 100) {
        this.minimapDrawnAt = now;
        this.updateMinimapMarker();
      }
      // 模板被热替换重建时，把仍在工作的画布/输入层接回来（否则 3D 视口一片漆黑）
      this.mdx?.adoptDom({ canvas: this.glCanvas()?.nativeElement, viewLayer: this.viewLayer()?.nativeElement, portrait: this.portraitCanvas()?.nativeElement });
      // 地形与模型按 DNC 昼夜光照着色（取代原来的全屏夜色遮罩）
      this.mdx?.setTimeOfDay(this.hours());
      this.updateFog();
      this.drawReplayOverlay();
      if (this.mdx) {
        this.gold.set(this.mdx.getSimGoldTotal());
      }

      this.seqPoll = requestAnimationFrame(tick);
    };
    this.seqPoll = requestAnimationFrame(tick);
  }
}
