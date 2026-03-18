import { Component, inject } from '@angular/core';
import { ThemeService } from '../core/theme.service';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '../core/i18n/translate.pipe';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  template: `
    <footer class="border-t border-white/5 bg-[var(--bg-footer)] py-6 px-6 md:px-10 relative z-10">
        <div class="max-w-7xl mx-auto flex flex-col lg:flex-row justify-between gap-6 md:gap-12">
            <!-- 赛季信息 (更显眼) -->
            <div class="lg:max-w-[200px] w-full bg-accent/5 border border-accent/20 p-4 rounded-xl space-y-3 shadow-lg">
                <h4 class="text-accent font-black uppercase text-[10px] flex items-center gap-2">
                    <span class="w-1 h-3 bg-accent rounded-full"></span>
                    {{ 'footer.seasonInfo' | t }}
                </h4>
                <div class="space-y-2 font-mono text-[9px] uppercase">
                    <div class="flex justify-between border-b border-white/5 pb-1">
                        <span class="opacity-50">{{ 'footer.start' | t }}:</span>
                        <span class="font-bold">2026/03/01</span>
                    </div>
                    <div class="flex justify-between border-b border-white/5 pb-1">
                        <span class="opacity-50">{{ 'footer.end' | t }}:</span>
                        <span class="font-bold">2026/06/01</span>
                    </div>
                    <div class="flex justify-between text-green-500 font-black pt-1">
                        <span>{{ 'footer.status' | t }}:</span>
                        <span class="animate-pulse">{{ 'footer.ongoing' | t }}</span>
                    </div>
                </div>
            </div>

            <!-- 紧凑链接列表 -->
            <div class="grid grid-cols-3 sm:grid-cols-3 gap-x-2 gap-y-2 flex-grow">
                <a routerLink="/ladder" class="text-accent font-bold hover:text-white transition-colors text-[9px] uppercase">{{ 'nav.ladder' | t }}</a>
                <a routerLink="/ladder" [queryParams]="{ tab: 'solo' }" class="text-[var(--text-muted)] hover:text-accent transition-colors text-[9px]">{{ 'ladder.solo' | t }}</a>
                <a routerLink="/ladder" [queryParams]="{ tab: 'team' }" class="text-[var(--text-muted)] hover:text-accent transition-colors text-[9px]">{{ 'ladder.team' | t }}</a>
                <a routerLink="/report" class="text-accent font-bold hover:text-white transition-colors text-[9px] uppercase">{{ 'nav.report' | t }}</a>
                <a routerLink="/report-list" class="text-[var(--text-muted)] hover:text-accent transition-colors text-[9px]">{{ 'nav.reportList' | t }}</a>
                <a routerLink="/ban-list" class="text-[var(--text-muted)] hover:text-accent transition-colors text-[9px]">{{ 'nav.ban' | t }}</a>
                <a routerLink="/contact" class="text-accent font-bold hover:text-white transition-colors text-[9px] uppercase">{{ 'nav.support' | t }}</a>
                <a routerLink="/chat" class="text-[var(--text-muted)] hover:text-accent transition-colors text-[9px]">{{ 'nav.onlineSupport' | t }}</a>
                <a routerLink="/faq" class="text-[var(--text-muted)] hover:text-accent transition-colors text-[9px]">{{ 'nav.faq' | t }}</a>
            </div>
            
            <!-- 平台概况部分 -->
            <div class="lg:max-w-xs space-y-2 border-t lg:border-t-0 lg:border-l border-white/5 pt-4 lg:pt-0 lg:pl-10">
                <h4 class="text-accent font-bold uppercase text-[10px]">{{ 'footer.platformOverview' | t }}</h4>
                <a routerLink="/about" class="text-white hover:text-accent transition-colors font-bold block text-[10px]">{{ 'footer.aboutUs' | t }}</a>
                <p class="text-[var(--text-muted)] leading-relaxed text-[10px] normal-case opacity-80">
                    {{ 'footer.desc' | t }}
                </p>
            </div>
        </div>
        
        <!-- 版权信息 -->
        <div class="text-center mt-6 pt-4 border-t border-white/5 opacity-30 text-[9px] font-medium tracking-wide flex flex-col items-center gap-1">
            <span>{{ 'footer.copyright' | t }}</span>
            <span class="opacity-80">{{ 'footer.icp' | t }}</span>
            <span class="opacity-50 mt-1 font-mono">v1.2.0 (Build 20260314)</span>
        </div>
    </footer>
  `
})
export class FooterComponent {
  themeService = inject(ThemeService);
}
