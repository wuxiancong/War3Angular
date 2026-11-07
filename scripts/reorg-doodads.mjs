import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { MappedData } = require('mdx-m3-viewer/dist/cjs/utils/mappeddata.js');

const root = path.resolve('public/assets/wc3');
const dood = new MappedData();
dood.load(fs.readFileSync(path.join(root, 'Doodads/Doodads.slk'), 'utf8'));
dood.load(fs.readFileSync(path.join(root, 'Units/DestructableData.slk'), 'utf8'));

/** @type {Map<string, string>} basename stem -> dir/file */
const targets = new Map();
for (const id of Object.keys(dood.map)) {
  const r = dood.getRow(id);
  if (!r) continue;
  const dir = r.string('dir');
  const file = r.string('file');
  if (!dir || !file) continue;
  targets.set(file.toLowerCase(), path.join(dir, file));
}

let moved = 0;
let scanned = 0;

function moveMatching(absFile) {
  const base = path.basename(absFile);
  const m = base.match(/^(.*?)(\d*)\.(mdxbin|mdx|blp|tga)$/i);
  if (!m) return;
  const stem = m[1];
  const folder = targets.get(stem.toLowerCase());
  if (!folder) return;
  const destDir = path.join(root, folder);
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, base);
  if (path.resolve(absFile) === path.resolve(dest)) return;
  if (fs.existsSync(dest)) return;
  fs.renameSync(absFile, dest);
  moved += 1;
}

function walk(d) {
  if (!fs.existsSync(d)) return;
  for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, ent.name);
    if (ent.isDirectory()) walk(p);
    else {
      scanned += 1;
      moveMatching(p);
    }
  }
}

walk(path.join(root, 'Doodads'));
walk(path.join(root, 'Environment'));

// Rename leftover .mdx under Buildings
function renameMdx(d) {
  if (!fs.existsSync(d)) return;
  for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, ent.name);
    if (ent.isDirectory()) renameMdx(p);
    else if (ent.name.toLowerCase().endsWith('.mdx')) {
      fs.renameSync(p, p + 'bin');
    }
  }
}
renameMdx(path.join(root, 'Buildings'));
renameMdx(path.join(root, 'buildings'));

const checks = [
  'Doodads/Ashenvale/Plants/AshenShrooms/AshenShrooms0.mdxbin',
  'Doodads/Ashenvale/Props/ScorchedRemains/ScorchedRemains0.mdxbin',
  'Doodads/Ashenvale/Props/Bird/Bird.mdxbin',
  'Doodads/Terrain/AshenTree/AshenTree0.mdxbin',
  'Doodads/LordaeronSummer/Props/SkullPile/SkullPile0.mdxbin',
  'Doodads/Felwood/Plants/FelwoodShrooms/FelwoodShrooms0.mdxbin',
  'Buildings/Orc/WatchTower/WatchTower.mdxbin',
];
console.log({ scanned, moved, targets: targets.size });
for (const f of checks) console.log(f, fs.existsSync(path.join(root, f)));
