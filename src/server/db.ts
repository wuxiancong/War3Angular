/**
 * 双库适配：
 * - 本地联调（APP_MODE=local / is_local）：SQLite（War3Bot 旁 pvpgn.db）
 * - CN1/CN2/非本地：MySQL
 *
 * 注意：D:\Qt\workspace\War3Server\lib\sqlite3\x86 只是 SQLite 库源码，不是数据库文件。
 * 账号库（bnetd）：D:\War3Server\var\users.db
 * 本地天梯库（Bot）：C:\War3Run\War3Bot\pvpgn.db（或 SQLITE_PATH）
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import mysql from 'mysql2/promise';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { runtimeConfig, describeRuntime } from './runtime-config.js';

/** 避免 Angular prerender 把 `node:sqlite` 打成裸包 `sqlite` 导致构建失败 */
const nodeRequire = createRequire(import.meta.url);
type DatabaseSyncType = {
  new (path: string): {
    exec(sql: string): void;
    prepare(sql: string): {
      all(...params: any[]): any[];
      run(...params: any[]): { changes: number; lastInsertRowid: number | bigint };
    };
  };
};
function loadDatabaseSync(): DatabaseSyncType {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return nodeRequire('node:sqlite').DatabaseSync as DatabaseSyncType;
}

export type SqlParams = any[];

export interface DbExecutor {
  execute(sql: string, params?: SqlParams): Promise<[any, any]>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
}

const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  uid INTEGER PRIMARY KEY AUTOINCREMENT,
  userName TEXT NOT NULL UNIQUE,
  acct_email TEXT,
  is_phone_verified INTEGER DEFAULT 0,
  total_ingame_time INTEGER DEFAULT 0,
  cheat_records_count INTEGER DEFAULT 0,
  report_records_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ladder_stats (
  userName TEXT PRIMARY KEY,
  rank_level INTEGER DEFAULT 0,
  score INTEGER DEFAULT 1000,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,
  escapes INTEGER DEFAULT 0,
  total_kills INTEGER DEFAULT 0,
  total_deaths INTEGER DEFAULT 0,
  total_assists INTEGER DEFAULT 0,
  total_gold INTEGER DEFAULT 0,
  mvp_count INTEGER DEFAULT 0,
  current_win_streak INTEGER DEFAULT 0,
  max_win_streak INTEGER DEFAULT 0,
  total_play_time_mins INTEGER DEFAULT 0,
  trust_score INTEGER DEFAULT 100
);

CREATE TABLE IF NOT EXISTS matches (
  match_id INTEGER PRIMARY KEY,
  map_name TEXT,
  game_mode TEXT,
  winner_team INTEGER,
  start_time TEXT,
  duration_seconds INTEGER,
  match_type INTEGER DEFAULT 1,
  ac_status TEXT DEFAULT 'PENDING'
);

CREATE TABLE IF NOT EXISTS match_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER,
  userName TEXT,
  team_id INTEGER,
  is_winner INTEGER,
  hero_name TEXT,
  hero_level INTEGER DEFAULT 1,
  kills INTEGER DEFAULT 0,
  deaths INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  last_hits INTEGER DEFAULT 0,
  denies INTEGER DEFAULT 0,
  gold_earned INTEGER DEFAULT 0,
  is_mvp INTEGER DEFAULT 0,
  score_point REAL DEFAULT 0,
  delta_score INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS player_hero_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userName TEXT,
  hero_name TEXT,
  games_played INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  total_kills INTEGER DEFAULT 0,
  total_deaths INTEGER DEFAULT 0,
  total_assists INTEGER DEFAULT 0,
  max_kills INTEGER DEFAULT 0,
  max_duration_secs INTEGER DEFAULT 0,
  UNIQUE(userName, hero_name)
);

CREATE TABLE IF NOT EXISTS player_mode_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userName TEXT,
  game_mode TEXT,
  games_played INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  UNIQUE(userName, game_mode)
);

CREATE TABLE IF NOT EXISTS ac_cases (
  case_id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER,
  user_name TEXT,
  risk_score INTEGER DEFAULT 0,
  status TEXT DEFAULT 'OPEN',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(match_id, user_name)
);

CREATE TABLE IF NOT EXISTS ac_verdicts (
  verdict_id TEXT PRIMARY KEY,
  match_id INTEGER,
  user_name TEXT,
  status TEXT,
  verdict_by TEXT,
  verdict_at TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS banned_hwids (
  hwid TEXT PRIMARY KEY,
  userName TEXT,
  reason TEXT,
  banned_at TEXT DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT
);
`;

type SqliteDb = InstanceType<DatabaseSyncType>;

class SqliteExecutor implements DbExecutor {
  constructor(private readonly db: SqliteDb) {}

  async execute(sql: string, params: SqlParams = []): Promise<[any, any]> {
    const adapted = adaptSqlForSqlite(sql);
    const stmt = this.db.prepare(adapted);
    const trimmed = adapted.trim().toLowerCase();
    if (trimmed.startsWith('select') || trimmed.startsWith('with')) {
      const rows = stmt.all(...params) as RowDataPacket[];
      return [rows, undefined];
    }
    const info = stmt.run(...params) as unknown as ResultSetHeader;
    return [info, undefined];
  }

  async beginTransaction(): Promise<void> {
    this.db.exec('BEGIN IMMEDIATE');
  }

  async commit(): Promise<void> {
    this.db.exec('COMMIT');
  }

  async rollback(): Promise<void> {
    try {
      this.db.exec('ROLLBACK');
    } catch {
      /* ignore */
    }
  }

  release(): void {
    /* shared DatabaseSync — no per-connection release */
  }
}

class MysqlExecutor implements DbExecutor {
  constructor(private readonly conn: PoolConnection) {}

  async execute(sql: string, params: SqlParams = []): Promise<[any, any]> {
    return this.conn.execute(sql, params);
  }

  async beginTransaction(): Promise<void> {
    await this.conn.beginTransaction();
  }

  async commit(): Promise<void> {
    await this.conn.commit();
  }

  async rollback(): Promise<void> {
    await this.conn.rollback();
  }

  release(): void {
    this.conn.release();
  }
}

/** 将常见 MySQL 写法改成 SQLite 可执行（仅本地路径） */
export function adaptSqlForSqlite(sql: string): string {
  let out = sql;
  out = out.replace(/\s+FOR UPDATE\b/gi, '');
  out = out.replace(/\bNOW\(\)/gi, "datetime('now')");
  out = out.replace(/\bGREATEST\s*\(/gi, 'MAX(');
  // IF(a,b,c) → CASE WHEN a THEN b ELSE c END（简单单层）
  out = out.replace(/\bIF\s*\(([^,]+),([^,]+),([^)]+)\)/gi, 'CASE WHEN $1 THEN $2 ELSE $3 END');
  // ON DUPLICATE KEY UPDATE col = VALUES(col) → ON CONFLICT DO UPDATE SET col = excluded.col
  if (/ON DUPLICATE KEY UPDATE/i.test(out)) {
    out = out.replace(/INSERT INTO\s+(\w+)/i, 'INSERT INTO $1');
    // 需要主键冲突目标：ladder_stats/userName、常见表走通用 DO UPDATE
    out = out.replace(/ON DUPLICATE KEY UPDATE/gi, 'ON CONFLICT DO UPDATE SET');
    out = out.replace(/VALUES\s*\(\s*([a-zA-Z_][\w]*)\s*\)/gi, 'excluded.$1');
  }
  return out;
}

export const useSqlite = runtimeConfig.useSqlite;
export const sqlitePath = runtimeConfig.sqlitePath;

let mysqlPool: Pool | null = null;
let sqliteDb: SqliteDb | null = null;

function ensureSqlite(): SqliteDb {
  if (sqliteDb) return sqliteDb;
  const DatabaseSync = loadDatabaseSync();
  const dbFile = runtimeConfig.sqlitePath;
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  sqliteDb = new DatabaseSync(dbFile);
  sqliteDb.exec('PRAGMA journal_mode = WAL;');
  sqliteDb.exec('PRAGMA foreign_keys = OFF;');
  sqliteDb.exec(SQLITE_SCHEMA);
  console.log(`[War3Angular DB] driver=sqlite path=${dbFile}`);
  return sqliteDb;
}

function ensureMysql(): Pool {
  if (mysqlPool) return mysqlPool;
  mysqlPool = mysql.createPool({
    host: runtimeConfig.dbHost,
    port: runtimeConfig.dbPort,
    user: runtimeConfig.dbUser,
    password: runtimeConfig.dbPassword,
    database: runtimeConfig.dbName,
    waitForConnections: true,
    connectionLimit: 15,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  });
  console.log(
    `[War3Angular DB] driver=mysql host=${runtimeConfig.dbHost}:${runtimeConfig.dbPort} db=${runtimeConfig.dbName}`,
    JSON.stringify(describeRuntime())
  );
  return mysqlPool;
}

/** 兼容旧代码：mysql Pool；SQLite 模式下为代理对象 */
export const pool: Pool = new Proxy({} as Pool, {
  get(_target, prop) {
    if (useSqlite) {
      if (prop === 'getConnection') {
        return async () => {
          const db = ensureSqlite();
          return new SqliteExecutor(db) as unknown as PoolConnection;
        };
      }
      if (prop === 'execute') {
        return async (sql: string, params?: SqlParams) => {
          const exec = new SqliteExecutor(ensureSqlite());
          return exec.execute(sql, params);
        };
      }
      return undefined;
    }
    const real = ensureMysql() as any;
    const value = real[prop];
    return typeof value === 'function' ? value.bind(real) : value;
  },
});

export async function getConnection(): Promise<DbExecutor> {
  if (useSqlite) {
    return new SqliteExecutor(ensureSqlite());
  }
  const conn = await ensureMysql().getConnection();
  return new MysqlExecutor(conn);
}

/**
 * 通用单次查询辅助函数
 */
export async function query<T = any>(sql: string, params: SqlParams = []): Promise<T[]> {
  if (useSqlite) {
    const [rows] = await new SqliteExecutor(ensureSqlite()).execute(sql, params);
    return rows as T[];
  }
  const [rows] = await ensureMysql().execute(sql, params);
  return rows as T[];
}

export function ladderUpsertSql(): string {
  if (useSqlite) {
    return `INSERT INTO ladder_stats (userName, score, rank_level, wins, losses, escapes, total_kills, total_deaths,
                                     total_assists, mvp_count, current_win_streak, max_win_streak, total_play_time_mins)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(userName) DO UPDATE SET
             score = excluded.score,
             rank_level = excluded.rank_level,
             wins = wins + excluded.wins,
             losses = losses + excluded.losses,
             escapes = escapes + excluded.escapes,
             total_kills = total_kills + excluded.total_kills,
             total_deaths = total_deaths + excluded.total_deaths,
             total_assists = total_assists + excluded.total_assists,
             mvp_count = mvp_count + excluded.mvp_count,
             current_win_streak = CASE WHEN excluded.wins > 0 THEN current_win_streak + 1 ELSE 0 END,
             max_win_streak = MAX(max_win_streak, CASE WHEN excluded.wins > 0 THEN current_win_streak + 1 ELSE 0 END),
             total_play_time_mins = total_play_time_mins + excluded.total_play_time_mins`;
  }
  return `INSERT INTO ladder_stats (userName, score, rank_level, wins, losses, escapes, total_kills, total_deaths,
                                     total_assists, mvp_count, current_win_streak, max_win_streak, total_play_time_mins)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             score = VALUES(score),
             rank_level = VALUES(rank_level),
             wins = wins + VALUES(wins),
             losses = losses + VALUES(losses),
             escapes = escapes + VALUES(escapes),
             total_kills = total_kills + VALUES(total_kills),
             total_deaths = total_deaths + VALUES(total_deaths),
             total_assists = total_assists + VALUES(total_assists),
             mvp_count = mvp_count + VALUES(mvp_count),
             current_win_streak = IF(VALUES(wins) > 0, current_win_streak + 1, 0),
             max_win_streak = GREATEST(max_win_streak, IF(VALUES(wins) > 0, current_win_streak + 1, 0)),
             total_play_time_mins = total_play_time_mins + VALUES(total_play_time_mins)`;
}

// 不在模块加载时连库：避免 Angular prerender/路由提取阶段误加载 node:sqlite
console.log(
  `[War3Angular DB] mode=${runtimeConfig.mode} driver=${useSqlite ? 'sqlite' : 'mysql'} (lazy)`,
  JSON.stringify(describeRuntime())
);
