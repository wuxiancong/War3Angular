import { Component, signal, ElementRef, viewChild, inject, PLATFORM_ID, afterNextRender, effect, computed } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { NgClass } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import * as d3 from 'd3';

interface HeroStat {
  name: string;
  games: number;
  wins: number;
  winRate: number;
  kda: number;
}

interface Ranking {
  rank: number;
  name: string;
  score: number;
  country: string;
  isCurrent?: boolean;
}

interface ModeStat {
  label: string;
  value: number;
  color: string;
}

interface TrendData {
  x: number;
  y: number;
}

interface GameRecord {
  hero: string;
  mode: string;
  duration: string;
  kda: string;
  change: number;
}

@Component({
  selector: 'app-stats',
  standalone: true,
  imports: [TranslatePipe, NgClass],
  host: { class: 'flex flex-col flex-grow' },
  template: `
    <main class="flex-grow py-8 px-4 md:px-8 bg-transparent text-[var(--text-main)]">
      <div class="max-w-7xl mx-auto space-y-8">
        
        <!-- Header -->
        <div class="flex items-center justify-between">
            <h1 class="text-2xl md:text-3xl font-black italic text-accent tracking-tighter uppercase">
                {{ 'matches.title' | t }} - Bimawen
            </h1>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            <!-- Left Column -->
            <div class="lg:col-span-2 space-y-8">
                <!-- 1. Basic Stats Card (560px) -->
                <div class="bg-[var(--card-bg)] backdrop-blur-md rounded-xl p-6 border border-[var(--border)] shadow-xl flex flex-col h-[560px]">
                    <h2 class="text-lg font-bold text-accent italic uppercase tracking-wider mb-6 flex items-center gap-2">
                        <span class="material-icons text-sm">analytics</span>
                        {{ 'matches.overview' | t }}
                    </h2>
                    
                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 flex-grow content-center">
                        @for (stat of basicStats(); track stat.key) {
                            <div class="group bg-[var(--primary)]/50 py-4 px-2 rounded-lg border border-[var(--border)] hover:border-accent/30 transition-all duration-300 text-center flex flex-col justify-center min-w-0">
                                <div class="text-lg mb-1">{{ stat.icon }}</div>
                                <div class="text-[9px] text-[var(--text-muted)] uppercase tracking-tight mb-1 truncate w-full" [title]="'matches.' + stat.key | t">{{ 'matches.' + stat.key | t }}</div>
                                <div class="text-sm sm:text-base font-black truncate w-full tabular-nums flex items-center justify-center gap-1" [style.color]="stat.color">
                                    @if (stat.key === 'quality' || stat.key === 'verification') {
                                        {{ 'matches.' + stat.value | t }}
                                    } @else if (stat.key === 'onlineTime') {
                                        {{ stat.value }}<span class="text-[10px] font-normal opacity-70">{{ 'matches.hoursUnit' | t }}</span>
                                    } @else {
                                        {{ stat.value }}
                                    }
                                </div>
                            </div>
                        }
                    </div>
                </div>

                <!-- 2. Recent Win Rate Trend (260px) -->
                <div class="bg-[var(--card-bg)] backdrop-blur-md rounded-xl p-6 border border-[var(--border)] shadow-xl h-[260px] flex flex-col">
                    <h2 class="text-lg font-bold text-accent italic uppercase tracking-wider mb-4 flex items-center gap-2">
                        <span class="material-icons text-sm">trending_up</span>
                        {{ 'matches.trend' | t }}
                    </h2>
                    <div #trendChart class="w-full flex-grow relative overflow-hidden">
                        <!-- D3 Chart will be rendered here -->
                    </div>
                </div>

                <!-- 3. Best Heroes (380px) -->
                <div class="bg-[var(--card-bg)] backdrop-blur-md rounded-xl p-6 border border-[var(--border)] shadow-xl h-auto lg:h-[380px] flex flex-col">
                    <h2 class="text-lg font-bold text-accent italic uppercase tracking-wider mb-6 flex items-center gap-2">
                        <span class="material-icons text-sm">stars</span>
                        {{ 'matches.bestHeroes' | t }}
                    </h2>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-grow">
                        @for (hero of bestHeroes(); track hero.name; let i = $index) {
                            <div class="group bg-[var(--primary)]/50 p-3 rounded-xl border border-[var(--border)] hover:border-accent/30 transition-all duration-500 relative overflow-hidden text-center flex flex-col justify-center">
                                <!-- Rank Badge -->
                                <div class="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold border-2 border-[var(--secondary)]"
                                     [ngClass]="{
                                         'bg-yellow-500 text-black': i === 0,
                                         'bg-gray-300 text-black': i === 1,
                                         'bg-orange-600 text-white': i === 2
                                     }">
                                    {{ i + 1 }}
                                </div>

                                <div class="w-10 h-10 mx-auto rounded-full bg-white/5 border-2 border-accent/20 flex items-center justify-center mb-1 group-hover:scale-110 transition-transform relative overflow-hidden shrink-0">
                                    <span class="text-base font-black italic text-accent absolute">{{ hero.name.charAt(0) }}</span>
                                    <img [src]="'assets/images/heroes/' + hero.name + '.png'" 
                                         (error)="img.style.display='none'" 
                                         #img
                                         alt="{{hero.name}}" 
                                         class="w-full h-full object-cover relative z-10">
                                </div>
                                <h3 class="text-sm font-bold text-[var(--text-main)] mb-1">{{ 'heroNames.' + hero.name | t }}</h3>
                                <div class="text-[10px] text-[var(--text-muted)] mb-1">{{ hero.games }} {{ 'matches.gamesUnit' | t }}</div>
                                <div class="text-base font-black text-green-400 mb-1">{{ hero.winRate }}%</div>
                                <div class="text-[9px] text-accent/80 font-mono uppercase tracking-widest">KDA: {{ hero.kda }}</div>
                            </div>
                        }
                    </div>
                </div>

                <!-- 4. Last Five Games (480px) -->
                <div class="bg-[var(--card-bg)] backdrop-blur-md rounded-xl p-6 border border-[var(--border)] shadow-xl h-auto lg:h-[480px] flex flex-col">
                    <h2 class="text-lg font-bold text-accent italic uppercase tracking-wider mb-6 flex items-center gap-2">
                        <span class="material-icons text-sm">history</span>
                        {{ 'matches.lastGames' | t }}
                    </h2>
                    <div class="flex-grow overflow-x-auto">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="text-[10px] uppercase text-[var(--text-muted)] border-b border-white/5">
                                    <th class="py-2 w-[30%]">{{ 'matches.hero' | t }}</th>
                                    <th class="py-2 w-[15%]">{{ 'matches.mode' | t }}</th>
                                    <th class="py-2 w-[15%]">{{ 'matches.duration' | t }}</th>
                                    <th class="py-2 w-[25%]">K / D / A</th>
                                    <th class="py-2 w-[15%]">{{ 'matches.change' | t }}</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-white/5">
                                @for (game of lastFiveGames(); track $index) {
                                    <tr class="text-sm">
                                        <td class="py-3.5">
                                            <div class="flex items-center gap-3">
                                                <div class="w-10 h-10 rounded-full bg-[var(--card-bg)] border border-accent/50 flex items-center justify-center relative overflow-hidden shrink-0">
                                                    <span class="text-base font-black italic text-accent absolute">{{ game.hero.charAt(0) }}</span>
                                                    <img [src]="'assets/images/heroes/' + game.hero + '.png'" 
                                                         (error)="img.style.display='none'" 
                                                         #img
                                                         alt="{{game.hero}}" 
                                                         class="w-full h-full object-cover relative z-10">
                                                </div>
                                                <span class="font-bold text-[var(--text-main)]">{{ 'heroNames.' + game.hero | t }}</span>
                                            </div>
                                        </td>
                                        <td class="py-3.5 text-[var(--text-muted)]">{{ game.mode }}</td>
                                        <td class="py-3.5">{{ game.duration }}</td>
                                        <td class="py-3.5 text-accent font-mono">{{ game.kda }}</td>
                                        <td class="py-3.5 font-bold" [ngClass]="game.change > 0 ? 'text-green-400' : 'text-red-400'">
                                            {{ game.change > 0 ? '+' : '' }}{{ game.change }}
                                        </td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Right Column -->
            <div class="lg:col-span-1 space-y-8">
                <!-- 5. Mode Distribution (560px) -->
                <div class="bg-[var(--card-bg)] backdrop-blur-md rounded-xl p-6 border border-[var(--border)] shadow-xl h-[560px] flex flex-col">
                    <h2 class="text-lg font-bold text-accent italic uppercase tracking-wider mb-6 flex items-center gap-2">
                        <span class="material-icons text-sm">pie_chart</span>
                        {{ 'matches.distribution' | t }}
                    </h2>
                    <div class="flex flex-col items-center flex-grow justify-center">
                        <div #pieChart class="w-full h-[200px] relative">
                            <!-- D3 Pie Chart will be rendered here -->
                        </div>
                        <div class="grid grid-cols-2 gap-x-8 gap-y-2 mt-4 w-full">
                            @for (mode of modeStats(); track mode.label) {
                                <div class="flex items-center justify-between text-[10px] cursor-pointer transition-all duration-300"
                                     (mouseenter)="hoveredMode.set(mode.label)"
                                     (mouseleave)="hoveredMode.set(null)"
                                     [class.opacity-50]="hoveredMode() && hoveredMode() !== mode.label">
                                    <div class="flex items-center gap-2">
                                        <div class="w-2 h-2 rounded-full transition-all duration-500" 
                                             [style.background-color]="mode.color"
                                             [style.transform]="hoveredMode() === mode.label ? 'scale(2)' : 'scale(1)'"></div>
                                        <span class="text-[var(--text-muted)] uppercase px-1.5 py-0.5 rounded transition-all duration-300"
                                              [class.bg-[var(--primary)]]="hoveredMode() === mode.label"
                                              [class.text-accent]="hoveredMode() === mode.label">
                                            {{ mode.label }}
                                        </span>
                                    </div>
                                    <span class="font-mono text-[var(--text-main)] transition-all duration-300"
                                          [class.text-accent]="hoveredMode() === mode.label"
                                          [class.font-bold]="hoveredMode() === mode.label">
                                        {{ mode.value }}
                                    </span>
                                </div>
                            }
                        </div>
                    </div>
                </div>

                <!-- 6. Season Rankings (672px) -->
                <div class="bg-[var(--card-bg)] backdrop-blur-md rounded-xl p-6 border border-[var(--border)] shadow-xl h-[672px] flex flex-col">
                    <div class="flex items-center justify-between mb-6">
                        <h2 class="text-lg font-bold text-accent italic uppercase tracking-wider flex items-center gap-2">
                            <span class="material-icons text-sm">leaderboard</span>
                            {{ 'matches.topRankings' | t }}
                        </h2>
                        <select [value]="rankingType()" (change)="onRankingTypeChange($event)" 
                                class="bg-[var(--secondary)] border border-[var(--border)] text-[var(--text-main)] text-xs rounded-lg px-2 py-1 outline-none focus:border-accent">
                            <option value="solo">{{ 'matches.solo' | t }}</option>
                            <option value="team">{{ 'matches.team' | t }}</option>
                        </select>
                    </div>
                    
                    <div class="space-y-1 flex-grow overflow-hidden">
                        @for (rank of seasonRankings(); track rank.name) {
                            <div class="flex items-center gap-3 p-2 rounded-lg border transition-all h-[48px]"
                                 [ngClass]="{
                                     'bg-accent border-accent/50 text-[var(--text-inverted)]': rank.isCurrent,
                                     'bg-[var(--primary)]/50 border-[var(--border)] text-[var(--text-muted)]': !rank.isCurrent
                                 }">
                                <div class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                                     [ngClass]="{
                                         'bg-yellow-500 text-black': rank.rank === 1,
                                         'bg-gray-300 text-black': rank.rank === 2,
                                         'bg-orange-600 text-white': rank.rank === 3,
                                         'bg-[var(--secondary)] text-[var(--text-muted)]': rank.rank > 3 && !rank.isCurrent,
                                         'bg-black/20 text-[var(--text-inverted)]': rank.isCurrent && rank.rank > 3
                                     }">
                                    {{ rank.rank }}
                                </div>
                                <div class="w-6 h-4 shrink-0 rounded-[2px] overflow-hidden border border-white/10 relative shadow-sm">
                                    <img [src]="'https://flagcdn.com/w20/' + rank.country.toLowerCase() + '.png'" 
                                         [alt]="rank.country"
                                         class="w-full h-full object-cover">
                                </div>
                                <span class="text-xs font-bold truncate flex-grow" [class.text-[var(--text-main)]]="!rank.isCurrent">{{ rank.name }}</span>
                                <span class="font-mono text-[10px] font-bold" [class.text-accent]="!rank.isCurrent">{{ rank.score }}</span>
                            </div>
                        }
                    </div>
                </div>

                <!-- 7. Top Heroes Stats (480px) -->
                <div class="bg-[var(--card-bg)] backdrop-blur-md rounded-xl p-6 border border-[var(--border)] shadow-xl h-auto lg:h-[480px] flex flex-col">
                    <h2 class="text-lg font-bold text-accent italic uppercase tracking-wider mb-6 flex items-center gap-2">
                        <span class="material-icons text-sm">emoji_events</span>
                        {{ 'matches.bestHero' | t }}
                    </h2>
                    <div class="grid grid-cols-2 gap-2.5 flex-grow">
                        @for (record of topRecords(); track record.key) {
                            <div class="bg-[var(--secondary)] rounded-md border border-[var(--border)] flex items-center p-2.5 gap-3">
                                <!-- 英雄头像占位 (圆形 + 首字) -->
                                <div class="w-10 h-10 rounded-full bg-[var(--card-bg)] border border-accent/50 flex items-center justify-center relative shrink-0">
                                    <div class="w-full h-full rounded-full overflow-hidden relative flex items-center justify-center">
                                        <span class="text-[var(--text-main)] font-bold text-base absolute">{{ record.hero.charAt(0) }}</span>
                                        <img [src]="'assets/images/heroes/' + record.hero + '.png'" 
                                             (error)="img.style.display='none'" 
                                             #img
                                             alt="{{record.hero}}" 
                                             class="w-full h-full object-cover relative z-10">
                                    </div>
                                    <!-- 右下角小图标 -->
                                    <span class="absolute -bottom-0.5 -right-0.5 text-xs z-20 drop-shadow-md">{{ record.icon }}</span>
                                </div>

                                <div class="flex flex-col justify-center min-w-0 flex-grow gap-0.5">
                                    <div class="text-[10px] text-[var(--text-muted)]">{{ 'matches.' + record.key | t }}</div>
                                    <div class="text-[13px] font-bold text-[var(--text-main)] truncate w-full">{{ 'heroNames.' + record.hero | t }}</div>
                                    <div class="text-[11px] font-bold text-accent">{{ 'matches.' + record.labelKey | t }}: {{ record.value }}</div>
                                </div>
                            </div>
                        }
                    </div>
                </div>
            </div>
        </div>
      </div>
    </main>
  `
})
export class StatsComponent {
  private platformId = inject(PLATFORM_ID);
  private http = inject(HttpClient);
  
  trendChartEl = viewChild<ElementRef>('trendChart');
  pieChartEl = viewChild<ElementRef>('pieChart');
  hoveredMode = signal<string | null>(null);
  rankingType = signal<'solo' | 'team'>('solo');

  basicStats = signal([
    { icon: '🏆', key: 'rank', value: '#156', color: '#f59e0b' },
    { icon: '⭐', key: 'score', value: '2456', color: '#66fcf1' },
    { icon: '📈', key: 'winRate', value: '58.3%', color: '#10b981' },
    { icon: '⚔️', key: 'kda', value: '342/156/278', color: '#c5c6c7' },
    { icon: '💰', key: 'gpm', value: '150', color: '#45a29e' },
    { icon: '👑', key: 'mvp', value: '42', color: '#fbbf24' },
    { icon: '🎖️', key: 'level', value: 'S+', color: '#45a29e' },
    { icon: '🏃', key: 'leaver', value: '2', color: '#ef4444' },
    { icon: '🎮', key: 'totalGames', value: '456', color: '#c5c6c7' },
    { icon: '🔥', key: 'maxWinStreak', value: '8', color: '#10b981' },
    { icon: '⚡', key: 'currentWinStreak', value: '3', color: '#10b981' },
    { icon: '⏰', key: 'onlineTime', value: '172', color: '#45a29e' },
    { icon: '🛡️', key: 'quality', value: 'excellent', color: '#10b981' },
    { icon: '🚫', key: 'violations', value: '0', color: '#ef4444' },
    { icon: '📢', key: 'reports', value: '1', color: '#f59e0b' },
    { icon: '✅', key: 'verification', value: 'verified', color: '#10b981' },
  ]);

  bestHeroes = signal<HeroStat[]>([
    { name: 'juggernaut', games: 45, wins: 28, winRate: 62.2, kda: 4.5 },
    { name: 'demonHunter', games: 38, wins: 24, winRate: 63.2, kda: 5.2 },
    { name: 'deathKnight', games: 42, wins: 25, winRate: 59.5, kda: 3.8 },
  ]);

  modeStats = signal([
    { label: 'AR83TB', value: 85, color: '#FF6B6B' },
    { label: 'SD83TB', value: 62, color: '#4ECDC4' },
    { label: 'RD83TB', value: 45, color: '#45B7D1' },
    { label: 'AP83TB', value: 38, color: '#96CEB4' },
    { label: 'XL83TB', value: 25, color: '#FFEAA7' },
    { label: 'AP', value: 20, color: '#DDA0DD' },
    { label: 'CM', value: 15, color: '#98D8C8' },
    { label: 'RD', value: 12, color: '#F7DC6F' },
    { label: 'SD', value: 10, color: '#BB8FCE' },
    { label: 'AR', value: 8, color: '#85C1E9' },
    { label: 'XL', value: 5, color: '#F8C471' },
  ]);

  soloPlayers: Ranking[] = [
    { rank: 1, name: "Sky", score: 3256, country: "CN" },
    { rank: 2, name: "Moon", score: 3189, country: "KR" },
    { rank: 3, name: "Grubby", score: 3124, country: "EU" },
    { rank: 156, name: "Bimawen", score: 2456, country: "CN", isCurrent: true },
    { rank: 4, name: "Lyn", score: 3087, country: "KR" },
    { rank: 5, name: "TH000", score: 3056, country: "CN" },
    { rank: 6, name: "Top1RusYA", score: 3015, country: "RU" },
    { rank: 7, name: "AMIR0V", score: 2989, country: "KZ" },
    { rank: 8, name: "Martlnez", score: 2974, country: "TR" },
    { rank: 9, name: "Tommy", score: 2900, country: "US" },
    { rank: 10, name: "Immensely-S", score: 2880, country: "JP" }
  ];

  teamPlayers: Ranking[] = [
    { rank: 1, name: "World Elite (WE)", score: 8940, country: "CN" },
    { rank: 2, name: "Mouz Esports", score: 8720, country: "EU" },
    { rank: 3, name: "KSV_NV", score: 8550, country: "KR" },
    { rank: 12, name: "My_Team_Alpha", score: 5600, country: "CN", isCurrent: true },
    { rank: 4, name: "Team Liquid", score: 8400, country: "US" },
    { rank: 5, name: "Newbee", score: 8210, country: "CN" },
    { rank: 6, name: "Infi_Fanclub", score: 7900, country: "CN" },
    { rank: 7, name: "Russia_United", score: 7750, country: "RU" },
    { rank: 8, name: "Sk-Gaming", score: 7600, country: "EU" },
    { rank: 9, name: "Top_Guns", score: 7420, country: "US" },
    { rank: 10, name: "Golden_Viper", score: 7300, country: "KR" }
  ];

  seasonRankings = computed(() => {
    const players = this.rankingType() === 'solo' ? this.soloPlayers : this.teamPlayers;
    
    // Get top 3
    const top3 = players.filter(p => p.rank <= 3).sort((a, b) => a.rank - b.rank);
    
    // Get current player
    const current = players.find(p => p.isCurrent);
    
    // Get others (rank > 3 and not current)
    const others = players.filter(p => p.rank > 3 && !p.isCurrent)
                         .sort((a, b) => a.rank - b.rank)
                         .slice(0, 7); // Take 7 to make it 11 total if current is present
    
    const result = [...top3];
    if (current) {
      result.push(current);
    }
    result.push(...others);
    
    return result;
  });

  lastFiveGames = signal<GameRecord[]>([
    { hero: "nerubianAssassin", mode: "xl, TB", duration: "28:45", kda: "7 / 3 / 21", change: 148 },
    { hero: "riki", mode: "xl, TB", duration: "28:46", kda: "4 / 6 / 10", change: -41 },
    { hero: "antiMage", mode: "xl, TB", duration: "43:12", kda: "9 / 2 / 4", change: 251 },
    { hero: "tidehunter", mode: "xl, TB", duration: "39:17", kda: "4 / 4 / 19", change: 246 },
    { hero: "phantomAssassin", mode: "ar, TB", duration: "27:01", kda: "5 / 5 / 3", change: -28 }
  ]);

  topRecords = signal<{ key: string; hero: string; value: string; labelKey: string; icon: string; }[]>([
    { key: "mostShowy", hero: "lich", value: "18.5", labelKey: "coolFactor", icon: "👑" },
    { key: "bestKills", hero: "skeletonKing", value: "22", labelKey: "avgKills", icon: "⚔️" },
    { key: "bestAssists", hero: "skeletonKing", value: "31", labelKey: "avgAssists", icon: "🤝" },
    { key: "longestTime", hero: "skeletonKing", value: "66:22", labelKey: "gameDuration", icon: "⏰" },
    { key: "bestDev", hero: "phantomAssassin", value: "436", labelKey: "lastHits", icon: "💰" },
    { key: "mostTowers", hero: "phantomAssassin", value: "13", labelKey: "denies", icon: "🏰" }
  ]);

  recentGames = [1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 1, 0, 1];

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      const username = 'Bimawen'; // 实际应用中应从登录信息中获取
      this.http.get<{success: boolean, data: {
        is_phone_verified: boolean;
        total_ingame_time: number;
        cheat_records_count: number;
        report_records_count: number;
        is_fully_verified: boolean;
      }}>(`/api/user_status.php?username=${username}`).subscribe({
        next: (res) => {
          if (res.success) {
            this.basicStats.update(stats => {
              const newStats = [...stats];
              const timeIdx = newStats.findIndex(s => s.key === 'onlineTime');
              if (timeIdx !== -1) {
                newStats[timeIdx].value = Math.round(res.data.total_ingame_time / 60).toString();
              }
              const securityIdx = newStats.findIndex(s => s.key === 'quality');
              if (securityIdx !== -1) {
                newStats[securityIdx].value = res.data.cheat_records_count === 0 ? 'excellent' : 'risky';
                newStats[securityIdx].color = res.data.cheat_records_count === 0 ? '#10b981' : '#ef4444';
              }
              const reportIdx = newStats.findIndex(s => s.key === 'reports');
              if (reportIdx !== -1) {
                newStats[reportIdx].value = res.data.report_records_count.toString();
              }
              const verifyIdx = newStats.findIndex(s => s.key === 'verification');
              if (verifyIdx !== -1) {
                newStats[verifyIdx].value = res.data.is_phone_verified ? 'verified' : 'unverified';
                newStats[verifyIdx].color = res.data.is_phone_verified ? '#10b981' : '#f59e0b';
              }
              return newStats;
            });
          }
        }
      });
    }

    afterNextRender(() => {
      const trendEl = this.trendChartEl();
      const pieEl = this.pieChartEl();
      
      if (trendEl) this.renderTrendChart(trendEl.nativeElement);
      if (pieEl) this.renderPieChart(pieEl.nativeElement);
    });

    // Synchronize pie chart hover state with signal
    effect(() => {
      const hovered = this.hoveredMode();
      const container = this.pieChartEl()?.nativeElement;
      if (!container) return;

      const svg = d3.select(container).select('svg');
      const width = container.clientWidth;
      const height = container.clientHeight;
      const radius = Math.min(width, height) / 2;
      const arc = d3.arc<d3.PieArcDatum<ModeStat>>().innerRadius(radius * 0.6).outerRadius(radius * 0.9);

      svg.selectAll<SVGPathElement, d3.PieArcDatum<ModeStat>>('path')
        .transition()
        .duration(300)
        .attr('transform', (d) => {
          if (hovered && d.data.label === hovered) {
            const [x, y] = arc.centroid(d);
            return `translate(${x * 0.15}, ${y * 0.15})`;
          }
          return 'translate(0,0)';
        })
        .attr('opacity', (d) => {
          if (hovered && d.data.label !== hovered) return 0.5;
          return 1;
        });
    });
  }

  onRankingTypeChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value as 'solo' | 'team';
    this.rankingType.set(value);
  }

  getCountryFlag(country: string): string {
    const flags: Record<string, string> = {
      'CN': '🇨🇳',
      'KR': '🇰🇷',
      'EU': '🇪🇺',
      'US': '🇺🇸',
      'RU': '🇷🇺',
      'KZ': '🇰🇿',
      'TR': '🇹🇷',
      'JP': '🇯🇵'
    };
    return flags[country] || '🏴';
  }

  private renderTrendChart(container: HTMLElement) {
    d3.select(container).selectAll('*').remove();
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 20, right: 20, bottom: 30, left: 40 };
    
    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // Calculate cumulative win rate
    let wins = 0;
    const data = this.recentGames.map((result, i) => {
      wins += result;
      return { x: i + 1, y: (wins / (i + 1)) * 100 };
    });

    const x = d3.scaleLinear()
      .domain([1, data.length])
      .range([0, chartWidth]);

    const y = d3.scaleLinear()
      .domain([0, 100])
      .range([chartHeight, 0]);

    // Grid lines
    svg.append('g')
      .attr('class', 'grid')
      .attr('stroke', 'var(--border)')
      .attr('stroke-opacity', 0.1)
      .call(d3.axisLeft(y).tickSize(-chartWidth).tickFormat(() => ''));

    // Axes
    svg.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x).ticks(data.length).tickSize(0).tickPadding(10))
      .attr('color', 'var(--text-muted)');

    svg.append('g')
      .call(d3.axisLeft(y).ticks(3).tickFormat(d => d + '%').tickSize(0).tickPadding(10))
      .attr('color', 'var(--text-muted)');

    // Area
    const area = d3.area<TrendData>()
      .x(d => x(d.x))
      .y0(chartHeight)
      .y1(d => y(d.y))
      .curve(d3.curveMonotoneX);

    svg.append('path')
      .datum(data)
      .attr('fill', 'url(#gradient)')
      .attr('d', area);

    // Gradient
    const gradient = svg.append('defs')
      .append('linearGradient')
      .attr('id', 'gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    gradient.append('stop').attr('offset', '0%').attr('stop-color', '#10b98130');
    gradient.append('stop').attr('offset', '100%').attr('stop-color', '#10b98100');

    // Line
    const line = d3.line<TrendData>()
      .x(d => x(d.x))
      .y(d => y(d.y))
      .curve(d3.curveMonotoneX);

    svg.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#10b981')
      .attr('stroke-width', 3)
      .attr('d', line);

    // Dots
    svg.selectAll('.dot')
      .data(data)
      .enter()
      .append('circle')
      .attr('cx', d => x(d.x))
      .attr('cy', d => y(d.y))
      .attr('r', 4)
      .attr('fill', '#10b981')
      .attr('stroke', 'var(--secondary)')
      .attr('stroke-width', 2);
  }

  private renderPieChart(container: HTMLElement) {
    d3.select(container).selectAll('*').remove();
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    const radius = Math.min(width, height) / 2;
    
    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`);

    const data = this.modeStats();
    const total = data.reduce((acc, d) => acc + d.value, 0);

    const pie = d3.pie<ModeStat>()
      .value(d => d.value)
      .sort(null);

    const arc = d3.arc<d3.PieArcDatum<ModeStat>>()
      .innerRadius(radius * 0.6)
      .outerRadius(radius * 0.9);

    const arcs = svg.selectAll('.arc')
      .data(pie(data))
      .enter()
      .append('g')
      .attr('class', 'arc');

    arcs.append('path')
      .attr('d', arc)
      .attr('fill', d => d.data.color)
      .attr('stroke', 'var(--secondary)')
      .attr('stroke-width', 2)
      .attr('class', 'cursor-pointer transition-opacity duration-300')
      .on('mouseenter', (event, d) => {
        this.hoveredMode.set(d.data.label);
      })
      .on('mouseleave', () => {
        this.hoveredMode.set(null);
      });

    // Center text
    svg.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-0.5em')
      .attr('fill', 'var(--text-muted)')
      .attr('font-size', '10px')
      .attr('class', 'uppercase tracking-widest')
      .text('Total');

    svg.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.8em')
      .attr('fill', 'var(--text-main)')
      .attr('font-size', '20px')
      .attr('font-weight', 'bold')
      .text(total);
  }
}

