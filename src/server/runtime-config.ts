/**
 * 运行时环境：本地联调 / 测试 / 正式。
 * War3Bot war3bot.ini [server] is_local + [bots] debug_mode 与此对齐。
 *
 * 库选择规则（与用户约定一致）：
 * - 本地自定义 / is_local / APP_MODE=local → SQLite（pvpgn.db）
 * - CN1 / CN2 / 非本地自定义 → MySQL
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config();

export type AppRuntimeMode = 'production' | 'local' | 'test';

function parseBool(raw: string | undefined, fallback = false): boolean {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function detectMode(): AppRuntimeMode {
  const explicit = (process.env['APP_MODE'] || process.env['RUNTIME_MODE'] || '').trim().toLowerCase();
  if (explicit === 'local' || explicit === 'test' || explicit === 'production') {
    return explicit;
  }
  if (parseBool(process.env['LOCAL_MODE']) || parseBool(process.env['IS_LOCAL'])) {
    return 'local';
  }
  if (parseBool(process.env['TEST_MODE']) || parseBool(process.env['DEBUG_MODE'])) {
    return 'test';
  }
  // 开发默认视为 local，避免误连远程库
  if ((process.env['NODE_ENV'] || '').toLowerCase() !== 'production') {
    return 'local';
  }
  return 'production';
}

function resolveSqlitePath(): string {
  const fromEnv = (process.env['SQLITE_PATH'] || process.env['DATABASE_SQLITE'] || '').trim();
  if (fromEnv) return path.resolve(fromEnv);
  const candidates = [
    'C:/War3Run/War3Bot/pvpgn.db',
    path.resolve(process.cwd(), '../War3Bot/pvpgn.db'),
    path.resolve(process.cwd(), 'pvpgn.db'),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).size > 0) return c;
    } catch {
      /* ignore */
    }
  }
  return candidates[0];
}

const mode = detectMode();
/** 显式 DB_DRIVER 可覆盖；否则 local→sqlite，其它→mysql */
const driverOverride = (process.env['DB_DRIVER'] || '').trim().toLowerCase();
const useSqlite =
  driverOverride === 'sqlite' || driverOverride === 'sqlite3'
    ? true
    : driverOverride === 'mysql' || driverOverride === 'mariadb'
      ? false
      : mode === 'local';

/** 5v5 标准模式（含 83 / TB 变体）或 SOLO 1v1 */
const LADDER_MODE_RE =
  /^(ap|cm|rd|sd|ar|xl)(83)?(tb)?$|^solo(83)?$/i;

export const runtimeConfig = {
  mode,
  isLocal: mode === 'local',
  isTest: mode === 'test',
  /** 本地自定义地址 → SQLite；CN1/CN2/非本地 → MySQL */
  useSqlite,
  sqlitePath: resolveSqlitePath(),
  /** 本地或测试：允许人数不足局写入（仍须正规模式） */
  isDebugLike: mode === 'local' || mode === 'test' || parseBool(process.env['DEBUG_MODE']),
  dbHost:
    process.env['DATABASE_URL'] ||
    (mode === 'production' ? '139.155.155.166' : '127.0.0.1'),
  dbPort: Number(process.env['DATABASE_PORT'] || 3306),
  dbUser: process.env['DATABASE_USER'] || 'pvpgn',
  dbPassword: process.env['DATABASE_PASSWORD'] || 'Wxc@15685243548',
  dbName: process.env['DATABASE_NAME'] || 'pvpgn',
  botSecretKey:
    process.env['BOT_SECRET_KEY'] || 'War3_Bot_Ladder_Secret_Token_2026',
  /** 本地联调时 Bot 应指向的 API 基址（含 /api） */
  recommendedApiBase:
    process.env['PUBLIC_API_BASE'] ||
    (mode === 'production'
      ? 'http://139.155.155.166/api'
      : `http://127.0.0.1:${process.env['PORT'] || 4000}/api`),
  /** 正式局最短时长（秒）；debug/local 放宽 */
  minDurationSeconds: mode === 'production' && !parseBool(process.env['DEBUG_MODE']) ? 180 : 60,
};

/** 规范化模式字符串：去掉前导 -/#，小写 */
export function normalizeGameMode(raw: string | undefined | null): string {
  return String(raw || '')
    .trim()
    .replace(/^[-#\s]+/, '')
    .toLowerCase();
}

/**
 * 是否允许写入天梯库：仅 5v5 标准模式或 SOLO 1v1。
 * 自定义图 / 非正规模式一律拒绝（含 debug）。
 */
export function isEligibleLadderMode(rawMode: string | undefined | null): boolean {
  const mode = normalizeGameMode(rawMode);
  if (!mode) return false;
  return LADDER_MODE_RE.test(mode);
}

export function isSoloMode(rawMode: string | undefined | null): boolean {
  return normalizeGameMode(rawMode).startsWith('solo');
}

export function describeRuntime(): Record<string, unknown> {
  return {
    mode: runtimeConfig.mode,
    isLocal: runtimeConfig.isLocal,
    isTest: runtimeConfig.isTest,
    isDebugLike: runtimeConfig.isDebugLike,
    dbDriver: runtimeConfig.useSqlite ? 'sqlite' : 'mysql',
    sqlitePath: runtimeConfig.useSqlite ? runtimeConfig.sqlitePath : null,
    dbHost: runtimeConfig.useSqlite ? null : runtimeConfig.dbHost,
    dbPort: runtimeConfig.useSqlite ? null : runtimeConfig.dbPort,
    dbName: runtimeConfig.useSqlite ? null : runtimeConfig.dbName,
    recommendedApiBase: runtimeConfig.recommendedApiBase,
    minDurationSeconds: runtimeConfig.minDurationSeconds,
  };
}
