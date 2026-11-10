// 用 esbuild 把 TS 冒烟测试打包到 scratch/ 再执行（不引入额外依赖）
const { buildSync } = require('esbuild');
const path = require('path');
const { spawnSync } = require('child_process');

const out = path.join(__dirname, '../scratch/game-sim-smoke.bundle.cjs');
buildSync({
  entryPoints: [path.join(__dirname, 'game-sim-smoke.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: out,
  logLevel: 'error',
});
const r = spawnSync(process.execPath, [out, ...process.argv.slice(2)], { stdio: 'inherit', cwd: path.join(__dirname, '..') });
process.exit(r.status ?? 1);
