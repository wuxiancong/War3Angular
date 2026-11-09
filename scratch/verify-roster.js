const fs = require('fs');
const path = require('path');

// Minimal parse of roster build without TS import
const archive = fs.readFileSync(path.join(__dirname, '../src/app/replay3d/dota-heroes-archive.ts'), 'utf8');
const rosterSrc = fs.readFileSync(path.join(__dirname, '../src/app/replay3d/dota-hero-roster.ts'), 'utf8');
const zhMatch = rosterSrc.match(/export const ZH_HERO_NAMES[\s\S]*?\]/);
const zh = [...zhMatch[0].matchAll(/'([^']+)'/g)].map((m) => m[1]);
console.log('zh count', zh.length - 1);

const entries = [];
let cur = null;
for (const line of archive.split(/\n/)) {
  const c = line.match(/^\s*"([A-Za-z0-9]{4})"\s*:\s*\{/);
  if (c) cur = { code: c[1] };
  if (!cur) continue;
  const n = line.match(/"name"\s*:\s*"([^"]+)"/);
  if (n) cur.name = n[1];
  const mf = line.match(/"modelFile"\s*:\s*"([^"]+)"/);
  if (mf) {
    cur.modelFile = mf[1].replace(/\\/g, '/').replace(/\/+/g, '/');
    entries.push(cur);
    cur = null;
  }
}
const byName = new Map(entries.map((e) => [e.name, e]));
const ALIAS = {
  众神之王: '奥林匹斯之王',
  剑圣: '主宰',
  矮人火枪手: '矮人狙击手',
  半人马战行者: '半人马酋长',
  昆卡: '舰队统帅',
  拉比克: '大魔导师',
  美杜莎: '蛇发女妖',
};
const FORCE = {
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
const byCode = new Map(entries.map((e) => [e.code, e]));
const ordered = [];
const miss = [];
for (let i = 1; i < zh.length; i++) {
  const name = zh[i];
  let hit = FORCE[name] ? byCode.get(FORCE[name]) : null;
  if (!hit) hit = byName.get(ALIAS[name] || name) || byName.get(name);
  if (!hit) {
    miss.push(i + ':' + name);
    continue;
  }
  ordered.push({ i, name, code: hit.code, model: hit.modelFile });
}
console.log('matched', ordered.length, 'miss', miss);
console.log('first5', ordered.slice(0, 5));
console.log('12剑圣', ordered.find((x) => x.i === 12));
console.log('20先知', ordered.find((x) => x.i === 20));

// check model files exist
const wc3 = path.join(__dirname, '../public/assets/wc3');
function exists(rel) {
  const n = rel.replace(/^units\//i, 'Units/');
  const cands = [n + '.mdxbin', n + '.mdx', rel + '.mdxbin'];
  for (const c of cands) if (fs.existsSync(path.join(wc3, c))) return true;
  // basename search light
  const base = path.basename(rel).toLowerCase();
  const walk = (dir) => {
    for (const k of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, k.name);
      if (k.isDirectory()) {
        if (walk(full)) return true;
      } else if (k.name.toLowerCase().startsWith(base) && /\.mdxbin$/i.test(k.name)) return true;
    }
    return false;
  };
  return walk(wc3);
}
const noFile = ordered.filter((o) => !exists(o.model));
console.log('noFile', noFile.length);
console.log(noFile.slice(0, 20));
