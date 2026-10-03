const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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

  // 构建成功后，自动将 .env 复制到 dist 目录中
  if (!isDev) {
    const envSources = [
      path.join(__dirname, '../.env'),
      path.join(__dirname, '../.env.example')
    ];
    
    let activeEnvFile = envSources.find(f => fs.existsSync(f));

    if (activeEnvFile) {
      const targetDirs = [
        path.join(__dirname, '../dist/app'),
        path.join(__dirname, '../dist/app/browser'),
        path.join(__dirname, '../dist/app/browser/api'),
        path.join(__dirname, '../dist/app/server')
      ];

      targetDirs.forEach(dir => {
        if (fs.existsSync(dir)) {
          const targetFile = path.join(dir, '.env');
          fs.copyFileSync(activeEnvFile, targetFile);
          console.log(`✓ Copied .env to ${targetFile}`);
        }
      });
    }
  }
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}

