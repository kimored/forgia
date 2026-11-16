import { describe, expect, it } from 'vitest';
import type { MealLog } from '../models/logs';
import { DEFAULT_TIMES } from '../models/profile';
import { exampleCatalog as catalog } from './catalog';
import { addDays } from './dates';
import { resolveDay } from './day-plan';
import { dailyReminders, type ReminderInput } from './reminders';

const MONDAY = '2026-11-16';
const profile = { startDate: MONDAY, gymDays: [0, 2, 4] as (0 | 2 | 4)[], times: DEFAULT_TIMES };
const day = (date: string, logs: MealLog[] = []) => resolveDay(catalog, { date, profile, logs });

const base = (over: Partial<ReminderInput> = {}): ReminderInput => ({
  today: MONDAY,
  now: '08:00',
  day: day(MONDAY),
  weighedToday: false,
  lastMeasure: MONDAY,
  habits: [],
  pantryAlerts: 0,
  workout: { planned: false, started: false },
  personal: [],
  ...over,
});
const ids = (i: ReminderInput) => dailyReminders(i).map((r) => r.id);

describe('promemoria in-app', () => {
  it('lunedì mattina: pesata a digiuno, finché non è registrata', () => {
    expect(ids(base())).toContain('peso');
    expect(ids(base({ weighedToday: true }))).not.toContain('peso');
    expect(ids(base({ now: '15:00' }))).not.toContain('peso');
    expect(ids(base({ today: addDays(MONDAY, 1), day: day(addDays(MONDAY, 1)) }))).not.toContain('peso');
  });

  it('promemoria personale vicino o scaduto, se non fatto', () => {
    const personal = [{ id: 'x', time: '08:15', text: 'Promemoria del mattino', done: false }];
    expect(ids(base({ personal }))).toContain('p-x');
    expect(ids(base({ personal: [{ ...personal[0], done: true }] }))).not.toContain('p-x');
    expect(ids(base({ personal: [{ ...personal[0], time: '12:00' }] }))).not.toContain('p-x');
  });

  it('prossimo pasto entro 45 minuti e pasti dimenticati', () => {
    expect(ids(base({ now: '09:00' }))).toContain('next-colazione');
    const r = dailyReminders(base({ now: '15:00' }));
    expect(r.find((x) => x.id === 'missed')?.text).toMatch(/pasti di oggi da segnare/);
    const allDone = day(MONDAY).meals.map<MealLog>((m) => ({ date: MONDAY, slot: m.slot, status: 'done', at: '' }));
    expect(ids(base({ now: '15:00', day: day(MONDAY, allDone) }))).not.toContain('missed');
  });

  it('abitudine del piano non spuntata la sera', () => {
    const habits = [{ id: 'creatina', label: 'Creatina 5 g', done: false }];
    expect(ids(base({ now: '19:00', habits }))).toContain('h-creatina');
    expect(ids(base({ now: '10:00', habits }))).not.toContain('h-creatina');
  });

  it('allenamento in arrivo, dispensa e misure', () => {
    expect(ids(base({ now: '21:15', workout: { planned: true, started: false, time: '22:00' } }))).toContain('gym');
    expect(ids(base({ pantryAlerts: 2 }))).toContain('pantry');
    expect(ids(base({ lastMeasure: addDays(MONDAY, -30) }))).toContain('misure');
    expect(ids(base())).not.toContain('misure');
  });
});
