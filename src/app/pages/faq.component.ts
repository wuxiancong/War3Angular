import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../core/i18n/translate.pipe';

@Component({
  selector: 'app-faq',
  standalone: true,
  imports: [TranslatePipe, RouterLink],
  template: `
    <main class="min-h-screen pt-24 pb-20 px-4 md:px-8 bg-transparent">
      <div class="max-w-4xl mx-auto">
        <!-- Header -->
        <div class="mb-12 text-center">
          <h1 class="text-4xl md:text-5xl font-black italic text-[var(--text-main)] tracking-tight uppercase mb-4">
            {{ 'faqPage.title' | t }}
          </h1>
          <p class="text-[var(--text-muted)] text-lg italic max-w-2xl mx-auto">
            {{ 'faqPage.subtitle' | t }}
          </p>
        </div>

        <!-- FAQ List -->
        <div class="space-y-6">
          @for (item of faqItems(); track item.id) {
            <div class="bg-white/5 border border-white/10 rounded-2xl overflow-hidden transition-all hover:bg-white/[0.07]">
              <button 
                (click)="toggleItem(item.id)"
                class="w-full px-6 py-5 flex items-center justify-between text-left group"
              >
                <span class="text-lg font-bold text-[var(--text-main)] group-hover:text-accent transition-colors">
                  {{ 'faqPage.q' + item.id | t }}
                </span>
                <span class="material-icons text-[var(--text-muted)] transition-transform duration-300" [class.rotate-180]="openId() === item.id">
                  expand_more
                </span>
              </button>
              
              <div 
                class="overflow-hidden transition-all duration-300 ease-in-out"
                [style.max-height]="openId() === item.id ? '2000px' : '0'"
              >
                <div 
                  class="px-6 pb-6 text-[var(--text-muted)] leading-relaxed whitespace-pre-line border-t border-white/5 pt-4"
                  [innerHTML]="'faqPage.a' + item.id | t"
                ></div>
              </div>
            </div>
          }
        </div>

        <!-- Footer Note -->
        <div class="mt-12 text-center">
          @if (!allLoaded()) {
            <button 
              (click)="loadMore()"
              class="px-8 py-4 bg-accent/10 border border-accent/30 rounded-2xl text-accent font-bold italic hover:bg-accent hover:text-white transition-all active:scale-95 flex items-center gap-2 mx-auto"
            >
              <span class="material-icons">add_circle_outline</span>
              {{ 'faqPage.more' | t }}
            </button>
          } @else {
            <div class="p-6 bg-white/5 border border-white/10 rounded-2xl">
              <p class="text-[var(--text-muted)] italic">
                {{ 'faqPage.noMore' | t }}
                <a routerLink="/contact" class="text-accent hover:underline ml-1">{{ 'nav.support' | t }}</a>
              </p>
            </div>
          }
        </div>
      </div>
    </main>
  `
})
export class FaqComponent {
  openId = signal<number | null>(0);
  allLoaded = signal(false);

  faqItems = signal([
    { id: 0 },
    { id: 1 },
    { id: 2 },
    { id: 3 },
    { id: 4 },
    { id: 5 },
    { id: 6 }
  ]);

  toggleItem(id: number) {
    this.openId.update(current => current === id ? null : id);
  }

  loadMore() {
    const currentItems = this.faqItems();
    const nextId = currentItems.length;
    
    const newItems = [
      { id: nextId },
      { id: nextId + 1 },
      { id: nextId + 2 },
      { id: nextId + 3 }
    ];
    
    this.faqItems.set([...currentItems, ...newItems]);
    this.allLoaded.set(true);
  }
}
