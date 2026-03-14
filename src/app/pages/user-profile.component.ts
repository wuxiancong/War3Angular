import { Component } from '@angular/core';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  template: `
    <div class="p-8">
      <h2 class="text-3xl font-black italic text-[var(--text-main)] mb-6">账号设置</h2>
      <p class="text-[var(--text-muted)]">这里是账号设置页面。</p>
    </div>
  `
})
export class UserProfileComponent {}
