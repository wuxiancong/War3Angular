import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Wc3MdxViewer } from '../replay3d/wc3-mdx-viewer';
import { DOTA_MAP_BOUNDS, mapPixelToWorld, worldToMapPixel, type DotaBuilding } from '../replay3d/dota-map';
import {
  loadGameplayData,
  loadPathingData,
  resolveAbilityFx,
  type AbilityDef,
  type GameplayData,
  type HeroDef,
  type ItemDef,
} from '../game/game-data';
import { GameEngine, type Command, type GameSetup, type PlayerSetup, type Unit } from '../game/game-engine';
import { GameSession, RoomConnection, type LobbyState, type StartPayload } from '../game/game-session';
import { GameView, PLAYER_COLORS } from '../game/game-view';

interface SkillHud {
  slot: number;
  code: string;
  name: string;
  icon: string;
  hotkey: string;
  level: number;
  maxLevel: number;
  cdSec: number;
  cdPct: number;
  cost: number;
  noMana: boolean;
  passive: boolean;
  canLearn: boolean;
  implemented: boolean;
  tip: string;
}
interface ItemHud {
  code: string;
  name: string;
  icon: string;
  charges: number;
  cdSec: number;
  usable: boolean;
  desc: string;
}
interface ScoreRow {
  slot: number;
  player: string;
  hero: string;
  icon: string;
  level: number;
  k: number;
  d: number;
  a: number;
  lh: number;
  dn: number;
  gold: number;
  alive: boolean;
  respawn: number;
  color: string;
  isBot: boolean;
}
interface Hud {
  clock: string;
  gold: number;
  name: string;
  proper: string;
  icon: string;
  level: number;
  xpPct: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  hpRegen: string;
  mpRegen: string;
  str: number;
  agi: number;
  int: number;
  primary: string;
  dmg: string;
  armor: string;
  armorPct: number;
  speed: number;
  atkInterval: string;
  range: number;
  kda: string;
  lh: string;
  skillPoints: number;
  respawn: number;
  buffs: string[];
  skills: SkillHud[];
  items: (ItemHud | null)[];
  radiantKills: number;
  direKills: number;
  score: ScoreRow[];
  target: { name: string; hp: number; maxHp: number; mp: number; maxMp: number; dmg: string; armor: string; team: number; level: number } | null;
  net: string;
}

type Targeting =
  | { kind: 'skill'; slot: number; mode: 'unit' | 'point'; ally: boolean; label: string }
  | { kind: 'item'; inv: number; mode: 'point'; label: string }
  | { kind: 'attack'; label: string }
  | { kind: 'move'; label: string };

const BUFF_NAMES: Record<string, string> = {
  stun: '眩晕', slow: '减速', haste: '极速', dd: '双倍伤害', regen: '恢复', invis: '隐身', hot: '生命恢复', mot: '魔法恢复',
};
const ITEM_KEYS = ['7', '8', '4', '5', '1', '2'];

@Component({
  selector: 'app-play-3d',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col flex-grow' },
  styles: [
    `
      .pg-root { color: #e8e2d0; --gold: #d4af37; --panel: rgba(10, 14, 20, 0.92); --line: rgba(212, 175, 55, 0.35); }
      .pg-panel { background: var(--panel); border: 1px solid var(--line); border-radius: 0.5rem; }
      .pg-btn { border: 1px solid var(--line); background: rgba(20, 26, 36, 0.95); color: #f0e0b0; border-radius: 0.375rem; padding: 0.4rem 0.9rem; font-weight: 700; font-size: 13px; transition: all 0.15s; cursor: pointer; }
      .pg-btn:hover:not(:disabled) { border-color: #f0c060; color: #fff; background: rgba(60, 46, 14, 0.9); }
      .pg-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .pg-btn.primary { background: linear-gradient(180deg, #8a6a14, #5a4208); border-color: #e0b84a; color: #fff; }
      .pg-input { background: #0b0f16; border: 1px solid var(--line); border-radius: 0.375rem; padding: 0.35rem 0.6rem; color: #e8e2d0; font-size: 13px; outline: none; }
      .pg-input:focus { border-color: #f0c060; }
      .hero-cell { position: relative; width: 48px; height: 48px; border: 2px solid transparent; border-radius: 4px; overflow: hidden; cursor: pointer; background: #111; }
      .hero-cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .hero-cell:hover { border-color: #f0c060; }
      .hero-cell.sel { border-color: #22c55e; box-shadow: 0 0 10px #22c55e; }
      .hud-slot { position: relative; width: 52px; height: 52px; background: #05070a; border: 1px solid #5a4a1c; border-radius: 3px; overflow: hidden; cursor: pointer; }
      .hud-slot img { width: 100%; height: 100%; display: block; }
      .hud-slot:hover { border-color: #f0c060; }
      .hud-slot .hk { position: absolute; left: 2px; top: 0; font-size: 11px; font-weight: 800; color: #fde68a; text-shadow: 0 0 3px #000, 0 0 3px #000; }
      .hud-slot .lv { position: absolute; right: 2px; bottom: 0; font-size: 11px; font-weight: 800; color: #fff; text-shadow: 0 0 3px #000, 0 0 3px #000; }
      .hud-slot .cd { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.72); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 15px; color: #fff; }
      .hud-slot.dim img { filter: grayscale(1) brightness(0.45); }
      .hud-slot.nomana img { filter: saturate(0.4) hue-rotate(180deg) brightness(0.7); }
      .hud-slot.learn { box-shadow: 0 0 0 2px #fde047 inset, 0 0 10px #fde047; }
      .hud-slot.active { box-shadow: 0 0 0 2px #38bdf8 inset; }
      .bar { position: relative; height: 16px; background: #0a0a0a; border: 1px solid #333; border-radius: 2px; overflow: hidden; font-size: 11px; font-weight: 700; }
      .bar > i { position: absolute; left: 0; top: 0; bottom: 0; display: block; }
      .bar > span { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-shadow: 0 0 3px #000; }
      .tip { position: fixed; z-index: 200; max-width: 340px; pointer-events: none; background: rgba(6, 8, 12, 0.97); border: 1px solid #e0b84a; border-radius: 6px; padding: 8px 10px; font-size: 12px; line-height: 1.5; white-space: pre-wrap; }
      .tip b { color: #fde68a; font-size: 13px; }
      .shop-item { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border: 1px solid transparent; border-radius: 4px; cursor: pointer; }
      .shop-item:hover { border-color: #f0c060; background: rgba(60, 46, 14, 0.5); }
      .shop-item.blocked { opacity: 0.45; }
      .targeting { cursor: crosshair !important; }
      .scroll-thin { scrollbar-width: thin; scrollbar-color: #5a4a1c transparent; }
    `,
  ],
  template: `
    <div class="pg-root relative w-full select-none" style="height: calc(100vh - var(--app-header-height, 4.5rem)); min-height: 560px; background:#05080b">
      <!-- ============================== 大厅 ============================== -->
      @if (phase() === 'lobby' || phase() === 'room') {
        <div class="absolute inset-0 overflow-auto scroll-thin p-4 md:p-6">
          <div class="max-w-[1400px] mx-auto grid gap-4 grid-cols-1 xl:grid-cols-[minmax(280px,340px)_1fr_minmax(280px,360px)]">
            <!-- 左：模式 -->
            <div class="flex flex-col gap-4">
              <div class="pg-panel p-4">
                <div class="text-lg font-black text-[#f0c060] mb-1">网页对战 · DotA 6.83d</div>
                <div class="text-xs opacity-70 leading-relaxed">
                  浏览器内的魔兽争霸 III DotA 对战：数值取自地图 SLK，联机采用与 War3 相同的锁步指令同步。
                  <a routerLink="/replay-3d" class="text-[#7dd3fc] underline ml-1">去看录像回放 →</a>
                </div>
                <label class="block text-xs mt-3 mb-1 opacity-80">玩家昵称</label>
                <input class="pg-input w-full" maxlength="16" [value]="playerName()" (input)="setPlayerName($any($event.target).value)" />
              </div>

              @if (phase() === 'lobby') {
                <div class="pg-panel p-4">
                  <div class="font-black mb-2">单机练习（对战电脑）</div>
                  <div class="flex gap-2 mb-2">
                    <button class="pg-btn flex-1" [class.primary]="soloTeam() === 0" (click)="soloTeam.set(0)">近卫军团</button>
                    <button class="pg-btn flex-1" [class.primary]="soloTeam() === 1" (click)="soloTeam.set(1)">天灾军团</button>
                  </div>
                  <div class="flex gap-2 mb-3">
                    @for (m of soloModes; track m.n) {
                      <button class="pg-btn flex-1" [class.primary]="soloSize() === m.n" (click)="soloSize.set(m.n)">{{ m.label }}</button>
                    }
                  </div>
                  <button class="pg-btn primary w-full" [disabled]="!pickedHero() || busy()" (click)="startSolo()">
                    {{ pickedHero() ? '开始游戏' : '请先选择英雄' }}
                  </button>
                </div>

                <div class="pg-panel p-4">
                  <div class="flex items-center justify-between mb-2">
                    <div class="font-black">在线房间</div>
                    <button class="pg-btn" (click)="refreshRooms()">刷新</button>
                  </div>
                  <div class="flex gap-2 mb-2">
                    <input class="pg-input flex-1 min-w-0" placeholder="房间名称" maxlength="16" [value]="roomName()" (input)="roomName.set($any($event.target).value)" />
                    <button class="pg-btn primary" [disabled]="busy()" (click)="createRoom()">创建</button>
                  </div>
                  <div class="flex flex-col gap-1 max-h-56 overflow-auto scroll-thin">
                    @for (r of rooms(); track r.id) {
                      <div class="flex items-center justify-between text-sm px-2 py-1.5 rounded bg-white/5">
                        <span class="truncate">{{ r.name }} <span class="opacity-60">({{ r.players }}人 + {{ r.bots }}电脑)</span></span>
                        <button class="pg-btn" [disabled]="r.started || busy()" (click)="joinRoom(r.id)">{{ r.started ? '进行中' : '加入' }}</button>
                      </div>
                    } @empty {
                      <div class="text-xs opacity-50 py-2">暂无房间，创建一个并邀请好友打开本页面加入。</div>
                    }
                  </div>
                </div>
              }

              @if (phase() === 'room' && lobby(); as lb) {
                <div class="pg-panel p-4">
                  <div class="flex items-center justify-between mb-2">
                    <div class="font-black truncate">房间：{{ lb.name }}</div>
                    <button class="pg-btn" (click)="leaveRoom()">离开</button>
                  </div>
                  @for (team of [0, 1]; track team) {
                    <div class="text-xs font-bold mt-2 mb-1" [style.color]="team === 0 ? '#4ade80' : '#f87171'">{{ team === 0 ? '近卫军团' : '天灾军团' }}</div>
                    @for (i of [0, 1, 2, 3, 4]; track i) {
                      @let s = lb.slots[team * 5 + i];
                      <div class="flex items-center gap-2 text-sm px-2 py-1 rounded mb-1 bg-white/5">
                        <span class="w-3 h-3 rounded-sm shrink-0" [style.background]="colors[team * 5 + i]"></span>
                        @if (s) {
                          <img class="w-6 h-6 rounded-sm" [src]="heroIcon(s.heroCode)" alt="" />
                          <span class="truncate flex-1">{{ s.name }}{{ s.isHost ? ' (房主)' : '' }}{{ s.isBot ? ' [电脑]' : '' }} · {{ heroName(s.heroCode) }}</span>
                          @if (amHost() && !s.isHost) {
                            <button class="pg-btn !px-2 !py-0.5" (click)="roomAction({ action: 'kick', slot: team * 5 + i })">移除</button>
                          }
                        } @else {
                          <span class="flex-1 opacity-40">空位</span>
                          <button class="pg-btn !px-2 !py-0.5" (click)="roomAction({ action: 'slot', slot: team * 5 + i })">换到此位</button>
                          @if (amHost()) {
                            <button class="pg-btn !px-2 !py-0.5" (click)="addBot(team * 5 + i)">+电脑</button>
                          }
                        }
                      </div>
                    }
                  }
                  @if (amHost()) {
                    <div class="flex gap-2 mt-3">
                      <button class="pg-btn flex-1" (click)="fillBots()">空位补满电脑</button>
                      <button class="pg-btn primary flex-1" [disabled]="busy()" (click)="roomAction({ action: 'start', prepSec: 30 })">开始游戏</button>
                    </div>
                  } @else {
                    <div class="text-xs opacity-60 mt-3">等待房主开始游戏…</div>
                  }
                </div>
              }
              @if (errorMsg()) {
                <div class="pg-panel p-3 text-sm text-[#fca5a5]">{{ errorMsg() }}</div>
              }
            </div>

            <!-- 中：英雄选择 -->
            <div class="pg-panel p-4 min-w-0">
              <div class="flex items-center gap-3 mb-3 flex-wrap">
                <div class="font-black">选择英雄</div>
                <input class="pg-input w-48" placeholder="搜索英雄名" [value]="heroFilter()" (input)="heroFilter.set($any($event.target).value)" />
                <button class="pg-btn" (click)="pickRandomHero()">随机</button>
                <span class="text-xs opacity-60">共 {{ heroCount() }} 位英雄（酒馆数据来自地图 Sellunits）</span>
              </div>
              @if (!data()) {
                <div class="opacity-60 text-sm py-10 text-center">正在加载玩法数据…</div>
              }
              @for (g of heroGroups(); track g.title) {
                <div class="text-xs font-bold mt-3 mb-1" [style.color]="g.color">{{ g.title }}</div>
                <div class="flex flex-wrap gap-1.5">
                  @for (h of g.heroes; track h.id) {
                    <div class="hero-cell" [class.sel]="pickedHero() === h.id" (click)="pickHero(h.id)" [title]="h.name">
                      <img [src]="'/assets/dota/heroIcons/' + h.icon" [alt]="h.name" loading="lazy" />
                    </div>
                  }
                </div>
              }
            </div>

            <!-- 右：英雄详情 -->
            <div class="pg-panel p-4">
              @if (pickedDef(); as h) {
                <div class="flex items-center gap-3">
                  <img class="w-16 h-16 rounded border border-[#5a4a1c]" [src]="'/assets/dota/heroIcons/' + h.icon" alt="" />
                  <div class="min-w-0">
                    <div class="text-lg font-black text-[#f0c060] truncate">{{ h.name }}</div>
                    <div class="text-xs opacity-70 truncate">{{ h.proper }}</div>
                    <div class="text-xs opacity-70">{{ h.atk && h.atk.range > 200 ? '远程' : '近战' }} · 主属性 {{ primaryLabel(h.primary) }}</div>
                  </div>
                </div>
                <div class="grid grid-cols-3 gap-2 text-xs mt-3 text-center">
                  <div class="bg-white/5 rounded p-1.5"><div class="text-[#f87171] font-bold">力量</div>{{ h.str }} +{{ h.strGain }}</div>
                  <div class="bg-white/5 rounded p-1.5"><div class="text-[#4ade80] font-bold">敏捷</div>{{ h.agi }} +{{ h.agiGain }}</div>
                  <div class="bg-white/5 rounded p-1.5"><div class="text-[#60a5fa] font-bold">智力</div>{{ h.int }} +{{ h.intGain }}</div>
                </div>
                <div class="text-xs opacity-80 mt-2 leading-relaxed">
                  攻击距离 {{ h.atk?.range }} · 攻击间隔 {{ h.atk?.cool }} · 移动速度 {{ h.speed }} · 基础护甲 {{ h.armor }}
                </div>
                <div class="mt-3 flex flex-col gap-2">
                  @for (ab of pickedSkills(); track ab.code) {
                    <div class="flex gap-2 text-xs bg-white/5 rounded p-2">
                      <img class="w-9 h-9 rounded-sm shrink-0" [src]="'/assets/dota/abilityIcons/' + ab.code + '.png'" alt="" />
                      <div class="min-w-0">
                        <div class="font-bold text-[#fde68a]">{{ ab.name }} <span class="opacity-60">[{{ ab.hotkey }}]</span>
                          @if (!fxOf(ab).implemented) { <span class="text-[#fbbf24] font-normal">（脚本技能·未还原特效）</span> }
                        </div>
                        <div class="opacity-80 whitespace-pre-wrap leading-snug max-h-24 overflow-auto scroll-thin">{{ ab.tip || ab.ubertip[0] }}</div>
                      </div>
                    </div>
                  }
                </div>
              } @else {
                <div class="opacity-50 text-sm">在左侧点选一位英雄查看属性与技能。</div>
              }
            </div>
          </div>
        </div>
      }

      <!-- ============================== 对局 ============================== -->
      <div class="absolute inset-0" [class.hidden]="phase() !== 'loading' && phase() !== 'playing'">
        <canvas #glCanvas width="1280" height="720" class="absolute inset-0 w-full h-full block z-0 pointer-events-none"></canvas>
        <canvas #overlay class="absolute inset-0 w-full h-full block z-[1] pointer-events-none"></canvas>
        <div #viewLayer class="absolute inset-0 z-[2]" [class.targeting]="!!targeting()"
             (pointerdown)="onViewPointerDown($event)" (pointermove)="onViewPointerMove($event)"></div>

        @if (phase() === 'loading') {
          <div class="absolute inset-0 z-[50] flex flex-col items-center justify-center bg-[#05080b]/90">
            <div class="text-xl font-black text-[#f0c060] mb-2">正在载入 DotA 6.83d 地图…</div>
            <div class="text-sm opacity-70">{{ loadingText() }}</div>
          </div>
        }

        @if (phase() === 'playing' && hud(); as h) {
          <!-- 顶栏 -->
          <div class="absolute top-0 left-0 right-0 z-[10] flex items-center justify-center gap-4 py-1.5 pointer-events-none" style="background: linear-gradient(180deg, rgba(0,0,0,0.85), transparent)">
            <div class="text-[#4ade80] font-black text-lg">近卫 {{ h.radiantKills }}</div>
            <div class="pg-panel px-4 py-0.5 font-mono font-bold text-[#fde68a]">{{ h.clock }}</div>
            <div class="text-[#f87171] font-black text-lg">{{ h.direKills }} 天灾</div>
          </div>
          <div class="absolute top-2 right-3 z-[11] flex gap-2">
            <button class="pg-btn" (click)="toggleShop()">商店 (F2)</button>
            <button class="pg-btn" (click)="showScore.set(!showScore())">计分板 (Tab)</button>
            <button class="pg-btn" [class.primary]="camLock()" (click)="toggleCamLock()">镜头跟随 (空格)</button>
            <button class="pg-btn" (click)="showHelp.set(!showHelp())">帮助</button>
            <button class="pg-btn" (click)="quitGame()">退出</button>
          </div>
          <div class="absolute top-12 right-3 z-[10] text-[11px] opacity-70 text-right pointer-events-none">{{ h.net }}</div>

          <!-- 消息 -->
          <div class="absolute top-12 left-3 z-[10] flex flex-col gap-1 pointer-events-none max-w-[46%]">
            @for (m of messages(); track m.id) {
              <div class="text-sm font-bold px-2 py-0.5 rounded bg-black/55" [style.color]="m.color">{{ m.text }}</div>
            }
          </div>

          @if (targeting(); as tg) {
            <div class="absolute top-24 left-1/2 -translate-x-1/2 z-[10] pg-panel px-4 py-1 text-sm font-bold text-[#fde68a] pointer-events-none">
              {{ tg.label }}（左键确认，右键 / Esc 取消）
            </div>
          }
          @if (h.respawn > 0) {
            <div class="absolute top-1/3 left-1/2 -translate-x-1/2 z-[10] pg-panel px-6 py-3 text-center pointer-events-none">
              <div class="text-lg font-black text-[#f87171]">你已阵亡</div>
              <div class="text-sm opacity-80">{{ h.respawn }} 秒后复活</div>
            </div>
          }

          <!-- 底部控制台 -->
          <div class="absolute bottom-0 left-0 right-0 z-[10] flex items-end justify-between gap-2 p-2 pointer-events-none">
            <!-- 小地图 -->
            <div class="pg-panel p-1 pointer-events-auto shrink-0">
              <canvas #minimap width="200" height="200" class="block" style="width:200px;height:200px;cursor:pointer"
                      (pointerdown)="onMinimapDown($event)" (contextmenu)="$event.preventDefault()"></canvas>
            </div>

            <!-- 英雄面板 -->
            <div class="pg-panel p-2 pointer-events-auto flex gap-3 items-stretch min-w-0">
              <div class="flex flex-col items-center gap-1 shrink-0">
                <img class="w-[72px] h-[72px] rounded border border-[#5a4a1c]" [src]="h.icon" alt="" />
                <div class="text-[11px] font-bold">等级 {{ h.level }}</div>
              </div>
              <div class="flex flex-col gap-1 w-[230px]">
                <div class="font-black text-sm text-[#f0c060] truncate">{{ h.name }} <span class="text-xs opacity-60 font-normal">{{ h.proper }}</span></div>
                <div class="bar"><i [style.width.%]="(h.hp / h.maxHp) * 100" style="background:#16a34a"></i><span>{{ h.hp }} / {{ h.maxHp }} <em class="ml-1 opacity-70 not-italic">+{{ h.hpRegen }}</em></span></div>
                <div class="bar"><i [style.width.%]="h.maxMp ? (h.mp / h.maxMp) * 100 : 0" style="background:#2563eb"></i><span>{{ h.mp }} / {{ h.maxMp }} <em class="ml-1 opacity-70 not-italic">+{{ h.mpRegen }}</em></span></div>
                <div class="bar !h-[9px]"><i [style.width.%]="h.xpPct" style="background:#a855f7"></i></div>
                <div class="grid grid-cols-3 gap-x-2 text-[11px] leading-tight">
                  <span>攻击 <b class="text-white">{{ h.dmg }}</b></span>
                  <span title="护甲减伤">护甲 <b class="text-white">{{ h.armor }}</b> ({{ h.armorPct }}%)</span>
                  <span>移速 <b class="text-white">{{ h.speed }}</b></span>
                  <span [style.color]="h.primary === 'str' ? '#fde68a' : ''">力量 <b>{{ h.str }}</b></span>
                  <span [style.color]="h.primary === 'agi' ? '#fde68a' : ''">敏捷 <b>{{ h.agi }}</b></span>
                  <span [style.color]="h.primary === 'int' ? '#fde68a' : ''">智力 <b>{{ h.int }}</b></span>
                  <span>攻速 <b>{{ h.atkInterval }}s</b></span>
                  <span>射程 <b>{{ h.range }}</b></span>
                  <span>{{ h.kda }}</span>
                </div>
                @if (h.buffs.length) {
                  <div class="flex gap-1 flex-wrap">
                    @for (b of h.buffs; track b) { <span class="text-[10px] px-1 rounded bg-[#1e3a5f] text-[#bfdbfe]">{{ b }}</span> }
                  </div>
                }
              </div>
              <!-- 目标信息 -->
              @if (h.target; as t) {
                <div class="flex flex-col gap-1 w-[150px] border-l border-white/10 pl-3">
                  <div class="font-bold text-xs truncate" [style.color]="t.team === 0 ? '#4ade80' : t.team === 1 ? '#f87171' : '#fde047'">{{ t.name }} · Lv{{ t.level }}</div>
                  <div class="bar"><i [style.width.%]="(t.hp / t.maxHp) * 100" style="background:#b91c1c"></i><span>{{ t.hp }} / {{ t.maxHp }}</span></div>
                  @if (t.maxMp > 0) { <div class="bar"><i [style.width.%]="(t.mp / t.maxMp) * 100" style="background:#2563eb"></i><span>{{ t.mp }} / {{ t.maxMp }}</span></div> }
                  <div class="text-[11px]">攻击 <b>{{ t.dmg }}</b></div>
                  <div class="text-[11px]">护甲 <b>{{ t.armor }}</b></div>
                </div>
              }
            </div>

            <!-- 物品栏 -->
            <div class="pg-panel p-2 pointer-events-auto shrink-0">
              <div class="flex items-center gap-1 mb-1 text-sm font-black text-[#fde047]"><img src="/assets/wc3/ui/icons/gold.png" class="w-4 h-4" alt="" />{{ h.gold }}</div>
              <div class="grid grid-cols-2 gap-1">
                @for (it of h.items; track $index) {
                  <div class="hud-slot" [class.dim]="it && it.cdSec > 0" (click)="useItem($index)" (contextmenu)="sellItem($index, $event)"
                       (mouseenter)="it && showTip($event, it.name, it.desc + '\\n\\n左键使用 · 右键出售（需在商店附近，半价）')" (mouseleave)="hideTip()">
                    @if (it) {
                      <img [src]="it.icon" alt="" />
                      @if (it.charges > 1) { <span class="lv">{{ it.charges }}</span> }
                      @if (it.cdSec > 0) { <span class="cd">{{ it.cdSec }}</span> }
                    }
                    <span class="hk">{{ itemKeys[$index] }}</span>
                  </div>
                }
              </div>
            </div>

            <!-- 命令卡 -->
            <div class="pg-panel p-2 pointer-events-auto shrink-0">
              <div class="grid grid-cols-4 gap-1">
                @for (c of basicCmds; track c.id) {
                  <div class="hud-slot" (click)="basicCommand(c.id)" (mouseenter)="showTip($event, c.name + ' [' + c.hotkey + ']', c.tip)" (mouseleave)="hideTip()">
                    <img [src]="c.icon" alt="" /><span class="hk">{{ c.hotkey }}</span>
                  </div>
                }
                <div class="hud-slot" style="visibility:hidden"></div>
                <div class="hud-slot" style="visibility:hidden"></div>
                <div class="hud-slot" [class.learn]="h.skillPoints > 0 && !learnMode()" [class.active]="learnMode()" (click)="toggleLearn()"
                     (mouseenter)="showTip($event, '学习技能 [O]', '剩余技能点：' + h.skillPoints + '\\n点击后在下方选择要升级的技能；也可按住 Ctrl + 技能热键直接加点。')" (mouseleave)="hideTip()">
                  <img src="/assets/wc3/ui/icons/cmd/BTNSkillz.png" alt="" /><span class="hk">O</span>
                  @if (h.skillPoints > 0) { <span class="lv">{{ h.skillPoints }}</span> }
                </div>
                @let stat = h.skills[h.skills.length - 1];
                <div class="hud-slot" [class.learn]="learnMode() && stat.canLearn" [class.dim]="!learnMode()" (click)="learnMode() && learn(stat.slot)"
                     (mouseenter)="showTip($event, '属性附加 [U] · 等级 ' + stat.level + '/10', '每级全属性 +2。在学习模式下点击加点。')" (mouseleave)="hideTip()">
                  <img src="/assets/wc3/ui/icons/cmd/BTNStatUp.png" alt="" /><span class="hk">U</span><span class="lv">{{ stat.level }}</span>
                </div>
                @for (s of h.skills.slice(0, 4); track s.slot) {
                  <div class="hud-slot" [class.dim]="!learnMode() && (s.level === 0 || s.cdSec > 0)" [class.nomana]="!learnMode() && s.noMana && s.level > 0"
                       [class.learn]="learnMode() && s.canLearn" (click)="onSkillClick(s.slot)"
                       (mouseenter)="showTip($event, s.name + ' [' + s.hotkey + '] · 等级 ' + s.level + '/' + s.maxLevel, skillTip(s))" (mouseleave)="hideTip()">
                    <img [src]="s.icon" alt="" />
                    <span class="hk">{{ s.hotkey }}</span>
                    <span class="lv">{{ s.level }}</span>
                    @if (s.cdSec > 0 && !learnMode()) { <span class="cd">{{ s.cdSec }}</span> }
                  </div>
                }
              </div>
            </div>
          </div>

          <!-- 商店 -->
          @if (showShop() && data(); as d) {
            <div class="absolute right-3 top-14 bottom-[236px] z-[20] w-[420px] pg-panel flex flex-col pointer-events-auto">
              <div class="flex items-center justify-between px-3 py-2 border-b border-white/10">
                <div class="font-black text-[#f0c060]">商店</div>
                <div class="text-xs opacity-70">左键购买 · 材料齐全自动合成</div>
                <button class="pg-btn !px-2 !py-0.5" (click)="showShop.set(false)">关闭</button>
              </div>
              <div class="flex flex-wrap gap-1 p-2 border-b border-white/10">
                @for (s of shopTabs(); track s.id) {
                  <button class="pg-btn !px-2 !py-0.5 !text-[11px]" [class.primary]="shopTab() === s.id" (click)="shopTab.set(s.id)">{{ s.name }}</button>
                }
                <button class="pg-btn !px-2 !py-0.5 !text-[11px]" [class.primary]="shopTab() === '__recipes'" (click)="shopTab.set('__recipes')">合成表</button>
              </div>
              <div class="flex-1 overflow-auto scroll-thin p-2">
                @if (shopTab() === '__recipes') {
                  @for (r of recipeRows(); track r.result.code + $index) {
                    <div class="flex items-center gap-1 text-xs py-1 border-b border-white/5 flex-wrap">
                      <img class="w-7 h-7 rounded-sm" [src]="'/assets/dota/itemIcons/' + r.result.code + '.png'" alt="" />
                      <b class="text-[#fde68a] mr-1">{{ r.result.name }}</b>=
                      @for (c of r.components; track $index) {
                        <span class="shop-item !p-0.5" (click)="buy(c.code)" (mouseenter)="showTip($event, c.name + ' · ' + c.cost + ' 金', c.desc)" (mouseleave)="hideTip()">
                          <img class="w-6 h-6 rounded-sm" [src]="'/assets/dota/itemIcons/' + c.code + '.png'" alt="" />{{ c.name }}
                        </span>
                      }
                    </div>
                  }
                } @else {
                  <div class="grid grid-cols-2 gap-1">
                    @for (it of shopItems(); track it.code) {
                      <div class="shop-item" [class.blocked]="!!buyReason(it.code)" (click)="buy(it.code)"
                           (mouseenter)="showTip($event, it.name + ' · ' + it.cost + ' 金', it.desc + (buyReason(it.code) ? '\\n\\n⚠ ' + buyReason(it.code) : ''))" (mouseleave)="hideTip()">
                        <img class="w-9 h-9 rounded-sm" [src]="'/assets/dota/itemIcons/' + it.code + '.png'" alt="" />
                        <div class="min-w-0">
                          <div class="text-xs font-bold truncate">{{ it.name }}</div>
                          <div class="text-[11px] text-[#fde047]">{{ it.cost }}</div>
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          }

          <!-- 计分板 -->
          @if (showScore()) {
            <div class="absolute left-1/2 top-16 -translate-x-1/2 z-[30] pg-panel p-3 pointer-events-none w-[640px] max-w-[94%]">
              <table class="w-full text-xs">
                <thead><tr class="opacity-60 text-left"><th class="py-1">玩家</th><th>英雄</th><th>等级</th><th>击杀/死亡/助攻</th><th>正补/反补</th><th>金钱</th></tr></thead>
                <tbody>
                  @for (r of h.score; track r.slot) {
                    <tr [class.opacity-50]="!r.alive" [style.border-top]="r.slot === 5 ? '1px solid rgba(255,255,255,0.2)' : ''">
                      <td class="py-1"><span class="inline-block w-2.5 h-2.5 rounded-sm mr-1" [style.background]="r.color"></span>{{ r.player }}{{ r.isBot ? ' [电脑]' : '' }}</td>
                      <td><img class="inline-block w-5 h-5 mr-1 rounded-sm" [src]="r.icon" alt="" />{{ r.hero }}{{ r.alive ? '' : ' (复活 ' + r.respawn + 's)' }}</td>
                      <td>{{ r.level }}</td><td>{{ r.k }} / {{ r.d }} / {{ r.a }}</td><td>{{ r.lh }} / {{ r.dn }}</td><td class="text-[#fde047]">{{ r.gold }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }

          <!-- 帮助 -->
          @if (showHelp()) {
            <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[40] pg-panel p-4 w-[520px] max-w-[94%] text-sm leading-relaxed pointer-events-auto">
              <div class="font-black text-[#f0c060] mb-2">操作说明（对齐魔兽争霸 III）</div>
              <div>· 右键地面：移动；右键敌人：攻击；右键血量低于 50% 的己方小兵：反补</div>
              <div>· A + 左键：攻击移动 / 强制攻击；S 停止；H 保持原位；M 移动</div>
              <div>· 技能热键见命令卡左上角字母；O 进入学习模式，或 Ctrl + 技能热键直接加点</div>
              <div>· 物品：小键盘 7/8/4/5/1/2 或主键盘 1~6；F2 打开商店</div>
              <div>· 镜头：鼠标移到屏幕边缘 / 方向键 / 中键拖动；滚轮缩放；空格回到英雄并锁定跟随</div>
              <div>· Tab 计分板；点击小地图移动镜头，右键小地图移动英雄</div>
              <div class="text-xs opacity-60 mt-2">提示：标注「脚本技能」的技能效果由地图 JASS 触发器实现，网页端目前仅还原可从数据表解析的伤害 / 眩晕 / 减速 / 治疗 / 闪烁。</div>
              <button class="pg-btn mt-3" (click)="showHelp.set(false)">知道了</button>
            </div>
          }

          <!-- 结算 -->
          @if (winner() >= 0) {
            <div class="absolute inset-0 z-[60] flex items-center justify-center bg-black/70 pointer-events-auto">
              <div class="pg-panel p-6 text-center w-[420px]">
                <div class="text-3xl font-black mb-2" [style.color]="winner() === myTeam() ? '#4ade80' : '#f87171'">{{ winner() === myTeam() ? '胜利' : '失败' }}</div>
                <div class="opacity-80 mb-4">{{ winner() === 0 ? '近卫军团' : '天灾军团' }} 摧毁了对方基地 · 用时 {{ h.clock }}</div>
                <button class="pg-btn primary" (click)="quitGame()">返回大厅</button>
              </div>
            </div>
          }
        }
      </div>

      @if (tip(); as t) {
        <div class="tip" [style.left.px]="t.x" [style.top.px]="t.y" [style.transform]="'translate(' + t.tx + ', ' + t.ty + ')'"><b>{{ t.title }}</b>{{ '\\n' + t.body }}</div>
      }
    </div>
  `,
})
export class Play3dComponent implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly glCanvas = viewChild<ElementRef<HTMLCanvasElement>>('glCanvas');
  private readonly overlayRef = viewChild<ElementRef<HTMLCanvasElement>>('overlay');
  private readonly viewLayer = viewChild<ElementRef<HTMLDivElement>>('viewLayer');
  private readonly minimapRef = viewChild<ElementRef<HTMLCanvasElement>>('minimap');

  readonly colors = PLAYER_COLORS;
  readonly itemKeys = ITEM_KEYS;
  readonly soloModes = [
    { n: 5, label: '5 v 5' },
    { n: 3, label: '3 v 3' },
    { n: 1, label: '1 v 1 中路' },
  ];
  readonly basicCmds = [
    { id: 'move', name: '移动', hotkey: 'M', icon: '/assets/wc3/ui/icons/cmd/BTNMove.png', tip: '移动到目标地点。右键地面效果相同。' },
    { id: 'stop', name: '停止', hotkey: 'S', icon: '/assets/wc3/ui/icons/cmd/BTNStop.png', tip: '取消当前命令（可用于取消攻击前摇）。' },
    { id: 'hold', name: '保持原位', hotkey: 'H', icon: '/assets/wc3/ui/icons/cmd/BTNHoldPosition.png', tip: '原地不动，只攻击射程内的敌人。' },
    { id: 'attack', name: '攻击', hotkey: 'A', icon: '/assets/wc3/ui/icons/cmd/BTNAttack.png', tip: '对单位：强制攻击（可反补）。对地面：攻击移动。' },
  ];

  // ---------------- 大厅状态 ----------------
  readonly phase = signal<'lobby' | 'room' | 'loading' | 'playing'>('lobby');
  readonly data = signal<GameplayData | null>(null);
  readonly playerName = signal('玩家');
  readonly pickedHero = signal('');
  readonly heroFilter = signal('');
  readonly soloTeam = signal<0 | 1>(0);
  readonly soloSize = signal(5);
  readonly rooms = signal<{ id: string; name: string; started: boolean; players: number; bots: number }[]>([]);
  readonly roomName = signal('');
  readonly lobby = signal<LobbyState | null>(null);
  readonly busy = signal(false);
  readonly errorMsg = signal('');
  readonly loadingText = signal('');

  readonly heroCount = computed(() => Object.keys(this.data()?.heroes || {}).length);
  readonly pickedDef = computed<HeroDef | null>(() => this.data()?.heroes[this.pickedHero()] || null);
  readonly pickedSkills = computed<AbilityDef[]>(() => {
    const d = this.data();
    const h = this.pickedDef();
    if (!d || !h) return [];
    return h.skills.map((c) => d.abilities[c]).filter((a) => a && a.code !== 'Aamk');
  });
  /** 按 阵营酒馆 × 主属性 分组（酒馆归属取自地图 Sellunits） */
  readonly heroGroups = computed(() => {
    const d = this.data();
    if (!d) return [];
    const filter = this.heroFilter().trim().toLowerCase();
    const side = new Map<string, number>();
    for (const t of d.taverns) {
      const s = t.name.includes('天灾') ? 1 : t.name.includes('近卫') ? 0 : -1;
      if (s < 0) continue;
      for (const c of t.heroes) if (!side.has(c)) side.set(c, s);
    }
    const defs = [
      { key: 'str', label: '力量', color: '#f87171' },
      { key: 'agi', label: '敏捷', color: '#4ade80' },
      { key: 'int', label: '智力', color: '#60a5fa' },
    ];
    const out: { title: string; color: string; heroes: HeroDef[] }[] = [];
    for (const s of [0, 1]) {
      for (const a of defs) {
        const heroes = Object.values(d.heroes).filter(
          (h) => (side.get(h.id) ?? 0) === s && h.primary === a.key && h.icon && (!filter || h.name.toLowerCase().includes(filter) || h.proper.toLowerCase().includes(filter))
        );
        if (heroes.length) out.push({ title: `${s === 0 ? '近卫' : '天灾'} · ${a.label}`, color: a.color, heroes });
      }
    }
    return out;
  });
  readonly amHost = computed(() => !!this.lobby()?.slots.find((s) => s && s.slot === this.room?.slot)?.isHost);

  // ---------------- 对局状态 ----------------
  readonly hud = signal<Hud | null>(null);
  readonly messages = signal<{ id: number; text: string; color: string; t: number }[]>([]);
  readonly targeting = signal<Targeting | null>(null);
  readonly learnMode = signal(false);
  readonly showShop = signal(false);
  readonly showScore = signal(false);
  readonly showHelp = signal(false);
  readonly camLock = signal(true);
  readonly winner = signal(-1);
  readonly shopTab = signal('');
  readonly tip = signal<{ title: string; body: string; x: number; y: number; tx: string; ty: string } | null>(null);
  readonly myTeam = signal<0 | 1>(0);

  readonly shopTabs = computed(() => {
    const d = this.data();
    if (!d) return [];
    // 两方基地商店货架相同，按名称去重
    const seen = new Set<string>();
    return d.shops.filter((s) => {
      const key = s.items.join(',');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });
  readonly shopItems = computed<ItemDef[]>(() => {
    const d = this.data();
    if (!d) return [];
    const shop = d.shops.find((s) => s.id === this.shopTab()) || this.shopTabs()[0];
    return shop ? shop.items.map((c) => d.items[c]).filter(Boolean) : [];
  });
  readonly recipeRows = computed(() => {
    const d = this.data();
    if (!d) return [];
    return d.recipes
      .map((r) => ({ result: d.items[r.result], components: r.components.map((c) => d.items[c]) }))
      .filter((r) => r.result && r.components.every(Boolean))
      .sort((a, b) => a.result.cost - b.result.cost);
  });

  private room: RoomConnection | null = null;
  private mdx?: Wc3MdxViewer;
  private engine?: GameEngine;
  private session?: GameSession;
  private view?: GameView;
  private mySlot = 0;
  private hudTimer = 0;
  private msgSeq = 0;
  private minimapImg?: HTMLImageElement;
  private buildingsCfg: DotaBuilding[] = [];
  private disposed = false;
  private roomPoll = 0;
  private hudTick = 0;
  private readonly onKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
  private readonly onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Tab') this.showScore.set(false);
  };

  constructor() {
    afterNextRender(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      try {
        const saved = localStorage.getItem('play3d.name');
        if (saved) this.playerName.set(saved);
        else this.playerName.set('玩家' + Math.floor(100 + Math.random() * 900));
      } catch {
        /* ignore */
      }
      window.addEventListener('keydown', this.onKeyDown);
      window.addEventListener('keyup', this.onKeyUp);
      void loadGameplayData()
        .then((d) => this.data.set(d))
        .catch((e) => this.errorMsg.set(String(e?.message || e)));
      void this.refreshRooms();
      this.roomPoll = window.setInterval(() => {
        if (this.phase() === 'lobby') void this.refreshRooms();
      }, 5000);
    });
  }

  ngOnDestroy(): void {
    this.disposed = true;
    if (isPlatformBrowser(this.platformId)) {
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
      clearInterval(this.roomPoll);
    }
    this.room?.close();
    this.teardownGame();
  }

  // ============================================================ 大厅
  setPlayerName(v: string): void {
    this.playerName.set(v.slice(0, 16));
    try {
      localStorage.setItem('play3d.name', this.playerName());
    } catch {
      /* ignore */
    }
  }
  primaryLabel(p: string): string {
    return p === 'str' ? '力量' : p === 'agi' ? '敏捷' : '智力';
  }
  heroIcon(code: string): string {
    const h = this.data()?.heroes[code];
    return h?.icon ? `/assets/dota/heroIcons/${h.icon}` : '/assets/wc3/ui/icons/cmd/BTNSkillz.png';
  }
  heroName(code: string): string {
    return this.data()?.heroes[code]?.name || '未选英雄';
  }
  fxOf(ab: AbilityDef) {
    return resolveAbilityFx(ab);
  }
  pickHero(code: string): void {
    this.pickedHero.set(code);
    if (this.room && this.phase() === 'room') void this.roomAction({ action: 'hero', heroCode: code });
  }
  pickRandomHero(): void {
    const codes = this.playableHeroCodes();
    if (codes.length) this.pickHero(codes[Math.floor(Math.random() * codes.length)]);
  }
  private playableHeroCodes(): string[] {
    return Object.values(this.data()?.heroes || {})
      .filter((h) => h.icon && h.atk)
      .map((h) => h.id);
  }
  private randomHeroExcluding(used: Set<string>): string {
    const pool = this.playableHeroCodes().filter((c) => !used.has(c));
    const code = pool[Math.floor(Math.random() * pool.length)] || this.playableHeroCodes()[0];
    used.add(code);
    return code;
  }

  startSolo(): void {
    const hero = this.pickedHero();
    if (!hero || !this.data()) return;
    const team = this.soloTeam();
    const size = this.soloSize();
    // 1v1 用中路位(2)，3v3 用上/中/下各一(0,2,4)
    const idx = size === 1 ? [2] : size === 3 ? [0, 2, 4] : [0, 1, 2, 3, 4];
    const used = new Set<string>([hero]);
    const players: PlayerSetup[] = [];
    const myIdx = idx[Math.floor(idx.length / 2)];
    for (const t of [0, 1]) {
      for (const i of idx) {
        const slot = t * 5 + i;
        const mine = t === team && i === myIdx;
        players.push({ slot, name: mine ? this.playerName() : `电脑${slot + 1}`, heroCode: mine ? hero : this.randomHeroExcluding(used), isBot: !mine });
      }
    }
    void this.startGame({ seed: (Math.random() * 0x7fffffff) | 0 || 1, prepSec: 15, players }, team * 5 + myIdx, null);
  }

  async refreshRooms(): Promise<void> {
    try {
      const r = await fetch('/api/game/rooms');
      if (r.ok) this.rooms.set((await r.json()).rooms || []);
    } catch {
      /* 服务器未启动时静默 */
    }
  }

  async createRoom(): Promise<void> {
    await this.enterRoom('/api/game/rooms', { name: this.roomName() || `${this.playerName()} 的房间`, playerName: this.playerName(), heroCode: this.pickedHero() });
  }
  async joinRoom(id: string): Promise<void> {
    await this.enterRoom(`/api/game/rooms/${id}/join`, { playerName: this.playerName(), heroCode: this.pickedHero() });
  }
  private async enterRoom(url: string, body: Record<string, unknown>): Promise<void> {
    this.busy.set(true);
    this.errorMsg.set('');
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `请求失败(${r.status})`);
      const room = new RoomConnection(j.roomId, j.token, j.slot);
      this.room = room;
      room.onLobby = (s) => this.lobby.set(s);
      room.onStart = (p) => this.onRoomStart(p);
      room.onClosed = (reason) => {
        this.errorMsg.set(reason);
        this.room = null;
        this.lobby.set(null);
        if (this.phase() === 'room') this.phase.set('lobby');
      };
      room.connect();
      this.phase.set('room');
    } catch (e) {
      this.errorMsg.set(String((e as Error).message || e));
    } finally {
      this.busy.set(false);
    }
  }
  async roomAction(body: Record<string, unknown>): Promise<void> {
    if (!this.room) return;
    const err = await this.room.update(body);
    this.errorMsg.set(err);
  }
  addBot(slot: number): void {
    const used = new Set<string>((this.lobby()?.slots || []).map((s) => s?.heroCode || '').filter(Boolean));
    void this.roomAction({ action: 'bot', slot, heroCode: this.randomHeroExcluding(used), name: `电脑${slot + 1}` });
  }
  async fillBots(): Promise<void> {
    const lb = this.lobby();
    if (!lb) return;
    const used = new Set<string>(lb.slots.map((s) => s?.heroCode || '').filter(Boolean));
    for (let i = 0; i < 10; i++) {
      if (!lb.slots[i]) await this.roomAction({ action: 'bot', slot: i, heroCode: this.randomHeroExcluding(used), name: `电脑${i + 1}` });
    }
  }
  leaveRoom(): void {
    this.room?.close();
    this.room = null;
    this.lobby.set(null);
    this.phase.set('lobby');
    void this.refreshRooms();
  }
  private onRoomStart(p: StartPayload): void {
    if (!this.room) return;
    void this.startGame({ seed: p.seed, prepSec: p.prepSec, players: p.players }, this.room.slot, this.room);
  }

  // ============================================================ 开局
  private async startGame(base: { seed: number; prepSec: number; players: PlayerSetup[] }, mySlot: number, room: RoomConnection | null): Promise<void> {
    this.errorMsg.set('');
    this.phase.set('loading');
    this.winner.set(-1);
    this.messages.set([]);
    this.hud.set(null);
    this.mySlot = mySlot;
    this.myTeam.set(mySlot < 5 ? 0 : 1);
    try {
      this.loadingText.set('读取玩法数据与寻路栅格');
      const [data, pathing, sync, bld] = await Promise.all([
        loadGameplayData(),
        loadPathingData(),
        fetch('/assets/maps/dota683/scene-sync.json').then((r) => r.json()),
        fetch('/assets/maps/dota683/buildings.json').then((r) => r.json()),
      ]);
      this.data.set(data);
      this.buildingsCfg = bld.buildings as DotaBuilding[];
      const setup: GameSetup = {
        ...base,
        lanes: sync.lanes,
        camps: sync.neutralCamps,
        runeSpots: sync.runeSpots || [],
        buildings: bld.buildings,
        pathing,
      };
      const engine = new GameEngine(data, setup);
      this.engine = engine;
      this.session = new GameSession(engine, mySlot, room);

      this.loadingText.set('初始化 3D 地形');
      const canvas = await this.waitCanvas();
      const rect = canvas.parentElement?.getBoundingClientRect();
      canvas.width = Math.max(640, Math.floor(rect?.width || 1280));
      canvas.height = Math.max(360, Math.floor(rect?.height || 720));
      const me = engine.heroes[mySlot];
      const mdx = await Wc3MdxViewer.create({
        canvas,
        viewLayer: this.viewLayer()?.nativeElement,
        modelUrl: '',
        assetBaseUrl: '/assets/wc3/',
        gameplay: true,
        heroSpawn: me ? { x: me.x, y: me.y } : undefined,
        onFrame: (dt) => this.frame(dt),
      });
      this.mdx = mdx;
      this.loadingText.set('加载地形、树木与建筑模型');
      await mdx.load();
      if (this.disposed) return;
      mdx.resizeToContainer();
      const overlay = this.overlayRef()?.nativeElement;
      if (!overlay) throw new Error('叠加画布未就绪');
      this.view = new GameView(mdx, engine, overlay, mySlot);
      this.view.selectedId = me?.id || 0;
      this.minimapImg = new Image();
      this.minimapImg.src = '/assets/dota/dota683_minimap.png';
      this.shopTab.set(this.shopTabs()[0]?.id || '');
      this.camLock.set(true);
      mdx.cameraMode = 'hero';
      this.camGrace = 3;
      this.learnMode.set(false);
      this.targeting.set(null);
      this.showShop.set(false);
      this.phase.set('playing');
      // 调试钩子：地址带 ?debug 时暴露组件，便于在控制台手动推进逻辑帧 / 检查引擎状态
      if (window.location.search.includes('debug')) (window as unknown as Record<string, unknown>)['__play3d'] = this;
      this.pushMsg(`欢迎来到 DotA 6.83d 网页对战！${setup.prepSec} 秒后出兵，按「帮助」查看操作。`, '#fde68a');
    } catch (e) {
      console.error(e);
      this.errorMsg.set('开局失败：' + String((e as Error).message || e));
      this.teardownGame();
      this.phase.set(this.room ? 'room' : 'lobby');
    }
  }

  private async waitCanvas(): Promise<HTMLCanvasElement> {
    for (let i = 0; i < 60; i++) {
      const c = this.glCanvas()?.nativeElement;
      const r = c?.parentElement?.getBoundingClientRect();
      if (c && r && r.width > 64 && r.height > 64) return c;
      await new Promise<void>((res) => requestAnimationFrame(() => res()));
    }
    throw new Error('视口未就绪');
  }

  private teardownGame(): void {
    this.view?.dispose();
    this.view = undefined;
    this.mdx?.dispose();
    this.mdx = undefined;
    this.engine = undefined;
    this.session = undefined;
  }

  quitGame(): void {
    this.teardownGame();
    this.room?.close();
    this.room = null;
    this.lobby.set(null);
    this.hud.set(null);
    this.phase.set('lobby');
    void this.refreshRooms();
    // WebGL 上下文随 canvas 复用会残留旧场景，直接刷新页面最稳妥
    if (isPlatformBrowser(this.platformId)) window.location.reload();
  }

  // ============================================================ 每帧
  private frame(dtMs: number): void {
    const engine = this.engine;
    const session = this.session;
    const view = this.view;
    const mdx = this.mdx;
    if (!engine || !session || !view || !mdx || this.phase() !== 'playing') return;
    session.pump(dtMs);
    if (engine.events.length) {
      const rest = view.consumeEvents(engine.events.splice(0));
      for (const e of rest) {
        if (e.type === 'msg') this.pushMsg(e.text, e.color || '#e5e7eb');
        else if (e.type === 'end') this.winner.set(e.winner);
      }
    }
    const me = engine.heroes[this.mySlot];
    // 用户手动移动镜头（边缘滚屏/方向键/中键）即解除跟随
    if (this.camLock() && mdx.cameraMode === 'free') {
      if (this.camGrace > 0) this.camGrace--;
      else this.camLock.set(false);
    }
    if (this.camLock() && me) {
      const p = view.visualPos(me.id) || me;
      mdx.focusOn(p.x, p.y);
      mdx.cameraMode = 'hero';
    }
    view.sync(dtMs);
    this.hudTimer += dtMs;
    if (this.hudTimer >= 100) {
      this.hudTimer = 0;
      this.hudTick++;
      this.updateHud();
      this.drawMinimap();
      const now = performance.now();
      const msgs = this.messages();
      if (msgs.length && now - msgs[0].t > 9000) this.messages.set(msgs.filter((m) => now - m.t <= 9000));
    }
  }
  private camGrace = 0;

  private pushMsg(text: string, color: string): void {
    const list = [...this.messages(), { id: ++this.msgSeq, text, color, t: performance.now() }];
    this.messages.set(list.slice(-7));
  }

  private fmtDmg(u: Unit): string {
    if (u.hero) return `${u.hero.dmgMin} - ${u.hero.dmgMax}`;
    if (!u.atk) return '-';
    const lo = u.atk.base + u.atk.dice + u.dmgBonus;
    const hi = u.atk.base + u.atk.dice * u.atk.sides + u.dmgBonus;
    return `${lo} - ${hi}`;
  }

  private updateHud(): void {
    const engine = this.engine;
    const d = this.data();
    const me = engine?.heroes[this.mySlot];
    if (!engine || !d || !me?.hero) return;
    const h = me.hero;
    const sec = engine.clockSec;
    const abs = Math.abs(Math.floor(sec));
    const clock = `${sec < 0 ? '-' : ''}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
    const need = d.constants.needHeroXP;
    const prev = h.level >= 2 ? need[h.level - 2] : 0;
    const next = need[h.level - 1] ?? prev;
    const skills: SkillHud[] = h.def.skills.map((code, slot) => {
      const ab = d.abilities[code];
      const lv = h.abilityLevels[slot];
      const fx = resolveAbilityFx(ab);
      const cdLeft = Math.max(0, (h.abilityCdUntil[slot] - engine.tick) * 0.05);
      const total = ab.cool[Math.max(0, Math.min(lv, ab.cool.length) - 1)] || 1;
      const cost = lv ? ab.cost[Math.min(lv, ab.cost.length) - 1] || 0 : ab.cost[0] || 0;
      return {
        slot,
        code,
        name: ab.name,
        icon: code === 'Aamk' ? '/assets/wc3/ui/icons/cmd/BTNStatUp.png' : `/assets/dota/abilityIcons/${code}.png`,
        hotkey: ab.hotkey,
        level: lv,
        maxLevel: code === 'Aamk' ? 10 : ab.levels,
        cdSec: Math.ceil(cdLeft),
        cdPct: Math.min(100, (cdLeft / total) * 100),
        cost,
        noMana: me.mp < cost,
        passive: fx.target === 'passive',
        canLearn: engine.canLearn(me, slot),
        implemented: fx.implemented,
        tip: '',
      };
    });
    const items = h.items.slice(0, 6).map((it): ItemHud | null => {
      if (!it) return null;
      const def = d.items[it.code];
      return {
        code: it.code,
        name: def?.name || it.code,
        icon: `/assets/dota/itemIcons/${it.code}.png`,
        charges: it.charges,
        cdSec: Math.max(0, Math.ceil((it.cdUntil - engine.tick) * 0.05)),
        usable: !!def && def.kind !== 'normal' && def.kind !== 'recipe',
        desc: def?.desc || '',
      };
    });
    while (items.length < 6) items.push(null);
    let rk = 0;
    let dk = 0;
    const score: ScoreRow[] = [];
    for (const u of engine.heroes) {
      if (!u?.hero) continue;
      const s = u.hero;
      if (u.team === 0) rk += s.kills;
      else dk += s.kills;
      score.push({
        slot: s.slot, player: s.playerName, hero: u.name, icon: `/assets/dota/heroIcons/${s.def.icon}`, level: s.level,
        k: s.kills, d: s.deaths, a: s.assists, lh: s.lastHits, dn: s.denies,
        gold: u.team === me.team ? s.gold : 0, alive: u.alive,
        respawn: Math.max(0, Math.ceil((s.respawnAt - engine.tick) * 0.05)), color: PLAYER_COLORS[s.slot], isBot: s.isBot,
      });
    }
    const sel = this.view?.selectedId && this.view.selectedId !== me.id ? engine.units.get(this.view.selectedId) : undefined;
    const armorPct = me.armor >= 0 ? Math.round(((0.06 * me.armor) / (1 + 0.06 * me.armor)) * 100) : -Math.round((1 - Math.pow(0.94, -me.armor)) * 100);
    const buffs = [...new Set(me.buffs.filter((b) => b.until > engine.tick).map((b) => BUFF_NAMES[b.kind] || b.kind))];
    const session = this.session;
    this.hud.set({
      clock,
      gold: h.gold,
      name: me.name,
      proper: h.def.proper,
      icon: `/assets/dota/heroIcons/${h.def.icon}`,
      level: h.level,
      xpPct: h.level >= d.constants.maxHeroLevel ? 100 : Math.max(0, Math.min(100, ((h.xp - prev) / Math.max(1, next - prev)) * 100)),
      hp: Math.max(0, Math.round(me.hp)),
      maxHp: me.maxHp,
      mp: Math.round(me.mp),
      maxMp: me.maxMp,
      hpRegen: me.hpRegen.toFixed(1),
      mpRegen: me.mpRegen.toFixed(1),
      str: Math.floor(h.str),
      agi: Math.floor(h.agi),
      int: Math.floor(h.int),
      primary: h.def.primary,
      dmg: this.fmtDmg(me),
      armor: me.armor.toFixed(1),
      armorPct,
      speed: Math.round(engine.moveSpeedOf(me)),
      atkInterval: me.attackInterval.toFixed(2),
      range: me.atk?.range || 0,
      kda: `${h.kills}/${h.deaths}/${h.assists} 补${h.lastHits}/${h.denies}`,
      lh: `${h.lastHits}/${h.denies}`,
      skillPoints: h.skillPoints,
      respawn: me.alive ? 0 : Math.max(0, Math.ceil((h.respawnAt - engine.tick) * 0.05)),
      buffs,
      skills,
      items,
      radiantKills: rk,
      direKills: dk,
      score,
      target: sel
        ? {
            name: sel.hero ? `${sel.hero.playerName} · ${sel.name}` : sel.name,
            hp: Math.max(0, Math.round(sel.hp)), maxHp: sel.maxHp, mp: Math.round(sel.mp), maxMp: sel.maxMp,
            dmg: this.fmtDmg(sel), armor: `${sel.armor.toFixed(1)}${engine.vulnerable(sel) ? '' : '（无敌）'}`, team: sel.team, level: sel.level,
          }
        : null,
      net: session?.online
        ? `联机 · 锁步回合 100ms · 积压 ${session.backlog}${session.desyncAt >= 0 ? ' · ⚠ 检测到失步(回合 ' + session.desyncAt + ')' : ''}`
        : '单机 · 逻辑帧 20Hz',
    });
    if (h.skillPoints === 0 && this.learnMode()) this.learnMode.set(false);
  }

  skillTip(s: SkillHud): string {
    const d = this.data();
    const ab = d?.abilities[s.code];
    if (!ab) return '';
    const lvText = s.level > 0 ? ab.ubertip[Math.min(s.level, ab.ubertip.length) - 1] || ab.tip : ab.tip || ab.ubertip[0] || '';
    const cost = s.cost ? `\n魔法消耗：${s.cost}` : '';
    const extra = s.passive ? '\n（被动）' : cost;
    const warn = s.implemented ? '' : '\n\n⚠ 脚本技能：网页端暂未还原其特效';
    return `${lvText}${extra}${warn}`;
  }

  // ============================================================ 输入
  private send(c: Command): void {
    this.session?.send(c);
  }
  private me(): Unit | undefined {
    return this.engine?.heroes[this.mySlot];
  }

  onViewPointerMove(e: PointerEvent): void {
    const view = this.view;
    if (!view) return;
    view.setPointer(e.clientX, e.clientY);
    view.hoverId = view.pick(e.clientX, e.clientY)?.id || 0;
  }

  onViewPointerDown(e: PointerEvent): void {
    const view = this.view;
    const mdx = this.mdx;
    const engine = this.engine;
    const me = this.me();
    if (!view || !mdx || !engine || !me || this.phase() !== 'playing') return;
    this.hideTip();
    const tg = this.targeting();
    const unit = view.pick(e.clientX, e.clientY);
    const ground = mdx.pickGroundAt(e.clientX, e.clientY);
    if (e.button === 2) {
      if (tg) {
        this.cancelTargeting();
        return;
      }
      if (unit && unit.id !== me.id && (unit.team !== me.team || unit.kind === 'creep' || unit.kind === 'tower')) {
        if (unit.team !== me.team || unit.hp < unit.maxHp * 0.5) {
          this.send({ t: 'attack', id: unit.id });
          view.markMove(unit.x, unit.y, true);
          return;
        }
      }
      if (ground) {
        this.send({ t: 'move', x: Math.round(ground.x), y: Math.round(ground.y) });
        view.markMove(ground.x, ground.y, false);
      }
      return;
    }
    if (e.button !== 0) return;
    if (tg) {
      if (tg.kind === 'attack') {
        if (unit && unit.id !== me.id) this.send({ t: 'attack', id: unit.id });
        else if (ground) this.send({ t: 'amove', x: Math.round(ground.x), y: Math.round(ground.y) });
        if (ground) view.markMove(ground.x, ground.y, true);
      } else if (tg.kind === 'move') {
        if (ground) {
          this.send({ t: 'move', x: Math.round(ground.x), y: Math.round(ground.y) });
          view.markMove(ground.x, ground.y, false);
        }
      } else if (tg.kind === 'item') {
        if (ground) this.send({ t: 'use', inv: tg.inv, x: Math.round(ground.x), y: Math.round(ground.y) });
      } else if (tg.mode === 'unit') {
        const pickT = view.pick(e.clientX, e.clientY, (u) => (tg.ally ? u.team === me.team : u.team !== me.team));
        if (!pickT) {
          this.pushMsg('必须指定一个有效的目标单位', '#fca5a5');
          return;
        }
        this.send({ t: 'cast', slot: tg.slot, id: pickT.id });
      } else if (ground) {
        this.send({ t: 'cast', slot: tg.slot, x: Math.round(ground.x), y: Math.round(ground.y) });
      }
      this.cancelTargeting();
      return;
    }
    view.selectedId = unit ? unit.id : me.id;
  }

  private cancelTargeting(): void {
    this.targeting.set(null);
    if (this.view) this.view.targeting = null;
  }

  basicCommand(id: string): void {
    if (id === 'stop') this.send({ t: 'stop' });
    else if (id === 'hold') this.send({ t: 'hold' });
    else if (id === 'attack') {
      this.targeting.set({ kind: 'attack', label: '攻击：选择目标或地点' });
      if (this.view) this.view.targeting = { range: 0, aoe: 0, mode: 'point' };
    } else if (id === 'move') {
      this.targeting.set({ kind: 'move', label: '移动：选择地点' });
      if (this.view) this.view.targeting = { range: 0, aoe: 0, mode: 'point' };
    }
  }

  toggleLearn(): void {
    const h = this.hud();
    if (!h || h.skillPoints <= 0) {
      this.learnMode.set(false);
      return;
    }
    this.learnMode.set(!this.learnMode());
  }
  learn(slot: number): void {
    const me = this.me();
    if (!me || !this.engine?.canLearn(me, slot)) {
      this.pushMsg('当前等级无法升级该技能', '#fca5a5');
      return;
    }
    this.send({ t: 'learn', slot });
  }

  onSkillClick(slot: number): void {
    if (this.learnMode()) {
      this.learn(slot);
      return;
    }
    this.castSkill(slot);
  }

  private castSkill(slot: number): void {
    const engine = this.engine;
    const me = this.me();
    if (!engine || !me?.hero || !me.alive) return;
    const ab = engine.abilityOf(me, slot);
    if (!ab) return;
    const reason = engine.castBlockReason(me, slot);
    if (reason) {
      if (reason !== '被动技能') this.pushMsg(`${ab.name}：${reason}`, '#fca5a5');
      return;
    }
    const fx = resolveAbilityFx(ab);
    const lv = me.hero.abilityLevels[slot];
    if (fx.target === 'none') {
      this.send({ t: 'cast', slot });
      return;
    }
    const range = ab.range[Math.min(lv, ab.range.length) - 1] || (fx.blink ? ab.dataA[lv - 1] || 1000 : 600);
    const aoe = fx.target === 'point' ? fx.aoe[lv - 1] || (fx.blink ? 0 : 250) : 0;
    this.targeting.set({ kind: 'skill', slot, mode: fx.target === 'unit' ? 'unit' : 'point', ally: fx.ally, label: `${ab.name}：选择${fx.target === 'unit' ? (fx.ally ? '友方单位' : '敌方单位') : '目标地点'}` });
    if (this.view) this.view.targeting = { range, aoe, mode: fx.target === 'unit' ? 'unit' : 'point' };
  }

  useItem(inv: number): void {
    const me = this.me();
    const d = this.data();
    const it = me?.hero?.items[inv];
    if (!me || !d || !it) return;
    const def = d.items[it.code];
    if (!def) return;
    if (def.kind === 'blink' || def.kind === 'tp' || def.kind === 'travel') {
      this.targeting.set({ kind: 'item', inv, mode: 'point', label: `${def.name}：选择目标地点` });
      if (this.view) this.view.targeting = { range: def.kind === 'blink' ? def.active?.dataA || 1200 : 0, aoe: 0, mode: 'point' };
    } else if (def.kind === 'consumable' || def.kind === 'force') {
      this.send({ t: 'use', inv });
    }
  }
  sellItem(inv: number, e: Event): void {
    e.preventDefault();
    if (this.me()?.hero?.items[inv]) this.send({ t: 'sell', inv });
  }

  toggleShop(): void {
    this.showShop.set(!this.showShop());
  }
  buyReason(code: string): string {
    // 依赖 hud 信号以随金钱/位置刷新
    this.hud();
    const me = this.me();
    return me && this.engine ? this.engine.buyBlockReason(me, code) : '';
  }
  buy(code: string): void {
    const reason = this.buyReason(code);
    if (reason) {
      this.pushMsg(`无法购买：${reason}`, '#fca5a5');
      return;
    }
    this.send({ t: 'buy', item: code });
  }

  toggleCamLock(): void {
    const next = !this.camLock();
    this.camLock.set(next);
    if (next) this.centerOnHero();
  }
  private centerOnHero(): void {
    const me = this.me();
    if (!me || !this.mdx) return;
    this.mdx.focusOn(me.x, me.y);
    this.mdx.cameraMode = 'hero';
    this.camGrace = 2;
    this.camLock.set(true);
    if (this.view) this.view.selectedId = me.id;
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.phase() !== 'playing') return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const key = e.key;
    if (key === 'Tab') {
      e.preventDefault();
      this.showScore.set(true);
      return;
    }
    if (key === 'Escape') {
      if (this.targeting()) this.cancelTargeting();
      else if (this.learnMode()) this.learnMode.set(false);
      else if (this.showShop()) this.showShop.set(false);
      else this.showHelp.set(false);
      return;
    }
    if (key === 'F2') {
      e.preventDefault();
      this.toggleShop();
      return;
    }
    if (key === ' ' || key === 'F1') {
      e.preventDefault();
      this.centerOnHero();
      return;
    }
    if (e.repeat) return;
    const k = key.toUpperCase();
    const hud = this.hud();
    if (!hud) return;
    // 物品：小键盘 7/8/4/5/1/2 或主键盘 1~6
    if (e.code.startsWith('Numpad')) {
      const idx = ITEM_KEYS.indexOf(e.code.slice(6));
      if (idx >= 0) {
        this.useItem(idx);
        return;
      }
    } else if (/^[1-6]$/.test(key)) {
      this.useItem(Number(key) - 1);
      return;
    }
    // 技能热键（学习模式或按住 Ctrl 时为加点）
    const skill = hud.skills.find((s) => s.hotkey && s.hotkey.toUpperCase() === k);
    if (skill) {
      e.preventDefault();
      if (this.learnMode() || e.ctrlKey) this.learn(skill.slot);
      else if (skill.code !== 'Aamk') this.castSkill(skill.slot);
      return;
    }
    if (k === 'O') this.toggleLearn();
    else if (k === 'A') this.basicCommand('attack');
    else if (k === 'S') this.basicCommand('stop');
    else if (k === 'H') this.basicCommand('hold');
    else if (k === 'M') this.basicCommand('move');
  }

  // ============================================================ 小地图
  onMinimapDown(e: PointerEvent): void {
    e.preventDefault();
    const c = this.minimapRef()?.nativeElement;
    if (!c || !this.mdx) return;
    const rect = c.getBoundingClientRect();
    const w = mapPixelToWorld(e.clientX - rect.left, e.clientY - rect.top, DOTA_MAP_BOUNDS, rect.width, rect.height);
    if (e.button === 2) {
      this.send({ t: 'move', x: Math.round(w.x), y: Math.round(w.y) });
      return;
    }
    const tg = this.targeting();
    if (tg?.kind === 'attack') {
      this.send({ t: 'amove', x: Math.round(w.x), y: Math.round(w.y) });
      this.cancelTargeting();
      return;
    }
    if (tg?.kind === 'item') {
      this.send({ t: 'use', inv: tg.inv, x: Math.round(w.x), y: Math.round(w.y) });
      this.cancelTargeting();
      return;
    }
    this.camLock.set(false);
    this.mdx.panCameraTo(w.x, w.y);
  }

  private drawMinimap(): void {
    const c = this.minimapRef()?.nativeElement;
    const engine = this.engine;
    if (!c || !engine) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const S = c.width;
    ctx.fillStyle = '#0a1210';
    ctx.fillRect(0, 0, S, S);
    if (this.minimapImg?.complete && this.minimapImg.naturalWidth) ctx.drawImage(this.minimapImg, 0, 0, S, S);
    const P = (x: number, y: number) => worldToMapPixel(x, y, DOTA_MAP_BOUNDS, S, S);
    const myTeam = this.myTeam();
    for (const u of engine.units.values()) {
      if (!u.alive || u.hero) continue;
      const { px, py } = P(u.x, u.y);
      const col = u.team === 2 ? '#eab308' : u.team === myTeam ? '#22c55e' : '#ef4444';
      ctx.fillStyle = col;
      if (u.kind === 'creep' || u.kind === 'neutral') ctx.fillRect(px - 1, py - 1, 2.5, 2.5);
      else {
        const r = u.kind === 'ancient' ? 5 : u.kind === 'tower' ? 3.5 : 3;
        ctx.fillRect(px - r, py - r, r * 2, r * 2);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(px - r, py - r, r * 2, r * 2);
      }
    }
    for (const r of engine.runes) {
      if (!r) continue;
      const { px, py } = P(r.x, r.y);
      ctx.fillStyle = '#c084fc';
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const u of engine.heroes) {
      if (!u?.hero || !u.alive) continue;
      if (u.team !== myTeam && engine.hasBuff(u, 'invis')) continue;
      const { px, py } = P(u.x, u.y);
      ctx.beginPath();
      ctx.arc(px, py, u.hero.slot === this.mySlot ? 5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = PLAYER_COLORS[u.hero.slot];
      ctx.fill();
      ctx.lineWidth = u.hero.slot === this.mySlot ? 2 : 1;
      ctx.strokeStyle = u.hero.slot === this.mySlot ? '#fff' : '#000';
      ctx.stroke();
    }
    // 镜头框
    if (this.mdx) {
      const f = this.mdx.getCameraFocus();
      const { px, py } = P(f.x, f.y);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(px - 14, py - 9, 28, 18);
    }
  }

  // ============================================================ 提示框
  showTip(e: MouseEvent, title: string, body: string): void {
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    const left = r.left > window.innerWidth / 2;
    const top = r.top > window.innerHeight / 2;
    this.tip.set({
      title,
      body,
      x: left ? r.left - 8 : r.right + 8,
      y: top ? r.top : r.bottom,
      tx: left ? '-100%' : '0',
      ty: top ? '-100%' : '0',
    });
  }
  hideTip(): void {
    this.tip.set(null);
  }
}
