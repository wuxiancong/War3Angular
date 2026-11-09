const fs = require('fs');
const p = 'src/app/pages/replay-3d.component.ts';
let s = fs.readFileSync(p, 'utf8');

const pairs = [
  // broken closing tags where ? ate <
  ['Ã¥Â·Â²Ã¥Â¼ÂÃ¥Â?/span>', '已开启</span>'],
  ['Ã¥Â·Â²Ã¥Â¼ÂÃ¥Â?/span>', '已开启</span>'], // dual encoding forms
];

// Generic: Chinese mojibake ending with ?/tag → </tag>
s = s.replace(/([^\s<"']{2,80})\?\/(span|div|button|p|a|label)>/g, (m, _g, tag) => {
  console.log('fix ?/tag', tag, m.slice(0, 40));
  return `</${tag}>`;
});

// Fix specific known UI strings in template that still break parsers via ? inside text nodes is fine;
// focus on attribute quote issues remaining
const lines = s.split(/\n/);
const odd = [];
for (let i = 0; i < lines.length; i++) {
  const L = lines[i];
  const dq = (L.match(/"/g) || []).length;
  const sq = (L.match(/'/g) || []).length;
  if (dq % 2 === 1 || (L.includes('{{') && sq % 2 === 1)) {
    odd.push((i + 1) + ' dq=' + (dq % 2) + ' sq=' + (sq % 2) + ' ' + L.trim().slice(0, 180));
  }
}
console.log('odd quote lines', odd.length);
odd.slice(0, 50).forEach((x) => console.log(x));

// Fix the mmAllyColorMode ternary on the long line if quotes broken
s = s.replace(
  /\{\{\s*mmAllyColorMode\(\)\s*\?\s*'[^']*\?\s*'?\s*:\s*'[^']*\?\s*'\s*\}\}/g,
  "{{ mmAllyColorMode() ? '阵营双色' : '玩家原色' }}"
);

// Broader: any ternary in template with broken quotes containing ?
s = s.replace(
  /\{\{\s*mmAllyColorMode\(\)[^}]{0,200}\}\}/g,
  (m) => {
    if (m.includes('?') && ((m.match(/'/g) || []).length % 2 === 1 || m.includes('Ã'))) {
      console.log('fix mmAlly ternary');
      return "{{ mmAllyColorMode() ? '阵营双色' : '玩家原色' }}";
    }
    return m;
  }
);

// title/alt still ending with unclosed due to double-encoding Ã forms
s = s.replace(/\b(alt|title)="([^"]*?)\?(?=\s+[a-zA-Z_\[:(]|\/?>)/g, (m, attr, val) => {
  console.log('fix attr2', attr);
  return `${attr}="${val}"`;
});
s = s.replace(/\b(alt|title)="([^"\n]*?)\?\s*$/gm, (m, attr, val) => `${attr}="${val}"`);

// [title] bindings with broken quotes
s = s.replace(/\[title\]="([^"]*?)\?(?=\s*[:>])/g, (m, val) => {
  console.log('fix [title]');
  return `[title]="${val}"`;
});

fs.writeFileSync(p, s);
console.log('written');
