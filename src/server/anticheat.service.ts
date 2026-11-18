import { getConnection, query, type DbExecutor } from './db.js';
import { scoreToRankLevel } from './ladder.service.js';

export interface AcDetectionInput {
  userName: string;
  layer?: number;
  ruleCode: string;
  severity: number; // 0: 弱, 1: 中, 2: 强
  score: number;
  gameTimeMs: number;
  hitCount?: number;
  detail?: string;
  evidence?: Record<string, unknown>;
}

export interface VerdictRequest {
  verdictId: string;
  matchId: number | string;
  status: 'CHEAT' | 'CLEAN';
  cheaters?: string[]; // status === 'CHEAT' 时生效的作弊玩家列表
  operator?: string;
  reason?: string;
  banDays?: number; // 0: 不封禁, -1: 永久封禁, >0: 临时封禁天数
}

export interface PlayerReportInput {
  matchId: number | string;
  reporter: string;
  target: string;
  category: 'MAPHACK' | 'SCRIPT' | 'FEED' | 'AFK' | 'OTHER';
  detail?: string;
}

/**
 * 反外挂核心服务（War3Angular 侧）
 * 负责：L2/L3 证据落库、案件生成、判挂原子回滚与受害者补偿、信誉分调整、玩家举报
 */
export class AntiCheatService {
  /**
   * 在结算事务内写入检测命中，并按需自动建案进入复核队列
   */
  static async recordDetectionsInTx(
    conn: DbExecutor,
    matchId: number | string,
    detections: AcDetectionInput[]
  ): Promise<void> {
    if (!detections || detections.length === 0) return;

    // 按玩家汇总风险分：强证据直接建案，中/弱证据超过阈值建案
    const riskByUser = new Map<string, { score: number; hasStrongOrMedium: boolean }>();

    for (const d of detections) {
      if (!d.userName || !d.ruleCode) continue;
      const evidenceObj = d.evidence || (d.detail ? { detail: d.detail } : null);

      await conn.execute(
        `INSERT INTO ac_detections (match_id, user_name, layer, rule_code, severity, score, game_time_ms, hit_count, evidence)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          matchId,
          d.userName,
          d.layer ?? 2,
          d.ruleCode,
          d.severity ?? 0,
          d.score ?? 0,
          d.gameTimeMs ?? 0,
          d.hitCount ?? 1,
          evidenceObj ? JSON.stringify(evidenceObj) : null,
        ]
      );

      const prev = riskByUser.get(d.userName) || { score: 0, hasStrongOrMedium: false };
      prev.score = Math.min(100, prev.score + (d.score || 0));
      if ((d.severity ?? 0) >= 1) {
        prev.hasStrongOrMedium = true;
      }
      riskByUser.set(d.userName, prev);
    }

    for (const [userName, info] of riskByUser.entries()) {
      if (!info.hasStrongOrMedium && info.score < 70) continue;
      await conn.execute(
        `INSERT INTO ac_cases (match_id, user_name, risk_score, status)
         VALUES (?, ?, ?, 'OPEN')
         ON DUPLICATE KEY UPDATE risk_score = GREATEST(risk_score, VALUES(risk_score))`,
        [matchId, userName, info.score]
      );
    }
  }

  /**
   * 判决执行接口（幂等 + 单事务原子回滚与受害者补偿）
   * - CHEAT：作弊者撤销本局正收益并额外扣 30 分、清零连胜、降信誉分，可选封禁；
   *          对手方本局扣分全额返还；队友不受连坐。
   * - CLEAN：将比赛与案件标记为 CLEAN（若原为 FROZEN，人工/后台可随后触发正常结算）。
   */
  static async applyVerdict(req: VerdictRequest): Promise<{
    success: boolean;
    message: string;
    rolledBackCheaters?: string[];
    compensatedPlayers?: Array<{ userName: string; refund: number }>;
  }> {
    if (!req.verdictId || !req.matchId || (req.status !== 'CHEAT' && req.status !== 'CLEAN')) {
      throw new Error('缺少必需的判决参数 (verdictId, matchId, status)');
    }

    const conn = await getConnection();
    try {
      await conn.beginTransaction();

      // 1. 幂等检查：相同 verdictId 已处理则直接返回
      const [existingVerdicts] = await conn.execute(
        'SELECT verdict_id FROM ac_verdicts WHERE verdict_id = ? LIMIT 1 FOR UPDATE',
        [req.verdictId]
      );
      if ((existingVerdicts as any[]).length > 0) {
        await conn.commit();
        return { success: true, message: '判决已处理过 (Idempotent OK)' };
      }

      // 2. 锁定比赛主记录
      const [matchRowsRaw] = await conn.execute(
        'SELECT match_id, ac_status FROM matches WHERE match_id = ? LIMIT 1 FOR UPDATE',
        [req.matchId]
      );
      const matchRows = matchRowsRaw as any[];
      if (matchRows.length === 0) {
        throw new Error(`未找到比赛记录 matchId=${req.matchId}`);
      }

      const operator = (req.operator || 'system').slice(0, 32);
      const reason = (req.reason || '').slice(0, 255);

      await conn.execute(
        `INSERT INTO ac_verdicts (verdict_id, match_id, status, operator, reason) VALUES (?, ?, ?, ?, ?)`,
        [req.verdictId, req.matchId, req.status, operator, reason]
      );

      if (req.status === 'CLEAN') {
        await conn.execute(`UPDATE matches SET ac_status = 'CLEAN' WHERE match_id = ?`, [req.matchId]);
        await conn.execute(
          `UPDATE ac_cases SET status = 'CLEAN', verdict_by = ?, verdict_at = NOW(), note = ? WHERE match_id = ?`,
          [operator, reason, req.matchId]
        );
        await conn.commit();
        return { success: true, message: '已确认比赛干净 (CLEAN)' };
      }

      // ---- status === 'CHEAT'：回滚作弊者并补偿对手 ----
      const cheaterSet = new Set((req.cheaters || []).map((u) => u.trim()).filter(Boolean));
      if (cheaterSet.size === 0) {
        throw new Error('判定 CHEAT 时必须指定至少一名作弊玩家 (cheaters)');
      }

      const [mrRowsRaw] = await conn.execute(
        `SELECT userName, team_id, delta_score FROM match_results WHERE match_id = ?`,
        [req.matchId]
      );
      const mrRows = mrRowsRaw as any[];

      // 找出作弊者所在队伍，对手方才享受失分返还（队友不连坐、也不白嫖返还）
      const cheaterTeams = new Set<number>();
      for (const r of mrRows) {
        if (cheaterSet.has(r.userName)) {
          cheaterTeams.add(Number(r.team_id));
        }
      }

      const rolledBackCheaters: string[] = [];
      const compensatedPlayers: Array<{ userName: string; refund: number }> = [];

      for (const r of mrRows) {
        const userName: string = r.userName;
        const delta = Number(r.delta_score || 0);
        const teamId = Number(r.team_id);

        if (cheaterSet.has(userName)) {
          // 撤销正收益 + 额外惩罚 30 分
          const revert = delta > 0 ? delta : 0;
          const totalDeduction = revert + 30;
          await this.adjustPlayerScoreInTx(conn, userName, -totalDeduction, true, -25);
          rolledBackCheaters.push(userName);

          // 写入/更新案件与封禁记录
          await conn.execute(
            `INSERT INTO ac_cases (match_id, user_name, risk_score, status, verdict_by, verdict_at, note)
             VALUES (?, ?, 100, 'CHEAT', ?, NOW(), ?)
             ON DUPLICATE KEY UPDATE status = 'CHEAT', verdict_by = VALUES(verdict_by), verdict_at = NOW(), note = VALUES(note)`,
            [req.matchId, userName, operator, reason]
          );

          const banDays = req.banDays ?? 7;
          if (banDays !== 0) {
            const expiresExpr = banDays < 0 ? null : new Date(Date.now() + banDays * 86400 * 1000);
            await conn.execute(
              `INSERT INTO ac_bans (target_type, target, reason, expires_at) VALUES ('ACCOUNT', ?, ?, ?)`,
              [userName, reason || `match:${req.matchId} CHEAT`, expiresExpr]
            );
          }
        } else if (!cheaterTeams.has(teamId) && delta < 0) {
          // 对手方受害者：全额返还本局扣分
          const refund = -delta;
          await this.adjustPlayerScoreInTx(conn, userName, refund, false, 0);
          compensatedPlayers.push({ userName, refund });
        }
      }

      await conn.execute(`UPDATE matches SET ac_status = 'CHEAT' WHERE match_id = ?`, [req.matchId]);
      await conn.commit();

      return {
        success: true,
        message: '判挂执行完成：作弊者已回滚惩罚，对手已补偿',
        rolledBackCheaters,
        compensatedPlayers,
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * 事务内调整玩家天梯分、段位、连胜与信誉分
   */
  private static async adjustPlayerScoreInTx(
    conn: DbExecutor,
    userName: string,
    scoreDelta: number,
    resetStreak: boolean,
    trustDelta: number
  ): Promise<void> {
    const [rowsRaw] = await conn.execute(
      `SELECT score, trust_score FROM ladder_stats WHERE userName = ? LIMIT 1 FOR UPDATE`,
      [userName]
    );
    const rows = rowsRaw as any[];
    if (rows.length === 0) return;

    const oldScore = Number(rows[0].score || 1000);
    const newScore = Math.max(100, oldScore + scoreDelta);
    const newRank = scoreToRankLevel(newScore);
    const oldTrust = Number(rows[0].trust_score ?? 60);
    const newTrust = Math.max(0, Math.min(100, oldTrust + trustDelta));

    await conn.execute(
      `UPDATE ladder_stats
       SET score = ?, rank_level = ?, trust_score = ?,
           current_win_streak = IF(?, 0, current_win_streak)
       WHERE userName = ?`,
      [newScore, newRank, newTrust, resetStreak ? 1 : 0, userName]
    );
  }

  /**
   * 玩家举报入口：仅记录弱信号并小幅累计风险分，不能单独定罪
   */
  static async submitPlayerReport(input: PlayerReportInput): Promise<{ success: boolean }> {
    const matchId = Number(input.matchId);
    const target = (input.target || '').trim();
    const reporter = (input.reporter || '').trim();
    if (!matchId || !target || !reporter || target === reporter) {
      throw new Error('举报参数无效');
    }

    await query(
      `INSERT INTO ac_detections (match_id, user_name, layer, rule_code, severity, score, game_time_ms, hit_count, evidence)
       VALUES (?, ?, 4, ?, 0, 15, 0, 1, ?)`,
      [
        matchId,
        target,
        `REPORT_${input.category || 'OTHER'}`,
        JSON.stringify({ reporter, detail: (input.detail || '').slice(0, 200) }),
      ]
    );
    return { success: true };
  }

  /**
   * 复核后台：按风险分查询待审/历史案件
   */
  static async listCases(status = 'OPEN', limit = 50): Promise<any[]> {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    return await query<any>(
      `SELECT c.id, c.match_id, c.user_name, c.risk_score, c.status, c.verdict_by, c.verdict_at, c.note, c.created_at,
              m.ac_status, m.duration_seconds, m.start_time
       FROM ac_cases c
       LEFT JOIN matches m ON c.match_id = m.match_id
       WHERE c.status = ?
       ORDER BY c.risk_score DESC, c.created_at DESC
       LIMIT ?`,
      [status, safeLimit]
    );
  }
}

