import { Injectable, signal, computed } from '@angular/core';

interface User {
  username: string;
  avatar?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private userSignal = signal<User | null>(null);

  isLoggedIn = computed(() => !!this.userSignal());
  currentUser = computed(() => this.userSignal());

  constructor() {
    // 初始化时从 localStorage 恢复登录状态
    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem('user');
      if (savedUser) {
        this.userSignal.set(JSON.parse(savedUser));
      }
    }
  }

  login(user: User) {
    this.userSignal.set(user);
    if (typeof window !== 'undefined') {
      localStorage.setItem('user', JSON.stringify(user));
    }
  }

  logout() {
    this.userSignal.set(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('user');
      localStorage.removeItem('web_auth_token');
      localStorage.removeItem('bnet_auth_token');
    }
  }
}
