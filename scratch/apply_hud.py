# 把原生控制台 HUD 片段拼进 play-3d.component.ts（一次性脚本）
import io

P = 'src/app/pages/play-3d.component.ts'
s = io.open(P, encoding='utf8').read().replace('\r\n', '\n')
html = io.open('scratch/hud.html', encoding='utf8').read()
css = io.open('scratch/hud.css', encoding='utf8').read()
NL = chr(10)
BS = chr(92)


def rep(a, b, count=1):
    global s
    if a not in s:
        raise SystemExit('missing anchor: ' + a[:70])
    s = s.replace(a, b, count)


# ---------- html 片段微调 ----------
html = html.replace('style="left: 0; top: 34.5%"', 'style="top: 21.9%"').replace('style="left: 0; top: 60%"', 'style="top: 43.2%"')
html = html.replace(
    '            <div class="w3-console" [style.background-image]="skin(\'console.png\')"></div>',
    '            <div class="w3-hit"></div><div class="w3-hit l"></div><div class="w3-hit r"></div>\n'
    '            <div class="w3-console" [style.background-image]="skin(\'console.png\')"></div>',
)
html = html.replace(
    '<div class="w3-abs w3-hp" [style]="L.hpText">{{ h.sel.hp }} / {{ h.sel.maxHp }}</div>',
    '@if (h.sel.maxHp > 0) { <div class="w3-abs w3-hp" [style]="L.hpText" [style.color]="h.sel.hpColor">{{ h.sel.hp }} / {{ h.sel.maxHp }}</div> }',
)
html = html.replace('@if (!portrait3d()) { <img [src]="h.sel.icon" alt="" /> }', '@if (!portrait3d() && h.sel.icon) { <img [src]="h.sel.icon" alt="" /> }')
html = html.replace('(click)="view && toggleHpBars()"', '(click)="toggleHpBars()"')
css = css.replace(
    '.w3-icon-row img, .w3-hero-attr img { width: calc(var(--u) * 32 * 1.3333 * 100cqw / 100cqh * 0.75); flex: none; }',
    '.w3-icon-row img, .w3-hero-attr img { width: 4cqw; height: 5.3333cqh; flex: none; }',
)

# ---------- 模板替换 ----------
a = s.index("        @if (phase() === 'playing' && hud(); as h) {")
b = s.index("      @if (tip(); as t) {")
tail_start = s.index('      </div>\n\n      @if (tip(); as t) {')
s = s[:a] + html.rstrip('\n') + '\n' + s[tail_start:]
# 删除旧的浮动提示块
a = s.rindex("      @if (tip(); as t) {")
b = s.index("    </div>\n  `,\n})", a)
s = s[:a] + s[b:]

# ---------- 样式追加 ----------
rep("      .scroll-thin { scrollbar-width: thin; scrollbar-color: #5a4a1c transparent; }\n", "      .scroll-thin { scrollbar-width: thin; scrollbar-color: #5a4a1c transparent; }\n" + css)

# ---------- 类型 ----------
rep("""interface ItemHud {
  code: string;""", """interface ItemHud {
  cdPct: number;
  sellGold: number;
  code: string;""")
rep("""  target: { name: string;""", """  clockMin: number;
  clockSec: number;
  /** 时间指示器天空盘的 background-position-x（%） */
  skyPos: number;
  /** [击杀, 死亡, 助攻, 正补, 反补] */
  stats: number[];
  sel: SelInfo;
  target: { name: string;""")
rep("""type Targeting =""", """/** 信息面板当前显示的对象（自己的英雄 / 选中的其它单位 / 商店） */
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

type Targeting =""")

# ---------- 组件字段 ----------
rep("""  readonly tip = signal<{ title: string; body: string; x: number; y: number; tx: string; ty: string } | null>(null);""",
    """  readonly tip = signal<{ title: string; body: string; gold: number; mana: number; goldLabel: string } | null>(null);
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
  }""")

# ---------- 提示框 / 菜单 / 小地图按钮 方法 ----------
a = s.index("  // ============================================================ 提示框")
b = s.rindex("}")
s = s[:a] + """  // ============================================================ 原生提示框 / 菜单 / 小地图按钮
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
        cells[i] = { ...base, icon: `/assets/dota/itemIcons/${code}.png`, title: `购买 ${it.name}`, body: it.desc + (reason ? NL + NL + '|' + reason : ''), gold: it.cost, dim: !!reason, click: () => this.buy(code) };
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
"""

# ---------- import ----------
rep("import { GameView, PLAYER_COLORS } from '../game/game-view';", "import { GameView, PLAYER_COLORS } from '../game/game-view';\nimport { getHeroByCode } from '../replay3d/dota-hero-roster';\n\nconst NL = String.fromCharCode(10);")

# ---------- 错误消息改走 err() ----------
import re
s2, n = re.subn(r"this\.pushMsg\(([^;]*?), '#fca5a5'\);", r"this.err(\1);", s)
s = s2
print('err() 替换', n)

# ---------- pushMsg 记录日志 ----------
rep("""    const list = [...this.messages(), { id: ++this.msgSeq, text, color, t: performance.now() }];""",
    """    this.log.push(text);
    if (this.log.length > 200) this.log.shift();
    const list = [...this.messages(), { id: ++this.msgSeq, text, color, t: performance.now() }];""")

# ---------- 开局：肖像画布 ----------
rep("""      this.view.selectedId = me?.id || 0;""", """      this.view.selectedId = me?.id || 0;
      this.selShop = null;
      this.portraitFor = '';
      this.log = [];
      const pc = this.portraitCanvas()?.nativeElement;
      if (pc) void mdx.attachPortraitCanvas(pc);""")
rep("""      this.pushMsg(`欢迎来到 DotA 6.83d 网页对战！${setup.prepSec} 秒后出兵，按「帮助」查看操作。`, '#fde68a');""",
    """      this.pushMsg(`欢迎来到 DotA 6.83d 网页对战！${setup.prepSec} 秒后出兵，按 F9 查看操作说明。`, '#fed312');""")

# ---------- updateHud ----------
rep("""        usable: !!def && def.kind !== 'normal' && def.kind !== 'recipe',""", """        usable: !!def && def.kind !== 'normal' && def.kind !== 'recipe',
        cdPct: it.cdUntil > engine.tick ? Math.min(100, (((it.cdUntil - engine.tick) * 0.05) / Math.max(1, def?.active?.cool || 1)) * 100) : 0,
        sellGold: Math.floor((def?.cost || 0) / 2),""")
rep("""    const session = this.session;
    this.hud.set({
      clock,""", """    const session = this.session;
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
      clock,""")

# ---------- 输入：左键选商店 ----------
rep("""    view.selectedId = unit ? unit.id : me.id;
  }""", """    const shop = !unit && ground ? this.shopAt(ground.x, ground.y) : null;
    this.selShop = shop;
    this.learnMode.set(false);
    view.selectedId = unit ? unit.id : shop ? 0 : me.id;
    if (unit) this.mdx?.playPortraitTalk();
    this.updateHud();
  }""")

# ---------- 状态变化后立刻刷新命令卡 ----------
rep("""  private cancelTargeting(): void {
    this.targeting.set(null);
    if (this.view) this.view.targeting = null;
  }""", """  private cancelTargeting(): void {
    this.targeting.set(null);
    if (this.view) this.view.targeting = null;
    this.updateHud();
  }""")
rep("""      this.learnMode.set(false);
      return;
    }
    this.learnMode.set(!this.learnMode());
  }""", """      this.learnMode.set(false);
      return;
    }
    this.selShop = null;
    this.learnMode.set(!this.learnMode());
    this.updateHud();
  }""")

# ---------- 键盘 ----------
rep("""    if (key === 'Escape') {
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
    }""", """    if (key === 'Escape') {
      this.escape();
      return;
    }
    const fk: Record<string, MenuId> = { F9: 'quests', F10: 'menu', F11: 'allies', F12: 'log' };
    if (fk[key]) {
      e.preventDefault();
      this.toggleMenu(fk[key]);
      return;
    }""")

# ---------- 小地图：开关 / 信号 ----------
rep("""    if (this.minimapImg?.complete && this.minimapImg.naturalWidth) ctx.drawImage(this.minimapImg, 0, 0, S, S);""",
    """    if (this.mmTerrain() && this.minimapImg?.complete && this.minimapImg.naturalWidth) ctx.drawImage(this.minimapImg, 0, 0, S, S);""")
rep("""      if (!u.alive || u.hero) continue;
      const { px, py } = P(u.x, u.y);""", """      if (!u.alive || u.hero) continue;
      if (u.kind === 'neutral' && !this.mmCreeps()) continue;
      const { px, py } = P(u.x, u.y);""")
rep("""      ctx.fillStyle = PLAYER_COLORS[u.hero.slot];
      ctx.fill();""", """      // 盟友颜色开关：关=玩家颜色，开=敌我颜色（己方青绿 / 敌方红）
      ctx.fillStyle = this.mmAlly() ? (u.hero.slot === this.mySlot ? '#ffffff' : u.team === myTeam ? '#00e0c0' : '#ff2020') : PLAYER_COLORS[u.hero.slot];
      ctx.fill();""")
rep("""      ctx.strokeRect(px - 14, py - 9, 28, 18);
    }""", """      ctx.strokeRect(px - 18, py - 11, 36, 22);
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
    }""")
rep("""    if (e.button === 2) {
      this.send({ t: 'move', x: Math.round(w.x), y: Math.round(w.y) });
      return;
    }
    const tg = this.targeting();""", """    if (e.button === 2) {
      this.send({ t: 'move', x: Math.round(w.x), y: Math.round(w.y) });
      return;
    }
    if (this.pingMode()) {
      this.pings.push({ x: w.x, y: w.y, t: performance.now() });
      this.pingMode.set(false);
      return;
    }
    const tg = this.targeting();""")

io.open(P, 'w', encoding='utf8', newline='').write(s)
print('ok', len(s))
