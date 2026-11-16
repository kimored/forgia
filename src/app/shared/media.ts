import { DestroyRef, inject, signal, type Signal } from '@angular/core';

/** Signal che segue una media query (si aggiorna con rotazione e Split View). */
export function mediaSignal(query: string): Signal<boolean> {
  const mql = matchMedia(query);
  const s = signal(mql.matches);
  const onChange = (e: MediaQueryListEvent) => s.set(e.matches);
  mql.addEventListener('change', onChange);
  inject(DestroyRef).onDestroy(() => mql.removeEventListener('change', onChange));
  return s.asReadonly();
}
