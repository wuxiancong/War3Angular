import { Component } from '@angular/core';
import { TranslatePipe } from '../core/i18n/translate.pipe';

interface Update {
  version: string;
  date: string;
  title: string;
  content: string[];
}

@Component({
  selector: 'app-platform-updates',
  standalone: true,
  imports: [TranslatePipe],
  host: { class: 'flex flex-col flex-grow' },
  template: `
    <main class="flex-grow py-8 px-4 md:px-8 bg-transparent text-[var(--text-main)]">
      <div class="max-w-4xl mx-auto space-y-8">
        <h1 class="text-4xl font-black italic text-[var(--text-main)] tracking-wider uppercase">
          {{ 'platformUpdates.title' | t }}
        </h1>
        <p class="text-[var(--text-muted)]">{{ 'platformUpdates.subtitle' | t }}</p>
        
        <div class="space-y-6">
          @for (update of updates; track update.version) {
            <div class="bg-[var(--card-bg)] rounded-xl shadow-xl border border-[var(--border)] p-8">
              <div class="flex items-center justify-between mb-4">
                <h2 class="text-2xl font-bold text-accent">{{ update.title }} ({{ update.version }})</h2>
                <span class="text-sm text-[var(--text-muted)]">{{ update.date }}</span>
              </div>
              <ul class="list-disc list-inside space-y-2 text-[var(--text-main)]">
                @for (item of update.content; track item) {
                  <li>{{ item }}</li>
                }
              </ul>
            </div>
          }
        </div>
      </div>
    </main>
  `
})
export class PlatformUpdatesComponent {
  updates: Update[] = [
    {
      version: 'v2.1.0',
      date: '2026-03-05',
      title: '赛季更新与平衡性调整',
      content: [
        '开启全新竞技赛季，重置天梯积分。',
        '修复了部分地图中存在的卡顿Bug。',
        '优化了智能匹配算法，匹配速度提升 20%。'
      ]
    },
    {
      version: 'v2.0.5',
      date: '2026-02-20',
      title: '反外挂系统升级',
      content: [
        '升级内核级反外挂驱动，增强对新型全图外挂的检测能力。',
        '优化了举报系统，处理效率提升 30%。',
        '修复了客户端偶尔崩溃的问题。'
      ]
    }
  ];
}
