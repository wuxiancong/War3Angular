const fs = require('fs');
const p = 'src/app/pages/replay-3d.component.ts';
let s = fs.readFileSync(p, 'utf8');

// Restore specific known broken spots
s = s.replace(
  /<div class="flex items-center justify-between text-\[11px\] text-amber-200\/85 pt-1">\s*<<\/span>/,
  `<div class="flex items-center justify-between text-[11px] text-amber-200/85 pt-1">
                      <span>共享视野：已开启</span>`
);

s = s.replace(
  /<div class="text-\[10px\] text-amber-200\/75"><\/div>/,
  `<div class="text-[10px] text-amber-200/75">攻击</div>`
);
s = s.replace(
  /<div class="text-\[10px\] text-amber-200\/75"<\/div>/,
  `<div class="text-[10px] text-amber-200/75">攻击</div>`
);

// Fix corrupted closing tags: ?/tag>  or  ?</tag>  → </tag>
// Also bare ?/b> style without <
s = s.replace(/\?<\/([a-zA-Z0-9]+)>/g, '</$1>');
s = s.replace(/\?\/([a-zA-Z0-9]+)>/g, '</$1>');

// Fix accidental empty open: <<span> already handled; also <</div>
s = s.replace(/<<(\/?)([a-zA-Z0-9]+)>/g, '<$1$2>');

// Fix quests blurb paragraph (truncated) to a clean short version
s = s.replace(
  /<div class="font-bold text-amber-300">DotA Allstars v6\.83d[^<]*<\/div>\s*<p class="text-amber-100\/85 mt-0\.5">[\s\S]*?<\/p>/,
  `<div class="font-bold text-amber-300">DotA Allstars v6.83d（地形与物品原版还原）</div>
                      <p class="text-amber-100/85 mt-0.5">近卫军团（左下翠绿森林）迎战天灾军团（右上荒芜之地），摧毁敌方遗迹（世界之树 / 冰封王座）即获胜。</p>`
);

// Fix the three quest list items to clean Chinese
s = s.replace(
  /<ul class="list-disc list-inside space-y-1 text-\[11px\] text-amber-100\/90">[\s\S]*?<\/ul>/,
  `<ul class="list-disc list-inside space-y-1 text-[11px] text-amber-100/90">
                      <li><b>自动出兵</b>：每 30 秒三路兵营刷新近战/远程小兵（每第 7 波附带攻城车），沿各路推进并与敌军和防御塔交战。</li>
                      <li><b>防御塔防线</b>：各路防御塔主动攻击 700 码内敌方小兵与英雄，小兵遇塔停步攻塔并自动绕行防穿模。</li>
                      <li><b>野怪与神符</b>：12 处野怪营地每整分钟刷新；上下河道神符点每 2 分钟刷新赏金/强化神符。</li>
                    </ul>`
);

// Fix play/pause button labels
s = s.replace(
  /\{\{\s*isPlaying\(\)\s*\?\s*'[^']*'\s*:\s*'[^']*'\s*\}\}/,
  `{{ isPlaying() ? '暂停录像播放' : '继续录像播放' }}`
);

fs.writeFileSync(p, s);

// Audit remaining broken patterns
const bad = [];
const lines = s.split(/\n/);
for (let i = 0; i < lines.length; i++) {
  const L = lines[i];
  if (/\?\/[a-zA-Z]+>/.test(L) || /<<\/[a-zA-Z]+>/.test(L) || /class="[^"]*"<\/[a-zA-Z]+>/.test(L)) {
    bad.push((i + 1) + ': ' + L.trim().slice(0, 160));
  }
}
console.log('remaining bad patterns', bad.length);
bad.forEach((x) => console.log(x));
console.log('1071 area ok?', s.includes('共享视野：已开启'));
