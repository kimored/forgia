import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SettingsService } from '../../core/data/settings.service';
import { WorkoutStore } from '../../core/data/workout.store';
import { parseIsoDate, today } from '../../core/domain/dates';
import { exerciseStats, nextGymDay, type PlannedExercise } from '../../core/domain/workout';
import { ProgramService } from '../../core/data/program.service';
import type { ExerciseInfo } from '../../core/models/workout';
import { ExerciseDetail } from './exercise-detail';
import { ProfileService } from '../../core/data/profile.service';
import { RestTimerService } from '../../core/platform/rest-timer.service';
import { BottomSheet } from '../../shared/ui/bottom-sheet';
import { LineChart } from '../../shared/ui/line-chart';
import { ExerciseCard, type SetDone } from './exercise-card';

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

@Component({
  selector: 'app-workout-page',
  imports: [DatePipe, RouterLink, ExerciseCard, BottomSheet, LineChart, ExerciseDetail],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './workout-page.html',
  styleUrl: './workout-page.scss',
})
export class WorkoutPage {
  protected readonly store = inject(WorkoutStore);
  protected readonly timer = inject(RestTimerService);
  private readonly profiles = inject(ProfileService);
  private readonly settings = inject(SettingsService);
  protected readonly programs = inject(ProgramService);

  protected readonly date = signal(today());
  protected readonly jsDate = computed(() => parseIsoDate(this.date()));
  /** Allenarsi in un giorno di riposo, o con un'altra scheda. */
  protected readonly force = signal(false);
  protected readonly templateId = signal<string | undefined>(undefined);
  /** Varianti scelte (indice esercizio → id esercizio alternativo). */
  protected readonly swaps = signal(new Map<number, string>());

  protected readonly session = computed(() => this.store.sessionOn(this.date()));
  protected readonly plan = computed(() => {
    const s = this.session();
    return this.store.plan(this.date(), {
      force: this.force() || !!s,
      templateId: this.templateId() ?? s?.templateId,
    });
  });
  protected readonly exercises = computed<PlannedExercise[]>(() => {
    const plan = this.plan();
    const swaps = this.swaps();
    return (plan?.exercises ?? []).map((e, i) => {
      const alt = swaps.get(i);
      if (!alt) return e;
      // Variante: l'originale diventa a sua volta un'alternativa.
      return { ...e, info: this.store.library.lookup(alt), alternatives: [e.info, ...e.alternatives.filter((a) => a.id !== alt)] };
    });
  });
  protected readonly templates = computed(() => this.plan()?.phase.templates ?? []);
  protected readonly next = computed(() => nextGymDay(this.date(), this.profiles.effective().gymDays));
  protected readonly notes = computed(() => this.programs.program().notes);
  protected readonly phaseManual = computed(() => !!this.settings.settings().workoutPhase);

  protected readonly progress = computed(() => {
    const s = this.session();
    const done = s?.id ? this.store.setsOf(s.id).length : 0;
    const total = this.exercises().reduce((n, e) => n + e.sets, 0);
    return { done, total };
  });
  protected readonly consistency = this.store.consistency;

  // ---------- Durata della seduta ----------

  private readonly now = signal(Date.now());
  protected readonly elapsed = computed(() => {
    const s = this.session();
    if (!s) return null;
    const end = s.endedAt ? Date.parse(s.endedAt) : this.now();
    const sec = Math.max(0, Math.round((end - Date.parse(s.startedAt)) / 1000));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const ss = String(sec % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  });

  private wakeLock: WakeLockSentinelLike | null = null;

  constructor() {
    const t = setInterval(() => this.now.set(Date.now()), 1000);
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => {
      clearInterval(t);
      void this.wakeLock?.release();
    });
    // Schermo acceso durante la seduta (dove supportato).
    effect(() => {
      const active = !!this.session() && !this.session()!.endedAt;
      if (active) void this.keepAwake();
      else {
        void this.wakeLock?.release();
        this.wakeLock = null;
      }
    });
  }

  private async keepAwake(): Promise<void> {
    if (this.wakeLock) return;
    try {
      const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } };
      this.wakeLock = (await nav.wakeLock?.request('screen')) ?? null;
    } catch {
      this.wakeLock = null;
    }
  }

  // ---------- Azioni ----------

  protected async startSession(): Promise<void> {
    const plan = this.plan();
    if (plan && !this.session()) await this.store.start(plan);
  }

  protected async onSet(e: SetDone, index: number): Promise<void> {
    const plan = this.plan();
    if (!plan) return;
    let session = this.session();
    if (!session) {
      const id = await this.store.start(plan);
      session = { id, date: plan.date, phaseId: plan.phase.id, templateId: plan.template.id, startedAt: new Date().toISOString() };
    }
    await this.store.logSet(session, e.exercise.info.id, e.set, e.kg, e.reps);

    // In superserie il recupero parte dopo l'ultimo esercizio della coppia.
    const list = this.exercises();
    const nextEx = list[index + 1];
    if (e.exercise.superset && nextEx?.superset === e.exercise.superset) return;
    const isLastSet = e.set >= e.exercise.sets;
    const label = isLastSet ? (nextEx ? `Poi: ${nextEx.info.name}` : 'Ultima serie fatta 💪') : `${e.exercise.info.name} · serie ${e.set + 1}`;
    this.timer.start(e.exercise.rest[1], label);
  }

  protected async finish(): Promise<void> {
    const s = this.session();
    if (s?.id) await this.store.finish(s.id);
    this.timer.skip();
  }

  protected async remove(): Promise<void> {
    const s = this.session();
    if (!s?.id) return;
    const n = this.progress().done;
    const msg = n ? `Eliminare la seduta e le ${n} serie registrate? Non si può annullare.` : 'Eliminare la seduta?';
    if (!confirm(msg)) return;
    this.timer.skip();
    await this.store.remove(s.id);
  }

  protected async resume(): Promise<void> {
    const s = this.session();
    if (s?.id) await this.store.resume(s.id);
  }

  protected chooseTemplate(id: string): void {
    this.templateId.set(id || undefined);
    this.swaps.set(new Map());
  }

  protected swap(index: number, exerciseId: string): void {
    const next = new Map(this.swaps());
    const original = this.plan()?.exercises[index]?.info.id;
    if (exerciseId === original) next.delete(index);
    else next.set(index, exerciseId);
    this.swaps.set(next);
  }

  // ---------- Dettaglio e varianti ----------

  protected readonly detailOpen = signal(false);
  protected readonly detailInfo = signal<ExerciseInfo | null>(null);
  private readonly detailIndex = signal<number | null>(null);

  protected openDetail(info: ExerciseInfo, index: number): void {
    this.detailInfo.set(info);
    this.detailIndex.set(index);
    this.detailOpen.set(true);
  }

  protected useVariant(id: string): void {
    const i = this.detailIndex();
    if (i !== null) this.swap(i, id);
    this.detailOpen.set(false);
  }

  // ---------- Storico ----------

  protected readonly historyOpen = signal(false);
  protected readonly historyId = signal<string | null>(null);
  protected readonly historyData = computed(() => {
    const id = this.historyId();
    if (!id) return null;
    const pts = exerciseStats(this.store.sets(), id);
    const fmt = (d: string) => new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(parseIsoDate(d));
    return {
      name: this.store.library.lookup(id).name,
      maxKg: pts.map((p) => ({ label: fmt(p.date), value: p.maxKg })),
      volume: pts.map((p) => ({ label: fmt(p.date), value: p.volume })),
      sessions: this.store.history(id).slice(0, 12),
      bodyweight: pts.length > 0 && pts.every((p) => p.maxKg === 0),
      reps: pts.map((p) => ({ label: fmt(p.date), value: p.bestReps })),
    };
  });

  protected openHistory(id: string): void {
    this.historyId.set(id);
    this.historyOpen.set(true);
  }

  protected setsLabel(sets: { kg: number; reps: number }[]): string {
    return sets.map((s) => (s.kg ? `${String(s.kg).replace('.', ',')}×${s.reps}` : `${s.reps}`)).join(' · ');
  }

  protected fmtTime(sec: number): string {
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }
}
