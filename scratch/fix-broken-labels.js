const fs = require('fs');
const p = 'src/app/pages/replay-3d.component.ts';
let s = fs.readFileSync(p, 'utf8');

// Fix unclosed jump placeholder label (encoding ate the closing quote)
s = s.replace(
  /\{ value: '', label: '[^']*\? \},/,
  "{ value: '', label: '镜头跳转' },"
);

// Normalize Chinese labels that may be mojibake
const replacements = [
  [/\{ value: 'radiant_shop', label: '[^']*' \}/, "{ value: 'radiant_shop', label: '近卫商店' }"],
  [/\{ value: 'dire_shop', label: '[^']*' \}/, "{ value: 'dire_shop', label: '天灾商店' }"],
  [/\{ value: 'side_top', label: '[^']*' \}/, "{ value: 'side_top', label: '上路边路商店' }"],
  [/\{ value: 'side_bot', label: '[^']*' \}/, "{ value: 'side_bot', label: '下路边路商店' }"],
  [/\{ value: 'secret_radiant', label: '[^']*' \}/, "{ value: 'secret_radiant', label: '近卫神秘商店' }"],
  [/\{ value: 'secret_dire', label: '[^']*' \}/, "{ value: 'secret_dire', label: '天灾神秘商店' }"],
  [/\{ value: 'rune_top', label: '[^']*' \}/, "{ value: 'rune_top', label: '上河神符' }"],
  [/\{ value: 'rune_bot', label: '[^']*' \}/, "{ value: 'rune_bot', label: '下河神符' }"],
  [/\{ value: 'roshan', label: '[^']*' \}/, "{ value: 'roshan', label: '肉山' }"],
  [/\{ value: 'hero', label: '[^']*' \}/, "{ value: 'hero', label: '跟随英雄' }"],
  [/\{ value: 'free', label: '[^']*' \}/, "{ value: 'free', label: '自由镜头' }"],
  [/\{ value: 'map', label: '[^']*' \}/, "{ value: 'map', label: '全图俯视' }"],
];

for (const [re, rep] of replacements) {
  if (re.test(s)) {
    s = s.replace(re, rep);
    console.log('fixed', rep.slice(0, 40));
  } else {
    console.log('skip', String(re).slice(0, 40));
  }
}

fs.writeFileSync(p, s);
console.log('done');
