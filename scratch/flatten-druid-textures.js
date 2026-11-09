const MdxModel = require('mdx-m3-viewer/dist/cjs/parsers/mdlx/model.js').default;
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'public', 'assets', 'wc3');

function flattenModel(srcPath, leafSet) {
  const bytes = fs.readFileSync(srcPath);
  const model = new MdxModel();
  model.load(bytes);
  let buf = Buffer.from(bytes);
  for (const t of model.textures || []) {
    const old = String(t.path || '')
      .replace(/\0/g, '')
      .trim();
    if (!old) continue;
    const leaf = path.basename(old.replace(/\\/g, '/'));
    if (!leafSet.has(leaf)) continue;
    const neu = 'Textures\\' + leaf;
    const idx = buf.indexOf(Buffer.from(old));
    if (idx < 0) {
      console.warn('not found', old);
      continue;
    }
    if (Buffer.from(neu).length > old.length) {
      console.warn('too long', old, '->', neu);
      continue;
    }
    const neuBuf = Buffer.alloc(old.length, 0);
    Buffer.from(neu).copy(neuBuf);
    neuBuf.copy(buf, idx);
    console.log('patched', old, '->', neu, 'at', idx);
  }
  fs.writeFileSync(srcPath, buf);
  console.log('wrote', srcPath, buf.length);
}

const copies = [
  ['Units/NightElf/DruidoftheClaw/Druidoftheclaw.blp', 'Textures/Druidoftheclaw.blp'],
  ['Units/NightElf/DruidoftheClaw/Bear.blp', 'Textures/Bear.blp'],
  ['Units/NightElf/DruidoftheClaw/Tj_leaf.blp', 'Textures/Tj_leaf.blp'],
  ['Units/Creeps/GrizzlyBear/BrownBear.blp', 'Textures/BrownBear.blp'],
];
for (const [a, b] of copies) {
  fs.copyFileSync(path.join(root, a), path.join(root, b));
  console.log('copied', b);
}

flattenModel(path.join(root, 'Units/NightElf/DruidoftheClaw/DruidoftheClaw.mdxbin'), new Set([
  'Druidoftheclaw.blp',
  'Bear.blp',
  'Tj_leaf.blp',
]));
flattenModel(path.join(root, 'Units/NightElf/DruidoftheClaw/DruidoftheClaw_Portrait.mdxbin'), new Set([
  'Druidoftheclaw.blp',
  'Bear.blp',
  'Tj_leaf.blp',
]));
flattenModel(path.join(root, 'Units/Creeps/GrizzlyBear/GrizzlyBear.mdxbin'), new Set(['BrownBear.blp']));
flattenModel(path.join(root, 'Units/Creeps/GrizzlyBear/GrizzlyBear_Portrait.mdxbin'), new Set(['BrownBear.blp']));

const verify = (p) => {
  const m = new MdxModel();
  m.load(fs.readFileSync(p));
  console.log(
    'verify',
    path.basename(p),
    (m.textures || []).map((t) => JSON.stringify(t.path))
  );
};
verify(path.join(root, 'Units/NightElf/DruidoftheClaw/DruidoftheClaw.mdxbin'));
verify(path.join(root, 'Units/Creeps/GrizzlyBear/GrizzlyBear.mdxbin'));
