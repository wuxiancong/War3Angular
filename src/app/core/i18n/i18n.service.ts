import { Injectable, signal, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslationSchema } from './types';

// Import all locales
import { zh_CN } from './locales/zh_CN';
import { en } from './locales/en';
import { ru } from './locales/ru';
import { es } from './locales/es';
import { de } from './locales/de';
import { fr } from './locales/fr';
import { it } from './locales/it';
import { ja } from './locales/ja';
import { ko } from './locales/ko';
import { pl } from './locales/pl';
import { pt } from './locales/pt';
import { uk } from './locales/uk';
import { ar } from './locales/ar';
import { bg } from './locales/bg';
import { ca } from './locales/ca';
import { cs } from './locales/cs';
import { da } from './locales/da';
import { fi } from './locales/fi';
import { gd } from './locales/gd';
import { he } from './locales/he';
import { hu } from './locales/hu';
import { lv } from './locales/lv';
import { sk } from './locales/sk';
import { tr } from './locales/tr';
import { zh_TW } from './locales/zh_TW';

const messages: Record<string, TranslationSchema> = {
    zh_CN, en, ru, es, de, fr, it, ja, ko, pl, pt, uk, ar, bg, ca, cs, da, fi, gd, he, hu, lv, sk, tr, zh_TW
};

@Injectable({ providedIn: 'root' })
export class I18nService {
  private platformId = inject(PLATFORM_ID);
  
  locale = signal<string>('zh_CN');
  
  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      const savedLang = localStorage.getItem('lang');
      if (savedLang && messages[savedLang]) {
        this.locale.set(savedLang);
      }
    }
  }

  setLocale(lang: string) {
    if (messages[lang]) {
      this.locale.set(lang);
      if (isPlatformBrowser(this.platformId)) {
        localStorage.setItem('lang', lang);
      }
    }
  }

  t(key: string): string {
    const keys = key.split('.');
    let obj: unknown = messages[this.locale()] || messages['zh_CN'];
    for (const k of keys) {
      if (obj && typeof obj === 'object' && k in (obj as Record<string, unknown>)) {
        obj = (obj as Record<string, unknown>)[k];
      } else {
        // Fallback to zh_CN
        let fallback: unknown = messages['zh_CN'];
        for (const fk of keys) {
          if (fallback && typeof fallback === 'object' && fk in (fallback as Record<string, unknown>)) {
            fallback = (fallback as Record<string, unknown>)[fk];
          } else {
            return key;
          }
        }
        return typeof fallback === 'string' ? fallback : key;
      }
    }
    return typeof obj === 'string' ? obj : key;
  }
}
