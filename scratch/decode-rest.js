const fs = require('fs');
const path = 'src/app/pages/replay-3d.component.ts';
let s = fs.readFileSync(path, 'utf8');

function decode(str) {
  try {
    return Buffer.from(str, 'latin1').toString('utf8');
  } catch {
    return str;
  }
}
function score(t) {
  return (
    ((t.match(/[\u4e00-\u9fff]/g) || []).length) -
    ((t.match(/Ã/g) || []).length) * 2 -
    ((t.match(/\uFFFD/g) || []).length) * 5
  );
}
function fix(inner) {
  let cur = inner;
  for (let i = 0; i < 3; i++) {
    if (!/Ã|Â|[\u00C0-\u00FF]{3,}/.test(cur)) break;
    const nx = decode(cur);
    if (score(nx) >= score(cur) && !nx.includes('\u0000')) cur = nx;
    else break;
  }
  return cur;
}

let n = 0;
s = s.replace(/'([^'\\]|\\.)*'/g, (m) => {
  const inner = m.slice(1, -1);
  if (!/Ã|Â/.test(inner) && !/[\u00C0-\u00FF]{4,}/.test(inner)) return m;
  const cur = fix(inner);
  if (cur === inner) return m;
  n++;
  return "'" + cur.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
});

s = s.replace(/"([^"\\]|\\.)*"/g, (m) => {
  const inner = m.slice(1, -1);
  if (inner.startsWith('/') || inner.includes('flex') || inner.includes('px-')) return m;
  if (!/Ã|Â/.test(inner) && !/[\u00C0-\u00FF]{4,}/.test(inner)) return m;
  const cur = fix(inner);
  if (cur === inner) return m;
  n++;
  return '"' + cur.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
});

// HTML text nodes between tags
s = s.replace(/>([^<{}]{2,})</g, (m, text) => {
  if (!/Ã|Â|[\u00C0-\u00FF]{3,}/.test(text)) return m;
  const cur = fix(text);
  if (cur === text) return m;
  n++;
  return '>' + cur + '<';
});

// Clean obsolete CSS selector remnant
s = s.replace(
  /\.replay-toolbar-collapsed-bar > button:hover,\s*/g,
  ''
);

fs.writeFileSync(path, s);
console.log('fixed', n, 'remaining Ã', (s.match(/Ã/g) || []).length, 'FFFD', (s.match(/\uFFFD/g) || []).length);
console.log('toolbar ok', s.includes('隐藏工具栏'), s.includes('显示工具栏'), s.includes('播放倍速'));
