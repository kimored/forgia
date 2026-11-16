import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMES } from '../models/profile';
import type { MealSlot } from '../models/plan';
import { catalog } from './catalog';
import { addDays } from './dates';
import { resolveDay, type DayProfile, type ResolvedDay } from './day-plan';

const START = '2026-11-16';
const profile: DayProfile = { startDate: START, gymDays: [0, 2, 4], times: DEFAULT_TIMES };

const day = (offset: number, extra: Partial<Parameters<typeof resolveDay>[1]> = {}) =>
  resolveDay(catalog, { date: addDays(START, offset), profile, ...extra });
const meal = (d: ResolvedDay, slot: MealSlot) => d.meals.find((m) => m.slot === slot)!;
const qty = (d: ResolvedDay, slot: MealSlot, food: string) =>
  meal(d, slot).portions.find((p) => p.food === food)?.qty;

describe('resolveDay', () => {
  it('lunedì settimana 1: piano previsto e giorno palestra', () => {
    const d = day(0);
    expect(d.week).toBe(1);
    expect(d.gym).toBe(true);
    expect(meal(d, 'colazione').option?.id).toBe('col-lm');
    expect(meal(d, 'pranzo').option?.id).toBe('pr-pasta-tonno');
    expect(meal(d, 'cena').option?.id).toBe('ce-pollo-insalata-carote');
    expect(d.meals.map((m) => m.slot)).toContain('post');
  });

  it('giorno palestra: 40 g di pane a cena; altrimenti 80 g', () => {
    expect(qty(day(0), 'cena', 'pane')).toBe(40);
    expect(qty(day(3), 'cena', 'pane')).toBe(80); // gio sett. 1, salmone
  });

  it('niente post-allenamento nei giorni di riposo', () => {
    expect(day(1).meals.map((m) => m.slot)).not.toContain('post');
  });

  it('weekend: sabato cena libera, domenica pranzo e cena liberi, colazione e spuntini da dieta', () => {
    const sat = day(5);
    expect(meal(sat, 'pranzo').free).toBe(false);
    expect(meal(sat, 'cena').free).toBe(true);
    const sun = day(6);
    expect(meal(sun, 'pranzo').free).toBe(true);
    expect(meal(sun, 'cena').free).toBe(true);
    expect(meal(sun, 'colazione').free).toBe(false);
    expect(meal(sun, 'spuntino2').free).toBe(false);
  });

  it('swap sushi del sabato: pranzo libero e cena da dieta con 80 g di pane', () => {
    const d = day(5, { options: { date: addDays(START, 5), sushiSwap: true } });
    expect(meal(d, 'pranzo').free).toBe(true);
    expect(meal(d, 'cena').option?.id).toBe(catalog.plan.sushiSwapDinner);
    expect(qty(d, 'cena', 'pane')).toBe(80);
  });

  it('lo swap sushi vale solo di sabato', () => {
    const d = day(3, { options: { date: addDays(START, 3), sushiSwap: true } });
    expect(meal(d, 'pranzo').free).toBe(false);
  });

  it('cardio extra in un giorno di riposo: +30 g di pasta a pranzo', () => {
    const d = day(1, { options: { date: addDays(START, 1), cardioExtra: true } });
    expect(qty(d, 'pranzo', 'pasta')).toBe(150);
    expect(meal(d, 'pranzo').notes.join()).toMatch(/\+30 g/);
  });

  it('il cardio extra non si applica nei giorni di palestra', () => {
    const d = day(0, { options: { date: START, cardioExtra: true } });
    expect(qty(d, 'pranzo', 'pasta')).toBe(120);
  });

  it('regola 5: uova a pranzo → affettato alle 11:30 (venerdì settimana 1)', () => {
    expect(meal(day(4), 'spuntino1').option?.id).toBe('sp1-affettato');
    expect(meal(day(3), 'spuntino1').option?.id).toBe('sp1-uova');
  });

  it('regola 5 segue le sostituzioni: frittata a cena → affettato', () => {
    const date = addDays(START, 1);
    const d = day(1, {
      logs: [{ date, slot: 'cena', status: 'replaced', optionId: 'ce-frittata-insalata-carote', at: '' }],
    });
    expect(meal(d, 'cena').option?.id).toBe('ce-frittata-insalata-carote');
    expect(meal(d, 'cena').planned?.id).toBe('ce-orata-patate-insalata');
    expect(meal(d, 'spuntino1').option?.id).toBe('sp1-affettato');
  });

  it('regola 6: patate sostituite da 40 g di pane se scelte in un giorno di palestra', () => {
    const d = day(0, {
      logs: [{ date: START, slot: 'cena', status: 'replaced', optionId: 'ce-orata-patate-insalata', at: '' }],
    });
    expect(qty(d, 'cena', 'patate')).toBeUndefined();
    expect(qty(d, 'cena', 'pane')).toBe(40);
  });

  it('usa gli orari del profilo', () => {
    const d = resolveDay(catalog, { date: START, profile: { ...profile, times: { ...DEFAULT_TIMES, pranzo: '13:00' } } });
    expect(meal(d, 'pranzo').time).toBe('13:00');
  });

  it('giorni di palestra personalizzati', () => {
    const d = resolveDay(catalog, { date: addDays(START, 1), profile: { ...profile, gymDays: [1, 3] } });
    expect(d.gym).toBe(true);
    expect(qty(d, 'cena', 'pane')).toBe(40);
  });
});
