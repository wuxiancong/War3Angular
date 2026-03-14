import { Component, inject } from '@angular/core';
import { ThemeService } from '../core/theme.service';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink],
  template: `
    <footer class="border-t border-white/5 bg-[var(--bg-footer)] py-6 px-6 md:px-10 relative z-10">
        <div class="max-w-7xl mx-auto flex flex-col lg:flex-row justify-between gap-6 md:gap-12">
            <!-- 赛季信息 (更显眼) -->
            <div class="lg:max-w-[200px] w-full bg-accent/5 border border-accent/20 p-4 rounded-xl space-y-3 shadow-lg">
                <h4 class="text-accent font-black uppercase text-[10px] flex items-center gap-2">
                    <span class="w-1 h-3 bg-accent rounded-full"></span>
                    赛季信息
                </h4>
                <div class="space-y-2 font-mono text-[9px] uppercase">
                    <div class="flex justify-between border-b border-white/5 pb-1">
                        <span class="opacity-50">开始:</span>
                        <span class="font-bold">2026/03/01</span>
                    </div>
                    <div class="flex justify-between border-b border-white/5 pb-1">
                        <span class="opacity-50">结束:</span>
                        <span class="font-bold">2026/06/01</span>
                    </div>
                    <div class="flex justify-between text-green-500 font-black pt-1">
                        <span>状态:</span>
                        <span class="animate-pulse">进行中</span>
                    </div>
                </div>
            </div>

            <!-- 紧凑链接列表 -->
            <div class="grid grid-cols-3 sm:grid-cols-3 gap-x-2 gap-y-2 flex-grow">
                <a routerLink="/ladder" class="text-accent font-bold hover:text-white transition-colors text-[9px] uppercase">天梯排行</a>
                <a routerLink="/ladder" [queryParams]="{ tab: 'solo' }" class="text-[var(--text-muted)] hover:text-accent transition-colors text-[9px]">个人排行</a>
                <a routerLink="/ladder" [queryParams]="{ tab: 'team' }" class="text-[var(--text-muted)] hover:text-accent transition-colors text-[9px]">战队排行</a>
                <a routerLink="/report" class="text-accent font-bold hover:text-white transition-colors text-[9px] uppercase">玩家举报</a>
                <a routerLink="/report-list" class="text-[var(--text-muted)] hover:text-accent transition-colors text-[9px]">公示信息</a>
                <a routerLink="/ban-list" class="text-[var(--text-muted)] hover:text-accent transition-colors text-[9px]">封号名单</a>
                <a routerLink="/contact" class="text-accent font-bold hover:text-white transition-colors text-[9px] uppercase">联系客服</a>
                <a routerLink="/chat" class="text-[var(--text-muted)] hover:text-accent transition-colors text-[9px]">在线咨询</a>
                <a routerLink="/faq" class="text-[var(--text-muted)] hover:text-accent transition-colors text-[9px]">常见问题</a>
            </div>
            
            <!-- 平台概况部分 -->
            <div class="lg:max-w-xs space-y-2 border-t lg:border-t-0 lg:border-l border-white/5 pt-4 lg:pt-0 lg:pl-10">
                <h4 class="text-accent font-bold uppercase text-[10px]">平台概况</h4>
                <a routerLink="/about" class="text-white hover:text-accent transition-colors font-bold block text-[10px]">关于我们</a>
                <p class="text-[var(--text-muted)] leading-relaxed text-[10px] normal-case opacity-80">
                    CC对战平台是专为Dota爱好者打造的竞技社区，提供低延迟、高公平性的对战体验，致力于还原最纯粹的竞技环境。
                </p>
            </div>
        </div>
        
        <!-- 版权信息 -->
        <div class="text-center mt-6 pt-4 border-t border-white/5 opacity-30 text-[9px] font-medium tracking-wide flex flex-col items-center gap-1">
            <span>Copyright©2026 CC对战平台 版权所有</span>
            <span class="opacity-80">黔ICP备00000000号-0</span>
            <span class="opacity-50 mt-1 font-mono">v1.2.0 (Build 20260314)</span>
        </div>
    </footer>
  `
})
export class FooterComponent {
  themeService = inject(ThemeService);
}
