import { Component, signal, computed, inject, ViewChild, ElementRef, OnDestroy, PLATFORM_ID, afterNextRender } from '@angular/core';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { I18nService } from '../core/i18n/i18n.service';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { NgClass, isPlatformBrowser } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { timeout } from 'rxjs/operators';
import { BnetSRP3 } from '../utils/bnet-srp3';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [TranslatePipe, ReactiveFormsModule, NgClass, RouterLink],
  host: { class: 'flex flex-col flex-grow' },
  template: `
    <svg width="0" height="0" style="position:absolute; pointer-events:none;">
      <defs>
        <clipPath id="puzzlePath" clipPathUnits="objectBoundingBox">
          <path d="M 0,0 L 0.333,0 A 0.166,0.166 0 0 0 0.666,0 L 1,0 L 1,0.333 A 0.166,0.166 0 0 0 1,0.666 L 1,1 L 0.666,1 A 0.166,0.166 0 0 0 0.333,1 L 0,1 L 0,0.666 A 0.166,0.166 0 0 0 0,0.333 L 0,0 Z" />
        </clipPath>
      </defs>
    </svg>
    <main class="flex-grow flex items-center justify-center py-6 h-full relative bg-transparent">
        <div class="register-card p-6 md:p-12 rounded-xl shadow-2xl relative z-10 w-full max-w-[440px] mx-4 bg-[var(--card-bg)] backdrop-blur-[30px] border border-[var(--border)]">
            <h2 class="text-2xl md:text-3xl font-black italic text-center mb-6 md:mb-8 text-[var(--text-main)] uppercase">{{ 'reg.title' | t }}</h2>
            

            <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-2 md:space-y-3">
                <!-- 用户名 -->
                <div class="relative group">
                    <div class="input-box bg-[var(--secondary)] rounded-lg transition-all duration-300 h-[52px] flex items-center px-4"
                         [ngClass]="{
                            'border-2 border-green-500': isFieldValid('user'),
                            'border border-[var(--border-muted)] focus-within:border-2 focus-within:border-[var(--accent)]': !isFieldValid('user')
                         }">
                        <span class="mr-3 text-lg opacity-50" 
                              [ngClass]="{
                                'text-green-500 opacity-100': isFieldValid('user'), 
                                'text-[var(--accent)] opacity-100': focusedField() === 'user' && !isFieldValid('user')
                              }">👤</span>
                        <input type="text" formControlName="user" [placeholder]="'reg.user' | t" 
                               (focus)="focusedField.set('user')" (blur)="focusedField.set(null)"
                               class="bg-transparent w-full outline-none text-[var(--text-main)] text-sm">
                    </div>
                </div>

                <!-- 邮箱 -->
                <div class="relative group mt-3">
                    <div class="input-box bg-[var(--secondary)] rounded-lg transition-all duration-300 h-[52px] flex items-center px-4"
                         [ngClass]="{
                            'border-2 border-green-500': isFieldValid('email'),
                            'border border-[var(--border-muted)] focus-within:border-2 focus-within:border-[var(--accent)]': !isFieldValid('email')
                         }">
                        <span class="mr-3 text-lg opacity-50"
                              [ngClass]="{
                                'text-green-500 opacity-100': isFieldValid('email'), 
                                'text-[var(--accent)] opacity-100': focusedField() === 'email' && !isFieldValid('email')
                              }">📧</span>
                        <input type="email" formControlName="email" [placeholder]="'reg.email' | t" 
                               (focus)="focusedField.set('email')" (blur)="focusedField.set(null)"
                               class="bg-transparent w-full outline-none text-[var(--text-main)] text-sm">
                    </div>
                </div>

                <!-- 密码 -->
                <div class="relative group mt-3">
                    <div class="input-box bg-[var(--secondary)] rounded-lg transition-all duration-300 h-[52px] flex items-center px-4"
                         [ngClass]="{
                            'border-2 border-green-500': isFieldValid('pass'),
                            'border border-[var(--border-muted)] focus-within:border-2 focus-within:border-[var(--accent)]': !isFieldValid('pass')
                         }">
                        <span class="mr-3 text-lg opacity-50"
                              [ngClass]="{
                                'text-green-500 opacity-100': isFieldValid('pass'), 
                                'text-[var(--accent)] opacity-100': focusedField() === 'pass' && !isFieldValid('pass')
                              }">🔒</span>
                        <input [type]="showPassword() ? 'text' : 'password'" formControlName="pass" [placeholder]="'reg.pass' | t" 
                               (focus)="focusedField.set('pass')" (blur)="focusedField.set(null)"
                               class="bg-transparent w-full outline-none text-[var(--text-main)] text-sm">
                        @if (form.get('pass')?.value) {
                            <button type="button" (click)="showPassword.set(!showPassword())" class="ml-2 focus:outline-none transition-colors"
                                    [ngClass]="{'text-green-500': isFieldValid('pass'), 'text-[var(--text-muted)]': !isFieldValid('pass')}">
                                @if (showPassword()) {
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M12 9a3 3 0 0 0-3 3a3 3 0 0 0 3 3a3 3 0 0 0 3-3a3 3 0 0 0-3-3m0 8a5 5 0 0 1-5-5a5 5 0 0 1 5-5a5 5 0 0 1 5 5a5 5 0 0 1-5 5m0-12.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5Z"/></svg>
                                } @else {
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M11.83 9L15 12.17V12a3 3 0 0 0-3-3h-.17m-4.3.8l1.55 1.55c-.05.21-.08.42-.08.65a3 3 0 0 0 3 3c.22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53a5 5 0 0 1-5-5c0-.79.2-1.53.53-2.2M2 4.27l2.28 2.28l.46.46C3.08 8.3 1.78 10 1 12c1.73 4.39 6 7.5 11 7.5c1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22L21 20.73L3.27 3L2 4.27M12 7a5 5 0 0 1 5 5c0 .64-.13 1.25-.35 1.82l3.43 3.43c1.2-1.58 2.15-3.34 2.92-5.25C21.27 7.61 17 4.5 12 4.5c-1.54 0-3.01.3-4.36.82l2.54 2.54c.57-.22 1.18-.36 1.82-.36Z"/></svg>
                                }
                            </button>
                        }
                    </div>
                </div>

                <!-- 确认密码 -->
                <div class="relative group mt-3">
                    <div class="input-box bg-[var(--secondary)] rounded-lg transition-all duration-300 h-[52px] flex items-center px-4"
                         [ngClass]="{
                            'border-2 border-green-500': isFieldValid('confirm'),
                            'border border-[var(--border-muted)] focus-within:border-2 focus-within:border-[var(--accent)]': !isFieldValid('confirm')
                         }">
                        <span class="mr-3 text-lg opacity-50"
                              [ngClass]="{
                                'text-green-500 opacity-100': isFieldValid('confirm'), 
                                'text-[var(--accent)] opacity-100': focusedField() === 'confirm' && !isFieldValid('confirm')
                              }">🛡️</span>
                        <input [type]="showConfirmPassword() ? 'text' : 'password'" formControlName="confirm" [placeholder]="'reg.confirm' | t" 
                               (focus)="focusedField.set('confirm')" (blur)="focusedField.set(null)"
                               class="bg-transparent w-full outline-none text-[var(--text-main)] text-sm">
                        @if (form.get('confirm')?.value) {
                            <button type="button" (click)="showConfirmPassword.set(!showConfirmPassword())" class="ml-2 focus:outline-none transition-colors"
                                    [ngClass]="{'text-green-500': isFieldValid('confirm'), 'text-[var(--text-muted)]': !isFieldValid('confirm')}">
                                @if (showConfirmPassword()) {
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M12 9a3 3 0 0 0-3 3a3 3 0 0 0 3 3a3 3 0 0 0 3-3a3 3 0 0 0-3-3m0 8a5 5 0 0 1-5-5a5 5 0 0 1 5-5a5 5 0 0 1 5 5a5 5 0 0 1-5 5m0-12.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5Z"/></svg>
                                } @else {
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M11.83 9L15 12.17V12a3 3 0 0 0-3-3h-.17m-4.3.8l1.55 1.55c-.05.21-.08.42-.08.65a3 3 0 0 0 3 3c.22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53a5 5 0 0 1-5-5c0-.79.2-1.53.53-2.2M2 4.27l2.28 2.28l.46.46C3.08 8.3 1.78 10 1 12c1.73 4.39 6 7.5 11 7.5c1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22L21 20.73L3.27 3L2 4.27M12 7a5 5 0 0 1 5 5c0 .64-.13 1.25-.35 1.82l3.43 3.43c1.2-1.58 2.15-3.34 2.92-5.25C21.27 7.61 17 4.5 12 4.5c-1.54 0-3.01.3-4.36.82l2.54 2.54c.57-.22 1.18-.36 1.82-.36Z"/></svg>
                                }
                            </button>
                        }
                    </div>
                </div>

                <!-- 滑动拼图验证 -->
                <div class="mt-2 select-none">
                    <div #puzzleContainer class="relative w-full aspect-[2/1] rounded-lg overflow-hidden mb-3 border border-[var(--border)] bg-[var(--secondary)]">
                        <!-- 背景图 -->
                        @if (bgUrl()) {
                            <img [src]="bgUrl()" (error)="handleImageError()" class="w-full h-full opacity-80" #bgImage alt="Puzzle Background" referrerpolicy="no-referrer">
                        }
                        
                        <!-- 刷新按钮 -->
                        <button type="button" (click)="refreshPuzzle()" class="absolute top-2 right-2 z-30 p-1.5 bg-black/40 hover:bg-black/60 rounded-full text-white/70 hover:text-white transition-all backdrop-blur-sm" [disabled]="verifyState() === 'success'">
                            <span class="material-icons text-[18px]">refresh</span>
                        </button>

                        <!-- 缺口 -->
                        <div class="absolute bg-black/70 shadow-[inset_0_0_10px_rgba(0,0,0,0.9)] z-10"
                             [style.width.px]="pieceSize()" [style.height.px]="pieceSize()"
                             [style.left.px]="targetX()" [style.top.px]="targetY()"
                             style="clip-path: url(#puzzlePath)"></div>
                             
                        <!-- 拼图块 -->
                        @if (sliceUrl()) {
                            <div class="absolute shadow-[0_0_15px_rgba(0,0,0,0.8)] z-20"
                                 [style.width.px]="pieceSize()" [style.height.px]="pieceSize()"
                                 [style.left.px]="puzzleX()" 
                                 [style.top.px]="targetY()"
                                 [style.background-image]="'url(' + sliceUrl() + ')'"
                                 [style.background-size]="'100% 100%'"
                                 style="clip-path: url(#puzzlePath)">
                            </div>
                        }
                        
                        <!-- 状态遮罩 -->
                        @if (verifyState() === 'success') {
                            <div class="absolute inset-0 bg-green-500/40 flex flex-col items-center justify-center backdrop-blur-md transition-all z-40">
                                <div class="bg-white/10 p-4 rounded-2xl border border-white/20 flex flex-col items-center shadow-2xl animate-in zoom-in duration-300">
                                    <span class="text-white font-black text-xl drop-shadow-lg uppercase tracking-tighter">{{ 'reg.verified' | t }}</span>
                                    <div class="flex items-center gap-2 mt-1">
                                        <div class="w-1 h-1 bg-green-400 rounded-full animate-ping"></div>
                                        <span class="text-white/90 text-xs font-mono font-bold">{{ timeLeft() }}s</span>
                                    </div>
                                </div>
                            </div>
                        } @else if (verifyState() === 'fail') {
                            <div class="absolute inset-0 bg-red-500/20 flex items-center justify-center backdrop-blur-sm transition-all z-40">
                                <span class="text-white font-bold text-lg drop-shadow-md">{{ 'reg.tryAgain' | t }}</span>
                            </div>
                        }
                        
                        @if (isLoadingImage()) {
                             <div class="absolute inset-0 bg-[var(--card-bg)] flex items-center justify-center z-20">
                                <span class="material-icons animate-spin text-[var(--accent)]">autorenew</span>
                             </div>
                        }
                    </div>

                    <!-- 滑块条 -->
                    <div #sliderTrack class="relative w-full h-10 bg-[var(--secondary)] rounded-full border border-[var(--border)] flex items-center px-1 group cursor-pointer overflow-hidden touch-none"
                         [class.opacity-50]="verifyState() === 'success'">
                        <div class="text-[10px] text-center w-full opacity-40 font-bold tracking-widest uppercase pointer-events-none z-0">
                            {{ verifyState() === 'success' ? '' : ('reg.slideToVerify' | t) }}
                        </div>
                        
                        <!-- 滑块按钮 -->
                        <div class="absolute top-1 bottom-1 w-[40px] bg-[var(--accent)] rounded-full shadow-lg flex items-center justify-center text-white font-bold cursor-grab active:cursor-grabbing transition-transform hover:scale-105 z-10 touch-none"
                             [style.left.px]="sliderLeft()"
                             [style.transition]="isDragging() ? 'none' : 'left 0.3s ease-out'"
                             (mousedown)="startDrag($event)"
                             (touchstart)="startDrag($event)">
                             <span class="material-icons text-sm">{{ verifyState() === 'success' ? 'check' : 'arrow_forward' }}</span>
                        </div>
                    </div>
                </div>

                <button type="submit" class="w-full h-12 rounded-lg font-black italic text-lg uppercase tracking-widest transition-all flex items-center justify-center gap-2 mt-4" 
                        [disabled]="!canSubmit() || isLoading()" 
                        [ngClass]="canSubmit() && !isLoading() ? 'bg-accent text-[var(--text-inverted)] border border-accent hover:brightness-110 active:opacity-80 active:scale-95 shadow-lg shadow-accent/20' : 'bg-white/5 text-[var(--text-main)]/40 cursor-not-allowed border border-[var(--border-muted)]'">
                    @if (isLoading()) {
                        <span class="material-icons animate-spin text-[18px]">autorenew</span>
                    }
                    {{ 'reg.submit' | t }}
                </button>
                
                <a routerLink="/login" class="block text-center text-[10px] opacity-40 hover:opacity-100 hover:text-accent font-bold uppercase mt-2">{{ 'reg.back' | t }}</a>
            </form>
            
            <!-- 预留固定高度的错误/成功提示容器 -->
            <div class="h-[80px] mt-4 overflow-y-auto">
                @if (errorMessage()) {
                    <div class="bg-red-500/20 border border-red-500 text-red-400 px-4 py-1 rounded text-sm text-center animate-pulse">
                        {{ errorMessage() }}
                    </div>
                } @else if (successMessage()) {
                    <div class="bg-green-500/20 border border-green-500 text-green-400 px-4 py-1 rounded text-sm text-center">
                        {{ successMessage() }}
                    </div>
                }
            </div>
        </div>
    </main>
  `
})
export class RegisterComponent implements OnDestroy {
  http = inject(HttpClient);
  router = inject(Router);
  private platformId = inject(PLATFORM_ID);

  @ViewChild('puzzleContainer') puzzleContainer!: ElementRef;
  @ViewChild('sliderTrack') sliderTrack!: ElementRef;
  @ViewChild('bgImage') bgImage!: ElementRef;

  // 状态信号
  rawTargetX = signal(0);
  rawTargetY = signal(0);
  scale = signal(1);

  pieceSize = computed(() => 45 * this.scale());
  targetX = computed(() => this.rawTargetX() * this.scale());
  targetY = computed(() => this.rawTargetY() * this.scale());

  verifyState = signal<'idle' | 'success' | 'fail'>('idle');
  sliderLeft = signal(4); // 初始 padding
  puzzleX = signal(0);
  bgSize = signal('100% 100%');
  isLoading = signal(false);
  isLoadingImage = signal(true);
  isDragging = signal(false);
  timeLeft = signal(0);
  private verifyTimer: ReturnType<typeof setInterval> | null = null;
  
  errorMessage = signal('');
  successMessage = signal('');
  
  bgUrl = signal('');
  sliceUrl = signal('');
  showPassword = signal(false);
  showConfirmPassword = signal(false);

  form = new FormBuilder().group({
    user: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9.\-_[\]()]{3,14}$/), this.noOnlyDigitsValidator]],
    email: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)]],
    pass: ['', [Validators.required, Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[~!@#$%^&*()_\-+=|\\{}[\]:;"'<>,.?/]).{8,}$/)]],
    confirm: ['', Validators.required]
  }, { validators: this.passwordMatchValidator });

  focusedField = signal<string | null>(null);

  getFieldError(field: string): string {
    const control = this.form.get(field);
    if (!control || !control.errors || !(control.dirty || control.touched)) return '';
    
    if (field === 'user') {
      if (control.errors['pattern']) return this.i18n.t('reg.userLength');
      if (control.errors['onlyDigits']) return this.i18n.t('reg.userError');
    }
    if (field === 'email' && control.errors['pattern']) return this.i18n.t('reg.emailError');
    if (field === 'pass' && control.errors['pattern']) return this.i18n.t('reg.passError');
    if (field === 'confirm' && this.form.hasError('passwordMismatch')) return this.i18n.t('reg.confirmError');
    
    return '';
  }

  noOnlyDigitsValidator(control: { value: string | null }) {
    const isOnlyDigits = /^\d+$/.test(control.value || '');
    return isOnlyDigits ? { 'onlyDigits': true } : null;
  }

  constructor() {
    afterNextRender(() => {
      this.refreshPuzzle();
      // 窗口大小改变时重置
      window.addEventListener('resize', this.onResize);
    });
  }

  ngOnDestroy() {
    if (isPlatformBrowser(this.platformId)) {
      window.removeEventListener('resize', this.onResize);
      this.removeDragListeners();
    }
    this.stopVerifyTimer();
  }

  onResize = () => {
    this.initDimensions();
  }

  initDimensions() {
    if (!this.puzzleContainer) return;
    const containerW = this.puzzleContainer.nativeElement.offsetWidth;
    // PHP 图片原始宽度为 400
    this.scale.set(containerW / 400);
    const containerH = containerW / 2; // 2:1 比例
    this.bgSize.set(`${containerW}px ${containerH}px`);
  }

  resetPuzzle() {
    this.verifyState.set('idle');
    this.sliderLeft.set(4);
    this.puzzleX.set(0);
    this.stopVerifyTimer();
    this.refreshPuzzle();
  }

  refreshPuzzle() {
    this.isLoadingImage.set(true);
    this.http.get<{success: boolean, bg_img: string, slice_img: string, x: number, y: number, message?: string}>('/api/captcha.php')
      .subscribe({
        next: (res) => {
          this.isLoadingImage.set(false);
          if (res.success) {
            this.bgUrl.set(res.bg_img);
            this.sliceUrl.set(res.slice_img);
            this.rawTargetX.set(res.x);
            this.rawTargetY.set(res.y);
            this.initDimensions();
          } else {
            this.errorMessage.set(res.message || '无法加载验证码');
          }
        },
        error: (err) => {
          this.isLoadingImage.set(false);
          this.errorMessage.set('网络错误，无法加载验证码');
          console.error(err);
        }
      });
  }

  handleImageError() {
    this.refreshPuzzle();
  }

  // 拖动逻辑
  private startX = 0;
  private startLeft = 0;

  startDrag(e: MouseEvent | TouchEvent) {
    if (this.verifyState() === 'success') return;
    
    this.isDragging.set(true);
    this.startX = e instanceof MouseEvent ? e.clientX : e.touches[0].clientX;
    this.startLeft = this.sliderLeft();
    
    document.addEventListener('mousemove', this.onDrag);
    document.addEventListener('mouseup', this.stopDrag);
    document.addEventListener('touchmove', this.onDrag);
    document.addEventListener('touchend', this.stopDrag);
  }

  onDrag = (e: MouseEvent | TouchEvent) => {
    const clientX = e instanceof MouseEvent ? e.clientX : e.touches[0].clientX;
    const delta = clientX - this.startX;
    let newLeft = this.startLeft + delta;
    
    // 限制范围
    if (!this.sliderTrack) return;
    const trackW = this.sliderTrack.nativeElement.offsetWidth;
    const btnW = 40;
    const maxLeft = trackW - btnW - 4; // 4px padding
    
    if (newLeft < 4) newLeft = 4;
    if (newLeft > maxLeft) newLeft = maxLeft;
    
    this.sliderLeft.set(newLeft);
    
    // 计算拼图块位置
    // 比例映射：滑块行程 -> 拼图行程
    // 滑块行程 = trackW - btnW - 8
    // 拼图行程 = containerW - pieceSize
    if (!this.puzzleContainer) return;
    const containerW = this.puzzleContainer.nativeElement.offsetWidth;
    const sliderTravel = maxLeft - 4;
    const puzzleTravel = containerW - this.pieceSize();
    
    const ratio = (newLeft - 4) / sliderTravel;
    this.puzzleX.set(ratio * puzzleTravel);
  }

  stopDrag = () => {
    this.isDragging.set(false);
    this.removeDragListeners();
    
    // 前端不再校验具体位置，直接标记为“待提交验证”
    // 或者我们可以保留一个简单的本地校验，但最终以服务器为准
    // 这里我们假设用户只要拖动了滑块，就允许点击提交，由后端 register.php 校验 slide_x
    this.verifyState.set('success');
    this.errorMessage.set('');
    this.startVerifyTimer();
  }

  startVerifyTimer() {
    this.stopVerifyTimer();
    this.timeLeft.set(60); // 60秒有效期
    
    this.verifyTimer = setInterval(() => {
        this.timeLeft.update(v => v - 1);
        if (this.timeLeft() <= 0) {
            this.stopVerifyTimer();
            this.resetPuzzle();
            this.errorMessage.set(this.i18n.t('reg.expired'));
        }
    }, 1000);
  }

  stopVerifyTimer() {
    if (this.verifyTimer) {
        clearInterval(this.verifyTimer);
        this.verifyTimer = null;
    }
  }

  removeDragListeners() {
    document.removeEventListener('mousemove', this.onDrag);
    document.removeEventListener('mouseup', this.stopDrag);
    document.removeEventListener('touchmove', this.onDrag);
    document.removeEventListener('touchend', this.stopDrag);
  }

  passwordMatchValidator(g: { get: (name: string) => { value: string } | null }) {
    const pass = g.get('pass');
    const confirm = g.get('confirm');
    return pass && confirm && pass.value === confirm.value ? null : { 'passwordMismatch': true };
  }

  isFieldValid(field: string): boolean {
    const control = this.form.get(field);
    if (field === 'confirm') {
      return !!(control && control.value && !this.form.hasError('passwordMismatch'));
    }
    return !!(control && control.valid && control.value);
  }

  isFieldInvalid(field: string): boolean {
    const control = this.form.get(field);
    if (field === 'confirm') {
      return !!(control && control.value && this.form.hasError('passwordMismatch'));
    }
    return !!(control && control.invalid && control.value);
  }

  // ... existing code ...

  canSubmit() {
    // 现在的 form.valid 已经包含了“禁止纯数字”的检查
    return this.form.valid && this.verifyState() === 'success';
  }

  i18n = inject(I18nService);

  async submit() {
    if (this.canSubmit() && !this.isLoading()) {
      this.isLoading.set(true);
      this.errorMessage.set('');
      this.successMessage.set('');

      const username = this.form.get('user')?.value || '';
      const password = this.form.get('pass')?.value || '';
      const email = this.form.get('email')?.value || '';

      try {
        const srp = new BnetSRP3(username, password);
        const saltBytes = srp.getSalt();
        const verifierBytes = await srp.getVerifier();

        // Convert to hex strings for the backend
        const saltHex = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
        const verifierHex = Array.from(verifierBytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

        // 使用相对路径的 API URL
        const apiUrl = '/api/register.php';
        
        this.http.post<{success: boolean, message: string}>(apiUrl, { 
          username, 
          password, 
          email,
          salt: saltHex,
          verifier: verifierHex,
          slide_x: Math.round(this.puzzleX() / this.scale())
        }).pipe(
            timeout(5000) // 5秒超时
        ).subscribe({
          next: (res) => {
            this.isLoading.set(false);
            if (res.success) {
              this.successMessage.set(this.i18n.t('reg.regSuccess'));
              // 弹出成功提示
              alert(this.i18n.t('reg.regSuccess'));
              setTimeout(() => this.router.navigate(['/login']), 2000);
            } else {
              this.errorMessage.set(res.message || this.i18n.t('reg.regFail'));
              // 失败后重置验证码
              this.resetPuzzle();
            }
          },
          error: (err) => {
            this.isLoading.set(false);
            const backendMsg = err.error?.message;
            this.errorMessage.set(backendMsg || this.i18n.t('reg.networkError'));
            console.error(err);
          }
        });
      } catch (err: unknown) {
        this.isLoading.set(false);
        // 显示详细错误信息以便调试
        const detail = err instanceof Error ? err.message : String(err);
        this.errorMessage.set(`${this.i18n.t('reg.cryptoError')} (${detail})`);
        console.error('SRP Generation Error:', err);
      }
    }
  }
}
