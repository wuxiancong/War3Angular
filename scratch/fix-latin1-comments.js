const fs = require('fs');
const path = 'src/app/pages/replay-3d.component.ts';
let s = fs.readFileSync(path, 'utf8');

function looksLatin1Mojibake(str) {
  // classic: many chars in C1/ latin1 range clustered, few CJK
  const latin = (str.match(/[\u00C0-\u024F]/g) || []).length;
  const cjk = (str.match(/[\u4e00-\u9fff]/g) || []).length;
  return latin >= 4 && cjk === 0 && /æ|ç|å|è|é|ä|ö|Â|Ã/.test(str);
}

function decode(str) {
  try {
    return Buffer.from(str, 'latin1').toString('utf8');
  } catch {
    return str;
  }
}

let n = 0;
// Fix // comments
s = s.replace(/\/\/[^\n]*/g, (m) => {
  if (!looksLatin1Mojibake(m)) return m;
  const d = decode(m);
  if ((d.match(/[\u4e00-\u9fff]/g) || []).length > 0 && !d.includes('\uFFFD')) {
    n++;
    return d;
  }
  return m;
});
// Fix /* */ single-line-ish
s = s.replace(/\/\*[\s\S]*?\*\//g, (m) => {
  if (!looksLatin1Mojibake(m)) return m;
  const d = decode(m);
  if ((d.match(/[\u4e00-\u9fff]/g) || []).length > 0 && (d.match(/\uFFFD/g) || []).length < 2) {
    n++;
    return d;
  }
  return m;
});
// Fix HTML comments
s = s.replace(/<!--[\s\S]*?-->/g, (m) => {
  if (!looksLatin1Mojibake(m)) return m;
  const d = decode(m);
  if ((d.match(/[\u4e00-\u9fff]/g) || []).length > 0 && (d.match(/\uFFFD/g) || []).length < 2) {
    n++;
    return d;
  }
  return m;
});
// Fix quoted strings that are pure latin1 mojibake Chinese
s = s.replace(/'([^'\\]|\\.)*'/g, (m) => {
  const inner = m.slice(1, -1);
  if (!looksLatin1Mojibake(inner)) return m;
  const d = decode(inner);
  if ((d.match(/[\u4e00-\u9fff]/g) || []).length > 0 && !d.includes('\uFFFD')) {
    n++;
    return "'" + d.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  }
  return m;
});
s = s.replace(/"([^"\\]|\\.)*"/g, (m) => {
  const inner = m.slice(1, -1);
  if (inner.startsWith('/') || inner.includes('flex') || inner.includes('px-')) return m;
  if (!looksLatin1Mojibake(inner)) return m;
  const d = decode(inner);
  if ((d.match(/[\u4e00-\u9fff]/g) || []).length > 0 && !d.includes('\uFFFD')) {
    n++;
    return '"' + d.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }
  return m;
});

fs.writeFileSync(path, s, 'utf8');
const out = fs.readFileSync(path, 'utf8');
console.log({
  fixed: n,
  fffd: (out.match(/\uFFFD/g) || []).length,
  cjk: (out.match(/[\u4e00-\u9fff]/g) || []).length,
  sample: out.match(/\/\/ 支持[^\n]+/)?.[0] || out.match(/\/\/ [^\n]*跳转[^\n]+/)?.[0],
});
