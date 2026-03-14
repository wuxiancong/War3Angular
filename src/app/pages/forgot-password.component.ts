import { Component, inject, signal } from '@angular/core';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { I18nService } from '../core/i18n/i18n.service';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [TranslatePipe, ReactiveFormsModule, NgClass, RouterLink],
  host: { class: 'flex flex-col flex-grow' },
  template: `
    <main class="flex-grow flex items-center justify-center py-6 h-full relative bg-transparent">
        <div class="login-card p-8 md:p-12 rounded-xl shadow-2xl relative z-10 w-full max-w-[400px] mx-4 bg-[var(--card-bg)] backdrop-blur-[30px] border border-[var(--border)]">
            <div class="flex flex-col items-center mb-6 md:mb-8">
                <div class="text-[60px] md:text-[80px] leading-none mb-2" style="font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', sans-serif;">🛡️</div>
                <h2 class="text-2xl md:text-3xl font-black tracking-[4px] text-center text-[var(--text-main)] uppercase">{{ 'forgot.title' | t }}</h2>
                <p class="text-[12px] text-[var(--text-muted)] text-center mt-2">{{ 'forgot.subtitle' | t }}</p>
            </div>
            
            <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4 w-full">
                <!-- 邮箱输入 -->
                <div class="relative group">
                    <div class="input-box bg-[var(--secondary)] border border-[var(--border-muted)] rounded-lg transition-all duration-300 h-[52px] flex items-center px-4 focus-within:border-2 focus-within:border-[var(--accent)]"
                         [ngClass]="{'border-red-500/50': isFieldInvalid('email'), 'border-green-500/50': isFieldValid('email')}">
                        <span class="mr-3 text-lg opacity-50" [class.text-[var(--accent)]]="focusedField() === 'email'">📧</span>
                        <input type="email" formControlName="email" [placeholder]="'forgot.email' | t" 
                               (focus)="focusedField.set('email')" (blur)="focusedField.set(null)"
                               class="bg-transparent w-full outline-none text-[var(--text-main)] text-sm">
                        @if (isFieldValid('email')) { <span class="text-green-500 text-xs">✓</span> }
                    </div>
                    <div class="min-h-[18px] mt-1">
                        @if (focusedField() === 'email') {
                            <div class="text-red-400 text-[10px] animate-in fade-in slide-in-from-top-1 duration-200">
                                * {{ (isFieldInvalid('email') && getFieldError('email')) ? getFieldError('email') : ('forgot.emailHint' | t) }}
                            </div>
                        }
                    </div>
                </div>

                <!-- 提交按钮 -->
                <button type="submit" class="w-full h-[50px] rounded-lg font-bold text-[16px] transition-all mt-6 relative overflow-hidden group flex items-center justify-center gap-2" 
                        [disabled]="form.invalid || isLoading()" 
                        [ngClass]="form.valid && !isLoading() ? 'bg-[var(--accent)] text-[var(--text-inverted)] hover:brightness-110 active:opacity-80 active:scale-95 shadow-lg shadow-[var(--accent)]/20' : 'bg-[var(--text-muted)]/20 text-[var(--text-main)]/40 border border-[var(--border-muted)]'">
                    @if (isLoading()) {
                        <span class="material-icons animate-spin text-[18px]">autorenew</span>
                    }
                    <span class="relative z-10">{{ 'forgot.submit' | t }}</span>
                </button>
                
                <div class="text-center mt-4">
                    <a routerLink="/login" class="text-[12px] text-[var(--accent)] hover:underline transition-colors cursor-pointer">
                        {{ 'forgot.back' | t }}
                    </a>
                </div>

                @if (message()) {
                    <div class="px-4 py-2 rounded mt-4 text-sm text-center animate-in fade-in duration-300"
                         [ngClass]="isSuccess() ? 'bg-green-500/20 border border-green-500 text-green-400' : 'bg-red-500/20 border border-red-500 text-red-400'">
                        {{ message() }}
                    </div>
                }
            </form>
        </div>
    </main>
  `
})
export class ForgotPasswordComponent {
  private http = inject(HttpClient);
  private i18n = inject(I18nService);
  
  isLoading = signal(false);
  message = signal('');
  isSuccess = signal(false);
  focusedField = signal<string | null>(null);

  form = new FormBuilder().group({
    email: ['', [Validators.required, Validators.email]]
  });

  isFieldValid(field: string): boolean {
    const control = this.form.get(field);
    return !!(control && control.valid && (control.dirty || control.touched));
  }

  isFieldInvalid(field: string): boolean {
    const control = this.form.get(field);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }

  getFieldError(field: string): string {
    const control = this.form.get(field);
    if (!control || !control.errors || !(control.dirty || control.touched)) return '';
    
    if (field === 'email' && control.errors['email']) return this.i18n.t('forgot.emailError');
    
    return '';
  }

  async submit() {
    if (this.form.invalid || this.isLoading()) return;
    
    this.isLoading.set(true);
    this.message.set('');
    
    const email = this.form.get('email')?.value || '';

    // 注意：这里假设后端有 /api/forgot_password.php 接口
    this.http.post<{success: boolean, message?: string}>('/api/forgot_password.php', {
      email: email
    }).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.isSuccess.set(res.success);
        if (res.success) {
          this.message.set(this.i18n.t('forgot.success'));
        } else {
          this.message.set(res.message || this.i18n.t('forgot.fail'));
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        this.isSuccess.set(false);
        this.message.set(this.i18n.t('forgot.fail'));
        console.error(err);
      }
    });
  }
}
