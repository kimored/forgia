import { Injectable } from '@angular/core';

/** Tema unico nero/rosso: niente scelta chiaro/scuro. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  constructor() {
    document.documentElement.setAttribute('data-theme', 'dark');
    try {
      localStorage.removeItem('forgia.theme');
    } catch {
      /* storage non disponibile */
    }
  }
}
