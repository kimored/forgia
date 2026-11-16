import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { WorkoutStore } from '../../core/data/workout.store';
import { exerciseImages, suggestion, type PlannedExercise } from '../../core/domain/workout';
import type { ExerciseInfo, WorkoutSession } from '../../core/models/workout';

export interface SetDone {
  exercise: PlannedExercise;
  set: number;
  kg: number;
  reps: number;
}

/** Esercizio della scheda: immagini, tecnica, progressione e registro delle serie. */
@Component({
  selector: 'app-exercise-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './exercise-card.html',
  styleUrl: './exercise-card.scss',
})
export class ExerciseCard {
  private readonly store = inject(WorkoutStore);

  readonly planned = input.required<PlannedExercise>();
  readonly session = input<WorkoutSession | undefined>();
  readonly index = input(0);
  readonly compact = input(false);
  readonly done = output<SetDone>();
  readonly history = output<string>();
  readonly swap = output<string>();
  readonly detail = output<ExerciseInfo>();

  /** Le due immagini dell'esecuzione si alternano: un'animazione leggera senza video. */
  protected readonly frame = signal(0);
  protected readonly images = computed(() => exerciseImages(this.planned().info));
  protected readonly showTips = signal(false);

  constructor() {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) {
      const t = setInterval(() => this.frame.update((f) => 1 - f), 1200);
      inject(DestroyRef).onDestroy(() => clearInterval(t));
    }
  }

  protected readonly last = computed(() => this.store.history(this.planned().info.id, this.session()?.id)[0]);
  protected readonly hint = computed(() => suggestion(this.planned(), this.last()));

  /** Serie già registrate in questa seduta. */
  private readonly logged = computed(() => {
    const s = this.session();
    if (!s?.id) return new Map<number, { kg: number; reps: number }>();
    return new Map(
      this.store
        .setsOf(s.id)
        .filter((l) => l.exercise === this.planned().info.id)
        .map((l) => [l.set, { kg: l.kg, reps: l.reps }]),
    );
  });

  /** Valori modificati a mano prima di confermare la serie. */
  private readonly drafts = signal(new Map<number, { kg?: number; reps?: number }>());

  protected readonly rows = computed(() => {
    const p = this.planned();
    const logged = this.logged();
    const drafts = this.drafts();
    const last = this.last();
    const hint = this.hint();
    return Array.from({ length: p.sets }, (_, i) => {
      const n = i + 1;
      const done = logged.get(n);
      const prev = last?.sets[i];
      // Precompilazione: serie già fatta → bozza → suggerimento → volta scorsa.
      const kg = drafts.get(n)?.kg ?? done?.kg ?? hint?.kg ?? prev?.kg ?? null;
      const reps = drafts.get(n)?.reps ?? done?.reps ?? hint?.reps ?? prev?.reps ?? p.range.max;
      return { n, kg, reps, done: !!done, prev };
    });
  });

  protected readonly completed = computed(() => this.rows().filter((r) => r.done).length);

  protected restLabel(): string {
    const [a, b] = this.planned().rest;
    const f = (s: number) => (s >= 120 && s % 60 === 0 ? `${s / 60} min` : `${s} s`);
    return a === b ? f(a) : `${a}–${f(b)}`;
  }

  private setDraft(n: number, patch: { kg?: number; reps?: number }): void {
    const next = new Map(this.drafts());
    next.set(n, { ...next.get(n), ...patch });
    this.drafts.set(next);
  }

  protected step(n: number, field: 'kg' | 'reps', delta: number, current: number | null): void {
    const base = current ?? 0;
    const value = Math.max(0, Math.round((base + delta) * 10) / 10);
    this.setDraft(n, { [field]: value });
  }

  protected setValue(n: number, field: 'kg' | 'reps', value: string): void {
    const v = parseFloat(value.replace(',', '.'));
    if (Number.isFinite(v) && v >= 0) this.setDraft(n, { [field]: v });
  }

  protected confirm(row: { n: number; kg: number | null; reps: number }): void {
    this.done.emit({ exercise: this.planned(), set: row.n, kg: row.kg ?? 0, reps: row.reps });
    const next = new Map(this.drafts());
    next.delete(row.n);
    this.drafts.set(next);
  }
}
