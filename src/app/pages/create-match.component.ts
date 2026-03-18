import { Component, inject } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '../core/i18n/translate.pipe';

@Component({
  selector: 'app-create-match',
  standalone: true,
  imports: [RouterLink, ReactiveFormsModule, TranslatePipe],
  host: { class: 'flex flex-col flex-grow' },
  template: `
    <main class="flex-grow py-8 px-4 md:px-8 bg-transparent text-[var(--text-main)]">
      <div class="max-w-7xl mx-auto space-y-8">
        
        <!-- Header & Back Button -->
        <div class="flex items-center gap-4">
          <button routerLink="/squad" class="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-[var(--text-muted)] hover:text-[var(--text-main)]">
            <span class="material-icons">arrow_back</span>
          </button>
          <h1 class="text-3xl font-black italic text-[var(--text-main)] tracking-wider uppercase">
            {{ 'createMatch.title' | t }}
          </h1>
        </div>

        <div class="bg-[var(--card-bg)] backdrop-blur-md rounded-xl shadow-xl border border-[var(--border)] overflow-hidden">
          <div class="p-6 border-b border-white/5 bg-[var(--primary)]/50">
            <p class="text-sm text-[var(--text-muted)]">{{ 'createMatch.desc' | t }}</p>
          </div>
          
          <form [formGroup]="matchForm" (ngSubmit)="onSubmit()" class="p-6 space-y-6">
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <!-- 战队名称 -->
              <div class="space-y-2">
                <label for="teamName" class="block text-sm font-bold text-[var(--text-main)]">{{ 'createMatch.teamName' | t }}</label>
                <input id="teamName" type="text" formControlName="teamName" readonly class="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-[var(--text-main)] focus:outline-none cursor-not-allowed opacity-70">
              </div>

              <!-- 发起人 -->
              <div class="space-y-2">
                <label for="initiator" class="block text-sm font-bold text-[var(--text-main)]">{{ 'createMatch.initiator' | t }}</label>
                <input id="initiator" type="text" formControlName="initiator" readonly class="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-[var(--text-main)] focus:outline-none cursor-not-allowed opacity-70">
              </div>

              <!-- 服务器 -->
              <div class="space-y-2">
                <label for="server" class="block text-sm font-bold text-[var(--text-main)]">{{ 'createMatch.server' | t }} <span class="text-red-500">*</span></label>
                <select id="server" formControlName="server" class="w-full bg-[var(--secondary)] border border-white/10 rounded-lg px-4 py-2.5 text-[var(--text-main)] focus:outline-none focus:border-accent transition-colors appearance-none">
                  <option value="" disabled>{{ 'createMatch.selectServer' | t }}</option>
                  <option value="CN1">CN1 (中国电信)</option>
                  <option value="CN2">CN2 (中国联通)</option>
                  <option value="RU1">RU1 (俄罗斯)</option>
                  <option value="RU2">RU2 (俄罗斯远东)</option>
                  <option value="KZ1">KZ1 (哈萨克斯坦)</option>
                  <option value="KZ2">KZ2 (哈萨克斯坦)</option>
                </select>
              </div>

              <!-- 模式 -->
              <div class="space-y-2">
                <label for="mode" class="block text-sm font-bold text-[var(--text-main)]">{{ 'createMatch.mode' | t }} <span class="text-red-500">*</span></label>
                <select id="mode" formControlName="mode" class="w-full bg-[var(--secondary)] border border-white/10 rounded-lg px-4 py-2.5 text-[var(--text-main)] focus:outline-none focus:border-accent transition-colors appearance-none">
                  <option value="" disabled>{{ 'createMatch.selectMode' | t }}</option>
                  <option value="CM">CM (队长模式)</option>
                  <option value="AP">AP (全英雄选择)</option>
                  <option value="RD">RD (随机征召)</option>
                  <option value="AR">AR (全随机模式)</option>
                  <option value="SD">SD (三选一模式)</option>
                  <option value="XL">XL (扩展联赛)</option>
                </select>
              </div>

              <!-- 预约时间 -->
              <div class="space-y-2 md:col-span-2">
                <label for="scheduledTime" class="block text-sm font-bold text-[var(--text-main)]">{{ 'createMatch.scheduledTime' | t }} <span class="text-red-500">*</span></label>
                <input id="scheduledTime" type="datetime-local" formControlName="scheduledTime" class="w-full bg-[var(--secondary)] border border-white/10 rounded-lg px-4 py-2.5 text-[var(--text-main)] focus:outline-none focus:border-accent transition-colors [color-scheme:dark]">
              </div>

              <!-- 参与人员 -->
              <div class="space-y-2 md:col-span-2">
                <span id="lineup-label" class="block text-sm font-bold text-[var(--text-main)]">{{ 'createMatch.lineup' | t }} <span class="text-red-500">*</span></span>
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3" aria-labelledby="lineup-label">
                  @for (member of availableMembers; track member) {
                    <label [for]="'member-' + member" class="flex items-center gap-2 p-3 rounded-lg border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors has-[:checked]:border-accent has-[:checked]:bg-accent/10 min-w-0">
                      <input [id]="'member-' + member" type="checkbox" [value]="member" (change)="toggleParticipant(member, $event)" class="accent-accent w-4 h-4 shrink-0">
                      <span class="text-sm text-[var(--text-main)] truncate" [title]="member">{{ member }}</span>
                    </label>
                  }
                </div>
                @if (participantsError) {
                  <p class="text-red-400 text-xs mt-1">{{ 'createMatch.lineupError' | t }}</p>
                }
              </div>

              <!-- 替补人员 -->
              <div class="space-y-2 md:col-span-2">
                <span id="subs-label" class="block text-sm font-bold text-[var(--text-main)]">{{ 'createMatch.subs' | t }}</span>
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3" aria-labelledby="subs-label">
                  @for (member of availableMembers; track member) {
                    <label [for]="'sub-' + member" class="flex items-center gap-2 p-3 rounded-lg border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors has-[:checked]:border-accent has-[:checked]:bg-accent/10 min-w-0">
                      <input [id]="'sub-' + member" type="checkbox" [value]="member" (change)="toggleSubstitute(member, $event)" class="accent-accent w-4 h-4 shrink-0">
                      <span class="text-sm text-[var(--text-main)] truncate" [title]="member">{{ member }}</span>
                    </label>
                  }
                </div>
              </div>

              <!-- 预约宣言 -->
              <div class="space-y-2 md:col-span-2">
                <label for="manifesto" class="block text-sm font-bold text-[var(--text-main)]">{{ 'createMatch.manifesto' | t }}</label>
                <textarea id="manifesto" formControlName="manifesto" rows="3" [placeholder]="'createMatch.manifestoPlaceholder' | t" class="w-full bg-[var(--secondary)] border border-white/10 rounded-lg px-4 py-2.5 text-[var(--text-main)] focus:outline-none focus:border-accent transition-colors resize-none"></textarea>
              </div>
            </div>

            <!-- Submit Button -->
            <div class="pt-6 border-t border-white/5 flex justify-end gap-4">
              <button type="button" routerLink="/squad" class="px-6 py-2.5 rounded text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-white/5 transition-colors font-bold text-sm">
                {{ 'createMatch.cancel' | t }}
              </button>
              <button type="submit" [disabled]="!matchForm.valid || participants.length !== 5" class="px-8 py-2.5 bg-accent hover:brightness-110 disabled:bg-accent/50 disabled:cursor-not-allowed text-[var(--text-inverted)] rounded shadow-lg shadow-accent/20 transition-all active:scale-95 font-bold uppercase text-sm">
                {{ 'createMatch.submit' | t }}
              </button>
            </div>

          </form>
        </div>
      </div>
    </main>
  `
})
export class CreateMatchComponent {
  private fb = inject(FormBuilder);
  private router = inject(Router);

  availableMembers = ['Puppey', 'Nisha', 'Zai', 'YapzOr', 'MATUMBAMAN', 'Resolut1on', 'Crystallis'];
  participants: string[] = [];
  substitutes: string[] = [];
  participantsError = false;

  matchForm = this.fb.group({
    teamName: ['Team Secret'],
    initiator: ['Puppey'],
    server: ['', Validators.required],
    mode: ['', Validators.required],
    scheduledTime: ['', Validators.required],
    manifesto: ['']
  });

  toggleParticipant(member: string, event: Event) {
    const isChecked = (event.target as HTMLInputElement).checked;
    if (isChecked) {
      this.participants.push(member);
    } else {
      this.participants = this.participants.filter(m => m !== member);
    }
    this.participantsError = this.participants.length !== 5;
  }

  toggleSubstitute(member: string, event: Event) {
    const isChecked = (event.target as HTMLInputElement).checked;
    if (isChecked) {
      this.substitutes.push(member);
    } else {
      this.substitutes = this.substitutes.filter(m => m !== member);
    }
  }

  onSubmit() {
    this.participantsError = this.participants.length !== 5;
    
    if (this.matchForm.valid && !this.participantsError) {
      console.log('Match Created:', {
        ...this.matchForm.value,
        participants: this.participants,
        substitutes: this.substitutes
      });
      // 模拟提交成功后返回列表页
      this.router.navigate(['/squad']);
    }
  }
}
