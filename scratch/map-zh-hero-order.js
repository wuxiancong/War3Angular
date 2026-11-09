const fs = require('fs');
const path = require('path');

const ZH = [
  '未知单位',
  '复仇之魂', '众神之王', '魅惑魔女', '变体精灵', '水晶室女', '流浪剑客', '娜迦海妖', '撼地神牛', '隐形刺客', '德鲁伊',
  '秀逗魔导士', '剑圣', '沉默术士', '树精卫士', '牛头人酋长', '光之守卫', '熊战士', '食人魔魔法师', '地精修补匠', '先知',
  '幻影长矛手', '山岭巨人', '地精工程师', '圣骑士', '月之骑士', '矮人火枪手', '巨魔战将', '暗影萨满', '守护精灵', '熊猫酒仙',
  '半人马战行者', '赏金猎人', '龙骑士', '敌法师', '卓尔游侠', '全能骑士', '兽王', '双头龙', '炼金术士', '月之女祭司',
  '风暴之灵', '神灵武士', '圣堂刺客', '仙女龙', '发条地精', '昆卡', '风行者', '矮人直升机', '干扰者', '巨牙海民',
  '凤凰', '钢背兽', '拉比克', '灰烬之灵', '军团指挥官', '天怒法师', '地精撕裂者', '大地之灵', '神谕者', '幻影刺客',
  '美杜莎', '暗夜魔王', '骷髅王', '末日使者', '地穴刺客', '鱼人守卫', '痛苦女王', '骷髅射手', '虚空假面', '蝮蛇',
  '闪电幽魂', '噬魂鬼', '湮灭法师', '潮汐猎人', '祸乱之源', '死灵法师', '胖子', '裂魂人', '地穴编织者', '影魔',
  '沙王', '斧王', '嗜血狂魔', '地狱领主', '幽鬼', '巫医', '黑曜毁灭者', '术士', '地卜师', '暗影牧师',
  '深渊领主', '不朽尸王', '黑暗聆者', '祈求者', '谜团', '蝙蝠骑士', '远古冰魂', '鱼人夜行者', '灵魂守卫', '受折磨的灵魂',
  '暗影恶魔', '巫妖', '死亡先知', '恶魔巫师', '剧毒术士', '半人猛犸', '死灵飞龙', '混沌骑士', '寒冬飞龙', '弧光守卫者',
  '狼人', '育母蜘蛛',
];

const archive = fs.readFileSync(path.join(__dirname, '../src/app/replay3d/dota-heroes-archive.ts'), 'utf8');
const byName = new Map();
const re = /"([A-Za-z0-9]{4})"\s*:\s*\{[\s\S]*?"name"\s*:\s*"([^"]+)"[\s\S]*?"modelFile"\s*:\s*"([^"]+)"[\s\S]*?"primary"\s*:\s*"([^"]+)"/g;
// primary appears before modelFile in file — re-parse properly
const blockRe = /"([A-Za-z0-9]{4})"\s*:\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g;
// simpler line-based
const entries = [];
let cur = null;
for (const line of archive.split(/\n/)) {
  const c = line.match(/^\s*"([A-Za-z0-9]{4})"\s*:\s*\{/);
  if (c) cur = { code: c[1] };
  if (!cur) continue;
  const n = line.match(/"name"\s*:\s*"([^"]+)"/);
  if (n) cur.name = n[1];
  const p = line.match(/"primary"\s*:\s*"([^"]+)"/);
  if (p) cur.primary = p[1];
  const a = line.match(/"attackType"\s*:\s*"([^"]+)"/);
  if (a) cur.attackType = a[1];
  const mf = line.match(/"modelFile"\s*:\s*"([^"]+)"/);
  if (mf) {
    cur.modelFile = mf[1].replace(/\\/g, '/');
    entries.push(cur);
    byName.set(cur.name, cur);
    cur = null;
  }
}

// alias map for ZH_HERO_NAMES vs archive naming differences
const ALIAS = {
  '矮人火枪手': '矮人狙击手',
  '守护精灵': '圣洁精灵', // guess - check
  '昆卡': '海军上将',
  '地精撕裂者': '地精撕裂者',
  '黑暗聆者': '黑暗贤者',
  '受折磨的灵魂': '受折磨的灵魂',
  '弧光守卫者': '天穹守望者',
  '山岭巨人': '山岭巨人',
  '地精工程师': '地精工程师',
  '圣骑士': '圣骑士',
  '月之骑士': '月之骑士',
  '幻影长矛手': '幻影长矛手',
};

const dota = JSON.parse(fs.readFileSync('D:/Qt/workspace/War3Bot/images/dota_data.json', 'utf8'));
const heroes = dota.heroes || {};
const byDotaName = new Map();
for (const [code, h] of Object.entries(heroes)) {
  if (h && h.name) byDotaName.set(h.name, { code, ...h });
}

console.log('archive', entries.length, 'dota_data heroes', Object.keys(heroes).length);

const ordered = [];
for (let i = 1; i < ZH.length; i++) {
  const zh = ZH[i];
  let hit = byName.get(zh) || byName.get(ALIAS[zh]) || byDotaName.get(zh) || byDotaName.get(ALIAS[zh]);
  // fuzzy: archive name contains or equals
  if (!hit) {
    hit = entries.find((e) => e.name === zh || e.name.includes(zh) || zh.includes(e.name));
  }
  if (!hit) {
    // dota_data search
    for (const [name, h] of byDotaName) {
      if (name === zh || name.includes(zh) || zh.includes(name)) {
        hit = h;
        break;
      }
    }
  }
  ordered.push({
    index: i,
    zh,
    code: hit?.code || null,
    archiveName: hit?.name || null,
    modelFile: hit?.modelFile || hit?.model || null,
  });
}

const unmatched = ordered.filter((o) => !o.code);
console.log('matched', ordered.length - unmatched.length, 'unmatched', unmatched.length);
for (const u of unmatched) console.log('NOMAP', u.index, u.zh);
fs.writeFileSync(path.join(__dirname, 'hero-order.json'), JSON.stringify(ordered, null, 2));
console.log('wrote scratch/hero-order.json');
