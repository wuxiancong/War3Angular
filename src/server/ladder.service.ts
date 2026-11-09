import { pool, query } from './db.js';

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
   * 1. 验证上报比赛合法性 (数据防伪、时长合规、人头守恒)
   */
  static validateMatchIntegrity(payload: MatchReportPayload): { valid: boolean; reason?: string } {
    if (!payload.matchId || !payload.players || payload.players.length === 0) {
      return { valid: false, reason: '比赛ID或玩家列表不能为空' };
    }
    if (payload.winnerTeam !== 1 && payload.winnerTeam !== 2) {
      return { valid: false, reason: '胜利方队伍参数非法 (必须为 1:近卫 或 2:天灾)' };
    }
    if (payload.durationSeconds < 180) {
      return { valid: false, reason: '比赛时长过短 (小于3分钟)，判定为无效局不计入天梯积分' };
    }

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

    if (Math.abs(sentinelKills - scourgeDeaths) > 10 || Math.abs(scourgeKills - sentinelDeaths) > 10) {
      return { valid: false, reason: '战斗数据不符合人头守恒定律，涉嫌伪造注入' };
    }

    return { valid: true };
  }

  /**
   * 2. 查询玩家天梯档案
   */
  static async getPlayerProfile(userName: string): Promise<LadderUserRecord | null> {
    const cleanUser = userName.trim();
    if (!cleanUser) return null;

    const rows = await query<any>(
      `SELECT userName, score, rank_level, wins, losses, escapes, total_kills, total_deaths,
              total_assists, mvp_count, current_win_streak, max_win_streak, total_play_time_mins
       FROM ladder_stats WHERE userName = ? LIMIT 1`,
      [cleanUser]
    );

    if (!rows || rows.length === 0) {
      return {
        userName: cleanUser,
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

    return this.mapLadderRow(rows[0]);
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
  }

  /**
   * 5. 核心事务落库：幂等防重 + 与 War3Bot 对齐的 Elo/K/KP/MVP/SVP 结算
   */
  static async settleMatch(payload: MatchReportPayload): Promise<{ success: boolean; message: string; data?: any }> {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // A. 事务内幂等：已结算直接返回
      const [existingRaw] = await conn.execute(
        'SELECT match_id FROM matches WHERE match_id = ? LIMIT 1 FOR UPDATE',
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

      // D. 原子写入 matches / match_results / ladder_stats
      await conn.execute(
        `INSERT INTO matches (match_id, map_name, game_mode, winner_team, start_time, duration_seconds, match_type)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [
          payload.matchId,
          'DotA v6.83d',
          payload.mode || 'ap',
          payload.winnerTeam,
          new Date(Date.now() - payload.durationSeconds * 1000),
          payload.durationSeconds,
        ]
      );

      for (const p of calculatedPlayers) {
        await conn.execute(
          `INSERT INTO match_results (match_id, userName, team_id, is_winner, hero_name, hero_level, kills, deaths, assists,
                                     last_hits, denies, gold_earned, is_mvp, score_point)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          ]
        );

        const newRank = scoreToRankLevel(p.newScore);
        const winInc = p.isWinner && !p.isAbandon ? 1 : 0;
        const lossInc = !p.isWinner && !p.isAbandon ? 1 : 0;
        const escInc = p.isAbandon ? 1 : 0;
        const mvpInc = p.isMvp ? 1 : 0;
        const playTimeInc = Math.floor(payload.durationSeconds / 60);

        await conn.execute(
          `INSERT INTO ladder_stats (userName, score, rank_level, wins, losses, escapes, total_kills, total_deaths,
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
             total_play_time_mins = total_play_time_mins + VALUES(total_play_time_mins)`,
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

      await conn.commit();

      return {
        success: true,
        message: '天梯比赛结算完成并持久化入库',
        data: {
          matchId: payload.matchId,
          winnerTeam: payload.winnerTeam,
          settledPlayers: calculatedPlayers.map((p) => ({
            userName: p.userName,
            oldScore: p.oldScore,
            deltaScore: p.deltaScore,
            newScore: p.newScore,
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
