import { FREE_MEAL, type MealOption, type MealSlot, type Portion, type CycleWeek, type Weekday } from '../models/plan';
import type { DayOptions, MealLog } from '../models/logs';
import type { Profile } from '../models/profile';
import type { Catalog } from './catalog';
import { cyclePosition } from './cycle';
import type { IsoDate } from './dates';

export const GYM_DINNER_BREAD = 40;
export const DINNER_BREAD = 80;
export const CARDIO_EXTRA_PASTA = 30;
const SATURDAY: Weekday = 5;
const CARB_FOODS = ['pasta', 'riso', 'tagliolini', 'tortellini'];

export type DayProfile = Pick<Profile, 'startDate' | 'gymDays' | 'times'>;

export interface ResolvedMeal {
  slot: MealSlot;
  time: string;
  /** Pasto previsto dal piano (null = libero). */
  planned: MealOption | null;
  /** Pasto effettivo: il previsto, o la sostituzione registrata nel log (null = libero). */
  option: MealOption | null;
  free: boolean;
  /** Grammature finali, già adattate al giorno (pane a cena, cardio extra…). */
  portions: Portion[];
  notes: string[];
  log?: MealLog;
}

export interface ResolvedDay {
  date: IsoDate;
  week: CycleWeek;
  weekday: Weekday;
  programWeek: number;
  gym: boolean;
  options: DayOptions;
  meals: ResolvedMeal[];
}

export interface DayInput {
  date: IsoDate;
  profile: DayProfile;
  options?: DayOptions;
  /** Log dei pasti di questa data. */
  logs?: readonly MealLog[];
}

/** Id del pasto previsto dal piano per uno slot, già con lo swap sushi applicato. */
function plannedId(catalog: Catalog, slot: MealSlot, input: DayInput, week: CycleWeek, weekday: Weekday): string | null {
  const day = catalog.plan.weeks[week - 1][weekday];
  const sushi = weekday === SATURDAY && !!input.options?.sushiSwap;
  switch (slot) {
    case 'colazione':
      return day.colazione;
    case 'spuntino2':
      return day.spuntino2;
    case 'pranzo':
      return sushi || day.pranzo === FREE_MEAL ? null : day.pranzo;
    case 'cena':
      if (sushi) return catalog.plan.sushiSwapDinner;
      return day.cena === FREE_MEAL ? null : day.cena;
    case 'post':
      return 'post-shake';
    case 'spuntino1':
      return null; // calcolato dopo, dipende da pranzo e cena (regola 5)
  }
}

/** Calcola il menu completo di una data: piano + opzioni del giorno + sostituzioni registrate. */
export function resolveDay(catalog: Catalog, input: DayInput): ResolvedDay {
  const { week, weekday, programWeek } = cyclePosition(input.date, input.profile.startDate);
  const gym = input.profile.gymDays.includes(weekday);
  const options = input.options ?? { date: input.date };
  const logBySlot = new Map((input.logs ?? []).map((l) => [l.slot, l]));

  const effective = (slot: MealSlot, planned: MealOption | null): MealOption | null => {
    const id = logBySlot.get(slot)?.optionId;
    return id ? catalog.meal(id) : planned;
  };

  const build = (slot: MealSlot, planned: MealOption | null, option: MealOption | null): ResolvedMeal => {
    const meal: ResolvedMeal = {
      slot,
      time: input.profile.times[slot],
      planned,
      option,
      free: option === null,
      portions: option ? option.portions.map((p) => ({ ...p })) : [],
      notes: [...(option?.notes ?? [])],
      log: logBySlot.get(slot),
    };
    adjust(meal, gym, options, catalog);
    return meal;
  };

  const plannedOf = (slot: MealSlot) => {
    const id = plannedId(catalog, slot, input, week, weekday);
    return id ? catalog.meal(id) : null;
  };

  const pranzoPlanned = plannedOf('pranzo');
  const cenaPlanned = plannedOf('cena');
  const pranzo = build('pranzo', pranzoPlanned, effective('pranzo', pranzoPlanned));
  const cena = build('cena', cenaPlanned, effective('cena', cenaPlanned));

  // Regola 5: con uova a pranzo o a cena, nel panino delle 11:30 va l'affettato.
  const eggsElsewhere = catalog.hasTag(pranzo.option, 'uova') || catalog.hasTag(cena.option, 'uova');
  const sp1Planned = catalog.meal(eggsElsewhere ? 'sp1-affettato' : 'sp1-uova');

  const colPlanned = plannedOf('colazione');
  const sp2Planned = plannedOf('spuntino2');
  const meals: ResolvedMeal[] = [
    build('colazione', colPlanned, effective('colazione', colPlanned)),
    build('spuntino1', sp1Planned, effective('spuntino1', sp1Planned)),
    pranzo,
    build('spuntino2', sp2Planned, effective('spuntino2', sp2Planned)),
    cena,
  ];
  if (gym) {
    const post = plannedOf('post');
    meals.push(build('post', post, effective('post', post)));
  }

  return { date: input.date, week, weekday, programWeek, gym, options, meals };
}

/** Adatta le grammature al tipo di giornata (regola 6, cardio extra, creatina). */
function adjust(meal: ResolvedMeal, gym: boolean, options: DayOptions, catalog: Catalog): void {
  if (!meal.option) return;

  if (meal.slot === 'cena') {
    if (gym) {
      // Regola 6: metà carboidrati, 40 g di pane e niente patate.
      const hadPotatoes = meal.portions.some((p) => p.food === 'patate');
      meal.portions = meal.portions.filter((p) => p.food !== 'patate');
      const bread = meal.portions.find((p) => p.food === 'pane');
      if (bread) bread.qty = GYM_DINNER_BREAD;
      else if (hadPotatoes) meal.portions.push({ food: 'pane', qty: GYM_DINNER_BREAD });
      if (hadPotatoes) meal.notes.push('Giorno palestra: niente patate, 40 g di pane.');
    } else {
      const bread = meal.portions.find((p) => p.food === 'pane');
      if (bread) bread.qty = DINNER_BREAD;
    }
  }

  if (meal.slot === 'pranzo' && !gym && options.cardioExtra) {
    const carb = meal.portions.find((p) => CARB_FOODS.includes(p.food));
    if (carb) {
      carb.qty += CARDIO_EXTRA_PASTA;
      meal.notes.push(`Cardio extra: +${CARDIO_EXTRA_PASTA} g di ${catalog.food(carb.food).name.toLowerCase()}.`);
    }
  }

  if (meal.slot === 'spuntino2' && !gym) {
    meal.notes.push('Puoi mescolare qui i 5 g di creatina.');
  }
}
