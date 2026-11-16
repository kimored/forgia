import { FREE_MEAL, type CycleWeek, type MealOption, type MealSlot, type PlanRule, type Portion, type Weekday } from '../models/plan';
import type { DayOptions, MealLog } from '../models/logs';
import type { Profile } from '../models/profile';
import type { Catalog } from './catalog';
import { cyclePosition } from './cycle';
import type { IsoDate } from './dates';

export type DayProfile = Pick<Profile, 'startDate' | 'gymDays' | 'weekOrder'> & { times: Record<string, string> };

export interface ResolvedMeal {
  slot: MealSlot;
  time: string;
  /** Pasto previsto dal piano (null = libero). */
  planned: MealOption | null;
  /** Pasto effettivo: il previsto, o la sostituzione registrata nel log (null = libero). */
  option: MealOption | null;
  free: boolean;
  /** Grammature finali, già adattate al giorno dalle regole del piano. */
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

type Rule<T extends PlanRule['type']> = Extract<PlanRule, { type: T }>;
const rulesOf = <T extends PlanRule['type']>(catalog: Catalog, type: T) =>
  catalog.rules.filter((r): r is Rule<T> => r.type === type);

/** Opzioni del giorno attive (es. swap sushi, cardio extra), valide per quel giorno. */
export function activeToggles(catalog: Catalog, options: DayOptions | undefined, weekday: Weekday, gym: boolean) {
  const on = options?.toggles ?? {};
  return {
    swaps: rulesOf(catalog, 'day-swap').filter((r) => on[r.id] && r.weekday === weekday),
    extras: rulesOf(catalog, 'day-extra').filter((r) => on[r.id] && !(r.restDaysOnly && gym)),
  };
}

/** Calcola il menu completo di una data: piano + opzioni del giorno + sostituzioni registrate. */
export function resolveDay(catalog: Catalog, input: DayInput): ResolvedDay {
  const pos = cyclePosition(input.date, input.profile.startDate, catalog.cycleLength);
  const { weekday, programWeek } = pos;
  const week = planWeek(pos.week, input.profile.weekOrder, catalog.cycleLength);
  const gym = input.profile.gymDays.includes(weekday);
  const options = input.options ?? { date: input.date };
  const logBySlot = new Map((input.logs ?? []).map((l) => [l.slot, l]));
  const planDay = catalog.planDay(week, weekday);
  const { swaps, extras } = activeToggles(catalog, options, weekday, gym);

  const plannedId = (slot: MealSlot): string | null | undefined => {
    for (const s of swaps) {
      if (s.free.includes(slot)) return null;
      if (s.diet[slot]) return s.diet[slot];
    }
    const id = planDay.meals[slot];
    return id === FREE_MEAL ? null : id;
  };

  const build = (slot: MealSlot, plannedOverride?: string): ResolvedMeal => {
    const id = plannedOverride ?? plannedId(slot);
    const planned = id && catalog.meals.has(id) ? catalog.meal(id) : null;
    // Una sostituzione registrata con un piano precedente (pasto non più esistente) si ignora.
    const logged = logBySlot.get(slot)?.optionId;
    const option = logged && catalog.meals.has(logged) ? catalog.meal(logged) : planned;
    const meal: ResolvedMeal = {
      slot,
      time: input.profile.times[slot] ?? catalog.slot(slot)?.time ?? '12:00',
      planned,
      option,
      free: option === null,
      portions: option ? option.portions.map((p) => ({ ...p })) : [],
      notes: [...(option?.notes ?? [])],
      log: logBySlot.get(slot),
    };
    adjust(meal, gym, catalog, extras);
    return meal;
  };

  const swapRules = rulesOf(catalog, 'swap-if-tag');
  const dependent = new Set(swapRules.map((r) => r.slot));
  const bySlot = new Map<MealSlot, ResolvedMeal>();

  // Prima gli slot indipendenti, poi quelli che dipendono da altri (regola "swap-if-tag").
  const active = catalog.slots.filter((s) => (!s.gymOnly || gym) && plannedId(s.id) !== undefined);
  for (const s of active) if (!dependent.has(s.id)) bySlot.set(s.id, build(s.id));
  for (const s of active) {
    if (!dependent.has(s.id)) continue;
    const rule = swapRules.find((r) => r.slot === s.id && r.inSlots.some((x) => catalog.hasTag(bySlot.get(x)?.option, r.tag)));
    bySlot.set(s.id, build(s.id, rule?.option));
  }

  return {
    date: input.date,
    week,
    weekday,
    programWeek,
    gym,
    options,
    meals: active.map((s) => bySlot.get(s.id)!),
  };
}

/** Adatta le grammature al tipo di giornata, secondo le regole del piano. */
function adjust(meal: ResolvedMeal, gym: boolean, catalog: Catalog, extras: Rule<'day-extra'>[]): void {
  if (!meal.option) return;

  for (const r of rulesOf(catalog, 'gym-day-portion').filter((x) => x.slot === meal.slot)) {
    if (gym) {
      const removed = meal.portions.some((p) => r.remove?.includes(p.food));
      meal.portions = meal.portions.filter((p) => !r.remove?.includes(p.food));
      const target = meal.portions.find((p) => p.food === r.food);
      if (target) target.qty = r.qty;
      else if (removed) meal.portions.push({ food: r.food, qty: r.qty });
      if (removed && r.text) meal.notes.push(`${r.text}.`);
    } else if (r.restQty !== undefined) {
      const target = meal.portions.find((p) => p.food === r.food);
      if (target) target.qty = r.restQty;
    }
  }

  for (const r of extras.filter((x) => x.slot === meal.slot)) {
    const target = meal.portions.find((p) => r.foods.includes(p.food));
    if (target) {
      target.qty += r.add;
      meal.notes.push(`${r.label.replace(/^\P{L}+/u, '')}: +${r.add} g di ${catalog.food(target.food).name.toLowerCase()}.`);
    }
  }
}

/** Settimana del piano da usare nella posizione `pos` del ciclo, secondo l'ordine scelto. */
export function planWeek(pos: CycleWeek, order: readonly number[] | undefined, cycleLength: number): CycleWeek {
  const w = order?.[pos - 1];
  return w && w >= 1 && w <= cycleLength ? w : pos;
}
