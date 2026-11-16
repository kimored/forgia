import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ExerciseLibraryService } from '../../core/data/exercise-library.service';
import { ProgramService } from '../../core/data/program.service';
import type { LibraryEntry } from '../../core/domain/exercise-library';
import { exerciseImages } from '../../core/domain/workout';
import { generateProgram, GOALS, LEVELS, type Goal, type Level } from '../../core/domain/program-generator';
import { ProfileService } from '../../core/data/profile.service';
import type { ExerciseInfo, ProgramExercise, WorkoutProgram, WorkoutTemplate } from '../../core/models/workout';
import { BottomSheet } from '../../shared/ui/bottom-sheet';
import { WorkoutTabs } from './workout-tabs';
import { ExerciseBrowser } from './exercise-browser';
import { ExerciseDetail } from './exercise-detail';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Editor del programma di allenamento personale. */
@Component({
  selector: 'app-program-editor-page',
  imports: [WorkoutTabs, BottomSheet, ExerciseBrowser, ExerciseDetail],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './program-editor-page.html',
  styleUrl: './program-editor-page.scss',
})
export class ProgramEditorPage {
  protected readonly programs = inject(ProgramService);
  protected readonly library = inject(ExerciseLibraryService);
  private readonly router = inject(Router);

  protected readonly doc = signal<WorkoutProgram>(structuredClone(this.programs.program()));
  protected readonly phaseIndex = signal(0);
  protected readonly saved = signal(false);
  /** Scelta iniziale (la creo io / creala per me), domande, oppure modifica delle schede. */
  protected readonly mode = signal<'choose' | 'wizard' | 'edit'>(this.programs.isExample() ? 'choose' : 'edit');

  // Domande della scheda automatica
  protected readonly goals = GOALS;
  protected readonly levels = LEVELS;
  protected readonly goal = signal<Goal>('massa');
  protected readonly days = signal(Math.min(5, Math.max(2, inject(ProfileService).effective().gymDays.length || 3)));
  protected readonly level = signal<Level>('principiante');

  protected generate(): void {
    this.doc.set(generateProgram({ goal: this.goal(), days: this.days(), level: this.level() }));
    this.phaseIndex.set(0);
    this.mode.set('edit');
  }

  protected startManual(): void {
    this.doc.set({
      title: 'La mia scheda',
      notes: [],
      phases: [{ id: 'mio', name: 'La mia scheda', fromWeek: 1, rotation: ['A'], templates: [{ id: 'A', name: 'Giorno 1', exercises: [] }] }],
    });
    this.phaseIndex.set(0);
    this.mode.set('edit');
  }

  protected readonly empty = computed(() => this.phase().templates.some((t) => !t.exercises.length));

  protected num(v: string): number | null {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }


  constructor() {
    void this.library.load().catch(() => undefined);
  }

  protected readonly phase = computed(() => this.doc().phases[this.phaseIndex()] ?? this.doc().phases[0]);
  protected readonly templates = computed(() =>
    this.phase().templates.map((t) => ({
      ...t,
      rows: t.exercises.map((pe, i) => ({ pe, i, info: this.library.lookup(pe.exercise) })),
    })),
  );

  private mutate(fn: (doc: WorkoutProgram) => void): void {
    const next = structuredClone(this.doc());
    fn(next);
    this.doc.set(next);
  }

  private ph(doc: WorkoutProgram) {
    return doc.phases[this.phaseIndex()] ?? doc.phases[0];
  }

  // ---------- Schede ----------

  protected addTemplate(): void {
    this.mutate((d) => {
      const p = this.ph(d);
      const id = [...LETTERS].find((l) => !p.templates.some((t) => t.id === l)) ?? `S${p.templates.length + 1}`;
      p.templates.push({ id, name: `Giorno ${p.templates.length + 1}`, exercises: [] });
    });
  }

  protected removeTemplate(id: string): void {
    if (this.phase().templates.length < 2 || !confirm('Eliminare questa scheda?')) return;
    this.mutate((d) => {
      const p = this.ph(d);
      p.templates = p.templates.filter((t) => t.id !== id);
    });
  }

  protected renameTemplate(id: string, name: string): void {
    this.mutate((d) => {
      const t = this.ph(d).templates.find((x) => x.id === id)!;
      t.name = name.trim() || t.name;
    });
  }

  protected moveTemplate(id: string, delta: number): void {
    this.mutate((d) => {
      const list = this.ph(d).templates;
      const i = list.findIndex((t) => t.id === id);
      const j = i + delta;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
    });
  }

  // ---------- Esercizi ----------

  private tpl(d: WorkoutProgram, id: string): WorkoutTemplate {
    return this.ph(d).templates.find((t) => t.id === id)!;
  }

  protected patchExercise(tid: string, i: number, patch: Partial<ProgramExercise>): void {
    this.mutate((d) => Object.assign(this.tpl(d, tid).exercises[i], patch));
  }

  protected setSets(tid: string, i: number, v: string): void {
    this.patchExercise(tid, i, { sets: this.num(v) ?? undefined });
  }

  protected setRest(tid: string, i: number, v: string): void {
    const n = this.num(v);
    this.patchExercise(tid, i, { rest: n ? [n, n] : undefined });
  }

  protected setReps(tid: string, i: number, v: string): void {
    const clean = v.replace(/\s/g, '').replace('–', '-');
    if (/^\d+(-\d+)?$/.test(clean)) this.patchExercise(tid, i, { reps: clean });
  }

  protected moveExercise(tid: string, i: number, delta: number): void {
    this.mutate((d) => {
      const list = this.tpl(d, tid).exercises;
      const j = i + delta;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
    });
  }

  protected removeExercise(tid: string, i: number): void {
    this.mutate((d) => this.tpl(d, tid).exercises.splice(i, 1));
  }

  protected thumb(info: ExerciseInfo): string {
    return exerciseImages(info)[0] ?? '';
  }

  // ---------- Scelta esercizio (catalogo) ----------

  protected readonly pickerOpen = signal(false);
  protected readonly pickTarget = signal<{ tid: string; replace?: number } | null>(null);
  protected readonly preview = signal<ExerciseInfo | null>(null);

  protected openPicker(tid: string, replace?: number): void {
    this.pickTarget.set({ tid, replace });
    this.preview.set(null);
    this.pickerOpen.set(true);
  }

  protected showPreview(e: LibraryEntry): void {
    this.preview.set(this.library.info(e));
  }

  protected openInfo(tid: string, i: number, info: ExerciseInfo): void {
    this.pickTarget.set({ tid, replace: i });
    this.preview.set(info);
    this.pickerOpen.set(true);
  }

  protected pick(id: string): void {
    const target = this.pickTarget();
    if (!target) return;
    this.mutate((d) => {
      const list = this.tpl(d, target.tid).exercises;
      if (target.replace !== undefined) list[target.replace] = { ...list[target.replace], exercise: id };
      else list.push({ exercise: id, sets: 3, reps: '8-12', rest: [90, 90] });
    });
    this.pickerOpen.set(false);
  }

  // ---------- Salvataggio ----------

  protected async save(): Promise<void> {
    const phase = structuredClone(this.phase());
    // L'ordine dei giorni è la rotazione sui giorni di palestra; nessuna fase a settimane.
    phase.fromWeek = 1;
    delete phase.toWeek;
    phase.rotation = phase.templates.map((t) => t.id);
    await this.programs.save({ ...this.doc(), phases: [phase] });
    this.saved.set(true);
    setTimeout(() => void this.router.navigateByUrl('/allenamento'), 700);
  }
}
