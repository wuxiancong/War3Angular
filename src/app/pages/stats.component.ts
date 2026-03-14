import { Component, signal, ElementRef, viewChild, inject, PLATFORM_ID, afterNextRender, effect } from '@angular/core';
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

        <div class="space-y-8">
            <!-- Row 1: Overview & Mode Distribution (Horizontal) -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
                <!-- Basic Stats Grid -->
                <div class="bg-[var(--card-bg)] backdrop-blur-md rounded-xl p-6 border border-[var(--border)] shadow-xl flex flex-col lg:col-span-2">
                    <h2 class="text-lg font-bold text-accent italic uppercase tracking-wider mb-6 flex items-center gap-2">
                        <span class="material-icons text-sm">analytics</span>
                        {{ 'matches.overview' | t }}
                    </h2>
                    
                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 flex-grow content-center">
                        @for (stat of basicStats(); track stat.title) {
                            <div class="group bg-[var(--primary)]/50 py-4 px-2 rounded-lg border border-[var(--border)] hover:border-accent/30 transition-all duration-300 text-center flex flex-col justify-center min-w-0">
                                <div class="text-lg mb-1">{{ stat.icon }}</div>
                                <div class="text-[9px] text-[var(--text-muted)] uppercase tracking-tight mb-1 truncate w-full" [title]="stat.title">{{ stat.title }}</div>
                                <div class="text-sm sm:text-base font-black truncate w-full tabular-nums" [style.color]="stat.color" [title]="stat.value">{{ stat.value }}</div>
                            </div>
                        }
                    </div>
                </div>

                <!-- Mode Distribution Pie Chart -->
                <div class="bg-[var(--card-bg)] backdrop-blur-md rounded-xl p-6 border border-[var(--border)] shadow-xl flex flex-col lg:col-span-1">
                    <h2 class="text-lg font-bold text-accent italic uppercase tracking-wider mb-6 flex items-center gap-2">
                        <span class="material-icons text-sm">pie_chart</span>
                        模式分布图
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
            </div>

            <!-- Row 2: Trend + Heroes (Left) vs Rankings (Right) -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
                <!-- Left Column: Trend & Heroes -->
                <div class="flex flex-col gap-8 lg:col-span-2">
                    <!-- Win Rate Trend Chart -->
                    <div class="bg-[var(--card-bg)] backdrop-blur-md rounded-xl p-6 border border-[var(--border)] shadow-xl flex-grow flex flex-col">
                        <h2 class="text-lg font-bold text-accent italic uppercase tracking-wider mb-4 flex items-center gap-2">
                            <span class="material-icons text-sm">trending_up</span>
                            最近15场胜率趋势
                        </h2>
                        <div #trendChart class="w-full flex-grow min-h-[180px] relative overflow-hidden">
                            <!-- D3 Chart will be rendered here -->
                        </div>
                    </div>

                    <!-- Best Heroes -->
                    <div class="bg-[var(--card-bg)] backdrop-blur-md rounded-xl p-6 border border-[var(--border)] shadow-xl flex-grow flex flex-col">
                        <h2 class="text-lg font-bold text-accent italic uppercase tracking-wider mb-6 flex items-center gap-2">
                            <span class="material-icons text-sm">stars</span>
                            最佳英雄
                        </h2>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-grow">
                            @for (hero of bestHeroes(); track hero.name; let i = $index) {
                                <div class="group bg-[var(--primary)]/50 p-4 rounded-xl border border-[var(--border)] hover:border-accent/30 transition-all duration-500 relative overflow-hidden text-center flex flex-col justify-center">
                                    <!-- Rank Badge -->
                                    <div class="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold border-2 border-[var(--secondary)]"
                                         [ngClass]="{
                                             'bg-yellow-500 text-black': i === 0,
                                             'bg-gray-300 text-black': i === 1,
                                             'bg-orange-600 text-white': i === 2
                                         }">
                                        {{ i + 1 }}
                                    </div>

                                    <div class="w-12 h-12 mx-auto rounded-full bg-white/5 border-2 border-accent/20 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform relative overflow-hidden">
                                        <span class="text-xl font-black italic text-accent absolute">{{ hero.name.charAt(0) }}</span>
                                        <img [src]="'assets/images/heroes/' + hero.name + '.png'" 
                                             (error)="img.style.display='none'" 
                                             #img
                                             alt="{{hero.name}}" 
                                             class="w-full h-full object-cover relative z-10">
                                    </div>
                                    <h3 class="text-sm font-bold text-[var(--text-main)] mb-1">{{ hero.name }}</h3>
                                    <div class="text-[10px] text-[var(--text-muted)] mb-2">{{ hero.games }} 场</div>
                                    <div class="text-lg font-black text-green-400 mb-1">{{ hero.winRate }}%</div>
                                    <div class="text-[8px] text-accent/60 font-mono uppercase tracking-widest">KDA: {{ hero.kda }}</div>
                                </div>
                            }
                        </div>
                    </div>
                </div>

                <!-- Right Column: Season Rankings -->
                <div class="bg-[var(--card-bg)] backdrop-blur-md rounded-xl p-6 border border-[var(--border)] shadow-xl flex flex-col lg:col-span-1">
                    <h2 class="text-lg font-bold text-accent italic uppercase tracking-wider mb-6 flex items-center gap-2">
                        <span class="material-icons text-sm">leaderboard</span>
                        赛季排名 TOP 10
                    </h2>
                    <div class="space-y-2 flex-grow">
                        @for (rank of seasonRankings(); track rank.name) {
                            <div class="flex items-center gap-3 p-3 rounded-lg border transition-all"
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
                                <span class="text-lg shrink-0">{{ getCountryFlag(rank.country) }}</span>
                                <span class="text-sm font-bold truncate flex-grow" [class.text-[var(--text-main)]]="!rank.isCurrent">{{ rank.name }}</span>
                                <span class="font-mono text-xs font-bold" [class.text-accent]="!rank.isCurrent">{{ rank.score }}</span>
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

  basicStats = signal([
    { icon: '🏆', title: '全球排名', value: '#156', color: '#f59e0b' },
    { icon: '⭐', title: '玩家分数', value: '2456', color: '#66fcf1' },
    { icon: '📈', title: '胜率', value: '58.3%', color: '#10b981' },
    { icon: '⚔️', title: 'K/D/A (3.42)', value: '342/156/278', color: '#c5c6c7' },
    { icon: '💰', title: 'GPM', value: '150', color: '#45a29e' },
    { icon: '👑', title: 'MVP次数', value: '42', color: '#fbbf24' },
    { icon: '🎖️', title: '竞技等级', value: 'S+', color: '#45a29e' },
    { icon: '🏃', title: '逃跑场次', value: '2', color: '#ef4444' },
    { icon: '🎮', title: '游戏场次', value: '456', color: '#c5c6c7' },
    { icon: '🔥', title: '最大连胜', value: '8', color: '#10b981' },
    { icon: '⚡', title: '当前连胜', value: '3', color: '#10b981' },
    { icon: '⏰', title: '累计在线', value: '172小时', color: '#45a29e' },
    { icon: '🛡️', title: '玩家素质', value: '优秀', color: '#10b981' },
    { icon: '🚫', title: '违规记录', value: '0', color: '#ef4444' },
    { icon: '📢', title: '被举报数', value: '1', color: '#f59e0b' },
    { icon: '✅', title: '玩家认证', value: '已认证', color: '#10b981' },
  ]);

  bestHeroes = signal<HeroStat[]>([
    { name: '剑圣', games: 45, wins: 28, winRate: 62.2, kda: 4.5 },
    { name: '恶魔猎手', games: 38, wins: 24, winRate: 63.2, kda: 5.2 },
    { name: '死亡骑士', games: 42, wins: 25, winRate: 59.5, kda: 3.8 },
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

  seasonRankings = signal<Ranking[]>([
    { rank: 1, name: 'Sky', score: 3256, country: 'CN' },
    { rank: 2, name: 'Moon', score: 3189, country: 'KR' },
    { rank: 3, name: 'Grubby', score: 3124, country: 'EU' },
    { rank: 4, name: 'Lyn', score: 3087, country: 'KR' },
    { rank: 5, name: 'TH000', score: 3056, country: 'CN' },
    { rank: 6, name: 'Infi', score: 2988, country: 'CN' },
    { rank: 7, name: 'Fly100%', score: 2945, country: 'CN' },
    { rank: 8, name: 'Focus', score: 2890, country: 'KR' },
    { rank: 9, name: 'Remind', score: 2850, country: 'KR' },
    { rank: 156, name: 'Bimawen', score: 2456, country: 'CN', isCurrent: true },
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
              const timeIdx = newStats.findIndex(s => s.title === '累计在线');
              if (timeIdx !== -1) {
                newStats[timeIdx].value = Math.round(res.data.total_ingame_time / 60) + '小时';
              }
              const securityIdx = newStats.findIndex(s => s.title === '玩家素质');
              if (securityIdx !== -1) {
                newStats[securityIdx].value = res.data.cheat_records_count === 0 ? '优秀' : '有风险';
                newStats[securityIdx].color = res.data.cheat_records_count === 0 ? '#10b981' : '#ef4444';
              }
              const reportIdx = newStats.findIndex(s => s.title === '被举报数');
              if (reportIdx !== -1) {
                newStats[reportIdx].value = res.data.report_records_count.toString();
              }
              const verifyIdx = newStats.findIndex(s => s.title === '玩家认证');
              if (verifyIdx !== -1) {
                newStats[verifyIdx].value = res.data.is_phone_verified ? '已认证' : '未认证';
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

  getCountryFlag(country: string): string {
    const flags: Record<string, string> = {
      'CN': '🇨🇳',
      'KR': '🇰🇷',
      'EU': '🇪🇺',
      'US': '🇺🇸'
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

