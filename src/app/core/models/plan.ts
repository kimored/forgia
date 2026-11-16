/** Modelli del piano alimentare (dati statici in src/assets/data, versionati nel repo). */

/** 0 = lunedì … 6 = domenica. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type CycleWeek = 1 | 2 | 3 | 4;

export type MealSlot = 'colazione' | 'spuntino1' | 'pranzo' | 'spuntino2' | 'cena' | 'post';
export const MEAL_SLOTS: readonly MealSlot[] = ['colazione', 'spuntino1', 'pranzo', 'spuntino2', 'cena', 'post'];

/** Pasti "della nonna" (pranzo e cena) vs "la mia parte": serve a dispensa e lista spesa. */
export const NONNA_SLOTS: readonly MealSlot[] = ['pranzo', 'cena'];

export type FoodTag =
  | 'legume' // regola 1: mai due giorni di fila
  | 'cavolo' // regola 2: max 1 a settimana
  | 'carne-rossa' // regola 3: max 2 a settimana
  | 'pesce' // regola 4: almeno 2 a settimana
  | 'uova' // regola 5: uova come ingrediente principale
  | 'affettato'
  | 'salsiccia' // regola 7: max 1 ogni 2 settimane
  | 'brodo';

export type Unit = 'g' | 'ml' | 'pz';

export interface Food {
  id: string;
  name: string;
  unit: Unit;
  tags?: FoodTag[];
}

export interface Portion {
  food: string; // Food.id
  qty: number;
  /** Testo libero mostrato accanto alla grammatura (es. "sgocciolato", "cotti"). */
  note?: string;
}

export interface MealOption {
  id: string;
  /** Slot in cui l'opzione è valida. */
  slots: MealSlot[];
  title: string;
  portions: Portion[];
  /** Tag aggiuntivi rispetto a quelli dei cibi (es. un piatto che conta come pesce). */
  tags?: FoodTag[];
  /** Note mostrate nel dettaglio (es. "oppure 30 g di pastina in brodo al posto del pane"). */
  notes?: string[];
  /** Sostituzione extra (non presente nel piano fisso delle 4 settimane). */
  extra?: boolean;
}

export const FREE_MEAL = 'libero' as const;
export type PlannedMeal = string | typeof FREE_MEAL;

/** Una riga del piano: un giorno della settimana del ciclo. */
export interface PlanDay {
  colazione: string;
  /** Lo spuntino 11:30 (uova / affettato) è calcolato dalla regola 5, non sta nel piano. */
  pranzo: PlannedMeal;
  /** Alternative suggerite nel piano, es. "(o spaghetti con lupini)". */
  pranzoAlt?: string[];
  spuntino2: string;
  cena: PlannedMeal;
}

export interface Plan {
  version: number;
  /** weeks[0] = settimana 1; ogni settimana ha 7 giorni da lunedì. */
  weeks: PlanDay[][];
  /** Cena da dieta di default quando il sabato si fa lo swap sushi. */
  sushiSwapDinner: string;
}

export interface Catalog {
  foods: Food[];
  meals: MealOption[];
}
