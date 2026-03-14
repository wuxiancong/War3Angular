import { Component, signal } from '@angular/core';
import { TranslatePipe } from '../core/i18n/translate.pipe';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [TranslatePipe],
  host: { class: 'flex flex-col flex-grow' },
  template: `
    <main class="flex-grow flex flex-col items-center justify-center relative overflow-hidden min-h-[40vh] md:min-h-[50vh] bg-transparent py-4 md:py-8">
        
        <div class="portal-container mb-2 md:mb-4">
            <div class="energy-ring ring-1"></div><div class="energy-ring ring-2"></div><div class="energy-ring ring-3"></div>
        </div>

        <div class="text-center px-4 relative z-10 w-full max-w-7xl mx-auto">
            <h1 class="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-black italic text-[var(--text-main)] mb-2 md:mb-4 tracking-tighter uppercase drop-shadow-[0_0_30px_var(--accent-glow)] break-words">{{ 'hero.mainTitle' | t }}</h1>
            <div class="flex flex-col items-center mx-auto w-fit max-w-full">
                <p class="text-[10px] sm:text-xs tracking-[0.4em] sm:tracking-[0.8em] text-accent font-black uppercase mb-4 md:mb-6 whitespace-nowrap">{{ 'hero.subTitle' | t }}</p>
                
                <button (click)="startDownload()" 
                        [class.brightness-110]="isDownloading()"
                        class="group relative overflow-hidden bg-accent border-4 border-white/10 px-8 py-3 sm:py-4 text-lg sm:text-xl font-black italic tracking-widest hover:brightness-110 transition-all uppercase shadow-2xl text-[var(--text-inverted)] w-full inline-flex items-center justify-center">
                    
                    <!-- Progress Background -->
                    <div class="absolute inset-0 bg-white/30 origin-left transition-all duration-200 ease-out"
                         [class.transition-none]="!isDownloading()"
                         [style.transform]="'scaleX(' + (isDownloading() ? downloadProgress() / 100 : 0) + ')'"></div>
                         
                    <span class="relative z-10 flex items-center justify-center gap-3">
                        @if (isDownloading()) {
                            <span class="material-icons animate-spin">autorenew</span>
                            <span>正在下载... {{ downloadProgress() }}%</span>
                        } @else {
                            <span class="material-icons" [class.group-hover:animate-bounce]="isLoaded()">download</span>
                            <span>{{ 'hero.cta' | t }}</span>
                        }
                    </span>
                </button>
            </div>
        </div>
    </main>

    <!-- Features Section -->
    <section class="py-8 md:py-12 px-4 bg-transparent relative">
        <div class="max-w-7xl mx-auto">
            <h2 class="text-3xl md:text-5xl font-black italic text-center mb-8 tracking-tighter uppercase">
                {{ 'home.featuresTitle' | t }}
            </h2>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                <!-- Matchmaking -->
                <div class="group p-8 bg-[var(--card-bg)] backdrop-blur-md border border-[var(--border)] hover:border-[var(--accent)] transition-all duration-500 rounded-2xl relative overflow-hidden shadow-xl">
                    <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <span class="material-icons text-6xl">groups</span>
                    </div>
                    <h3 class="text-xl font-bold mb-4 text-accent italic uppercase tracking-wider">{{ 'home.match.title' | t }}</h3>
                    <p class="text-[var(--text-muted)] leading-relaxed text-sm">{{ 'home.match.desc' | t }}</p>
                </div>

                <!-- Anti-Cheat -->
                <div class="group p-8 bg-[var(--card-bg)] backdrop-blur-md border border-[var(--border)] hover:border-[var(--accent)] transition-all duration-500 rounded-2xl relative overflow-hidden shadow-xl">
                    <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <span class="material-icons text-6xl">security</span>
                    </div>
                    <h3 class="text-xl font-bold mb-4 text-accent italic uppercase tracking-wider">{{ 'home.anticheat.title' | t }}</h3>
                    <p class="text-[var(--text-muted)] leading-relaxed text-sm">{{ 'home.anticheat.desc' | t }}</p>
                </div>

                <!-- Squad Booking -->
                <div class="group p-8 bg-[var(--card-bg)] backdrop-blur-md border border-[var(--border)] hover:border-[var(--accent)] transition-all duration-500 rounded-2xl relative overflow-hidden shadow-xl">
                    <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <span class="material-icons text-6xl">event_available</span>
                    </div>
                    <h3 class="text-xl font-bold mb-4 text-accent italic uppercase tracking-wider">{{ 'home.squad.title' | t }}</h3>
                    <p class="text-[var(--text-muted)] leading-relaxed text-sm">{{ 'home.squad.desc' | t }}</p>
                </div>

                <!-- Report System -->
                <div class="group p-8 bg-[var(--card-bg)] backdrop-blur-md border border-[var(--border)] hover:border-[var(--accent)] transition-all duration-500 rounded-2xl relative overflow-hidden shadow-xl">
                    <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <span class="material-icons text-6xl">gavel</span>
                    </div>
                    <h3 class="text-xl font-bold mb-4 text-accent italic uppercase tracking-wider">{{ 'home.report.title' | t }}</h3>
                    <p class="text-[var(--text-muted)] leading-relaxed text-sm">{{ 'home.report.desc' | t }}</p>
                </div>
            </div>
        </div>
    </section>
  `
})
export class HomeComponent {
  isDownloading = signal(false);
  downloadProgress = signal(0);
  isLoaded = signal(false);

  constructor() {
    setTimeout(() => this.isLoaded.set(true), 500);
  }

  startDownload() {
    if (this.isDownloading()) return;
    this.isDownloading.set(true);
    this.downloadProgress.set(0);
    
    const interval = setInterval(() => {
      this.downloadProgress.update(p => {
        if (p >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            this.isDownloading.set(false);
            this.downloadProgress.set(0);
          }, 500);
          return 100;
        }
        return Math.min(100, p + Math.floor(Math.random() * 15) + 5);
      });
    }, 200);
  }
}

