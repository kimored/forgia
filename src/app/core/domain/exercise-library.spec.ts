import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import type { WorkoutProgram } from '../models/workout';
import { filterLibrary, toInfo, variantsOf, type LibraryEntry } from './exercise-library';
import { EXERCISES, exerciseImages, plannedSession } from './workout';

const LIB: LibraryEntry[] = JSON.parse(readFileSync('public/data/exercise-library.json', 'utf8'));
const entry = (id: string) => LIB.find((e) => e.id === id)!;
const italian = (id: string) => EXERCISES.find((e) => e.db === id)?.name;

describe('catalogo completo', () => {
  it('contiene centinaia di esercizi, con le immagini nel repo', () => {
    expect(LIB.length).toBeGreaterThan(800);
    for (const e of LIB.slice(0, 50)) for (const img of exerciseImages(toInfo(e))) expect(existsSync(`public/${img}`), img).toBe(true);
  });

  it('i 23 esercizi del programma sono tutti nel catalogo', () => {
    for (const e of EXERCISES) expect(entry(e.db), e.db).toBeDefined();
  });

  it('traduce muscoli e usa il nome italiano per i nostri esercizi', () => {
    const info = toInfo(entry('Barbell_Squat'));
    expect(info.primary).toEqual(['Quadricipiti']);
    expect(info.images).toEqual(['exercise-lib/Barbell_Squat/0.webp', 'exercise-lib/Barbell_Squat/1.webp']);
    const curated = toInfo(entry('Leg_Press'), EXERCISES.find((e) => e.id === 'leg-press'));
    expect(curated.name).toBe('Leg press');
    expect(curated.instructions?.length).toBeGreaterThan(0);
  });

  it('ricerca in italiano e in inglese, con filtri', () => {
    const it1 = filterLibrary(LIB, { text: 'panca piana' }, italian).map((e) => e.id);
    expect(it1).toContain('Barbell_Bench_Press_-_Medium_Grip');
    const en = filterLibrary(LIB, { text: 'hammer curl' }, italian).map((e) => e.id);
    expect(en).toContain('Hammer_Curls');
    const quads = filterLibrary(LIB, { muscle: 'quadriceps', equipment: 'machine' }, italian);
    expect(quads.length).toBeGreaterThan(3);
    expect(quads.every((e) => e.primary.includes('quadriceps') && e.equipment === 'machine')).toBe(true);
  });
});

describe('varianti', () => {
  it('stessi muscoli e stesso tipo di movimento', () => {
    const v = variantsOf(entry('Barbell_Squat'), LIB);
    expect(v.length).toBeGreaterThan(3);
    expect(v.every((e) => e.primary.includes('quadriceps'))).toBe(true);
    expect(v.map((e) => e.id)).not.toContain('Barbell_Squat');
  });

  it('le varianti della panca sono esercizi per il petto in spinta', () => {
    const v = variantsOf(entry('Barbell_Bench_Press_-_Medium_Grip'), LIB);
    expect(v.every((e) => e.primary.includes('chest'))).toBe(true);
    expect(v.some((e) => /dumbbell/i.test(e.id))).toBe(true);
  });
});

describe('programma personale', () => {
  it('usa esercizi del catalogo completo', () => {
    const program: WorkoutProgram = {
      title: 'Il mio programma',
      notes: [],
      phases: [
        {
          id: 'mio',
          name: 'Il mio programma',
          fromWeek: 1,
          rotation: ['A', 'B'],
          templates: [
            { id: 'A', name: 'Spinta', exercises: [{ exercise: 'Barbell_Squat', sets: 5, reps: '5', rest: [180, 180] }] },
            { id: 'B', name: 'Trazione', exercises: [{ exercise: 'Hammer_Curls', sets: 3, reps: '10-12' }] },
          ],
        },
      ],
    };
    const lookup = (id: string) => toInfo(entry(id));
    const input = { startDate: '2026-11-16', gymDays: [0, 3] as (0 | 3)[] };
    const mon = plannedSession('2026-11-16', input, program, lookup)!;
    const thu = plannedSession('2026-11-19', input, program, lookup)!;
    expect(mon.template.name).toBe('Spinta');
    expect(mon.exercises[0]).toMatchObject({ sets: 5, reps: '5', rest: [180, 180] });
    expect(mon.exercises[0].info.name).toBe('Barbell Squat');
    expect(thu.template.name).toBe('Trazione');
  });
});
