import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ExerciseLibraryService } from '../../core/data/exercise-library.service';
import type { LibraryEntry } from '../../core/domain/exercise-library';
import type { ExerciseInfo } from '../../core/models/workout';
import { BottomSheet } from '../../shared/ui/bottom-sheet';
import { WorkoutTabs } from './workout-tabs';
import { ExerciseBrowser } from './exercise-browser';
import { ExerciseDetail } from './exercise-detail';

@Component({
  selector: 'app-exercise-catalog-page',
  imports: [ExerciseBrowser, ExerciseDetail, BottomSheet, WorkoutTabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-workout-tabs />
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
