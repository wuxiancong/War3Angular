import { Component } from '@angular/core';

@Component({
  selector: 'app-shopping-bag',
  standalone: true,
  template: `
    <div class="p-8">
      <h2 class="text-3xl font-black italic text-[var(--text-main)] mb-6">我的物品</h2>
      <p class="text-[var(--text-muted)]">这里是我的物品页面。</p>
    </div>
  `
})
export class ShoppingBagComponent {}
