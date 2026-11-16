import type { CycleWeek, Weekday } from '../models/plan';
import { daysBetween, mondayOf, weekdayOf, type IsoDate } from './dates';

export interface CyclePosition {
  /** Settimana del ciclo alimentare 1 → N → 1 … */
  week: CycleWeek;
  weekday: Weekday;
  /**
   * Settimana del programma dalla data di inizio (1 = prima settimana).
   * ≤ 0 prima dell'inizio. Serve per la fase di allenamento.
   */
  programWeek: number;
}

/**
 * Posizione di una data nel ciclo. Le settimane sono di calendario (lun → dom):
 * se la data di inizio non è un lunedì vale il lunedì della sua settimana.
 */
export function cyclePosition(date: IsoDate, startDate: IsoDate, cycleWeeks = 4): CyclePosition {
  const weeks = Math.floor(daysBetween(mondayOf(startDate), mondayOf(date)) / 7);
  const n = Math.max(1, cycleWeeks);
  const week = ((((weeks % n) + n) % n) + 1) as CycleWeek;
  return { week, weekday: weekdayOf(date), programWeek: weeks >= 0 ? weeks + 1 : weeks };
}

export function isGymDay(date: IsoDate, gymDays: readonly Weekday[]): boolean {
  return gymDays.includes(weekdayOf(date));
}
