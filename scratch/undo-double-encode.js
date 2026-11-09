const fs = require('fs');
const path = 'src/app/pages/replay-3d.component.ts';
let s = fs.readFileSync(path, 'utf8');

function score(t) {
  return (
    ((t.match(/[\u4e00-\u9fff]/g) || []).length) * 5 -
    ((t.match(/Ã/g) || []).length) -
    ((t.match(/\uFFFD/g) || []).length) * 8
  );
}

function decodeWhole(str) {
  return Buffer.from(str, 'latin1').toString('utf8');
}

let best = s;
let bestScore = score(s);
console.log('start', { score: bestScore, cjk: (s.match(/[\u4e00-\u9fff]/g) || []).length, moj: (s.match(/Ã/g) || []).length });

let cur = s;
for (let i = 0; i < 4; i++) {
  const next = decodeWhole(cur);
  const sc = score(next);
  console.log('pass', i + 1, { score: sc, cjk: (next.match(/[\u4e00-\u9fff]/g) || []).length, moj: (next.match(/Ã/g) || []).length, fffd: (next.match(/\uFFFD/g) || []).length });
  if (sc > bestScore && (next.match(/\uFFFD/g) || []).length < 200) {
    best = next;
    bestScore = sc;
    cur = next;
  } else {
    break;
  }
}

fs.writeFileSync(path, best, 'utf8');
console.log('final includes', {
  hide: best.includes('隐藏工具栏'),
  show: best.includes('显示工具栏'),
  play: best.includes('播放'),
  blood: best.includes('血条'),
});
