const fs = require('fs');
const path = require('path');

const archivePath = path.join(__dirname, '../src/app/replay3d/dota-heroes-archive.ts');
const t = fs.readFileSync(archivePath, 'utf8');
const entries = [];
const re = /"([A-Za-z0-9]{4})"\s*:\s*\{[\s\S]*?"name"\s*:\s*"([^"]+)"[\s\S]*?"modelFile"\s*:\s*"([^"]+)"/g;
let m;
while ((m = re.exec(t))) {
  entries.push({ code: m[1], name: m[2], modelFile: m[3].replace(/\\/g, '/') });
}

function existsModel(rel) {
  const bases = [
    path.join(__dirname, '../public/assets/wc3'),
    path.join(__dirname, '../public/assets/models'),
  ];
  const variants = [
    `${rel}.mdxbin`,
    `${rel}.mdx`,
    rel.replace(/^units\//i, 'Units/') + '.mdxbin',
    rel.replace(/^Units\//i, 'units/') + '.mdxbin',
  ];
  for (const base of bases) {
    for (const v of variants) {
      if (fs.existsSync(path.join(base, v))) return path.join(base, v);
    }
  }
  // case-insensitive search by basename
  const baseName = path.basename(rel);
  const wc3Root = path.join(__dirname, '../public/assets/wc3');
  if (!fs.existsSync(wc3Root)) return null;
  const stack = [wc3Root];
  while (stack.length) {
    const dir = stack.pop();
    let kids;
    try {
      kids = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const k of kids) {
      const full = path.join(dir, k.name);
      if (k.isDirectory()) stack.push(full);
      else if (/(\.mdxbin|\.mdx)$/i.test(k.name) && k.name.replace(/\.(mdxbin|mdx)$/i, '').toLowerCase() === baseName.toLowerCase()) {
        return full;
      }
    }
  }
  return null;
}

const missing = [];
const present = [];
for (const e of entries) {
  const hit = existsModel(e.modelFile);
  if (hit) present.push({ ...e, hit });
  else missing.push(e);
}

console.log('archive heroes', entries.length);
console.log('present', present.length);
console.log('missing', missing.length);
console.log('--- missing ---');
for (const e of missing) console.log(`${e.code}\t${e.name}\t${e.modelFile}`);
