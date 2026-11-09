const fs = require('fs');
const path = require('path');
const t = fs.readFileSync(path.join(__dirname, '../src/app/replay3d/dota-heroes-archive.ts'), 'utf8');
const names = [];
let cur = null;
for (const line of t.split(/\n/)) {
  const c = line.match(/^\s*"([A-Za-z0-9]{4})"\s*:\s*\{/);
  if (c) cur = { code: c[1] };
  if (!cur) continue;
  const n = line.match(/"name"\s*:\s*"([^"]+)"/);
  if (n) {
    cur.name = n[1];
    names.push(cur);
    cur = null;
  }
}
const map = Object.fromEntries(names.map((x) => [x.name, x.code]));
const checks = [
  '山丘之王',
  '主宰',
  '半人马酋长',
  '舰队统帅',
  '大魔导师',
  '蛇发女妖',
  '圣洁精灵',
  '食人魔法师',
  '食人魔魔法师',
  '修补匠',
  '地精修补匠',
  '黑暗贤者',
  '黑暗聆者',
  '远古冰魄',
  '远古冰魂',
  '天穹守望者',
  '弧光守卫者',
  '矮人狙击手',
  '矮人火枪手',
  '复仇之魂',
  '守护精灵',
  '月之女祭司',
];
for (const zh of checks) console.log(zh, map[zh] || 'NO');
console.log(
  'Hmbr',
  names.find((x) => x.code === 'Hmbr'),
  'N01I',
  names.find((x) => x.code === 'N01I')
);
// print all names for manual scan of unmatched
fs.writeFileSync(
  path.join(__dirname, 'archive-names.json'),
  JSON.stringify(
    names.map((x) => `${x.code}\t${x.name}`),
    null,
    2
  )
);
console.log('wrote archive-names.json', names.length);
