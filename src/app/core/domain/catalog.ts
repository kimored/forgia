import foodsJson from '../../../assets/data/foods.json';
import mealsJson from '../../../assets/data/meals.json';
import planJson from '../../../assets/data/plan.json';
import seasonsJson from '../../../assets/data/seasons.json';
import type { Food, FoodTag, MealOption, MealSlot, Plan } from '../models/plan';

export interface Season {
  id: string;
  name: string;
  months: number[];
  fruits: string[];
}

/** Accesso tipizzato ai dati statici del piano. */
export class Catalog {
  readonly foods = new Map<string, Food>();
  readonly meals = new Map<string, MealOption>();

  constructor(
    foods: Food[],
    meals: MealOption[],
    readonly plan: Plan,
    readonly seasons: { always: string[]; seasons: Season[]; neverPropose: string[] },
  ) {
    for (const f of foods) this.foods.set(f.id, f);
    for (const m of meals) this.meals.set(m.id, m);
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
    for (const p of option.portions) for (const t of this.food(p.food).tags ?? []) tags.add(t);
    return tags;
  }

  hasTag(option: MealOption | null | undefined, tag: FoodTag): boolean {
    return !!option && this.tagsOf(option).has(tag);
  }

  seasonFor(month: number): Season | undefined {
    return this.seasons.seasons.find((s) => s.months.includes(month));
  }
}

export const catalog = new Catalog(
  foodsJson as Food[],
  mealsJson as MealOption[],
  planJson as Plan,
  seasonsJson,
);
