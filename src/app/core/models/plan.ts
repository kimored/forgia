/**
 * Documento di piano alimentare: lo prepara il nutrizionista/dietologo, l'app lo carica.
 * Tutto ciò che è specifico di un piano (pasti, grammature, regole, consigli) sta qui,
 * non nel codice. Formato JSON importabile/esportabile ("forgia-plan").
 */

/** 0 = lunedì … 6 = domenica. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type CycleWeek = number;

/** Id di uno slot del piano ("colazione", "meta-mattina", "arco"…). */
export type MealSlot = string;

export type FoodTag =
  | 'legume'
  | 'cavolo'
  | 'carne-rossa'
  | 'pesce'
  | 'uova'
  | 'affettato'
  | 'salsiccia'
  | 'brodo'
  | 'latticini'
  | 'verdura'
  | 'frutta'
  | 'cereali';

export const FOOD_TAG_LABELS: Record<FoodTag, string> = {
  legume: 'Legumi',
  cavolo: 'Cavoli / verza',
  'carne-rossa': 'Carne rossa',
  pesce: 'Pesce',
  uova: 'Uova (piatto principale)',
  affettato: 'Affettati',
  salsiccia: 'Salsiccia',
  brodo: 'Brodo',
  latticini: 'Latticini',
  verdura: 'Verdura',
  frutta: 'Frutta',
  cereali: 'Pasta, riso, pane',
};

export type Unit = 'g' | 'ml' | 'pz';

export interface ProductFormat {
  id: string;
  label: string;
  /** Quantità della confezione nell'unità del cibo. */
  qty: number;
  price: number | null;
}

export interface Food {
  id: string;
  name: string;
  unit: Unit;
  tags?: FoodTag[];
  /** Misure casalinghe → quantità nell'unità del cibo (es. { bicchiere: 200 }). */
  household?: Record<string, number>;
  /** Info d'acquisto suggerite dal piano (marca, confezioni, prezzo); l'utente le può cambiare. */
  brand?: string;
  formats?: ProductFormat[];
  /** Parole chiave per riconoscerlo negli scontrini. */
  aliases?: string[];
  /** Non si conta in dispensa (acqua, brodo fatto in casa, sale…). */
  untracked?: boolean;
  /** Prodotto di base (olio, pasta, riso…): di default non si segue in dispensa. */
  staple?: boolean;
}

export interface Portion {
  food: string;
  /** Quantità nell'unità del cibo; 0 = "quanto basta". */
  qty: number;
  /** Misura come scritta nel piano ("1 bicchiere", "3 cucchiai"), se diversa dai grammi. */
  measure?: string;
  note?: string;
}

export interface MealOption {
  id: string;
  slots: MealSlot[];
  title: string;
  portions: Portion[];
  tags?: FoodTag[];
  notes?: string[];
  /** Sostituzione extra (non presente nel calendario del piano). */
  extra?: boolean;
}

export interface SlotDef {
  id: MealSlot;
  label: string;
  /** Orario di default, "HH:mm" (l'utente lo cambia nel profilo). */
  time?: string;
  emoji?: string;
  /** Categoria di colore. */
  color?: 'colazione' | 'spuntino' | 'pranzo' | 'cena' | 'post' | 'arco';
  /** Solo nei giorni di palestra (es. post-allenamento). */
  gymOnly?: boolean;
  /** Dose giornaliera da distribuire (es. "Arco della giornata": pane, olio). */
  allowance?: boolean;
  /** Per la lista spesa divisa: 'other' = la parte di chi cucina per te. */
  owner?: 'mine' | 'other';
}

export const FREE_MEAL = 'libero' as const;

/** Un giorno del calendario del piano: slot → id del pasto, o "libero". */
export interface PlanDay {
  meals: Record<MealSlot, string>;
  /** Alternative suggerite dal piano per uno slot ("(o spaghetti con lupini)"). */
  alternatives?: Record<MealSlot, string[]>;
}

export type Schedule =
  /** Ciclo di N settimane (N = 1 per una settimana tipo), ogni settimana 7 giorni da lunedì. */
  | { type: 'cycle'; weeks: PlanDay[][] }
  /** Giorno tipo uguale tutti i giorni (le alternative sono le varianti). */
  | { type: 'template'; day: PlanDay };

/** Regole del piano: il professionista le ha scritte, l'app le controlla. */
export type PlanRule =
  | { type: 'no-consecutive'; tag: FoodTag; text?: string }
  | { type: 'max-per-week'; tag: FoodTag; max: number }
  | { type: 'min-per-week'; tag: FoodTag; min: number }
  | { type: 'min-gap-days'; tag: FoodTag; days: number }
  /** Se nei pasti indicati c'è un cibo con `tag`, nello slot si usa `option` al posto del previsto. */
  | { type: 'swap-if-tag'; slot: MealSlot; tag: FoodTag; inSlots: MealSlot[]; option: string; text?: string }
  /** Nei giorni di palestra: un cibo dello slot passa a `qty` e certi cibi vengono tolti. */
  | { type: 'gym-day-portion'; slot: MealSlot; food: string; qty: number; restQty?: number; remove?: string[]; text?: string }
  /** Opzione del giorno (es. "Sushi a pranzo" il sabato): rende liberi alcuni slot e mette a dieta altri. */
  | { type: 'day-swap'; id: string; label: string; weekday: Weekday; free: MealSlot[]; diet: Record<MealSlot, string> }
  /** Opzione del giorno (es. "Cardio extra"): aggiunge quantità a un cibo di uno slot. */
  | { type: 'day-extra'; id: string; label: string; slot: MealSlot; foods: string[]; add: number; restDaysOnly?: boolean }
  /** Promemoria quando il peso non cambia nel senso previsto per N settimane. */
  | { type: 'weight-stall'; weeks: number; direction: 'up' | 'down'; text: string };

/** Abitudini giornaliere con spunta (integratori…). */
export interface PlanHabit {
  id: string;
  label: string;
  food?: string;
  qty?: number;
  hint?: string;
  hintGym?: string;
  /** Nei giorni di palestra è già in un pasto (non si scala due volte). */
  includedOnGymDays?: boolean;
}

export interface PlanTip {
  text: string;
  weekday?: Weekday;
  gym?: boolean;
}

export interface PlanMeta {
  title: string;
  author?: string;
  date?: string;
  notes?: string;
  kcal?: number;
  proteinG?: number;
  /** Proiezioni del peso previste dal piano: variazione in kg per mese dall'inizio. */
  projections?: { label: string; points: [month: number, deltaKg: number][] }[];
  /** Frutta di stagione suggerita. */
  seasons?: { name: string; months: number[]; fruits: string[] }[];
  /** Piano di esempio fornito con l'app. */
  example?: boolean;
}

export interface PlanDocument {
  format: 'forgia-plan';
  version: 1;
  meta: PlanMeta;
  slots: SlotDef[];
  foods: Food[];
  meals: MealOption[];
  schedule: Schedule;
  rules?: PlanRule[];
  habits?: PlanHabit[];
  tips?: PlanTip[];
}
