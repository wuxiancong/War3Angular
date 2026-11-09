const fs = require('fs');
const path = require('path');

const archivePath = path.join(__dirname, '../src/app/replay3d/dota-heroes-archive.ts');
const t = fs.readFileSync(archivePath, 'utf8');
const entries = [];
let cur = null;
for (const line of t.split(/\n/)) {
  const c = line.match(/^\s*"([A-Za-z0-9]{4})"\s*:\s*\{/);
  if (c) cur = { code: c[1] };
  if (!cur) continue;
  const n = line.match(/"name"\s*:\s*"([^"]+)"/);
  if (n) cur.name = n[1];
  const mf = line.match(/"modelFile"\s*:\s*"([^"]+)"/);
  if (mf) {
    cur.modelFile = mf[1].replace(/\\/g, '/').replace(/\/+/g, '/');
    entries.push(cur);
    cur = null;
  }
}

const wc3Root = path.join(__dirname, '../public/assets/wc3');
const index = new Map(); // lower basename -> full path of mdxbin/mdx
function walk(dir) {
  for (const k of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, k.name);
    if (k.isDirectory()) walk(full);
    else if (/\.(mdxbin|mdx)$/i.test(k.name)) {
      const base = k.name.replace(/\.(mdxbin|mdx)$/i, '').toLowerCase();
      if (!index.has(base)) index.set(base, full);
      const rel = path.relative(wc3Root, full).replace(/\\/g, '/').toLowerCase();
      index.set(rel, full);
      index.set(rel.replace(/\.mdxbin$/i, ''), full);
    }
  }
}
walk(wc3Root);

function findModel(rel) {
  const norm = rel.replace(/\\/g, '/').replace(/\/+/g, '/');
  const lower = norm.toLowerCase();
  const candidates = [
    lower + '.mdxbin',
    lower + '.mdx',
    lower,
    lower.replace(/^units\//, 'Units/'),
  ];
  for (const c of candidates) {
    if (index.has(c)) return index.get(c);
    const abs = path.join(wc3Root, c);
    if (fs.existsSync(abs)) return abs;
  }
  const base = path.basename(norm).toLowerCase();
  return index.get(base) || null;
}

const missing = [];
const present = [];
for (const e of entries) {
  const hit = findModel(e.modelFile);
  (hit ? present : missing).push({ ...e, hit });
}
console.log('indexed files', index.size / 3 | 0);
console.log('present', present.length, 'missing', missing.length);
for (const e of missing) console.log(`${e.code}\t${e.name}\t${e.modelFile}`);
fs.writeFileSync(path.join(__dirname, 'missing-models.json'), JSON.stringify(missing, null, 2));
