import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ExerciseLibraryService } from '../../core/data/exercise-library.service';
import { ProgramService } from '../../core/data/program.service';
import type { LibraryEntry } from '../../core/domain/exercise-library';
import { exerciseImages, PROGRAM } from '../../core/domain/workout';
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

  // ---------- Programma ----------

  protected startFromScratch(): void {
    if (!confirm('Creare un programma nuovo da zero? Le modifiche non salvate andranno perse.')) return;
    this.doc.set({
      title: 'Il mio programma',
      notes: [],
      phases: [{ id: 'mio', name: 'Il mio programma', fromWeek: 1, rotation: ['A'], templates: [{ id: 'A', name: 'Scheda A', exercises: [] }] }],
    });
    this.phaseIndex.set(0);
  }

  protected startFromExample(): void {
    this.doc.set(structuredClone(PROGRAM));
    this.phaseIndex.set(0);
  }

  protected async useExample(): Promise<void> {
    if (!confirm('Tornare al programma di esempio? Il tuo programma verrà sostituito.')) return;
    await this.programs.useExample();
    this.doc.set(structuredClone(PROGRAM));
  }

  protected setTitle(v: string): void {
    this.mutate((d) => (d.title = v.trim() || d.title));
  }

  // ---------- Fase ----------

  protected patchPhase(patch: { name?: string; fromWeek?: number; toWeek?: number | null }): void {
    this.mutate((d) => {
      const p = this.ph(d);
      if (patch.name !== undefined) p.name = patch.name.trim() || p.name;
      if (patch.fromWeek !== undefined && patch.fromWeek >= 1) p.fromWeek = patch.fromWeek;
      if (patch.toWeek !== undefined) p.toWeek = patch.toWeek ?? undefined;
    });
  }

  protected addPhase(): void {
    this.mutate((d) => {
      const last = d.phases.at(-1)!;
      const from = (last.toWeek ?? last.fromWeek + 3) + 1;
      if (!last.toWeek) last.toWeek = from - 1;
      d.phases.push({ id: `fase-${Date.now().toString(36)}`, name: `Fase ${d.phases.length + 1}`, fromWeek: from, rotation: ['A'], templates: [{ id: 'A', name: 'Scheda A', exercises: [] }] });
    });
    this.phaseIndex.set(this.doc().phases.length - 1);
  }

  protected removePhase(): void {
    if (this.doc().phases.length < 2 || !confirm('Eliminare questa fase?')) return;
    this.mutate((d) => d.phases.splice(this.phaseIndex(), 1));
    this.phaseIndex.set(0);
  }

  protected num(v: string): number | null {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  // ---------- Schede ----------

  protected addTemplate(): void {
    this.mutate((d) => {
      const p = this.ph(d);
      const id = [...LETTERS].find((l) => !p.templates.some((t) => t.id === l)) ?? `S${p.templates.length + 1}`;
      p.templates.push({ id, name: `Scheda ${id}`, exercises: [] });
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

  protected readonly problems = computed(() => {
    const out: string[] = [];
    for (const p of this.doc().phases) {
      for (const t of p.templates) if (!t.exercises.length) out.push(`${p.name} · ${t.name}: nessun esercizio`);
    }
    return out;
  });

  protected async save(): Promise<void> {
    const doc = structuredClone(this.doc());
    // L'ordine delle schede è la rotazione sui giorni di palestra.
    for (const p of doc.phases) p.rotation = p.templates.map((t) => t.id);
    await this.programs.save(doc);
    this.saved.set(true);
    setTimeout(() => void this.router.navigateByUrl('/allenamento'), 700);
  }
}
