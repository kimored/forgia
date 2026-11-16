import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ExerciseLibraryService } from '../../core/data/exercise-library.service';
import type { LibraryEntry } from '../../core/domain/exercise-library';
import type { ExerciseInfo } from '../../core/models/workout';
import { BottomSheet } from '../../shared/ui/bottom-sheet';
import { Icon } from '../../shared/ui/icon';
import { ExerciseBrowser } from './exercise-browser';
import { ExerciseDetail } from './exercise-detail';

@Component({
  selector: 'app-exercise-catalog-page',
  imports: [ExerciseBrowser, ExerciseDetail, BottomSheet, RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="head">
      <a class="icon-btn" routerLink="/allenamento" aria-label="Torna all'allenamento"><app-icon name="back" /></a>
      <h1>Esercizi</h1>
    </div>
    <p class="muted">Tutti gli esercizi del database (in inglese i nomi originali). Tocca per vedere esecuzione, muscoli e varianti; per usarli crea le tue schede in <a routerLink="/allenamento/programma">Il mio programma</a>.</p>
    <app-exercise-browser (open)="show($event)" />

    <app-bottom-sheet [(open)]="open" label="Dettaglio esercizio">
      @if (open() && current(); as c) {
        <app-exercise-detail [info]="c" (navigate)="current.set($event)" />
      }
    </app-bottom-sheet>
  `,
  styles: `
    :host { display: grid; gap: 12px; max-width: 1000px; }
    .head { display: flex; align-items: center; gap: 4px; margin: 4px 0 0 -8px; }
    .head a { color: inherit; }
    h1 { font-size: 1.75rem; }
    p { margin: 0; }
  `,
})
export class ExerciseCatalogPage {
  private readonly library = inject(ExerciseLibraryService);
  protected readonly open = signal(false);
  protected readonly current = signal<ExerciseInfo | null>(null);

  protected show(e: LibraryEntry): void {
    this.current.set(this.library.info(e));
    this.open.set(true);
  }
}
