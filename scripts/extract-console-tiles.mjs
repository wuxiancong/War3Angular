/**
 * Extract WC3 console UI tiles/chrome via mdx-m3-viewer MPQ (same hashes MPQEditor uses).
 * Converts BLP→PNG with Pillow (spawn).
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const MpqArchive = require(path.join(root, 'node_modules/mdx-m3-viewer/dist/cjs/parsers/mpq/archive.js')).default;

const MPQS = [
  path.join(root, '../War3Launcher/build/Desktop_Qt_5_15_2_VSCode_MSVC_32bit_Release/versions/1.27.0.52240/war3.mpq'),
  'X:\\单机游戏\\魔兽3-冰封王座\\WAR3.MPQ',
  'X:\\单机游戏\\魔兽3-冰封王座\\War3x.mpq',
].filter((p) => fs.existsSync(p));

const OUT = path.join(root, 'public/assets/wc3/ui/assembled/mpq');
fs.mkdirSync(OUT, { recursive: true });

const CANDIDATES = [
  // Classic race console tiles
  ...['NightElf', 'Human', 'Orc', 'Undead'].flatMap((r) => [
    `UI\\Console\\${r}\\${r}UITile01.blp`,
    `UI\\Console\\${r}\\${r}UITile02.blp`,
    `UI\\Console\\${r}\\${r}UITile03.blp`,
    `UI\\Console\\${r}\\${r}UITile04.blp`,
    `UI\\Console\\${r}\\${r}UITile-InventoryCover.blp`,
    `UI\\Console\\${r}\\${r}UITile-TimeIndicator.blp`,
    `UI\\Console\\${r}\\${r}UI-ReplayCover.blp`,
    `UI\\Console\\${r}\\${r}UITile01.tga`,
  ]),
  // Widget chrome (confirmed in War3Launcher extracts)
  'UI\\Widgets\\Console\\NightElf\\nightelf-inventory-slotfiller.blp',
  'UI\\Widgets\\Console\\NightElf\\nightelf-console-buttonstates2.blp',
  'UI\\Widgets\\Console\\NightElf\\NightElfUI-ReplayCover.blp',
  'UI\\Widgets\\Console\\Human\\human-console-buttonstates2.blp',
  'UI\\Widgets\\Console\\Human\\human-console-button-up.blp',
  'UI\\Widgets\\Console\\Human\\human-console-button-down.blp',
  'UI\\Widgets\\Console\\Human\\human-console-button-highlight.blp',
  'UI\\Widgets\\Console\\Human\\HumanUI-ReplayCover.blp',
  'UI\\Widgets\\Console\\Human\\human-unitqueue-border.blp',
  'UI\\Widgets\\Console\\Human\\infocard-gold.blp',
  'UI\\Widgets\\Console\\Human\\infocard-supply.blp',
  'UI\\Widgets\\Console\\Human\\infocard-attack-melee.blp',
  'UI\\Widgets\\Console\\Human\\infocard-armor-hero.blp',
  'UI\\Widgets\\Console\\Human\\infocard-heroattributes-str.blp',
  'UI\\Widgets\\Console\\Human\\infocard-heroattributes-agi.blp',
  'UI\\Widgets\\Console\\Human\\infocard-heroattributes-int.blp',
  'UI\\Widgets\\Console\\Human\\CommandButton\\human-activebutton.blp',
  'UI\\Widgets\\Console\\Human\\CommandButton\\human-button-lvls-overlay.blp',
  'UI\\Widgets\\Console\\Human\\CommandButton\\human-subgroup-background.blp',
  // Frame defs to discover more paths
  'UI\\FrameDef\\UI\\ConsoleUI.fdf',
  'UI\\FrameDef\\UI\\UpperButtonBar.fdf',
  'UI\\FrameDef\\UI\\ResourceBar.fdf',
  'UI\\FrameDef\\FrameDef.toc',
];

function load(mpqPath) {
  console.log('loading', mpqPath);
  const a = new MpqArchive();
  a.load(fs.readFileSync(mpqPath), true);
  return a;
}

const archives = [];
for (const p of MPQS) {
  try {
    archives.push({ p, a: load(p) });
  } catch (e) {
    console.warn('fail', p, e.message);
  }
}

const hits = [];
for (const rel of CANDIDATES) {
  let bytes = null;
  let from = '';
  for (const { p, a } of archives) {
    try {
      const f = a.get(rel);
      if (f) {
        bytes = f.bytes();
        from = p;
        break;
      }
    } catch {
      /* next */
    }
  }
  if (!bytes) {
    console.log('MISS', rel);
    continue;
  }
  const base = rel.replace(/\\/g, '__');
  const outFile = path.join(OUT, base);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, bytes);
  console.log('HIT', rel, bytes.length, 'from', path.basename(from));
  hits.push(outFile);
}

// Convert all .blp in OUT to png beside them
const py = `
import os, struct, io, sys
from PIL import Image

def decode_blp(data):
    magic, b_type, flags, w, h, encoding, subtype = struct.unpack('<4sIIIIII', data[:28])
    if magic != b'BLP1':
        raise ValueError('Not BLP1')
    offsets = struct.unpack('<16I', data[28:92])
    lengths = struct.unpack('<16I', data[92:156])
    offset, length = offsets[0], lengths[0]
    if b_type == 0:
        jhlen = struct.unpack('<I', data[156:160])[0]
        img = Image.open(io.BytesIO(data[160:160+jhlen] + data[offset:offset+length]))
        return img.convert('RGBA') if img.mode != 'RGBA' else img
    if b_type == 1:
        pal = []
        for i in range(256):
            b,g,r,a = struct.unpack('<BBBB', data[156+i*4:160+i*4])
            pal.extend((r,g,b))
        pix = data[offset:offset+w*h]
        img = Image.frombytes('L', (w,h), pix)
        img.putpalette(pal)
        img = img.convert('RGBA')
        alpha = data[offset+w*h:offset+2*w*h]
        if len(alpha) >= w*h:
            img.putalpha(Image.frombytes('L', (w,h), alpha[:w*h]))
        return img
    raise ValueError('type')

root = r'''${OUT.replace(/\\/g, '\\\\')}'''
ok=fail=0
for dirpath,_,files in os.walk(root):
    for f in files:
        if not f.lower().endswith('.blp'): continue
        src=os.path.join(dirpath,f)
        dst=src[:-4]+'.png'
        try:
            with open(src,'rb') as rb: img=decode_blp(rb.read())
            img.save(dst,'PNG'); ok+=1; print('PNG', os.path.basename(dst))
        except Exception as e:
            fail+=1; print('FAIL', f, e)
print('convert ok', ok, 'fail', fail)
`;
fs.writeFileSync(path.join(root, 'scripts/_tmp_blp2png.py'), py);
const r = spawnSync('py', [path.join(root, 'scripts/_tmp_blp2png.py')], { encoding: 'utf8' });
console.log(r.stdout || '');
console.log(r.stderr || '');
console.log('done hits', hits.length);
