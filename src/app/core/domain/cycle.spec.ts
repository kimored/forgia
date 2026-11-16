import { describe, expect, it } from 'vitest';
import { cyclePosition, isGymDay } from './cycle';
import { addDays, daysBetween, mondayOf, weekdayOf } from './dates';

const START = '2026-11-16'; // lunedì

describe('dates', () => {
  it('lunedì = 0, domenica = 6', () => {
    expect(weekdayOf('2026-11-16')).toBe(0);
    expect(weekdayOf('2026-11-22')).toBe(6);
  });

  it('attraversa il cambio dell’ora legale senza perdere giorni', () => {
    expect(daysBetween('2027-03-27', '2027-03-29')).toBe(2);
    expect(addDays('2027-10-30', 2)).toBe('2027-11-01');
  });

  it('mondayOf', () => {
    expect(mondayOf('2026-11-22')).toBe('2026-11-16');
    expect(mondayOf('2026-11-23')).toBe('2026-11-23');
  });
});

describe('cyclePosition', () => {
  it('il giorno di inizio è settimana 1, lunedì', () => {
    expect(cyclePosition(START, START)).toEqual({ week: 1, weekday: 0, programWeek: 1 });
  });

  it('la domenica resta nella stessa settimana', () => {
    expect(cyclePosition('2026-11-22', START).week).toBe(1);
  });

  it('ruota 1 → 2 → 3 → 4 → 1', () => {
    const weeks = [0, 7, 14, 21, 28, 35].map((d) => cyclePosition(addDays(START, d), START).week);
    expect(weeks).toEqual([1, 2, 3, 4, 1, 2]);
  });

  it('conta le settimane di programma oltre il ciclo', () => {
    expect(cyclePosition(addDays(START, 28), START).programWeek).toBe(5);
  });

  it('prima dell’inizio il ciclo va all’indietro senza indici negativi', () => {
    const p = cyclePosition('2026-11-15', START);
    expect(p.week).toBe(4);
    expect(p.weekday).toBe(6);
    expect(p.programWeek).toBe(-1);
  });

  it('una data di inizio non di lunedì vale per la sua settimana', () => {
    expect(cyclePosition('2026-11-16', '2026-11-18').week).toBe(1);
    expect(cyclePosition('2026-11-23', '2026-11-18').week).toBe(2);
  });

  it('dopo un anno', () => {
    // 2027-11-15 è lunedì, 52 settimane dopo → 52 % 4 = 0 → settimana 1
    expect(cyclePosition('2027-11-15', START).week).toBe(1);
  });
});

describe('isGymDay', () => {
  it('lun/mer/ven di default', () => {
    const gym = [0, 2, 4] as const;
    expect([0, 1, 2, 3, 4, 5, 6].map((d) => isGymDay(addDays(START, d), gym))).toEqual([
      true, false, true, false, true, false, false,
    ]);
  });
});
