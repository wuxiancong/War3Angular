import { Component } from '@angular/core';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [TranslatePipe, RouterLink],
  template: `
    <div class="min-h-screen bg-[var(--primary)] pt-24 pb-12 px-4 md:px-8">
      <div class="max-w-5xl mx-auto">
        <!-- 标题区 -->
        <div class="mb-12 text-center">
          <h1 class="text-4xl md:text-5xl font-black italic uppercase text-[var(--text-main)] tracking-tighter mb-4">
            {{ 'contact.title' | t }}
          </h1>
          <p class="text-[var(--text-muted)] max-w-2xl mx-auto">
            {{ 'contact.subtitle' | t }}
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <!-- QQ群 -->
          <div class="bg-[var(--secondary)] border border-white/5 p-8 rounded-xl hover:border-accent/30 transition-all group">
            <div class="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <span class="material-icons text-accent">groups</span>
            </div>
            <h3 class="text-xl font-bold text-[var(--text-main)] mb-2">{{ 'contact.qqGroup' | t }}</h3>
            <p class="text-sm text-[var(--text-muted)] mb-6">{{ 'contact.qqGroupDesc' | t }}</p>
            <div class="bg-[var(--primary)] p-3 rounded font-mono text-accent text-center border border-white/5">
              782934102
            </div>
          </div>

          <!-- 邮箱 -->
          <div class="bg-[var(--secondary)] border border-white/5 p-8 rounded-xl hover:border-accent/30 transition-all group">
            <div class="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <span class="material-icons text-accent">email</span>
            </div>
            <h3 class="text-xl font-bold text-[var(--text-main)] mb-2">{{ 'contact.email' | t }}</h3>
            <p class="text-sm text-[var(--text-muted)] mb-6">{{ 'contact.emailDesc' | t }}</p>
            <div class="bg-[var(--primary)] p-3 rounded font-mono text-accent text-center border border-white/5 break-all">
              support&#64;ccbattle.net
            </div>
          </div>

          <!-- Discord -->
          <div class="bg-[var(--secondary)] border border-white/5 p-8 rounded-xl hover:border-accent/30 transition-all group">
            <div class="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <span class="material-icons text-accent">forum</span>
            </div>
            <h3 class="text-xl font-bold text-[var(--text-main)] mb-2">{{ 'contact.discord' | t }}</h3>
            <p class="text-sm text-[var(--text-muted)] mb-6">{{ 'contact.discordDesc' | t }}</p>
            <a href="#" class="block bg-accent/10 p-3 rounded font-mono text-accent text-center border border-accent/20 hover:bg-accent hover:text-white transition-all">
              JOIN DISCORD
            </a>
          </div>
        </div>

        <!-- 服务时间 & FAQ -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <!-- 服务时间 -->
          <div class="bg-[var(--secondary)] border border-white/5 p-8 rounded-xl">
            <div class="flex items-center space-x-4 mb-6">
              <span class="material-icons text-accent">schedule</span>
              <h3 class="text-2xl font-bold text-[var(--text-main)]">{{ 'contact.workTime' | t }}</h3>
            </div>
            <div class="text-3xl font-black italic text-accent mb-4">
              {{ 'contact.workTimeVal' | t }}
            </div>
            <p class="text-[var(--text-muted)] text-sm leading-relaxed mb-6">
              我们会在服务时间内尽快回复您的咨询。非服务时间的留言我们将在次日优先处理。
            </p>
            <a routerLink="/chat" class="inline-flex items-center space-x-2 bg-accent text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-accent/20 hover:scale-105 active:scale-95 transition-all">
              <span class="material-icons">chat</span>
              <span>{{ 'nav.onlineSupport' | t }}</span>
            </a>
          </div>

          <!-- FAQ -->
          <div class="bg-[var(--secondary)] border border-white/5 p-8 rounded-xl">
            <h3 class="text-2xl font-bold text-[var(--text-main)] mb-6">{{ 'contact.faq' | t }}</h3>
            <div class="space-y-6">
              <div>
                <p class="text-accent font-bold mb-1">{{ 'contact.faq1' | t }}</p>
                <p class="text-[var(--text-muted)] text-sm">{{ 'contact.ans1' | t }}</p>
              </div>
              <div>
                <p class="text-accent font-bold mb-1">{{ 'contact.faq2' | t }}</p>
                <p class="text-[var(--text-muted)] text-sm">{{ 'contact.ans2' | t }}</p>
              </div>
              <div>
                <p class="text-accent font-bold mb-1">{{ 'contact.faq3' | t }}</p>
                <p class="text-[var(--text-muted)] text-sm">{{ 'contact.ans3' | t }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
  `]
})
export class ContactComponent {}
