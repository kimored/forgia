import { Injectable, effect, signal } from '@angular/core';

export type ThemePref = 'auto' | 'light' | 'dark';
const KEY = 'forgia.theme';
const COLOR = { light: '#f6f7f6', dark: '#0e1412' };

/** Preferenza di tema per dispositivo (localStorage: è una comodità, non un dato da salvare). */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly pref = signal<ThemePref>(this.read());

  constructor() {
    effect(() => {
      const pref = this.pref();
      const root = document.documentElement;
      if (pref === 'auto') root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', pref);
      try {
        localStorage.setItem(KEY, pref);
      } catch {
        /* storage non disponibile */
      }
      this.syncThemeColor(pref);
    });
  }

  private read(): ThemePref {
    try {
      const v = localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : 'auto';
    } catch {
      return 'auto';
    }
  }

  /** Con tema manuale, la barra di stato segue il tema scelto invece della media query. */
  private syncThemeColor(pref: ThemePref): void {
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
      m.dataset['media'] ??= m.media;
      const original = m.dataset['media'];
      m.media = pref === 'auto' ? original : '';
      m.content = pref === 'auto' ? COLOR[original.includes('dark') ? 'dark' : 'light'] : COLOR[pref];
    });
  }
}
