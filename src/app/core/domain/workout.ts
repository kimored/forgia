import exercisesJson from '../../../assets/data/exercises.json';
import programJson from '../../../assets/data/workout-program.json';
import type { Weekday } from '../models/plan';
import type { ExerciseInfo, Phase, ProgramExercise, RestRange, SetLog, WorkoutProgram, WorkoutTemplate } from '../models/workout';
import { cyclePosition } from './cycle';
import { addDays, mondayOf, weekDates, weekdayOf, type IsoDate } from './dates';

export const EXERCISES = exercisesJson as ExerciseInfo[];
export const PROGRAM = programJson as WorkoutProgram;
const byId = new Map(EXERCISES.map((e) => [e.id, e]));

export function exercise(id: string): ExerciseInfo {
  const e = byId.get(id);
  if (!e) throw new Error(`Esercizio sconosciuto: ${id}`);
  return e;
}

export function exerciseImages(e: ExerciseInfo): string[] {
  return [`exercises/${e.db}/0.webp`, `exercises/${e.db}/1.webp`];
}

export interface Reps {
  min: number;
  max: number;
}

/** "12-15" → {12, 15}; "8" → {8, 8}. */
export function parseReps(reps: string): Reps {
  const [a, b] = reps.split(/[-–]/).map((s) => parseInt(s, 10));
  return { min: a, max: Number.isFinite(b) ? b : a };
}

/** Fase attiva per una settimana di programma (o quella scelta a mano). */
export function phaseFor(program: WorkoutProgram, programWeek: number, override?: string): Phase {
  if (override) {
    const p = program.phases.find((x) => x.id === override);
    if (p) return p;
  }
  const week = Math.max(1, programWeek);
  return (
    program.phases.find((p) => week >= p.fromWeek && (p.toWeek === undefined || week <= p.toWeek)) ?? program.phases.at(-1)!
  );
}

export interface PlannedExercise {
  info: ExerciseInfo;
  sets: number;
  reps: string;
  range: Reps;
  rest: RestRange;
  rir?: string;
  alternatives: ExerciseInfo[];
  superset?: string;
  note?: string;
}

export interface PlannedSession {
  date: IsoDate;
  phase: Phase;
  /** Settimana all'interno della fase (1-based). */
  phaseWeek: number;
  programWeek: number;
  template: WorkoutTemplate;
  deload: boolean;
  exercises: PlannedExercise[];
}

const DEFAULT_REST: RestRange = [60, 90];

/** Numero della seduta nella settimana (0 = prima): conta i giorni di palestra fino a oggi. */
function sessionIndex(date: IsoDate, gymDays: readonly Weekday[]): number {
  const wd = weekdayOf(date);
  return [...gymDays].sort().filter((d) => d < wd).length;
}

/**
 * Scheda del giorno: null se non è un giorno di palestra. `force` restituisce comunque la
 * scheda (per allenarsi in un giorno diverso dal solito).
 */
export function plannedSession(
  date: IsoDate,
  input: { startDate: IsoDate; gymDays: readonly Weekday[]; phaseOverride?: string; force?: boolean; templateId?: string },
  program: WorkoutProgram = PROGRAM,
): PlannedSession | null {
  const gym = input.gymDays.includes(weekdayOf(date));
  if (!gym && !input.force && !input.templateId) return null;
  const { programWeek } = cyclePosition(date, input.startDate);
  const phase = phaseFor(program, programWeek, input.phaseOverride);
  const phaseWeek = Math.max(1, programWeek - phase.fromWeek + 1);
  const idx = gym ? sessionIndex(date, input.gymDays) : 0;
  const templateId = input.templateId ?? phase.rotation[idx % phase.rotation.length];
  const template = phase.templates.find((t) => t.id === templateId) ?? phase.templates[0];
  const deload = !!phase.deloadEvery && phaseWeek % phase.deloadEvery === 0;
  const defaults = phase.weeks?.find((w) => w.weeks.includes(phaseWeek)) ?? phase.weeks?.at(-1);

  return {
    date,
    phase,
    phaseWeek,
    programWeek,
    template,
    deload,
    exercises: template.exercises.map((pe) => plan(pe, phaseWeek, defaults, deload)),
  };
}

function plan(
  pe: ProgramExercise,
  phaseWeek: number,
  defaults: { sets: number; rir: string; rest: RestRange } | undefined,
  deload: boolean,
): PlannedExercise {
  const week = pe.byWeek?.find((w) => w.weeks.includes(phaseWeek));
  const reps = week?.reps ?? pe.reps;
  let sets = week?.sets ?? pe.sets ?? defaults?.sets ?? 3;
  if (deload) sets = Math.max(1, Math.ceil(sets / 2));
  return {
    info: exercise(pe.exercise),
    sets,
    reps,
    range: parseReps(reps),
    rest: pe.rest ?? defaults?.rest ?? DEFAULT_REST,
    rir: pe.sets ? undefined : defaults?.rir,
    alternatives: (pe.alternatives ?? []).map(exercise),
    superset: pe.superset,
    note: pe.note,
  };
}

/** Prossima data di palestra a partire da domani. */
export function nextGymDay(date: IsoDate, gymDays: readonly Weekday[]): IsoDate | null {
  if (!gymDays.length) return null;
  for (let i = 1; i <= 7; i++) {
    const d = addDays(date, i);
    if (gymDays.includes(weekdayOf(d))) return d;
  }
  return null;
}

// ---------- Storico e progressione ----------

export interface SessionSets {
  date: IsoDate;
  sessionId: number;
  sets: { kg: number; reps: number }[];
}

/** Sedute passate di un esercizio (più recente prima), escludendo eventualmente una seduta. */
export function historyOf(logs: readonly SetLog[], exerciseId: string, excludeSession?: number): SessionSets[] {
  const bySession = new Map<number, SessionSets>();
  for (const l of logs) {
    if (l.exercise !== exerciseId || l.sessionId === excludeSession) continue;
    const s = bySession.get(l.sessionId) ?? { date: l.date, sessionId: l.sessionId, sets: [] };
    s.sets[l.set - 1] = { kg: l.kg, reps: l.reps };
    bySession.set(l.sessionId, s);
  }
  return [...bySession.values()]
    .map((s) => ({ ...s, sets: s.sets.filter(Boolean) }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.sessionId - a.sessionId);
}

export interface Suggestion {
  kg: number;
  reps: number;
  text: string;
  increase: boolean;
}

const fmtKg = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')} kg`;

/**
 * Progressione: se la volta scorsa TUTTE le serie sono arrivate al massimo delle ripetizioni,
 * si aumenta il carico; altrimenti si tiene il carico e si punta a una ripetizione in più.
 */
export function suggestion(planned: PlannedExercise, last: SessionSets | undefined): Suggestion | null {
  if (!last?.sets.length) return null;
  const top = Math.max(...last.sets.map((s) => s.kg));
  const done = last.sets.slice(0, planned.sets);
  const summary = `La volta scorsa ${done.length}×${done.map((s) => s.reps).join('/')} a ${fmtKg(top)}`;
  const allTop = done.length >= planned.sets && done.every((s) => s.reps >= planned.range.max);
  if (top === 0) {
    // Corpo libero (es. trazioni): si progredisce con le ripetizioni.
    const reps = Math.max(...done.map((s) => s.reps));
    return { kg: 0, reps: reps + (allTop ? 1 : 0), text: `${summary} → oggi punta a ${reps + 1} ripetizioni`, increase: allTop };
  }
  if (allTop) {
    const kg = top + planned.info.increment;
    return { kg, reps: planned.range.min, text: `${summary} → oggi prova ${fmtKg(kg)}`, increase: true };
  }
  const minReps = Math.min(...done.map((s) => s.reps));
  return {
    kg: top,
    reps: Math.min(planned.range.max, minReps + 1),
    text: `${summary} → resta a ${fmtKg(top)} e cerca una ripetizione in più`,
    increase: false,
  };
}

export interface ExercisePoint {
  date: IsoDate;
  maxKg: number;
  /** Volume: somma di kg × ripetizioni. */
  volume: number;
  bestReps: number;
}

/** Punti per il grafico di un esercizio, dal più vecchio. */
export function exerciseStats(logs: readonly SetLog[], exerciseId: string): ExercisePoint[] {
  return historyOf(logs, exerciseId)
    .reverse()
    .map((s) => ({
      date: s.date,
      maxKg: Math.max(...s.sets.map((x) => x.kg)),
      volume: s.sets.reduce((sum, x) => sum + x.kg * x.reps, 0),
      bestReps: Math.max(...s.sets.map((x) => x.reps)),
    }));
}

/** Sedute completate per settimana di calendario e striscia di settimane "piene". */
export function weeklyConsistency(sessionDates: readonly IsoDate[], gymDaysPerWeek: number, today: IsoDate) {
  const perWeek = new Map<IsoDate, number>();
  for (const d of new Set(sessionDates)) perWeek.set(mondayOf(d), (perWeek.get(mondayOf(d)) ?? 0) + 1);
  const target = Math.max(1, gymDaysPerWeek);
  const thisWeek = perWeek.get(mondayOf(today)) ?? 0;
  // La settimana in corso conta nella striscia solo se è già completa.
  let monday = thisWeek >= target ? mondayOf(today) : addDays(mondayOf(today), -7);
  let streak = 0;
  while ((perWeek.get(monday) ?? 0) >= target) {
    streak++;
    monday = addDays(monday, -7);
  }
  return { thisWeek, target, streak, days: weekDates(today) };
}
