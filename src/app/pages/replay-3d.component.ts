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
  mapPixelToWorld,
  worldToMapPixel,
} from '../replay3d/dota-map';

/** Layout % measured from MPQ-assembled NightElf UITiles (console-assembled.png 1024×217). */
const CF = {
  mm: { l: 1.37, t: 22.12, w: 16.99, h: 72.35 },
  port: { l: 27.54, t: 25.35, w: 8.11, h: 55.3 },
  hp: { l: 27.54, t: 82.03, w: 8.11, h: 6.45 },
  mp: { l: 27.54, t: 88.94, w: 8.11, h: 5.53 },
  info: { l: 38.57, t: 25.35, w: 23.44, h: 66.82 },
  inv: { l: 63.48, t: 22.12, w: 12.21, h: 72.35 },
  cmd: { l: 76.66, t: 19.35, w: 21.97, h: 75.12 },
};

@Component({
  selector: 'app-replay-3d',
  standalone: true,
  imports: [RouterLink, NgClass],
  host: { class: 'flex flex-col flex-grow' },
  styles: [
    `
      .wc3-topbar {
        width: 100%;
        aspect-ratio: 1024 / 62;
        background: url('/assets/wc3/ui/topbar-assembled.png') center / 100% 100% no-repeat;
        position: relative;
        z-index: 20;
        flex-shrink: 0;
      }
      .wc3-console {
        width: 100%;
        aspect-ratio: 1024 / 217;
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
        object-fit: cover;
        pointer-events: none;
        display: block;
      }
      .wc3-port {
        overflow: hidden;
        background: radial-gradient(circle at 35% 25%, #4a3a22, #120c08 72%);
      }
      .wc3-bar {
        position: relative;
        overflow: hidden;
        border: 1px solid rgba(0, 0, 0, 0.75);
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
        font-size: 9px;
        font-weight: 700;
        color: #fff;
        text-shadow: 0 1px 2px #000;
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
        font-size: clamp(10px, 1.1vw, 13px);
        text-shadow: 0 1px 2px #000;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 2px;
        padding: 2px 4px;
        pointer-events: none;
      }
      .wc3-info .name {
        font-weight: 900;
        color: #f5e6b8;
        font-size: 1.15em;
      }
      .wc3-info .sub {
        color: #c4a060;
        font-size: 0.85em;
      }
      .wc3-info .row {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      .wc3-info .row img {
        width: 14px;
        height: 14px;
        image-rendering: pixelated;
      }
      .wc3-grid {
        display: grid;
        width: 100%;
        height: 100%;
        gap: 2.2%;
      }
      .wc3-grid-inv {
        grid-template-columns: 1fr 1fr;
        grid-template-rows: 1fr 1fr 1fr;
      }
      .wc3-grid-cmd {
        grid-template-columns: 1fr 1fr 1fr 1fr;
        grid-template-rows: 1fr 1fr 1fr;
      }
      .wc3-slot {
        position: relative;
        border: 0;
        padding: 0;
        background: #050505 url('/assets/wc3/ui/console/nightelf/nightelf-inventory-slotfiller.png')
          center / cover no-repeat;
        box-shadow: inset 0 0 0 1px rgba(90, 70, 40, 0.35);
        overflow: hidden;
      }
      .wc3-slot.has-item,
      .wc3-slot.has-cmd {
        background: #0a0a0a url('/assets/wc3/ui/assembled/tiles/Human_human-console-button-up.png')
          center / 100% 100% no-repeat;
      }
      .wc3-slot .lbl {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: clamp(8px, 0.75vw, 11px);
        font-weight: 800;
        color: #f0e0b0;
        text-shadow: 0 1px 2px #000;
        line-height: 1.05;
        text-align: center;
        padding: 1px;
      }
      .wc3-slot .hk {
        position: absolute;
        right: 2px;
        bottom: 1px;
        font-size: 8px;
        font-weight: 900;
        color: #ffe08a;
        text-shadow: 0 1px 1px #000;
      }
      .wc3-slot .lv {
        position: absolute;
        left: 2px;
        top: 1px;
        font-size: 8px;
        font-weight: 900;
        color: #b8ff7a;
        text-shadow: 0 1px 1px #000;
      }
      .wc3-slot .ico {
        width: 100%;
        height: 100%;
        object-fit: cover;
        image-rendering: pixelated;
        pointer-events: none;
        display: block;
      }
      .wc3-port img {
        image-rendering: auto;
      }
      .wc3-cam {
        position: absolute;
        width: 10px;
        height: 8px;
        margin-left: -5px;
        margin-top: -4px;
        border: 1px solid #9ff;
        background: rgba(80, 220, 255, 0.15);
        pointer-events: none;
      }
      .wc3-cam-dot {
        position: absolute;
        width: 6px;
        height: 6px;
        margin-left: -3px;
        margin-top: -3px;
        background: #ffe14a;
        border: 1px solid #fff;
        pointer-events: none;
      }
    `,
  ],
  template: `
    <main class="flex-grow flex flex-col bg-black text-[var(--text-main)] min-h-[calc(100vh-64px)]">
      <div class="flex flex-wrap items-center gap-2 px-3 py-1 border-b border-white/10 bg-black/85 text-[10px] shrink-0">
        <a routerLink="/matches" class="opacity-60 hover:opacity-100 hover:text-accent flex items-center gap-1">
          <span class="material-icons text-sm">arrow_back</span>返回
        </a>
        <span class="text-accent font-black italic uppercase tracking-tight">3D 录像 · DotA 6.83</span>
        <span class="opacity-50 truncate max-w-[28vw]">{{ matchLabel() }}</span>
        <div class="flex-1"></div>
        <button type="button" (click)="setCameraMode('hero')" class="px-2 py-0.5 border rounded"
                [ngClass]="cameraMode() === 'hero' ? 'border-accent text-accent' : 'border-white/20'">英雄</button>
        <button type="button" (click)="setCameraMode('free')" class="px-2 py-0.5 border rounded"
                [ngClass]="cameraMode() === 'free' ? 'border-accent text-accent' : 'border-white/20'">自由</button>
        <button type="button" (click)="setCameraMode('map')" class="px-2 py-0.5 border rounded"
                [ngClass]="cameraMode() === 'map' ? 'border-accent text-accent' : 'border-white/20'">全图</button>
        <button type="button" (click)="toggleSim()" class="px-2 py-0.5 border rounded"
                [ngClass]="simOn() ? 'border-emerald-400 text-emerald-300' : 'border-white/20'">
          {{ simOn() ? '模拟ON' : '模拟OFF' }}
        </button>
        <button type="button" (click)="showDebug.set(!showDebug())" class="px-2 py-0.5 border border-white/20 rounded">
          {{ showDebug() ? '隐藏调试' : '调试' }}
        </button>
      </div>

      <div class="flex flex-col lg:flex-row flex-grow min-h-0">
        <div class="relative flex-grow min-h-[480px] lg:min-h-0 bg-[#05080c] flex flex-col">
          <!-- MPQ NightElf UITiles → topbar-assembled.png -->
          <div class="wc3-topbar pointer-events-none">
            <div class="wc3-abs flex items-center gap-1.5 px-[1%] h-full pointer-events-auto"
                 style="left:1%; right:28%; top:0">
              <span class="text-[9px] text-[#9f9] font-bold bg-black/50 px-1 rounded">v6.83d · {{ pingMs() }}ms</span>
            </div>
            <div class="wc3-abs flex items-center justify-end gap-3 h-full pr-[1%] pointer-events-none text-[11px] font-bold text-[#f0e0b0]"
                 style="left:70%; right:1%; top:0">
              <span><img class="inline w-3.5 h-3.5 mr-0.5 align-middle" src="/assets/wc3/ui/console/human/infocard-gold.png" alt="" />{{ gold() }}</span>
              <span>{{ lumber() }}</span>
              <span><img class="inline w-3.5 h-3.5 mr-0.5 align-middle" src="/assets/wc3/ui/console/human/infocard-supply.png" alt="" />{{ food() }}</span>
            </div>
          </div>

          <div class="relative flex-grow min-h-0">
            <canvas #glCanvas width="1280" height="720"
                    class="absolute inset-0 w-full h-full block z-0 pointer-events-none"></canvas>
            <div #viewLayer
                 class="absolute inset-0 z-[1] pointer-events-auto bg-[#05080c] bg-no-repeat"
                 style="background-size:100% 100%"></div>

            @if (loading()) {
              <div class="absolute top-3 left-3 z-10 pointer-events-none">
                <div class="flex items-center gap-2 px-3 py-1.5 rounded bg-black/70 border border-white/15 text-accent font-bold uppercase tracking-widest text-[11px]">
                  <span class="material-icons animate-spin text-sm">autorenew</span>
                  加载中…
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

          <!-- MPQ NightElf UITile01–04 → console-assembled.png -->
          <div class="wc3-console">
            <button type="button" class="wc3-abs wc3-mm" title="点击小地图移动镜头"
                    [style.left.%]="cf.mm.l" [style.top.%]="cf.mm.t"
                    [style.width.%]="cf.mm.w" [style.height.%]="cf.mm.h"
                    (click)="onMinimapClick($event)">
              <img src="/assets/dota/dota683_minimap.png" alt="minimap" draggable="false" />
              <span class="wc3-cam-dot"
                    [style.left.%]="minimapCamPct().x"
                    [style.top.%]="minimapCamPct().y"></span>
              <span class="wc3-cam"
                    [style.left.%]="minimapCamPct().x"
                    [style.top.%]="minimapCamPct().y"></span>
            </button>

            <div class="wc3-abs wc3-port"
                 [style.left.%]="cf.port.l" [style.top.%]="cf.port.t"
                 [style.width.%]="cf.port.w" [style.height.%]="cf.port.h">
              <img class="w-full h-full object-cover"
                   src="/assets/wc3/ui/icons/hero/BTNHeroBlademaster.png"
                   alt="portrait"
                   draggable="false" />
            </div>

            <div class="wc3-abs wc3-bar wc3-hp"
                 [style.left.%]="cf.hp.l" [style.top.%]="cf.hp.t"
                 [style.width.%]="cf.hp.w" [style.height.%]="cf.hp.h">
              <i [style.width.%]="heroHpPct()"></i>
              <span>{{ heroHp() }}/{{ heroHpMax() }}</span>
            </div>
            <div class="wc3-abs wc3-bar wc3-mp"
                 [style.left.%]="cf.mp.l" [style.top.%]="cf.mp.t"
                 [style.width.%]="cf.mp.w" [style.height.%]="cf.mp.h">
              <i [style.width.%]="heroMpPct()"></i>
              <span>{{ heroMp() }}/{{ heroMpMax() }}</span>
            </div>

            <div class="wc3-abs wc3-info"
                 [style.left.%]="cf.info.l" [style.top.%]="cf.info.t"
                 [style.width.%]="cf.info.w" [style.height.%]="cf.info.h">
              <div class="name">{{ heroNameCn() }}</div>
              <div class="sub">等级 {{ heroLevel() }} {{ heroTitle() }}</div>
              <div class="row mt-1">
                <img src="/assets/wc3/ui/console/human/infocard-attack-melee.png" alt="" />
                <span>{{ heroAtk() }}</span>
                <img src="/assets/wc3/ui/console/human/infocard-armor-hero.png" alt="" />
                <span>{{ heroArmor() }}</span>
              </div>
              <div class="row">
                <img src="/assets/wc3/ui/console/human/infocard-heroattributes-str.png" alt="" />
                <span>{{ heroStr() }}</span>
                <img src="/assets/wc3/ui/console/human/infocard-heroattributes-agi.png" alt="" />
                <span>{{ heroAgi() }}</span>
                <img src="/assets/wc3/ui/console/human/infocard-heroattributes-int.png" alt="" />
                <span>{{ heroInt() }}</span>
              </div>
            </div>

            <div class="wc3-abs"
                 [style.left.%]="cf.inv.l" [style.top.%]="cf.inv.t"
                 [style.width.%]="cf.inv.w" [style.height.%]="cf.inv.h">
              <div class="wc3-grid wc3-grid-inv">
                @for (it of itemSlots; track $index) {
                  <div class="wc3-slot" [class.has-item]="!!it.icon" [title]="it.name || '物品栏'">
                    @if (it.icon) {
                      <img class="ico" [src]="it.icon" [alt]="it.name" draggable="false" />
                    }
                  </div>
                }
              </div>
            </div>

            <div class="wc3-abs"
                 [style.left.%]="cf.cmd.l" [style.top.%]="cf.cmd.t"
                 [style.width.%]="cf.cmd.w" [style.height.%]="cf.cmd.h">
              <div class="wc3-grid wc3-grid-cmd">
                @for (sk of commandSlots; track sk.id) {
                  <button type="button" class="wc3-slot" [class.has-cmd]="!!sk.icon"
                          [title]="sk.name || ''" disabled>
                    @if (sk.icon) {
                      <img class="ico" [src]="sk.icon" [alt]="sk.name" draggable="false" />
                    }
                    @if (sk.hotkey) {
                      <span class="hk">{{ sk.hotkey }}</span>
                    }
                    @if (sk.level > 0) {
                      <span class="lv">{{ sk.level }}</span>
                    }
                  </button>
                }
              </div>
            </div>
          </div>
        </div>

        @if (showDebug()) {
          <aside class="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-white/10 bg-[#0b1118] p-3 space-y-3 overflow-y-auto">
            <section class="space-y-1.5">
              <h2 class="text-xs font-black uppercase tracking-widest text-accent">动作</h2>
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
              <p>装饰 {{ buildingCount() }} · 模拟单位 {{ simUnits() }}</p>
              <p>动作 {{ activeSequenceName() || '—' }}</p>
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
  readonly player = signal('');
  readonly hero = signal('');
  readonly timelineSec = signal(0);
  readonly isLive = signal(false);
  readonly matchLabel = signal('本地预览');
  readonly cameraMode = signal<'hero' | 'map' | 'free'>('hero');
  readonly buildingCount = signal(0);
  readonly simUnits = signal(0);
  readonly simOn = signal(true);
  readonly showDebug = signal(false);

  readonly minimapCamPct = signal({ x: 50, y: 50 });

  readonly heroNameCn = signal('剑圣');
  readonly heroTitle = signal('刃甲武士');
  readonly heroLevel = signal(1);
  readonly heroHp = signal(825);
  readonly heroHpMax = signal(825);
  readonly heroMp = signal(255);
  readonly heroMpMax = signal(255);
  readonly heroStr = signal(22);
  readonly heroAgi = signal(22);
  readonly heroInt = signal(16);
  readonly heroAtk = signal('42-54');
  readonly heroArmor = signal(4);
  readonly heroHpPct = signal(100);
  readonly heroMpPct = signal(100);
  readonly gold = signal(625);
  readonly lumber = signal(0);
  readonly food = signal(5);
  readonly pingMs = signal(2);

  /** Icons from WAR3.MPQ ReplaceableTextures\\CommandButtons (BTNWindWalkOn included). */
  readonly commandSlots = [
    { id: 'move', hotkey: 'M', name: '移动', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNMove.png' },
    { id: 'stop', hotkey: 'S', name: '停止', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNStop.png' },
    { id: 'hold', hotkey: 'H', name: '保持原位', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNHoldPosition.png' },
    { id: 'attack', hotkey: 'A', name: '攻击', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNAttack.png' },
    { id: 'patrol', hotkey: 'P', name: '巡逻', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNPatrol.png' },
    { id: 'empty1', hotkey: '', name: '', level: 0, icon: '' },
    {
      id: 'crit',
      hotkey: 'C',
      name: '致命一击',
      level: 1,
      icon: '/assets/wc3/ui/icons/ability/BTNCriticalStrike.png',
    },
    {
      id: 'mirror',
      hotkey: 'R',
      name: '镜像',
      level: 1,
      icon: '/assets/wc3/ui/icons/ability/BTNMirrorImage.png',
    },
    {
      id: 'wind',
      hotkey: 'W',
      name: '疾风步',
      level: 1,
      icon: '/assets/wc3/ui/icons/ability/BTNWindWalkOn.png',
    },
    { id: 'empty2', hotkey: '', name: '', level: 0, icon: '' },
    {
      id: 'ult',
      hotkey: 'B',
      name: '剑刃风暴',
      level: 0,
      icon: '/assets/wc3/ui/icons/ability/BTNWhirlwind.png',
    },
    { id: 'learn', hotkey: '', name: '学习技能', level: 0, icon: '/assets/wc3/ui/icons/cmd/BTNStatUp.png' },
  ];

  readonly itemSlots = [
    {
      name: '速度之靴',
      icon: '/assets/wc3/ui/icons/item/BTNBootsOfSpeed.png',
    },
    { name: '', icon: '' },
    { name: '', icon: '' },
    { name: '', icon: '' },
    { name: '', icon: '' },
    { name: '', icon: '' },
  ];

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
  }

  private readQuery(): void {
    const q = this.route.snapshot.queryParamMap;
    this.matchId.set(q.get('matchId') || '');
    this.player.set(q.get('player') || '');
    this.hero.set(q.get('hero') || '');
    this.timelineSec.set(Number(q.get('t') || 0) || 0);
    this.isLive.set(q.get('live') === '1');
    const parts = [this.player(), this.matchId(), this.hero()].filter(Boolean);
    this.matchLabel.set(parts.length ? parts.join(' · ') : '本地预览（无对局参数）');
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

  private async boot(): Promise<void> {
    const canvas = this.glCanvas()?.nativeElement;
    if (!canvas) {
      this.error.set('视口未就绪');
      this.loading.set(false);
      return;
    }

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
      this.loading.set(false);
      try {
        await mdx.load();
      } finally {
        this.modelName.set('HeroBladeMaster');
        this.sequences.set(mdx.sequences || []);
        this.buildingCount.set(mdx.buildings?.length || 0);
        this.cameraMode.set(mdx.cameraMode || 'hero');
        this.simOn.set(!!mdx.simEnabled);
        this.simUnits.set(mdx.simUnitCount || 0);
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
    const tick = () => {
      if (this.disposed) return;
      this.syncActiveSequence();
      this.cameraMode.set(this.mdx?.cameraMode || this.cameraMode());
      this.simUnits.set(this.mdx?.simUnitCount || 0);
      this.updateMinimapMarker();
      this.seqPoll = requestAnimationFrame(tick);
    };
    this.seqPoll = requestAnimationFrame(tick);
  }
}
