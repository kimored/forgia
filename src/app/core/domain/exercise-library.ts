import type { ExerciseInfo } from '../models/workout';

/**
 * Catalogo completo di free-exercise-db (public/data/exercise-library.json, caricato solo
 * quando serve). Nomi e istruzioni sono in inglese nel database: muscoli, attrezzi e livelli
 * sono tradotti qui; i 23 esercizi del programma hanno anche nome e note in italiano.
 */

export interface LibraryEntry {
  id: string;
  name: string;
  primary: string[];
  secondary: string[];
  equipment: string | null;
  level: string;
  category: string;
  force: string | null;
  mechanic: string | null;
  instructions: string[];
  images: number;
}

export const MUSCLES_IT: Record<string, string> = {
  abdominals: 'Addominali',
  abductors: 'Abduttori',
  adductors: 'Adduttori',
  biceps: 'Bicipiti',
  calves: 'Polpacci',
  chest: 'Pettorali',
  forearms: 'Avambracci',
  glutes: 'Glutei',
  hamstrings: 'Femorali',
  lats: 'Dorsali',
  'lower back': 'Lombari',
  'middle back': 'Dorso centrale',
  neck: 'Collo',
  quadriceps: 'Quadricipiti',
  shoulders: 'Spalle',
  traps: 'Trapezi',
  triceps: 'Tricipiti',
};

export const EQUIPMENT_IT: Record<string, string> = {
  barbell: 'Bilanciere',
  dumbbell: 'Manubri',
  cable: 'Cavi',
  machine: 'Macchina',
  'body only': 'Corpo libero',
  kettlebells: 'Kettlebell',
  bands: 'Elastici',
  'medicine ball': 'Palla medica',
  'exercise ball': 'Fitball',
  'e-z curl bar': 'Bilanciere EZ',
  'foam roll': 'Foam roller',
  other: 'Altro',
};

export const LEVEL_IT: Record<string, string> = { beginner: 'Principiante', intermediate: 'Intermedio', expert: 'Esperto' };

export const CATEGORY_IT: Record<string, string> = {
  strength: 'Forza',
  stretching: 'Stretching',
  plyometrics: 'Pliometria',
  strongman: 'Strongman',
  powerlifting: 'Powerlifting',
  cardio: 'Cardio',
  'olympic weightlifting': 'Sollevamento olimpico',
};

const it = (map: Record<string, string>, k: string) => map[k] ?? k;

/** Incremento di carico tipico per attrezzo. */
function incrementFor(equipment: string | null): number {
  return equipment === 'dumbbell' || equipment === 'kettlebells' ? 1 : equipment === 'machine' ? 5 : 2.5;
}

/** Voce del catalogo → esercizio usabile nell'app (con il nome italiano se è uno dei nostri). */
export function toInfo(e: LibraryEntry, curated?: ExerciseInfo): ExerciseInfo {
  if (curated) return { ...curated, equipment: e.equipment ?? undefined, level: e.level, instructions: e.instructions };
  return {
    id: e.id,
    name: e.name,
    db: e.id,
    primary: e.primary.map((m) => it(MUSCLES_IT, m)),
    secondary: e.secondary.map((m) => it(MUSCLES_IT, m)),
    compound: e.mechanic === 'compound',
    increment: incrementFor(e.equipment),
    tips: [],
    equipment: e.equipment ?? undefined,
    level: e.level,
    instructions: e.instructions,
    images: Array.from({ length: e.images }, (_, i) => `exercise-lib/${e.id}/${i}.webp`),
    library: true,
  };
}

export interface LibraryFilter {
  text?: string;
  /** Muscolo principale (chiave inglese del database). */
  muscle?: string;
  equipment?: string;
  category?: string;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[_-]+/g, ' ');

/** Ricerca per nome (inglese o italiano), muscolo e attrezzo. */
export function filterLibrary(entries: LibraryEntry[], f: LibraryFilter, italianName: (id: string) => string | undefined): LibraryEntry[] {
  const words = norm(f.text ?? '')
    .split(/\s+/)
    .filter(Boolean);
  return entries.filter((e) => {
    if (f.muscle && !e.primary.includes(f.muscle)) return false;
    if (f.equipment && (e.equipment ?? 'other') !== f.equipment) return false;
    if (f.category && e.category !== f.category) return false;
    if (!words.length) return true;
    const hay = norm(
      [e.name, italianName(e.id) ?? '', ...e.primary.map((m) => it(MUSCLES_IT, m)), it(EQUIPMENT_IT, e.equipment ?? 'other'), ...e.primary].join(' '),
    );
    return words.every((w) => hay.includes(w));
  });
}

/**
 * Varianti di un esercizio: stessi muscoli principali e stesso tipo di movimento
 * (spinta/trazione, multi/monoarticolare). Prima quelle con lo stesso attrezzo e livello.
 */
export function variantsOf(target: LibraryEntry, entries: LibraryEntry[], limit = 12): LibraryEntry[] {
  const primary = new Set(target.primary);
  return entries
    .filter((e) => e.id !== target.id && e.category === target.category && e.primary.some((m) => primary.has(m)))
    .map((e) => {
      let score = 0;
      if (e.primary.length === target.primary.length && e.primary.every((m) => primary.has(m))) score += 3;
      if (e.force && e.force === target.force) score += 2;
      if (e.mechanic && e.mechanic === target.mechanic) score += 2;
      if (e.equipment === target.equipment) score += 1;
      if (e.level === target.level) score += 0.5;
      const sec = new Set(target.secondary);
      score += e.secondary.filter((m) => sec.has(m)).length * 0.25;
      return { e, score };
    })
    .filter((x) => x.score >= 4)
    .sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name))
    .slice(0, limit)
    .map((x) => x.e);
}
