import { Component, inject, signal } from '@angular/core';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { I18nService } from '../core/i18n/i18n.service';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { NgClass } from '@angular/common';
import { RouterLink, Router, ActivatedRoute, Params } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { BnetSRP3 } from '../utils/bnet-srp3';
import { AuthService } from '../core/auth.service';

interface LoginStep1Response {
  status: number;
  salt?: string;
  B?: string;
  message?: string;
}

interface LoginStep2Response {
  success: boolean;
  token?: string;
  message?: string;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [TranslatePipe, ReactiveFormsModule, NgClass, RouterLink],
  host: { class: 'flex flex-col flex-grow' },
  template: `
    <main class="flex-grow flex items-center justify-center py-6 h-full relative bg-transparent">
        <div class="login-card p-8 md:p-12 rounded-xl shadow-2xl relative z-10 w-full max-w-[400px] mx-4 bg-[var(--card-bg)] backdrop-blur-[30px] border border-[var(--border)]">
            <div class="flex flex-col items-center mb-6 md:mb-8">
                <div class="text-[60px] md:text-[80px] leading-none mb-2" style="font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', sans-serif;">⚔</div>
                <h2 class="text-2xl md:text-3xl font-black tracking-[4px] text-center text-[var(--text-main)] uppercase">{{ 'login.title' | t }}</h2>
            </div>
            
            <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-2 md:space-y-3 w-full">
                <!-- 账号输入 -->
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
                        <input type="text" formControlName="user" [placeholder]="'login.user' | t" 
                               (focus)="focusedField.set('user')" (blur)="focusedField.set(null)"
                               class="bg-transparent w-full outline-none text-[var(--text-main)] text-sm">
                    </div>
                </div>
                
                <!-- 密码输入 -->
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
                        <input [type]="showPassword() ? 'text' : 'password'" formControlName="pass" [placeholder]="'login.pass' | t" 
                               (focus)="focusedField.set('pass')" (blur)="focusedField.set(null)"
                               class="bg-transparent w-full outline-none text-[var(--text-main)] text-sm" (keyup.enter)="submit()">
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

                <!-- 记住密码 & 注册账号 -->
                <div class="flex justify-between items-center h-[30px] pt-2">
                    <label class="flex items-center cursor-pointer group">
                        <div class="w-4 h-4 rounded-[3px] bg-[var(--tertiary)] border border-[var(--border-muted)] flex items-center justify-center mr-2 group-hover:border-[var(--accent)] transition-colors" [ngClass]="{'border-[var(--accent)]': form.get('remember')?.value}">
                            @if (form.get('remember')?.value) {
                                <div class="w-2 h-2 rounded-[1px] bg-[var(--accent)]"></div>
                            }
                        </div>
                        <input type="checkbox" formControlName="remember" class="hidden">
                        <span class="text-[12px] text-[var(--text-muted)]">{{ 'login.remember' | t }}</span>
                    </label>
                    
                    <a routerLink="/register" class="text-[12px] text-[var(--accent)] hover:underline transition-colors cursor-pointer">
                        {{ 'login.register' | t }}
                    </a>
                </div>

                <!-- 登录按钮 -->
                <button type="submit" class="w-full h-[50px] rounded-lg font-bold text-[16px] transition-all mt-6 relative overflow-hidden group flex items-center justify-center gap-2" 
                        [disabled]="!canSubmit() || isLoading()" 
                        [ngClass]="canSubmit() && !isLoading() ? 'bg-[var(--accent)] text-[var(--text-inverted)] border border-[var(--accent)] hover:brightness-110 active:opacity-80 active:scale-95 shadow-lg shadow-[var(--accent)]/20' : 'bg-white/5 text-[var(--text-main)]/40 cursor-not-allowed border border-[var(--border-muted)]'">
                    @if (isLoading()) {
                        <span class="material-icons animate-spin text-[18px]">autorenew</span>
                    }
                    <span class="relative z-10">{{ 'login.submit' | t }}</span>
                </button>
            </form>
            
            <!-- 预留固定高度的错误提示容器 -->
            <div class="h-[80px] mt-4 overflow-y-auto">
                @if (errorMessage() && (!needsVerification() || errorUsernames().includes(form.get('user')?.value || ''))) {
                    <div class="bg-red-500/20 border border-red-500 text-red-400 px-4 py-1 rounded text-sm text-center">
                        {{ errorMessage() }}
                        @if (needsVerification()) {
                            <div class="mt-1">
                                <button (click)="resendVerification()" class="text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer text-sm transition-colors bg-transparent border-none">
                                    没收到邮件？
                                </button>
                            </div>
                        }
                    </div>
                }
            </div>
        </div>
    </main>
  `
})
export class LoginComponent {
  private http = inject(HttpClient);
  private router = inject(Router);
  private i18n = inject(I18nService);
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);
  
  isLoading = signal(false);
  errorMessage = signal('');
  errorUsernames = signal<string[]>([]);
  needsVerification = signal(false);
  focusedField = signal<string | null>(null);
  showPassword = signal(false);
  loginStep = signal<'web' | 'srp1' | 'srp2'>('web');
  loginSource = signal<'web' | 'launcher' | 'game'>('web');
  webToken = signal<string | null>(null);

  form = new FormBuilder().group({
    // 允许 3-14 位用户名 OR 标准邮箱格式，同时禁止纯数字
    user: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9.\-_[\]()]{3,14}$|^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/), this.noOnlyDigitsValidator]],
    pass: ['', [Validators.required, Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[~!@#$%^&*()_\-+=|\\{}[\]:;"'<>,.?/]).{8,}$/)]],
    remember: [false]
  });

  noOnlyDigitsValidator(control: { value: string | null }) {
    const val = control.value || '';
    // 如果是纯数字，则报错
    const isOnlyDigits = /^\d+$/.test(val);
    return isOnlyDigits ? { 'onlyDigits': true } : null;
  }

  constructor() {
    this.route.queryParams.subscribe((params: Params) => {
      const source = params['source'];
      if (['web', 'launcher', 'game'].includes(source)) {
        this.loginSource.set(source as 'web' | 'launcher' | 'game');
      }
    });

    // Load remembered credentials
    if (typeof window !== 'undefined') {
      const remembered = localStorage.getItem('remembered_credentials');
      if (remembered) {
        try {
          const { user, pass } = JSON.parse(remembered);
          this.form.patchValue({ user, pass, remember: true });
        } catch (e) {
          console.error('Failed to parse remembered credentials', e);
        }
      }
    }
  }

  isFieldValid(field: string): boolean {
    const control = this.form.get(field);
    return !!(control && control.valid && control.value);
  }

  isFieldInvalid(field: string): boolean {
    const control = this.form.get(field);
    return !!(control && control.invalid && control.value);
  }

  getFieldError(field: string): string {
    const control = this.form.get(field);
    if (!control || !control.errors || !(control.dirty || control.touched)) return '';
    
    if (field === 'user') {
      if (control.errors['onlyDigits']) return this.i18n.t('login.userError');
      if (control.errors['pattern']) return this.i18n.t('login.userError');
    }
    
    return '';
  }

  canSubmit() {
    return this.form.valid;
  }

  async submit() {
    if (!this.canSubmit() || this.isLoading()) return;
    
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.needsVerification.set(false);
    
    const username = this.form.get('user')?.value || '';
    const password = this.form.get('pass')?.value || '';

    if (this.form.get('remember')?.value) {
      localStorage.setItem('remembered_credentials', JSON.stringify({
        user: username,
        pass: password
      }));
    } else {
      localStorage.removeItem('remembered_credentials');
    }

    try {
      // 第一步：网页端验证 (Web Login)
      this.http.post<{ success: boolean; token?: string; message?: string; needs_verification?: boolean; error_code?: string }>('/api/web_login.php', {
        username,
        password,
        source: this.loginSource()
      }).subscribe({
        next: (res) => {
          if (res.success && res.token) {
            this.webToken.set(res.token);
            localStorage.setItem('web_auth_token', res.token);
            
            // 登录成功，更新 AuthService 状态
            this.authService.login({ username });
            
            // 如果是网页登录，直接结束
            if (this.loginSource() === 'web') {
              this.isLoading.set(false);
              this.router.navigate(['/']);
            } else {
              // 如果是客户端/游戏登录，继续 SRP3 验证
              this.startSRPLogin(username, password);
            }
          } else {
            this.isLoading.set(false);
            if (res.error_code) {
              this.errorMessage.set(this.i18n.t(`error.${res.error_code}`));
            } else {
              this.errorMessage.set(res.message || this.i18n.t('login.webAuthFail'));
            }
            if (res.needs_verification) {
              this.needsVerification.set(true);
              if (!this.errorUsernames().includes(username)) {
                this.errorUsernames.update(names => [...names, username]);
              }
            } else {
              this.needsVerification.set(false);
            }
          }
        },
        error: (err) => {
          this.isLoading.set(false);
          const status = err.status || 'Unknown';
          if (status === 404) {
            this.errorMessage.set(this.i18n.t('error.ERR_CONNECTION_FAILED_404'));
          } else {
            this.errorMessage.set(`${this.i18n.t('reg.networkError')} (Code: ${status})`);
          }
          console.error(err);
        }
      });
    } catch (err) {
      this.isLoading.set(false);
      this.errorMessage.set(this.i18n.t('reg.cryptoError'));
      console.error(err);
    }
  }

  private async startSRPLogin(username: string, password: string) {
    try {
      this.loginStep.set('srp1');
      const srp = new BnetSRP3(username, password);
      const A_bytes = srp.getClientSessionPublicKey();
      const A_hex = Array.from(A_bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

      this.http.post<LoginStep1Response>('/api/login_step1.php', {
        username: username,
        A: A_hex,
        web_token: this.webToken()
      }).subscribe({
        next: (res) => {
          if (res.status === 0 && res.salt && res.B) {
            const saltBytes = new Uint8Array(res.salt.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)));
            const B_bytes = new Uint8Array(res.B.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)));

            srp.setSalt(saltBytes);
            srp.getClientPasswordProof(B_bytes).then(M1_bytes => {
              const M1_hex = Array.from(M1_bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
              this.sendSRPProof(username, M1_hex);
            });
          } else {
            this.isLoading.set(false);
            this.errorMessage.set(res.message || this.i18n.t('login.bnetAuthFail'));
          }
        },
        error: (err) => {
          this.isLoading.set(false);
          const status = err.status || 'Unknown';
          if (status === 404) {
            this.errorMessage.set(this.i18n.t('error.ERR_CONNECTION_FAILED_404'));
          } else {
            this.errorMessage.set(`${this.i18n.t('reg.networkError')} (Code: ${status})`);
          }
          console.error(err);
        }
      });
    } catch (err) {
      this.isLoading.set(false);
      this.errorMessage.set(this.i18n.t('reg.cryptoError'));
      console.error(err);
    }
  }

  private sendSRPProof(username: string, M1_hex: string) {
    this.loginStep.set('srp2');
    this.http.post<LoginStep2Response>('/api/login_step2.php', {
      username: username,
      M1: M1_hex,
      web_token: this.webToken()
    }).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.success) {
          alert('战网验证成功！登录完成');
          if (res.token) {
            localStorage.setItem('bnet_auth_token', res.token);
          }
          this.router.navigate(['/']);
        } else {
          this.errorMessage.set(res.message || this.i18n.t('login.passError'));
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        const status = err.status || 'Unknown';
        if (status === 404) {
          this.errorMessage.set(this.i18n.t('error.ERR_CONNECTION_FAILED_404'));
        } else {
          this.errorMessage.set(`${this.i18n.t('reg.networkError')} (Code: ${status})`);
        }
        console.error(err);
      }
    });
  }

  resendVerification() {
    const username = this.form.get('user')?.value;
    if (!username) return;

    this.isLoading.set(true);
    this.http.post<{ success: boolean; message: string; error_code?: string; debug_verify_link?: string }>('/api/resend_verification.php', { username })
      .subscribe({
        next: (res) => {
          this.isLoading.set(false);
          if (res.error_code) {
            this.errorMessage.set(this.i18n.t(`error.${res.error_code}`));
          } else {
            this.errorMessage.set(res.message);
          }
          if (res.debug_verify_link) {
            console.log('%c[测试环境] 激活链接: %c' + res.debug_verify_link, 'color: #4CAF50; font-weight: bold;', 'color: #2196F3; text-decoration: underline;');
          }
          if (res.success) {
            this.needsVerification.set(false);
          }
        },
        error: (err) => {
          this.isLoading.set(false);
          const status = err.status || 'Unknown';
          if (status === 404) {
            this.errorMessage.set(this.i18n.t('error.ERR_CONNECTION_FAILED_404'));
          } else {
            this.errorMessage.set(`${this.i18n.t('reg.networkError')} (Code: ${status})`);
          }
          console.error(err);
        }
      });
  }
}
