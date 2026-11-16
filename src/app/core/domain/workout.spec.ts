import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import type { SetLog } from '../models/workout';
import { addDays } from './dates';
import {
  EXERCISES,
  PROGRAM,
  exerciseImages,
  exerciseStats,
  historyOf,
  nextGymDay,
  parseReps,
  phaseFor,
  plannedSession,
  suggestion,
  weeklyConsistency,
} from './workout';

const START = '2026-11-16'; // lunedì, settimana 1
const input = { startDate: START, gymDays: [0, 2, 4] as (0 | 2 | 4)[] };
const at = (week: number, weekday: number) => addDays(START, (week - 1) * 7 + weekday);

describe('programma', () => {
  it('ogni esercizio del programma esiste e ha le immagini nel repo', () => {
    const ids = new Set(EXERCISES.map((e) => e.id));
    for (const p of PROGRAM.phases)
      for (const t of p.templates)
        for (const e of t.exercises) {
          expect(ids.has(e.exercise), e.exercise).toBe(true);
          for (const a of e.alternatives ?? []) expect(ids.has(a), a).toBe(true);
        }
    for (const e of EXERCISES) for (const img of exerciseImages(e)) expect(existsSync(`public/${img}`), img).toBe(true);
  });

  it('parseReps', () => {
    expect(parseReps('12-15')).toEqual({ min: 12, max: 15 });
    expect(parseReps('8')).toEqual({ min: 8, max: 8 });
  });

  it('fase dalla settimana, con scelta manuale', () => {
    expect(phaseFor(PROGRAM, 1).id).toBe('riattivazione');
    expect(phaseFor(PROGRAM, 4).id).toBe('riattivazione');
    expect(phaseFor(PROGRAM, 5).id).toBe('abc');
    expect(phaseFor(PROGRAM, 30).id).toBe('abc');
    expect(phaseFor(PROGRAM, 1, 'abc').id).toBe('abc');
  });
});

describe('plannedSession', () => {
  it('niente scheda nei giorni di riposo (salvo richiesta)', () => {
    expect(plannedSession(at(1, 1), input)).toBeNull();
    expect(plannedSession(at(1, 1), { ...input, force: true })?.template.id).toBe('fb');
  });

  it('riattivazione: serie, RIR e recupero per settimana', () => {
    const w1 = plannedSession(at(1, 0), input)!;
    const legPress = w1.exercises[0];
    expect(legPress).toMatchObject({ sets: 2, reps: '12-15', rir: '4–5', rest: [60, 90] });
    const w3 = plannedSession(at(3, 2), input)!;
    expect(w3.exercises[0]).toMatchObject({ sets: 3, rir: '3', rest: [90, 90] });
  });

  it('trazioni: 4×4 nelle settimane 1–2, 4×5 nelle 3–4, recupero 2 minuti', () => {
    const pull = (w: number) => plannedSession(at(w, 0), input)!.exercises.find((e) => e.info.id === 'trazioni')!;
    expect(pull(1)).toMatchObject({ sets: 4, reps: '4', rest: [120, 120] });
    expect(pull(3)).toMatchObject({ sets: 4, reps: '5' });
  });

  it('fase 2: A lunedì, B mercoledì, C venerdì', () => {
    expect([0, 2, 4].map((d) => plannedSession(at(5, d), input)!.template.id)).toEqual(['A', 'B', 'C']);
  });

  it('la rotazione segue i giorni di palestra scelti', () => {
    const custom = { startDate: START, gymDays: [1, 3, 5] as (1 | 3 | 5)[] };
    expect([1, 3, 5].map((d) => plannedSession(at(5, d), custom)!.template.id)).toEqual(['A', 'B', 'C']);
  });

  it('scarico ogni 8 settimane della fase 2: metà serie', () => {
    // fase 2 parte alla settimana 5 → la sua 8ª settimana è la 12ª del programma
    const normal = plannedSession(at(11, 0), input)!;
    const deload = plannedSession(at(12, 0), input)!;
    expect(normal.deload).toBe(false);
    expect(deload.deload).toBe(true);
    expect(deload.exercises[0].sets).toBe(2); // squat 4 → 2
  });

  it('superserie e alternative', () => {
    const fb = plannedSession(at(1, 0), input)!;
    expect(fb.exercises.filter((e) => e.superset === 'braccia').map((e) => e.info.id)).toEqual(['curl-manubri', 'pushdown']);
    expect(fb.exercises[1].alternatives.map((a) => a.id)).toEqual(['panca-manubri']);
  });

  it('prossimo giorno di palestra', () => {
    expect(nextGymDay(at(1, 1), input.gymDays)).toBe(at(1, 2));
    expect(nextGymDay(at(1, 4), input.gymDays)).toBe(at(2, 0));
  });
});

const log = (sessionId: number, date: string, exercise: string, sets: [number, number][]): SetLog[] =>
  sets.map(([kg, reps], i) => ({ sessionId, date, exercise, set: i + 1, kg, reps, at: '' }));

describe('progressione', () => {
  const a = plannedSession(at(5, 0), input)!; // squat 4×6-8
  const squat = a.exercises[0];

  it('tutte le serie al massimo → +2,5 kg', () => {
    const last = historyOf(log(1, '2026-12-14', 'squat', [[60, 8], [60, 8], [60, 8], [60, 8]]), 'squat')[0];
    const s = suggestion(squat, last)!;
    expect(s).toMatchObject({ kg: 62.5, reps: 6, increase: true });
    expect(s.text).toBe('La volta scorsa 4×8/8/8/8 a 60 kg → oggi prova 62,5 kg');
  });

  it('non tutte al massimo → stesso carico, una ripetizione in più', () => {
    const last = historyOf(log(1, '2026-12-14', 'squat', [[60, 8], [60, 7], [60, 6], [60, 6]]), 'squat')[0];
    expect(suggestion(squat, last)).toMatchObject({ kg: 60, reps: 7, increase: false });
  });

  it('manubri: +1 kg', () => {
    const curl = a.exercises.find((e) => e.info.id === 'curl-manubri')!;
    const last = historyOf(log(1, '2026-12-14', 'curl-manubri', [[12, 12], [12, 12], [12, 12]]), 'curl-manubri')[0];
    expect(suggestion(curl, last)!.kg).toBe(13);
  });

  it('corpo libero: si progredisce con le ripetizioni', () => {
    const pull = plannedSession(at(1, 0), input)!.exercises.find((e) => e.info.id === 'trazioni')!;
    const last = historyOf(log(1, START, 'trazioni', [[0, 4], [0, 4], [0, 4], [0, 4]]), 'trazioni')[0];
    expect(suggestion(pull, last)).toMatchObject({ kg: 0, reps: 5 });
  });

  it('senza storico nessun suggerimento', () => {
    expect(suggestion(squat, undefined)).toBeNull();
  });
});

describe('storico e costanza', () => {
  const logs = [
    ...log(1, '2026-11-16', 'leg-press', [[80, 15], [80, 12]]),
    ...log(2, '2026-11-18', 'leg-press', [[90, 12], [90, 12]]),
  ];

  it('historyOf più recente prima, esclusa la seduta in corso', () => {
    expect(historyOf(logs, 'leg-press').map((s) => s.sessionId)).toEqual([2, 1]);
    expect(historyOf(logs, 'leg-press', 2).map((s) => s.sessionId)).toEqual([1]);
  });

  it('carico massimo e volume per seduta', () => {
    expect(exerciseStats(logs, 'leg-press')).toEqual([
      { date: '2026-11-16', maxKg: 80, volume: 80 * 27, bestReps: 15 },
      { date: '2026-11-18', maxKg: 90, volume: 90 * 24, bestReps: 12 },
    ]);
  });

  it('settimane con 3 sedute su 3 di fila', () => {
    const dates = ['2026-11-16', '2026-11-18', '2026-11-20', '2026-11-23', '2026-11-25', '2026-11-27', '2026-11-30'];
    const c = weeklyConsistency(dates, 3, '2026-12-01');
    expect(c).toMatchObject({ thisWeek: 1, target: 3, streak: 2 });
    expect(weeklyConsistency(dates.slice(0, 6), 3, '2026-11-27').streak).toBe(2);
  });
});
