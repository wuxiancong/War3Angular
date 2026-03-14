import { Component, signal, inject } from '@angular/core';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { I18nService } from '../core/i18n/i18n.service';

interface Report {
  id: string;
  target: string;
  reason: string;
  date: string;
  status: 'pending' | 'processed' | 'rejected';
  matchId?: string;
}

@Component({
  selector: 'app-report',
  standalone: true,
  imports: [TranslatePipe, ReactiveFormsModule, RouterLink],
  host: { class: 'flex flex-col flex-grow' },
  template: `
    <main class="flex-grow py-8 px-4 md:px-8 bg-transparent text-[var(--text-main)]">
      <div class="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        <!-- 左侧：举报表单 -->
        <div class="lg:col-span-1 space-y-6">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <h1 class="text-3xl font-black italic text-[var(--text-main)] tracking-wider uppercase flex items-center gap-3">
                    <span class="text-red-500">🚨</span>
                    {{ 'report.title' | t }}
                </h1>
                <div class="flex items-center gap-2">
                    <button routerLink="/report-list" class="flex items-center gap-2 px-4 py-2 bg-[var(--secondary)] border border-white/10 rounded-lg text-sm font-bold hover:border-accent hover:text-accent transition-all group">
                        <span class="material-icons text-sm group-hover:rotate-12 transition-transform">list_alt</span>
                        {{ 'reportList.title' | t }}
                    </button>
                    <button routerLink="/ban-list" class="flex items-center gap-2 px-4 py-2 bg-[var(--secondary)] border border-white/10 rounded-lg text-sm font-bold hover:border-accent hover:text-accent transition-all group">
                        <span class="material-icons text-sm group-hover:rotate-12 transition-transform">gavel</span>
                        {{ 'banList.title' | t }}
                    </button>
                </div>
            </div>

            <div class="bg-[var(--card-bg)] backdrop-blur-md rounded-xl p-6 shadow-xl border border-[var(--border)]">
                <h2 class="text-xl font-bold text-[var(--text-main)] mb-6 border-b border-white/10 pb-2">{{ 'report.submitTitle' | t }}</h2>
                
                <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4">
                    <!-- 目标玩家 -->
                    <div class="space-y-1">
                        <label for="target" class="text-xs font-bold text-[var(--text-muted)] uppercase">{{ 'report.target' | t }}</label>
                        <input id="target" type="text" formControlName="target" class="w-full bg-[var(--secondary)] border border-white/10 rounded px-3 py-2 text-[var(--text-main)] focus:border-accent outline-none transition-colors" placeholder="Username">
                    </div>

                    <!-- 比赛ID -->
                    <div class="space-y-1">
                        <label for="matchId" class="text-xs font-bold text-[var(--text-muted)] uppercase">{{ 'report.matchId' | t }}</label>
                        <input id="matchId" type="text" formControlName="matchId" class="w-full bg-[var(--secondary)] border border-white/10 rounded px-3 py-2 text-[var(--text-main)] focus:border-accent outline-none transition-colors" placeholder="#12345678">
                    </div>

                    <!-- 理由 -->
                    <div class="space-y-1">
                        <label for="reason" class="text-xs font-bold text-[var(--text-muted)] uppercase">{{ 'report.reason' | t }}</label>
                        <select id="reason" formControlName="reason" class="w-full bg-[var(--secondary)] border border-white/10 rounded px-3 py-2 text-[var(--text-main)] focus:border-accent outline-none transition-colors appearance-none cursor-pointer">
                            <option value="mh">{{ 'report.types.mh' | t }}</option>
                            <option value="feed">{{ 'report.types.feed' | t }}</option>
                            <option value="afk">{{ 'report.types.afk' | t }}</option>
                            <option value="abuse">{{ 'report.types.abuse' | t }}</option>
                            <option value="other">{{ 'report.types.other' | t }}</option>
                        </select>
                    </div>

                    <!-- 描述 -->
                    <div class="space-y-1">
                        <label for="desc" class="text-xs font-bold text-[var(--text-muted)] uppercase">{{ 'report.desc' | t }}</label>
                        <textarea id="desc" formControlName="desc" rows="4" class="w-full bg-[var(--secondary)] border border-white/10 rounded px-3 py-2 text-[var(--text-main)] focus:border-accent outline-none transition-colors resize-none" placeholder="Details..."></textarea>
                    </div>

                    <!-- 上传录像 -->
                    <div class="space-y-1">
                        <label for="replay-upload" class="text-xs font-bold text-[var(--text-muted)] uppercase">{{ 'report.replay' | t }}</label>
                        <div class="relative group">
                            <input id="replay-upload"
                                   type="file" 
                                   (change)="onFileChange($event)" 
                                   accept=".w3g"
                                   class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10">
                            <div class="w-full bg-[var(--secondary)] border border-dashed border-white/20 rounded px-3 py-4 text-center transition-all group-hover:border-accent group-hover:bg-white/5">
                                @if (selectedFileName()) {
                                    <div class="flex items-center justify-center gap-2 text-accent">
                                        <span class="material-icons text-sm">description</span>
                                        <span class="text-sm truncate max-w-[200px]">{{ selectedFileName() }}</span>
                                    </div>
                                } @else {
                                    <div class="flex flex-col items-center gap-1 text-[var(--text-muted)]">
                                        <span class="material-icons">cloud_upload</span>
                                        <span class="text-[10px]">{{ 'report.replayHint' | t }}</span>
                                    </div>
                                }
                            </div>
                        </div>
                        @if (fileError()) {
                            <p class="text-red-500 text-[10px] mt-1 italic">{{ 'report.replayError' | t }}</p>
                        }
                    </div>

                    <button type="submit" [disabled]="form.invalid || isSubmitting() || !!fileError()" 
                            class="w-full py-3 mt-2 bg-red-600 hover:bg-red-500 text-white font-bold uppercase rounded shadow-lg shadow-red-600/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                        @if (isSubmitting()) {
                            <span class="material-icons animate-spin text-sm mr-2">autorenew</span>
                        }
                        {{ 'report.submit' | t }}
                    </button>
                </form>
            </div>
        </div>

        <!-- 右侧：举报记录 -->
        <div class="lg:col-span-2 space-y-6">
            <div class="flex justify-between items-end h-[44px]"> <!-- Align with h1 -->
                <h2 class="text-xl font-bold text-[var(--text-muted)] uppercase tracking-widest">{{ 'report.history' | t }}</h2>
            </div>

            <div class="bg-[var(--card-bg)] backdrop-blur-md rounded-xl shadow-xl border border-[var(--border)] overflow-hidden min-h-[500px]">
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="bg-[var(--primary)]/80 text-[10px] md:text-xs uppercase tracking-wider text-[var(--text-muted)]">
                                <th class="p-2 md:p-4 font-medium hidden sm:table-cell">{{ 'report.date' | t }}</th>
                                <th class="p-2 md:p-4 font-medium">{{ 'report.target' | t }}</th>
                                <th class="p-2 md:p-4 font-medium">{{ 'report.reason' | t }}</th>
                                <th class="p-2 md:p-4 font-medium hidden md:table-cell">{{ 'report.matchId' | t }}</th>
                                <th class="p-2 md:p-4 font-medium text-right">{{ 'report.status' | t }}</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-white/5">
                            @for (report of reports(); track report.id) {
                                <tr class="hover:bg-white/5 transition-colors">
                                    <td class="p-2 md:p-4 text-[var(--text-muted)] text-[10px] md:text-sm font-mono hidden sm:table-cell">{{ report.date }}</td>
                                    <td class="p-2 md:p-4 font-bold text-[var(--text-main)] text-xs md:text-base truncate max-w-[80px] md:max-w-none">{{ report.target }}</td>
                                    <td class="p-2 md:p-4 text-[10px] md:text-sm text-[var(--text-main)]">
                                        {{ ('report.types.' + report.reason) | t }}
                                    </td>
                                    <td class="p-2 md:p-4 text-[10px] md:text-sm font-mono text-accent hidden md:table-cell">
                                        {{ report.matchId || '-' }}
                                    </td>
                                    <td class="p-2 md:p-4 text-right">
                                        @if (report.status === 'pending') {
                                            <span class="inline-flex items-center px-1.5 py-0.5 md:px-2 md:py-1 rounded text-[8px] md:text-[10px] font-bold bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
                                                {{ 'report.pending' | t }}
                                            </span>
                                        } @else if (report.status === 'processed') {
                                            <span class="inline-flex items-center px-1.5 py-0.5 md:px-2 md:py-1 rounded text-[8px] md:text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/20">
                                                {{ 'report.processed' | t }}
                                            </span>
                                        } @else {
                                            <span class="inline-flex items-center px-1.5 py-0.5 md:px-2 md:py-1 rounded text-[8px] md:text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                                                {{ 'report.rejected' | t }}
                                            </span>
                                        }
                                    </td>
                                </tr>
                            }
                            @if (reports().length === 0) {
                                <tr>
                                    <td colspan="5" class="p-8 text-center text-[var(--text-muted)] italic">No reports found.</td>
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

      </div>
    </main>
  `
})
export class ReportComponent {
  fb = inject(FormBuilder);
  i18n = inject(I18nService);
  isSubmitting = signal(false);
  selectedFileName = signal<string | null>(null);
  fileError = signal<boolean>(false);
  
  MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  form = this.fb.group({
    target: ['', Validators.required],
    matchId: [''],
    reason: ['mh', Validators.required],
    desc: ['', Validators.required]
  });

  onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.selectedFileName.set(file.name);
      
      if (file.size > this.MAX_FILE_SIZE) {
        this.fileError.set(true);
      } else {
        this.fileError.set(false);
      }
    } else {
      this.selectedFileName.set(null);
      this.fileError.set(false);
    }
  }

  reports = signal<Report[]>([
    { id: '1', target: 'NoobMaster69', reason: 'mh', date: '2023-10-25', status: 'processed', matchId: '#882145' },
    { id: '2', target: 'Feeder_007', reason: 'feed', date: '2023-10-24', status: 'pending', matchId: '#882011' },
    { id: '3', target: 'ToxicPlayer', reason: 'abuse', date: '2023-10-20', status: 'rejected', matchId: '#881567' },
  ]);

  submit() {
    if (this.form.valid) {
      this.isSubmitting.set(true);
      
      // 模拟提交
      setTimeout(() => {
        const newReport: Report = {
          id: Date.now().toString(),
          target: this.form.get('target')?.value ?? '',
          reason: this.form.get('reason')?.value ?? 'mh',
          date: new Date().toISOString().split('T')[0],
          status: 'pending',
          matchId: this.form.get('matchId')?.value || undefined
        };

        this.reports.update(list => [newReport, ...list]);
        this.form.reset({ reason: 'mh' });
        this.selectedFileName.set(null);
        this.fileError.set(false);
        this.isSubmitting.set(false);
      }, 1000);
    }
  }
}
