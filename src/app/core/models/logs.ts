import type { MealSlot } from './plan';

/** Dati utente giornalieri (IndexedDB). Le date sono stringhe locali "YYYY-MM-DD". */

export type MealStatus = 'done' | 'skipped' | 'replaced';

export interface MealLog {
  date: string;
  slot: MealSlot;
  status: MealStatus;
  /** MealOption scelta al posto di quella del piano (status 'replaced', o 'done' dopo una sostituzione). */
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
