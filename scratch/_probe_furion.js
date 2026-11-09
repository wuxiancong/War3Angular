const fs = require('fs');
const path = require('path');
const MpqArchive = require('mdx-m3-viewer/dist/cjs/parsers/mpq/archive.js').default;

const VERS = 'D:\\Qt\\workspace\\War3Launcher\\versions';
const probes = [
  'Units\\NightElf\\MalFurion\\MalFurionNoStag.mdx',
  'Units\\NightElf\\MalFurion\\MalFurion.mdx',
  'Units\\NightElf\\MalFurion\\MalFurionNoStag_Portrait.mdx',
  'Units\\NightElf\\MalFurion\\MalFurion_Portrait.mdx',
  'ReplaceableTextures\\CommandButtons\\BTNKeeperOfTheGrove.blp',
  'ReplaceableTextures\\CommandButtons\\BTNFurion.blp',
  'ReplaceableTextures\\CommandButtons\\BTNMalFurion.blp',
  'ReplaceableTextures\\CommandButtons\\BTNHeroKeeperoftheGrove.blp',
];

function walk(dir, out=[]) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.mpq$/i.test(ent.name)) out.push(p);
  }
  return out;
}

const files = walk(VERS);
console.log('mpqs', files.length);
for (const p of files) {
  let a;
  try {
    a = new MpqArchive();
    a.load(fs.readFileSync(p), true);
  } catch (e) {
    console.log('fail', path.relative(VERS, p), e.message.split('\\n')[0]);
    continue;
  }
  const hits = [];
  for (const n of probes) {
    const f = a.get(n) || a.get(n.toLowerCase());
    if (f && (f.rawBuffer || typeof f.bytes === 'function')) hits.push(n);
  }
  if (hits.length) console.log('HIT', path.relative(VERS, p), hits);
}
console.log('done');
