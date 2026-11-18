import { getConnection, ladderUpsertSql, query, useSqlite } from './db.js';
import { AcDetectionInput, AntiCheatService } from './anticheat.service.js';
import {
  isEligibleLadderMode,
  isSoloMode,
  normalizeGameMode,
  runtimeConfig,
} from './runtime-config.js';

export interface PlayerReportItem {
  userName: string;
  team: number; // 1: 近卫, 2: 天灾
  slot: number; // 0~9
  heroCode: string;
  heroName?: string;
  kills: number;
  deaths: number;
  assists: number;
  lastHits: number;
  denies: number;
  gold: number;
  isAbandon: boolean;
}

export interface MatchReportPayload {
  matchId: number | string;
  mode: string;
  winnerTeam: number; // 1: 近卫, 2: 天灾
  durationSeconds: number;
  players: PlayerReportItem[];
  actionHash?: string;
  acStatus?: 'PENDING' | 'FROZEN'; // 主机实时反作弊状态
  acDetections?: AcDetectionInput[]; // 主机实时检测命中列表
  /** War3Bot debug_mode / 本地联调：允许人数不足局落库（仍须正规模式） */
  debugMode?: boolean;
  localMode?: boolean;
}

export interface LadderUserRecord {
  userName: string;
  score: number;
  rank_level: number;
  rank_code: string;
  rank_title: string;
  wins: number;
  losses: number;
  escapes: number;
  winRate: number;
  total_kills: number;
  total_deaths: number;
  total_assists: number;
  kda: number;
  mvp_count: number;
  current_win_streak: number;
  max_win_streak: number;
  total_play_time_mins: number;
}

const RANK_CODES = ['-', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
const RANK_TITLES = [
  '见习新手',
  '青铜守护',
  '白银先锋',
  '黄金勇士',
  '铂金统领',
  '璀璨钻石',
  '超凡大师',
  '最强王者',
];
const RANK_THRESHOLDS = [0, 1000, 3000, 5000, 7000, 9000, 11000, 13000];

export function scoreToRankLevel(score: number): number {
  for (let i = RANK_THRESHOLDS.length - 1; i >= 0; i--) {
    if (score >= RANK_THRESHOLDS[i]) return i;
  }
  return 0;
}

export function rankLevelToCode(level: number): string {
  return RANK_CODES[level] || '-';
}

export function rankLevelToTitle(level: number): string {
  return RANK_TITLES[level] || '见习新手';
}

/** 与 War3Bot LadderScoreEngine::calculateKFactor 对齐 */
function calculateKFactor(score: number): number {
  if (score < 1200) return 36;
  if (score < 1800) return 30;
  if (score < 2400) return 24;
  return 18;
}

/** 与 War3Bot evaluatePerformance 对齐：KDA + KP + 正反补 */
function evaluatePerformance(
  p: PlayerReportItem,
  teamKills: number
): number {
  if (p.isAbandon) return 0.0;
  const kdaWeight = p.kills * 3.0 + p.assists * 1.5 - p.deaths * 2.0;
  const kp = teamKills > 0 ? Math.min(1.0, Math.max(0.0, (p.kills + p.assists) / teamKills)) : 0.0;
  const farmScore = p.lastHits * 0.04 + p.denies * 0.06;
  const raw = 5.0 + kdaWeight * 0.3 + kp * 2.5 + farmScore;
  return Math.max(2.0, Math.min(10.0, Math.round(raw * 10) / 10));
}

export class LadderService {
  /**
   * 1. 验证上报比赛合法性 (模式门禁、数据防伪、时长合规、人头守恒)
   * - 非 5v5 / SOLO 一律拒绝落库（debug 也不例外）
   * - local/test/debug：放宽最短时长与人头守恒，允许人数不足局写入
   */
  static validateMatchIntegrity(payload: MatchReportPayload): { valid: boolean; reason?: string } {
    if (!payload.matchId || !payload.players || payload.players.length === 0) {
      return { valid: false, reason: '比赛ID或玩家列表不能为空' };
    }
    if (payload.winnerTeam !== 1 && payload.winnerTeam !== 2) {
      return { valid: false, reason: '胜利方队伍参数非法 (必须为 1:近卫 或 2:天灾)' };
    }

    const mode = normalizeGameMode(payload.mode);
    if (!isEligibleLadderMode(mode)) {
      return {
        valid: false,
        reason: `非正规模式 [${payload.mode || '(空)'}] 禁止写入天梯库（仅允许 5v5: AP/CM/RD/SD/AR/XL 及变体，或 SOLO 1v1）`,
      };
    }

    const debugLike =
      !!payload.debugMode ||
      !!payload.localMode ||
      runtimeConfig.isDebugLike;

    const minDuration = debugLike ? runtimeConfig.minDurationSeconds : 180;
    if (payload.durationSeconds < minDuration) {
      return {
        valid: false,
        reason: `比赛时长过短 (小于${Math.round(minDuration / 60)}分钟)，判定为无效局不计入天梯积分`,
      };
    }

    // 人数门禁：正式环境要求满编；debug/local 允许不足，但仍要求双方至少各 1 人（SOLO）或总共 ≥2
    const humans = payload.players.filter((p) => !!p.userName?.trim());
    const team1 = humans.filter((p) => p.team === 1).length;
    const team2 = humans.filter((p) => p.team === 2).length;
    if (isSoloMode(mode)) {
      if (team1 < 1 || team2 < 1) {
        return { valid: false, reason: 'SOLO 1v1 需要对阵双方各至少 1 名有效玩家' };
      }
      if (!debugLike && humans.length !== 2) {
        return { valid: false, reason: '正式环境 SOLO 必须恰好 2 名玩家' };
      }
    } else {
      // 5v5
      if (!debugLike && humans.length < 10) {
        return { valid: false, reason: `正式环境 5v5 需要 10 名玩家，当前 ${humans.length}` };
      }
      if (debugLike && (team1 < 1 || team2 < 1 || humans.length < 2)) {
        return { valid: false, reason: '测试局至少需要对阵双方各 1 人且总人数≥2' };
      }
    }

    // 人头数与死亡数守恒检查
    let sentinelKills = 0;
    let sentinelDeaths = 0;
    let scourgeKills = 0;
    let scourgeDeaths = 0;

    for (const p of payload.players) {
      if (p.kills < 0 || p.deaths < 0 || p.assists < 0 || p.lastHits < 0 || p.denies < 0 || p.gold < 0) {
        return { valid: false, reason: `玩家 ${p.userName} 战绩数据包含非法负数` };
      }
      if (p.kills > 100 || p.deaths > 50 || p.gold > 99999) {
        return { valid: false, reason: `玩家 ${p.userName} 战绩数据超出合理范围` };
      }
      if (p.team === 1) {
        sentinelKills += p.kills;
        sentinelDeaths += p.deaths;
      } else if (p.team === 2) {
        scourgeKills += p.kills;
        scourgeDeaths += p.deaths;
      }
    }

    // 近卫击杀与天灾死亡差值校验；debug 局放宽（人少时野怪误差相对更大）
    const killSlack = debugLike ? 25 : 10;
    if (
      Math.abs(sentinelKills - scourgeDeaths) > killSlack ||
      Math.abs(scourgeKills - sentinelDeaths) > killSlack
    ) {
      return { valid: false, reason: '战斗数据不符合人头守恒定律，涉嫌伪造注入' };
    }

    return { valid: true };
  }

  /**
   * 2. 查询玩家天梯档案
   */
  static emptyProfile(userName: string): LadderUserRecord {
    return {
      userName,
      score: 1000,
      rank_level: 0,
      rank_code: '-',
      rank_title: '见习新手',
      wins: 0,
      losses: 0,
      escapes: 0,
      winRate: 0,
      total_kills: 0,
      total_deaths: 0,
      total_assists: 0,
      kda: 0,
      mvp_count: 0,
      current_win_streak: 0,
      max_win_streak: 0,
      total_play_time_mins: 0,
    };
  }

  static async getPlayerProfile(userName: string): Promise<LadderUserRecord | null> {
    const cleanUser = userName.trim();
    if (!cleanUser) return null;

    try {
      const rows = await query<any>(
        `SELECT userName, score, rank_level, wins, losses, escapes, total_kills, total_deaths,
                total_assists, mvp_count, current_win_streak, max_win_streak, total_play_time_mins
         FROM ladder_stats WHERE userName = ? LIMIT 1`,
        [cleanUser]
      );

      if (!rows || rows.length === 0) {
        return this.emptyProfile(cleanUser);
      }

      return this.mapLadderRow(rows[0]);
    } catch (err) {
      console.warn(`[Ladder] getPlayerProfile(${cleanUser}) DB unavailable, empty profile:`, (err as Error)?.message || err);
      return this.emptyProfile(cleanUser);
    }
  }

  /**
   * 3. 查询天梯全服排行榜
   */
  static async getLeaderboard(limit = 50, page = 1): Promise<{ total: number; list: LadderUserRecord[] }> {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const safeOffset = (Math.max(1, page) - 1) * safeLimit;

    const countRows = await query<any>('SELECT COUNT(*) as total FROM ladder_stats');
    const total = countRows[0]?.total || 0;

    const rows = await query<any>(
      `SELECT userName, score, rank_level, wins, losses, escapes, total_kills, total_deaths,
              total_assists, mvp_count, current_win_streak, max_win_streak, total_play_time_mins
       FROM ladder_stats
       ORDER BY score DESC, wins DESC
       LIMIT ? OFFSET ?`,
      [safeLimit, safeOffset]
    );

    return { total, list: rows.map((r: any) => this.mapLadderRow(r)) };
  }

  /**
   * 4. 查询玩家历史比赛记录
   */
  static async getPlayerMatches(userName: string, limit = 20): Promise<any[]> {
    const safeLimit = Math.min(Math.max(1, limit), 50);
    try {
      return await query<any>(
        `SELECT m.match_id, m.map_name, m.game_mode, m.winner_team, m.start_time, m.duration_seconds,
                mr.team_id, mr.is_winner, mr.hero_name, mr.kills, mr.deaths, mr.assists,
                mr.last_hits, mr.denies, mr.gold_earned, mr.is_mvp, mr.score_point
         FROM match_results mr
         JOIN matches m ON mr.match_id = m.match_id
         WHERE mr.userName = ?
         ORDER BY m.start_time DESC
         LIMIT ?`,
        [userName.trim(), safeLimit]
      );
    } catch (err) {
      console.warn(`[Ladder] getPlayerMatches(${userName}) failed:`, (err as Error)?.message || err);
      return [];
    }
  }

  /**
   * 4b. Launcher 兼容：与 public/api/player_stats.php 同结构的完整战绩包
   */
  static async getPlayerDetailedStats(userName: string): Promise<any | null> {
    const cleanUser = userName.trim();
    if (!cleanUser) return null;

    // 无档案 / DB 不可用时也返回空骨架，方便 Launcher 用占位动画而不是 404/500
    const profile = (await this.getPlayerProfile(cleanUser)) || this.emptyProfile(cleanUser);

    const wins = profile.wins || 0;
    const losses = profile.losses || 0;
    const escapes = profile.escapes || 0;
    const totalGames = wins + losses + escapes;
    const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 1000) / 10 : 0;
    const escapeRate = totalGames > 0 ? Math.round((escapes / totalGames) * 1000) / 10 : 0;
    const playMins = profile.total_play_time_mins || 0;

    let heroRows: any[] = [];
    try {
      heroRows = await query<any>(
        `SELECT hero_name, games_played, wins, total_kills, total_deaths, total_assists, max_kills, max_duration_secs
         FROM player_hero_stats WHERE userName = ? OR username = ?
         ORDER BY games_played DESC, wins DESC LIMIT 30`,
        [cleanUser, cleanUser]
      );
    } catch {
      heroRows = [];
    }

    const heroes = heroRows.map((hero) => {
      const hGames = Number(hero.games_played || 0);
      const hWins = Number(hero.wins || 0);
      const hDeaths = Math.max(1, Number(hero.total_deaths || 0));
      const hKda = Math.round(((Number(hero.total_kills || 0) + Number(hero.total_assists || 0)) / hDeaths) * 100) / 100;
      const hWinRate = hGames > 0 ? Math.round((hWins / hGames) * 1000) / 10 : 0;
      const winPart = hWinRate * 0.4;
      const kdaPart = (Math.min(hKda, 12) / 12) * 100 * 0.35;
      const gamesPart = (Math.min(hGames, 50) / 50) * 100 * 0.25;
      return {
        name: hero.hero_name,
        games: hGames,
        wins: hWins,
        winRate: hWinRate,
        kda: String(hKda),
        heroScore: Math.round((winPart + kdaPart + gamesPart) * 10) / 10,
        max_kills: Number(hero.max_kills || 0),
        max_duration_secs: Number(hero.max_duration_secs || 0),
      };
    });
    heroes.sort((a, b) => b.heroScore - a.heroScore || b.winRate - a.winRate);

    let modeRows: any[] = [];
    try {
      modeRows = await query<any>(
        `SELECT game_mode, games_played, wins FROM player_mode_stats WHERE userName = ? OR username = ?`,
        [cleanUser, cleanUser]
      );
    } catch {
      modeRows = [];
    }
    const modes: Record<string, { games: number; wins: number; winRate: number }> = {};
    for (const mode of modeRows) {
      const mGames = Number(mode.games_played || 0);
      const mWins = Number(mode.wins || 0);
      modes[mode.game_mode] = {
        games: mGames,
        wins: mWins,
        winRate: mGames > 0 ? Math.round((mWins / mGames) * 1000) / 10 : 0,
      };
    }

    const matches = await this.getPlayerMatches(cleanUser, 15);

    return {
      ladder: {
        score: profile.score,
        rank_level: profile.rank_level,
        rank_name: profile.rank_code,
        total_games: totalGames,
        wins,
        losses,
        draws: 0,
        escapes,
        win_rate: winRate,
        escape_rate: escapeRate,
        kda: String(profile.kda),
        gpm: '0',
        mvps: profile.mvp_count,
        current_streak: profile.current_win_streak,
        max_streak: profile.max_win_streak,
        total_time_mins: playMins,
        total_kills: profile.total_kills,
        total_deaths: profile.total_deaths,
        total_assists: profile.total_assists,
      },
      heroes,
      modes,
      recent_matches: matches,
    };
  }

  /** Launcher user_status.php 兼容：认证 / 素质 */
  static async getUserStatus(userName: string): Promise<any | null> {
    const cleanUser = userName.trim();
    if (!cleanUser) return null;
    try {
      const rows = await query<any>(
        `SELECT is_phone_verified, total_ingame_time, cheat_records_count, report_records_count
         FROM users WHERE username = ? OR userName = ? LIMIT 1`,
        [cleanUser, cleanUser]
      );
      if (!rows || rows.length === 0) {
        // 本地测试账号可能只有 ladder_stats：给可查询的默认态
        return {
          is_phone_verified: false,
          total_ingame_time: 0,
          cheat_records_count: 0,
          report_records_count: 0,
          is_fully_verified: false,
        };
      }
      const u = rows[0];
      const phone = Number(u.is_phone_verified) === 1;
      const mins = Number(u.total_ingame_time || 0);
      return {
        is_phone_verified: phone,
        total_ingame_time: mins,
        cheat_records_count: Number(u.cheat_records_count || 0),
        report_records_count: Number(u.report_records_count || 0),
        is_fully_verified: phone && mins >= 10080,
      };
    } catch {
      return {
        is_phone_verified: false,
        total_ingame_time: 0,
        cheat_records_count: 0,
        report_records_count: 0,
        is_fully_verified: false,
      };
    }
  }

  /**
   * 5. 核心事务落库：幂等防重 + 与 War3Bot 对齐的 Elo/K/KP/MVP/SVP 结算
   */
  static async settleMatch(payload: MatchReportPayload): Promise<{ success: boolean; message: string; data?: any }> {
    const conn = await getConnection();
    try {
      await conn.beginTransaction();

      // A. 事务内幂等：已结算直接返回（SQLite 无 FOR UPDATE）
      const [existingRaw] = await conn.execute(
        useSqlite
          ? 'SELECT match_id FROM matches WHERE match_id = ? LIMIT 1'
          : 'SELECT match_id FROM matches WHERE match_id = ? LIMIT 1 FOR UPDATE',
        [payload.matchId]
      );
      const existingRows = existingRaw as any[];
      if (existingRows && existingRows.length > 0) {
        await conn.commit();
        return { success: true, message: '比赛已被处理过，无需重复结算 (Idempotent OK)' };
      }

      // B. 读取当前积分
      const playerNames = payload.players.map((p) => p.userName);
      const scoreMap = new Map<string, number>();
      if (playerNames.length > 0) {
        const placeholders = playerNames.map(() => '?').join(',');
        const [currentRaw] = await conn.execute(
          `SELECT userName, score FROM ladder_stats WHERE userName IN (${placeholders})`,
          playerNames
        );
        for (const row of currentRaw as any[]) {
          scoreMap.set(row.userName, Number(row.score || 1000));
        }
      }

      // C. 队伍平均分与 Elo 期望
      let sentinelSum = 0;
      let sentinelCount = 0;
      let scourgeSum = 0;
      let scourgeCount = 0;
      let sentinelTotalKills = 0;
      let scourgeTotalKills = 0;

      for (const p of payload.players) {
        const s = scoreMap.get(p.userName) ?? 1000;
        if (p.team === 1) {
          sentinelSum += s;
          sentinelCount++;
          sentinelTotalKills += p.kills;
        } else {
          scourgeSum += s;
          scourgeCount++;
          scourgeTotalKills += p.kills;
        }
      }

      const avgSentinel = sentinelCount > 0 ? sentinelSum / sentinelCount : 1000;
      const avgScourge = scourgeCount > 0 ? scourgeSum / scourgeCount : 1000;
      const expectedSentinel = 1 / (1 + Math.pow(10, (avgScourge - avgSentinel) / 400));
      const expectedScourge = 1 - expectedSentinel;

      type CalcPlayer = PlayerReportItem & {
        isWinner: boolean;
        oldScore: number;
        performanceScore: number;
        deltaScore: number;
        newScore: number;
        isMvp: boolean;
        isSvp: boolean;
      };

      let bestWinnerScore = -1;
      let bestWinnerIdx = -1;
      let bestLoserScore = -1;
      let bestLoserIdx = -1;

      const calculatedPlayers: CalcPlayer[] = payload.players.map((p, idx) => {
        const isWinner = p.team === payload.winnerTeam;
        const oldScore = scoreMap.get(p.userName) ?? 1000;
        const teamKills = p.team === 1 ? sentinelTotalKills : scourgeTotalKills;
        const performanceScore = evaluatePerformance(p, teamKills);

        if (isWinner && performanceScore > bestWinnerScore) {
          bestWinnerScore = performanceScore;
          bestWinnerIdx = idx;
        } else if (!isWinner && !p.isAbandon && performanceScore > bestLoserScore) {
          bestLoserScore = performanceScore;
          bestLoserIdx = idx;
        }

        return {
          ...p,
          isWinner,
          oldScore,
          performanceScore,
          deltaScore: 0,
          newScore: oldScore,
          isMvp: false,
          isSvp: false,
        };
      });

      if (bestWinnerIdx >= 0) calculatedPlayers[bestWinnerIdx].isMvp = true;
      if (bestLoserIdx >= 0) calculatedPlayers[bestLoserIdx].isSvp = true;

      for (const p of calculatedPlayers) {
        if (p.isAbandon) {
          p.deltaScore = -45;
          p.newScore = Math.max(100, p.oldScore - 45);
          continue;
        }

        const kFactor = calculateKFactor(p.oldScore);
        const expectedWinRate = p.team === 1 ? expectedSentinel : expectedScourge;
        const actualResult = p.isWinner ? 1.0 : 0.0;
        let baseDelta = kFactor * (actualResult - expectedWinRate);
        let bonus = 0.0;

        if (p.isWinner) {
          bonus = (p.performanceScore - 6.0) * 0.8;
          if (p.isMvp) bonus += 3.0;
        } else if (p.isSvp) {
          baseDelta *= 0.65; // SVP 免除 35% 掉分
        } else {
          bonus = Math.max(-2.0, (p.performanceScore - 6.0) * 0.5);
        }

        let finalDelta = Math.round(baseDelta + bonus);
        if (p.isWinner) {
          finalDelta = Math.max(8, finalDelta);
        } else {
          finalDelta = Math.min(-8, finalDelta);
        }

        p.deltaScore = finalDelta;
        p.newScore = Math.max(100, p.oldScore + finalDelta);
      }

      const isFrozen = payload.acStatus === 'FROZEN';
      const acStatus = isFrozen ? 'FROZEN' : 'PENDING';

      const storedMode = normalizeGameMode(payload.mode) || 'ap';

      // D. 原子写入 matches / match_results / ladder_stats（冻结局仅归档战绩与证据，不改天梯分）
      const startTime = new Date(Date.now() - payload.durationSeconds * 1000);
      await conn.execute(
        `INSERT INTO matches (match_id, map_name, game_mode, winner_team, start_time, duration_seconds, match_type, ac_status)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          payload.matchId,
          'DotA v6.83d',
          storedMode,
          payload.winnerTeam,
          useSqlite ? startTime.toISOString() : startTime,
          payload.durationSeconds,
          acStatus,
        ]
      );

      for (const p of calculatedPlayers) {
        const appliedDelta = isFrozen ? 0 : p.deltaScore;

        await conn.execute(
          `INSERT INTO match_results (match_id, userName, team_id, is_winner, hero_name, hero_level, kills, deaths, assists,
                                     last_hits, denies, gold_earned, is_mvp, score_point, delta_score)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            payload.matchId,
            p.userName,
            p.team,
            p.isWinner ? 1 : 0,
            p.heroName || p.heroCode,
            25,
            p.kills,
            p.deaths,
            p.assists,
            p.lastHits,
            p.denies,
            p.gold,
            p.isMvp ? 1 : 0,
            p.performanceScore,
            appliedDelta,
          ]
        );

        if (isFrozen) {
          continue;
        }

        const newRank = scoreToRankLevel(p.newScore);
        const winInc = p.isWinner && !p.isAbandon ? 1 : 0;
        const lossInc = !p.isWinner && !p.isAbandon ? 1 : 0;
        const escInc = p.isAbandon ? 1 : 0;
        const mvpInc = p.isMvp ? 1 : 0;
        const playTimeInc = Math.floor(payload.durationSeconds / 60);

        await conn.execute(
          ladderUpsertSql(),
          [
            p.userName,
            p.newScore,
            newRank,
            winInc,
            lossInc,
            escInc,
            p.kills,
            p.deaths,
            p.assists,
            mvpInc,
            winInc,
            winInc,
            playTimeInc,
          ]
        );
      }

      // E. 写入主机随本局上报的实时反作弊证据，并按规则自动建案
      if (payload.acDetections && payload.acDetections.length > 0) {
        await AntiCheatService.recordDetectionsInTx(conn, payload.matchId, payload.acDetections);
      }

      await conn.commit();

      return {
        success: true,
        message: isFrozen ? '比赛命中反作弊强证据，已冻结积分并转入复核队列' : '天梯比赛结算完成并持久化入库',
        data: {
          matchId: payload.matchId,
          winnerTeam: payload.winnerTeam,
          acStatus,
          settledPlayers: calculatedPlayers.map((p) => ({
            userName: p.userName,
            oldScore: p.oldScore,
            deltaScore: isFrozen ? 0 : p.deltaScore,
            newScore: isFrozen ? p.oldScore : p.newScore,
            isMvp: p.isMvp,
            isSvp: p.isSvp,
            performanceScore: p.performanceScore,
          })),
        },
      };
    } catch (err: any) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  private static mapLadderRow(r: any): LadderUserRecord {
    const totalGames = (r.wins || 0) + (r.losses || 0);
    const winRate = totalGames > 0 ? Math.round(((r.wins || 0) / totalGames) * 1000) / 10 : 0;
    const kda =
      (r.total_deaths || 0) > 0
        ? Math.round((((r.total_kills || 0) + (r.total_assists || 0) * 0.7) / r.total_deaths) * 10) / 10
        : (r.total_kills || 0) + (r.total_assists || 0);
    const level = r.rank_level ?? scoreToRankLevel(r.score || 1000);

    return {
      userName: r.userName,
      score: r.score || 1000,
      rank_level: level,
      rank_code: rankLevelToCode(level),
      rank_title: rankLevelToTitle(level),
      wins: r.wins || 0,
      losses: r.losses || 0,
      escapes: r.escapes || 0,
      winRate,
      total_kills: r.total_kills || 0,
      total_deaths: r.total_deaths || 0,
      total_assists: r.total_assists || 0,
      kda,
      mvp_count: r.mvp_count || 0,
      current_win_streak: r.current_win_streak || 0,
      max_win_streak: r.max_win_streak || 0,
      total_play_time_mins: r.total_play_time_mins || 0,
    };
  }
}
