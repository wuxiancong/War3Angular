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
import { getHeroByCode } from '../replay3d/dota-hero-roster';

const NL = String.fromCharCode(10);

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
  cdPct: number;
  sellGold: number;
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
  clockMin: number;
  clockSec: number;
  /** 时间指示器天空盘的 background-position-x（%） */
  skyPos: number;
  /** [击杀, 死亡, 助攻, 正补, 反补] */
  stats: number[];
  sel: SelInfo;
  target: { name: string; hp: number; maxHp: number; mp: number; maxMp: number; dmg: string; armor: string; team: number; level: number } | null;
  net: string;
}

/** 信息面板当前显示的对象（自己的英雄 / 选中的其它单位 / 商店） */
interface SelInfo {
  title: string;
  cls: string;
  isHero: boolean;
  level: number;
  xpPct: number;
  xpText: string;
  hp: number;
  maxHp: number;
  hpColor: string;
  mp: number;
  maxMp: number;
  dmg: string;
  dmgIcon: string;
  armor: string;
  armorIcon: string;
  attrIcon: string;
  str: number;
  agi: number;
  int: number;
  buffs: string[];
  icon: string;
}
/** 命令卡一格 */
interface Cell {
  icon: string;
  title: string;
  body: string;
  gold: number;
  mana: number;
  cdPct: number;
  num: number;
  dim: boolean;
  active: boolean;
  click: () => void;
}
type MenuId = 'quests' | 'menu' | 'allies' | 'log';

const NUI = '/assets/wc3/native-ui';
/** UI 单位(0.8×0.6，原点左上) → 百分比样式 */
function U(x: number, y: number, w: number, h: number): string {
  return `left:${(x / 0.8) * 100}%;top:${(y / 0.6) * 100}%;width:${(w / 0.8) * 100}%;height:${(h / 0.6) * 100}%`;
}
/** 底部控制台贴图像素(1600×352，1 单位=2000px) → 百分比样式 */
function B(x: number, y: number, w: number, h: number): string {
  return U(x / 2000, 0.424 + y / 2000, w / 2000, h / 2000);
}
const DMG_ICON: Record<string, string> = { normal: 'normal', pierce: 'pierce', siege: 'siege', magic: 'magic', chaos: 'chaos', hero: 'hero' };
const ARMOR_ICON: Record<string, string> = { small: 'small', medium: 'medium', large: 'large', fort: 'fort', hero: 'hero', divine: 'divine', none: 'none', normal: 'small' };
/** 天灾方商店（buildings.json 未带 unitId）→ 货架所属商店单位 */
const DIRE_SHOP: Record<string, string> = {
  d_shop_relics: 'nC35', d_shop_tomb: 'u00Q', d_shop_sena: 'nC38', d_shop_weapon: 'n01K', d_shop_anc_weap: 'n00W', d_shop_ench: 'n00X',
  d_shop_prot: 'n0HE', d_shop_sanctum: 'n00V', d_shop_vest: 'n002', d_shop_gateway: 'n009',
  shop_side_top_1: 'u010', shop_side_top_2: 'u00Z', shop_side_bot_1: 'u010', shop_side_bot_2: 'u00Z', shop_secret_r: 'uC74', shop_secret_d: 'nC35',
};

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
      /* ================= 原生控制台 HUD =================
         坐标系：WC3 UI 为 0.8×0.6（宽×高），宽屏下横向拉伸铺满；这里用百分比 + 容器查询单位还原。
         --u = 0.001 个 UI 单位（字体 0.010 即 10u）。 */
      .w3 { position: absolute; inset: 0; z-index: 10; pointer-events: none; container-type: size; color: #fff; user-select: none;
        font-family: 'Friz Quadrata TT', 'FZLanTingHeiS', 'Microsoft YaHei', 'PingFang SC', sans-serif;
        cursor: url('/assets/wc3/ui/cursor-human-pointer.png') 2 2, auto; }
      .w3 > *, .w3 > * * { --u: calc(100cqh / 600); }
      .w3 button { font-family: inherit; cursor: url('/assets/wc3/ui/cursor-human-active.png') 2 2, pointer; }
      .w3-abs { position: absolute; pointer-events: auto; box-sizing: border-box; }
      .w3-top { position: absolute; left: 0; top: 0; width: 100%; height: 5.3333%; background-size: 100% 100%; background-repeat: no-repeat; }
      .w3-console { position: absolute; left: 0; bottom: 0; width: 100%; height: 29.3333%; background-size: 100% 100%; background-repeat: no-repeat; }
      /* 控制台实体部分拦截点击，避免点到下面的世界 */
      .w3-hit { position: absolute; left: 0; bottom: 0; width: 100%; height: 20.5%; pointer-events: auto; }
      .w3-hit.l { width: 25.6%; height: 26.5%; }
      .w3-hit.r { left: auto; right: 0; width: 23.5%; height: 25.5%; }

      /* ---- 顶部菜单按钮：UpperMenuButtonTexture 精灵图（u 0~0.664；常态 v 0~0.172，按下 0.25~，高亮 0.75~ 叠加） ---- */
      .w3-upper { position: absolute; pointer-events: auto; border: 0; padding: 0; color: #fff; font-size: calc(var(--u) * 10); line-height: 1;
        background-color: transparent; background-image: var(--tex); background-repeat: no-repeat; background-size: 150.59% 581.82%; background-position: 0 0;
        text-shadow: 0 1px 1px #000; white-space: nowrap; overflow: hidden; }
      .w3-upper em { font-style: normal; color: #fed312; }
      .w3-upper::after { content: ''; position: absolute; inset: 0; background-image: var(--tex); background-repeat: no-repeat; background-size: 150.59% 581.82%;
        background-position: 0 90.57%; mix-blend-mode: screen; opacity: 0; pointer-events: none; }
      .w3-upper:hover { color: #ffd412; }
      .w3-upper:hover::after { opacity: 1; }
      .w3-upper:active, .w3-upper.on { background-position: 0 30.19%; padding: calc(var(--u) * 1) 0 0 calc(var(--u) * 1); }

      /* ---- 时间指示器 ---- */
      .w3-time { position: absolute; }
      .w3-time-sky { position: absolute; left: 39.06%; top: 9.4%; width: 21.88%; height: 43.75%; border-radius: 50%; background-size: 200% 100%; background-repeat: repeat-x; }
      .w3-time-frame { position: absolute; inset: 0; background-size: 100% 100%; background-repeat: no-repeat; }

      /* ---- 资源栏 ---- */
      .w3-res { position: absolute; pointer-events: auto; text-align: right; font-size: calc(var(--u) * 10); line-height: calc(var(--u) * 16.4); color: #fff; text-shadow: 0 1px 1px #000; white-space: nowrap; }
      .w3-upkeep { text-align: center; }

      /* ---- 多面板 ---- */
      .w3-mb-title { position: absolute; pointer-events: auto; padding: 0 calc(var(--u) * 9); font-size: calc(var(--u) * 11); display: flex; align-items: center; white-space: nowrap; color: #fff;
        border-style: solid; border-width: calc(var(--u) * 5); border-image: url('/assets/wc3/native-ui/common/multiboard-9.png') 16 fill / calc(var(--u) * 7) stretch; }
      .w3-mb-btn { position: absolute; pointer-events: auto; padding: 0; background: #000 url('/assets/wc3/native-ui/common/mm-min-enabled.png') center / 62% 62% no-repeat;
        border-style: solid; border-width: calc(var(--u) * 5); border-image: url('/assets/wc3/native-ui/common/multiboard-9.png') 16 / calc(var(--u) * 7) stretch; }
      .w3-mb-btn:not(.open) { transform: scaleY(-1); }
      .w3-mb-board { position: absolute; pointer-events: auto; padding: calc(var(--u) * 4) calc(var(--u) * 7); font-size: calc(var(--u) * 9.5);
        border-style: solid; border-width: calc(var(--u) * 5); border-image: url('/assets/wc3/native-ui/common/multiboard-9.png') 16 fill / calc(var(--u) * 7) stretch; }
      .w3-mb-row { display: grid; grid-template-columns: calc(var(--u) * 13) calc(var(--u) * 78) calc(var(--u) * 16) calc(var(--u) * 46) calc(var(--u) * 40) calc(var(--u) * 18); align-items: center; gap: calc(var(--u) * 3); line-height: calc(var(--u) * 14.5); white-space: nowrap; }
      .w3-mb-row img { width: calc(var(--u) * 12); height: calc(var(--u) * 12); display: block; }
      .w3-mb-row .nm { overflow: hidden; text-overflow: ellipsis; }
      .w3-mb-row .rs { color: #f87171; }
      .w3-mb-row.dead { opacity: 0.55; }
      .w3-mb-head { display: flex; justify-content: space-between; color: #fed312; }

      /* ---- 文字层 ---- */
      .w3-msgs { position: absolute; left: 2.5%; bottom: 31.5%; max-width: 55%; font-size: calc(var(--u) * 11); line-height: 1.35; text-shadow: 0 1px 2px #000, 0 0 2px #000; }
      .w3-err, .w3-hint, .w3-respawn { position: absolute; left: 50%; transform: translateX(-50%); bottom: 31%; font-size: calc(var(--u) * 12); color: #ffcc00; text-shadow: 0 1px 2px #000, 0 0 3px #000; white-space: nowrap; }
      .w3-hint { bottom: 35%; color: #fff; }
      .w3-respawn { bottom: 60%; font-size: calc(var(--u) * 16); color: #ff5a5a; }
      .w3-net { position: absolute; left: 0.5%; top: 6%; font-size: calc(var(--u) * 8); opacity: 0.45; }

      /* ---- 小地图 / 肖像 ---- */
      .w3-minimap { background: #000; cursor: url('/assets/wc3/ui/cursor-human-crosshair.png') 16 16, crosshair; image-rendering: auto; }
      .w3-portrait { overflow: hidden; background: #05070a; }
      .w3-portrait canvas, .w3-portrait img { width: 100%; height: 100%; display: block; object-fit: cover; }
      .w3-portrait canvas.hidden { display: none; }
      .w3-mmbtn { border: 0; padding: 0; background-color: transparent; background-size: 100% 100%; background-repeat: no-repeat; }
      .w3-mmbtn:hover { filter: brightness(1.25); }
      .w3-mmbtn:active { transform: translate(1px, 1px); }
      .w3-hp, .w3-mp { text-align: center; font-size: calc(var(--u) * 9.5); display: flex; align-items: center; justify-content: center; pointer-events: none; text-shadow: 0 1px 1px #000; }
      .w3-hp { color: #20ff20; }
      .w3-mp { color: #bfd8ff; }

      /* ---- 信息面板：字体尺寸取自 SimpleInfoPanel.fdf（标题 0.013 / 标签与数值 0.0085） ---- */
      .w3-info { pointer-events: auto; }
      .w3-name { text-align: center; font-size: calc(var(--u) * 13); line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 1px 1px #000; }
      .w3-class { text-align: center; font-size: calc(var(--u) * 8.5); margin-top: calc(var(--u) * 5.5); }
      .w3-xp { position: relative; width: 67.4%; height: calc(var(--u) * 15.625); margin: calc(var(--u) * 1.5) auto 0; background: #000; }
      .w3-xp > i { position: absolute; left: 1.5%; top: 12%; bottom: 12%; max-width: 97%; background: #7a1fa8 url('/assets/wc3/native-ui/NightElf/xp-fill.png') left center / 100% 100%; background-blend-mode: multiply; }
      .w3-xp::after { content: ''; position: absolute; inset: 0; background: url('/assets/wc3/native-ui/NightElf/xp-border.png') center / 100% 100% no-repeat; }
      .w3-xp > span { position: absolute; inset: 0; z-index: 1; display: flex; align-items: center; justify-content: center; font-size: calc(var(--u) * 8.5); white-space: nowrap; text-shadow: 0 1px 1px #000; }
      .w3-icon-row, .w3-hero-attr { position: absolute; display: flex; align-items: flex-start; font-size: calc(var(--u) * 8.5); line-height: 1.2; }
      .w3-icon-row { left: 2.1%; }
      .w3-icon-row img, .w3-hero-attr img { width: 4cqw; height: 5.3333cqh; flex: none; }
      .w3-icon-row > div, .w3-hero-attr > div { display: flex; flex-direction: column; padding-top: calc(var(--u) * 3); }
      .w3-hero-attr { left: 57.9%; top: 21.9%; height: 42.8%; align-items: center; }
      .w3-hero-attr > div { padding-top: 0; }
      .w3-info .lb { color: #fcd312; }
      .w3-info .vl { padding-left: calc(var(--u) * 5); color: #fff; }
      .w3-hero-attr .vl { margin-bottom: calc(var(--u) * 4); }
      .w3-status { position: absolute; left: 2.1%; right: 2%; top: 87%; font-size: calc(var(--u) * 8.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

      /* ---- 物品栏 / 命令卡按钮 ---- */
      .w3-btn { border: 0; padding: 0; background: #000; overflow: hidden; }
      /* 空物品格透明，露出控制台贴图上的格子美术 */
      .w3-btn.empty { background: transparent; }
      .w3-btn > img { width: 100%; height: 100%; display: block; }
      .w3-btn:hover > img { filter: brightness(1.18); }
      .w3-btn:active > img { transform: scale(0.94); }
      .w3-btn.dim > img { filter: grayscale(0.85) brightness(0.42); }
      .w3-btn.act::after { content: ''; position: absolute; inset: 0; background: url('/assets/wc3/native-ui/NightElf/cmd-active.png') center / 100% 100% no-repeat; pointer-events: none; }
      /* 冷却：原版 UI-Cooldown-Indicator 为顺时针扫过的暗色扇形 */
      .w3-btn .cd { position: absolute; inset: 0; pointer-events: none; background: conic-gradient(transparent calc((100 - var(--p)) * 1%), rgba(0, 0, 0, 0.72) 0); }
      .w3-btn .num { position: absolute; right: 4%; bottom: 0; font-size: calc(var(--u) * 9); font-weight: 400; color: #fff; text-shadow: 0 0 2px #000, 0 1px 1px #000, 1px 0 1px #000; pointer-events: none; }
      .w3-invcover { background-size: 100% 145.45%; background-position: 0 100%; background-repeat: no-repeat; pointer-events: none; }

      /* ---- 提示框（ToolTipBackground + ToolTipBorder 九宫格） ---- */
      .w3-tip { position: absolute; right: 0.35%; bottom: 27.4%; width: 36%; max-height: 60%; overflow: hidden; pointer-events: none; padding: calc(var(--u) * 3) calc(var(--u) * 5);
        border-style: solid; border-width: calc(var(--u) * 5); border-image: url('/assets/wc3/native-ui/common/tooltip-9.png') 16 fill / calc(var(--u) * 7) stretch; }
      .w3-tip .tt { font-size: calc(var(--u) * 11); color: #fff; }
      .w3-tip .cost { display: flex; gap: calc(var(--u) * 10); font-size: calc(var(--u) * 9.5); color: #fed312; margin-top: calc(var(--u) * 2); }
      .w3-tip .cost span { display: inline-flex; align-items: center; gap: calc(var(--u) * 3); }
      .w3-tip .cost img { width: calc(var(--u) * 11); height: calc(var(--u) * 11); }
      .w3-tip .bd { font-size: calc(var(--u) * 9.5); line-height: 1.35; white-space: pre-wrap; margin-top: calc(var(--u) * 4); color: #fff; }

      /* ---- 对话框（EscMenuBackground + EscMenuBorder 九宫格） ---- */
      .w3-dialog { position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%); width: 44%; max-height: 62%; pointer-events: auto; display: flex; flex-direction: column; gap: calc(var(--u) * 6);
        padding: calc(var(--u) * 14) calc(var(--u) * 16); border-style: solid; border-width: calc(var(--u) * 22); border-image: var(--nine) 64 fill / calc(var(--u) * 30) stretch; }
      .w3-dialog .hd { text-align: center; font-size: calc(var(--u) * 16); color: #fed312; text-shadow: 0 1px 2px #000; }
      .w3-dialog .tx { font-size: calc(var(--u) * 10); line-height: 1.5; white-space: pre-wrap; overflow: auto; }
      .w3-dialog .tx.log { max-height: 40cqh; }
      .w3-dialog .ally { display: grid; grid-template-columns: calc(var(--u) * 18) 1fr 1.2fr auto; gap: calc(var(--u) * 6); align-items: center; font-size: calc(var(--u) * 10); }
      .w3-dialog .ally img { width: calc(var(--u) * 16); height: calc(var(--u) * 16); }
      .w3-dialog .ally .g { color: #fed312; }
      .w3-dbtn { align-self: center; min-width: 46%; padding: calc(var(--u) * 5) calc(var(--u) * 12); font-size: calc(var(--u) * 11); color: #fed312; background: rgba(0, 0, 0, 0.72); border: 1px solid #8a6d1a; }
      .w3-dbtn:hover { color: #fff; border-color: #fed312; }
      .w3-dbtn.ret { margin-top: calc(var(--u) * 4); }
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
          <!-- ============ 原生控制台 HUD：坐标全部取自 ConsoleUI.fdf / UpperButtonBar.fdf / ResourceBar.fdf / SimpleInfoPanel.fdf 与控制台贴图镂空 ============ -->
          <div class="w3" [class.w3-ud]="myTeam() === 1">
            <!-- 顶栏贴图（Tile01~04 的 v=0~0.125 条带，中间缺口留给时间指示器） -->
            <div class="w3-top" [style.background-image]="skin('topbar.png')"></div>

            <!-- 左上四个菜单按钮：UpperButtonBarFrame，x=0.002+i×0.085，宽 0.085 高 0.022 -->
            @for (b of upperButtons; track b.id) {
              <button type="button" class="w3-upper" [class.on]="menu() === b.id" [style]="b.style"
                      [style.--tex]="skin('upper-button.png')" (click)="toggleMenu(b.id)">
                {{ b.text }} (<em>{{ b.key }}</em>)
              </button>
            }

            <!-- 时间指示器：外框贴图 + 随昼夜横向滚动的天空盘（TimeOfDayIndicator 模型的两张贴图） -->
            <div class="w3-time" [style]="L.time">
              <div class="w3-time-sky" [style.background-image]="skin('ti-HumanUITile-TimeIndicator.png')" [style.background-position-x.%]="h.skyPos"></div>
              <div class="w3-time-frame" [style.background-image]="skin(myTeam() === 1 ? 'ti-UndeadUITile-TimeIndicatorFrame.png' : 'ti-NightElfUITile-TimeIndicatorFrame.png')"></div>
            </div>

            <!-- 资源栏：ResourceBarFrame（宽 0.33828，贴屏幕右上）。DotA 用 war3mapSkin.txt 把木材=分、人口=秒、维护费=版本号 -->
            <img class="w3-abs" [style]="L.resGoldIcon" src="/assets/wc3/native-ui/NightElf/res-gold.png" alt="" />
            <div class="w3-res" [style]="L.resGold" (mouseenter)="showNativeTip('黄金', '金钱是击杀敌方单位或英雄的奖励，也会定期增长。')" (mouseleave)="hideTip()">{{ h.gold }}</div>
            <img class="w3-abs" [style]="L.resLumberIcon" src="/assets/wc3/native-ui/common/dota-lumber-clock.png" alt="" />
            <div class="w3-res" [style]="L.resLumber" (mouseenter)="showNativeTip('分：', '对局已进行的分钟数。')" (mouseleave)="hideTip()">{{ h.clockMin }}</div>
            <div class="w3-res" [style]="L.resSupply" (mouseenter)="showNativeTip('秒：', '对局已进行的秒数。')" (mouseleave)="hideTip()">{{ h.clockSec }}</div>
            <div class="w3-res w3-upkeep" [style]="L.resUpkeep">v6.83d</div>

            <!-- 多面板（DotA 计分板）标题与最小化按钮：Multiboard.fdf -->
            <div class="w3-mb-title" [style]="L.mbTitle">( {{ h.stats[0] }}/{{ h.stats[1] }}/{{ h.stats[2] }} - {{ h.stats[3] }}/{{ h.stats[4] }} - {{ h.level }} )</div>
            <button type="button" class="w3-mb-btn" [class.open]="showScore()" [style]="L.mbBtn" (click)="showScore.set(!showScore())" aria-label="展开或收起计分板"></button>
            @if (showScore()) {
              <div class="w3-mb-board" [style]="L.mbBoard">
                <div class="w3-mb-row w3-mb-head"><span>近卫军团</span><span>{{ h.radiantKills }}</span></div>
                @for (r of h.score; track r.slot) {
                  @if (r.slot === 5) { <div class="w3-mb-row w3-mb-head"><span>天灾军团</span><span>{{ h.direKills }}</span></div> }
                  <div class="w3-mb-row" [class.dead]="!r.alive">
                    <img [src]="r.icon" alt="" />
                    <span class="nm" [style.color]="r.color === '#540081' ? '#c084fc' : r.color">{{ r.player }}</span>
                    <span class="lv">{{ r.level }}</span>
                    <span>{{ r.k }}/{{ r.d }}/{{ r.a }}</span>
                    <span>{{ r.lh }}/{{ r.dn }}</span>
                    <span class="rs">{{ r.alive ? '' : r.respawn }}</span>
                  </div>
                }
              </div>
            }

            <!-- 游戏消息（原版位于屏幕左侧、控制台上方） -->
            <div class="w3-msgs">
              @for (m of messages(); track m.id) { <div [style.color]="m.color">{{ m.text }}</div> }
            </div>
            @if (errText()) { <div class="w3-err">{{ errText() }}</div> }
            @if (targeting(); as tg) { <div class="w3-hint">{{ tg.label }}</div> }
            @if (h.respawn > 0) { <div class="w3-respawn">你的英雄已阵亡，{{ h.respawn }} 秒后复活</div> }
            <div class="w3-net">{{ h.net }}</div>

            <!-- 底部控制台：四块瓦片 v=0.3125~1（Tile02 为 0.414~1），高 0.176 -->
            <!-- 3D 肖像（Portrait / Portrait Talk）；无肖像模型时退回头像图标 -->
            <div class="w3-abs w3-portrait" [style]="L.portrait">
              <canvas #portraitCanvas width="144" height="168" [class.hidden]="!portrait3d()"></canvas>
              @if (!portrait3d() && h.sel.icon) { <img [src]="h.sel.icon" alt="" /> }
            </div>

            <div class="w3-hit"></div><div class="w3-hit l"></div><div class="w3-hit r"></div>
            <div class="w3-console" [style.background-image]="skin('console.png')"></div>


            <!-- 小地图 -->
            <canvas #minimap width="256" height="256" class="w3-abs w3-minimap" [style]="L.minimap"
                    (pointerdown)="onMinimapDown($event)" (contextmenu)="$event.preventDefault()"></canvas>

            <!-- 小地图右侧五个按钮：信号 / 地形 / 盟友颜色 / 野怪营地 / 阵型 -->
            @for (b of mmButtons(); track b.id) {
              <button type="button" class="w3-abs w3-mmbtn" [style]="b.style" [style.background-image]="b.img"
                      (click)="onMmButton(b.id)" (mouseenter)="showNativeTip(b.title, b.tip)" (mouseleave)="hideTip()" [attr.aria-label]="b.title"></button>
            }

            <!-- 生命 / 魔法 文本（肖像下方两条镂空） -->
            @if (h.sel.maxHp > 0) { <div class="w3-abs w3-hp" [style]="L.hpText" [style.color]="h.sel.hpColor">{{ h.sel.hp }} / {{ h.sel.maxHp }}</div> }
            @if (h.sel.maxMp > 0) { <div class="w3-abs w3-mp" [style]="L.mpText">{{ h.sel.mp }} / {{ h.sel.maxMp }}</div> }

            <!-- 信息面板：SimpleInfoPanelUnitDetail -->
            <div class="w3-abs w3-info" [style]="L.info">
              <div class="w3-name">{{ h.sel.title }}</div>
              @if (h.sel.isHero) {
                <div class="w3-xp" (mouseenter)="showNativeTip('经验值', h.sel.xpText)" (mouseleave)="hideTip()">
                  <i [style.width.%]="h.sel.xpPct"></i>
                  <span>等级 {{ h.sel.level }} {{ h.sel.cls }}</span>
                </div>
              } @else if (h.sel.cls) {
                <div class="w3-class">{{ h.sel.cls }}</div>
              }
              @if (h.sel.dmg) {
                <div class="w3-icon-row" style="top: 21.9%">
                  <img [src]="h.sel.dmgIcon" alt="" />
                  <div><span class="lb">攻击力:</span><span class="vl">{{ h.sel.dmg }}</span></div>
                </div>
              }
              @if (h.sel.armor) {
                <div class="w3-icon-row" style="top: 43.2%">
                  <img [src]="h.sel.armorIcon" alt="" />
                  <div><span class="lb">护甲:</span><span class="vl">{{ h.sel.armor }}</span></div>
                </div>
              }
              @if (h.sel.isHero) {
                <div class="w3-hero-attr">
                  <img [src]="h.sel.attrIcon" alt="" />
                  <div>
                    <span class="lb">力量:</span><span class="vl">{{ h.sel.str }}</span>
                    <span class="lb">敏捷:</span><span class="vl">{{ h.sel.agi }}</span>
                    <span class="lb">智力:</span><span class="vl">{{ h.sel.int }}</span>
                  </div>
                </div>
              }
              @if (h.sel.buffs.length) {
                <div class="w3-status"><span class="lb">状态:</span> {{ h.sel.buffs.join('、') }}</div>
              }
            </div>

            <!-- 物品栏 6 格（非英雄单位时盖上 InventoryCover 贴图） -->
            @if (h.sel.isHero) {
              @for (it of h.items; track $index) {
                <button type="button" class="w3-abs w3-btn" [class.empty]="!it" [style]="L.inv[$index]" (click)="useItem($index)" (contextmenu)="sellItem($index, $event)"
                        (mouseenter)="it && showNativeTip(it.name, it.desc, it.sellGold, 0, '右键出售：')" (mouseleave)="hideTip()" [attr.aria-label]="it ? it.name : '空物品栏'">
                  @if (it) {
                    <img [src]="it.icon" alt="" />
                    @if (it.cdPct > 0) { <i class="cd" [style.--p]="it.cdPct"></i> }
                    @if (it.charges > 1) { <b class="num">{{ it.charges }}</b> }
                  }
                </button>
              }
            } @else {
              <div class="w3-abs w3-invcover" [style]="L.invCover" [style.background-image]="skin('inventory-cover.png')"></div>
            }

            <!-- 命令卡 4×3：按钮 0.039，间距 0.0434 -->
            @for (c of cells(); track $index) {
              @if (c) {
                <button type="button" class="w3-abs w3-btn" [class.dim]="c.dim" [class.act]="c.active" [style]="L.cmd[$index]" (click)="c.click()"
                        (mouseenter)="showNativeTip(c.title, c.body, c.gold, c.mana)" (mouseleave)="hideTip()" [attr.aria-label]="c.title">
                  <img [src]="c.icon" alt="" />
                  @if (c.cdPct > 0) { <i class="cd" [style.--p]="c.cdPct"></i> }
                  @if (c.num) { <b class="num">{{ c.num }}</b> }
                </button>
              }
            }

            <!-- 原生提示框：固定在命令卡上方、贴右 -->
            @if (tip(); as t) {
              <div class="w3-tip">
                <div class="tt">{{ t.title }}</div>
                @if (t.gold || t.mana) {
                  <div class="cost">
                    @if (t.gold) { <span>{{ t.goldLabel }}<img src="/assets/wc3/native-ui/NightElf/tip-gold.png" alt="金" />{{ t.gold }}</span> }
                    @if (t.mana) { <span><img src="/assets/wc3/native-ui/NightElf/tip-mana.png" alt="魔法" />{{ t.mana }}</span> }
                  </div>
                }
                @if (t.body) { <div class="bd">{{ t.body }}</div> }
              </div>
            }

            <!-- F9~F12 对话框（EscMenu 边框九宫格） -->
            @if (menu(); as mn) {
              <div class="w3-dialog" [style.--nine]="'url(/assets/wc3/native-ui/common/esc-' + (myTeam() === 1 ? 'undead' : 'nightelf') + '-9.png)'">
                @if (mn === 'quests') {
                  <div class="hd">地图信息</div>
                  <div class="tx">DotA Allstars v6.83d · 网页对战

右键地面移动，右键敌人攻击，右键血量低于一半的己方小兵反补。
A 攻击移动 / 强制攻击，S 停止，H 保持原位，M 移动。
技能热键见提示框方括号内字母；点红十字或按 O 学习技能，Ctrl + 热键直接加点。
物品：小键盘 7 8 / 4 5 / 1 2，或主键盘 1~6。
左键点击商店后，命令卡显示其货架，点击图标购买；右键物品栏出售。
镜头：屏幕边缘、方向键、中键拖动、滚轮；空格回到英雄并跟随。</div>
                } @else if (mn === 'menu') {
                  <div class="hd">游戏菜单</div>
                  <button type="button" class="w3-dbtn" (click)="toggleCamLock()">镜头跟随英雄：{{ camLock() ? '开' : '关' }}</button>
                  <button type="button" class="w3-dbtn" (click)="toggleHpBars()">显示生命条：{{ hpBars() ? '开' : '关' }}</button>
                  <button type="button" class="w3-dbtn" (click)="quitGame()">退出游戏</button>
                } @else if (mn === 'allies') {
                  <div class="hd">盟友</div>
                  @for (r of h.score; track r.slot) {
                    @if ((r.slot < 5) === (myTeam() === 0)) {
                      <div class="ally"><img [src]="r.icon" alt="" /><span [style.color]="r.color === '#540081' ? '#c084fc' : r.color">{{ r.player }}</span><span>{{ r.hero }} · 等级 {{ r.level }}</span><span class="g">{{ r.gold }}</span></div>
                    }
                  }
                } @else {
                  <div class="hd">消息记录</div>
                  <div class="tx log">{{ logText() }}</div>
                }
                <button type="button" class="w3-dbtn ret" (click)="menu.set(null)">返回游戏 (Esc)</button>
              </div>
            }

            @if (winner() >= 0) {
              <div class="w3-dialog" [style.--nine]="'url(/assets/wc3/native-ui/common/esc-' + (myTeam() === 1 ? 'undead' : 'nightelf') + '-9.png)'">
                <div class="hd" [style.color]="winner() === myTeam() ? '#4ade80' : '#f87171'">{{ winner() === myTeam() ? '胜利！' : '失败' }}</div>
                <div class="tx">{{ winner() === 0 ? '近卫军团' : '天灾军团' }} 摧毁了对方基地。</div>
                <button type="button" class="w3-dbtn ret" (click)="quitGame()">退出游戏</button>
              </div>
            }
          </div>
        }
      </div>

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
  readonly tip = signal<{ title: string; body: string; gold: number; mana: number; goldLabel: string } | null>(null);
  readonly menu = signal<MenuId | null>(null);
  readonly errText = signal('');
  readonly cells = signal<(Cell | null)[]>(new Array(12).fill(null));
  readonly portrait3d = signal(false);
  readonly hpBars = signal(true);
  readonly mmTerrain = signal(true);
  readonly mmAlly = signal(false);
  readonly mmCreeps = signal(true);
  readonly formation = signal(true);
  readonly pingMode = signal(false);
  private readonly portraitCanvas = viewChild<ElementRef<HTMLCanvasElement>>('portraitCanvas');
  private selShop: { id: string; name: string; items: string[] } | null = null;
  private portraitFor = '';
  private errTimer = 0;
  private log: string[] = [];
  private pings: { x: number; y: number; t: number }[] = [];

  /** 顶部四个菜单按钮：UpperButtonBar.fdf —— 首个偏移 0.002，宽 0.085，高 0.022；文字取自地图 war3mapSkin.txt / GlobalStrings */
  readonly upperButtons: { id: MenuId; text: string; key: string; style: string }[] = [
    { id: 'quests', text: '地图信息', key: 'F9', style: U(0.002, 0, 0.085, 0.022) },
    { id: 'menu', text: '菜单', key: 'F10', style: U(0.087, 0, 0.085, 0.022) },
    { id: 'allies', text: '盟友', key: 'F11', style: U(0.172, 0, 0.085, 0.022) },
    { id: 'log', text: '聊天', key: 'F12', style: U(0.257, 0, 0.085, 0.022) },
  ];
  /** 各帧矩形。顶栏数值来自 ResourceBar.fdf / Multiboard.fdf；底部来自控制台贴图镂空（见 native-ui/manifest.json） */
  readonly L = {
    time: U(0.336, 0, 0.128, 0.064),
    resGoldIcon: U(0.46172, 0.003125, 0.01640625, 0.01640625),
    resGold: U(0.47516, 0.003125, 0.06, 0.01640625),
    resLumberIcon: U(0.46172 + 0.0859375, 0.003125, 0.01640625, 0.01640625),
    resLumber: U(0.561875, 0.003125, 0.06, 0.01640625),
    resSupply: U(0.64859, 0.003125, 0.06, 0.01640625),
    resUpkeep: U(0.72109, 0.003125, 0.07578125, 0.01640625),
    mbBtn: U(0.778, 0.0262, 0.018, 0.0175),
    mbTitle: `right:${((0.8 - 0.778 - 0.0057) / 0.8) * 100}%;top:${(0.0262 / 0.6) * 100}%;height:${(0.0175 / 0.6) * 100}%`,
    mbBoard: `right:${((0.8 - 0.796) / 0.8) * 100}%;top:${((0.0262 + 0.0175 - 0.004) / 0.6) * 100}%`,
    minimap: B(20, 58, 276, 279),
    portrait: B(435, 122, 144, 168),
    hpText: B(437, 298, 140, 22),
    mpText: B(437, 325, 141, 20),
    info: B(620, 60, 380, 292),
    invCover: B(992, 0, 256, 352),
    inv: [0, 1, 2, 3, 4, 5].map((i) => B(1032 + (i % 2) * 78, 126 + Math.floor(i / 2) * 78, 66, 66)),
    cmd: Array.from({ length: 12 }, (_, i) => B([1233, 1321, 1408, 1495][i % 4], [86, 173, 260][Math.floor(i / 4)], 79, 79)),
  };
  readonly mmButtons = computed(() => {
    const img = (f: string) => `url(${NUI}/NightElf/${f}.png)`;
    return [
      { id: 'signal', style: B(310, 66, 44, 40), img: img(this.pingMode() ? 'mm-signal-down' : 'mm-signal'), title: '小地图信号 (Alt+G)', tip: '点击后在小地图上点选位置，向盟友发出信号。' },
      { id: 'terrain', style: B(310, 110, 44, 40), img: img(this.mmTerrain() ? 'mm-terrain-on' : 'mm-terrain-off'), title: '切换地形显示 (Alt+T)', tip: '在小地图上显示或隐藏地形。' },
      { id: 'ally', style: B(310, 154, 44, 40), img: img(this.mmAlly() ? 'mm-ally-on' : 'mm-ally-off'), title: '切换盟友颜色 (Alt+A)', tip: '在「玩家颜色」与「敌我颜色」之间切换小地图上的英雄标记。' },
      { id: 'creep', style: B(310, 198, 44, 40), img: img(this.mmCreeps() ? 'mm-creep-on' : 'mm-creep-off'), title: '显示中立生物营地 (Alt+R)', tip: '在小地图上显示或隐藏野怪。' },
      { id: 'formation', style: B(309, 248, 46, 46), img: img(this.formation() ? 'mm-formation-on' : 'mm-formation-off'), title: '切换队形移动 (Alt+F)', tip: '网页端只控制单个英雄，此开关仅保留外观。' },
    ];
  });
  skin(file: string): string {
    return `url(${NUI}/${this.myTeam() === 1 ? 'Undead' : 'NightElf'}/${file})`;
  }
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
      this.selShop = null;
      this.portraitFor = '';
      this.log = [];
      const pc = this.portraitCanvas()?.nativeElement;
      if (pc) void mdx.attachPortraitCanvas(pc);
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
      this.pushMsg(`欢迎来到 DotA 6.83d 网页对战！${setup.prepSec} 秒后出兵，按 F9 查看操作说明。`, '#fed312');
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
    this.log.push(text);
    if (this.log.length > 200) this.log.shift();
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
        cdPct: it.cdUntil > engine.tick ? Math.min(100, (((it.cdUntil - engine.tick) * 0.05) / Math.max(1, def?.active?.cool || 1)) * 100) : 0,
        sellGold: Math.floor((def?.cost || 0) / 2),
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
    // ---- 信息面板对象 ----
    const selUnit = this.selShop ? undefined : sel || me;
    const icon = (kind: string, table: Record<string, string>, key: string) => `${NUI}/NightElf/info-${kind}-${table[key] || Object.values(table)[0]}.png`;
    let selInfo: SelInfo;
    if (this.selShop || !selUnit) {
      selInfo = { title: this.selShop?.name || '', cls: '商店', isHero: false, level: 0, xpPct: 0, xpText: '', hp: 0, maxHp: 0, hpColor: '', mp: 0, maxMp: 0, dmg: '', dmgIcon: '', armor: '', armorIcon: '', attrIcon: '', str: 0, agi: 0, int: 0, buffs: [], icon: '' };
    } else {
      const sh = selUnit.hero;
      const hpPct = selUnit.hp / Math.max(1, selUnit.maxHp);
      const lvPrev = sh && sh.level >= 2 ? need[sh.level - 2] : 0;
      const lvNext = sh ? need[sh.level - 1] ?? lvPrev : 0;
      selInfo = {
        title: sh ? sh.def.proper || selUnit.name : selUnit.name,
        cls: sh ? selUnit.name : selUnit.kind === 'creep' || selUnit.kind === 'neutral' ? `等级 ${selUnit.level}` : '',
        isHero: !!sh,
        level: sh ? sh.level : selUnit.level,
        xpPct: sh ? (sh.level >= d.constants.maxHeroLevel ? 100 : Math.max(0, Math.min(100, ((sh.xp - lvPrev) / Math.max(1, lvNext - lvPrev)) * 100))) : 0,
        xpText: sh ? `${Math.floor(sh.xp)} / ${lvNext}` : '',
        hp: Math.max(0, Math.round(selUnit.hp)),
        maxHp: selUnit.maxHp,
        hpColor: hpPct > 0.66 ? '#20ff20' : hpPct > 0.33 ? '#ffff20' : '#ff3030',
        mp: Math.round(selUnit.mp),
        maxMp: selUnit.maxMp,
        dmg: selUnit.atk ? this.fmtDmg(selUnit) : '',
        dmgIcon: icon('dmg', DMG_ICON, selUnit.atk?.type || 'normal'),
        armor: engine.vulnerable(selUnit) ? String(Math.round(selUnit.armor)) : '无敌',
        armorIcon: icon('armor', ARMOR_ICON, selUnit.armorType),
        attrIcon: `${NUI}/NightElf/info-hero-${sh ? sh.def.primary : 'str'}.png`,
        str: sh ? Math.floor(sh.str) : 0,
        agi: sh ? Math.floor(sh.agi) : 0,
        int: sh ? Math.floor(sh.int) : 0,
        buffs: [...new Set(selUnit.buffs.filter((bf) => bf.until > engine.tick).map((bf) => BUFF_NAMES[bf.kind] || bf.kind))],
        icon: sh ? `/assets/dota/heroIcons/${sh.def.icon}` : '',
      };
    }
    this.syncPortrait(selUnit);
    this.cells.set(this.buildCells(me, skills));
    const shown = Math.max(0, Math.floor(sec));
    // 昼夜：按 480 秒一昼夜、开局为清晨 6 点推算（未从脚本取证）
    const hours = (6 + (Math.max(0, sec) / 480) * 24) % 24;
    this.hud.set({
      clockMin: Math.floor(shown / 60),
      clockSec: shown % 60,
      skyPos: -50 + (((hours - 12 + 24) % 24) / 24) * 200,
      stats: [h.kills, h.deaths, h.assists, h.lastHits, h.denies],
      sel: selInfo,
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
          this.err('必须指定一个有效的目标单位');
          return;
        }
        this.send({ t: 'cast', slot: tg.slot, id: pickT.id });
      } else if (ground) {
        this.send({ t: 'cast', slot: tg.slot, x: Math.round(ground.x), y: Math.round(ground.y) });
      }
      this.cancelTargeting();
      return;
    }
    const shop = !unit && ground ? this.shopAt(ground.x, ground.y) : null;
    this.selShop = shop;
    this.learnMode.set(false);
    view.selectedId = unit ? unit.id : shop ? 0 : me.id;
    if (unit) this.mdx?.playPortraitTalk();
    this.updateHud();
  }

  private cancelTargeting(): void {
    this.targeting.set(null);
    if (this.view) this.view.targeting = null;
    this.updateHud();
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
    this.selShop = null;
    this.learnMode.set(!this.learnMode());
    this.updateHud();
  }
  learn(slot: number): void {
    const me = this.me();
    if (!me || !this.engine?.canLearn(me, slot)) {
      this.err('当前等级无法升级该技能');
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
      if (reason !== '被动技能') this.err(`${ab.name}：${reason}`);
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
      this.err(`无法购买：${reason}`);
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
      this.escape();
      return;
    }
    const fk: Record<string, MenuId> = { F9: 'quests', F10: 'menu', F11: 'allies', F12: 'log' };
    if (fk[key]) {
      e.preventDefault();
      this.toggleMenu(fk[key]);
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
    if (this.pingMode()) {
      this.pings.push({ x: w.x, y: w.y, t: performance.now() });
      this.pingMode.set(false);
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
    if (this.mmTerrain() && this.minimapImg?.complete && this.minimapImg.naturalWidth) ctx.drawImage(this.minimapImg, 0, 0, S, S);
    const P = (x: number, y: number) => worldToMapPixel(x, y, DOTA_MAP_BOUNDS, S, S);
    const myTeam = this.myTeam();
    for (const u of engine.units.values()) {
      if (!u.alive || u.hero) continue;
      if (u.kind === 'neutral' && !this.mmCreeps()) continue;
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
      // 盟友颜色开关：关=玩家颜色，开=敌我颜色（己方青绿 / 敌方红）
      ctx.fillStyle = this.mmAlly() ? (u.hero.slot === this.mySlot ? '#ffffff' : u.team === myTeam ? '#00e0c0' : '#ff2020') : PLAYER_COLORS[u.hero.slot];
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
      ctx.strokeRect(px - 18, py - 11, 36, 22);
    }
    // 信号：向外扩散的圆环
    const now = performance.now();
    this.pings = this.pings.filter((p) => now - p.t < 3000);
    for (const p of this.pings) {
      const { px, py } = P(p.x, p.y);
      const k = ((now - p.t) % 1000) / 1000;
      ctx.strokeStyle = `rgba(0,255,0,${1 - k})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 4 + k * 16, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ============================================================ 原生提示框 / 菜单 / 小地图按钮
  showNativeTip(title: string, body: string, gold = 0, mana = 0, goldLabel = ''): void {
    this.tip.set({ title, body, gold, mana, goldLabel });
  }
  hideTip(): void {
    this.tip.set(null);
  }
  toggleMenu(id: MenuId): void {
    this.menu.set(this.menu() === id ? null : id);
  }
  logText(): string {
    return this.log.join(NL) || '（暂无消息）';
  }
  toggleHpBars(): void {
    const next = !this.hpBars();
    this.hpBars.set(next);
    if (this.view) this.view.showHpBars = next;
  }
  onMmButton(id: string): void {
    if (id === 'signal') this.pingMode.set(!this.pingMode());
    else if (id === 'terrain') this.mmTerrain.set(!this.mmTerrain());
    else if (id === 'ally') this.mmAlly.set(!this.mmAlly());
    else if (id === 'creep') this.mmCreeps.set(!this.mmCreeps());
    else if (id === 'formation') this.formation.set(!this.formation());
  }
  /** 原版的错误提示：屏幕中下方金色文字，约 2 秒后消失 */
  private err(text: string): void {
    this.errText.set(text);
    clearTimeout(this.errTimer);
    this.errTimer = window.setTimeout(() => this.errText.set(''), 2200);
  }

  /** 把地面点击解析为商店（商店不是引擎单位，按 buildings.json 的位置判定） */
  private shopAt(x: number, y: number): { id: string; name: string; items: string[] } | null {
    const d = this.data();
    if (!d) return null;
    for (const b of this.buildingsCfg) {
      if (b.kind !== 'shop' && b.kind !== 'side_shop' && b.kind !== 'secret_shop') continue;
      if (Math.hypot(b.x - x, b.y - y) > 150) continue;
      const unitId = (b as DotaBuilding & { unitId?: string }).unitId || DIRE_SHOP[b.id];
      const shop = d.shops.find((sh) => sh.id === unitId);
      if (shop) return { id: b.id, name: shop.name, items: shop.items.slice(0, 12) };
    }
    return null;
  }

  private buildCells(me: Unit, skills: SkillHud[]): (Cell | null)[] {
    const d = this.data();
    const engine = this.engine;
    const cells: (Cell | null)[] = new Array(12).fill(null);
    if (!d || !engine || !me.hero) return cells;
    const base = { gold: 0, mana: 0, cdPct: 0, num: 0, dim: false, active: false };
    const cancel: Cell = { ...base, icon: `${NUI}/common/BTNCancel.png`, title: '取消 [Esc]', body: '', click: () => this.escape() };
    // 选择目标时原版命令卡只剩「取消」
    if (this.targeting()) {
      cells[11] = cancel;
      return cells;
    }
    if (this.selShop) {
      this.selShop.items.forEach((code, i) => {
        const it = d.items[code];
        if (!it) return;
        const reason = engine.buyBlockReason(me, code);
        cells[i] = { ...base, icon: `/assets/dota/itemIcons/${code}.png`, title: `购买 ${it.name}`, body: it.desc + (reason ? NL + NL + '⚠ ' + reason : ''), gold: it.cost, dim: !!reason, click: () => this.buy(code) };
      });
      return cells;
    }
    if (this.learnMode()) {
      skills.forEach((sk, i) => {
        const ab = d.abilities[sk.code];
        if (sk.level >= sk.maxLevel) return;
        const cell: Cell = {
          ...base,
          icon: sk.icon,
          title: `学习 ${sk.name} [${sk.hotkey}] - [等级 ${sk.level + 1}]`,
          body: sk.code === 'Aamk' ? '每级全属性 +2。' : ab?.tip || '',
          dim: !sk.canLearn,
          click: () => this.learn(sk.slot),
        };
        if (sk.code === 'Aamk') cells[4] = cell;
        else if (i < 4) cells[i] = cell;
      });
      cells[11] = cancel;
      return cells;
    }
    const basic: [number, string, string, string, string][] = [
      [0, 'move', 'BTNMove', '移动 [M]', '命令单位移动到目标地点。如果目标是一个单位，则会跟随它。'],
      [1, 'stop', 'BTNStop', '停止 [S]', '命令单位停止当前的行动。'],
      [2, 'hold', 'BTNHoldPosition', '保持原位 [H]', '命令单位停在原地，只攻击进入射程的敌人。'],
      [3, 'attack', 'BTNAttack', '攻击 [A]', '命令单位攻击目标，或移动到目标地点并攻击沿途遇到的敌人。'],
    ];
    for (const [idx, id, icon, title, body] of basic) {
      cells[idx] = { ...base, icon: `${NUI}/common/${icon}.png`, title, body, click: () => this.basicCommand(id) };
    }
    if (me.hero.skillPoints > 0) {
      cells[7] = { ...base, icon: `${NUI}/common/BTNSkillz.png`, title: '英雄技能 [O]', body: `打开英雄技能菜单，可以学习或升级技能。${NL}未使用的技能点：${me.hero.skillPoints}`, num: me.hero.skillPoints, click: () => this.toggleLearn() };
    }
    skills.slice(0, 4).forEach((sk, i) => {
      if (sk.level <= 0) return; // 原版不显示未学习的英雄技能
      cells[8 + i] = {
        ...base,
        icon: sk.icon,
        title: `${sk.name} [${sk.hotkey}] - [等级 ${sk.level}]`,
        body: this.skillTip(sk),
        mana: sk.passive ? 0 : sk.cost,
        cdPct: sk.cdPct,
        click: () => this.castSkill(sk.slot),
      };
    });
    return cells;
  }

  private escape(): void {
    if (this.targeting()) this.cancelTargeting();
    else if (this.learnMode()) this.learnMode.set(false);
    else if (this.menu()) this.menu.set(null);
    else if (this.selShop) {
      this.selShop = null;
      if (this.view) this.view.selectedId = this.me()?.id || 0;
    }
    this.updateHud();
  }

  /** 肖像跟随当前选中单位：有 *_Portrait 模型用 3D，否则退回头像 */
  private syncPortrait(u: Unit | undefined): void {
    const mdx = this.mdx;
    const key = this.selShop ? 'shop:' + this.selShop.id : u ? `${u.typeId}:${u.team}` : '';
    if (!mdx || key === this.portraitFor) return;
    this.portraitFor = key;
    if (!u || this.selShop) {
      this.portrait3d.set(false);
      return;
    }
    const roster = u.hero ? getHeroByCode(u.typeId) : undefined;
    const url = roster ? roster.modelUrl : u.model;
    const color = u.hero ? (u.hero.slot < 5 ? u.hero.slot + 1 : u.hero.slot + 2) : u.team === 0 ? 0 : 6;
    void mdx.setPortraitModel(url, color).then((ok) => {
      if (this.portraitFor === key) this.portrait3d.set(ok);
    });
  }
}
