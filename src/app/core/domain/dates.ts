import type { Weekday } from '../models/plan';

/** Date di calendario locali come stringhe "YYYY-MM-DD" (niente fusi orari nei dati). */
export type IsoDate = string;

const DAY_MS = 86_400_000;

export function toIsoDate(d: Date): IsoDate {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function today(): IsoDate {
  return toIsoDate(new Date());
}

/** Mezzogiorno locale: evita sorprese con il cambio dell'ora legale. */
export function parseIsoDate(s: IsoDate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(s: IsoDate, n: number): IsoDate {
  const d = parseIsoDate(s);
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
}

/** Giorni di calendario da a → b (negativo se b precede a). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / DAY_MS);
}

/** 0 = lunedì … 6 = domenica. */
export function weekdayOf(s: IsoDate): Weekday {
  return ((parseIsoDate(s).getDay() + 6) % 7) as Weekday;
}

export function mondayOf(s: IsoDate): IsoDate {
  return addDays(s, -weekdayOf(s));
}

/** I 7 giorni (lun → dom) della settimana di calendario che contiene `s`. */
export function weekDates(s: IsoDate): IsoDate[] {
  const monday = mondayOf(s);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export const WEEKDAY_NAMES = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'] as const;
export const WEEKDAY_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'] as const;
