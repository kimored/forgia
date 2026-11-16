import type { PlanDocument } from '../models/plan';
import { addDays, daysBetween, mondayOf, type IsoDate } from './dates';
import type { DayResolver } from './rules';

/** Statistiche di Progressi: funzioni pure sui dati registrati dall'utente. */

export interface WeightEntryLike {
  date: IsoDate;
  kg: number;
}

const DAYS_PER_MONTH = 30.44;

/**
 * Curve di proiezione del piano (variazione in kg per mese) applicate al peso iniziale
 * DELL'UTENTE: interpolazione lineare tra i punti indicati dal professionista.
 */
export function projectionAt(points: [number, number][], startKg: number, startDate: IsoDate, date: IsoDate): number | null {
  if (!points.length) return null;
  const month = daysBetween(startDate, date) / DAYS_PER_MONTH;
  if (month < 0) return null;
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  const last = sorted.at(-1)!;
  if (month >= last[0]) return month === last[0] ? startKg + last[1] : null;
  for (let i = 1; i < sorted.length; i++) {
    const [m0, d0] = sorted[i - 1];
    const [m1, d1] = sorted[i];
    if (month <= m1) return startKg + d0 + ((month - m0) / (m1 - m0)) * (d1 - d0);
  }
  return null;
}

export interface Series {
  label: string;
  points: { date: IsoDate; value: number }[];
}

/** Curve del piano campionate ogni settimana fino a `until` (o alla fine delle curve). */
export function projectionSeries(plan: PlanDocument, startKg: number, startDate: IsoDate, until: IsoDate): Series[] {
  return (plan.meta.projections ?? []).map((p) => {
    const points: Series['points'] = [];
    const endMonth = Math.max(...p.points.map((x) => x[0]));
    const end = addDays(startDate, Math.round(endMonth * DAYS_PER_MONTH));
    const stop = until < end ? until : end;
    for (let d = startDate; d <= stop; d = addDays(d, 7)) {
      const v = projectionAt(p.points, startKg, startDate, d);
      if (v !== null) points.push({ date: d, value: Math.round(v * 10) / 10 });
    }
    return { label: p.label, points };
  });
}

/**
 * Peso fermo: nelle ultime `weeks` settimane il trend non va nella direzione prevista dal piano.
 * Usa la media settimanale (una pesata a settimana basta).
 */
export function weightStalled(entries: readonly WeightEntryLike[], weeks: number, direction: 'up' | 'down', today: IsoDate): boolean {
  const byWeek = new Map<IsoDate, number[]>();
  for (const e of entries) {
    const w = mondayOf(e.date);
    byWeek.set(w, [...(byWeek.get(w) ?? []), e.kg]);
  }
  const avg = (w: IsoDate) => {
    const xs = byWeek.get(w);
    return xs ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const current = mondayOf(today);
  const now = avg(current) ?? avg(addDays(current, -7));
  const then = avg(addDays(current, -7 * weeks));
  if (now === null || then === null) return false;
  const delta = now - then;
  return direction === 'up' ? delta < 0.2 : delta > -0.2;
}

export interface MeasurementLike {
  date: IsoDate;
  waistCm?: number;
}

/** Girovita salito di più di `limitCm` negli ultimi 3 mesi. */
export function waistAlert(entries: readonly MeasurementLike[], today: IsoDate, limitCm = 2.5): { delta: number } | null {
  const withWaist = entries.filter((e) => e.waistCm !== undefined).sort((a, b) => a.date.localeCompare(b.date));
  const latest = withWaist.at(-1);
  if (!latest) return null;
  const from = addDays(today, -92);
  const base = withWaist.find((e) => e.date >= from && e.date < latest.date);
  if (!base) return null;
  const delta = latest.waistCm! - base.waistCm!;
  return delta > limitCm ? { delta: Math.round(delta * 10) / 10 } : null;
}

export interface Adherence {
  /** Pasti fatti come da piano o con una variante valida. */
  done: number;
  /** Pasti previsti (esclusi i pasti liberi). */
  total: number;
  pct: number;
  level: 'ottima' | 'buona' | 'bassa' | 'nd';
}

/** Aderenza alla dieta tra due date (incluse). */
export function adherence(resolve: DayResolver, from: IsoDate, to: IsoDate): Adherence {
  let done = 0;
  let total = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const m of resolve(d).meals) {
      if (m.free) continue;
      total++;
      if (m.log?.status === 'done') done++;
    }
  }
  const pct = total ? done / total : 0;
  return { done, total, pct, level: !total ? 'nd' : pct >= 0.99 ? 'ottima' : pct >= 0.8 ? 'buona' : 'bassa' };
}
