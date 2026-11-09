const fs = require('fs');
const p = 'src/app/pages/replay-3d.component.ts';
let s = fs.readFileSync(p, 'utf8');
const lines = s.split(/\n/);

// Find likely broken single-quoted TS string literals: odd quote count on a code line
const suspects = [];
for (let i = 0; i < lines.length; i++) {
  const L = lines[i];
  const trimmed = L.trim();
  if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('<!--')) continue;
  // Count unescaped single quotes outside of // comment portion
  const code = L.split('//')[0];
  // skip lines that are mostly HTML attrs with many quotes in template - rough: only class body signals
  const sq = (code.match(/'/g) || []).length;
  if (sq % 2 === 1) {
    suspects.push({ line: i + 1, text: L.trimEnd() });
  }
}
console.log('odd single-quote lines:', suspects.length);
for (const x of suspects.slice(0, 80)) {
  console.log(x.line + ': ' + x.text.slice(0, 160));
}

// Known fix: matchLabel
s = s.replace(
  /readonly matchLabel = signal\('[^']*\?\);/,
  "readonly matchLabel = signal('加载中');"
);

// Fix jump placeholder if still broken
s = s.replace(
  /\{ value: '', label: '[^']*\?\s*\},/,
  "{ value: '', label: '镜头跳转' },"
);

// Fix other signal('...?) patterns common from ellipsis corruption
s = s.replace(
  /signal\('([^']{0,40})\?\);/g,
  (m, inner) => {
    console.log('fixing signal', m.slice(0, 60));
    // if looks like mojibake chinese, replace with placeholder based on context later
    return `signal('${inner}');`;
  }
);

fs.writeFileSync(p, s);

// Re-scan
const s2 = fs.readFileSync(p, 'utf8');
const lines2 = s2.split(/\n/);
const suspects2 = [];
for (let i = 0; i < lines2.length; i++) {
  const L = lines2[i];
  const trimmed = L.trim();
  if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('<!--')) continue;
  // Only check TypeScript-ish lines (outside template roughly)
  if (L.includes('class=') || L.includes('</') || L.includes('{{') || L.includes('@if') || L.includes('@for')) continue;
  const code = L.split('//')[0];
  const sq = (code.match(/'/g) || []).length;
  if (sq % 2 === 1) suspects2.push({ line: i + 1, text: L.trimEnd().slice(0, 160) });
}
console.log('remaining odd quotes (non-template):', suspects2.length);
for (const x of suspects2.slice(0, 40)) console.log(x.line + ': ' + x.text);
