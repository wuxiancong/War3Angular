import { Component, signal, inject, OnInit, computed, HostListener, ElementRef } from '@angular/core';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { NgClass, UpperCasePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RegionService } from '../core/region.service';

interface Player {
  rank: number;
  name: string;
  avatar: string;
  level: number;
  points: number;
  winRate: number;
  games: number;
  trend: 'up' | 'down' | 'same';
  trendValue: number;
  signatureHeroes: string[];
  region: string;
  status: 'online' | 'offline' | 'ingame';
}

@Component({
  selector: 'app-ladder',
  standalone: true,
  imports: [TranslatePipe, NgClass, UpperCasePipe, FormsModule],
  host: { class: 'flex flex-col flex-grow' },
  template: `
    <main class="flex-grow py-8 px-4 md:px-8 bg-transparent text-[var(--text-main)]">
      <div class="max-w-7xl mx-auto space-y-8">
        
        <!-- 标题与切换 -->
        <div class="flex flex-col md:flex-row justify-between items-center gap-6">
            <h1 class="text-4xl font-black italic text-[var(--text-main)] tracking-wider uppercase flex items-center gap-3">
                <span class="text-accent">🏆</span>
                {{ 'ladder.title' | t }}
            </h1>
            
            <div class="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
                <!-- 地区过滤下拉菜单 -->
                <div class="relative w-full sm:w-56" #regionDropdown>
                    <button (click)="toggleRegionDropdown()" 
                            class="w-full flex items-center justify-between bg-[var(--secondary)] border border-white/10 px-5 py-2.5 rounded-full cursor-pointer hover:bg-[var(--tertiary)] hover:border-accent/50 transition-all shadow-lg group">
                        <div class="flex items-center gap-3">
                            @if (selectedRegion() !== '全部') {
                                <img [src]="regionService.getRegionFlagUrl(selectedRegion())" 
                                     [alt]="selectedRegion()" 
                                     #selFlagImg
                                     (error)="selFlagImg.src = regionService.getRegionFlagBackupUrl(selectedRegion())"
                                     class="w-5 h-auto shadow-sm" 
                                     referrerpolicy="no-referrer">
                            } @else {
                                <span class="material-icons text-sm text-accent">public</span>
                            }
                            <span class="text-sm font-bold truncate tracking-wide">{{ selectedRegion() === '全部' ? '全部地区' : selectedRegion() }}</span>
                        </div>
                        <span class="material-icons text-lg transition-transform opacity-50 group-hover:opacity-100" [class.rotate-180]="isRegionDropdownOpen()">expand_more</span>
                    </button>

                    <!-- 下拉列表 -->
                    <div class="absolute top-full left-0 right-0 mt-3 bg-[#1f2833] border border-white/10 rounded-2xl shadow-2xl py-3 z-[120] overflow-hidden transition-all duration-300 origin-top"
                         [class.hidden]="!isRegionDropdownOpen()"
                         [class.scale-y-100]="isRegionDropdownOpen()"
                         [class.opacity-100]="isRegionDropdownOpen()"
                         [class.scale-y-0]="!isRegionDropdownOpen()"
                         [class.opacity-0]="!isRegionDropdownOpen()">
                        
                        <!-- 搜索框 -->
                        <div class="px-3 pb-2 mb-2 border-b border-white/5">
                            <div class="relative">
                                <span class="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-xs opacity-40">search</span>
                                <input type="text" 
                                       [ngModel]="regionSearchQuery()" 
                                       (ngModelChange)="regionSearchQuery.set($event)"
                                       placeholder="搜索地区..." 
                                       class="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs outline-none focus:border-accent/50 transition-all">
                            </div>
                        </div>

                        <div class="max-h-[300px] overflow-y-auto custom-scrollbar">
                            <button (click)="selectRegion('全部')" 
                                    class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors text-left group/item">
                                <span class="material-icons text-sm opacity-40 group-hover/item:text-accent">public</span>
                                <span class="text-sm font-medium" [class.text-accent]="selectedRegion() === '全部'">全部地区</span>
                                @if (selectedRegion() === '全部') {
                                    <span class="material-icons text-accent text-xs ml-auto">check</span>
                                }
                            </button>
                            @for (country of filteredCountryList(); track country) {
                                <button (click)="selectRegion(country)" 
                                        class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors text-left group/item">
                                    <img [src]="regionService.getRegionFlagUrl(country)" 
                                         [alt]="country" 
                                         #listFlagImg
                                         (error)="listFlagImg.src = regionService.getRegionFlagBackupUrl(country)"
                                         class="w-5 h-auto shadow-sm" 
                                         referrerpolicy="no-referrer">
                                    <span class="text-sm font-medium truncate" [class.text-accent]="selectedRegion() === country">{{ country }}</span>
                                    @if (selectedRegion() === country) {
                                        <span class="material-icons text-accent text-xs ml-auto">check</span>
                                    }
                                </button>
                            }
                            @if (filteredCountryList().length === 0) {
                                <div class="px-4 py-8 text-center text-[var(--text-muted)] text-xs italic">
                                    未找到相关地区
                                </div>
                            }
                        </div>
                    </div>
                </div>

                <div class="flex bg-[var(--secondary)] rounded-full p-1 border border-white/10 w-full md:w-auto">
                    <button (click)="currentTab.set('solo')" 
                            class="flex-1 md:flex-none px-8 py-2 rounded-full text-sm font-bold uppercase transition-all"
                            [class.transition-none]="!isLoaded()"
                            [ngClass]="currentTab() === 'solo' ? 'bg-accent text-[var(--text-inverted)] shadow-lg' : 'text-[var(--text-muted)] hover:text-[var(--text-hover)]'">
                        {{ 'ladder.solo' | t }}
                    </button>
                    <button (click)="currentTab.set('team')" 
                            class="flex-1 md:flex-none px-8 py-2 rounded-full text-sm font-bold uppercase transition-all"
                            [class.transition-none]="!isLoaded()"
                            [ngClass]="currentTab() === 'team' ? 'bg-accent text-[var(--text-inverted)] shadow-lg' : 'text-[var(--text-muted)] hover:text-[var(--text-hover)]'">
                        {{ 'ladder.team' | t }}
                    </button>
                </div>
            </div>
        </div>

        <!-- 排行榜列表 -->
        <div class="bg-[var(--card-bg)] backdrop-blur-md rounded-xl shadow-xl border border-[var(--border)] overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-[var(--primary)]/80 text-[10px] md:text-xs uppercase tracking-wider text-[var(--text-muted)]">
                            <th class="p-2 md:p-4 font-medium text-center w-12 md:w-20">{{ 'ladder.rank' | t }}</th>
                            <th class="p-2 md:p-4 font-medium">{{ currentTab() === 'solo' ? ('ladder.player' | t) : ('ladder.teamName' | t) }}</th>
                            <th class="p-2 md:p-4 font-medium text-center">{{ 'ladder.region' | t }}</th>
                            <th class="p-2 md:p-4 font-medium text-center">{{ 'ladder.points' | t }}</th>
                            <th class="p-2 md:p-4 font-medium text-center hidden sm:table-cell">{{ 'ladder.winRate' | t }}</th>
                            <th class="p-2 md:p-4 font-medium text-center hidden sm:table-cell">{{ 'ladder.games' | t }}</th>
                            <th class="p-2 md:p-4 font-medium text-center hidden md:table-cell">{{ 'ladder.trend' | t }}</th>
                            <th class="p-2 md:p-4 font-medium hidden lg:table-cell">{{ 'ladder.signature' | t }}</th>
                            <th class="p-2 md:p-4 font-medium text-center">{{ 'ladder.status' | t }}</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-white/5">
                        @for (player of filteredPlayers(); track player.rank) {
                            <tr class="hover:bg-white/5 transition-colors group relative" [class.animate-in]="isLoaded()" [class.fade-in]="isLoaded()" [class.slide-in-from-bottom-4]="isLoaded()" [class.duration-500]="isLoaded()">
                                <!-- 排名 -->
                                <td class="p-2 md:p-4 text-center">
                                    @if (player.rank === 1) {
                                        <div class="w-6 h-6 md:w-8 md:h-8 mx-auto bg-yellow-500/20 text-yellow-500 rounded-full flex items-center justify-center font-black border border-yellow-500/50 shadow-[0_0_10px_rgba(234,179,8,0.3)] text-xs md:text-base">1</div>
                                    } @else if (player.rank === 2) {
                                        <div class="w-6 h-6 md:w-8 md:h-8 mx-auto bg-gray-400/20 text-[var(--text-main)] rounded-full flex items-center justify-center font-black border border-gray-400/50 text-xs md:text-base">2</div>
                                    } @else if (player.rank === 3) {
                                        <div class="w-6 h-6 md:w-8 md:h-8 mx-auto bg-orange-700/20 text-orange-400 rounded-full flex items-center justify-center font-black border border-orange-700/50 text-xs md:text-base">3</div>
                                    } @else {
                                        <div class="text-[var(--text-muted)] font-bold font-mono text-sm md:text-lg">#{{ player.rank }}</div>
                                    }
                                </td>

                                <!-- 玩家信息 -->
                                <td class="p-2 md:p-4">
                                    <div class="flex items-center gap-2 md:gap-4">
                                        <div class="relative w-8 h-8 md:w-12 md:h-12 rounded-full border-2 overflow-hidden shrink-0 bg-white/5"
                                             [ngClass]="{
                                                'border-yellow-500': player.rank === 1,
                                                'border-gray-400': player.rank === 2,
                                                'border-orange-700': player.rank === 3,
                                                'border-[var(--border-muted)]': player.rank > 3
                                             }">
                                            <span class="absolute inset-0 flex items-center justify-center text-xs md:text-sm font-bold text-accent">{{ player.name.charAt(0) | uppercase }}</span>
                                            <img [src]="player.avatar" (error)="imgAvatar.style.display='none'" #imgAvatar class="w-full h-full object-cover relative z-10" alt="Avatar">
                                        </div>
                                        <div class="truncate max-w-[80px] md:max-w-none">
                                            <div class="font-bold text-[var(--text-main)] text-sm md:text-base group-hover:text-accent transition-colors truncate">{{ player.name }}</div>
                                        </div>
                                    </div>
                                </td>

                                <!-- 地区 -->
                                <td class="p-2 md:p-4 text-center">
                                    <div class="flex flex-col items-center gap-1">
                                        <img [src]="regionService.getRegionFlagUrl(player.region)" 
                                             [alt]="player.region"
                                             #tableFlagImg
                                             (error)="tableFlagImg.src = regionService.getRegionFlagBackupUrl(player.region)"
                                             class="w-6 h-auto"
                                             referrerpolicy="no-referrer">
                                        <span class="text-[9px] uppercase font-bold opacity-40">{{ player.region }}</span>
                                    </div>
                                </td>

                                <!-- 积分 -->
                                <td class="p-2 md:p-4 text-center">
                                    <div class="text-base md:text-xl font-black text-accent tracking-wide">{{ player.points }}</div>
                                </td>

                                <!-- 胜率 -->
                                <td class="p-2 md:p-4 text-center hidden sm:table-cell">
                                    <div class="font-bold" [ngClass]="player.winRate >= 60 ? 'text-green-400' : (player.winRate >= 50 ? 'text-[var(--text-main)]' : 'text-red-400')">
                                        {{ player.winRate }}%
                                    </div>
                                </td>

                                <!-- 场次 -->
                                <td class="p-2 md:p-4 text-center text-[var(--text-muted)] font-mono hidden sm:table-cell">
                                    {{ player.games }}
                                </td>

                                <!-- 趋势 -->
                                <td class="p-2 md:p-4 text-center hidden md:table-cell">
                                    @if (player.trend === 'up') {
                                        <div class="flex items-center justify-center gap-1 text-green-500 text-xs font-bold">
                                            <span class="material-icons text-sm">arrow_upward</span>
                                            {{ player.trendValue }}
                                        </div>
                                    } @else if (player.trend === 'down') {
                                        <div class="flex items-center justify-center gap-1 text-red-500 text-xs font-bold">
                                            <span class="material-icons text-sm">arrow_downward</span>
                                            {{ player.trendValue }}
                                        </div>
                                    } @else {
                                        <div class="text-[var(--text-muted)] text-xs font-bold">-</div>
                                    }
                                </td>

                                <!-- 擅长英雄 -->
                                <td class="p-2 md:p-4 hidden lg:table-cell">
                                    <div class="flex gap-2">
                                        @for (hero of player.signatureHeroes; track $index) {
                                            <div class="w-8 h-8 rounded overflow-hidden border border-[var(--border-muted)] group-hover:border-accent/50 transition-colors relative bg-white/5" [title]="hero">
                                                <span class="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-accent">{{ hero.charAt(0) | uppercase }}</span>
                                                <img [src]="'assets/images/heroes/' + hero + '.png'" (error)="imgHero.style.display='none'" #imgHero class="w-full h-full object-cover relative z-10" alt="Hero">
                                            </div>
                                        }
                                    </div>
                                </td>

                                <!-- 状态 -->
                                <td class="p-2 md:p-4 text-center">
                                    <div class="flex items-center justify-center gap-1.5">
                                        <span class="w-2 h-2 rounded-full shadow-[0_0_8px]"
                                              [ngClass]="{
                                                'bg-green-500 shadow-green-500/50': player.status === 'online',
                                                'bg-blue-500 shadow-blue-500/50': player.status === 'ingame',
                                                'bg-gray-500 shadow-gray-500/50': player.status === 'offline'
                                              }"></span>
                                        <span class="text-[10px] font-bold uppercase tracking-wider"
                                              [ngClass]="{
                                                'text-green-500': player.status === 'online',
                                                'text-blue-500': player.status === 'ingame',
                                                'text-gray-500': player.status === 'offline'
                                              }">
                                            {{ player.status === 'online' ? ('ladder.online' | t) : (player.status === 'ingame' ? ('ladder.ingame' | t) : ('ladder.offline' | t)) }}
                                        </span>
                                    </div>
                                </td>
                            </tr>
                        }
                    </tbody>
                </table>
            </div>
            
            <!-- 底部加载更多 -->
            <div class="p-4 border-t border-[var(--border-muted)] text-center">
                <button class="text-sm text-[var(--text-muted)] hover:text-accent transition-colors uppercase tracking-widest font-bold">
                    {{ 'ladder.loadMore' | t }}
                </button>
            </div>
        </div>
      </div>
    </main>
  `
})
export class LadderComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private el = inject(ElementRef);
  regionService = inject(RegionService);
  currentTab = signal<'solo' | 'team'>('solo');
  selectedRegion = signal<string>('全部');
  isRegionDropdownOpen = signal(false);
  regionSearchQuery = signal<string>('');
  isLoaded = signal(false);

  constructor() {
    setTimeout(() => this.isLoaded.set(true), 500);
  }

  filteredCountryList = computed(() => {
    const query = this.regionSearchQuery().toLowerCase().trim();
    if (!query) return this.regionService.countryList;
    return this.regionService.countryList.filter(c => c.toLowerCase().includes(query));
  });

  @HostListener('document:click', ['$event'])
  onClickOutside(event: Event) {
    if (this.isRegionDropdownOpen() && !this.el.nativeElement.contains(event.target)) {
      this.isRegionDropdownOpen.set(false);
    }
  }

  toggleRegionDropdown() {
    this.isRegionDropdownOpen.update(v => !v);
    if (!this.isRegionDropdownOpen()) {
      this.regionSearchQuery.set('');
    }
  }

  selectRegion(region: string) {
    this.selectedRegion.set(region);
    this.isRegionDropdownOpen.set(false);
    this.regionSearchQuery.set('');
  }

  filteredPlayers = computed(() => {
    const players = this.currentTab() === 'solo' ? this.soloPlayers() : this.teamPlayers();
    const region = this.selectedRegion();
    if (region === '全部') return players;
    return players.filter(p => p.region === region);
  });

  ngOnInit() {
    this.route.queryParamMap.subscribe(params => {
      const tab = params.get('tab');
      if (tab === 'solo' || tab === 'team') {
        this.currentTab.set(tab);
      }
    });
  }

  soloPlayers = signal<Player[]>([
    { rank: 1, name: 'Vigoss', avatar: 'assets/images/avatars/Vigoss.png', level: 99, points: 8450, winRate: 68.5, games: 1240, trend: 'up', trendValue: 25, signatureHeroes: ['qop', 'puck', 'mirana'], region: '俄罗斯', status: 'online' },
    { rank: 2, name: 'YaphetS', avatar: 'assets/images/avatars/YaphetS.png', level: 95, points: 8320, winRate: 65.2, games: 980, trend: 'same', trendValue: 0, signatureHeroes: ['sf', 'storm', 'invoker'], region: '中国', status: 'ingame' },
    { rank: 3, name: 'Burning', avatar: 'assets/images/avatars/Burning.png', level: 92, points: 8150, winRate: 62.8, games: 1560, trend: 'up', trendValue: 12, signatureHeroes: ['am', 'morph', 'jugg'], region: '中国', status: 'online' },
    { rank: 4, name: 'Merlini', avatar: 'assets/images/avatars/Merlini.png', level: 88, points: 7980, winRate: 59.4, games: 850, trend: 'down', trendValue: 15, signatureHeroes: ['zeus', 'silencer', 'wind'], region: '美国', status: 'offline' },
    { rank: 5, name: 'Loda', avatar: 'assets/images/avatars/Loda.png', level: 85, points: 7850, winRate: 58.9, games: 1120, trend: 'up', trendValue: 8, signatureHeroes: ['spectre', 'tiny', 'slardar'], region: '瑞典', status: 'online' },
    { rank: 6, name: 'Dendi', avatar: 'assets/images/avatars/Dendi.png', level: 82, points: 7720, winRate: 57.5, games: 1340, trend: 'down', trendValue: 5, signatureHeroes: ['pudge', 'puck', 'rubick'], region: '乌克兰', status: 'ingame' },
    { rank: 7, name: 'Puppey', avatar: 'assets/images/avatars/Puppey.png', level: 80, points: 7650, winRate: 56.8, games: 1450, trend: 'up', trendValue: 18, signatureHeroes: ['chen', 'enigma', 'enchantress'], region: '爱沙尼亚', status: 'online' },
    { rank: 8, name: 'KuroKy', avatar: 'assets/images/avatars/KuroKy.png', level: 78, points: 7580, winRate: 55.4, games: 1280, trend: 'same', trendValue: 0, signatureHeroes: ['rubick', 'visage', 'io'], region: '德国', status: 'offline' },
    { rank: 9, name: 'Fear', avatar: 'assets/images/avatars/Fear.png', level: 75, points: 7450, winRate: 54.2, games: 1620, trend: 'down', trendValue: 10, signatureHeroes: ['sven', 'clinkz', 'lycan'], region: '美国', status: 'online' },
    { rank: 10, name: 'Zhou', avatar: 'assets/images/avatars/Zhou.png', level: 72, points: 7380, winRate: 53.8, games: 1150, trend: 'up', trendValue: 22, signatureHeroes: ['luna', 'gyro', 'weaver'], region: '中国', status: 'ingame' },
  ]);

  teamPlayers = signal<Player[]>([
    { rank: 1, name: 'Natus Vincere', avatar: 'assets/images/avatars/NaVi.png', level: 50, points: 9200, winRate: 72.5, games: 450, trend: 'up', trendValue: 45, signatureHeroes: ['pudge', 'chen', 'enigma'], region: '乌克兰', status: 'online' },
    { rank: 2, name: 'Alliance', avatar: 'assets/images/avatars/Alliance.png', level: 48, points: 8950, winRate: 70.2, games: 380, trend: 'up', trendValue: 30, signatureHeroes: ['np', 'puck', 'io'], region: '瑞典', status: 'ingame' },
    { rank: 3, name: 'EHOME', avatar: 'assets/images/avatars/EHOME.png', level: 45, points: 8800, winRate: 68.8, games: 520, trend: 'down', trendValue: 15, signatureHeroes: ['tiny', 'wisp', 'doom'], region: '中国', status: 'offline' },
    { rank: 4, name: 'LGD Gaming', avatar: 'assets/images/avatars/LGD.png', level: 42, points: 8650, winRate: 66.4, games: 480, trend: 'same', trendValue: 0, signatureHeroes: ['sf', 'magnus', 'ds'], region: '中国', status: 'online' },
    { rank: 5, name: 'Invictus Gaming', avatar: 'assets/images/avatars/IG.png', level: 40, points: 8500, winRate: 65.1, games: 410, trend: 'up', trendValue: 20, signatureHeroes: ['ta', 'brew', 'tide'], region: '中国', status: 'ingame' },
  ]);
}
