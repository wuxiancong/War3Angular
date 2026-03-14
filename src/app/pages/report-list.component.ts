import { Component, signal, computed } from '@angular/core';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

interface ReportRecord {
  id: string;
  target: string;
  reason: string;
  date: string;
  status: 'pending' | 'processed' | 'rejected';
  reporter: string;
}

@Component({
  selector: 'app-report-list',
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
                <span class="text-red-500">📋</span>
                {{ 'reportList.title' | t }}
            </h1>
            <p class="text-[var(--text-muted)] text-sm italic">{{ 'reportList.subtitle' | t }}</p>
          </div>
        </div>

        <!-- 搜索栏 -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div class="flex flex-col sm:flex-row gap-4 ml-auto">
                <div class="relative w-full sm:w-72">
                    <span class="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm">search</span>
                    <input 
                        type="text" 
                        [(ngModel)]="searchQuery"
                        [placeholder]="'banList.searchPlaceholder' | t"
                        class="w-full bg-[var(--secondary)] border border-white/10 rounded-lg pl-10 pr-4 py-2 text-[var(--text-main)] focus:border-accent outline-none transition-all"
                    >
                </div>
                <button routerLink="/report" class="px-6 py-2 bg-accent text-black font-bold rounded-lg hover:brightness-110 transition-all flex items-center gap-2">
                    <span class="material-icons text-sm">add</span>
                    {{ 'report.submit' | t }}
                </button>
            </div>
        </div>

        <!-- 举报列表 -->
        <div class="bg-[var(--card-bg)] backdrop-blur-md rounded-xl shadow-2xl border border-[var(--border)] overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-[var(--primary)]/80 text-[10px] md:text-xs uppercase tracking-wider text-[var(--text-muted)]">
                            <th class="p-4 font-medium">{{ 'reportList.table.player' | t }}</th>
                            <th class="p-4 font-medium">{{ 'reportList.table.reason' | t }}</th>
                            <th class="p-4 font-medium hidden sm:table-cell">{{ 'reportList.table.date' | t }}</th>
                            <th class="p-4 font-medium hidden md:table-cell">{{ 'reportList.table.reporter' | t }}</th>
                            <th class="p-4 font-medium text-right">{{ 'reportList.table.status' | t }}</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-white/5">
                        @for (report of filteredReports(); track report.id) {
                            <tr class="hover:bg-white/5 transition-colors group">
                                <td class="p-4">
                                    <div class="flex items-center gap-3">
                                        <div class="w-8 h-8 rounded bg-white/5 flex items-center justify-center text-[var(--text-muted)]">
                                            <span class="material-icons text-sm">person</span>
                                        </div>
                                        <span class="font-bold text-[var(--text-main)]">{{ report.target }}</span>
                                    </div>
                                </td>
                                <td class="p-4">
                                    <span class="text-sm text-[var(--text-main)]">
                                        {{ ('report.types.' + report.reason) | t }}
                                    </span>
                                </td>
                                <td class="p-4 hidden sm:table-cell">
                                    <span class="text-sm text-[var(--text-muted)] font-mono">{{ report.date }}</span>
                                </td>
                                <td class="p-4 hidden md:table-cell">
                                    <span class="text-sm text-accent">{{ report.reporter }}</span>
                                </td>
                                <td class="p-4 text-right">
                                    @switch (report.status) {
                                        @case ('pending') {
                                            <span class="inline-flex items-center px-2 py-1 rounded text-[10px] font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                                                {{ 'report.pending' | t }}
                                            </span>
                                        }
                                        @case ('processed') {
                                            <span class="inline-flex items-center px-2 py-1 rounded text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/20">
                                                {{ 'report.processed' | t }}
                                            </span>
                                        }
                                        @case ('rejected') {
                                            <span class="inline-flex items-center px-2 py-1 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                                                {{ 'report.rejected' | t }}
                                            </span>
                                        }
                                    }
                                </td>
                            </tr>
                        }
                        @if (filteredReports().length === 0) {
                            <tr>
                                <td colspan="5" class="p-12 text-center">
                                    <div class="flex flex-col items-center gap-2 text-[var(--text-muted)]">
                                        <span class="material-icons text-4xl opacity-20">history</span>
                                        <p class="italic">{{ 'reportList.noResults' | t }}</p>
                                    </div>
                                </td>
                            </tr>
                        }
                    </tbody>
                </table>
            </div>
        </div>

      </div>
    </main>
  `
})
export class ReportListComponent {
  searchQuery = signal('');

  reports = signal<ReportRecord[]>([
    { id: '1', target: 'MapHackUser99', reason: 'mh', date: '2024-03-01', status: 'processed', reporter: 'System_Guard' },
    { id: '2', target: 'Toxic_Kid_01', reason: 'abuse', date: '2024-02-28', status: 'pending', reporter: 'Player_A' },
    { id: '3', target: 'Feeder_Pro', reason: 'feed', date: '2024-02-20', status: 'processed', reporter: 'Player_B' },
    { id: '4', target: 'AFK_Master', reason: 'afk', date: '2024-01-15', status: 'rejected', reporter: 'Player_C' },
    { id: '5', target: 'Cheater_CC', reason: 'mh', date: '2024-03-02', status: 'processed', reporter: 'System_Guard' },
    { id: '6', target: 'Noob_Player', reason: 'other', date: '2024-02-10', status: 'rejected', reporter: 'Player_D' },
    { id: '7', target: 'Griefer_X', reason: 'other', date: '2024-02-25', status: 'pending', reporter: 'Player_E' },
  ]);

  filteredReports = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return this.reports();
    return this.reports().filter(r => 
      r.target.toLowerCase().includes(query) || 
      r.reporter.toLowerCase().includes(query)
    );
  });
}
