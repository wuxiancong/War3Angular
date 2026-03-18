import { Component, output } from '@angular/core';
import { TranslatePipe } from '../core/i18n/translate.pipe';

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <div class="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm" 
         (click)="closeModal()" 
         (keydown.escape)="closeModal()"
         tabindex="0"
         role="dialog"
         aria-modal="true">
      <div class="bg-[var(--card-bg)] p-8 rounded-2xl border border-[var(--border)] w-[640px] max-w-[90vw]" 
           (click)="$event.stopPropagation()"
           (keydown)="$event.stopPropagation()"
           tabindex="-1">
        <h2 class="text-3xl font-black italic text-accent mb-4">{{ 'welcome.title' | t }}</h2>
        <p class="text-[var(--text-muted)] mb-6">{{ 'welcome.desc' | t }}</p>
        <button type="button" (click)="closeModal()" (keydown.enter)="closeModal()" class="bg-accent text-white px-6 py-2 rounded-lg font-bold">{{ 'welcome.close' | t }}</button>
      </div>
    </div>
  `
})
export class WelcomeComponent {
  closed = output<void>();
  closeModal() {
    this.closed.emit();
  }
}
