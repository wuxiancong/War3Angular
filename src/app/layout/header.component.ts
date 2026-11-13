import { afterNextRender, Component, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Router } from '@angular/router';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { I18nService } from '../core/i18n/i18n.service';
import { ThemeService } from '../core/theme.service';
import { ScrollService } from '../core/scroll.service';
import { RegionService } from '../core/region.service';
import { AuthService } from '../core/auth.service';
import { WelcomeComponent } from '../pages/welcome.component';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TranslatePipe, FormsModule, NgClass, WelcomeComponent],
  host: {
    class: 'block fixed top-0 left-0 right-0 z-50 w-screen m-0 p-0 border-0'
  },
  template: `
    <div class="flex flex-col w-screen z-[100]">
      <!-- 导航栏 -->
      <nav #siteNav class="w-full px-4 md:px-8 py-4 flex justify-between items-center bg-[var(--bg-header)] backdrop-blur-xl border-b border-white/5 relative z-50">
          <!-- Logo区 -->
          <div class="flex items-center space-x-4 cursor-pointer group" routerLink="/">
              <div class="w-8 h-8 md:w-10 md:h-10 flex-none aspect-square transition-transform group-hover:scale-110 flex items-center justify-center text-[24px] md:text-[32px] drop-shadow-[0_0_15px_var(--accent-glow)] leading-none" style="font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', sans-serif;">
                  ⚔
              </div>
              <div class="flex flex-col">
                  <span class="text-lg md:text-xl font-black italic tracking-tighter text-[var(--text-main)] uppercase leading-none">{{ 'header.platformName' | t }}</span>
                  <span class="text-[8px] font-bold opacity-30 text-[var(--text-main)] uppercase tracking-widest mt-1 hidden sm:block">{{ 'header.platformSub' | t }}</span>
              </div>
          </div>

          <!-- 桌面端菜单区 -->
          <div class="hidden 2xl:flex items-center space-x-6 xl:space-x-10 text-[15px] font-black uppercase h-full">
              <a routerLink="/" routerLinkActive="text-accent border-b-3 border-accent opacity-100" [routerLinkActiveOptions]="{exact: true}" class="transition-all px-2 opacity-30 hover:opacity-100 hover:text-accent">{{ 'nav.home' | t }}</a>
              <a routerLink="/matches" routerLinkActive="text-accent border-b-3 border-accent opacity-100" class="transition-all px-2 opacity-30 hover:opacity-100 hover:text-accent">{{ 'nav.matches' | t }}</a>
              <!-- 在线对战 下拉菜单（网页对战 / 录像回放） -->
              <div class="relative group h-full flex items-center" (mouseenter)="isOnlineDropdownOpen.set(true)" (mouseleave)="isOnlineDropdownOpen.set(false)">
                  <a routerLink="/play" routerLinkActive="text-accent border-b-3 border-accent opacity-100" class="transition-all px-2 opacity-30 group-hover:opacity-100 group-hover:text-accent flex items-center gap-1 h-full">
                      {{ 'nav.online' | t }}
                      <span class="material-icons text-[14px] transition-transform" [class.rotate-180]="isOnlineDropdownOpen()">expand_more</span>
                  </a>
                  <div class="absolute top-[calc(100%-1px)] left-0 w-48 dropdown-blur border border-[var(--border)] rounded-b-lg shadow-2xl py-2 transition-all duration-200 transform z-[110]"
                       [class.opacity-100]="isOnlineDropdownOpen()"
                       [class.visible]="isOnlineDropdownOpen()"
                       [class.translate-y-0]="isOnlineDropdownOpen()"
                       [class.opacity-0]="!isOnlineDropdownOpen()"
                       [class.invisible]="!isOnlineDropdownOpen()"
                       [class.translate-y-2]="!isOnlineDropdownOpen()">
                      <a routerLink="/play" (click)="isOnlineDropdownOpen.set(false)" class="block px-4 py-2 text-sm text-[var(--text-muted)] hover:text-accent hover:bg-[var(--border)] transition-colors">{{ 'nav.play' | t }}</a>
                      <a routerLink="/replay" (click)="isOnlineDropdownOpen.set(false)" class="block px-4 py-2 text-sm text-[var(--text-muted)] hover:text-accent hover:bg-[var(--border)] transition-colors">{{ 'nav.replay' | t }}</a>
                  </div>
              </div>
              <a routerLink="/ladder" routerLinkActive="text-accent border-b-3 border-accent opacity-100" class="transition-all px-2 opacity-30 hover:opacity-100 hover:text-accent">{{ 'nav.ladder' | t }}</a>
              
              <!-- 战队预约 下拉菜单 -->
              <div class="relative group h-full flex items-center" (mouseenter)="isSquadDropdownOpen.set(true)" (mouseleave)="isSquadDropdownOpen.set(false)">
                  <a routerLink="/squad" routerLinkActive="text-accent border-b-3 border-accent opacity-100" class="transition-all px-2 opacity-30 group-hover:opacity-100 group-hover:text-accent flex items-center gap-1 h-full">
                      {{ 'nav.team' | t }}
                      <span class="material-icons text-[14px] transition-transform" [class.rotate-180]="isSquadDropdownOpen()">expand_more</span>
                  </a>
                  <div class="absolute top-[calc(100%-1px)] left-0 w-48 dropdown-blur border border-[var(--border)] rounded-b-lg shadow-2xl py-2 transition-all duration-200 transform z-[110]"
                       [class.opacity-100]="isSquadDropdownOpen()"
                       [class.visible]="isSquadDropdownOpen()"
                       [class.translate-y-0]="isSquadDropdownOpen()"
                       [class.opacity-0]="!isSquadDropdownOpen()"
                       [class.invisible]="!isSquadDropdownOpen()"
                       [class.translate-y-2]="!isSquadDropdownOpen()">
                      <a routerLink="/my-squad" (click)="isSquadDropdownOpen.set(false)" class="block px-4 py-2 text-sm text-[var(--text-muted)] hover:text-accent hover:bg-[var(--border)] transition-colors">{{ 'squad.myTeam' | t }}</a>
                      <a routerLink="/create-match" (click)="isSquadDropdownOpen.set(false)" class="block px-4 py-2 text-sm text-[var(--text-muted)] hover:text-accent hover:bg-[var(--border)] transition-colors">{{ 'squad.create' | t }}</a>
                  </div>
              </div>

              <!-- 玩家举报 下拉菜单 -->
              <div class="relative group h-full flex items-center" (mouseenter)="isReportDropdownOpen.set(true)" (mouseleave)="isReportDropdownOpen.set(false)">
                  <a routerLink="/report" routerLinkActive="text-accent border-b-3 border-accent opacity-100" class="transition-all px-2 opacity-30 group-hover:opacity-100 group-hover:text-accent flex items-center gap-1 h-full">
                      {{ 'nav.report' | t }}
                      <span class="material-icons text-[14px] transition-transform" [class.rotate-180]="isReportDropdownOpen()">expand_more</span>
                  </a>
                  <div class="absolute top-[calc(100%-1px)] left-0 w-48 dropdown-blur border border-[var(--border)] rounded-b-lg shadow-2xl py-2 transition-all duration-200 transform z-[110]"
                       [class.opacity-100]="isReportDropdownOpen()"
                       [class.visible]="isReportDropdownOpen()"
                       [class.translate-y-0]="isReportDropdownOpen()"
                       [class.opacity-0]="!isReportDropdownOpen()"
                       [class.invisible]="!isReportDropdownOpen()"
                       [class.translate-y-2]="!isReportDropdownOpen()">
                      <a routerLink="/report-list" (click)="isReportDropdownOpen.set(false)" class="block px-4 py-2 text-sm text-[var(--text-muted)] hover:text-accent hover:bg-[var(--border)] transition-colors">{{ 'nav.reportList' | t }}</a>
                      <a routerLink="/ban-list" (click)="isReportDropdownOpen.set(false)" class="block px-4 py-2 text-sm text-[var(--text-muted)] hover:text-accent hover:bg-[var(--border)] transition-colors">{{ 'nav.ban' | t }}</a>
                  </div>
              </div>

              <!-- 联系客服 下拉菜单 -->
              <div class="relative group h-full flex items-center" (mouseenter)="isSupportDropdownOpen.set(true)" (mouseleave)="isSupportDropdownOpen.set(false)">
                  <a routerLink="/contact" routerLinkActive="text-accent border-b-3 border-accent opacity-100" class="transition-all px-2 opacity-30 group-hover:opacity-100 group-hover:text-accent flex items-center gap-1 h-full">
                      {{ 'nav.support' | t }}
                      <span class="material-icons text-[14px] transition-transform" [class.rotate-180]="isSupportDropdownOpen()">expand_more</span>
                  </a>
                  <div class="absolute top-[calc(100%-1px)] left-0 w-48 dropdown-blur border border-[var(--border)] rounded-b-lg shadow-2xl py-2 transition-all duration-200 transform z-[110]"
                       [class.opacity-100]="isSupportDropdownOpen()"
                       [class.visible]="isSupportDropdownOpen()"
                       [class.translate-y-0]="isSupportDropdownOpen()"
                       [class.opacity-0]="!isSupportDropdownOpen()"
                       [class.invisible]="!isSupportDropdownOpen()"
                       [class.translate-y-2]="!isSupportDropdownOpen()">
                      <a routerLink="/chat" (click)="isSupportDropdownOpen.set(false)" class="block px-4 py-2 text-sm text-[var(--text-muted)] hover:text-accent hover:bg-[var(--border)] transition-colors">{{ 'nav.onlineSupport' | t }}</a>
                      <a routerLink="/faq" (click)="isSupportDropdownOpen.set(false)" class="block px-4 py-2 text-sm text-[var(--text-muted)] hover:text-accent hover:bg-[var(--border)] transition-colors">{{ 'nav.faq' | t }}</a>
                  </div>
              </div>

              <!-- 下载中心 下拉菜单 -->
              <div class="relative group h-full flex items-center" (mouseenter)="isDownloadDropdownOpen.set(true)" (mouseleave)="isDownloadDropdownOpen.set(false)">
                  <a routerLink="/download" routerLinkActive="text-accent border-b-3 border-accent opacity-100" class="transition-all px-2 opacity-30 group-hover:opacity-100 group-hover:text-accent flex items-center gap-1 h-full">
                      {{ 'nav.download' | t }}
                      <span class="material-icons text-[14px] transition-transform" [class.rotate-180]="isDownloadDropdownOpen()">expand_more</span>
                  </a>
                  <div class="absolute top-[calc(100%-1px)] left-0 w-48 dropdown-blur border border-[var(--border)] rounded-b-lg shadow-2xl py-2 transition-all duration-200 transform z-[110]"
                       [class.opacity-100]="isDownloadDropdownOpen()"
                       [class.visible]="isDownloadDropdownOpen()"
                       [class.translate-y-0]="isDownloadDropdownOpen()"
                       [class.opacity-0]="!isDownloadDropdownOpen()"
                       [class.invisible]="!isDownloadDropdownOpen()"
                       [class.translate-y-2]="!isDownloadDropdownOpen()">
                      <a routerLink="/platform-updates" (click)="isDownloadDropdownOpen.set(false)" class="block px-4 py-2 text-sm text-[var(--text-muted)] hover:text-accent hover:bg-[var(--border)] transition-colors">{{ 'nav.platformUpdates' | t }}</a>
                      <a routerLink="/map-updates" (click)="isDownloadDropdownOpen.set(false)" class="block px-4 py-2 text-sm text-[var(--text-muted)] hover:text-accent hover:bg-[var(--border)] transition-colors">{{ 'nav.mapUpdates' | t }}</a>
                  </div>
              </div>
          </div>

          <!-- 功能区：固定宽度防止跳跃 -->
          <div class="flex items-center space-x-3 md:space-x-5 justify-end">
              <!-- 移动端菜单按钮 -->
              <button (click)="toggleMenu()" class="2xl:hidden text-[var(--text-main)] p-2 focus:outline-none">
                  <span class="material-icons">{{ isMenuOpen() ? 'close' : 'menu' }}</span>
              </button>

              <div class="hidden md:flex items-center space-x-5">
                  <!-- 地区标志 (PNG) -->
                  <div class="flex items-center">
                      <img [src]="regionService.getRegionFlagUrl(regionService.currentRegion())" 
                           [alt]="regionService.currentRegion()"
                           #flagImg
                           (error)="flagImg.src = regionService.getRegionFlagBackupUrl(regionService.currentRegion())"
                           class="w-6 h-auto"
                           referrerpolicy="no-referrer">
                  </div>

                  <!-- 自定义高级语言选择器 -->
                  <div class="relative group h-full flex items-center w-fit" (mouseenter)="isLangDropdownOpen.set(true)" (mouseleave)="isLangDropdownOpen.set(false)">
                      <div class="flex items-center space-x-2 dropdown-blur border border-[var(--border)] px-3 py-1.5 rounded-lg cursor-pointer hover:bg-[var(--border)] hover:border-accent/50 transition-all shadow-lg">
                          <span class="material-icons text-[14px] text-accent/70">language</span>
                          <span class="text-sm leading-none">{{ getFlag(i18n.locale()) }}</span>
                          <span class="text-[10px] font-bold text-[var(--text-main)] uppercase tracking-wider">{{ getLangText(i18n.locale()) }}</span>
                          <span class="material-icons text-[12px] opacity-50 transition-transform" [class.rotate-180]="isLangDropdownOpen()">expand_more</span>
                      </div>
                      
                      <!-- 下拉列表 -->
                      <div class="absolute top-[calc(100%-10px)] right-0 mt-2 w-full dropdown-blur border border-[var(--border)] rounded-lg shadow-2xl py-2 z-[120] max-h-[400px] overflow-y-auto custom-scrollbar transition-all duration-200"
                           [class.opacity-100]="isLangDropdownOpen()"
                           [class.visible]="isLangDropdownOpen()"
                           [class.translate-y-0]="isLangDropdownOpen()"
                           [class.opacity-0]="!isLangDropdownOpen()"
                           [class.invisible]="!isLangDropdownOpen()"
                           [class.translate-y-2]="!isLangDropdownOpen()">
                          @for (lang of languageList; track lang.value) {
                            <button (click)="saveLang(lang.value); isLangDropdownOpen.set(false)" 
                                    class="w-full flex items-center space-x-3 px-4 py-2 hover:bg-[var(--border)] transition-colors group/item">
                                <span class="text-base">{{ getFlag(lang.value) }}</span>
                                <span class="text-[11px] font-medium text-[var(--text-muted)] group-hover/item:text-accent">{{ lang.text }}</span>
                                @if (i18n.locale() === lang.value) {
                                    <span class="material-icons text-accent text-sm ml-auto">check</span>
                                }
                            </button>
                          }
                      </div>
                  </div>
                  
                  <button (click)="themeService.toggleTheme()" class="text-lg opacity-60 hover:opacity-100 transition-all hover:scale-125">
                      {{ themeService.theme() === 'dark' ? '🌙' : '☀️' }}
                  </button>

                  <div class="flex items-center space-x-2 whitespace-nowrap">
                      @if (authService.isLoggedIn()) {
                          <!-- 用户头像+用户名+下拉菜单 -->
                          <div class="relative group h-full flex items-center" (mouseenter)="isUserDropdownOpen.set(true)" (mouseleave)="isUserDropdownOpen.set(false)">
                              <div class="flex items-center gap-2 cursor-pointer dropdown-blur border border-[var(--border)] px-3 py-1.5 rounded-lg hover:border-accent/50 transition-all">
                                  <div class="w-6 h-6 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-white">
                                      {{ authService.currentUser()?.username?.charAt(0)?.toUpperCase() }}
                                  </div>
                                  <span class="text-sm font-bold text-[var(--text-main)]">{{ authService.currentUser()?.username }}</span>
                                  <span class="material-icons text-[14px] opacity-50 transition-transform" [class.rotate-180]="isUserDropdownOpen()">expand_more</span>
                              </div>
                              
                              <!-- 下拉列表 -->
                              <div class="absolute top-full right-0 mt-1 w-48 dropdown-blur border border-[var(--border)] rounded-lg shadow-2xl py-2 transition-all duration-200 transform z-[110]"
                                   [class.opacity-100]="isUserDropdownOpen()"
                                   [class.visible]="isUserDropdownOpen()"
                                   [class.translate-y-0]="isUserDropdownOpen()"
                                   [class.opacity-0]="!isUserDropdownOpen()"
                                   [class.invisible]="!isUserDropdownOpen()"
                                   [class.translate-y-2]="!isUserDropdownOpen()">
                                  <button (click)="openWelcome(); isUserDropdownOpen.set(false)" class="w-full text-left px-4 py-2 text-sm text-[var(--text-muted)] hover:text-accent hover:bg-[var(--border)] transition-colors flex items-center gap-2">
                                      <span class="material-icons text-sm">auto_awesome</span>
                                      {{ 'header.welcome' | t }}
                                  </button>
                                  <a routerLink="/settings" (click)="isUserDropdownOpen.set(false)" class="flex items-center gap-2 px-4 py-2 text-sm text-[var(--text-muted)] hover:text-accent hover:bg-[var(--border)] transition-colors">
                                      <span class="material-icons text-sm">settings</span>
                                      {{ 'header.settings' | t }}
                                  </a>
                                  <a routerLink="/my-items" (click)="isUserDropdownOpen.set(false)" class="flex items-center gap-2 px-4 py-2 text-sm text-[var(--text-muted)] hover:text-accent hover:bg-[var(--border)] transition-colors">
                                      <span class="material-icons text-sm">inventory_2</span>
                                      {{ 'header.items' | t }}
                                  </a>
                                  <div class="h-px bg-white/5 my-1"></div>
                                  <button (click)="switchAccount(); isUserDropdownOpen.set(false)" class="w-full text-left px-4 py-2 text-sm text-[var(--text-muted)] hover:text-accent hover:bg-[var(--border)] transition-colors flex items-center gap-2">
                                      <span class="material-icons text-sm">swap_horiz</span>
                                      {{ 'header.switchAccount' | t }}
                                  </button>
                                  <button (click)="authService.logout(); isUserDropdownOpen.set(false)" class="w-full text-left px-4 py-2 text-sm text-red-400 hover:text-red-500 hover:bg-[var(--border)] transition-colors flex items-center gap-2">
                                      <span class="material-icons text-sm">logout</span>
                                      {{ 'header.logout' | t }}
                                  </button>
                              </div>
                          </div>
                      } @else {
                          <button routerLink="/login" class="bg-transparent border border-white/20 text-[var(--text-main)] px-4 py-1.5 text-[11px] font-bold hover:border-white/50 transition-all uppercase rounded-sm active:scale-90">
                              {{ 'auth.login' | t }}
                          </button>
                          <button routerLink="/register" class="bg-accent/10 border border-accent text-accent px-4 py-1.5 text-[11px] font-bold hover:bg-accent hover:text-white transition-all uppercase rounded-sm active:scale-90">
                              {{ 'auth.register' | t }}
                          </button>
                      }
                  </div>
              </div>
          </div>
      </nav>

      <!-- 移动端全屏菜单 -->
      <div class="2xl:hidden fixed inset-0 bg-[var(--primary)] z-[150] transition-transform duration-500 ease-in-out transform flex flex-col"
           [ngClass]="isMenuOpen() ? 'translate-x-0' : 'translate-x-full'">
          
          <!-- 移动端菜单头部 -->
          <div class="flex justify-between items-center px-6 py-5 border-b border-white/5 bg-[var(--bg-header)]">
              <div class="flex items-center space-x-3">
                  <span class="text-2xl drop-shadow-[0_0_10px_var(--accent-glow)]">⚔</span>
                  <span class="text-lg font-black italic tracking-tighter text-[var(--text-main)] uppercase">CC对战平台</span>
              </div>
              <button (click)="closeMenu()" class="text-[var(--text-main)] p-2 bg-white/5 rounded-full">
                  <span class="material-icons">close</span>
              </button>
          </div>

          <!-- 菜单内容区 -->
          <div class="flex-grow overflow-y-auto px-6 py-8 space-y-8 custom-scrollbar">
              <div class="flex flex-col space-y-1">
                  <a routerLink="/" (click)="closeMenu()" routerLinkActive="!text-white bg-accent" [routerLinkActiveOptions]="{exact: true}" class="px-4 py-4 rounded-xl text-lg font-bold text-[var(--text-main)] flex items-center gap-4 group active:bg-accent active:!text-white transition-all border border-white/5">
                      <span class="material-icons text-accent group-active:!text-white">home</span>
                      <span class="group-active:!text-white">{{ 'nav.home' | t }}</span>
                  </a>
                  <a routerLink="/matches" (click)="closeMenu()" routerLinkActive="!text-white bg-accent" class="px-4 py-4 rounded-xl text-lg font-bold text-[var(--text-main)] flex items-center gap-4 group active:bg-accent active:!text-white transition-all border border-white/5">
                      <span class="material-icons text-accent group-active:!text-white">sports_esports</span>
                      <span class="group-active:!text-white">{{ 'nav.matches' | t }}</span>
                  </a>
                  <!-- 移动端 在线对战 -->
                  <div class="pt-4 pb-2">
                      <a routerLink="/play" (click)="closeMenu()" routerLinkActive="!text-white bg-accent" class="px-4 py-4 rounded-xl text-lg font-bold text-[var(--text-main)] flex items-center gap-4 group active:bg-accent active:!text-white transition-all border border-white/5">
                          <span class="material-icons text-accent group-active:!text-white">sports_esports</span>
                          <span class="group-active:!text-white">{{ 'nav.online' | t }}</span>
                      </a>
                      <div class="space-y-1 pl-4">
                          <a routerLink="/play" (click)="closeMenu()" routerLinkActive="!text-white bg-accent" class="px-4 py-3 rounded-xl text-md font-bold text-[var(--text-main)] flex items-center gap-3 active:bg-accent active:!text-white transition-all">
                              <span class="material-icons text-accent text-sm group-active:!text-white">videogame_asset</span>
                              {{ 'nav.play' | t }}
                          </a>
                          <a routerLink="/replay" (click)="closeMenu()" routerLinkActive="!text-white bg-accent" class="px-4 py-3 rounded-xl text-md font-bold text-[var(--text-main)] flex items-center gap-3 active:bg-accent active:!text-white transition-all">
                              <span class="material-icons text-accent text-sm group-active:!text-white">movie</span>
                              {{ 'nav.replay' | t }}
                          </a>
                      </div>
                  </div>
                  <a routerLink="/ladder" (click)="closeMenu()" routerLinkActive="!text-white bg-accent" class="px-4 py-4 rounded-xl text-lg font-bold text-[var(--text-main)] flex items-center gap-4 group active:bg-accent active:!text-white transition-all border border-white/5">
                      <span class="material-icons text-accent group-active:!text-white">leaderboard</span>
                      <span class="group-active:!text-white">{{ 'nav.ladder' | t }}</span>
                  </a>
                  
                  <!-- 移动端 战队预约 -->
                  <div class="pt-4 pb-2">
                      <a routerLink="/squad" (click)="closeMenu()" routerLinkActive="!text-white bg-accent" class="px-4 py-4 rounded-xl text-lg font-bold text-[var(--text-main)] flex items-center gap-4 group active:bg-accent active:!text-white transition-all border border-white/5">
                          <span class="material-icons text-accent group-active:!text-white">groups</span>
                          <span class="group-active:!text-white">{{ 'nav.team' | t }}</span>
                      </a>
                      <div class="space-y-1 pl-4">
                          <a routerLink="/my-squad" (click)="closeMenu()" routerLinkActive="!text-white bg-accent" class="px-4 py-3 rounded-xl text-md font-bold text-[var(--text-main)] flex items-center gap-3 active:bg-accent active:!text-white transition-all">
                              <span class="material-icons text-accent text-sm group-active:!text-white">shield</span>
                              {{ 'squad.myTeam' | t }}
                          </a>
                          <a routerLink="/create-match" (click)="closeMenu()" routerLinkActive="!text-white bg-accent" class="px-4 py-3 rounded-xl text-md font-bold text-[var(--text-main)] flex items-center gap-3 active:bg-accent active:!text-white transition-all">
                              <span class="material-icons text-accent text-sm group-active:!text-white">add_circle</span>
                              {{ 'squad.create' | t }}
                          </a>
                      </div>
                  </div>

                  <!-- 移动端 玩家举报 -->
                  <div class="pt-4 pb-2">
                      <a routerLink="/report" (click)="closeMenu()" routerLinkActive="!text-white bg-accent" class="px-4 py-4 rounded-xl text-lg font-bold text-[var(--text-main)] flex items-center gap-4 group active:bg-accent active:!text-white transition-all border border-white/5">
                          <span class="material-icons text-accent group-active:!text-white">report_problem</span>
                          <span class="group-active:!text-white">{{ 'nav.report' | t }}</span>
                      </a>
                      <div class="space-y-1 pl-4">
                          <a routerLink="/report-list" (click)="closeMenu()" routerLinkActive="!text-white bg-accent" class="px-4 py-3 rounded-xl text-md font-bold text-[var(--text-main)] flex items-center gap-3 active:bg-accent active:!text-white transition-all">
                              <span class="material-icons text-accent text-sm group-active:!text-white">visibility</span>
                              {{ 'nav.reportList' | t }}
                          </a>
                          <a routerLink="/ban-list" (click)="closeMenu()" routerLinkActive="!text-white bg-accent" class="px-4 py-3 rounded-xl text-md font-bold text-[var(--text-main)] flex items-center gap-3 active:bg-accent active:!text-white transition-all">
                              <span class="material-icons text-accent text-sm group-active:!text-white">gavel</span>
                              {{ 'nav.ban' | t }}
                          </a>
                      </div>
                  </div>

                  <!-- 移动端 联系客服 -->
                  <div class="pt-4 pb-2">
                      <a routerLink="/contact" (click)="closeMenu()" routerLinkActive="!text-white bg-accent" class="px-4 py-4 rounded-xl text-lg font-bold text-[var(--text-main)] flex items-center gap-4 group active:bg-accent active:!text-white transition-all border border-white/5">
                          <span class="material-icons text-accent group-active:!text-white">contact_support</span>
                          <span class="group-active:!text-white">{{ 'nav.support' | t }}</span>
                      </a>
                      <div class="space-y-1 pl-4">
                          <a routerLink="/chat" (click)="closeMenu()" routerLinkActive="!text-white bg-accent" class="px-4 py-3 rounded-xl text-md font-bold text-[var(--text-main)] flex items-center gap-3 active:bg-accent active:!text-white transition-all">
                              <span class="material-icons text-accent text-sm group-active:!text-white">chat</span>
                              {{ 'nav.onlineSupport' | t }}
                          </a>
                          <a routerLink="/faq" (click)="closeMenu()" routerLinkActive="!text-white bg-accent" class="px-4 py-3 rounded-xl text-md font-bold text-[var(--text-main)] flex items-center gap-3 active:bg-accent active:!text-white transition-all">
                              <span class="material-icons text-accent text-sm group-active:!text-white">help_outline</span>
                              {{ 'nav.faq' | t }}
                          </a>
                      </div>
                  </div>

                  <!-- 移动端 下载中心 -->
                  <div class="pt-4 pb-2">
                      <a routerLink="/download" (click)="closeMenu()" routerLinkActive="!text-white bg-accent" class="px-4 py-4 rounded-xl text-lg font-bold text-[var(--text-main)] flex items-center gap-4 group active:bg-accent active:!text-white transition-all border border-white/5">
                          <span class="material-icons text-accent group-active:!text-white">download</span>
                          <span class="group-active:!text-white">{{ 'nav.download' | t }}</span>
                      </a>
                      <div class="space-y-1 pl-4">
                          <a routerLink="/platform-updates" (click)="closeMenu()" routerLinkActive="!text-white bg-accent" class="px-4 py-3 rounded-xl text-md font-bold text-[var(--text-main)] flex items-center gap-3 active:bg-accent active:!text-white transition-all">
                              <span class="material-icons text-accent text-sm group-active:!text-white">system_update</span>
                              {{ 'nav.platformUpdates' | t }}
                          </a>
                          <a routerLink="/map-updates" (click)="closeMenu()" routerLinkActive="!text-white bg-accent" class="px-4 py-3 rounded-xl text-md font-bold text-[var(--text-main)] flex items-center gap-3 active:bg-accent active:!text-white transition-all">
                              <span class="material-icons text-accent text-sm group-active:!text-white">update</span>
                              {{ 'nav.mapUpdates' | t }}
                          </a>
                      </div>
                  </div>
              </div>

              <!-- 底部功能区 -->
              <div class="pt-8 border-t border-white/5 space-y-6">
                  <div class="flex flex-col px-4 space-y-4">
                      <div class="flex items-center justify-between">
                          <div class="flex items-center space-x-3">
                              <img [src]="regionService.getRegionFlagUrl(regionService.currentRegion())" 
                                   [alt]="regionService.currentRegion()"
                                   #mobFlagImg
                                   (error)="mobFlagImg.src = regionService.getRegionFlagBackupUrl(regionService.currentRegion())"
                                   class="w-6 h-auto"
                                   referrerpolicy="no-referrer">
                              <span class="text-sm font-bold text-[var(--text-main)] uppercase tracking-wider">{{ regionService.currentRegion() }}</span>
                          </div>
                          <button (click)="themeService.toggleTheme()" class="flex items-center space-x-2 px-4 py-2 bg-[var(--card-bg)] border border-[var(--border)] rounded-full text-sm font-bold hover:bg-[var(--border)] transition-colors">
                              <span>{{ themeService.theme() === 'dark' ? '🌙' : '☀️' }}</span>
                              <span class="text-[var(--text-muted)] uppercase tracking-widest text-[10px]">{{ themeService.theme() === 'dark' ? ('theme.dark' | t) : ('theme.light' | t) }}</span>
                          </button>
                      </div>

                      <!-- 移动端自定义语言选择器 -->
                      <div class="relative w-full">
                          <button (click)="toggleMobileLang()" 
                                  class="w-full flex items-center justify-between bg-[var(--card-bg)] border border-[var(--border)] px-4 py-3 rounded-xl hover:bg-[var(--border)] transition-all">
                              <div class="flex items-center gap-3">
                                  <span class="material-icons text-accent text-sm">language</span>
                                  <span class="text-xl leading-none">{{ getFlag(i18n.locale()) }}</span>
                                  <span class="text-sm font-bold text-[var(--text-main)] uppercase tracking-wider">{{ getLangText(i18n.locale()) }}</span>
                              </div>
                              <span class="material-icons text-sm transition-transform" [class.rotate-180]="isMobileLangOpen()">expand_more</span>
                          </button>
                          
                          <!-- 移动端语言列表 -->
                          <div class="mt-2 dropdown-blur border border-[var(--border)] rounded-xl shadow-2xl py-2 overflow-hidden transition-all duration-300"
                               [class.max-h-0]="!isMobileLangOpen()"
                               [class.max-h-[400px]]="isMobileLangOpen()"
                               [class.opacity-0]="!isMobileLangOpen()"
                               [class.opacity-100]="isMobileLangOpen()"
                               [class.overflow-y-auto]="isMobileLangOpen()">
                              @for (lang of languageList; track lang.value) {
                                <button (click)="saveLang(lang.value); isMobileLangOpen.set(false)" 
                                        class="w-full flex items-center space-x-4 px-6 py-3 hover:bg-[var(--border)] transition-colors group/item border-b border-[var(--border)] last:border-0">
                                    <span class="text-xl">{{ getFlag(lang.value) }}</span>
                                    <span class="text-sm font-medium text-[var(--text-muted)] group-hover/item:text-accent">{{ lang.text }}</span>
                                    @if (i18n.locale() === lang.value) {
                                        <span class="material-icons text-accent text-sm ml-auto">check</span>
                                    }
                                </button>
                              }
                          </div>
                      </div>
                  </div>

                  @if (!authService.isLoggedIn()) {
                      <div class="grid grid-cols-2 gap-4">
                          <button routerLink="/login" (click)="closeMenu()" class="bg-white/5 text-[var(--text-main)] py-4 font-black uppercase rounded-2xl text-sm tracking-widest active:bg-accent active:text-white active:scale-95 transition-all">
                              {{ 'auth.login' | t }}
                          </button>
                          <button routerLink="/register" (click)="closeMenu()" class="bg-accent text-white py-4 font-black uppercase rounded-2xl text-sm tracking-widest active:bg-accent/80 active:scale-95 transition-all">
                              {{ 'auth.register' | t }}
                          </button>
                      </div>
                  } @else {
                      <!-- 移动端 用户中心 -->
                      <div class="pt-4 pb-2">
                          <button (click)="toggleMobileUserMenu()" 
                                  class="w-full px-4 py-4 rounded-xl text-lg font-bold text-[var(--text-main)] flex items-center justify-between group active:bg-accent active:!text-white transition-all border border-white/5">
                              <div class="flex items-center gap-4">
                                  <div class="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-sm font-bold text-white">
                                      {{ authService.currentUser()?.username?.charAt(0)?.toUpperCase() }}
                                  </div>
                                  <span class="group-active:!text-white">{{ authService.currentUser()?.username }}</span>
                              </div>
                              <span class="material-icons text-accent group-active:!text-white transition-transform" [class.rotate-180]="isMobileUserMenuOpen()">expand_more</span>
                          </button>
                          
                          <div class="space-y-1 pl-4 overflow-hidden transition-all duration-300"
                               [class.max-h-0]="!isMobileUserMenuOpen()"
                               [class.max-h-[500px]]="isMobileUserMenuOpen()"
                               [class.opacity-0]="!isMobileUserMenuOpen()"
                               [class.opacity-100]="isMobileUserMenuOpen()">
                              <button (click)="openWelcome(); closeMenu()" class="w-full text-left px-4 py-3 rounded-xl text-md font-bold text-[var(--text-main)] flex items-center gap-3 active:bg-accent active:!text-white transition-all">
                                  <span class="material-icons text-accent text-sm group-active:!text-white">auto_awesome</span>
                                  {{ 'header.welcome' | t }}
                              </button>
                              <a routerLink="/settings" (click)="closeMenu()" class="px-4 py-3 rounded-xl text-md font-bold text-[var(--text-main)] flex items-center gap-3 active:bg-accent active:!text-white transition-all">
                                  <span class="material-icons text-accent text-sm group-active:!text-white">settings</span>
                                  {{ 'header.settings' | t }}
                              </a>
                              <a routerLink="/my-items" (click)="closeMenu()" class="px-4 py-3 rounded-xl text-md font-bold text-[var(--text-main)] flex items-center gap-3 active:bg-accent active:!text-white transition-all">
                                  <span class="material-icons text-accent text-sm group-active:!text-white">inventory_2</span>
                                  {{ 'header.items' | t }}
                              </a>
                              <button (click)="switchAccount(); closeMenu()" class="w-full text-left px-4 py-3 rounded-xl text-md font-bold text-[var(--text-main)] flex items-center gap-3 active:bg-accent active:!text-white transition-all">
                                  <span class="material-icons text-accent text-sm group-active:!text-white">swap_horiz</span>
                                  {{ 'header.switchAccount' | t }}
                              </button>
                              <button (click)="authService.logout(); closeMenu()" class="w-full text-left px-4 py-3 rounded-xl text-md font-bold text-red-400 flex items-center gap-3 active:bg-red-500 active:!text-white transition-all">
                                  <span class="material-icons text-red-400 text-sm group-active:!text-white">logout</span>
                                  {{ 'auth.logout' | t }}
                              </button>
                          </div>
                      </div>
                  }
              </div>
          </div>
      </div>
    </div>
    @if (isWelcomeOpen()) {
      <app-welcome (closed)="isWelcomeOpen.set(false)"></app-welcome>
    }
  `
})
export class HeaderComponent implements OnDestroy {
  i18n = inject(I18nService);
  themeService = inject(ThemeService);
  scrollService = inject(ScrollService);
  regionService = inject(RegionService);
  authService = inject(AuthService);
  router = inject(Router);

  private readonly siteNav = viewChild<ElementRef<HTMLElement>>('siteNav');
  private headerResizeObserver?: ResizeObserver;

  constructor() {
    // 把真实顶栏高度写入 CSS 变量，供 spacer / sticky 工具条严丝合缝贴齐（桌面/移动/缩放都自适应）
    afterNextRender(() => {
      const nav = this.siteNav()?.nativeElement;
      if (!nav || typeof ResizeObserver === 'undefined') {
        this.syncHeaderHeightVar(nav?.getBoundingClientRect().height || 73);
        return;
      }
      const apply = () => this.syncHeaderHeightVar(nav.getBoundingClientRect().height);
      this.headerResizeObserver = new ResizeObserver(apply);
      this.headerResizeObserver.observe(nav);
      apply();
      window.addEventListener('resize', apply);
      this.headerResizeCleanup = () => window.removeEventListener('resize', apply);
    });
  }

  private headerResizeCleanup?: () => void;

  private syncHeaderHeightVar(heightPx: number): void {
    const h = Math.max(0, Math.round(heightPx));
    document.documentElement.style.setProperty('--app-header-height', `${h}px`);
  }

  ngOnDestroy(): void {
    this.headerResizeObserver?.disconnect();
    this.headerResizeCleanup?.();
  }

  isMenuOpen = signal(false);
  isSquadDropdownOpen = signal(false);
  // 「在线对战」父级菜单展开状态（子项：网页对战 / 录像回放）
  isOnlineDropdownOpen = signal(false);
  isReportDropdownOpen = signal(false);
  isSupportDropdownOpen = signal(false);
  isDownloadDropdownOpen = signal(false);
  isLangDropdownOpen = signal(false);
  isMobileLangOpen = signal(false);
  isMobileUserMenuOpen = signal(false);
  isUserDropdownOpen = signal(false);
  isWelcomeOpen = signal(false);

  botCount = '128';
  onlinePlayers = '1,240';

  languageList = [
      { text: "简体中文", value: "zh_CN" }, { text: "繁體中文", value: "zh_TW" }, { text: "English", value: "en" },
      { text: "Русский", value: "ru" }, { text: "Español", value: "es" }, { text: "Deutsch", value: "de" },
      { text: "Français", value: "fr" }, { text: "Italiano", value: "it" }, { text: "日本語", value: "ja" },
      { text: "한국어", value: "ko" }, { text: "Polski", value: "pl" }, { text: "Português", value: "pt" },
      { text: "Українська", value: "uk" }, { text: "العربية", value: "ar" }, { text: "Български", value: "bg" },
      { text: "Català", value: "ca" }, { text: "Čeština", value: "cs" }, { text: "Dansk", value: "da" },
      { text: "Suomi", value: "fi" }, { text: "Gàidhlig", value: "gd" }, { text: "עברית", value: "he" },
      { text: "Magyar", value: "hu" }, { text: "Latviešu", value: "lv" }, { text: "Slovenčina", value: "sk" }, { text: "Türkçe", value: "tr" }
  ];

  saveLang(lang: string) {
    this.i18n.setLocale(lang);
  }

  getFlag(locale: string): string {
    const flags: Record<string, string> = {
      'zh_CN': '🇨🇳', 'zh_TW': '🇭🇰', 'en': '🇺🇸', 'ru': '🇷🇺', 'es': '🇪🇸', 'de': '🇩🇪',
      'fr': '🇫🇷', 'it': '🇮🇹', 'ja': '🇯🇵', 'ko': '🇰🇷', 'pl': '🇵🇱', 'pt': '🇵🇹',
      'uk': '🇺🇦', 'ar': '🇸🇦', 'bg': '🇧🇬', 'ca': '🇪🇸', 'cs': '🇨🇿', 'da': '🇩🇰',
      'fi': '🇫🇮', 'gd': '🇬🇧', 'he': '🇮🇱', 'hu': '🇭🇺', 'lv': '🇱🇻', 'sk': '🇸🇰', 'tr': '🇹🇷'
    };
    return flags[locale] || '🌐';
  }

  getLangText(locale: string): string {
    return this.languageList.find(l => l.value === locale)?.text || locale;
  }

  toggleMobileLang() {
    this.isMobileLangOpen.update(v => !v);
  }

  toggleMenu() {
    this.isMenuOpen.update(v => !v);
  }

  toggleMobileUserMenu() {
    this.isMobileUserMenuOpen.update(v => !v);
  }

  closeMenu() {
    this.isMenuOpen.set(false);
  }

  openWelcome() {
    this.isWelcomeOpen.set(true);
  }

  switchAccount() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
