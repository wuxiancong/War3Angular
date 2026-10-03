const { execSync } = require('child_process');
try {
  require('dotenv').config();
} catch (e) {
  // dotenv is optional in environments where variables are already exported
}

// 获取环境变量，如果不存在则为空字符串
const apiKey = process.env.GEMINI_API_KEY || '';
const apiKeys = process.env.GEMINI_API_KEYS || '';

// 打印调试信息（隐藏敏感信息）
console.log('Build Script: Preparing environment defines...');
console.log(`GEMINI_API_KEYS length: ${apiKeys.length}`);

// 构建命令
// 使用双引号包裹单引号，确保 esbuild 接收到正确的 JS 字符串字面量
const isDev = process.argv.includes('--dev');
const baseCmd = isDev ? 'npx ng serve --port=3000 --host=0.0.0.0' : 'npx ng build';
const hmrFlag = isDev && process.env.DISABLE_HMR ? '--live-reload=false' : '';

const cmd = `${baseCmd} --define=GEMINI_API_KEY="'${apiKey}'" --define=GEMINI_API_KEYS="'${apiKeys}'" ${hmrFlag}`;

try {
  console.log(`Executing: ${isDev ? 'ng serve' : 'ng build'}`);
  execSync(cmd, { stdio: 'inherit' });
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}