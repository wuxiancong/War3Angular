const fs = require('fs');
const s = fs.readFileSync('src/app/pages/replay-3d.component.ts', 'utf8');
const lines = s.split(/\n/);

console.log('1460-1480:');
for (let i = 1459; i < 1480; i++) {
  console.log((i + 1) + ':' + JSON.stringify(lines[i]));
}

const idx = s.indexOf('readonly cameraMode');
console.log('idx', idx);
console.log('around cameraMode:', JSON.stringify(s.slice(Math.max(0, idx - 100), idx + 150)));

const bad = [];
for (let i = 0; i < lines.length; i++) {
  const L = lines[i];
  if (L.includes("signal('hero'))") || L.includes(');, readonly') || /label: '[^']*\?\s*\}/.test(L)) {
    bad.push((i + 1) + ':' + L.trim());
  }
}
console.log('bad patterns:', bad);

// Detect template literal / string issues: find // comments that contain */ wrongly, or open /* without */
let inBlock = false;
let blockStart = 0;
for (let i = 0; i < lines.length; i++) {
  const L = lines[i];
  // skip if we're tracking
  const open = (L.match(/\/\*/g) || []).length;
  const close = (L.match(/\*\//g) || []).length;
  if (!inBlock && open > close) {
    inBlock = true;
    blockStart = i + 1;
  } else if (inBlock) {
    if (close >= open) inBlock = false;
  }
}
if (inBlock) console.log('UNCLOSED BLOCK COMMENT starting', blockStart);

// Check jumpMenuOptions first entry
const j = s.indexOf('jumpMenuOptions');
console.log('jumpMenu start snippet:', JSON.stringify(s.slice(j, j + 350)));

// Try typescript transpile quick check via node's strip? Use acorn? Just run tsc if available
try {
  require('typescript');
} catch {
  console.log('no typescript package require');
}
