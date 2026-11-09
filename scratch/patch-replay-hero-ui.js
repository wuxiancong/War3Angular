/**
 * Patch replay-3d.component.ts:
 * - import roster
 * - ZH-ordered select
 * - data-driven onSelectHeroPreset
 * - heroPresetLocked instead of long key unions
 */
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/app/pages/replay-3d.component.ts');
let src = fs.readFileSync(file, 'utf8');

if (!src.includes("from '../replay3d/dota-hero-roster'")) {
  src = src.replace(
    "} from '../replay3d/replay-timeline';\n",
    `} from '../replay3d/replay-timeline';
import {
  DOTA_HERO_ROSTER,
  getHeroByKey,
  type DotaHeroRosterEntry,
} from '../replay3d/dota-hero-roster';
`
  );
}

const oldSelect = `          <select
            class="bg-[#111824] border border-amber-400/40 rounded px-2 py-1 text-[11px] text-amber-300 min-w-0 flex-[1_1_10rem] sm:flex-none sm:max-w-[14rem]"
            [value]="currentHeroKey()"
            (change)="onSelectHeroPreset($any($event.target).value)"
            title="切换英雄 3D 体验模型"
          >
            <option value="ursa">熊战士 · 乌尔萨 (Ursa)</option>
            <option value="ogremagi">食人魔魔法师 · 阿戈尔诺 (Ogre Magi)</option>
            <option value="tinker">地精修补匠 · 鲍什 (Tinker)</option>
            <option value="furion">先知 · 芙莉恩 (Nature Prophet)</option>
            <option value="kotl">光之守卫 · 伊扎洛 (KotL)</option>
            <option value="tauren">牛头人酋长 · 卡恩 (TC)</option>
            <option value="treant">树精卫士 · 罗格林 (Treant)</option>
            <option value="silencer">沉默术士 · 诺特罗姆 (Silencer)</option>
            <option value="lina">秀逗魔导士 · 莉娜 (Lina)</option>
            <option value="lonedruid">德鲁伊 · 希拉伯莱恩 (Lone Druid)</option>
            <option value="riki">隐形刺客 · 里克 (Riki)</option>
            <option value="earthshaker">撼地神牛 · 雷格 (Earthshaker)</option>
            <option value="nagasiren">娜迦海妖 · 斯拉克丝 (Naga Siren)</option>
            <option value="sven">流浪剑客 · 斯温 (Sven)</option>
            <option value="crystalmaiden">水晶室女 · 瑞莱 (Crystal Maiden)</option>
            <option value="morphling">变体精灵 (Morphling)</option>
            <option value="enchantress">魅惑魔女 · 艾尤莎 (Enchantress)</option>
            <option value="zeus">众神之王 · 宙斯 (Zeus)</option>
            <option value="pa">幻影刺客 · 茉崔蒂 (PA)</option>
            <option value="blademaster">剑圣 · 尤涅若 (Juggernaut)</option>
            <option value="antimage">敌法师 · 玛吉纳 (AM)</option>
            <option value="sniper">火枪手 · 卡德尔 (Sniper)</option>
            <option value="paladin">全能骑士 (Omni)</option>
            <option value="lich">巫妖 · 诺瓦 (Lich)</option>
          </select>`;

const newSelect = `          <select
            class="bg-[#111824] border border-amber-400/40 rounded px-2 py-1 text-[11px] text-amber-300 min-w-0 flex-[1_1_10rem] sm:flex-none sm:max-w-[16rem]"
            [value]="currentHeroKey()"
            (change)="onSelectHeroPreset($any($event.target).value)"
            title="切换英雄 3D 模型（顺序对齐 war3hook ZH_HERO_NAMES）"
          >
            @for (h of heroRoster; track h.key) {
              <option [value]="h.key">{{ h.index }}. {{ h.nameZh }}</option>
            }
          </select>`;

if (src.includes('@for (h of heroRoster')) {
  console.log('select already patched');
} else {
  const selectRe =
    /<select\r?\n\s*class="bg-\[#111824\] border border-amber-400\/40 rounded px-2 py-1 text-\[11px\] text-amber-300[\s\S]*?title="切换英雄 3D 体验模型"\r?\n\s*>[\s\S]*?<\/select>/;
  if (!selectRe.test(src)) {
    console.error('select block not found for replace');
    process.exit(1);
  }
  src = src.replace(selectRe, newSelect.trim());
}

// currentHeroKey signal
src = src.replace(
  /\/\/ 默认预览先知 MalFurionNoStag\r?\n\s*readonly currentHeroKey = signal<\r?\n\s*'ursa'[\s\S]*?>\('furion'\);/,
  `/** 英雄下拉（ZH_HERO_NAMES 顺序） */
  readonly heroRoster = DOTA_HERO_ROSTER;
  /** 当前选中英雄 key（unit code 小写）；手动选择后锁定不被录像覆盖 */
  readonly currentHeroKey = signal('emns');
  readonly heroPresetLocked = signal(true);`
);

// lonedruid -> n01o in comparisons that remain
src = src.replaceAll("=== 'lonedruid'", "=== 'n01o'");
src = src.replaceAll("!== 'lonedruid'", "!== 'n01o'");

// Replace lock blocks in applyReplayFrame (name + model)
const lockNameOld = `    // 手动预览撼地神牛等预设时，不被录像英雄覆盖模型\/名称
    if (
      this.currentHeroKey() !== 'ursa' &&
      this.currentHeroKey() !== 'ogremagi' &&
      this.currentHeroKey() !== 'tinker' &&
      this.currentHeroKey() !== 'furion' &&
      this.currentHeroKey() !== 'kotl' &&
      this.currentHeroKey() !== 'tauren' &&
      this.currentHeroKey() !== 'treant' &&
      this.currentHeroKey() !== 'silencer' &&
      this.currentHeroKey() !== 'lina' &&
      this.currentHeroKey() !== 'lonedruid' &&
      this.currentHeroKey() !== 'riki' &&
      this.currentHeroKey() !== 'earthshaker' &&
      this.currentHeroKey() !== 'nagasiren' &&
      this.currentHeroKey() !== 'sven' &&
      this.currentHeroKey() !== 'crystalmaiden' &&
      this.currentHeroKey() !== 'morphling' &&
      this.currentHeroKey() !== 'enchantress' &&
      this.currentHeroKey() !== 'zeus'
    ) {
      this.heroNameCn.set(state.heroName);
      this.heroTitle.set(state.heroClassTitle);
      if (state.heroIcon) this.heroIcon.set(state.heroIcon);
    }`;

// after lonedruid replace, keys may already be n01o - use flexible regex
src = src.replace(
  /\/\/ 手动预览撼地神牛等预设时，不被录像英雄覆盖模型\/名称\r?\n\s*if \([\s\S]*?\) \{\r?\n\s*this\.heroNameCn\.set\(state\.heroName\);\r?\n\s*this\.heroTitle\.set\(state\.heroClassTitle\);\r?\n\s*if \(state\.heroIcon\) this\.heroIcon\.set\(state\.heroIcon\);\r?\n\s*\}/,
  `// 手动选中英雄预设时，不被录像英雄覆盖名称/图标
    if (!this.heroPresetLocked()) {
      this.heroNameCn.set(state.heroName);
      this.heroTitle.set(state.heroClassTitle);
      if (state.heroIcon) this.heroIcon.set(state.heroIcon);
    }`
);

src = src.replace(
  /\/\/ 撼地神牛等预设锁定期间跳过录像模型切换\r?\n\s*if \(\r?\n\s*this\.currentHeroKey\(\) !== 'ursa'[\s\S]*?state\.heroModelUrl !== this\.currentHeroModelUrl\r?\n\s*\) \{/,
  `// 手动预设锁定期间跳过录像模型切换
      if (
        !this.heroPresetLocked() &&
        state.heroModelUrl &&
        state.heroModelUrl !== this.currentHeroModelUrl
      ) {`
);

// Replace onSelectHeroPreset entire method
const methodStart = src.indexOf('  onSelectHeroPreset(');
const methodEnd = src.indexOf('\n  onMinimapClick(', methodStart);
if (methodStart < 0 || methodEnd < 0) {
  console.error('cannot locate onSelectHeroPreset bounds', methodStart, methodEnd);
  process.exit(1);
}

const newMethod = `  private readonly legacyHeroKeys: Record<string, string> = {
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

  onSelectHeroPreset(rawKey: string): void {
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
    this.heroAtk.set(\`\${s.attackDmgBase}-\${dmgMax}\`);
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

`;

src = src.slice(0, methodStart) + newMethod + src.slice(methodEnd);

// boot defaults
src = src.replace(
  `        // 启动后 HUD 同步为先知
        this.modelName.set('MalFurionNoStag');
        this.currentHeroKey.set('furion');
        this.heroNameCn.set('芙莉恩');
        this.heroTitle.set('先知 · 远程智力');
        this.heroIcon.set('/assets/wc3/ui/icons/BTNFurion.png');
        this.spiritBearSummoned = false;`,
  `        // 启动后 HUD 同步为先知（ZH 序 20）
        const furion = getHeroByKey('emns');
        if (furion) this.applyHeroRosterEntry(furion, true);
        else {
          this.modelName.set('MalFurionNoStag');
          this.currentHeroKey.set('emns');
          this.heroPresetLocked.set(true);
          this.heroNameCn.set('先知');
          this.heroTitle.set('先知 · 远程智力');
        }
        this.spiritBearSummoned = false;`
);

fs.writeFileSync(file, src);
console.log('patched', file);
console.log('has roster import', src.includes('dota-hero-roster'));
console.log('has heroRoster loop', src.includes('heroRoster'));
console.log('onSelect size', (src.match(/onSelectHeroPreset/g) || []).length);
