const fs = require('fs');
const p = 'src/app/pages/replay-3d.component.ts';
let s = fs.readFileSync(p, 'utf8');
const lines = s.split(/\n/);

// Find lines with odd double-quote counts in template-ish content
const odd = [];
for (let i = 0; i < lines.length; i++) {
  const L = lines[i];
  if (!L.includes('<') && !L.includes('alt=') && !L.includes('title=')) continue;
  // ignore lines that are clearly TS
  const dq = (L.match(/"/g) || []).length;
  if (dq % 2 === 1) odd.push({ line: i + 1, text: L.trimEnd().slice(0, 200) });
}
console.log('odd double-quote lines:', odd.length);
odd.forEach((x) => console.log(x.line + ': ' + x.text));

// Common fix: alt/title ending with ? without closing quote before next attr or >
// Pattern: alt="....?  or title="....? followed by space+attr or >
s = s.replace(/\b(alt|title)="([^"]*?)\?(?=\s+[a-zA-Z_\[:]|\s*\/?>)/g, (m, attr, val) => {
  console.log('fix attr', attr, val.slice(-20));
  return `${attr}="${val}"`;
});

// Also: alt="....?\r at end of line without close
s = s.replace(/\b(alt|title)="([^"\n]*?)\?\s*$/gm, (m, attr, val) => {
  console.log('fix eol attr', attr);
  return `${attr}="${val}"`;
});

fs.writeFileSync(p, s);

const lines2 = s.split(/\n/);
const odd2 = [];
for (let i = 0; i < lines2.length; i++) {
  const L = lines2[i];
  if (!L.includes('alt=') && !L.includes('title=') && !L.includes('<img') && !L.includes('<button')) continue;
  const dq = (L.match(/"/g) || []).length;
  if (dq % 2 === 1) odd2.push({ line: i + 1, text: L.trimEnd().slice(0, 220) });
}
console.log('remaining odd:', odd2.length);
odd2.slice(0, 40).forEach((x) => console.log(x.line + ': ' + x.text));
