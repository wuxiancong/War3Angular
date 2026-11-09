const fs = require('fs');
const p = 'src/app/pages/replay-3d.component.ts';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  /\/\/ 启动[\s\S]*?HUD 同步为先知[\s\S]*?\n/,
  '// 启动时 HUD 同步为先知（ZH 序 20）\n'
);
// strip any remaining replacement chars
const n = (s.match(/\uFFFD/g) || []).length;
s = s.replace(/\uFFFD/g, '');
fs.writeFileSync(p, s, 'utf8');
const out = fs.readFileSync(p, 'utf8');
console.log({
  removed: n,
  remaining: (out.match(/\uFFFD/g) || []).length,
  line: out.match(/\/\/ 启动[^\n]+/)?.[0],
  cjk: (out.match(/[\u4e00-\u9fff]/g) || []).length,
});
