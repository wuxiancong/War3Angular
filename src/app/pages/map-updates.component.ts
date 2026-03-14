import { Component, signal, computed, effect, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { I18nService } from '../core/i18n/i18n.service';
import { AIService } from '../core/ai.service';
import { DOTA_HEROES } from '../data/heroes';

interface MapVersion {
  id: string;
  name: string;
  thumbnail: string;
  stability: number;
  balance: number;
  features: number;
  popularity: number;
  description: string;
}

interface HeroStats {
  strGrowth: string;
  agiGrowth: string;
  intGrowth: string;
  moveSpeed: string;
  castPoint: string;
  skillChanges: string;
}

interface HeroData {
  id: string;
  name: string;
  stats: Record<string, HeroStats>;
}

@Component({
  selector: 'app-map-updates',
  standalone: true,
  imports: [TranslatePipe],
  host: { class: 'flex flex-col flex-grow' },
  template: `
    <main class="flex-grow py-8 px-4 md:px-8 bg-transparent text-[var(--text-main)]">
      <div class="max-w-7xl mx-auto space-y-12">
        
        <!-- 头部 -->
        <div class="text-center space-y-4">
          <h1 class="text-3xl md:text-5xl font-black italic tracking-wider uppercase text-[var(--text-main)]">
            {{ 'mapUpdates.title' | t }}
          </h1>
          <p class="text-[var(--text-muted)] max-w-2xl mx-auto font-light">
            {{ 'mapUpdates.subtitle' | t }}
          </p>
        </div>

        <!-- 同步更新卡片 -->
        <div class="bg-[var(--card-bg)] backdrop-blur-md rounded-2xl p-8 border border-[var(--border)] shadow-2xl relative overflow-hidden group">
            <div class="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-accent/5 to-transparent pointer-events-none"></div>
            
            <div class="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
                <div class="space-y-2 text-center md:text-left">
                    <h2 class="text-2xl font-bold flex items-center gap-3 justify-center md:justify-start">
                        <span class="material-icons text-accent">sync</span>
                        {{ 'mapUpdates.update' | t }}
                    </h2>
                    <p class="text-sm text-[var(--text-muted)]">{{ 'mapUpdates.updateDesc' | t }}</p>
                </div>

                <div class="flex flex-col items-center gap-3">
                    <button (click)="startUpdate()" 
                            [disabled]="isUpdating()"
                            class="px-10 py-4 bg-accent text-[var(--text-inverted)] font-black uppercase rounded shadow-lg hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 min-w-[240px] justify-center">
                        @if (isUpdating()) {
                            <span class="material-icons animate-spin">autorenew</span>
                            {{ 'mapUpdates.updating' | t }} ({{ updateProgress() }}%)
                        } @else if (updateComplete()) {
                            <span class="material-icons">check_circle</span>
                            {{ 'mapUpdates.updateSuccess' | t }}
                        } @else {
                            <span class="material-icons">download</span>
                            {{ 'mapUpdates.update' | t }}
                        }
                    </button>
                    @if (isUpdating()) {
                        <div class="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                            <div class="h-full bg-accent transition-all duration-300" [style.width.%]="updateProgress()"></div>
                        </div>
                    }
                </div>
            </div>
        </div>

        <!-- 地图列表与对比 -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <!-- 流行地图列表 -->
            <div class="space-y-6">
                <h3 class="text-xl font-black uppercase tracking-widest flex items-center gap-3">
                    <span class="w-1 h-6 bg-accent rounded-full"></span>
                    {{ 'mapUpdates.popularMaps' | t }}
                </h3>
                
                <div class="space-y-4">
                    @for (map of maps(); track map.id) {
                        <button class="w-full text-left bg-[var(--card-bg)] rounded-xl border border-[var(--border)] hover:border-accent/30 transition-all cursor-pointer group overflow-hidden flex flex-col sm:flex-row"
                             [class.border-accent]="selectedMapId() === map.id"
                             (click)="selectedMapId.set(map.id)">
                            <!-- 地图缩略图 -->
                            <div class="w-full sm:w-48 h-32 sm:h-auto overflow-hidden shrink-0 relative">
                                <img [src]="map.thumbnail" 
                                     alt="{{map.name}}" 
                                     class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                     referrerpolicy="no-referrer">
                                <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent sm:hidden"></div>
                            </div>

                            <div class="p-5 flex-grow">
                                <div class="flex justify-between items-start mb-3">
                                    <h4 class="text-lg font-bold text-[var(--text-main)] group-hover:text-accent transition-colors">{{ map.name }}</h4>
                                    <span class="px-2 py-1 bg-accent/10 text-accent text-[10px] font-bold rounded uppercase tracking-tighter">
                                        {{ map.id === '6.83d' ? 'Classic' : (map.id === '6.88v' ? 'Stable' : 'New') }}
                                    </span>
                                </div>
                                <p class="text-sm text-[var(--text-muted)] leading-relaxed mb-4 line-clamp-2">
                                    {{ 'mapUpdates.features.v' + map.id.replace('.', '') | t }}
                                </p>
                                
                                <!-- 简易评分条 -->
                                <div class="grid grid-cols-2 gap-x-6 gap-y-2">
                                    <div class="space-y-1">
                                        <div class="flex justify-between text-[10px] uppercase font-bold text-[var(--text-muted)]">
                                            <span>{{ 'mapUpdates.diff.stability' | t }}</span>
                                            <span>{{ map.stability }}%</span>
                                        </div>
                                        <div class="h-1 bg-white/5 rounded-full overflow-hidden">
                                            <div class="h-full bg-blue-500" [style.width.%]="map.stability"></div>
                                        </div>
                                    </div>
                                    <div class="space-y-1">
                                        <div class="flex justify-between text-[10px] uppercase font-bold text-[var(--text-muted)]">
                                            <span>{{ 'mapUpdates.diff.balance' | t }}</span>
                                            <span>{{ map.balance }}%</span>
                                        </div>
                                        <div class="h-1 bg-white/5 rounded-full overflow-hidden">
                                            <div class="h-full bg-green-500" [style.width.%]="map.balance"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </button>
                    }
                </div>
            </div>

            <!-- 详细对比视图 -->
            <div class="space-y-6">
                <h3 class="text-xl font-black uppercase tracking-widest flex items-center gap-3">
                    <span class="w-1 h-6 bg-accent rounded-full"></span>
                    {{ 'mapUpdates.comparison' | t }}
                </h3>

                <div class="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] overflow-hidden shadow-xl">
                    <div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse min-w-[400px]">
                            <thead>
                                <tr class="bg-white/5">
                                    <th class="p-4 text-xs font-black uppercase text-[var(--text-muted)] border-b border-white/5">{{ 'mapUpdates.table.features' | t }}</th>
                                    @for (map of maps(); track map.id) {
                                        <th class="p-4 text-xs font-black uppercase text-center border-b border-white/5"
                                            [class.text-accent]="selectedMapId() === map.id">
                                            {{ map.id }}
                                        </th>
                                    }
                                </tr>
                            </thead>
                            <tbody class="text-sm divide-y divide-white/5">
                                <tr>
                                    <td class="p-4 font-medium text-[var(--text-muted)]">{{ 'mapUpdates.diff.stability' | t }}</td>
                                    @for (map of maps(); track map.id) {
                                        <td class="p-4 text-center">
                                            <div class="flex justify-center">
                                                @for (star of [1,2,3,4,5]; track star) {
                                                    <span class="material-icons text-[12px]" [class.text-accent]="star <= map.stability/20" [class.opacity-20]="star > map.stability/20">star</span>
                                                }
                                            </div>
                                        </td>
                                    }
                                </tr>
                                <tr>
                                    <td class="p-4 font-medium text-[var(--text-muted)]">{{ 'mapUpdates.diff.balance' | t }}</td>
                                    @for (map of maps(); track map.id) {
                                        <td class="p-4 text-center">
                                            <div class="flex justify-center">
                                                @for (star of [1,2,3,4,5]; track star) {
                                                    <span class="material-icons text-[12px]" [class.text-accent]="star <= map.balance/20" [class.opacity-20]="star > map.balance/20">star</span>
                                                }
                                            </div>
                                        </td>
                                    }
                                </tr>
                                <tr>
                                    <td class="p-4 font-medium text-[var(--text-muted)]">{{ 'mapUpdates.diff.features' | t }}</td>
                                    @for (map of maps(); track map.id) {
                                        <td class="p-4 text-center">
                                            <div class="flex justify-center">
                                                @for (star of [1,2,3,4,5]; track star) {
                                                    <span class="material-icons text-[12px]" [class.text-accent]="star <= map.features/20" [class.opacity-20]="star > map.features/20">star</span>
                                                }
                                            </div>
                                        </td>
                                    }
                                </tr>
                                <tr>
                                    <td class="p-4 font-medium text-[var(--text-muted)]">{{ 'mapUpdates.diff.popularity' | t }}</td>
                                    @for (map of maps(); track map.id) {
                                        <td class="p-4 text-center">
                                            <div class="flex justify-center">
                                                @for (star of [1,2,3,4,5]; track star) {
                                                    <span class="material-icons text-[12px]" [class.text-accent]="star <= map.popularity/20" [class.opacity-20]="star > map.popularity/20">star</span>
                                                }
                                            </div>
                                        </td>
                                    }
                                </tr>
                                <tr>
                                    <td class="p-4 font-medium text-[var(--text-muted)]">{{ 'mapUpdates.table.engineFixes' | t }}</td>
                                    <td class="p-4 text-center text-red-500"><span class="material-icons">close</span></td>
                                    <td class="p-4 text-center text-green-500"><span class="material-icons">check</span></td>
                                    <td class="p-4 text-center text-green-500"><span class="material-icons">check</span></td>
                                </tr>
                                <tr>
                                    <td class="p-4 font-medium text-[var(--text-muted)]">{{ 'mapUpdates.table.bountyRunes' | t }}</td>
                                    <td class="p-4 text-center text-red-500"><span class="material-icons">close</span></td>
                                    <td class="p-4 text-center text-green-500"><span class="material-icons">check</span></td>
                                    <td class="p-4 text-center text-green-500"><span class="material-icons">check</span></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- 选中地图详情 -->
                <div class="bg-accent/5 border border-accent/20 rounded-xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h4 class="text-accent font-black uppercase text-sm mb-2">{{ 'mapUpdates.deepAnalysis' | t }}{{ selectedMap().name }}</h4>
                    <p class="text-sm leading-relaxed text-[var(--text-main)] opacity-80 italic">
                        "{{ selectedMap().description }}"
                    </p>
                </div>
            </div>
        </div>

        <!-- 英雄差异对比 -->
        <div class="space-y-8">
            <div class="flex flex-col md:flex-row items-center justify-between gap-4">
                <h3 class="text-2xl font-black uppercase tracking-widest flex items-center gap-3">
                    <span class="w-1 h-8 bg-accent rounded-full"></span>
                    {{ 'mapUpdates.heroComparison' | t }}
                </h3>
                
                <!-- 英雄选择器 -->
                <div class="flex flex-col items-end gap-4 w-full md:w-auto">
                    <!-- 模型切换 -->
                    <div class="flex items-center gap-3">
                        <span class="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">{{ 'mapUpdates.aiModel' | t }}:</span>
                        <div class="flex bg-white/5 p-1 rounded-lg border border-white/10">
                            <button (click)="selectedModel.set('deepseek')"
                                    [class.bg-accent]="selectedModel() === 'deepseek'"
                                    [class.text-white]="selectedModel() === 'deepseek'"
                                    class="px-3 py-1 rounded text-[10px] font-bold transition-all">DeepSeek</button>
                            <button (click)="selectedModel.set('gemini')"
                                    [class.bg-accent]="selectedModel() === 'gemini'"
                                    [class.text-white]="selectedModel() === 'gemini'"
                                    class="px-3 py-1 rounded text-[10px] font-bold transition-all">Gemini</button>
                        </div>
                    </div>

                    <div class="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
                        <div class="relative w-full md:w-64">
                            <div class="relative">
                                <span class="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-accent text-sm">person</span>
                                <input type="text" 
                                       [placeholder]="'mapUpdates.heroSelect' | t"
                                       [value]="heroSearchTerm()"
                                       (input)="heroSearchTerm.set($any($event.target).value); isDropdownOpen.set(true)"
                                       (focus)="isDropdownOpen.set(true); heroSearchTerm.set('')"
                                       (blur)="onBlur()"
                                       class="w-full dropdown-blur border border-[var(--border)] rounded-xl py-2.5 pl-10 pr-10 text-xs font-bold focus:outline-none focus:border-accent transition-all text-[var(--text-main)] shadow-inner cursor-pointer">
                                <button class="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-accent transition-colors"
                                        (mousedown)="$event.preventDefault(); toggleDropdown()">
                                    <span class="material-icons text-sm">{{ isDropdownOpen() ? 'expand_less' : 'expand_more' }}</span>
                                </button>
                            </div>
                            
                            @if (isDropdownOpen()) {
                                <div class="absolute top-full left-0 right-0 mt-2 dropdown-blur border border-[var(--border)] rounded-xl shadow-2xl max-h-64 overflow-y-auto z-50 custom-scrollbar py-1">
                                    @for (hero of filteredHeroes(); track hero) {
                                        <button (mousedown)="$event.preventDefault(); selectHero(hero)"
                                                class="w-full text-left px-4 py-2.5 text-xs font-bold transition-colors flex items-center justify-between group hover:bg-[var(--border)] hover:text-white"
                                                [class.text-accent]="selectedHeroName() === hero"
                                                [class.bg-[var(--border)]]="selectedHeroName() === hero"
                                                [class.text-[var(--text-main)]]="selectedHeroName() !== hero">
                                            <span>{{ hero }}</span>
                                            @if (selectedHeroName() === hero) {
                                                <span class="material-icons text-[14px]">check</span>
                                            }
                                        </button>
                                    }
                                    @if (filteredHeroes().length === 0) {
                                        <div class="px-4 py-4 text-xs text-[var(--text-muted)] text-center">{{ 'mapUpdates.noHeroFound' | t }}</div>
                                    }
                                </div>
                            }
                        </div>
                    </div>
                </div>
            </div>

            <div class="bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] overflow-hidden shadow-2xl relative">
                @if (isGenerating()) {
                    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm z-20 flex flex-col items-center justify-center gap-4">
                        <div class="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
                        <p class="text-accent font-black uppercase tracking-widest animate-pulse">{{ 'mapUpdates.loading' | t }}</p>
                    </div>
                } @else if (errorMessage()) {
                    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm z-20 flex flex-col items-center justify-center gap-4 p-8 text-center">
                        <span class="material-icons text-red-500 text-5xl">error_outline</span>
                        <p class="text-red-400 font-bold">{{ errorMessage() }}</p>
                        <button (click)="generateHeroComparison(selectedHeroName())" 
                                class="mt-4 px-6 py-2 bg-accent text-white rounded-full text-xs font-bold uppercase hover:brightness-110">
                            {{ 'mapUpdates.retry' | t }}
                        </button>
                    </div>
                }

                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse min-w-[600px]">
                        <thead>
                            <tr class="bg-white/5">
                                <th class="p-6 text-xs font-black uppercase text-[var(--text-muted)] border-b border-white/5">{{ 'mapUpdates.table.attributes' | t }}</th>
                                @for (map of maps(); track map.id) {
                                    <th class="p-6 text-xs font-black uppercase text-center border-b border-white/5">
                                        <div class="flex flex-col items-center gap-1">
                                            <span class="text-accent">{{ map.id }}</span>
                                            <span class="text-[8px] opacity-40">{{ map.name }}</span>
                                        </div>
                                    </th>
                                }
                            </tr>
                        </thead>
                        <tbody class="text-sm divide-y divide-white/5">
                            <tr>
                                <td class="p-6 font-bold text-[var(--text-muted)]">{{ 'mapUpdates.table.growth' | t }}</td>
                                @for (map of maps(); track map.id) {
                                    <td class="p-6 text-center">
                                        <div class="flex flex-col gap-1">
                                            <span class="text-red-400 font-mono">{{ heroComparisonData()?.stats?.[map.id]?.strGrowth || '--' }}</span>
                                            <span class="text-green-400 font-mono">{{ heroComparisonData()?.stats?.[map.id]?.agiGrowth || '--' }}</span>
                                            <span class="text-blue-400 font-mono">{{ heroComparisonData()?.stats?.[map.id]?.intGrowth || '--' }}</span>
                                        </div>
                                    </td>
                                }
                            </tr>
                            <tr>
                                <td class="p-6 font-bold text-[var(--text-muted)]">{{ 'mapUpdates.table.moveSpeed' | t }}</td>
                                @for (map of maps(); track map.id) {
                                    <td class="p-6 text-center font-mono text-lg">
                                        {{ heroComparisonData()?.stats?.[map.id]?.moveSpeed || '--' }}
                                    </td>
                                }
                            </tr>
                            <tr>
                                <td class="p-6 font-bold text-[var(--text-muted)]">{{ 'mapUpdates.table.castPoint' | t }}</td>
                                @for (map of maps(); track map.id) {
                                    <td class="p-6 text-center font-mono">
                                        {{ heroComparisonData()?.stats?.[map.id]?.castPoint || '--' }}
                                    </td>
                                }
                            </tr>
                            <tr>
                                <td class="p-6 font-bold text-[var(--text-muted)]">{{ 'mapUpdates.table.coreChanges' | t }}</td>
                                @for (map of maps(); track map.id) {
                                    <td class="p-6 text-center">
                                        <p class="text-xs leading-relaxed opacity-80 max-w-[200px] mx-auto">
                                            {{ heroComparisonData()?.stats?.[map.id]?.skillChanges || ('mapUpdates.loading' | t) }}
                                        </p>
                                    </td>
                                }
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            <p class="text-[10px] text-center text-[var(--text-muted)] opacity-50 italic">
                {{ 'mapUpdates.aiDisclaimer' | t }}
            </p>
        </div>

      </div>
    </main>
  `
})
export class MapUpdatesComponent {
  private i18n = inject(I18nService);
  private aiService = inject(AIService);
  private platformId = inject(PLATFORM_ID);
  isUpdating = signal(false);
  updateProgress = signal(0);
  updateComplete = signal(false);
  selectedMapId = signal('6.83d');
  
  // Hero selection
  heroSearchTerm = signal('影魔 (SF)');
  selectedHeroName = signal('影魔 (SF)');
  isDropdownOpen = signal(false);
  selectedModel = signal<'deepseek' | 'gemini'>('deepseek');
  isGenerating = signal(false);
  errorMessage = signal<string | null>(null);
  heroComparisonData = signal<HeroData | null>(null);

  allHeroes = DOTA_HEROES;

  filteredHeroes = computed(() => {
    const term = this.heroSearchTerm().toLowerCase();
    if (!term) return this.allHeroes;
    return this.allHeroes.filter(h => h.toLowerCase().includes(term));
  });

  onBlur() {
    setTimeout(() => {
      this.isDropdownOpen.set(false);
      this.heroSearchTerm.set(this.selectedHeroName());
    }, 150);
  }

  selectHero(hero: string) {
    this.selectedHeroName.set(hero);
    this.heroSearchTerm.set(hero);
    this.isDropdownOpen.set(false);
  }

  toggleDropdown() {
    if (this.isDropdownOpen()) {
      this.isDropdownOpen.set(false);
      this.heroSearchTerm.set(this.selectedHeroName());
    } else {
      this.isDropdownOpen.set(true);
      this.heroSearchTerm.set('');
    }
  }

  maps = computed<MapVersion[]>(() => [
    { 
      id: '6.83d', 
      name: this.i18n.t('mapUpdates.versions.v683d.name'), 
      thumbnail: 'assets/images/maps/dota-6-83d-map.png',
      stability: 98, 
      balance: 85, 
      features: 40, 
      popularity: 95,
      description: this.i18n.t('mapUpdates.versions.v683d.description')
    },
    { 
      id: '6.88v', 
      name: this.i18n.t('mapUpdates.versions.v688v.name'), 
      thumbnail: 'assets/images/maps/dota-6-88v-map.png',
      stability: 92, 
      balance: 95, 
      features: 65, 
      popularity: 70,
      description: this.i18n.t('mapUpdates.versions.v688v.description')
    },
    { 
      id: '6.88x', 
      name: this.i18n.t('mapUpdates.versions.v688x.name'), 
      thumbnail: 'assets/images/maps/dota-6-88x-map.png',
      stability: 95, 
      balance: 90, 
      features: 80, 
      popularity: 85,
      description: this.i18n.t('mapUpdates.versions.v688x.description')
    }
  ]);

  selectedMap = computed(() => this.maps().find(m => m.id === this.selectedMapId()) || this.maps()[0]);

  constructor() {
    effect(() => {
      const hero = this.selectedHeroName();
      this.selectedModel(); // Track model change
      if (hero) {
        this.generateHeroComparison(hero);
      }
    });
  }

  async generateHeroComparison(heroName: string) {
    if (!isPlatformBrowser(this.platformId) || typeof window === 'undefined') return;
    this.isGenerating.set(true);
    this.errorMessage.set(null);
    try {
      const promptTemplate = this.i18n.t('mapUpdates.prompt');
      const prompt = promptTemplate.replace(/\{hero\}/g, heroName);

      let text = '';
      if (this.selectedModel() === 'gemini') {
        text = await this.aiService.generateGeminiResponse(prompt);
      } else {
        const response = await fetch('/api/chat.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.selectedModel(),
            prompt: prompt
          })
        });

        if (!response.ok) {
          throw new Error('API request failed');
        }

        const responseData = await response.json();
        text = responseData.reply || '{}';
      }

      const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim() || '{}';
      const data = JSON.parse(cleanedText);
      this.heroComparisonData.set(data);
    } catch (error: unknown) {
      console.error('AI Generation Error:', error);
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('not configured')) {
        this.errorMessage.set(this.i18n.t('aiError.notConfigured'));
      } else if (msg.includes('Insufficient Balance')) {
        this.errorMessage.set(this.i18n.t('aiError.insufficientBalance'));
      } else if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
        this.errorMessage.set(this.i18n.t('aiError.quotaExhausted'));
      } else if (msg.includes('fetch')) {
        this.errorMessage.set(this.i18n.t('aiError.networkError'));
      } else {
        this.errorMessage.set(msg || this.i18n.t('aiError.generateFail'));
      }
    } finally {
      this.isGenerating.set(false);
    }
  }

  startUpdate() {
    if (this.isUpdating()) return;
    this.isUpdating.set(true);
    this.updateProgress.set(0);
    this.updateComplete.set(false);

    const interval = setInterval(() => {
      this.updateProgress.update(p => {
        if (p >= 100) {
          clearInterval(interval);
          this.isUpdating.set(false);
          this.updateComplete.set(true);
          return 100;
        }
        return p + Math.floor(Math.random() * 10) + 2;
      });
    }, 150);
  }
}
