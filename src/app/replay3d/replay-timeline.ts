// --- AI 修改开始 [REPLAY-TIMELINE]：新增 War3Bot 玩家动作流（match_*.dat）完整时间轴与状态还原引擎 ---
/**
 * 解析 War3Bot 保存的 wuxiancong 录像数据（match_*.dat），
 * 按时间轴实时还原英雄 3D 坐标、朝向、动画序列、等级、属性、6 格物品栏、4 技能等级、金钱与击杀补刀数据。
 */

export interface ReplayMatchSummary {
  fileName: string;
  matchId: string;
  player: string;
  pid: number;
  heroId: string;
  heroCode: string;
  heroName: string;
  heroIcon: string;
  gameStartMs: number;
  gameEndMs: number;
  durationMs: number;
  totalActions: number;
  moveActions: number;
}

export interface DotaHeroSkillDef {
  slot: number;
  code: string;
  name: string;
  hotkey: string;
  isExtra: boolean;
  maxLevel: number;
  parentCode: string;
}

export interface DotaItemDef {
  name: string;
  realCode: string;
  shopCode: string;
  recipeCode: string;
  type: string;
  stackable: boolean;
  cost: number;
}

export interface DotaRecipeDef {
  components: string[];
  result: string;
}

export interface ReplayMatchPayload {
  fileName: string;
  matchId: string;
  player: string;
  pid: number;
  heroId: string;
  heroCode: string;
  heroName: string;
  heroIcon: string;
  gameStartMs: number;
  gameEndMs: number;
  durationMs: number;
  totalActions: number;
  players: Record<string, string>;
  heroMeta: {
    name: string;
    attrCode: string;
    skills: DotaHeroSkillDef[];
  };
  items: Record<string, DotaItemDef>;
  recipes: Record<string, DotaRecipeDef>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  abilities: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actions: any[][];
}

export interface ReplayInventorySlot {
  slot: number;
  hotkey: string;
  code: string;
  name: string;
  icon: string;
  charges: number;
  activeToggle?: boolean;
}

export interface ReplaySkillSlot {
  slot: number;
  code: string;
  name: string;
  hotkey: string;
  level: number;
  maxLevel: number;
  icon: string;
}

export interface ReplayEventLogItem {
  timeMs: number;
  timeText: string;
  kind: 'hero' | 'skill' | 'item' | 'move' | 'combat' | 'system';
  text: string;
}

export interface ReplayFrameState {
  timeMs: number;
  gameClockText: string;
  isDaytime: boolean;
  heroCode: string;
  heroName: string;
  heroClassTitle: string;
  heroIcon: string;
  heroModelUrl: string;
  heroAssetBaseUrl: string;
  x: number;
  y: number;
  facingRad: number;
  sequence: string;
  isMoving: boolean;
  /** 当前基本指令：移动/停止/保持原位/攻击/巡逻（命令卡绿色高亮） */
  basicCommand: '' | 'move' | 'stop' | 'hold' | 'attack' | 'patrol';
  level: number;
  xpPercent: number;
  unspentSkillPoints: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  strBase: number;
  strBonus: number;
  agiBase: number;
  agiBonus: number;
  intBase: number;
  intBonus: number;
  damageMin: number;
  damageMax: number;
  damageBonus: number;
  armor: number;
  armorBonus: number;
  moveSpeed: number;
  gold: number;
  kills: number;
  deaths: number;
  assists: number;
  lastHits: number;
  denies: number;
  neutrals: number;
  skills: ReplaySkillSlot[];
  attrBonusLevel: number;
  inventory: ReplayInventorySlot[];
  recentEvents: ReplayEventLogItem[];
  trailPoints: { x: number; y: number }[];
}

interface MoveKeyframe {
  t0: number;
  t1: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  facingRad: number;
  anim: string;
}

type BasicCommandId = '' | 'move' | 'stop' | 'hold' | 'attack' | 'patrol';

interface StateSnapshot {
  timeMs: number;
  level: number;
  skillLevels: Record<string, number>;
  attrBonusLevel: number;
  inventory: (ReplayInventorySlot | null)[];
  goldSpent: number;
  kills: number;
  deaths: number;
  assists: number;
  lastHits: number;
  denies: number;
  neutrals: number;
  basicCommand: BasicCommandId;
}

/** WC3 基本命令 OrderId → 命令卡槽位 */
function resolveBasicCommand(orderId: number): BasicCommandId | null {
  // 0xD0012 move / 0xD0003 smart（右键点地多视为移动）
  if (orderId === 0xd0012 || orderId === 0xd0003) return 'move';
  // 0xD000F attack / attack-move
  if (orderId === 0xd000f) return 'attack';
  // 0xD0016 patrol
  if (orderId === 0xd0016) return 'patrol';
  // 0xD0004 stop
  if (orderId === 0xd0004) return 'stop';
  // 0xD0019 holdposition（兼容误记的 0xD0005）
  if (orderId === 0xd0019 || orderId === 0xd0005) return 'hold';
  return null;
}

const INV_HOTKEYS = ['Num7', 'Num8', 'Num4', 'Num5', 'Num1', 'Num2'];

/** 常见英雄 3D 模型映射表（优先匹配已提取的 WC3 原生模型） */
const HERO_MODEL_MAP: Record<string, { modelUrl: string; assetBaseUrl: string; classTitle: string; primary: 'str' | 'agi' | 'int' }> = {
  Nbbc: {
    modelUrl: '/assets/models/blademaster/HeroBladeMaster.mdxbin',
    assetBaseUrl: '/assets/models/blademaster/',
    classTitle: '尤涅若 · 近战敏捷',
    primary: 'agi',
  },
  H00U: {
    modelUrl: '/assets/wc3/Units/Human/Rifleman/Rifleman.mdxbin',
    assetBaseUrl: '/assets/wc3/',
    classTitle: '卡德尔 · 远程敏捷',
    primary: 'agi',
  },
  Edem: {
    modelUrl: '/assets/wc3/Units/NightElf/HeroDemonHunter/HeroDemonHunter.mdxbin',
    assetBaseUrl: '/assets/wc3/',
    classTitle: '玛吉纳 · 近战敏捷',
    primary: 'agi',
  },
  // --- AI 修改开始 [HERO-PA-MORTRED]：将幻影刺客（茉崔蒂 Ewrd/Ewar）精准映射至提取的守望者 HeroWarden 模型与肖像 ---
  Ewar: {
    modelUrl: '/assets/models/warden/HeroWarden.mdxbin',
    assetBaseUrl: '/assets/models/warden/',
    classTitle: '茉崔蒂 · 近战敏捷',
    primary: 'agi',
  },
  Ewrd: {
    modelUrl: '/assets/models/warden/HeroWarden.mdxbin',
    assetBaseUrl: '/assets/models/warden/',
    classTitle: '茉崔蒂 · 近战敏捷',
    primary: 'agi',
  },
  // --- AI 修改结束 [HERO-PA-MORTRED]：将幻影刺客（茉崔蒂 Ewrd/Ewar）精准映射至提取的守望者 HeroWarden 模型与肖像 ---
  Otch: {
    modelUrl: '/assets/wc3/Units/Orc/HeroTaurenChieftain/HeroTaurenChieftain.mdxbin',
    assetBaseUrl: '/assets/wc3/',
    classTitle: '牛头人酋长 · 近战力量',
    primary: 'str',
  },
  H001: {
    modelUrl: '/assets/wc3/Units/Human/HeroPaladin/HeroPaladin.mdxbin',
    assetBaseUrl: '/assets/wc3/',
    classTitle: '全能骑士 · 近战力量',
    primary: 'str',
  },
  U00P: {
    modelUrl: '/assets/wc3/Units/Undead/HeroLich/HeroLich.mdxbin',
    assetBaseUrl: '/assets/wc3/',
    classTitle: '巫妖 · 远程智力',
    primary: 'int',
  },
};

function intToFourCC(val: number | undefined): string {
  if (!val || val < 0x20202020 || val > 0x7a7a7a7a) return '';
  const c0 = (val >>> 24) & 0xff;
  const c1 = (val >>> 16) & 0xff;
  const c2 = (val >>> 8) & 0xff;
  const c3 = val & 0xff;
  const s = String.fromCharCode(c0, c1, c2, c3);
  return /^[\x20-\x7e]{4}$/.test(s) ? s : '';
}

/** 臂章开/关（及信使版）视为同一件装备，切换时是替换而非新增 */
function isArmletFamily(code: string): boolean {
  return (
    code === 'I00M' ||
    code === 'I00Q' ||
    code === 'I00S' ||
    code === 'I00T' ||
    code === 'I00N' ||
    code === 'I00R' ||
    code === 'I00V' ||
    code === 'I00W'
  );
}

export function formatMsClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export class ReplayTimelineEngine {
  readonly payload: ReplayMatchPayload;
  readonly durationMs: number;
  readonly gameHornMs: number;
  readonly firstMoveMs: number;
  private readonly moveKeyframes: MoveKeyframe[] = [];
  private readonly snapshots: StateSnapshot[] = [];
  private readonly events: ReplayEventLogItem[] = [];
  private readonly shopToRealItem = new Map<string, DotaItemDef>();
  private readonly recipeToRealItem = new Map<string, DotaItemDef>();
  private readonly realItems = new Map<string, DotaItemDef>();
  private readonly heroSkills: DotaHeroSkillDef[] = [];

  constructor(payload: ReplayMatchPayload) {
    this.payload = payload;
    this.durationMs = Math.max(1000, payload.durationMs || 1000);

    for (const [, item] of Object.entries(payload.items || {})) {
      if (item.realCode) this.realItems.set(item.realCode, item);
      if (item.shopCode) this.shopToRealItem.set(item.shopCode, item);
      if (item.recipeCode) this.recipeToRealItem.set(item.recipeCode, item);
    }

    const rawSkills = payload.heroMeta?.skills || [];
    for (let slot = 1; slot <= 4; slot++) {
      const found = rawSkills.find((s) => s.slot === slot && s.code);
      if (found) {
        this.heroSkills.push(found);
      }
    }

    let hornMs = 0;
    let firstMove = 0;
    for (const a of payload.actions || []) {
      const t = Number(a[0] || 0);
      if (a[1] === 0x6b && a[5] === 'Data:GameStart=1' && !hornMs) {
        hornMs = t;
      }
      if ((a[1] === 0x11 || a[1] === 0x12) && (Math.abs(a[2]) > 1 || Math.abs(a[3]) > 1) && !firstMove) {
        firstMove = t;
      }
    }
    this.gameHornMs = hornMs;
    this.firstMoveMs = firstMove || 0;

    this.buildTimeline();
  }

  private resolveItemIcon(code: string): string {
    if (!code) return '';
    const def = this.realItems.get(code) || this.shopToRealItem.get(code) || this.recipeToRealItem.get(code);
    if (def?.shopCode) {
      return `/assets/dota/itemIcons/${def.shopCode}.png`;
    }
    return `/assets/dota/itemIcons/${code}.png`;
  }

  private resolveItemName(code: string): string {
    if (!code) return '';
    const def = this.realItems.get(code) || this.shopToRealItem.get(code) || this.recipeToRealItem.get(code);
    return def?.name || code;
  }

  private buildTimeline(): void {
    const pid = Number(this.payload.pid || 1);
    const isDire = pid >= 6;
    let curX = isDire ? 6400 : -6864;
    let curY = isDire ? 6050 : -6800;
    let targetX = curX;
    let targetY = curY;
    let moveStartT = 0;
    let moveEndT = 0;
    let curFacing = isDire ? -Math.PI * 0.75 : Math.PI * 0.25;
    let baseSpeed = 305;

    let level = 1;
    const skillLevels: Record<string, number> = {};
    for (const s of this.heroSkills) skillLevels[s.code] = 0;
    let attrBonusLevel = 0;

    const inv: (ReplayInventorySlot | null)[] = [null, null, null, null, null, null];
    let goldSpent = 0;
    let kills = 0;
    let deaths = 0;
    let assists = 0;
    let lastHits = 0;
    let denies = 0;
    let neutrals = 0;

    let lastToggleSlot = -1;
    let lastToggleTime = -99999;
    let basicCommand: BasicCommandId = '';

    const pushSnapshot = (timeMs: number) => {
      this.snapshots.push({
        timeMs,
        level,
        skillLevels: { ...skillLevels },
        attrBonusLevel,
        inventory: inv.map((s) => (s ? { ...s } : null)),
        goldSpent,
        kills,
        deaths,
        assists,
        lastHits,
        denies,
        neutrals,
        basicCommand,
      });
    };

    const setBasicCommand = (timeMs: number, cmd: BasicCommandId) => {
      if (basicCommand === cmd) return;
      basicCommand = cmd;
      pushSnapshot(timeMs);
    };

    /** 截断仍覆盖 timeMs 的行走关键帧（停止/新指令时必须切断，否则 isMoving 一直为 true） */
    const cutMoveKeyframesAt = (timeMs: number) => {
      for (const kf of this.moveKeyframes) {
        if (timeMs > kf.t0 && timeMs < kf.t1) {
          const r = (timeMs - kf.t0) / Math.max(1, kf.t1 - kf.t0);
          kf.x1 = kf.x0 + (kf.x1 - kf.x0) * r;
          kf.y1 = kf.y0 + (kf.y1 - kf.y0) * r;
          kf.t1 = timeMs;
        }
      }
    };

    const advanceHeroTo = (t: number) => {
      if (moveEndT > moveStartT && t > moveStartT) {
        const clampedT = Math.min(t, moveEndT);
        const ratio = (clampedT - moveStartT) / Math.max(1, moveEndT - moveStartT);
        const nx = curX + (targetX - curX) * ratio;
        const ny = curY + (targetY - curY) * ratio;
        this.moveKeyframes.push({
          t0: moveStartT,
          t1: clampedT,
          x0: curX,
          y0: curY,
          x1: nx,
          y1: ny,
          facingRad: curFacing,
          anim: 'Walk',
        });
        curX = nx;
        curY = ny;
        moveStartT = clampedT;
        if (clampedT >= moveEndT) {
          moveEndT = 0;
        }
      }
    };

    const checkRecipes = (t: number) => {
      let combined = true;
      while (combined) {
        combined = false;
        for (const recipe of Object.values(this.payload.recipes || {})) {
          if (!recipe.components?.length || !recipe.result) continue;
          const tempSlots: number[] = [];
          const used = new Set<number>();
          let matchAll = true;
          for (const comp of recipe.components) {
            const compDef =
              this.realItems.get(comp) ||
              this.shopToRealItem.get(comp) ||
              this.recipeToRealItem.get(comp);
            const wantReal = compDef?.realCode || comp;
            let foundIdx = -1;
            for (let i = 0; i < 6; i++) {
              if (!used.has(i) && inv[i] && (inv[i]!.code === wantReal || inv[i]!.code === comp)) {
                foundIdx = i;
                break;
              }
            }
            if (foundIdx < 0) {
              matchAll = false;
              break;
            }
            used.add(foundIdx);
            tempSlots.push(foundIdx);
          }
          if (matchAll && tempSlots.length > 1) {
            const keepSlot = tempSlots[0];
            for (const idx of tempSlots) inv[idx] = null;
            const resDef = this.realItems.get(recipe.result);
            const resCode = resDef?.realCode || recipe.result;
            inv[keepSlot] = {
              slot: keepSlot,
              hotkey: INV_HOTKEYS[keepSlot],
              code: resCode,
              name: this.resolveItemName(resCode),
              icon: this.resolveItemIcon(resCode),
              charges: 1,
            };
            this.events.push({
              timeMs: t,
              timeText: formatMsClock(t),
              kind: 'item',
              text: `合成装备：${this.resolveItemName(resCode)}`,
            });
            combined = true;
            break;
          }
        }
      }
    };

    pushSnapshot(0);

    for (const a of this.payload.actions || []) {
      const t = Number(a[0] || 0);
      const id = Number(a[1] || 0);
      const ax = Number(a[2] || 0);
      const ay = Number(a[3] || 0);
      const extra = String(a[5] || '');
      const orderId = Number(a[6] || 0);
      const orderCode = intToFourCC(orderId);

      // 1. 点地/目标点指令 (0x11 / 0x12)：移动、攻击移动、巡逻、smart
      if (id === 0x11 || id === 0x12) {
        const pointCmd = resolveBasicCommand(orderId);
        if (pointCmd) setBasicCommand(t, pointCmd);
        if (Math.abs(ax) > 1 || Math.abs(ay) > 1) {
          advanceHeroTo(t);
          cutMoveKeyframesAt(t);
          const dist = Math.hypot(ax - curX, ay - curY);
          if (dist > 8) {
            curFacing = Math.atan2(ay - curY, ax - curX);
            moveStartT = t;
            moveEndT = t + (dist / Math.max(100, baseSpeed)) * 1000;
            targetX = ax;
            targetY = ay;
          }
        }
        if (pointCmd || Math.abs(ax) > 1 || Math.abs(ay) > 1) continue;
      }

      // 2. 立即指令 (0x10)：停止、选英雄、学技能、释放无目标技能、购买或使用物品
      if (id === 0x10) {
        // Stop / Hold / 少数立即类基本指令
        const immCmd = resolveBasicCommand(orderId);
        if (immCmd) {
          if (immCmd === 'stop' || immCmd === 'hold') {
            advanceHeroTo(t);
            cutMoveKeyframesAt(t);
            moveEndT = 0;
            moveStartT = t;
          }
          setBasicCommand(t, immCmd);
          continue;
        }

        // 使用物品栏槽位 (852008..852013 => slot 0..5)
        if (orderId >= 852008 && orderId <= 852013) {
          lastToggleSlot = orderId - 852008;
          lastToggleTime = t;
          continue;
        }

        // 移动物品栏槽位 (852002..852007 => target slot 0..5)
        if (orderId >= 852002 && orderId <= 852007) {
          const dstSlot = orderId - 852002;
          const srcSlot = inv.findIndex((s, idx) => s !== null && idx !== dstSlot);
          if (srcSlot >= 0 && dstSlot >= 0 && dstSlot < 6) {
            const tmp = inv[dstSlot];
            inv[dstSlot] = inv[srcSlot] ? { ...inv[srcSlot]!, slot: dstSlot, hotkey: INV_HOTKEYS[dstSlot] } : null;
            inv[srcSlot] = tmp ? { ...tmp, slot: srcSlot, hotkey: INV_HOTKEYS[srcSlot] } : null;
            pushSnapshot(t);
          }
          continue;
        }

        if (orderCode) {
          // 选英雄
          if (orderCode === this.payload.heroCode) {
            this.events.push({
              timeMs: t,
              timeText: formatMsClock(t),
              kind: 'hero',
              text: `选择英雄：${this.payload.heroName}`,
            });
            continue;
          }

          // 学习或释放英雄技能
          const skillDef = this.heroSkills.find((s) => s.code === orderCode);
          if (skillDef) {
            const totalSpent =
              Object.values(skillLevels).reduce((s, v) => s + v, 0) + attrBonusLevel;
            if (totalSpent < level && (skillLevels[orderCode] || 0) < skillDef.maxLevel) {
              skillLevels[orderCode] = (skillLevels[orderCode] || 0) + 1;
              this.events.push({
                timeMs: t,
                timeText: formatMsClock(t),
                kind: 'skill',
                text: `学习技能：${skillDef.name} (Lv.${skillLevels[orderCode]})`,
              });
              pushSnapshot(t);
            } else {
              // 释放主动技能（如剑刃风暴）
              advanceHeroTo(t);
              this.moveKeyframes.push({
                t0: t,
                t1: t + 5000,
                x0: curX,
                y0: curY,
                x1: curX,
                y1: curY,
                facingRad: curFacing,
                anim: orderCode === 'A05G' ? 'Attack Walk Stand Spin' : 'Spell',
              });
              this.events.push({
                timeMs: t,
                timeText: formatMsClock(t),
                kind: 'skill',
                text: `施放技能：${skillDef.name}`,
              });
            }
            continue;
          }

          // 学习属性附加
          if (orderCode === 'Aamk' || orderCode === this.payload.heroMeta?.attrCode) {
            const totalSpent =
              Object.values(skillLevels).reduce((s, v) => s + v, 0) + attrBonusLevel;
            if (totalSpent < level && attrBonusLevel < 10) {
              attrBonusLevel++;
              this.events.push({
                timeMs: t,
                timeText: formatMsClock(t),
                kind: 'skill',
                text: `学习技能：属性附加 (Lv.${attrBonusLevel})`,
              });
              pushSnapshot(t);
            }
            continue;
          }

          // 商店购买扣费记录
          const shopItem = this.shopToRealItem.get(orderCode) || this.realItems.get(orderCode);
          if (shopItem && shopItem.cost > 0) {
            goldSpent += shopItem.cost;
            pushSnapshot(t);
          }
        }
      }

      // 3. DotA 游戏状态同步事件 (0x6B)
      if (id === 0x6b && extra) {
        if (extra === 'Data:GameStart=1') {
          this.events.push({
            timeMs: t,
            timeText: formatMsClock(t),
            kind: 'system',
            text: '号角吹响，全军出击！',
          });
          continue;
        }

        const lvMatch = extra.match(/^Data:Level(\d+)=(\d+)$/);
        if (lvMatch && Number(lvMatch[2]) === pid) {
          level = Math.max(level, Number(lvMatch[1]));
          this.events.push({
            timeMs: t,
            timeText: formatMsClock(t),
            kind: 'hero',
            text: `${this.payload.heroName} 升至等级 ${level}`,
          });
          pushSnapshot(t);
          continue;
        }

        const puiMatch = extra.match(/^Data:PUI_(\d+)=(\d+)$/);
        if (puiMatch && Number(puiMatch[1]) === pid) {
          const itemCode = intToFourCC(Number(puiMatch[2]));
          if (itemCode) {
            const itemDef =
              this.realItems.get(itemCode) ||
              this.recipeToRealItem.get(itemCode) ||
              this.shopToRealItem.get(itemCode);
            const realCode = itemDef?.realCode || itemCode;
            const armlet = isArmletFamily(realCode) || isArmletFamily(itemCode);
            const isArmletToggle = armlet && t - lastToggleTime < 800;

            let targetSlot = -1;
            // --- AI 修改开始 [ARMLET-UNIQUE]：臂章开/关是同一件；合成后 PUI 再发一次不得占第二格 ---
            if (armlet) {
              targetSlot = inv.findIndex((s) => !!s && isArmletFamily(s.code));
              if (
                targetSlot < 0 &&
                isArmletToggle &&
                lastToggleSlot >= 0 &&
                lastToggleSlot < 6 &&
                inv[lastToggleSlot] === null
              ) {
                targetSlot = lastToggleSlot;
              }
            }
            // 非堆叠成品若已在栏中（本地 checkRecipes 已合成），后续 PUI 只刷新原格
            if (targetSlot < 0 && itemDef && !itemDef.stackable) {
              targetSlot = inv.findIndex((s) => s?.code === realCode || s?.code === itemCode);
            }
            // --- AI 修改结束 [ARMLET-UNIQUE] ---
            if (targetSlot < 0 && itemDef?.stackable) {
              targetSlot = inv.findIndex((s) => s?.code === realCode);
              if (targetSlot >= 0 && inv[targetSlot]) {
                inv[targetSlot]!.charges += 1;
                pushSnapshot(t);
                continue;
              }
            }
            if (targetSlot < 0) {
              targetSlot = inv.findIndex((s) => s === null);
            }
            if (targetSlot >= 0) {
              const prev = inv[targetSlot];
              const isRefresh =
                !!prev &&
                (prev.code === realCode ||
                  prev.code === itemCode ||
                  (armlet && isArmletFamily(prev.code)));
              inv[targetSlot] = {
                slot: targetSlot,
                hotkey: INV_HOTKEYS[targetSlot],
                code: realCode,
                name: this.resolveItemName(realCode),
                icon: this.resolveItemIcon(realCode),
                charges: 1,
                // I00Q 为高属性开启形态（与下方面板加成一致）
                activeToggle: realCode === 'I00Q',
              };
              if (realCode === 'I020' || realCode === 'I012' || realCode === 'I015') {
                baseSpeed = 355;
              }
              if (!isArmletToggle && !isRefresh) {
                this.events.push({
                  timeMs: t,
                  timeText: formatMsClock(t),
                  kind: 'item',
                  text: `获得物品：${this.resolveItemName(realCode)}`,
                });
              }
              checkRecipes(t);
              pushSnapshot(t);
            }
          }
          continue;
        }

        const driMatch = extra.match(/^Data:DRI_(\d+)=(\d+)$/);
        if (driMatch && Number(driMatch[1]) === pid) {
          const itemCode = intToFourCC(Number(driMatch[2]));
          const itemDef =
            this.realItems.get(itemCode) ||
            this.recipeToRealItem.get(itemCode) ||
            this.shopToRealItem.get(itemCode);
          const realCode = itemDef?.realCode || itemCode;
          let idx = -1;
          // --- AI 修改开始 [ARMLET-UNIQUE]：DRI 任一侧形态都清掉栏内那一件臂章 ---
          if (isArmletFamily(realCode) || isArmletFamily(itemCode)) {
            if (
              lastToggleSlot >= 0 &&
              lastToggleSlot < 6 &&
              inv[lastToggleSlot] &&
              isArmletFamily(inv[lastToggleSlot]!.code)
            ) {
              idx = lastToggleSlot;
            } else {
              idx = inv.findIndex((s) => !!s && isArmletFamily(s.code));
            }
          } else {
            idx = inv.findIndex((s) => s?.code === realCode || s?.code === itemCode);
          }
          // --- AI 修改结束 [ARMLET-UNIQUE] ---
          if (idx >= 0) {
            inv[idx] = null;
            pushSnapshot(t);
          }
          continue;
        }

        const heroKillMatch = extra.match(/^Data:Hero(\d+)=(\d+)$/);
        if (heroKillMatch) {
          const victim = Number(heroKillMatch[1]);
          const killer = Number(heroKillMatch[2]);
          if (killer === pid && victim !== pid) {
            kills++;
            this.events.push({
              timeMs: t,
              timeText: formatMsClock(t),
              kind: 'combat',
              text: `${this.payload.heroName} 击杀敌方英雄！(击杀 ${kills})`,
            });
            pushSnapshot(t);
          } else if (victim === pid) {
            deaths++;
            this.events.push({
              timeMs: t,
              timeText: formatMsClock(t),
              kind: 'combat',
              text: `${this.payload.heroName} 阵亡`,
            });
            pushSnapshot(t);
          }
          continue;
        }

        const cskMatch = extra.match(/^Data:CSK(\d+)=(\d+)$/);
        if (cskMatch && Number(cskMatch[1]) === pid) {
          lastHits = Number(cskMatch[2]);
          pushSnapshot(t);
          continue;
        }
        const csdMatch = extra.match(/^Data:CSD(\d+)=(\d+)$/);
        if (csdMatch && Number(csdMatch[1]) === pid) {
          denies = Number(csdMatch[2]);
          pushSnapshot(t);
          continue;
        }
        const nkMatch = extra.match(/^Data:NK(\d+)=(\d+)$/);
        if (nkMatch && Number(nkMatch[1]) === pid) {
          neutrals = Number(nkMatch[2]);
          pushSnapshot(t);
          continue;
        }
      }
    }

    advanceHeroTo(this.durationMs);
  }

  /** 获取指定毫秒时刻的完整画面与 HUD 状态 */
  sampleAt(timeMs: number): ReplayFrameState {
    const t = Math.max(0, Math.min(this.durationMs, timeMs));

    // 1. 插值计算英雄位置、朝向与动作序列
    const pid = Number(this.payload.pid || 1);
    const isDire = pid >= 6;
    let x = isDire ? 6400 : -6864;
    let y = isDire ? 6050 : -6800;
    let facingRad = isDire ? -Math.PI * 0.75 : Math.PI * 0.25;
    let sequence = 'Stand';
    let isMoving = false;
    const trailPoints: { x: number; y: number }[] = [{ x, y }];

    for (const kf of this.moveKeyframes) {
      if (t >= kf.t1) {
        x = kf.x1;
        y = kf.y1;
        facingRad = kf.facingRad;
        if (
          trailPoints.length === 0 ||
          Math.hypot(x - trailPoints[trailPoints.length - 1].x, y - trailPoints[trailPoints.length - 1].y) > 120
        ) {
          trailPoints.push({ x, y });
        }
      } else if (t >= kf.t0 && t < kf.t1) {
        const r = (t - kf.t0) / Math.max(1, kf.t1 - kf.t0);
        x = kf.x0 + (kf.x1 - kf.x0) * r;
        y = kf.y0 + (kf.y1 - kf.y0) * r;
        facingRad = kf.facingRad;
        sequence = kf.anim;
        isMoving = kf.anim === 'Walk' || kf.anim === 'Attack Walk Stand Spin';
        trailPoints.push({ x, y });
        break;
      } else {
        break;
      }
    }

    // 2. 二分/顺序查找最近的离散状态快照
    let snap = this.snapshots[0];
    for (const s of this.snapshots) {
      if (s.timeMs <= t) snap = s;
      else break;
    }

    const heroCfg = HERO_MODEL_MAP[this.payload.heroCode] || HERO_MODEL_MAP['Nbbc'];
    const lv = snap.level;
    const strBase = Math.round(20 + (lv - 1) * 1.9);
    const agiBase = Math.round(26 + (lv - 1) * 2.85);
    const intBase = Math.round(14 + (lv - 1) * 1.4);

    let strBonus = snap.attrBonusLevel * 2;
    let agiBonus = snap.attrBonusLevel * 2;
    let intBonus = snap.attrBonusLevel * 2;
    let damageBonus = 0;
    let armorBonus = 0;
    let moveSpeed = 305;

    for (const item of snap.inventory) {
      if (!item) continue;
      if (item.code === 'I020' || item.code === 'I012' || item.code === 'I015') moveSpeed = 355;
      if (item.code === 'I00M') {
        damageBonus += 9;
        armorBonus += 5;
      } else if (item.code === 'I00Q') {
        strBonus += 25;
        damageBonus += 40;
        armorBonus += 5;
      } else if (item.name.includes('攻击之爪')) {
        damageBonus += 9;
      } else if (item.name.includes('铁意头盔')) {
        armorBonus += 5;
      } else if (item.name.includes('敏捷便鞋')) {
        agiBonus += 3;
      }
    }

    const maxHp = 150 + (strBase + strBonus) * 19;
    const maxMp = (intBase + intBonus) * 13;
    const primaryStat =
      heroCfg.primary === 'str'
        ? strBase + strBonus
        : heroCfg.primary === 'int'
          ? intBase + intBonus
          : agiBase + agiBonus;
    const damageMin = 24 + primaryStat;
    const damageMax = 28 + primaryStat;
    const armor = Math.round((1 + (agiBase + agiBonus) * 0.14) * 10) / 10;

    // 3. 计算金钱（初始 825 + 出兵后每 0.6 秒 1 金 + 补刀/击杀奖励 - 购买花费）
    const passiveGold =
      this.gameHornMs > 0 && t > this.gameHornMs
        ? Math.floor((t - this.gameHornMs) / 600)
        : Math.floor(t / 1200);
    const farmGold = snap.lastHits * 42 + snap.neutrals * 75 + snap.kills * 250;
    const gold = Math.max(0, 825 + passiveGold + farmGold - snap.goldSpent);

    // 4. 组装 4 技能状态与剩余技能点
    const skills: ReplaySkillSlot[] = this.heroSkills.map((s) => ({
      slot: s.slot,
      code: s.code,
      name: s.name,
      hotkey: s.hotkey || ['Q', 'W', 'E', 'R'][s.slot - 1] || '',
      level: snap.skillLevels[s.code] || 0,
      maxLevel: s.maxLevel || 4,
      icon: `/assets/dota/abilityIcons/${s.code}.png`,
    }));

    const totalLearned =
      skills.reduce((sum, s) => sum + s.level, 0) + snap.attrBonusLevel;
    const unspentSkillPoints = Math.max(0, lv - totalLearned);

    const inventory: ReplayInventorySlot[] = [];
    for (let i = 0; i < 6; i++) {
      inventory.push(
        snap.inventory[i] || {
          slot: i,
          hotkey: INV_HOTKEYS[i],
          code: '',
          name: '空槽位',
          icon: '',
          charges: 0,
        }
      );
    }

    const recentEvents = this.events.filter((e) => e.timeMs <= t).slice(-6);
    const clockRelMs = this.gameHornMs > 0 ? Math.max(0, t - this.gameHornMs) : t;
    const isDaytime = Math.floor(clockRelMs / 240000) % 2 === 0;

    return {
      timeMs: t,
      gameClockText: formatMsClock(t),
      isDaytime,
      heroCode: this.payload.heroCode,
      heroName: this.payload.heroName,
      heroClassTitle: heroCfg.classTitle,
      heroIcon: this.payload.heroIcon,
      heroModelUrl: heroCfg.modelUrl,
      heroAssetBaseUrl: heroCfg.assetBaseUrl,
      x: Math.round(x),
      y: Math.round(y),
      facingRad,
      sequence,
      isMoving,
      // 到达/站立时不再锁死「移动」：仅在真正行走/攻击移动中高亮 move/attack/patrol
      basicCommand: (() => {
        const raw = (snap.basicCommand || '') as BasicCommandId;
        if (!isMoving && (raw === 'move' || raw === 'attack' || raw === 'patrol')) {
          return 'stop';
        }
        if (isMoving && !raw) return 'move';
        return raw;
      })(),
      level: lv,
      // --- AI 修改开始 [XP-BAR-NATIVE]：录像无精确经验值时不再用时间伪造进度（旧公式 t%60000 会导致经验条一直走） ---
      xpPercent: lv >= 25 ? 100 : 0,
      // --- AI 修改结束 [XP-BAR-NATIVE] ---
      unspentSkillPoints,
      hp: maxHp,
      maxHp,
      mp: maxMp,
      maxMp,
      strBase,
      strBonus,
      agiBase,
      agiBonus,
      intBase,
      intBonus,
      damageMin,
      damageMax,
      damageBonus,
      armor,
      armorBonus,
      moveSpeed,
      gold,
      kills: snap.kills,
      deaths: snap.deaths,
      assists: snap.assists,
      lastHits: snap.lastHits,
      denies: snap.denies,
      neutrals: snap.neutrals,
      skills,
      attrBonusLevel: snap.attrBonusLevel,
      inventory,
      recentEvents,
      trailPoints: trailPoints.slice(-30),
    };
  }
}
// --- AI 修改结束 [REPLAY-TIMELINE]：新增 War3Bot 玩家动作流（match_*.dat）完整时间轴与状态还原引擎 ---
