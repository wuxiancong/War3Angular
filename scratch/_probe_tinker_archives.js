const fs = require('fs');
const path = require('path');
const MpqArchive = require('mdx-m3-viewer/dist/cjs/parsers/mpq/archive.js').default;

function walk(dir, out=[]) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (/^(Logs|Replay|Error|YY|skin|REDIST|SUPPORT|System32File|Campaigns|AI Scripts)$/i.test(ent.name)) continue;
      try { walk(p, out); } catch {}
    } else if (/\.mpq$/i.test(ent.name) || /\.w3x$/i.test(ent.name) || /\.w3m$/i.test(ent.name)) {
      out.push(p);
    }
  }
  return out;
}

const ROOT = 'X:\\单机游戏\\魔兽3-冰封王座';
const files = walk(ROOT).concat([
  path.join('d:\\Qt\\workspace\\War3Angular\\scratch\\dota683d.w3x'),
]);
const probes = [
  'Units\\Creeps\\HeroTinker\\HeroTinker.mdx',
  'Units\\Creeps\\HeroTinker\\HeroTinker_Portrait.mdx',
  'ReplaceableTextures\\CommandButtons\\BTNHeroTinker.blp',
  'units\\creeps\\herotinker\\herotinker.mdx',
];
console.log('archives', files.length);
for (const p of files) {
  let a;
  try {
    a = new MpqArchive();
    a.load(fs.readFileSync(p), true);
  } catch (e) {
    continue;
  }
  const hits = [];
  for (const n of probes) {
    const f = a.get(n) || a.get(n.toLowerCase());
    if (f && (f.rawBuffer || typeof f.bytes === 'function')) hits.push(n);
  }
  if (hits.length) console.log('HIT', p, hits);
}
console.log('done');
