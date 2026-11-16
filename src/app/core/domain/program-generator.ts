import type { ProgramExercise, RestRange, WorkoutProgram, WorkoutTemplate } from '../models/workout';

/**
 * Scheda automatica: in base a obiettivo, giorni a settimana e livello compone le sedute
 * con gli esercizi curati (nomi italiani, immagini offline). È un punto di partenza:
 * l'utente può poi cambiare tutto.
 */

export type Goal = 'massa' | 'definizione' | 'forza' | 'riattivazione' | 'tonificazione';
export type Level = 'principiante' | 'intermedio' | 'esperto';

export const GOALS: { id: Goal; label: string; hint: string }[] = [
  { id: 'massa', label: 'Massa', hint: 'Aumentare i muscoli: carichi medi, 6-10 ripetizioni' },
  { id: 'definizione', label: 'Definizione', hint: 'Mantenere i muscoli mentre perdi grasso: più ripetizioni, recuperi brevi' },
  { id: 'forza', label: 'Forza', hint: 'Diventare più forte sui fondamentali: poche ripetizioni, carichi alti' },
  { id: 'riattivazione', label: 'Riattivazione', hint: 'Ripartire dopo una pausa: poco volume, macchine, tecnica' },
  { id: 'tonificazione', label: 'Tonificazione', hint: 'Stare in forma: tutto il corpo, ripetizioni medio-alte' },
];

export const LEVELS: { id: Level; label: string }[] = [
  { id: 'principiante', label: 'Principiante' },
  { id: 'intermedio', label: 'Intermedio' },
  { id: 'esperto', label: 'Esperto' },
];

export interface GeneratorInput {
  goal: Goal;
  days: number;
  level: Level;
}

type Slot =
  | 'quad' | 'quad2' | 'hinge' | 'hamIso' | 'chest' | 'chest2' | 'chestIso' | 'pullV' | 'pullV2' | 'pullH'
  | 'shoulder' | 'lateral' | 'bi' | 'bi2' | 'tri' | 'tri2' | 'calves' | 'abs';

/** Esercizi per ruolo, dal più adatto a un principiante al più impegnativo. */
const POOLS: Record<Slot, Record<Level, string[]>> = {
  quad: { principiante: ['leg-press'], intermedio: ['squat', 'leg-press'], esperto: ['squat', 'hack-squat'] },
  quad2: { principiante: ['hack-squat'], intermedio: ['hack-squat', 'leg-press'], esperto: ['leg-press', 'hack-squat'] },
  hinge: { principiante: ['leg-curl'], intermedio: ['stacco-rumeno'], esperto: ['stacco-rumeno'] },
  hamIso: { principiante: ['leg-curl'], intermedio: ['leg-curl'], esperto: ['leg-curl'] },
  chest: { principiante: ['chest-press', 'panca-manubri'], intermedio: ['panca-piana', 'panca-manubri'], esperto: ['panca-piana', 'panca-manubri'] },
  chest2: { principiante: ['panca-manubri', 'chest-press'], intermedio: ['panca-inclinata-manubri'], esperto: ['panca-inclinata-manubri', 'dip'] },
  chestIso: { principiante: ['croci-cavi'], intermedio: ['croci-cavi'], esperto: ['dip', 'croci-cavi'] },
  pullV: { principiante: ['lat-machine', 'trazioni-assistite'], intermedio: ['lat-machine', 'trazioni'], esperto: ['trazioni', 'lat-machine'] },
  pullV2: { principiante: ['trazioni-assistite', 'lat-machine'], intermedio: ['trazioni-assistite', 'lat-machine'], esperto: ['lat-machine', 'trazioni'] },
  pullH: { principiante: ['pulley-basso'], intermedio: ['rematore', 'pulley-basso'], esperto: ['rematore', 'pulley-basso'] },
  shoulder: { principiante: ['shoulder-press'], intermedio: ['military-manubri', 'shoulder-press'], esperto: ['military-manubri', 'shoulder-press'] },
  lateral: { principiante: ['alzate-laterali'], intermedio: ['alzate-laterali'], esperto: ['alzate-laterali'] },
  bi: { principiante: ['curl-manubri'], intermedio: ['curl-manubri', 'curl-martello'], esperto: ['curl-manubri', 'curl-martello'] },
  bi2: { principiante: ['curl-martello'], intermedio: ['curl-martello'], esperto: ['curl-martello'] },
  tri: { principiante: ['pushdown'], intermedio: ['pushdown', 'french-press'], esperto: ['french-press', 'pushdown'] },
  tri2: { principiante: ['french-press'], intermedio: ['french-press'], esperto: ['pushdown'] },
  calves: { principiante: ['polpacci'], intermedio: ['polpacci'], esperto: ['polpacci'] },
  abs: { principiante: ['crunch-cavi'], intermedio: ['crunch-cavi'], esperto: ['crunch-cavi'] },
};

const ISOLATION = new Set<Slot>(['hamIso', 'chestIso', 'lateral', 'bi', 'bi2', 'tri', 'tri2', 'calves', 'abs']);

const SPLITS: Record<string, { name: string; slots: Slot[] }[]> = {
  full: [
    { name: 'Total body A', slots: ['quad', 'chest', 'pullV', 'shoulder', 'hamIso', 'abs'] },
    { name: 'Total body B', slots: ['hinge', 'chest2', 'pullH', 'lateral', 'bi', 'tri'] },
    { name: 'Total body C', slots: ['quad2', 'chest', 'pullV2', 'lateral', 'calves', 'abs'] },
  ],
  upperLower: [
    { name: 'Parte alta A', slots: ['chest', 'pullH', 'shoulder', 'pullV', 'bi', 'tri'] },
    { name: 'Gambe A', slots: ['quad', 'hinge', 'hamIso', 'calves', 'abs'] },
    { name: 'Parte alta B', slots: ['chest2', 'pullV2', 'lateral', 'pullH', 'tri2', 'bi2'] },
    { name: 'Gambe B', slots: ['quad2', 'hamIso', 'hinge', 'calves', 'abs'] },
  ],
  ppl: [
    { name: 'Spinta', slots: ['chest', 'chest2', 'shoulder', 'lateral', 'tri', 'chestIso'] },
    { name: 'Tirata', slots: ['pullV', 'pullH', 'pullV2', 'bi', 'bi2'] },
    { name: 'Gambe', slots: ['quad', 'hinge', 'quad2', 'hamIso', 'calves', 'abs'] },
    { name: 'Parte alta', slots: ['chest', 'pullH', 'shoulder', 'pullV', 'bi', 'tri'] },
    { name: 'Parte bassa', slots: ['quad2', 'hinge', 'hamIso', 'calves', 'abs'] },
  ],
};

interface Params {
  sets: number;
  reps: string;
  rest: RestRange;
}

const PARAMS: Record<Goal, { compound: Params; isolation: Params; max: number }> = {
  massa: { compound: { sets: 4, reps: '6-10', rest: [120, 150] }, isolation: { sets: 3, reps: '10-12', rest: [75, 90] }, max: 6 },
  definizione: { compound: { sets: 3, reps: '10-12', rest: [75, 90] }, isolation: { sets: 3, reps: '12-15', rest: [45, 60] }, max: 6 },
  forza: { compound: { sets: 5, reps: '4-6', rest: [180, 240] }, isolation: { sets: 3, reps: '8-10', rest: [90, 120] }, max: 5 },
  riattivazione: { compound: { sets: 2, reps: '12-15', rest: [75, 90] }, isolation: { sets: 2, reps: '12-15', rest: [60, 75] }, max: 5 },
  tonificazione: { compound: { sets: 3, reps: '12-15', rest: [60, 75] }, isolation: { sets: 3, reps: '12-15', rest: [45, 60] }, max: 6 },
};

function splitFor({ goal, days, level }: GeneratorInput): { name: string; slots: Slot[] }[] {
  const d = Math.min(6, Math.max(1, Math.round(days)));
  if (goal === 'riattivazione' || goal === 'tonificazione' || d <= 2 || (d === 3 && level === 'principiante')) {
    return SPLITS['full'].slice(0, Math.min(3, d));
  }
  if (d === 3) return SPLITS['ppl'].slice(0, 3);
  if (d === 4) return SPLITS['upperLower'];
  return SPLITS['ppl'].slice(0, Math.min(5, d));
}

export function generateProgram(input: GeneratorInput): WorkoutProgram {
  const level: Level = input.goal === 'riattivazione' ? 'principiante' : input.level;
  const p = PARAMS[input.goal];
  const templates: WorkoutTemplate[] = splitFor(input).map((t, ti) => {
    const used = new Set<string>();
    const exercises: ProgramExercise[] = [];
    for (const slot of t.slots) {
      if (exercises.length >= p.max) break;
      const pool = POOLS[slot][level];
      const id = pool.find((x) => !used.has(x));
      if (!id) continue;
      used.add(id);
      const par = ISOLATION.has(slot) ? p.isolation : p.compound;
      const sets = level === 'principiante' && input.goal !== 'riattivazione' ? Math.max(2, par.sets - 1) : par.sets;
      const alternatives = pool.filter((x) => x !== id);
      exercises.push({ exercise: id, sets, reps: par.reps, rest: par.rest, ...(alternatives.length ? { alternatives } : {}) });
    }
    return { id: String.fromCharCode(65 + ti), name: t.name, exercises };
  });
  const goal = GOALS.find((g) => g.id === input.goal)!;
  return {
    title: `Scheda ${goal.label.toLowerCase()}`,
    notes: [goal.hint],
    phases: [{ id: 'mio', name: goal.label, fromWeek: 1, rotation: templates.map((t) => t.id), templates }],
  };
}
