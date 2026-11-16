import { FOOD_TAG_LABELS, type FoodTag, type MealOption, type MealSlot, type PlanRule } from '../models/plan';
import type { Catalog } from './catalog';
import { addDays, weekDates, type IsoDate } from './dates';
import type { ResolvedDay } from './day-plan';

/**
 * Validazioni delle varianti secondo le regole SCRITTE NEL PIANO (nessuna regola inventata
 * dall'app): un piano senza regole non produce avvisi.
 */

export interface RuleWarning {
  level: 'warn' | 'info';
  text: string;
}

export interface Variant {
  option: MealOption;
  group: 'previsto' | 'piano' | 'settimana' | 'altre' | 'extra';
  warnings: RuleWarning[];
}

/** Restituisce il giorno risolto (con le sostituzioni registrate) di una data qualsiasi. */
export type DayResolver = (date: IsoDate) => ResolvedDay;

type Rule<T extends PlanRule['type']> = Extract<PlanRule, { type: T }>;
const ORDINAL = ['1ª', '2ª', '3ª', '4ª', '5ª', '6ª', '7ª', '8ª', '9ª', '10ª'];
const ordinal = (n: number) => ORDINAL[n - 1] ?? `${n}ª`;
const warn = (text: string): RuleWarning => ({ level: 'warn', text });
const info = (text: string): RuleWarning => ({ level: 'info', text });

function rulesOf<T extends PlanRule['type']>(catalog: Catalog, type: T): Rule<T>[] {
  return catalog.rules.filter((r): r is Rule<T> => r.type === type);
}

/** Pasti di un giorno che contano per le regole (non le dosi "arco della giornata"). */
function dayMeals(catalog: Catalog, day: ResolvedDay, exclude?: { date: IsoDate; slot: MealSlot }) {
  return day.meals
    .filter((m) => !catalog.slot(m.slot)?.allowance)
    .filter((m) => !(exclude && exclude.date === day.date && exclude.slot === m.slot))
    .map((m) => m.option)
    .filter((o): o is MealOption => !!o);
}

function countInWeek(catalog: Catalog, resolve: DayResolver, date: IsoDate, slot: MealSlot, tag: FoodTag): number {
  return weekDates(date)
    .flatMap((d) => dayMeals(catalog, resolve(d), { date, slot }))
    .filter((o) => catalog.hasTag(o, tag)).length;
}

/** Etichetta breve del tag ("Uova (piatto principale)" → "Uova"). */
const label = (tag: FoodTag) => FOOD_TAG_LABELS[tag].replace(/ \(.*\)$/, '');
const slotName = (catalog: Catalog, slot: MealSlot) => (catalog.slot(slot)?.label ?? slot).toLowerCase();

export function warningsFor(
  catalog: Catalog,
  resolve: DayResolver,
  date: IsoDate,
  slot: MealSlot,
  candidate: MealOption,
): RuleWarning[] {
  const out: RuleWarning[] = [];
  const has = (tag: FoodTag) => catalog.hasTag(candidate, tag);
  const day = resolve(date);
  const current = day.meals.find((m) => m.slot === slot);
  const isPlanned = current?.planned?.id === candidate.id;
  const sameDay = (tag: FoodTag) => dayMeals(catalog, day, { date, slot }).some((o) => catalog.hasTag(o, tag));
  const dayHas = (d: IsoDate, tag: FoodTag) => dayMeals(catalog, resolve(d)).some((o) => catalog.hasTag(o, tag));

  for (const r of rulesOf(catalog, 'no-consecutive')) {
    if (!has(r.tag)) continue;
    if (sameDay(r.tag)) out.push(warn(`${label(r.tag)} già in un altro pasto di oggi`));
    if (dayHas(addDays(date, -1), r.tag)) out.push(warn(`${label(r.tag)} anche ieri`));
    if (dayHas(addDays(date, 1), r.tag)) out.push(warn(`${label(r.tag)} anche domani`));
  }

  for (const r of rulesOf(catalog, 'max-per-week')) {
    if (!has(r.tag)) continue;
    const n = countInWeek(catalog, resolve, date, slot, r.tag);
    if (n >= r.max) out.push(warn(`${label(r.tag)}: ${ordinal(n + 1)} volta questa settimana (max ${r.max})`));
  }

  for (const r of rulesOf(catalog, 'min-per-week')) {
    if (has(r.tag) || !catalog.hasTag(current?.option, r.tag)) continue;
    if (countInWeek(catalog, resolve, date, slot, r.tag) < r.min) {
      out.push(warn(`${label(r.tag)} sotto le ${r.min} volte questa settimana`));
    }
  }

  for (const r of rulesOf(catalog, 'min-gap-days')) {
    // Solo sulle sostituzioni: il calendario del piano è già stato pensato dal professionista.
    if (!has(r.tag) || isPlanned) continue;
    const recent = Array.from({ length: r.days - 1 }, (_, i) => addDays(date, -(i + 1))).some((d) => dayHas(d, r.tag));
    if (recent || sameDay(r.tag)) out.push(warn(`${label(r.tag)} già negli ultimi ${r.days} giorni`));
  }

  for (const r of rulesOf(catalog, 'swap-if-tag')) {
    const inSlotsWithTag = r.inSlots.filter((s) => s !== slot && catalog.hasTag(day.meals.find((m) => m.slot === s)?.option, r.tag));
    if (slot === r.slot && has(r.tag) && inSlotsWithTag.length) {
      out.push(warn(`${label(r.tag)} già a ${slotName(catalog, inSlotsWithTag[0])}${r.text ? `: ${r.text}` : ''}`));
    }
    if (r.inSlots.includes(slot) && has(r.tag)) {
      const target = day.meals.find((m) => m.slot === r.slot);
      if (target?.log?.status === 'done' && catalog.hasTag(target.option, r.tag)) {
        out.push(warn(`${label(r.tag)} già a ${slotName(catalog, r.slot)}`));
      } else if (r.text) {
        out.push(info(`${catalog.slot(r.slot)?.label ?? r.slot}: ${r.text}`));
      }
    }
  }

  for (const r of rulesOf(catalog, 'gym-day-portion')) {
    if (slot === r.slot && day.gym && r.text && candidate.portions.some((p) => r.remove?.includes(p.food))) {
      out.push(info(r.text));
    }
  }

  return out;
}

/**
 * Tutte le varianti per uno slot: prevista oggi, alternative del piano, pasti della stessa
 * settimana del ciclo, tutte le altre, sostituzioni extra.
 */
export function variantsFor(catalog: Catalog, resolve: DayResolver, date: IsoDate, slot: MealSlot): Variant[] {
  const day = resolve(date);
  const planned = day.meals.find((m) => m.slot === slot)?.planned ?? null;
  const planAlt = new Set(catalog.planDay(day.week, day.weekday).alternatives?.[slot] ?? []);
  const thisWeek = catalog.scheduledIds(slot, catalog.cycleLength > 1 ? day.week : undefined);

  const order: Variant['group'][] = ['previsto', 'piano', 'settimana', 'altre', 'extra'];
  const countWarn = (v: Variant) => v.warnings.filter((w) => w.level === 'warn').length;
  return catalog
    .mealsForSlot(slot)
    .map<Variant>((option) => ({
      option,
      group:
        option.id === planned?.id
          ? 'previsto'
          : planAlt.has(option.id)
            ? 'piano'
            : option.extra
              ? 'extra'
              : thisWeek.has(option.id)
                ? 'settimana'
                : 'altre',
      warnings: warningsFor(catalog, resolve, date, slot, option),
    }))
    .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || countWarn(a) - countWarn(b));
}

export interface WeekCount {
  tag: FoodTag;
  label: string;
  count: number;
  min?: number;
  max?: number;
  ok: boolean;
}

/** Conteggi settimanali per i tag che il piano limita (min/max). */
export function weekSummary(catalog: Catalog, resolve: DayResolver, date: IsoDate): WeekCount[] {
  const meals = weekDates(date).flatMap((d) => dayMeals(catalog, resolve(d)));
  const count = (tag: FoodTag) => meals.filter((o) => catalog.hasTag(o, tag)).length;
  const out = new Map<FoodTag, WeekCount>();
  for (const r of rulesOf(catalog, 'min-per-week')) {
    const c = count(r.tag);
    out.set(r.tag, { tag: r.tag, label: label(r.tag), count: c, min: r.min, ok: c >= r.min });
  }
  for (const r of rulesOf(catalog, 'max-per-week')) {
    const c = count(r.tag);
    const prev = out.get(r.tag);
    out.set(r.tag, { tag: r.tag, label: label(r.tag), count: c, min: prev?.min, max: r.max, ok: (prev?.ok ?? true) && c <= r.max });
  }
  return [...out.values()];
}

const DAY_SHORT = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];

/** Violazioni delle regole settimanali sul piano effettivo (con le sostituzioni). */
export function weekWarnings(catalog: Catalog, resolve: DayResolver, date: IsoDate): RuleWarning[] {
  const out: RuleWarning[] = [];
  for (const c of weekSummary(catalog, resolve, date)) {
    if (c.min !== undefined && c.count < c.min) out.push(warn(`${c.label} ${c.count} ${c.count === 1 ? 'volta' : 'volte'} su almeno ${c.min}`));
    if (c.max !== undefined && c.count > c.max) out.push(warn(`${c.label} ${c.count} volte su massimo ${c.max}`));
  }
  const dates = [addDays(weekDates(date)[0], -1), ...weekDates(date)];
  for (const r of rulesOf(catalog, 'no-consecutive')) {
    const flags = dates.map((d) => dayMeals(catalog, resolve(d)).some((o) => catalog.hasTag(o, r.tag)));
    for (let i = 1; i < dates.length; i++) {
      if (flags[i - 1] && flags[i]) {
        const a = i - 1 === 0 ? 'dom' : DAY_SHORT[i - 2];
        out.push(warn(`${label(r.tag)} due giorni di fila (${a} e ${DAY_SHORT[i - 1]})`));
      }
    }
  }
  return out;
}
