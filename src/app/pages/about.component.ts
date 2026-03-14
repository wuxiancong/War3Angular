import { Component } from '@angular/core';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [],
  host: { class: 'flex flex-col flex-grow' },
  template: `
    <main class="flex-grow py-12 px-4 md:px-10">
      <div class="max-w-4xl mx-auto space-y-12">
        <div class="text-center space-y-4">
          <h1 class="text-4xl md:text-6xl font-black italic uppercase tracking-tighter text-accent">关于我们</h1>
          <p class="text-[var(--text-muted)] tracking-[0.4em] uppercase text-xs">ABOUT CC BATTLE PLATFORM</p>
        </div>

        <div class="grid grid-cols-1 gap-8">
          <div class="bg-[var(--card-bg)] backdrop-blur-md border border-[var(--border)] p-8 rounded-2xl space-y-6">
            <div class="space-y-4">
              <h2 class="text-2xl font-bold text-white italic uppercase tracking-wider">我们的愿景</h2>
              <p class="text-[var(--text-muted)] leading-relaxed">
                CC对战平台由一群热爱 Dota 的老玩家共同发起。我们的目标是为所有热爱这款经典游戏的玩家提供一个稳定、公平、低延迟的竞技环境。
              </p>
            </div>

            <div class="space-y-4">
              <h2 class="text-2xl font-bold text-white italic uppercase tracking-wider">技术核心</h2>
              <p class="text-[var(--text-muted)] leading-relaxed">
                我们采用了先进的网络同步技术，针对 v1.26 版本进行了深度优化，确保在各种网络环境下都能拥有流畅的操作体验。同时，我们自主研发了高效的防作弊系统，对破坏游戏公平性的行为零容忍。
              </p>
            </div>

            <div class="space-y-4">
              <h2 class="text-2xl font-bold text-white italic uppercase tracking-wider">社区驱动</h2>
              <p class="text-[var(--text-muted)] leading-relaxed">
                我们相信社区的力量。平台的功能开发和规则制定都将广泛听取玩家的意见。在这里，每一个玩家都是传奇的延续者。
              </p>
            </div>
          </div>
        </div>

        <div class="text-center pt-8">
          <p class="text-[var(--text-muted)] italic">"不忘初心，砥砺前行。承载热血，让经典传奇在指尖延续。"</p>
        </div>
      </div>
    </main>
  `
})
export class AboutComponent {}
