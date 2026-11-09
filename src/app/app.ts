import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './layout/header.component';
import { FooterComponent } from './layout/footer.component';
import { ScrollService } from './core/scroll.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [RouterOutlet, HeaderComponent, FooterComponent],
  host: {
    '(window:scroll)': 'onScroll()'
  },
  template: `
    <div class="flex-grow relative flex flex-col w-full">
      <div class="halo"></div>
      <app-header></app-header>
      <div class="w-full shrink-0" style="height: var(--app-header-height, 4.5rem)" aria-hidden="true"></div>
      <main class="relative z-10 flex flex-col flex-grow w-full">
        <router-outlet></router-outlet>
      </main>
      <app-footer class="block relative z-20 mt-auto w-full"></app-footer>
    </div>
  `,
})
export class App {
  scrollService = inject(ScrollService);

  onScroll() {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    this.scrollService.updateScroll(scrollTop);
  }
}
