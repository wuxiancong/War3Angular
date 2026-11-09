/**
 * DotA 英雄名册：顺序对齐 War3Launcher/hooker/war3hook.cpp ZH_HERO_NAMES[1..112]
 * 单位码/模型优先取 dota-heroes-archive，中文名以 ZH 表为准。
 */
import { DOTA_HERO_STATS, type DotaHeroPrimary, type DotaHeroStats } from './dota-heroes-archive';

export interface DotaHeroRosterEntry {
  /** ZH_HERO_NAMES 下标（1..112） */
  index: number;
  /** 下拉/锁定用稳定 key */
  key: string;
  /** 展示用中文名（ZH 表） */
  nameZh: string;
  /** DotA 单位 FourCC */
  code: string;
  primary: DotaHeroPrimary;
  attackType: 'melee' | 'ranged';
  classTitle: string;
  modelUrl: string;
  assetBaseUrl: string;
  iconUrl: string;
  stats: DotaHeroStats;
}

/** war3hook.cpp ZH_HERO_NAMES（含 0 占位） */
export const ZH_HERO_NAMES: readonly string[] = [
  '未知单位',
  '复仇之魂',
  '众神之王',
  '魅惑魔女',
  '变体精灵',
  '水晶室女',
  '流浪剑客',
  '娜迦海妖',
  '撼地神牛',
  '隐形刺客',
  '德鲁伊',
  '秀逗魔导士',
  '剑圣',
  '沉默术士',
  '树精卫士',
  '牛头人酋长',
  '光之守卫',
  '熊战士',
  '食人魔魔法师',
  '地精修补匠',
  '先知',
  '幻影长矛手',
  '山岭巨人',
  '地精工程师',
  '圣骑士',
  '月之骑士',
  '矮人火枪手',
  '巨魔战将',
  '暗影萨满',
  '守护精灵',
  '熊猫酒仙',
  '半人马战行者',
  '赏金猎人',
  '龙骑士',
  '敌法师',
  '卓尔游侠',
  '全能骑士',
  '兽王',
  '双头龙',
  '炼金术士',
  '月之女祭司',
  '风暴之灵',
  '神灵武士',
  '圣堂刺客',
  '仙女龙',
  '发条地精',
  '昆卡',
  '风行者',
  '矮人直升机',
  '干扰者',
  '巨牙海民',
  '凤凰',
  '钢背兽',
  '拉比克',
  '灰烬之灵',
  '军团指挥官',
  '天怒法师',
  '地精撕裂者',
  '大地之灵',
  '神谕者',
  '幻影刺客',
  '美杜莎',
  '暗夜魔王',
  '骷髅王',
  '末日使者',
  '地穴刺客',
  '鱼人守卫',
  '痛苦女王',
  '骷髅射手',
  '虚空假面',
  '蝮蛇',
  '闪电幽魂',
  '噬魂鬼',
  '湮灭法师',
  '潮汐猎人',
  '祸乱之源',
  '死灵法师',
  '胖子',
  '裂魂人',
  '地穴编织者',
  '影魔',
  '沙王',
  '斧王',
  '嗜血狂魔',
  '地狱领主',
  '幽鬼',
  '巫医',
  '黑曜毁灭者',
  '术士',
  '地卜师',
  '暗影牧师',
  '深渊领主',
  '不朽尸王',
  '黑暗聆者',
  '祈求者',
  '谜团',
  '蝙蝠骑士',
  '远古冰魂',
  '鱼人夜行者',
  '灵魂守卫',
  '受折磨的灵魂',
  '暗影恶魔',
  '巫妖',
  '死亡先知',
  '恶魔巫师',
  '剧毒术士',
  '半人猛犸',
  '死灵飞龙',
  '混沌骑士',
  '寒冬飞龙',
  '弧光守卫者',
  '狼人',
  '育母蜘蛛',
];

/** ZH 中文名 → archive 中文名（命名不一致时） */
const ZH_TO_ARCHIVE_NAME: Record<string, string> = {
  众神之王: '奥林匹斯之王',
  剑圣: '主宰',
  矮人火枪手: '矮人狙击手',
  半人马战行者: '半人马酋长',
  昆卡: '舰队统帅',
  拉比克: '大魔导师',
  美杜莎: '蛇发女妖',
};

/** 个别英雄强制用已验证可播的模型路径（覆盖 archive modelFile） */
const MODEL_OVERRIDES: Record<
  string,
  { modelUrl: string; assetBaseUrl: string }
> = {
  Nbbc: {
    modelUrl: '/assets/models/blademaster/HeroBladeMaster.mdxbin',
    assetBaseUrl: '/assets/models/blademaster/',
  },
  Ewar: {
    modelUrl: '/assets/models/warden/HeroWarden.mdxbin',
    assetBaseUrl: '/assets/models/warden/',
  },
  Ewrd: {
    modelUrl: '/assets/models/warden/HeroWarden.mdxbin',
    assetBaseUrl: '/assets/models/warden/',
  },
  Harf: {
    modelUrl: '/assets/wc3/Units/Human/HeroPaladin/HeroPaladin.mdxbin',
    assetBaseUrl: '/assets/wc3/',
  },
  H00U_SNIPER: {
    modelUrl: '/assets/wc3/Units/Human/Rifleman/Rifleman.mdxbin',
    assetBaseUrl: '/assets/wc3/',
  },
  Emns: {
    modelUrl: '/assets/wc3/Units/NightElf/MalFurion/MalFurionNoStag.mdxbin',
    assetBaseUrl: '/assets/wc3/',
  },
  Ntin: {
    modelUrl: '/assets/wc3/Units/Creeps/HeroTinker/HeroTinker.mdxbin',
    assetBaseUrl: '/assets/wc3/',
  },
  Otch: {
    modelUrl: '/assets/wc3/Units/Orc/Tauren/Tauren.mdxbin',
    assetBaseUrl: '/assets/wc3/',
  },
  O015: {
    modelUrl: '/assets/wc3/Units/Orc/HeroTaurenChieftain/HeroTaurenChieftain.mdxbin',
    assetBaseUrl: '/assets/wc3/',
  },
  Huth: {
    modelUrl: '/assets/wc3/Units/Creeps/FurbolgTracker/FurbolgTracker.mdxbin',
    assetBaseUrl: '/assets/wc3/',
  },
  Hmkg: {
    modelUrl: '/assets/wc3/Units/Creeps/OgreMagi/OgreMagi.mdxbin',
    assetBaseUrl: '/assets/wc3/',
  },
  Hblm: {
    modelUrl: '/assets/wc3/Units/Human/HeroArchMage/HeroArchMage.mdxbin',
    assetBaseUrl: '/assets/wc3/',
  },
  Ulic: {
    modelUrl: '/assets/wc3/Units/Undead/HeroLich/HeroLich.mdxbin',
    assetBaseUrl: '/assets/wc3/',
  },
  // DotA 导入模型 IcyGhost 在部分 MPQ 解码下会损坏，回退寒霜巨龙
  N0HP: {
    modelUrl: '/assets/wc3/Units/Undead/FrostWyrm/FrostWyrm.mdxbin',
    assetBaseUrl: '/assets/wc3/',
  },
};

/** ZH 名 → 优先 unit code（当 archive 重名/错绑时） */
const ZH_CODE_FORCE: Record<string, string> = {
  复仇之魂: 'Hvwd',
  众神之王: 'Hmbr',
  魅惑魔女: 'Emoo',
  变体精灵: 'O00P',
  水晶室女: 'Hjai',
  流浪剑客: 'H001',
  娜迦海妖: 'HC49',
  撼地神牛: 'Otch',
  隐形刺客: 'HC92',
  德鲁伊: 'N01O',
  秀逗魔导士: 'H004',
  剑圣: 'Nbbc',
  沉默术士: 'N01A',
  树精卫士: 'Hamg',
  牛头人酋长: 'O015',
  光之守卫: 'Hblm',
  熊战士: 'Huth',
  食人魔魔法师: 'Hmkg',
  地精修补匠: 'Ntin',
  先知: 'Emns',
  幻影刺客: 'Ewar',
  全能骑士: 'Harf',
  敌法师: 'Edem',
  矮人火枪手: 'Usyl',
  巫妖: 'Ulic',
};

function primaryLabel(p: DotaHeroPrimary): string {
  return p === 'str' ? '力量' : p === 'agi' ? '敏捷' : '智力';
}

function normalizeModelRel(modelFile: string): string {
  let rel = modelFile.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '');
  if (!rel.includes('/')) {
    rel = `Units/Creeps/${rel}/${rel}`;
  }
  // 本地资源多用 Units/ 大写前缀；_V1 若无文件则由调用方再回退
  rel = rel.replace(/^units\//i, 'Units/');
  return rel;
}

function modelUrlsFromStats(code: string, stats: DotaHeroStats): { modelUrl: string; assetBaseUrl: string } {
  const ov = MODEL_OVERRIDES[code];
  if (ov) return ov;
  const rel = normalizeModelRel(stats.modelFile);
  return {
    modelUrl: `/assets/wc3/${rel}.mdxbin`,
    assetBaseUrl: '/assets/wc3/',
  };
}

function findStatsByZh(zh: string): { code: string; stats: DotaHeroStats } | null {
  const forced = ZH_CODE_FORCE[zh];
  if (forced && DOTA_HERO_STATS[forced]) {
    return { code: forced, stats: DOTA_HERO_STATS[forced] };
  }
  const archiveName = ZH_TO_ARCHIVE_NAME[zh] || zh;
  for (const [code, stats] of Object.entries(DOTA_HERO_STATS)) {
    if (stats.name === archiveName || stats.name === zh) {
      return { code, stats };
    }
  }
  // 模糊：包含关系
  for (const [code, stats] of Object.entries(DOTA_HERO_STATS)) {
    if (stats.name.includes(zh) || zh.includes(stats.name)) {
      return { code, stats };
    }
  }
  return null;
}

function buildRoster(): DotaHeroRosterEntry[] {
  const list: DotaHeroRosterEntry[] = [];
  for (let index = 1; index < ZH_HERO_NAMES.length; index++) {
    const nameZh = ZH_HERO_NAMES[index];
    const hit = findStatsByZh(nameZh);
    if (!hit) {
      console.warn('[dota-hero-roster] unmatched', index, nameZh);
      continue;
    }
    const { code, stats } = hit;
    const { modelUrl, assetBaseUrl } = modelUrlsFromStats(code, stats);
    const key = code.toLowerCase();
    list.push({
      index,
      key,
      nameZh,
      code,
      primary: stats.primary,
      attackType: stats.attackType,
      classTitle: `${nameZh} · ${stats.attackType === 'ranged' ? '远程' : '近战'}${primaryLabel(stats.primary)}`,
      modelUrl,
      assetBaseUrl,
      iconUrl: `/assets/dota/heroIcons/${code}.png`,
      stats,
    });
  }
  return list;
}

/** 按 ZH_HERO_NAMES 顺序的完整英雄列表（跳过未能匹配档案的项） */
export const DOTA_HERO_ROSTER: readonly DotaHeroRosterEntry[] = buildRoster();

const BY_KEY = new Map(DOTA_HERO_ROSTER.map((h) => [h.key, h]));
const BY_CODE = new Map(DOTA_HERO_ROSTER.map((h) => [h.code, h]));
const BY_INDEX = new Map(DOTA_HERO_ROSTER.map((h) => [h.index, h]));

export function getHeroByKey(key: string): DotaHeroRosterEntry | undefined {
  return BY_KEY.get(key) || BY_CODE.get(key);
}

export function getHeroByIndex(index: number): DotaHeroRosterEntry | undefined {
  return BY_INDEX.get(index);
}

export function getHeroByCode(code: string): DotaHeroRosterEntry | undefined {
  return BY_CODE.get(code) || BY_KEY.get(code.toLowerCase());
}
