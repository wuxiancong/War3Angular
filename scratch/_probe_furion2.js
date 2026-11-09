const fs = require('fs');
const path = require('path');
const MpqArchive = require('mdx-m3-viewer/dist/cjs/parsers/mpq/archive.js').default;

const probes = [
  'Units\\NightElf\\MalFurion\\MalFurionNoStag.mdx',
  'Units\\NightElf\\MalFurion\\MalFurion.mdx',
  'Units\\NightElf\\MalFurion\\MalFurionNoStag_Portrait.mdx',
  'Units\\NightElf\\MalFurion\\MalFurion_Portrait.mdx',
  'ReplaceableTextures\\CommandButtons\\BTNKeeperOfTheGrove.blp',
  'ReplaceableTextures\\CommandButtons\\BTNFurion.blp',
  'ReplaceableTextures\\CommandButtons\\BTNHeroKeeperoftheGrove.blp',
  'Units\\Creeps\\HeroTinker\\HeroTinker.mdx',
];

const mpqs = [
  'D:\\Qt\\workspace\\War3Launcher\\versions\\1.27.0.52240\\war3.mpq',
  'D:\\Qt\\workspace\\War3Launcher\\versions\\1.27.0.52240\\War3Patch.mpq',
  'D:\\Qt\\workspace\\War3Launcher\\versions\\1.24.1.6374\\War3Patch.mpq',
  'D:\\Qt\\workspace\\War3Launcher\\versions\\1.23.0.6352\\War3Patch.mpq',
  'D:\\Qt\\workspace\\War3Launcher\\versions\\1.22.0.6328\\war3patch.mpq',
  'D:\\Qt\\workspace\\War3Launcher\\versions\\1.0.20.6048\\war3patch.mpq',
];

for (const p of mpqs) {
  if (!fs.existsSync(p)) { console.log('missing', p); continue; }
  console.log('===', path.basename(path.dirname(p)) + '/' + path.basename(p));
  let a;
  try {
    a = new MpqArchive();
    // false = don't require listfile?
    a.load(fs.readFileSync(p), false);
  } catch (e) {
    console.log('  load fail', e.message.split('\n')[0]);
    try {
      a = new MpqArchive();
      a.load(fs.readFileSync(p), true);
    } catch (e2) {
      console.log('  load true fail', e2.message.split('\n')[0]);
      continue;
    }
  }
  for (const n of probes) {
    const f = a.get(n) || a.get(n.toLowerCase());
    console.log(' ', n, !!(f && (f.rawBuffer || typeof f.bytes === 'function')));
  }
}
