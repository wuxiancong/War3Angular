import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
// --- AI 修改开始 [REPLAY-API]：引入文件系统与 zlib 解压缩模块用于解析 War3Bot 玩家录像数据 ---
import * as fs from 'node:fs';
import * as zlib from 'node:zlib';
// --- AI 修改结束 [REPLAY-API]：引入文件系统与 zlib 解压缩模块用于解析 War3Bot 玩家录像数据 ---
import { GoogleGenAI } from '@google/genai';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
// --- AI 修改开始 [SSR-ALLOWED-HOSTS]：配置 SSR 允许的主机名白名单，避免 localhost 与 127.0.0.1 访问被判定为 SSRF 拦截并报 400 错误 ---
const angularApp = new AngularNodeAppEngine({
  allowedHosts: ['localhost', '127.0.0.1', '0.0.0.0'],
});
// --- AI 修改结束 [SSR-ALLOWED-HOSTS] ---

app.use(express.json());

function getGeminiKeys(): string[] {
  const rawKeys = process.env['GEMINI_API_KEYS'] || process.env['GEMINI_API_KEY'] || '';
  if (!rawKeys) return [];
  return rawKeys
    .split(',')
    .map(k => k.trim().replace(/^["']|["']$/g, ''))
    .filter(k => k.length > 10);
}

async function handleGeminiGeneration(prompt: string): Promise<string> {
  const keys = getGeminiKeys();
  if (keys.length === 0) {
    throw new Error('Gemini API key not configured');
  }

  let lastError: Error | null = null;
  for (const key of keys) {
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      if (response.text) {
        return response.text;
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error('Gemini attempt failed with key, trying next if available:', lastError.message);
    }
  }

  throw lastError || new Error('All Gemini API keys failed');
}

async function handleDeepSeekGeneration(prompt: string): Promise<string> {
  const apiKey = process.env['DEEPSEEK_API_KEY'];
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY not configured');
  }

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'user', content: prompt }
      ]
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `DeepSeek API Error (HTTP ${response.status})`);
  }

  const reply = data.choices?.[0]?.message?.content;
  if (!reply) {
    throw new Error('Empty response from DeepSeek API');
  }

  return reply;
}

/**
 * Gemini API Proxy
 */
app.post('/api/gemini', async (req, res) => {
  const prompt = req.body.prompt || req.body.contents;
  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt in request body' });
  }

  try {
    const reply = await handleGeminiGeneration(prompt);
    return res.json({ reply, text: reply });
  } catch (error) {
    console.error('Gemini Proxy Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: msg });
  }
});

/**
 * DeepSeek API Proxy
 */
app.post('/api/deepseek', async (req, res) => {
  const apiKey = process.env['DEEPSEEK_API_KEY'];
  if (!apiKey) {
    return res.status(500).json({ error: 'DEEPSEEK_API_KEY not configured' });
  }

  const prompt = req.body.prompt;
  if (prompt) {
    try {
      const reply = await handleDeepSeekGeneration(prompt);
      return res.json({ reply, choices: [{ message: { content: reply } }] });
    } catch (error) {
      console.error('DeepSeek Proxy Error:', error);
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: msg });
    }
  }

  // Fallback to forwarding raw OpenAI format payload if messages array was provided
  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'DeepSeek API Error' });
    }
    return res.json(data);
  } catch (error) {
    console.error('DeepSeek Proxy Error:', error);
    return res.status(500).json({ error: 'Failed to call DeepSeek API' });
  }
});

/**
 * Unified Chat Endpoint (supports both /api/chat and legacy /api/chat.php)
 */
const chatHandler: express.RequestHandler = async (req, res) => {
  const model = req.body.model || 'gemini';
  const prompt = req.body.prompt || req.body.message;

  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt in request body' });
  }

  try {
    let reply = '';
    if (model === 'deepseek') {
      reply = await handleDeepSeekGeneration(prompt);
    } else {
      reply = await handleGeminiGeneration(prompt);
    }
    return res.json({ success: true, reply, text: reply });
  } catch (error) {
    console.error(`Chat API (${model}) Error:`, error);
    const msg = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: msg, success: false });
  }
};

app.post('/api/chat', chatHandler);
app.post('/api/chat.php', chatHandler);

// --- AI 修改开始 [REPLAY-API]：挂载 War3Bot DotA 图标静态资源与 wuxiancong 录像同步 API ---
const WAR3BOT_ROOT = 'D:/Qt/workspace/War3Bot';
const WAR3BOT_BUILD_ROOT = `${WAR3BOT_ROOT}/build/Desktop_Qt_5_15_2_VSCode_MSVC_32bit_Release`;
const PLAYER_ACTIONS_DIR = `${WAR3BOT_BUILD_ROOT}/data/player_actions`;

app.use('/assets/dota/heroIcons', express.static(`${WAR3BOT_ROOT}/images/heroIcons`));
app.use('/assets/dota/abilityIcons', express.static(`${WAR3BOT_BUILD_ROOT}/images/abilityIcons`));
app.use('/assets/dota/itemIcons', express.static(`${WAR3BOT_BUILD_ROOT}/images/itemIcons`));
app.use('/assets/dota/cmdIcons', express.static(`${WAR3BOT_BUILD_ROOT}/images/cmdIcons`));
app.use('/assets/wc3', express.static(join(process.cwd(), 'public/assets/wc3')));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedDotaData: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedHeroesMap: Record<string, { name: string; icon: string }> | null = null;

function getDotaStaticData() {
  if (!cachedDotaData) {
    try {
      cachedDotaData = JSON.parse(fs.readFileSync(`${WAR3BOT_ROOT}/images/dota_data.json`, 'utf8'));
    } catch {
      cachedDotaData = { items: {}, recipes: {}, heroes: {}, abilities: {} };
    }
  }
  if (!cachedHeroesMap) {
    try {
      cachedHeroesMap = JSON.parse(fs.readFileSync(`${WAR3BOT_ROOT}/images/heroes.json`, 'utf8'));
    } catch {
      cachedHeroesMap = {};
    }
  }
  return { dotaData: cachedDotaData, heroesMap: cachedHeroesMap! };
}

function hexHeroIdToFourCC(heroIdHex: string | undefined): string {
  if (!heroIdHex || heroIdHex === '0') return '';
  if (heroIdHex.length === 4) return heroIdHex;
  if (heroIdHex.length === 8 && /^[0-9a-fA-F]{8}$/.test(heroIdHex)) {
    try {
      return Buffer.from(heroIdHex, 'hex').toString('ascii');
    } catch {
      return '';
    }
  }
  return '';
}

function intToFourCC(val: number | undefined): string {
  if (!val || val < 0x20202020 || val > 0x7a7a7a7a) return '';
  const b = Buffer.alloc(4);
  b.writeUInt32BE(val >>> 0, 0);
  const s = b.toString('ascii');
  return /^[\x20-\x7e]{4}$/.test(s) ? s : '';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readMatchDatFile(filePath: string): any | null {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.length <= 4) return null;
    const rawJson = zlib.inflateSync(buf.subarray(4)).toString('utf8');
    return JSON.parse(rawJson);
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveMatchHeroCode(data: any, dotaData: any): string {
  let code = hexHeroIdToFourCC(String(data.heroId || ''));
  if (code && dotaData.heroes?.[code]) return code;
  const pid = Number(data.pid || 1);
  for (const a of data.actions || []) {
    if (a[1] === 0x6b && typeof a[5] === 'string') {
      const m = a[5].match(/^(\d+):9=(\d+)$/);
      if (m && Number(m[1]) === pid) {
        const c = intToFourCC(Number(m[2]));
        if (c && dotaData.heroes?.[c]) return c;
      }
    }
    if (a[1] === 0x10 && a[6]) {
      const c = intToFourCC(Number(a[6]));
      if (c && dotaData.heroes?.[c]) return c;
    }
  }
  return code;
}

app.get('/api/replay/matches', (req, res) => {
  const player = String(req.query['player'] || 'wuxiancong').replace(/[^a-zA-Z0-9_-]/g, '');
  const dir = join(PLAYER_ACTIONS_DIR, player);
  const { dotaData, heroesMap } = getDotaStaticData();
  if (!fs.existsSync(dir)) {
    return res.json({ player, matches: [] });
  }
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.dat'))
    .sort((a, b) => b.localeCompare(a));

  const matches = [];
  for (const fileName of files) {
    const data = readMatchDatFile(join(dir, fileName));
    if (!data) continue;
    const heroCode = resolveMatchHeroCode(data, dotaData);
    const heroEntry = dotaData.heroes?.[heroCode] || heroesMap?.[heroCode];
    const heroIconFile = heroesMap?.[heroCode]?.icon || '';
    let moveActions = 0;
    for (const a of data.actions || []) {
      if (a[1] === 0x11 || a[1] === 0x12) moveActions++;
    }
    matches.push({
      fileName,
      matchId: String(data.matchId || fileName.replace(/^match_|\.dat$/g, '')),
      player: String(data.player || player),
      pid: Number(data.pid || 1),
      heroId: String(data.heroId || ''),
      heroCode,
      heroName: heroEntry?.name || (heroCode ? heroCode : '未选择英雄'),
      heroIcon: heroIconFile ? `/assets/dota/heroIcons/${heroIconFile}` : '',
      gameStartMs: Number(data.gameStartMs || 0),
      gameEndMs: Number(data.gameEndMs || 0),
      durationMs: Number(data.durationMs || 0),
      totalActions: Number(data.totalActions || (data.actions?.length ?? 0)),
      moveActions,
    });
  }
  return res.json({ player, matches });
});

app.get('/api/replay/match', (req, res) => {
  const player = String(req.query['player'] || 'wuxiancong').replace(/[^a-zA-Z0-9_-]/g, '');
  const wantMatchId = String(req.query['matchId'] || '').trim();
  const wantFile = String(req.query['file'] || '').trim();
  const isLive = req.query['live'] === '1';
  const { dotaData, heroesMap } = getDotaStaticData();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = null;
  let chosenFile = '';

  if (isLive) {
    const livePath = join(PLAYER_ACTIONS_DIR, 'live_match.json');
    if (fs.existsSync(livePath)) {
      try {
        const liveData = JSON.parse(fs.readFileSync(livePath, 'utf8'));
        if (liveData?.actions?.length) {
          data = liveData;
          chosenFile = 'live_match.json';
        }
      } catch {
        /* fallback to .dat */
      }
    }
  }

  const dir = join(PLAYER_ACTIONS_DIR, player);
  if (!data && fs.existsSync(dir)) {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.dat'))
      .sort((a, b) => b.localeCompare(a));

    if (wantFile && files.includes(wantFile)) {
      data = readMatchDatFile(join(dir, wantFile));
      chosenFile = wantFile;
    }
    if (!data && wantMatchId) {
      const byName = files.find((f) => f.includes(wantMatchId));
      if (byName) {
        data = readMatchDatFile(join(dir, byName));
        chosenFile = byName;
      } else {
        for (const f of files) {
          const d = readMatchDatFile(join(dir, f));
          if (d?.matchId === wantMatchId) {
            data = d;
            chosenFile = f;
            break;
          }
        }
      }
    }
    if (!data) {
      // 默认选取最新一局有选英雄且有移动操作的有效录像
      for (const f of files) {
        const d = readMatchDatFile(join(dir, f));
        if (!d) continue;
        const hc = resolveMatchHeroCode(d, dotaData);
        const hasMoves = (d.actions || []).some((a: number[]) => a[1] === 0x11 || a[1] === 0x12);
        if (hc && hasMoves) {
          data = d;
          chosenFile = f;
          break;
        }
      }
      if (!data && files.length) {
        data = readMatchDatFile(join(dir, files[0]));
        chosenFile = files[0];
      }
    }
  }

  if (!data) {
    return res.status(404).json({ error: '未找到匹配的录像数据' });
  }

  const heroCode = resolveMatchHeroCode(data, dotaData) || 'Nbbc';
  const heroDef = dotaData.heroes?.[heroCode] || dotaData.heroes?.['Nbbc'] || {
    name: '主宰',
    attrCode: 'Aamk',
    skills: [],
  };
  const heroIconFile = heroesMap?.[heroCode]?.icon || 'ReplaceableTextures_CommandButtons_BTNHeroBlademaster.png';

  return res.json({
    fileName: chosenFile,
    matchId: String(data.matchId || chosenFile),
    player: String(data.player || player),
    pid: Number(data.pid || 1),
    heroId: String(data.heroId || ''),
    heroCode,
    heroName: heroDef.name || '主宰',
    heroIcon: `/assets/dota/heroIcons/${heroIconFile}`,
    gameStartMs: Number(data.gameStartMs || 0),
    gameEndMs: Number(data.gameEndMs || 0),
    durationMs: Number(data.durationMs || 0),
    totalActions: Number(data.totalActions || (data.actions?.length ?? 0)),
    players: data.players || { '1': player },
    heroMeta: heroDef,
    items: dotaData.items || {},
    recipes: dotaData.recipes || {},
    abilities: dotaData.abilities || {},
    actions: data.actions || [],
  });
});
// --- AI 修改结束 [REPLAY-API]：挂载 War3Bot DotA 图标静态资源与 wuxiancong 录像同步 API ---

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
