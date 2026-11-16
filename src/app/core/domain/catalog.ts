import examplePlanJson from '../../../assets/data/example-plan.json';
import {
  FREE_MEAL,
  type Food,
  type FoodTag,
  type MealOption,
  type MealSlot,
  type PlanDay,
  type PlanDocument,
  type PlanRule,
  type SlotDef,
  type Weekday,
} from '../models/plan';

export const EXAMPLE_PLAN = examplePlanJson as unknown as PlanDocument;

/** Accesso tipizzato e indicizzato a un documento di piano. */
export class Catalog {
  readonly foods = new Map<string, Food>();
  readonly meals = new Map<string, MealOption>();
  readonly slots: SlotDef[];
  private readonly slotById: Map<MealSlot, SlotDef>;

  constructor(readonly doc: PlanDocument) {
    for (const f of doc.foods) this.foods.set(f.id, f);
    for (const m of doc.meals) this.meals.set(m.id, m);
    this.slots = doc.slots;
    this.slotById = new Map(doc.slots.map((s) => [s.id, s]));
  }

  get meta() {
    return this.doc.meta;
  }
  get rules(): PlanRule[] {
    return this.doc.rules ?? [];
  }
  get habits() {
    return this.doc.habits ?? [];
  }
  get tips() {
    return this.doc.tips ?? [];
  }

  /** Settimane del ciclo (1 per un giorno tipo). */
  get cycleLength(): number {
    return this.doc.schedule.type === 'cycle' ? this.doc.schedule.weeks.length : 1;
  }

  /** Il giorno del calendario del piano per una settimana del ciclo (1-based) e un giorno. */
  planDay(week: number, weekday: Weekday): PlanDay {
    const s = this.doc.schedule;
    return s.type === 'template' ? s.day : s.weeks[week - 1][weekday];
  }

  slot(id: MealSlot): SlotDef | undefined {
    return this.slotById.get(id);
  }

  food(id: string): Food {
    const f = this.foods.get(id);
    if (!f) throw new Error(`Cibo sconosciuto: ${id}`);
    return f;
  }

  meal(id: string): MealOption {
    const m = this.meals.get(id);
    if (!m) throw new Error(`Pasto sconosciuto: ${id}`);
    return m;
  }

  mealsForSlot(slot: MealSlot): MealOption[] {
    return [...this.meals.values()].filter((m) => m.slots.includes(slot));
  }

  /** Tag di un pasto: quelli dei cibi più quelli espliciti del pasto. */
  tagsOf(option: MealOption): Set<FoodTag> {
    const tags = new Set<FoodTag>(option.tags ?? []);
    for (const p of option.portions) for (const t of this.foods.get(p.food)?.tags ?? []) tags.add(t);
    return tags;
  }

  hasTag(option: MealOption | null | undefined, tag: FoodTag): boolean {
    return !!option && this.tagsOf(option).has(tag);
  }

  seasonFor(month: number) {
    return this.meta.seasons?.find((s) => s.months.includes(month));
  }

  /** Tutti gli id dei pasti usati in uno slot dal calendario (per le varianti "della settimana"). */
  scheduledIds(slot: MealSlot, week?: number): Set<string> {
    const s = this.doc.schedule;
    const days = s.type === 'template' ? [s.day] : week ? s.weeks[week - 1] : s.weeks.flat();
    return new Set(days.map((d) => d.meals[slot]).filter((id): id is string => !!id && id !== FREE_MEAL));
  }
}

/** Errori di coerenza di un documento di piano (vuoto = valido). */
export function validatePlan(doc: unknown): string[] {
  const d = doc as Partial<PlanDocument>;
  if (d?.format !== 'forgia-plan') return ['Il file non è un piano di Forgia.'];
  const errors: string[] = [];
  if (!d.meta?.title) errors.push('Manca il titolo del piano.');
  if (!Array.isArray(d.slots) || !d.slots.length) errors.push('Il piano non ha pasti (slot).');
  if (!Array.isArray(d.foods)) errors.push('Il piano non ha alimenti.');
  if (!Array.isArray(d.meals)) errors.push('Il piano non ha pasti.');
  if (errors.length) return errors;

  const foods = new Set(d.foods!.map((f) => f.id));
  const meals = new Map(d.meals!.map((m) => [m.id, m]));
  const slots = new Set(d.slots!.map((s) => s.id));
  for (const m of d.meals!) {
    for (const p of m.portions) if (!foods.has(p.food)) errors.push(`Pasto "${m.title}": alimento sconosciuto "${p.food}".`);
  }
  const s = d.schedule;
  const days = s?.type === 'template' ? [s.day] : s?.type === 'cycle' ? s.weeks.flat() : null;
  if (!days) errors.push('Il piano non ha un calendario valido.');
  if (s?.type === 'cycle' && s.weeks.some((w) => w.length !== 7)) errors.push('Ogni settimana deve avere 7 giorni.');
  for (const day of days ?? []) {
    for (const [slot, id] of Object.entries(day.meals)) {
      if (!slots.has(slot)) errors.push(`Slot sconosciuto "${slot}".`);
      if (id !== FREE_MEAL && !meals.has(id)) errors.push(`Pasto sconosciuto "${id}".`);
    }
  }
  return [...new Set(errors)];
}

export const exampleCatalog = new Catalog(EXAMPLE_PLAN);
