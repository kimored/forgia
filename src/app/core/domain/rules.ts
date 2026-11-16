import type { FoodTag, MealOption, MealSlot } from '../models/plan';
import type { Catalog } from './catalog';
import { addDays, weekDates, type IsoDate } from './dates';
import type { ResolvedDay } from './day-plan';

/** Validazioni del piano (sezione 5.6) applicate alle varianti di un pasto. */

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

const MAIN: readonly MealSlot[] = ['pranzo', 'cena'];
const SALSICCIA_WINDOW_DAYS = 14;
const SLOT_LABEL: Record<MealSlot, string> = {
  colazione: 'a colazione',
  spuntino1: 'alle 11:30',
  pranzo: 'a pranzo',
  spuntino2: 'allo spuntino',
  cena: 'a cena',
  post: 'nello shake',
};
const ORDINAL = ['1ª', '2ª', '3ª', '4ª', '5ª', '6ª', '7ª'];

function optionAt(day: ResolvedDay, slot: MealSlot): MealOption | null {
  return day.meals.find((m) => m.slot === slot)?.option ?? null;
}

/** Pasti principali di un giorno, escluso eventualmente uno slot di quella data. */
function mainMeals(day: ResolvedDay, exclude?: { date: IsoDate; slot: MealSlot }): MealOption[] {
  return MAIN.filter((s) => !(exclude && exclude.date === day.date && exclude.slot === s))
    .map((s) => optionAt(day, s))
    .filter((o): o is MealOption => !!o);
}

function countInWeek(catalog: Catalog, resolve: DayResolver, date: IsoDate, slot: MealSlot, tag: FoodTag): number {
  return weekDates(date)
    .flatMap((d) => mainMeals(resolve(d), { date, slot }))
    .filter((o) => catalog.hasTag(o, tag)).length;
}

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
  const isPlanned = day.meals.find((m) => m.slot === slot)?.planned?.id === candidate.id;

  if (MAIN.includes(slot)) {
    const other = slot === 'pranzo' ? 'cena' : 'pranzo';

    // Regola 1: legumi mai due giorni di fila.
    if (has('legume')) {
      const legumeDay = (d: IsoDate) => mainMeals(resolve(d)).some((o) => catalog.hasTag(o, 'legume'));
      if (catalog.hasTag(optionAt(day, other), 'legume')) out.push(warn(`Legumi già ${SLOT_LABEL[other]} oggi`));
      if (legumeDay(addDays(date, -1))) out.push(warn('Legumi anche ieri'));
      if (legumeDay(addDays(date, 1))) out.push(warn('Legumi anche domani'));
    }

    // Regola 2: verza e cavolo al massimo una volta a settimana.
    if (has('cavolo') && countInWeek(catalog, resolve, date, slot, 'cavolo') >= 1) {
      out.push(warn('Verza o cavolo già questa settimana'));
    }

    // Regola 3: carne rossa al massimo 2 volte a settimana.
    if (has('carne-rossa')) {
      const n = countInWeek(catalog, resolve, date, slot, 'carne-rossa');
      if (n >= 2) out.push(warn(`${ORDINAL[n] ?? `${n + 1}ª`} carne rossa della settimana`));
    }

    // Regola 4: pesce almeno 2 volte a settimana.
    const current = optionAt(day, slot);
    if (!has('pesce') && catalog.hasTag(current, 'pesce') && countInWeek(catalog, resolve, date, slot, 'pesce') < 2) {
      out.push(warn('Pesce sotto le 2 volte questa settimana'));
    }

    // Regola 5 (verso il panino): uova come piatto principale con il panino alle uova già mangiato.
    const sp1 = day.meals.find((m) => m.slot === 'spuntino1');
    if (has('uova') && sp1?.log?.status === 'done' && catalog.hasTag(sp1.option, 'uova')) {
      out.push(warn('Uova già nel panino delle 11:30'));
    } else if (has('uova') && !catalog.hasTag(optionAt(day, other), 'uova')) {
      out.push(info("Nel panino delle 11:30 metti l'affettato"));
    }

    // Regola 7: salsicce al massimo una volta ogni 2 settimane (solo sulle sostituzioni).
    if (has('salsiccia') && !isPlanned) {
      const recent = Array.from({ length: SALSICCIA_WINDOW_DAYS - 1 }, (_, i) => addDays(date, -(i + 1))).some((d) =>
        mainMeals(resolve(d)).some((o) => catalog.hasTag(o, 'salsiccia')),
      );
      const sameDay = catalog.hasTag(optionAt(day, other), 'salsiccia');
      if (recent || sameDay) out.push(warn('Salsicce già nelle ultime 2 settimane'));
    }
  }

  if (slot === 'pranzo' && candidate.id === 'pr-brodo-tortellini') {
    const plannedLunch = day.meals.find((m) => m.slot === 'pranzo')?.planned;
    if (catalog.hasTag(plannedLunch, 'legume')) out.push(warn('Sconsigliato nei giorni con legumi'));
  }

  if (slot === 'cena') {
    // Regola 6: nei giorni di palestra niente patate a cena.
    if (day.gym && candidate.portions.some((p) => p.food === 'patate')) {
      out.push(info('Giorno palestra: al posto delle patate 40 g di pane'));
    }
    // Lesso: ideale lo stesso giorno del brodo o il giorno dopo.
    if (candidate.id.startsWith('ce-lesso')) {
      const brodo = [date, addDays(date, -1)].some((d) => catalog.hasTag(optionAt(resolve(d), 'pranzo'), 'brodo'));
      if (!brodo) out.push(info('Ideale lo stesso giorno del brodo o il giorno dopo'));
    }
  }

  // Regola 5 (dal panino): con uova a pranzo o a cena il panino va con l'affettato.
  if (slot === 'spuntino1' && has('uova')) {
    const where = MAIN.find((s) => catalog.hasTag(optionAt(day, s), 'uova'));
    if (where) out.push(warn(`Hai già uova ${SLOT_LABEL[where]}: nel panino metti l'affettato`));
  }

  return out;
}

/**
 * Tutte le varianti per uno slot, in ordine: prevista oggi, alternative del piano,
 * pasti della stessa settimana del ciclo (regola 11), tutte le altre, sostituzioni extra.
 */
export function variantsFor(catalog: Catalog, resolve: DayResolver, date: IsoDate, slot: MealSlot): Variant[] {
  const day = resolve(date);
  const planned = day.meals.find((m) => m.slot === slot)?.planned ?? null;
  const planDay = catalog.plan.weeks[day.week - 1][day.weekday];
  const planAlt = new Set(slot === 'pranzo' ? (planDay.pranzoAlt ?? []) : []);
  const thisWeek = new Set(
    catalog.plan.weeks[day.week - 1].flatMap((d) => (slot === 'pranzo' ? [d.pranzo] : slot === 'cena' ? [d.cena] : [])),
  );

  const order: Variant['group'][] = ['previsto', 'piano', 'settimana', 'altre', 'extra'];
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
    .sort((a, b) => {
      const g = order.indexOf(a.group) - order.indexOf(b.group);
      if (g) return g;
      return countWarn(a) - countWarn(b);
    });
}

const countWarn = (v: Variant) => v.warnings.filter((w) => w.level === 'warn').length;
const warn = (text: string): RuleWarning => ({ level: 'warn', text });
const info = (text: string): RuleWarning => ({ level: 'info', text });

/** Avvisi riassuntivi della settimana (usati da Oggi e Settimana). */
export function weekSummary(catalog: Catalog, resolve: DayResolver, date: IsoDate) {
  const meals = weekDates(date).flatMap((d) => mainMeals(resolve(d)));
  const count = (tag: FoodTag) => meals.filter((o) => catalog.hasTag(o, tag)).length;
  return { fish: count('pesce'), redMeat: count('carne-rossa'), cabbage: count('cavolo') };
}
