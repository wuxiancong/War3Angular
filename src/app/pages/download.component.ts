import { Component, signal } from '@angular/core';
import { TranslatePipe } from '../core/i18n/translate.pipe';

type DownloadKey = 'main' | 'warcraft' | 'maps' | 'tools';

@Component({
  selector: 'app-download',
  standalone: true,
  imports: [TranslatePipe],
  host: { class: 'flex flex-col flex-grow' },
  template: `
    <main class="flex-grow py-8 px-4 md:px-8 bg-transparent text-[var(--text-main)]">
      <div class="max-w-7xl mx-auto space-y-12">
        
        <!-- 头部：主客户端下载 -->
        <div id="client" class="scroll-mt-32 relative bg-[var(--card-bg)] backdrop-blur-md rounded-2xl p-6 md:p-12 shadow-2xl border border-[var(--border)] overflow-hidden group">
            <!-- 背景装饰 -->
            <div class="absolute top-0 right-0 w-full md:w-1/2 h-full bg-gradient-to-b md:bg-gradient-to-l from-accent/10 to-transparent pointer-events-none"></div>
            <div class="absolute -bottom-10 -right-10 w-48 h-48 md:w-64 md:h-64 bg-accent/5 rounded-full blur-3xl pointer-events-none"></div>

            <div class="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-8">
                <div class="space-y-4 max-w-2xl text-center lg:text-left">
                    <h1 class="text-3xl sm:text-4xl md:text-5xl font-black italic text-[var(--text-main)] tracking-wider uppercase">
                        {{ 'download.title' | t }}
                    </h1>
                    <p class="text-base md:text-lg text-[var(--text-muted)] font-light">
                        {{ 'download.subtitle' | t }}
                    </p>
                    
                    <div class="flex flex-wrap justify-center lg:justify-start gap-4 md:gap-6 text-xs md:text-sm font-mono text-[var(--text-muted)] mt-4">
                        <div class="flex items-center gap-2">
                            <span class="material-icons text-accent text-base">info</span>
                            <span>{{ 'download.version' | t }}: <span class="text-[var(--text-main)] font-bold">2.0.4.12</span></span>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="material-icons text-accent text-base">sd_storage</span>
                            <span>{{ 'download.size' | t }}: <span class="text-[var(--text-main)] font-bold">128 MB</span></span>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="material-icons text-accent text-base">calendar_today</span>
                            <span>{{ 'download.date' | t }}: <span class="text-[var(--text-main)] font-bold">2023-10-26</span></span>
                        </div>
                    </div>
                </div>

                <div class="flex flex-col items-center gap-4 w-full lg:w-auto">
                    <button (click)="startDownload('main')"
                            [class.brightness-110]="downloads().main.isDownloading"
                            class="group relative overflow-hidden w-full sm:w-[360px] px-8 py-4 bg-accent text-[var(--text-inverted)] text-lg md:text-xl font-black uppercase rounded shadow-[0_0_20px_rgba(var(--accent-rgb),0.4)] hover:brightness-110 hover:shadow-[0_0_30px_rgba(var(--accent-rgb),0.6)] transition-all flex items-center justify-center gap-3">
                        
                        <!-- Progress Background -->
                        <div class="absolute inset-0 bg-white/30 origin-left transition-all duration-200 ease-out"
                             [class.transition-none]="!downloads().main.isDownloading"
                             [style.transform]="'scaleX(' + (downloads().main.isDownloading ? downloads().main.progress / 100 : 0) + ')'"></div>
                             
                        <span class="relative z-10 flex items-center justify-center gap-3">
                            @if (downloads().main.isDownloading) {
                                <span class="material-icons animate-spin text-3xl">autorenew</span>
                                <span>正在下载... {{ downloads().main.progress }}%</span>
                            } @else {
                                <span class="material-icons" [class.group-hover:animate-bounce]="isLoaded()">download</span>
                                <span>{{ 'download.downloadBtn' | t }}</span>
                            }
                        </span>
                    </button>
                    <a href="#" class="text-xs text-[var(--text-muted)] hover:text-[var(--text-hover)] underline decoration-dashed underline-offset-4 transition-colors">
                        {{ 'download.manual' | t }}
                    </a>
                </div>
            </div>
        </div>

        <!-- 资源网格 -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <!-- 魔兽争霸 III -->
            <div id="warcraft" class="scroll-mt-32 bg-[var(--card-bg)] backdrop-blur-md p-6 rounded-xl border border-[var(--border)] hover:border-accent/50 shadow-xl transition-all group">
                <div class="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <span class="material-icons text-2xl">sports_esports</span>
                </div>
                <h3 class="text-xl font-bold text-[var(--text-main)] mb-2">{{ 'download.warcraft' | t }}</h3>
                <p class="text-sm text-[var(--text-muted)] mb-4 h-10 line-clamp-2">纯净版本，无插件。CC对战平台必备。</p>
                <button (click)="startDownload('warcraft')"
                        class="relative overflow-hidden w-full py-2 bg-[var(--secondary)] hover:brightness-110 text-[var(--text-main)] text-sm font-bold uppercase rounded border border-[var(--border)] transition-all flex items-center justify-center gap-2 group">
                    <div class="absolute inset-0 bg-accent/40 origin-left transition-all duration-200 ease-out"
                         [class.transition-none]="!downloads().warcraft.isDownloading"
                         [style.transform]="'scaleX(' + (downloads().warcraft.isDownloading ? downloads().warcraft.progress / 100 : 0) + ')'"></div>
                    <span class="relative z-10 flex items-center justify-center gap-2">
                        @if (downloads().warcraft.isDownloading) {
                            <span class="material-icons animate-spin text-sm">autorenew</span>
                            <span>下载中... {{ downloads().warcraft.progress }}%</span>
                        } @else {
                            <span class="material-icons" [class.group-hover:animate-bounce]="isLoaded()">download</span> 立即下载 (1.2 GB)
                        }
                    </span>
                </button>
            </div>

            <!-- 地图包 -->
            <div class="bg-[var(--card-bg)] backdrop-blur-md p-6 rounded-xl border border-[var(--border)] hover:border-accent/50 shadow-xl transition-all group">
                <div class="w-12 h-12 bg-green-500/20 text-green-400 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <span class="material-icons text-2xl">map</span>
                </div>
                <h3 class="text-xl font-bold text-[var(--text-main)] mb-2">{{ 'download.maps' | t }}</h3>
                <p class="text-sm text-[var(--text-muted)] mb-4 h-10 line-clamp-2">包含 6.83d, 6.88v, 7.00 及其他热门竞技地图。</p>
                <button (click)="startDownload('maps')"
                        class="relative overflow-hidden w-full py-2 bg-[var(--secondary)] hover:brightness-110 text-[var(--text-main)] text-sm font-bold uppercase rounded border border-[var(--border)] transition-all flex items-center justify-center gap-2 group">
                    <div class="absolute inset-0 bg-accent/40 origin-left transition-all duration-200 ease-out"
                         [class.transition-none]="!downloads().maps.isDownloading"
                         [style.transform]="'scaleX(' + (downloads().maps.isDownloading ? downloads().maps.progress / 100 : 0) + ')'"></div>
                    <span class="relative z-10 flex items-center justify-center gap-2">
                        @if (downloads().maps.isDownloading) {
                            <span class="material-icons animate-spin text-sm">autorenew</span>
                            <span>下载中... {{ downloads().maps.progress }}%</span>
                        } @else {
                            <span class="material-icons" [class.group-hover:animate-bounce]="isLoaded()">download</span> 立即下载 (450 MB)
                        }
                    </span>
                </button>
            </div>

            <!-- 辅助工具 -->
            <div class="bg-[var(--card-bg)] backdrop-blur-md p-6 rounded-xl border border-[var(--border)] hover:border-accent/50 shadow-xl transition-all group">
                <div class="w-12 h-12 bg-purple-500/20 text-purple-400 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <span class="material-icons text-2xl">build</span>
                </div>
                <h3 class="text-xl font-bold text-[var(--text-main)] mb-2">{{ 'download.tools' | t }}</h3>
                <p class="text-sm text-[var(--text-muted)] mb-4 h-10 line-clamp-2">改键工具（ War3Key）、版本切换器，录像分析器等辅助工具。</p>
                <button (click)="startDownload('tools')"
                        class="relative overflow-hidden w-full py-2 bg-[var(--secondary)] hover:brightness-110 text-[var(--text-main)] text-sm font-bold uppercase rounded border border-[var(--border)] transition-all flex items-center justify-center gap-2 group">
                    <div class="absolute inset-0 bg-accent/40 origin-left transition-all duration-200 ease-out"
                         [class.transition-none]="!downloads().tools.isDownloading"
                         [style.transform]="'scaleX(' + (downloads().tools.isDownloading ? downloads().tools.progress / 100 : 0) + ')'"></div>
                    <span class="relative z-10 flex items-center justify-center gap-2">
                        @if (downloads().tools.isDownloading) {
                            <span class="material-icons animate-spin text-sm">autorenew</span>
                            <span>下载中... {{ downloads().tools.progress }}%</span>
                        } @else {
                            <span class="material-icons" [class.group-hover:animate-bounce]="isLoaded()">download</span> 立即下载 (15 MB)
                        }
                    </span>
                </button>
            </div>
        </div>

        <!-- 系统需求 -->
        <div class="bg-[var(--card-bg)] backdrop-blur-md rounded-xl p-8 border border-[var(--border)] shadow-xl">
            <h2 class="text-2xl font-bold text-[var(--text-main)] mb-6 flex items-center gap-2">
                <span class="w-1 h-6 bg-accent rounded-full"></span>
                {{ 'download.requirements' | t }}
            </h2>
            
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <tbody class="divide-y divide-white/5 text-sm">
                        <tr>
                            <td class="py-4 font-bold text-[var(--text-muted)] w-1/4">{{ 'download.os' | t }}</td>
                            <td class="py-4 text-[var(--text-main)]">Windows 7 / 8 / 10 / 11 (推荐 64位)</td>
                        </tr>
                        <tr>
                            <td class="py-4 font-bold text-[var(--text-muted)]">{{ 'download.cpu' | t }}</td>
                            <td class="py-4 text-[var(--text-main)]">Intel Core i3 / AMD Ryzen 3 或更高</td>
                        </tr>
                        <tr>
                            <td class="py-4 font-bold text-[var(--text-muted)]">{{ 'download.ram' | t }}</td>
                            <td class="py-4 text-[var(--text-main)]">4 GB 内存 (推荐 8 GB)</td>
                        </tr>
                        <tr>
                            <td class="py-4 font-bold text-[var(--text-muted)]">{{ 'download.drivers' | t }}</td>
                            <td class="py-4 text-[var(--text-main)]">兼容 DirectX 9.0c 的显卡</td>
                        </tr>
                        <tr>
                            <td class="py-4 font-bold text-[var(--text-muted)]">{{ 'download.storage' | t }}</td>
                            <td class="py-4 text-[var(--text-main)]">5 GB 可用空间</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

      </div>
    </main>
  `
})
export class DownloadComponent {
  downloads = signal<Record<DownloadKey, { isDownloading: boolean, progress: number }>>({
    main: { isDownloading: false, progress: 0 },
    warcraft: { isDownloading: false, progress: 0 },
    maps: { isDownloading: false, progress: 0 },
    tools: { isDownloading: false, progress: 0 },
  });
  isLoaded = signal(false);

  constructor() {
    setTimeout(() => this.isLoaded.set(true), 500);
  }

  startDownload(key: DownloadKey) {
    if (this.downloads()[key].isDownloading) return;
    
    this.downloads.update(d => ({ ...d, [key]: { isDownloading: true, progress: 0 } }));
    
    const interval = setInterval(() => {
      this.downloads.update(d => {
        const currentProgress = d[key].progress;
        if (currentProgress >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            this.downloads.update(d2 => ({ ...d2, [key]: { isDownloading: false, progress: 0 } }));
          }, 500);
          return { ...d, [key]: { ...d[key], progress: 100 } };
        }
        return { ...d, [key]: { ...d[key], progress: Math.min(100, currentProgress + Math.floor(Math.random() * 15) + 5) } };
      });
    }, 200);
  }
}
