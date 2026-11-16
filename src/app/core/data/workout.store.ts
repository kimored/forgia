import { Injectable, computed, inject, signal } from '@angular/core';
import { liveQuery } from 'dexie';
import type { SetLog, WorkoutSession } from '../models/workout';
import { today, type IsoDate } from '../domain/dates';
import { historyOf, plannedSession, weeklyConsistency, type PlannedSession } from '../domain/workout';
import { db } from './db';
import { ProfileService } from './profile.service';
import { SettingsService } from './settings.service';
import { ProgramService } from './program.service';
import { ExerciseLibraryService } from './exercise-library.service';

/** Sedute e serie registrate (IndexedDB → signals). */
@Injectable({ providedIn: 'root' })
export class WorkoutStore {
  private readonly profiles = inject(ProfileService);
  private readonly settings = inject(SettingsService);
  private readonly programs = inject(ProgramService);
  readonly library = inject(ExerciseLibraryService);

  readonly sessions = signal<WorkoutSession[]>([]);
  readonly sets = signal<SetLog[]>([]);

  constructor() {
    liveQuery(() => db.sessions.toArray()).subscribe((v) => this.sessions.set(v));
    liveQuery(() => db.sets.toArray()).subscribe((v) => this.sets.set(v));
  }

  plan(date: IsoDate, opts: { force?: boolean; templateId?: string } = {}): PlannedSession | null {
    const p = this.profiles.effective();
    // Legge i segnali del catalogo: quando si carica, le schede si aggiornano.
    this.library.loaded();
    return plannedSession(
      date,
      { startDate: p.startDate, gymDays: p.gymDays, phaseOverride: this.settings.settings().workoutPhase || undefined, ...opts },
      this.programs.program(),
      this.library.lookup,
    );
  }

  sessionOn(date: IsoDate): WorkoutSession | undefined {
    return this.sessions()
      .filter((s) => s.date === date)
      .sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0];
  }

  setsOf(sessionId: number): SetLog[] {
    return this.sets().filter((s) => s.sessionId === sessionId);
  }

  history(exerciseId: string, excludeSession?: number) {
    return historyOf(this.sets(), exerciseId, excludeSession);
  }

  /** Sedute con almeno una serie registrata: contano per la costanza. */
  readonly consistency = computed(() => {
    const withSets = new Set(this.sets().map((s) => s.sessionId));
    const dates = this.sessions()
      .filter((s) => s.id !== undefined && withSets.has(s.id))
      .map((s) => s.date);
    return weeklyConsistency(dates, this.profiles.effective().gymDays.length, today());
  });

  async start(plan: PlannedSession): Promise<number> {
    return db.sessions.add({
      date: plan.date,
      phaseId: plan.phase.id,
      templateId: plan.template.id,
      startedAt: new Date().toISOString(),
    });
  }

  async finish(sessionId: number): Promise<void> {
    await db.sessions.update(sessionId, { endedAt: new Date().toISOString() });
  }

  async resume(sessionId: number): Promise<void> {
    await db.sessions.update(sessionId, { endedAt: undefined });
  }

  /** Registra (o corregge) una serie. */
  async logSet(session: WorkoutSession, exercise: string, set: number, kg: number, reps: number): Promise<void> {
    const existing = await db.sets.where('sessionId').equals(session.id!).filter((s) => s.exercise === exercise && s.set === set).first();
    const row: SetLog = { sessionId: session.id!, date: session.date, exercise, set, kg, reps, at: new Date().toISOString() };
    if (existing?.id) await db.sets.put({ ...row, id: existing.id });
    else await db.sets.add(row);
  }

  async removeSet(session: WorkoutSession, exercise: string, set: number): Promise<void> {
    await db.sets
      .where('sessionId')
      .equals(session.id!)
      .filter((s) => s.exercise === exercise && s.set === set)
      .delete();
  }
}
