import { describe, expect, it } from 'vitest';
import type { MealLog } from '../models/logs';
import { DEFAULT_TIMES } from '../models/profile';
import { EXAMPLE_PLAN, exampleCatalog as catalog } from './catalog';
import { addDays, type IsoDate } from './dates';
import { resolveDay } from './day-plan';
import { adherence, projectionAt, projectionSeries, waistAlert, weightStalled } from './progress';

const START = '2026-11-16';
const curve: [number, number][] = [[0, 0], [1, 1.8], [3, 2.8], [6, 4.0], [12, 6.0]];

describe('proiezioni', () => {
  it('partono dal peso iniziale dell’utente, non da un valore fisso', () => {
    expect(projectionAt(curve, 80, START, START)).toBe(80);
    expect(projectionAt(curve, 65, START, START)).toBe(65);
  });

  it('interpolano tra i punti del piano', () => {
    const oneMonth = addDays(START, 30);
    expect(projectionAt(curve, 70, START, oneMonth)!).toBeCloseTo(71.77, 1);
    expect(projectionAt(curve, 70, START, addDays(START, 365))!).toBeCloseTo(76, 0);
  });

  it('nulla prima dell’inizio o oltre la fine delle curve', () => {
    expect(projectionAt(curve, 70, START, addDays(START, -1))).toBeNull();
    expect(projectionAt(curve, 70, START, addDays(START, 500))).toBeNull();
  });

  it('serie settimanali per il grafico, dalle curve del piano', () => {
    const s = projectionSeries(EXAMPLE_PLAN, 70, START, addDays(START, 60));
    expect(s.map((x) => x.label)).toEqual(['Dieta al 100%', 'Dieta all’80%']);
    expect(s[0].points[0]).toEqual({ date: START, value: 70 });
    expect(s[0].points.length).toBe(9);
  });
});

describe('peso fermo', () => {
  const w = (offset: number, kg: number) => ({ date: addDays(START, offset), kg });
  it('in massa: peso che non sale da 3 settimane', () => {
    const today = addDays(START, 21);
    expect(weightStalled([w(0, 70), w(7, 70.1), w(14, 70), w(21, 70.1)], 3, 'up', today)).toBe(true);
    expect(weightStalled([w(0, 70), w(21, 70.8)], 3, 'up', today)).toBe(false);
  });

  it('senza pesate sufficienti nessun avviso', () => {
    expect(weightStalled([w(21, 70)], 3, 'up', addDays(START, 21))).toBe(false);
  });
});

describe('girovita', () => {
  it('avvisa se sale di più di 2,5 cm in 3 mesi', () => {
    const m = [
      { date: '2026-11-16', waistCm: 80 },
      { date: '2026-12-16', waistCm: 81 },
      { date: '2027-01-16', waistCm: 83 },
    ];
    expect(waistAlert(m, '2027-01-20')).toEqual({ delta: 3 });
    expect(waistAlert(m.slice(0, 2), '2026-12-20')).toBeNull();
  });
});

describe('aderenza', () => {
  const profile = { startDate: START, gymDays: [0, 2, 4] as (0 | 2 | 4)[], times: DEFAULT_TIMES };
  const resolver = (logs: MealLog[]) => (date: IsoDate) => resolveDay(catalog, { date, profile, logs: logs.filter((l) => l.date === date) });

  it('percentuale di pasti fatti (varianti valide comprese), esclusi i liberi', () => {
    const day = resolver([])(START);
    const logs: MealLog[] = day.meals.map((m, i) => ({
      date: START,
      slot: m.slot,
      status: i === 0 ? 'skipped' : 'done',
      optionId: m.slot === 'pranzo' ? 'pr-riso-pomodoro' : undefined,
      at: '',
    }));
    const a = adherence(resolver(logs), START, START);
    expect(a.total).toBe(day.meals.length);
    expect(a.done).toBe(day.meals.length - 1);
    expect(a.level).toBe('buona');
  });

  it('i pasti liberi non contano', () => {
    const sunday = addDays(START, 6);
    const a = adherence(resolver([]), sunday, sunday);
    expect(a.total).toBe(3); // colazione e due spuntini
  });
});
