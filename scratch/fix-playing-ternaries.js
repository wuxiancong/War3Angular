const fs = require('fs');
const p = 'src/app/pages/replay-3d.component.ts';
let s = fs.readFileSync(p, 'utf8');

// Any isPlaying ternary in template
s = s.replace(/\{\{\s*isPlaying\(\)\s*\?[^}]+\}\}/g, (m) => {
  console.log('fix isPlaying', JSON.stringify(m).slice(0, 80));
  return "{{ isPlaying() ? '暂停' : '播放' }}";
});

// material icon names for play button if broken nearby - check play/pause icons
s = s.replace(
  /\{\{\s*isPlaying\(\)\s*\?\s*'pause'\s*:\s*'play_arrow'\s*\}\}/g,
  "{{ isPlaying() ? 'pause' : 'play_arrow' }}"
);

// Broader: find template expressions with odd single quotes
const lines = s.split(/\n/);
for (let i = 0; i < lines.length; i++) {
  const L = lines[i];
  if (!L.includes('{{')) continue;
  const exprs = L.match(/\{\{[\s\S]*?\}\}/g) || [];
  for (const e of exprs) {
    const sq = (e.match(/'/g) || []).length;
    if (sq % 2 === 1) console.log('odd expr', i + 1, e.slice(0, 100));
  }
}

fs.writeFileSync(p, s);
console.log('done');
