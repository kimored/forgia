import type { Weekday } from './plan';

/**
 * Dati personali: inseriti dall'utente, salvati SOLO in IndexedDB e nel backup JSON.
 * Nel repo ci sono solo i valori di default qui sotto (nessun dato personale).
 */
export type Sex = 'M' | 'F' | 'altro';

/** Orari personali: id dello slot del piano (o "palestra") → "HH:mm". */
export type Times = Record<string, string>;

export interface PersonalReminder {
  id: string;
  /** "HH:mm" */
  time: string;
  text: string;
  enabled: boolean;
}

export interface BodyComposition {
  fatPct?: number;
  muscleKg?: number;
  bmrKcal?: number;
  /** Valori aggiuntivi letti dallo screenshot della bilancia. */
  bmi?: number;
  skeletalMusclePct?: number;
  proteinPct?: number;
  visceralFat?: number;
  waterPct?: number;
  boneKg?: number;
  metabolicAge?: number;
  /** Data della pesata da cui vengono i valori. */
  measuredAt?: string;
}

export interface Profile {
  name: string;
  age?: number;
  heightCm?: number;
  sex?: Sex;
  startWeightKg?: number;
  /** "YYYY-MM-DD": lunedì in cui inizia la settimana 1 del ciclo. */
  startDate: string;
  /** Ordine delle settimane del piano nel ciclo (es. [2,1,3,4]); assente = 1,2,3… */
  weekOrder?: number[];
  body?: BodyComposition;
  gymDays: Weekday[];
  /** Orari scelti dall'utente; se uno slot manca vale l'orario indicato dal piano. */
  times: Times;
  /** Fine della fascia palestra, "HH:mm". */
  gymEnd: string;
  waterTargetMl: number;
  reminders: PersonalReminder[];
  updatedAt: string;
}

/** Orari di esempio (quelli del piano di esempio). */
export const DEFAULT_TIMES: Times = {
  colazione: '09:30',
  spuntino1: '11:30',
  pranzo: '13:30',
  spuntino2: '17:00',
  cena: '20:15',
  palestra: '22:00',
  post: '23:45',
};

export function defaultProfile(startDate: string): Profile {
  return {
    name: '',
    startDate,
    gymDays: [0, 2, 4],
    times: { palestra: DEFAULT_TIMES['palestra'] },
    gymEnd: '23:30',
    waterTargetMl: 2500,
    reminders: [],
    updatedAt: new Date().toISOString(),
  };
}
