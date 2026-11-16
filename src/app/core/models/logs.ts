import type { MealSlot } from './plan';

/** Dati utente giornalieri (IndexedDB). Le date sono stringhe locali "YYYY-MM-DD". */

/** 'todo' = non ancora segnato (serve quando c'è solo una sostituzione). */
export type MealStatus = 'todo' | 'done' | 'skipped';

export interface MealLog {
  date: string;
  slot: MealSlot;
  status: MealStatus;
  /** MealOption scelta al posto di quella del piano. */
  optionId?: string;
  at: string;
}

export interface DayOptions {
  date: string;
  /** Opzioni del giorno previste dal piano (regole day-swap / day-extra), per id. */
  toggles?: Record<string, boolean>;
}

export interface HabitLog {
  date: string;
  /** Abitudini del piano spuntate (PlanHabit.id → fatto). */
  done?: Record<string, boolean>;
  waterMl?: number;
  /** id dei promemoria personali segnati come fatti. */
  reminders?: string[];
}
