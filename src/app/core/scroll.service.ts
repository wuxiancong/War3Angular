import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ScrollService {
  isAtTop = signal(true);
  private isLocked = false;

  updateScroll(scrollTop: number) {
    if (this.isLocked) return;

    const currentlyAtTop = this.isAtTop();
    
    // 遵从用户要求：只要滚动距离大于 0 就隐藏
    // 隐藏阈值: 0
    // 显示阈值: 0 (必须完全回到顶部)
    if (currentlyAtTop && scrollTop > 0) {
      this.isAtTop.set(false);
      this.lock();
    } else if (!currentlyAtTop && scrollTop <= 0) {
      this.isAtTop.set(true);
      this.lock();
    }
  }

  private lock() {
    // 锁定状态一段时间，等待动画完成，防止布局抖动导致的死循环
    this.isLocked = true;
    setTimeout(() => {
      this.isLocked = false;
    }, 400); // 略大于 CSS transition 的 300ms
  }
}
