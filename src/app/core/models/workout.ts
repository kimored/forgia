/** Programma di allenamento (dati statici in src/assets/data, modificabili in futuro come il piano). */

export interface ExerciseInfo {
  id: string;
  name: string;
  /** Id nel database free-exercise-db (immagini in public/exercises/<db>/0|1.webp). */
  db: string;
  primary: string[];
  secondary: string[];
  compound: boolean;
  /** Incremento di carico suggerito (kg). */
  increment: number;
  tips: string[];
  equipment?: string;
  level?: string;
  /** Istruzioni del database (in inglese). */
  instructions?: string[];
  /** Percorsi delle immagini; se assenti: exercises/<db>/0|1.webp. */
  images?: string[];
  /** Viene dal catalogo completo (non dai 23 esercizi curati). */
  library?: boolean;
  /** Nome originale (inglese) nel database. */
  originalName?: string;
  /** Tipo di movimento (tirata verticale, spinta orizzontale…). */
  movement?: string;
}

/** Recupero in secondi [min, max]. */
export type RestRange = [number, number];

export interface ProgramExercise {
  exercise: string;
  reps: string;
  sets?: number;
  rest?: RestRange;
  /** Varianti accettate dal programma ("o panca con manubri"). */
  alternatives?: string[];
  /** Esercizi con lo stesso gruppo si fanno in superserie. */
  superset?: string;
  /** Ripetizioni/serie diverse per alcune settimane della fase. */
  byWeek?: { weeks: number[]; reps?: string; sets?: number }[];
  note?: string;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  exercises: ProgramExercise[];
}

export interface Phase {
  id: string;
  name: string;
  /** Settimana di programma (1-based) in cui inizia; toWeek inclusa, assente = senza fine. */
  fromWeek: number;
  toWeek?: number;
  duration?: string;
  /** Scheda per ogni seduta della settimana, in ordine (1ª seduta, 2ª…), poi si ricomincia. */
  rotation: string[];
  /** Serie, RIR e recupero di default per settimana della fase. */
  weeks?: { weeks: number[]; sets: number; rir: string; rest: RestRange }[];
  /** Ogni N settimane di fase, settimana di scarico (metà serie). */
  deloadEvery?: number;
  templates: WorkoutTemplate[];
}

export interface WorkoutProgram {
  title: string;
  notes: string[];
  phases: Phase[];
}

/** Dati utente (IndexedDB). */

export interface WorkoutSession {
  id?: number;
  /** "YYYY-MM-DD" */
  date: string;
  phaseId: string;
  templateId: string;
  startedAt: string;
  endedAt?: string;
}

export interface SetLog {
  id?: number;
  sessionId: number;
  date: string;
  exercise: string;
  /** Numero della serie (1-based). */
  set: number;
  kg: number;
  reps: number;
  at: string;
}
