import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/** Tab in cima alla sezione Allenamento: seduta di oggi, programma, catalogo esercizi. */
@Component({
  selector: 'app-workout-tabs',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="tabs" aria-label="Allenamento">
      <a routerLink="/allenamento" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }" ariaCurrentWhenActive="page">Oggi</a>
      <a routerLink="/allenamento/programma" routerLinkActive="on" ariaCurrentWhenActive="page">Programma</a>
      <a routerLink="/allenamento/esercizi" routerLinkActive="on" ariaCurrentWhenActive="page">Esercizi</a>
    </nav>
  `,
  styles: `
    :host { display: block; }
    .tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 4px; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--border); }
    a { min-height: 40px; display: grid; place-items: center; border-radius: 999px; font-weight: 700; font-size: 0.92rem; color: var(--text-2); text-decoration: none; }
    a.on { background: var(--primary); color: var(--primary-contrast); }
  `,
})
export class WorkoutTabs {}
