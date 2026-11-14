import { Component, OnInit, inject, signal } from '@angular/core';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { I18nService } from '../core/i18n/i18n.service';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { NgClass } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';

interface ResetValidateResponse {
  success: boolean;
  username?: string;
  message?: string;
  error_code?: string;
}

interface ResetSubmitResponse {
  success: boolean;
  message?: string;
  error_code?: string;
}

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [TranslatePipe, ReactiveFormsModule, NgClass, RouterLink],
  host: { class: 'flex flex-col flex-grow' },
  template: `
    <main class="flex-grow flex items-center justify-center py-6 h-full relative bg-transparent">
        <div class="login-card p-8 md:p-12 rounded-xl shadow-2xl relative z-10 w-full max-w-[400px] mx-4 bg-[var(--card-bg)] backdrop-blur-[30px] border border-[var(--border)]">
            <div class="flex flex-col items-center mb-6 md:mb-8">
                <div class="text-[60px] md:text-[80px] leading-none mb-2" style="font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', sans-serif;">🔑</div>
                <h2 class="text-2xl md:text-3xl font-black tracking-[4px] text-center text-[var(--text-main)] uppercase">{{ 'reset.title' | t }}</h2>
                <p class="text-[12px] text-[var(--text-muted)] text-center mt-2">{{ 'reset.subtitle' | t }}</p>
                @if (username()) {
                    <p class="text-[13px] text-[var(--accent)] text-center mt-3">{{ 'reset.account' | t }}：{{ username() }}</p>
                }
            </div>

            @if (tokenInvalid()) {
                <div class="px-4 py-3 rounded text-sm text-center bg-red-500/20 border border-red-500 text-red-400">
                    {{ message() || ('reset.invalidToken' | t) }}
                </div>
                <div class="text-center mt-6 space-y-3">
                    <a routerLink="/forgot-password" class="block text-[13px] text-[var(--accent)] hover:underline">{{ 'reset.requestAgain' | t }}</a>
                    <a routerLink="/login" class="block text-[12px] text-[var(--text-muted)] hover:text-[var(--accent)]">{{ 'reset.backLogin' | t }}</a>
                </div>
            } @else if (done()) {
                <div class="px-4 py-3 rounded text-sm text-center bg-green-500/20 border border-green-500 text-green-400">
                    {{ message() || ('reset.success' | t) }}
                </div>
                <div class="text-center mt-6">
                    <a routerLink="/login" class="inline-flex items-center justify-center w-full h-[50px] rounded-lg font-bold text-[16px] bg-[var(--accent)] text-[var(--text-inverted)] hover:brightness-110">
                        {{ 'reset.goLogin' | t }}
                    </a>
                </div>
            } @else {
                <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4 w-full">
                    <div class="relative group">
                        <div class="input-box bg-[var(--secondary)] border border-[var(--border-muted)] rounded-lg transition-all duration-300 h-[52px] flex items-center px-4 focus-within:border-2 focus-within:border-[var(--accent)]"
                             [ngClass]="{'border-red-500/50': isFieldInvalid('pass'), 'border-green-500/50': isFieldValid('pass')}">
                            <span class="mr-3 text-lg opacity-50">🔒</span>
                            <input [type]="showPassword() ? 'text' : 'password'" formControlName="pass" [placeholder]="'reset.pass' | t"
                                   (focus)="focusedField.set('pass')" (blur)="focusedField.set(null)"
                                   class="bg-transparent w-full outline-none text-[var(--text-main)] text-sm" autocomplete="new-password">
                            @if (form.get('pass')?.value) {
                                <button type="button" (click)="showPassword.set(!showPassword())" class="ml-2 text-[var(--text-muted)] focus:outline-none">
                                    <span class="material-icons text-[18px]">{{ showPassword() ? 'visibility' : 'visibility_off' }}</span>
                                </button>
                            }
                        </div>
                        <div class="min-h-[18px] mt-1">
                            @if (focusedField() === 'pass' || isFieldInvalid('pass')) {
                                <div class="text-red-400 text-[10px]">
                                    * {{ isFieldInvalid('pass') ? getFieldError('pass') : ('reset.passHint' | t) }}
                                </div>
                            }
                        </div>
                    </div>

                    <div class="relative group">
                        <div class="input-box bg-[var(--secondary)] border border-[var(--border-muted)] rounded-lg transition-all duration-300 h-[52px] flex items-center px-4 focus-within:border-2 focus-within:border-[var(--accent)]"
                             [ngClass]="{'border-red-500/50': isConfirmInvalid(), 'border-green-500/50': isConfirmValid()}">
                            <span class="mr-3 text-lg opacity-50">🔐</span>
                            <input [type]="showConfirm() ? 'text' : 'password'" formControlName="confirm" [placeholder]="'reset.confirm' | t"
                                   (focus)="focusedField.set('confirm')" (blur)="focusedField.set(null)"
                                   class="bg-transparent w-full outline-none text-[var(--text-main)] text-sm" autocomplete="new-password">
                            @if (form.get('confirm')?.value) {
                                <button type="button" (click)="showConfirm.set(!showConfirm())" class="ml-2 text-[var(--text-muted)] focus:outline-none">
                                    <span class="material-icons text-[18px]">{{ showConfirm() ? 'visibility' : 'visibility_off' }}</span>
                                </button>
                            }
                        </div>
                        <div class="min-h-[18px] mt-1">
                            @if (focusedField() === 'confirm' || isConfirmInvalid()) {
                                <div class="text-red-400 text-[10px]">
                                    * {{ isConfirmInvalid() ? ('reset.confirmError' | t) : ('reset.confirmHint' | t) }}
                                </div>
                            }
                        </div>
                    </div>

                    <button type="submit" class="w-full h-[50px] rounded-lg font-bold text-[16px] transition-all mt-2 flex items-center justify-center gap-2"
                            [disabled]="form.invalid || isLoading() || validating()"
                            [ngClass]="form.valid && !isLoading() && !validating()
                                ? 'bg-[var(--accent)] text-[var(--text-inverted)] hover:brightness-110 active:opacity-80 active:scale-95 shadow-lg shadow-[var(--accent)]/20'
                                : 'bg-[var(--text-muted)]/20 text-[var(--text-main)]/40 border border-[var(--border-muted)]'">
                        @if (isLoading() || validating()) {
                            <span class="material-icons animate-spin text-[18px]">autorenew</span>
                        }
                        <span>{{ validating() ? ('reset.validating' | t) : ('reset.submit' | t) }}</span>
                    </button>

                    <div class="text-center mt-4">
                        <a routerLink="/login" class="text-[12px] text-[var(--accent)] hover:underline">{{ 'reset.backLogin' | t }}</a>
                    </div>

                    @if (message() && !done()) {
                        <div class="px-4 py-2 rounded mt-2 text-sm text-center animate-in fade-in duration-300"
                             [ngClass]="isSuccess() ? 'bg-green-500/20 border border-green-500 text-green-400' : 'bg-red-500/20 border border-red-500 text-red-400'">
                            {{ message() }}
                        </div>
                    }
                </form>
            }
        </div>
    </main>
  `
})
export class ResetPasswordComponent implements OnInit {
  private http = inject(HttpClient);
  private i18n = inject(I18nService);
  private route = inject(ActivatedRoute);

  private readonly passPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[~!@#$%^&*()_\-+=|\\{}[\]:;"'<>,.?/]).{8,}$/;

  token = signal('');
  username = signal('');
  validating = signal(true);
  tokenInvalid = signal(false);
  isLoading = signal(false);
  done = signal(false);
  message = signal('');
  isSuccess = signal(false);
  focusedField = signal<string | null>(null);
  showPassword = signal(false);
  showConfirm = signal(false);

  form = new FormBuilder().group({
    pass: ['', [Validators.required, Validators.pattern(this.passPattern)]],
    confirm: ['', [Validators.required]]
  }, { validators: this.passwordMatchValidator });

  ngOnInit() {
    const token = (this.route.snapshot.queryParamMap.get('token') || '').trim();
    this.token.set(token);
    if (!token) {
      this.validating.set(false);
      this.tokenInvalid.set(true);
      this.message.set(this.i18n.t('reset.missingToken'));
      return;
    }
    this.validateToken(token);
  }

  passwordMatchValidator(g: { get: (name: string) => { value: string } | null }) {
    const pass = g.get('pass');
    const confirm = g.get('confirm');
    return pass && confirm && pass.value === confirm.value ? null : { passwordMismatch: true };
  }

  isFieldValid(field: string): boolean {
    const control = this.form.get(field);
    return !!(control && control.valid && (control.dirty || control.touched));
  }

  isFieldInvalid(field: string): boolean {
    const control = this.form.get(field);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }

  isConfirmValid(): boolean {
    const control = this.form.get('confirm');
    return !!(control && control.value && !this.form.hasError('passwordMismatch') && (control.dirty || control.touched));
  }

  isConfirmInvalid(): boolean {
    const control = this.form.get('confirm');
    return !!(control && control.value && this.form.hasError('passwordMismatch') && (control.dirty || control.touched));
  }

  getFieldError(field: string): string {
    const control = this.form.get(field);
    if (!control || !control.errors || !(control.dirty || control.touched)) return '';
    if (field === 'pass' && control.errors['pattern']) return this.i18n.t('reset.passError');
    if (field === 'pass' && control.errors['required']) return this.i18n.t('reset.passRequired');
    return '';
  }

  validateToken(token: string) {
    this.validating.set(true);
    this.http.get<ResetValidateResponse>('/api/reset_password.php', {
      params: { token }
    }).subscribe({
      next: (res) => {
        this.validating.set(false);
        if (res.success) {
          this.tokenInvalid.set(false);
          this.username.set(res.username || '');
        } else {
          this.tokenInvalid.set(true);
          this.message.set(res.message || this.i18n.t('reset.invalidToken'));
        }
      },
      error: () => {
        this.validating.set(false);
        this.tokenInvalid.set(true);
        this.message.set(this.i18n.t('reset.invalidToken'));
      }
    });
  }

  submit() {
    if (this.form.invalid || this.isLoading() || this.tokenInvalid() || !this.token()) return;

    this.isLoading.set(true);
    this.message.set('');

    this.http.post<ResetSubmitResponse>('/api/reset_password.php', {
      token: this.token(),
      password: this.form.get('pass')?.value || '',
      confirm: this.form.get('confirm')?.value || ''
    }).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.isSuccess.set(!!res.success);
        if (res.success) {
          this.done.set(true);
          this.message.set(res.message || this.i18n.t('reset.success'));
        } else {
          this.message.set(res.message || this.i18n.t('reset.fail'));
        }
      },
      error: () => {
        this.isLoading.set(false);
        this.isSuccess.set(false);
        this.message.set(this.i18n.t('reset.fail'));
      }
    });
  }
}
