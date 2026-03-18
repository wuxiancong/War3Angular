import { Component } from '@angular/core';
import { TranslatePipe } from '../core/i18n/translate.pipe';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [TranslatePipe],
  host: { class: 'flex flex-col flex-grow' },
  template: `
    <main class="flex-grow py-12 px-4 md:px-10">
      <div class="max-w-4xl mx-auto space-y-12">
        <div class="text-center space-y-4">
          <h1 class="text-4xl md:text-6xl font-black italic uppercase tracking-tighter text-accent">{{ 'about.title' | t }}</h1>
          <p class="text-[var(--text-muted)] tracking-[0.4em] uppercase text-xs">{{ 'about.subtitle' | t }}</p>
        </div>

        <div class="grid grid-cols-1 gap-8">
          <div class="bg-[var(--card-bg)] backdrop-blur-md border border-[var(--border)] p-8 rounded-2xl space-y-6">
            <div class="space-y-4">
              <h2 class="text-2xl font-bold text-white italic uppercase tracking-wider">{{ 'about.visionTitle' | t }}</h2>
              <p class="text-[var(--text-muted)] leading-relaxed">
                {{ 'about.visionDesc' | t }}
              </p>
            </div>

            <div class="space-y-4">
              <h2 class="text-2xl font-bold text-white italic uppercase tracking-wider">{{ 'about.techTitle' | t }}</h2>
              <p class="text-[var(--text-muted)] leading-relaxed">
                {{ 'about.techDesc' | t }}
              </p>
            </div>

            <div class="space-y-4">
              <h2 class="text-2xl font-bold text-white italic uppercase tracking-wider">{{ 'about.communityTitle' | t }}</h2>
              <p class="text-[var(--text-muted)] leading-relaxed">
                {{ 'about.communityDesc' | t }}
              </p>
            </div>
          </div>
        </div>

        <div class="text-center pt-8">
          <p class="text-[var(--text-muted)] italic">"{{ 'about.quote' | t }}"</p>
        </div>
      </div>
    </main>
  `
})
export class AboutComponent {}
