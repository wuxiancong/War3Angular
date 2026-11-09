// Angular 前端天梯网络客户端服务
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';

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

export interface LeaderboardResponse {
  total: number;
  list: LadderUserRecord[];
}

export interface MatchHistoryRecord {
  match_id: number;
  map_name: string;
  game_mode: string;
  winner_team: number;
  start_time: string;
  duration_seconds: number;
  team_id: number;
  is_winner: number;
  hero_name: string;
  kills: number;
  deaths: number;
  assists: number;
  last_hits: number;
  denies: number;
  gold_earned: number;
  is_mvp: number;
  score_point: number;
}

@Injectable({
  providedIn: 'root',
})
export class LadderService {
  private http = inject(HttpClient);
  private readonly baseUrl = '/api/ladder';

  /**
   * 1. 获取玩家天梯档案 (积分、段位称号、胜率、KDA、连胜)
   */
  getPlayerProfile(userName: string): Observable<LadderUserRecord> {
    const params = new HttpParams().set('user', userName);
    return this.http
      .get<{ success: boolean; data: LadderUserRecord }>(`${this.baseUrl}/profile`, { params })
      .pipe(map((res) => res.data));
  }

  /**
   * 2. 获取天梯全服排行榜
   */
  getLeaderboard(limit = 50, page = 1): Observable<LeaderboardResponse> {
    const params = new HttpParams().set('limit', limit).set('page', page);
    return this.http
      .get<{ success: boolean; data: LeaderboardResponse }>(`${this.baseUrl}/leaderboard`, { params })
      .pipe(map((res) => res.data));
  }

  /**
   * 3. 获取玩家近期比赛对局流水
   */
  getPlayerMatches(userName: string, limit = 20): Observable<MatchHistoryRecord[]> {
    const params = new HttpParams().set('user', userName).set('limit', limit);
    return this.http
      .get<{ success: boolean; data: MatchHistoryRecord[] }>(`${this.baseUrl}/matches`, { params })
      .pipe(map((res) => res.data));
  }

  /**
   * 4. 辅助：段位颜色高亮样式
   */
  getRankBadgeColor(level: number): string {
    switch (level) {
      case 7: return '#ef4444'; // 最强王者 SSS - 赤红金
      case 6: return '#f59e0b'; // 超凡大师 SS  - 耀金
      case 5: return '#3b82f6'; // 璀璨钻石 S   - 钻蓝
      case 4: return '#06b6d4'; // 铂金统领 A   - 青绿
      case 3: return '#eab308'; // 黄金勇士 B   - 暗金
      case 2: return '#94a3b8'; // 白银先锋 C   - 银灰
      case 1: return '#b45309'; // 青铜守护 D   - 古铜
      default: return '#64748b';// 见习新手 -   - 暗灰
    }
  }
}

