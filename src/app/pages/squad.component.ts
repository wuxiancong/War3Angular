import { Component, signal } from '@angular/core';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { UpperCasePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

interface Lobby {
  id: string;
  teamName: string;
  teamAvatar: string;
  captain: string;
  avgLevel: number;
  mode: string;
  server: string;
  status: 'waiting' | 'battling';
  opponent?: string;
}

@Component({
  selector: 'app-squad',
  standalone: true,
  imports: [TranslatePipe, UpperCasePipe, RouterLink],
  host: { class: 'flex flex-col flex-grow' },
  template: `
    <main class="flex-grow py-8 px-4 md:px-8 bg-transparent text-[var(--text-main)]">
      <div class="max-w-7xl mx-auto space-y-8">
        
        <!-- 标题与操作 -->
        <div class="flex flex-col md:flex-row justify-between items-center gap-6">
            <h1 class="text-4xl font-black italic text-[var(--text-main)] tracking-wider uppercase flex items-center gap-3">
                <span class="text-red-500">⚔️</span>
                {{ 'squad.title' | t }}
            </h1>
            
            <div class="flex gap-4">
                <button routerLink="/my-squad" class="px-6 py-2 bg-[var(--secondary)] hover:bg-[var(--tertiary)] text-[var(--text-main)] rounded border border-white/10 transition-all active:scale-95 font-bold uppercase text-sm">
                    {{ 'squad.myTeam' | t }}
                </button>
                <button routerLink="/create-match" class="px-6 py-2 bg-red-600 hover:bg-red-500 text-white rounded shadow-lg shadow-red-600/20 transition-all active:scale-95 font-bold uppercase text-sm flex items-center gap-2">
                    <span class="material-icons text-sm">add</span>
                    {{ 'squad.create' | t }}
                </button>
            </div>
        </div>

        <!-- 筛选与列表 -->
        <div class="bg-[var(--card-bg)] backdrop-blur-md rounded-xl shadow-xl border border-[var(--border)] overflow-hidden">
            <!-- 筛选栏 -->
            <div class="p-4 border-b border-white/10 flex gap-4 bg-[var(--primary)]/30 overflow-x-auto whitespace-nowrap">
                <button class="px-4 py-1 rounded-full text-xs font-bold bg-accent text-[var(--text-inverted)]">{{ 'squad.all' | t }}</button>
                <button class="px-4 py-1 rounded-full text-xs font-bold bg-white/5 text-[var(--text-muted)] hover:text-[var(--text-hover)] hover:bg-white/10 transition-colors">CM {{ 'squad.mode' | t }}</button>
                <button class="px-4 py-1 rounded-full text-xs font-bold bg-white/5 text-[var(--text-muted)] hover:text-[var(--text-hover)] hover:bg-white/10 transition-colors">AP {{ 'squad.mode' | t }}</button>
                <button class="px-4 py-1 rounded-full text-xs font-bold bg-white/5 text-[var(--text-muted)] hover:text-[var(--text-hover)] hover:bg-white/10 transition-colors">RD {{ 'squad.mode' | t }}</button>
                <button class="px-4 py-1 rounded-full text-xs font-bold bg-white/5 text-[var(--text-muted)] hover:text-[var(--text-hover)] hover:bg-white/10 transition-colors">XL {{ 'squad.mode' | t }}</button>
                <button class="px-4 py-1 rounded-full text-xs font-bold bg-white/5 text-[var(--text-muted)] hover:text-[var(--text-hover)] hover:bg-white/10 transition-colors">AR {{ 'squad.mode' | t }}</button>
                <button class="px-4 py-1 rounded-full text-xs font-bold bg-white/5 text-[var(--text-muted)] hover:text-[var(--text-hover)] hover:bg-white/10 transition-colors">SD {{ 'squad.mode' | t }}</button>
            </div>

            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-[var(--primary)]/80 text-[10px] md:text-xs uppercase tracking-wider text-[var(--text-muted)]">
                            <th class="p-2 md:p-4 font-medium">{{ 'squad.teamName' | t }}</th>
                            <th class="p-2 md:p-4 font-medium">{{ 'squad.captain' | t }}</th>
                            <th class="p-2 md:p-4 font-medium text-center hidden sm:table-cell">{{ 'squad.mode' | t }}</th>
                            <th class="p-2 md:p-4 font-medium text-center hidden md:table-cell">{{ 'squad.server' | t }}</th>
                            <th class="p-2 md:p-4 font-medium text-center">{{ 'squad.status' | t }}</th>
                            <th class="p-2 md:p-4 font-medium text-right">{{ 'squad.action' | t }}</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-white/5">
                        @for (lobby of lobbies(); track lobby.id) {
                            <tr class="hover:bg-white/5 transition-colors group">
                                <!-- 战队信息 -->
                                <td class="p-2 md:p-4">
                                    <div class="flex items-center gap-2 md:gap-4">
                                        <div class="w-8 h-8 md:w-10 md:h-10 rounded overflow-hidden border border-white/10 shrink-0 relative bg-white/5">
                                            <span class="absolute inset-0 flex items-center justify-center text-xs font-bold text-accent">{{ lobby.teamName.charAt(0) | uppercase }}</span>
                                            <img [src]="lobby.teamAvatar" (error)="imgTeam.style.display='none'" #imgTeam class="w-full h-full object-cover relative z-10" alt="Team Avatar">
                                        </div>
                                        <div class="truncate max-w-[80px] md:max-w-none">
                                            <div class="font-bold text-[var(--text-main)] text-xs md:text-sm group-hover:text-accent transition-colors truncate">{{ lobby.teamName }}</div>
                                            @if (lobby.status === 'battling') {
                                                <div class="text-[9px] md:text-[10px] text-[var(--text-muted)] flex items-center gap-1 truncate">
                                                    <span class="text-red-500 font-bold">VS</span> {{ lobby.opponent }}
                                                </div>
                                            }
                                        </div>
                                    </div>
                                </td>

                                <!-- 队长 -->
                                <td class="p-2 md:p-4">
                                    <span class="text-[10px] md:text-xs text-[var(--text-main)]">{{ lobby.captain }}</span>
                                </td>

                                <!-- 模式 -->
                                <td class="p-2 md:p-4 text-center hidden sm:table-cell">
                                    <span class="text-[10px] md:text-xs font-bold text-accent">{{ lobby.mode }}</span>
                                </td>

                                <!-- 服务器 -->
                                <td class="p-2 md:p-4 text-center hidden md:table-cell">
                                    <span class="text-[10px] md:text-xs text-[var(--text-main)] font-bold">{{ lobby.server }}</span>
                                </td>

                                <!-- 状态 -->
                                <td class="p-2 md:p-4 text-center">
                                    @if (lobby.status === 'waiting') {
                                        <span class="inline-flex items-center gap-1 px-1.5 py-0.5 md:px-2 md:py-1 rounded text-[8px] md:text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/20 animate-pulse">
                                            <span class="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-green-400"></span>
                                            {{ 'squad.waiting' | t }}
                                        </span>
                                    } @else {
                                        <span class="inline-flex items-center gap-1 px-1.5 py-0.5 md:px-2 md:py-1 rounded text-[8px] md:text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                                            <span class="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-red-400"></span>
                                            {{ 'squad.battling' | t }}
                                        </span>
                                    }
                                </td>

                                <!-- 操作 -->
                                <td class="p-2 md:p-4 text-right">
                                    @if (lobby.status === 'waiting') {
                                        <button class="px-2 py-1 md:px-4 md:py-1.5 bg-accent hover:brightness-110 text-[var(--text-inverted)] text-[10px] md:text-xs font-bold uppercase rounded shadow-[0_0_10px_rgba(var(--accent-rgb),0.3)] hover:shadow-[0_0_15px_rgba(var(--accent-rgb),0.6)] transition-all active:scale-95">
                                            {{ 'squad.challenge' | t }}
                                        </button>
                                    } @else {
                                        <button class="px-2 py-1 md:px-4 md:py-1.5 bg-white/5 text-[var(--text-muted)] text-[10px] md:text-xs font-bold uppercase rounded cursor-not-allowed border border-white/5" disabled>
                                            {{ 'squad.spectate' | t }}
                                        </button>
                                    }
                                </td>
                            </tr>
                        }
                        @if (lobbies().length === 0) {
                            <tr>
                                <td colspan="6" class="p-8 text-center text-[var(--text-muted)]">
                                    {{ 'squad.noLobby' | t }}
                                </td>
                            </tr>
                        }
                    </tbody>
                </table>
            </div>
            
            <!-- 底部加载更多 -->
            <div class="p-4 border-t border-white/10 text-center">
                <button class="text-sm text-[var(--text-muted)] hover:text-accent transition-colors uppercase tracking-widest font-bold">
                    {{ 'squad.loadMore' | t }}
                </button>
            </div>
        </div>
      </div>
    </main>
  `
})
export class SquadComponent {
  lobbies = signal<Lobby[]>([
    { id: '1', teamName: 'Team Secret', teamAvatar: 'assets/images/teams/Secret.png', captain: 'Puppey', avgLevel: 45, mode: 'CM 5v5', server: 'CN1', status: 'waiting' },
    { id: '2', teamName: 'OG', teamAvatar: 'assets/images/teams/OG.png', captain: 'N0tail', avgLevel: 42, mode: 'AP 5v5', server: 'CN2', status: 'battling', opponent: 'Team Liquid' },
    { id: '3', teamName: 'PSG.LGD', teamAvatar: 'assets/images/teams/LGD.png', captain: 'y`', avgLevel: 48, mode: 'CM 5v5', server: 'RU1', status: 'waiting' },
    { id: '4', teamName: 'Evil Geniuses', teamAvatar: 'assets/images/teams/EG.png', captain: 'Fly', avgLevel: 40, mode: 'RD 5v5', server: 'RU2', status: 'waiting' },
    { id: '5', teamName: 'Tundra', teamAvatar: 'assets/images/teams/Tundra.png', captain: 'Sneyking', avgLevel: 38, mode: 'AP 5v5', server: 'CN1', status: 'battling', opponent: 'Entity' },
    { id: '6', teamName: 'Team Spirit', teamAvatar: 'assets/images/teams/Spirit.png', captain: 'Miposhka', avgLevel: 46, mode: 'CM 5v5', server: 'CN2', status: 'waiting' },
    { id: '7', teamName: 'Fnatic', teamAvatar: 'assets/images/teams/Fnatic.png', captain: 'DJ', avgLevel: 35, mode: 'AP 5v5', server: 'RU1', status: 'waiting' },
  ]);
}
