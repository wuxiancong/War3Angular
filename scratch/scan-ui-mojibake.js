const fs = require('fs');
const s = fs.readFileSync('src/app/pages/replay-3d.component.ts', 'utf8');
const lines = s.split(/\n/);
const hits = [];
for (let i = 0; i < lines.length; i++) {
  const L = lines[i];
  // Detect UTF-8 Chinese mis-decoded as Latin-1 and re-stored (æ/ç/å clusters)
  // OR leftover FFFD
  if (/\uFFFD/.test(L)) hits.push({ i: i + 1, kind: 'fffd', t: L.trim().slice(0, 140) });
  else if (/[æçåèéä]{2,}.*[æçåèéä]/.test(L) && !/[\u4e00-\u9fff]{2}/.test(L)) {
    hits.push({ i: i + 1, kind: 'latin-moj', t: L.trim().slice(0, 140) });
  }
}
console.log('hits', hits.length);
hits.slice(0, 50).forEach((h) => console.log(h.i, h.kind, JSON.stringify(h.t)));

// Verify key UI bytes are real CJK
for (const word of ['隐藏', '显示', '移动', '暂停', '血条', '地图信息', '金币', '坐标']) {
  const i = s.indexOf(word);
  if (i < 0) console.log('MISSING', word);
  else console.log(word, Buffer.from(s.slice(i, i + word.length), 'utf8').toString('hex'));
}
