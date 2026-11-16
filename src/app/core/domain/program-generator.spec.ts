import { describe, expect, it } from 'vitest';
import { generateProgram } from './program-generator';
import { EXERCISES, plannedSession } from './workout';

const known = new Set(EXERCISES.map((e) => e.id));

describe('scheda automatica', () => {
  it('massa 4 giorni intermedio: parte alta / gambe con esercizi validi', () => {
    const p = generateProgram({ goal: 'massa', days: 4, level: 'intermedio' });
    const t = p.phases[0].templates;
    expect(t.map((x) => x.name)).toEqual(['Parte alta A', 'Gambe A', 'Parte alta B', 'Gambe B']);
    for (const x of t) {
      expect(x.exercises.length).toBeGreaterThanOrEqual(4);
      for (const e of x.exercises) expect(known.has(e.exercise), e.exercise).toBe(true);
      expect(new Set(x.exercises.map((e) => e.exercise)).size).toBe(x.exercises.length);
    }
    expect(t[0].exercises[0]).toMatchObject({ sets: 4, reps: '6-10' });
  });

  it('riattivazione: total body, macchine, poco volume', () => {
    const p = generateProgram({ goal: 'riattivazione', days: 3, level: 'esperto' });
    const t = p.phases[0].templates;
    expect(t[0].name).toBe('Total body A');
    expect(t[0].exercises.length).toBeLessThanOrEqual(5);
    expect(t[0].exercises.map((e) => e.exercise)).toContain('leg-press');
    expect(t[0].exercises.every((e) => e.sets === 2)).toBe(true);
  });

  it('una scheda per ogni giorno, e funziona con il calendario', () => {
    for (const days of [2, 3, 5]) {
      const p = generateProgram({ goal: 'definizione', days, level: 'intermedio' });
      expect(p.phases[0].templates.length).toBe(Math.min(days, days <= 3 ? 3 : 5));
    }
    const p = generateProgram({ goal: 'forza', days: 3, level: 'esperto' });
    const s = plannedSession('2026-11-16', { startDate: '2026-11-16', gymDays: [0, 2, 4] }, p)!;
    expect(s.template.name).toBe('Spinta');
    expect(s.exercises[0].sets).toBe(5);
  });
});
