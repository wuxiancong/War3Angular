import { Component, signal } from '@angular/core';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';

@Component({
  selector: 'app-my-squad',
  standalone: true,
  imports: [TranslatePipe, RouterLink, DatePipe, DecimalPipe, PercentPipe],
  host: { class: 'flex flex-col flex-grow' },
  template: `
    <main class="flex-grow py-8 px-4 md:px-8 bg-transparent text-[var(--text-main)]">
      <div class="max-w-7xl mx-auto space-y-8">
        
        <!-- Header & Back Button -->
        <div class="flex items-center gap-4">
          <button routerLink="/squad" class="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-[var(--text-muted)] hover:text-[var(--text-main)]">
            <span class="material-icons">arrow_back</span>
          </button>
          <h1 class="text-3xl font-black italic text-[var(--text-main)] tracking-wider uppercase">
            {{ 'squad.myTeam' | t }}
          </h1>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <!-- Left Column: Squad Info & Personal Stats -->
          <div class="space-y-8 lg:col-span-1">
            
            <!-- Squad Profile Card -->
            <div class="bg-[var(--card-bg)] backdrop-blur-md rounded-xl shadow-xl border border-[var(--border)] overflow-hidden">
              <div class="p-6 flex flex-col items-center text-center border-b border-white/5 relative overflow-hidden">
                <div class="absolute top-0 inset-x-0 h-24 bg-gradient-to-b from-accent/20 to-transparent"></div>
                <div class="w-24 h-24 rounded-2xl bg-[var(--secondary)] border-2 border-accent shadow-[0_0_15px_rgba(var(--accent-rgb),0.3)] flex items-center justify-center mb-4 relative z-10 overflow-hidden">
                  <img src="assets/images/teams/Secret.png" alt="Team Avatar" class="w-full h-full object-cover" onerror="this.style.display='none'">
                  <span class="text-4xl font-black text-accent absolute -z-10">TS</span>
                </div>
                <h2 class="text-2xl font-bold text-[var(--text-main)] mb-1 relative z-10">Team Secret</h2>
                <p class="text-sm text-accent font-medium mb-4 relative z-10">"No secret is safe."</p>
                <div class="text-xs text-[var(--text-muted)] flex items-center gap-1">
                  <span class="material-icons text-[14px]">calendar_today</span>
                  创建于: {{ squadInfo().createdAt | date:'yyyy-MM-dd' }}
                </div>
              </div>
              
              <div class="p-6 grid grid-cols-2 gap-4">
                <div class="bg-white/5 rounded-lg p-3 text-center border border-white/5">
                  <div class="text-[var(--text-muted)] text-xs mb-1">战队分数</div>
                  <div class="text-xl font-bold text-[var(--text-main)]">{{ squadInfo().score | number }}</div>
                </div>
                <div class="bg-white/5 rounded-lg p-3 text-center border border-white/5">
                  <div class="text-[var(--text-muted)] text-xs mb-1">战队排名</div>
                  <div class="text-xl font-bold text-accent">#{{ squadInfo().rank }}</div>
                </div>
                <div class="bg-white/5 rounded-lg p-3 text-center border border-white/5">
                  <div class="text-[var(--text-muted)] text-xs mb-1">总场次</div>
                  <div class="text-xl font-bold text-[var(--text-main)]">{{ squadInfo().matchesPlayed }}</div>
                </div>
                <div class="bg-white/5 rounded-lg p-3 text-center border border-white/5">
                  <div class="text-[var(--text-muted)] text-xs mb-1">胜率</div>
                  <div class="text-xl font-bold text-green-400">{{ squadInfo().winRate | percent:'1.1-1' }}</div>
                </div>
              </div>
            </div>

            <!-- Personal Stats Card -->
            <div class="bg-[var(--card-bg)] backdrop-blur-md rounded-xl shadow-xl border border-[var(--border)] overflow-hidden p-6">
              <h3 class="text-lg font-bold text-[var(--text-main)] mb-4 flex items-center gap-2">
                <span class="material-icons text-accent">person</span>
                我的战队数据
              </h3>
              <div class="space-y-4">
                <div class="flex justify-between items-center pb-3 border-b border-white/5">
                  <span class="text-[var(--text-muted)] text-sm">个人贡献分</span>
                  <span class="text-[var(--text-main)] font-bold">{{ personalInfo().score | number }}</span>
                </div>
                <div class="flex justify-between items-center pb-3 border-b border-white/5">
                  <span class="text-[var(--text-muted)] text-sm">队内排名</span>
                  <span class="text-accent font-bold">#{{ personalInfo().rank }}</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-[var(--text-muted)] text-sm">信誉积分 (准时率)</span>
                  <div class="flex items-center gap-2">
                    <div class="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
                      <div class="h-full bg-green-500" [style.width]="personalInfo().reputation + '%'"></div>
                    </div>
                    <span class="text-green-400 font-bold text-sm">{{ personalInfo().reputation }}%</span>
                  </div>
                </div>
              </div>
            </div>
            
          </div>

          <!-- Right Column: Members & Match History -->
          <div class="space-y-8 lg:col-span-2">
            
            <!-- Members List -->
            <div class="bg-[var(--card-bg)] backdrop-blur-md rounded-xl shadow-xl border border-[var(--border)] overflow-hidden">
              <div class="p-4 md:p-6 border-b border-white/5 flex justify-between items-center">
                <h3 class="text-lg font-bold text-[var(--text-main)] flex items-center gap-2">
                  <span class="material-icons text-accent">groups</span>
                  战队成员 ({{ members().length }}/10)
                </h3>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                  <thead>
                    <tr class="bg-[var(--primary)]/80 text-xs uppercase tracking-wider text-[var(--text-muted)]">
                      <th class="p-4 font-medium">玩家</th>
                      <th class="p-4 font-medium text-center">擅长位置</th>
                      <th class="p-4 font-medium text-center">加入时间</th>
                      <th class="p-4 font-medium text-right">状态</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-white/5">
                    @for (member of members(); track member.id) {
                      <tr class="hover:bg-white/5 transition-colors">
                        <td class="p-4">
                          <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded bg-[var(--secondary)] flex items-center justify-center text-xs font-bold text-[var(--text-main)]">
                              {{ member.name.charAt(0) }}
                            </div>
                            <div>
                              <div class="font-bold text-[var(--text-main)] text-sm flex items-center gap-2">
                                {{ member.name }}
                                @if (member.role === 'captain') {
                                  <span class="px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-500 text-[10px] uppercase">队长</span>
                                }
                              </div>
                            </div>
                          </div>
                        </td>
                        <td class="p-4 text-center">
                          <div class="flex items-center justify-center gap-1">
                            @for (pos of member.positions; track pos) {
                              <span class="px-2 py-0.5 rounded bg-white/5 text-[var(--text-muted)] text-xs border border-white/10">{{ pos }}</span>
                            }
                          </div>
                        </td>
                        <td class="p-4 text-center text-sm text-[var(--text-muted)]">
                          {{ member.joinDate | date:'yyyy-MM-dd' }}
                        </td>
                        <td class="p-4 text-right">
                          <span class="inline-flex items-center gap-1 text-xs" [class.text-green-400]="member.status === 'online'" [class.text-[var(--text-muted)]]="member.status === 'offline'">
                            <span class="w-1.5 h-1.5 rounded-full" [class.bg-green-400]="member.status === 'online'" [class.bg-[var(--text-muted)]]="member.status === 'offline'"></span>
                            {{ member.status === 'online' ? '在线' : '离线' }}
                          </span>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Match History -->
            <div class="bg-[var(--card-bg)] backdrop-blur-md rounded-xl shadow-xl border border-[var(--border)] overflow-hidden">
              <div class="p-4 md:p-6 border-b border-white/5">
                <h3 class="text-lg font-bold text-[var(--text-main)] flex items-center gap-2">
                  <span class="material-icons text-accent">history</span>
                  近期预约记录
                </h3>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                  <thead>
                    <tr class="bg-[var(--primary)]/80 text-xs uppercase tracking-wider text-[var(--text-muted)]">
                      <th class="p-4 font-medium">日期</th>
                      <th class="p-4 font-medium">对手</th>
                      <th class="p-4 font-medium text-center">模式/服务器</th>
                      <th class="p-4 font-medium text-right">结果</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-white/5">
                    @for (match of matchHistory(); track match.id) {
                      <tr class="hover:bg-white/5 transition-colors">
                        <td class="p-4 text-sm text-[var(--text-muted)]">
                          {{ match.date | date:'MM-dd HH:mm' }}
                        </td>
                        <td class="p-4">
                          <div class="font-bold text-[var(--text-main)] text-sm">{{ match.opponent }}</div>
                        </td>
                        <td class="p-4 text-center">
                          <div class="text-sm text-[var(--text-main)]">{{ match.mode }}</div>
                          <div class="text-xs text-[var(--text-muted)]">{{ match.server }}</div>
                        </td>
                        <td class="p-4 text-right">
                          <span class="font-bold" [class.text-green-400]="match.result === 'Win'" [class.text-red-400]="match.result === 'Loss'">
                            {{ match.result }}
                          </span>
                          <div class="text-xs text-[var(--text-muted)]">{{ match.score }}</div>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <div class="p-4 border-t border-white/5 text-center">
                <button class="text-sm text-accent hover:brightness-110 transition-colors font-bold">查看完整记录</button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </main>
  `
})
export class MySquadComponent {
  squadInfo = signal({
    name: 'Team Secret',
    manifesto: 'No secret is safe.',
    createdAt: new Date('2024-01-15T00:00:00Z'),
    matchesPlayed: 142,
    winRate: 0.68,
    score: 4520,
    rank: 12
  });

  personalInfo = signal({
    score: 850,
    rank: 2,
    reputation: 98
  });

  members = signal([
    { id: '1', name: 'Puppey', role: 'captain', positions: ['Pos 5', 'Pos 4'], joinDate: new Date('2024-01-15T00:00:00Z'), status: 'online' },
    { id: '2', name: 'Nisha', role: 'member', positions: ['Pos 1', 'Pos 2'], joinDate: new Date('2024-02-01T00:00:00Z'), status: 'online' },
    { id: '3', name: 'Zai', role: 'member', positions: ['Pos 3'], joinDate: new Date('2024-02-15T00:00:00Z'), status: 'offline' },
    { id: '4', name: 'YapzOr', role: 'member', positions: ['Pos 4'], joinDate: new Date('2024-03-10T00:00:00Z'), status: 'offline' },
    { id: '5', name: 'MATUMBAMAN', role: 'member', positions: ['Pos 1'], joinDate: new Date('2024-04-05T00:00:00Z'), status: 'online' },
  ]);

  matchHistory = signal([
    { id: '101', date: new Date('2026-02-28T20:00:00Z'), opponent: 'OG', mode: 'CM 5v5', server: 'EU West', result: 'Win', score: '+25' },
    { id: '102', date: new Date('2026-02-25T19:30:00Z'), opponent: 'Team Liquid', mode: 'CM 5v5', server: 'EU East', result: 'Loss', score: '-20' },
    { id: '103', date: new Date('2026-02-20T21:00:00Z'), opponent: 'Nigma Galaxy', mode: 'AP 5v5', server: 'EU West', result: 'Win', score: '+22' },
    { id: '104', date: new Date('2026-02-18T18:00:00Z'), opponent: 'Entity', mode: 'CM 5v5', server: 'EU West', result: 'Win', score: '+28' },
  ]);
}
