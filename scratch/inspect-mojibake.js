const fs = require('fs');
const s = fs.readFileSync('src/app/pages/replay-3d.component.ts', 'utf8');
const lines = s.split(/\n/);
let shown = 0;
for (let i = 0; i < lines.length && shown < 25; i++) {
  if (lines[i].includes('Ã') || lines[i].includes('\uFFFD')) {
    console.log((i + 1) + ':', JSON.stringify(lines[i].trim().slice(0, 120)));
    shown++;
  }
}
console.log('---');
console.log('includes 隐藏工具栏', s.includes('隐藏工具栏'));
console.log('char codes of 隐藏:', [...s.match(/隐藏工具栏/)[0]].map((c) => c.codePointAt(0).toString(16)));
