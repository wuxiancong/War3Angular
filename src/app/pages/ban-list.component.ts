import { Component, signal, inject, computed } from '@angular/core';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { I18nService } from '../core/i18n/i18n.service';

interface BanRecord {
  id: string;
  player: string;
  reason: string;
  date: string;
  duration: 'permanent' | number; // number in days
  reporter: string;
  status: 'active' | 'expired';
}

@Component({
  selector: 'app-ban-list',
  standalone: true,
  imports: [TranslatePipe, FormsModule, RouterLink],
  host: { class: 'flex flex-col flex-grow' },
  template: `
    <main class="flex-grow py-8 px-4 md:px-8 bg-transparent text-[var(--text-main)]">
      <div class="max-w-7xl mx-auto space-y-8">
        
        <!-- Header & Back Button -->
        <div class="flex items-center gap-4">
          <button routerLink="/report" class="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-[var(--text-muted)] hover:text-[var(--text-main)]">
            <span class="material-icons">arrow_back</span>
          </button>
          <div class="flex flex-col gap-1">
            <h1 class="text-3xl font-black italic text-[var(--text-main)] tracking-wider uppercase flex items-center gap-3">
                <span class="text-red-500">🚫</span>
                {{ 'banList.title' | t }}
            </h1>
            <p class="text-[var(--text-muted)] text-sm italic">{{ 'banList.filterHint' | t }}</p>
          </div>
        </div>

        <!-- 搜索栏 -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div class="relative w-full md:w-96">
                <span class="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm">search</span>
                <input 
                    type="text" 
                    [(ngModel)]="searchQuery"
                    [placeholder]="'banList.searchPlaceholder' | t"
                    class="w-full bg-[var(--secondary)] border border-white/10 rounded-lg pl-10 pr-4 py-3 text-[var(--text-main)] focus:border-accent outline-none transition-all shadow-lg"
                >
            </div>
        </div>

        <!-- 封号列表 -->
        <div class="bg-[var(--card-bg)] backdrop-blur-md rounded-xl shadow-2xl border border-[var(--border)] overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-[var(--primary)]/80 text-[10px] md:text-xs uppercase tracking-wider text-[var(--text-muted)]">
                            <th class="p-4 font-medium">{{ 'banList.table.player' | t }}</th>
                            <th class="p-4 font-medium">{{ 'banList.table.reason' | t }}</th>
                            <th class="p-4 font-medium hidden sm:table-cell">{{ 'banList.table.date' | t }}</th>
                            <th class="p-4 font-medium hidden md:table-cell">{{ 'banList.table.duration' | t }}</th>
                            <th class="p-4 font-medium hidden lg:table-cell">{{ 'banList.table.reporter' | t }}</th>
                            <th class="p-4 font-medium text-right">{{ 'banList.table.status' | t }}</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-white/5">
                        @for (record of filteredRecords(); track record.id) {
                            <tr class="hover:bg-white/5 transition-colors group">
                                <td class="p-4">
                                    <div class="flex items-center gap-3">
                                        <div class="w-8 h-8 rounded bg-red-500/10 flex items-center justify-center text-red-500">
                                            <span class="material-icons text-sm">person_off</span>
                                        </div>
                                        <span class="font-bold text-[var(--text-main)] md:text-base">{{ record.player }}</span>
                                    </div>
                                </td>
                                <td class="p-4">
                                    <span class="text-sm text-[var(--text-main)]">
                                        {{ ('report.types.' + record.reason) | t }}
                                    </span>
                                </td>
                                <td class="p-4 hidden sm:table-cell">
                                    <span class="text-sm text-[var(--text-muted)] font-mono">{{ record.date }}</span>
                                </td>
                                <td class="p-4 hidden md:table-cell">
                                    <span class="text-sm text-[var(--text-muted)]">
                                        @if (record.duration === 'permanent') {
                                            {{ 'banList.durations.permanent' | t }}
                                        } @else {
                                            {{ formatDuration(record.duration) }}
                                        }
                                    </span>
                                </td>
                                <td class="p-4 hidden lg:table-cell">
                                    <span class="text-sm text-accent">{{ record.reporter }}</span>
                                </td>
                                <td class="p-4 text-right">
                                    @if (record.status === 'active') {
                                        <span class="inline-flex items-center px-2 py-1 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                                            {{ 'banList.status.active' | t }}
                                        </span>
                                    } @else {
                                        <span class="inline-flex items-center px-2 py-1 rounded text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/20">
                                            {{ 'banList.status.expired' | t }}
                                        </span>
                                    }
                                </td>
                            </tr>
                        }
                        @if (filteredRecords().length === 0) {
                            <tr>
                                <td colspan="6" class="p-12 text-center">
                                    <div class="flex flex-col items-center gap-2 text-[var(--text-muted)]">
                                        <span class="material-icons text-4xl opacity-20">search_off</span>
                                        <p class="italic">{{ 'banList.noResults' | t }}</p>
                                    </div>
                                </td>
                            </tr>
                        }
                    </tbody>
                </table>
            </div>
        </div>

        <!-- 底部说明 -->
        <div class="bg-white/5 rounded-lg p-6 border border-white/10">
            <h3 class="text-[var(--text-main)] font-bold mb-2 flex items-center gap-2">
                <span class="material-icons text-sm text-accent">info</span>
                {{ 'banList.info.title' | t }}
            </h3>
            <p class="text-sm text-[var(--text-muted)] leading-relaxed">
                {{ 'banList.info.desc' | t }}
                <br>
                <span class="text-red-400/80 mt-2 block italic">{{ 'banList.info.warning' | t }}</span>
            </p>
        </div>

      </div>
    </main>
  `
})
export class BanListComponent {
  i18n = inject(I18nService);
  searchQuery = signal('');

  records = signal<BanRecord[]>([
    { id: '1', player: 'MapHackUser99', reason: 'mh', date: '2024-03-01', duration: 'permanent', reporter: 'System_Guard', status: 'active' },
    { id: '2', player: 'Toxic_Kid_01', reason: 'abuse', date: '2024-02-28', duration: 7, reporter: 'Player_A', status: 'active' },
    { id: '3', player: 'Feeder_Pro', reason: 'feed', date: '2024-02-20', duration: 30, reporter: 'Player_B', status: 'active' },
    { id: '4', player: 'AFK_Master', reason: 'afk', date: '2024-01-15', duration: 3, reporter: 'Player_C', status: 'expired' },
    { id: '5', player: 'Cheater_CC', reason: 'mh', date: '2024-03-02', duration: 'permanent', reporter: 'System_Guard', status: 'active' },
    { id: '6', player: 'BadMouth', reason: 'abuse', date: '2024-02-10', duration: 1, reporter: 'Player_D', status: 'expired' },
    { id: '7', player: 'Griefer_X', reason: 'other', date: '2024-02-25', duration: 14, reporter: 'Player_E', status: 'active' },
    { id: '8', player: 'Serious_MH', reason: 'mh', date: '2024-01-10', duration: 180, reporter: 'System_Guard', status: 'active' },
  ]);

  filteredRecords = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    // Filter for bans > 3 months (90 days) or permanent
    const longBans = this.records().filter(r => 
      r.duration === 'permanent' || (typeof r.duration === 'number' && r.duration >= 90)
    );
    
    if (!query) return longBans;
    return longBans.filter(r => 
      r.player.toLowerCase().includes(query) || 
      r.reporter.toLowerCase().includes(query)
    );
  });

  formatDuration(days: number): string {
    return this.i18n.t('banList.durations.days').replace('{n}', days.toString());
  }
}
