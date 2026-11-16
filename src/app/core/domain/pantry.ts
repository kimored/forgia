import type { Food, Portion, ProductFormat } from '../models/plan';
import type { Owner, PriceEntry, Product, ProductSettings, ShoppingItem, Store } from '../models/pantry';
import type { Catalog } from './catalog';
import { addDays, daysBetween, type IsoDate } from './dates';
import type { ResolvedDay, ResolvedMeal } from './day-plan';
import type { DayResolver } from './rules';

/**
 * Dispensa generata dal piano: ogni alimento del piano (tranne quelli "non contati")
 * è un prodotto. Marca e confezioni arrivano dal piano o dalle impostazioni dell'utente.
 */

export const FORECAST_HORIZON_DAYS = 90;

/** Confezione di default quando il piano non la indica. */
export function defaultFormatFor(food: Pick<Food, 'unit'>): ProductFormat {
  if (food.unit === 'pz') return { id: 'conf', label: '1 pz', qty: 1, price: null };
  return food.unit === 'ml'
    ? { id: 'conf', label: '1 L', qty: 1000, price: null }
    : { id: 'conf', label: '500 g', qty: 500, price: null };
}

export function productFromFood(food: Food, settings?: ProductSettings): Product {
  const formats = settings?.formats?.length ? settings.formats : food.formats?.length ? food.formats : [defaultFormatFor(food)];
  return { id: food.id, name: food.name, brand: settings?.brand ?? food.brand, unit: food.unit, formats, aliases: food.aliases };
}

/** Prodotti della dispensa per un piano. */
export function productsFor(catalog: Catalog, settings: ReadonlyMap<string, ProductSettings> = new Map()): Product[] {
  return [...catalog.foods.values()].filter((f) => !f.untracked).map((f) => productFromFood(f, settings.get(f.id)));
}

export function defaultFormat(p: Product): ProductFormat {
  return p.formats[0];
}

export type Needs = Map<string, { mine: number; other: number }>;

function add(needs: Needs, productId: string, owner: Owner, qty: number): void {
  if (!qty) return;
  const n = needs.get(productId) ?? { mine: 0, other: 0 };
  n[owner] += qty;
  needs.set(productId, n);
}

/** Quantità di prodotti consumate da un pasto ("quanto basta" e cibi non contati esclusi). */
export function mealConsumption(catalog: Catalog, meal: ResolvedMeal): { productId: string; qty: number }[] {
  return meal.portions
    .filter((p: Portion) => p.qty > 0 && catalog.foods.has(p.food) && !catalog.foods.get(p.food)!.untracked)
    .map((p) => ({ productId: p.food, qty: p.qty }));
}

export interface NeedsOptions {
  /** Conta solo i pasti non ancora fatti né saltati (oggi, con lo scalo automatico attivo). */
  pendingOnly?: boolean;
  /** Abitudini già spuntate oggi (non vanno ricontate). */
  habitsDone?: Record<string, boolean>;
}

/** Fabbisogno di un giorno: pasti del piano + abitudini con un alimento (es. creatina). */
export function dayNeeds(catalog: Catalog, day: ResolvedDay, opts: NeedsOptions = {}): Needs {
  const needs: Needs = new Map();
  for (const m of day.meals) {
    if (m.free) continue;
    const status = m.log?.status ?? 'todo';
    if (status === 'skipped' || (opts.pendingOnly && status === 'done')) continue;
    const owner: Owner = catalog.slot(m.slot)?.owner === 'other' ? 'other' : 'mine';
    for (const c of mealConsumption(catalog, m)) add(needs, c.productId, owner, c.qty);
  }
  for (const h of catalog.habits) {
    if (!h.food || !h.qty || (day.gym && h.includedOnGymDays)) continue;
    if (opts.pendingOnly && opts.habitsDone?.[h.id]) continue;
    add(needs, h.food, 'mine', h.qty);
  }
  return needs;
}

export interface ForecastInput {
  catalog: Catalog;
  products: Product[];
  resolve: DayResolver;
  from: IsoDate;
  stock: ReadonlyMap<string, number>;
  /** Se true, i pasti di oggi già fatti sono già stati scalati dalla dispensa. */
  autoDeduct: boolean;
  habitsDoneToday?: Record<string, boolean>;
  horizon?: number;
}

export interface Forecast {
  productId: string;
  stock: number;
  /** Consumo medio giornaliero sull'orizzonte. */
  dailyAvg: number;
  /** Giorni di copertura (null = non si consuma nel periodo o oltre l'orizzonte). */
  daysLeft: number | null;
  runOut: IsoDate | null;
}

const optsFor = (input: ForecastInput, i: number): NeedsOptions => ({
  pendingOnly: i === 0 && input.autoDeduct,
  habitsDone: i === 0 ? input.habitsDoneToday : undefined,
});

/** Simula i prossimi giorni sul piano effettivo e stima quando finisce ogni prodotto. */
export function forecast(input: ForecastInput): Forecast[] {
  const horizon = input.horizon ?? FORECAST_HORIZON_DAYS;
  const remaining = new Map(input.products.map((p) => [p.id, input.stock.get(p.id) ?? 0]));
  const total = new Map<string, number>();
  const runOut = new Map<string, number>();

  for (let i = 0; i < horizon; i++) {
    const needs = dayNeeds(input.catalog, input.resolve(addDays(input.from, i)), optsFor(input, i));
    for (const [id, n] of needs) {
      const qty = n.mine + n.other;
      total.set(id, (total.get(id) ?? 0) + qty);
      const left = (remaining.get(id) ?? 0) - qty;
      remaining.set(id, left);
      if (left < 0 && !runOut.has(id)) runOut.set(id, i);
    }
  }

  return input.products.map((p) => {
    const days = runOut.get(p.id);
    return {
      productId: p.id,
      stock: input.stock.get(p.id) ?? 0,
      dailyAvg: (total.get(p.id) ?? 0) / horizon,
      daysLeft: days ?? null,
      runOut: days === undefined ? null : addDays(input.from, days),
    };
  });
}

/** Lista spesa: quanto manca per coprire i prossimi `days` giorni, in confezioni. */
export function shoppingList(input: ForecastInput & { days: number }): ShoppingItem[] {
  const needs: Needs = new Map();
  for (let i = 0; i < input.days; i++) {
    for (const [id, q] of dayNeeds(input.catalog, input.resolve(addDays(input.from, i)), optsFor(input, i))) {
      add(needs, id, 'mine', q.mine);
      add(needs, id, 'other', q.other);
    }
  }
  const byId = new Map(input.products.map((p) => [p.id, p]));
  const items: ShoppingItem[] = [];
  for (const [productId, need] of needs) {
    const prod = byId.get(productId);
    if (!prod) continue;
    const format = defaultFormat(prod);
    // La scorta copre prima "la mia parte", poi l'altra.
    let stock = input.stock.get(productId) ?? 0;
    for (const owner of ['mine', 'other'] as const) {
      const missing = need[owner] - stock;
      stock = Math.max(0, -missing);
      if (missing > 0) {
        items.push({ productId, formatId: format.id, owner, missing, packs: Math.ceil(missing / format.qty), checked: false });
      }
    }
  }
  return items.sort((a, b) => byId.get(a.productId)!.name.localeCompare(byId.get(b.productId)!.name, 'it'));
}

/** A chi serve un prodotto, in base agli slot dei pasti che lo usano. */
export function productOwners(catalog: Catalog): Map<string, Set<Owner>> {
  const out = new Map<string, Set<Owner>>();
  const mark = (id: string, owner: Owner) => {
    const set = out.get(id) ?? new Set<Owner>();
    set.add(owner);
    out.set(id, set);
  };
  for (const m of catalog.meals.values()) {
    for (const slot of m.slots) {
      const owner: Owner = catalog.slot(slot)?.owner === 'other' ? 'other' : 'mine';
      for (const p of m.portions) mark(p.food, owner);
    }
  }
  for (const h of catalog.habits) if (h.food) mark(h.food, 'mine');
  return out;
}

// ---------- Prezzi ----------

export interface PriceInfo {
  price: number;
  store?: Store;
  date?: IsoDate;
  offer?: boolean;
  /** Prezzo al kg / litro / pezzo, per confrontare formati diversi. */
  unitPrice: number;
}

/** €/kg (g), €/L (ml) o €/pezzo. */
export function unitPrice(p: Product, format: ProductFormat, price: number): number {
  const factor = p.unit === 'pz' ? 1 : 1000;
  return (price / format.qty) * factor;
}

export function unitLabel(p: Product): string {
  return p.unit === 'g' ? '€/kg' : p.unit === 'ml' ? '€/L' : '€/pz';
}

/** Ultimo prezzo non in offerta per ogni supermercato (normalizzato al formato richiesto). */
export function latestByStore(p: Product, format: ProductFormat, history: PriceEntry[]): Map<Store, PriceInfo> {
  const out = new Map<Store, PriceInfo>();
  const sorted = history
    .filter((h) => h.productId === p.id && !h.offer)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.id ?? 0) - (a.id ?? 0));
  for (const h of sorted) {
    if (out.has(h.store)) continue;
    const f = p.formats.find((x) => x.id === h.formatId) ?? format;
    const u = unitPrice(p, f, h.price);
    out.set(h.store, { price: (u / (p.unit === 'pz' ? 1 : 1000)) * format.qty, store: h.store, date: h.date, unitPrice: u });
  }
  return out;
}

/** Prezzo di riferimento: ultimo pagato (in qualunque negozio, non in offerta), altrimenti quello del piano. */
export function referencePrice(p: Product, format: ProductFormat, history: PriceEntry[]): PriceInfo | null {
  const latest = [...latestByStore(p, format, history).values()].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))[0];
  if (latest) return latest;
  if (format.price === null) return null;
  return { price: format.price, unitPrice: unitPrice(p, format, format.price) };
}

export interface PriceComparison {
  /** Differenza in euro rispetto al prezzo migliore registrato altrove (positivo = paghi di più). */
  diff: number;
  diffPct: number;
  best: PriceInfo;
  isBest: boolean;
  ageDays: number;
}

/** Confronta un prezzo appena pagato con il migliore registrato negli altri negozi. */
export function comparePrice(
  p: Product,
  format: ProductFormat,
  price: number,
  store: Store,
  history: PriceEntry[],
  today: IsoDate,
): PriceComparison | null {
  const paid = unitPrice(p, format, price);
  const others = [...latestByStore(p, format, history).values()].filter((x) => x.store !== store);
  if (!others.length) return null;
  const best = others.reduce((a, b) => (b.unitPrice < a.unitPrice ? b : a));
  const diff = ((paid - best.unitPrice) / (p.unit === 'pz' ? 1 : 1000)) * format.qty;
  return {
    diff,
    diffPct: (paid / best.unitPrice - 1) * 100,
    best,
    isBest: paid <= best.unitPrice,
    ageDays: best.date ? daysBetween(best.date, today) : 0,
  };
}
