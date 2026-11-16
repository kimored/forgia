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
  /** Sabato: pranzo libero (sushi), cena da dieta. */
  sushiSwap?: boolean;
  /** Giorno non di palestra con cardio: +30 g di pasta a pranzo. */
  cardioExtra?: boolean;
}

export interface HabitLog {
  date: string;
  creatine?: boolean;
  waterMl?: number;
  /** id dei promemoria personali segnati come fatti. */
  reminders?: string[];
}
