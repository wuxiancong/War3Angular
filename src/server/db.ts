<<<<<<< HEAD
=======
// --- AI 修改开始 [LADDER-API]：MySQL 数据库连接池与异步查询模块 ---
>>>>>>> 952f8d2564fdeef192a7ab847a3fd571379ad7b5
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbHost = process.env['DATABASE_URL'] || '139.155.155.166';
const dbPort = Number(process.env['DATABASE_PORT'] || 3306);
const dbUser = process.env['DATABASE_USER'] || 'pvpgn';
const dbPassword = process.env['DATABASE_PASSWORD'] || 'Wxc@15685243548';
const dbName = process.env['DATABASE_NAME'] || 'pvpgn';

export const pool = mysql.createPool({
  host: dbHost,
  port: dbPort,
  user: dbUser,
  password: dbPassword,
  database: dbName,
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

/**
 * 通用单次查询辅助函数
 */
export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const [rows] = await pool.execute(sql, params);
  return rows as T[];
}
<<<<<<< HEAD
=======
// --- AI 修改结束 [LADDER-API]：MySQL 数据库连接池与异步查询模块 ---
>>>>>>> 952f8d2564fdeef192a7ab847a3fd571379ad7b5

