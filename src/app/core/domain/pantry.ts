import productsJson from '../../../assets/data/products.json';
import { NONNA_SLOTS, type Portion } from '../models/plan';
import type { Owner, PriceEntry, Product, ProductFormat, ShoppingItem, Store } from '../models/pantry';
import { addDays, daysBetween, type IsoDate } from './dates';
import type { ResolvedDay, ResolvedMeal } from './day-plan';
import type { DayResolver } from './rules';

export const products: Product[] = productsJson as Product[];
const productById = new Map(products.map((p) => [p.id, p]));
const productByFood = new Map(products.flatMap((p) => p.foods.map((f) => [f, p] as const)));

export const CREATINE_G = 5;
export const FORECAST_HORIZON_DAYS = 90;

export function product(id: string): Product {
  const p = productById.get(id);
  if (!p) throw new Error(`Prodotto sconosciuto: ${id}`);
  return p;
}

export function productForFood(foodId: string): Product | undefined {
  return productByFood.get(foodId);
}

export function defaultFormat(p: Product): ProductFormat {
  return p.formats[0];
}

export type Needs = Map<string, { mine: number; nonna: number }>;

function add(needs: Needs, productId: string, owner: Owner, qty: number): void {
  const n = needs.get(productId) ?? { mine: 0, nonna: 0 };
  n[owner] += qty;
  needs.set(productId, n);
}

/** Quantità di prodotti consumate da un pasto (per lo scalo automatico della dispensa). */
export function mealConsumption(meal: ResolvedMeal): { productId: string; qty: number }[] {
  return portionsToProducts(meal.portions);
}

function portionsToProducts(portions: Portion[]): { productId: string; qty: number }[] {
  const out: { productId: string; qty: number }[] = [];
  for (const p of portions) {
    const prod = productForFood(p.food);
    if (prod && !prod.untracked) out.push({ productId: prod.id, qty: p.qty });
  }
  return out;
}

/**
 * Fabbisogno di un giorno. `pendingOnly`: conta solo i pasti non ancora fatti né saltati
 * (per oggi, quando i pasti fatti sono già stati scalati).
 */
export function dayNeeds(day: ResolvedDay, opts: { pendingOnly?: boolean; creatineTaken?: boolean } = {}): Needs {
  const needs: Needs = new Map();
  for (const m of day.meals) {
    if (m.free) continue;
    const status = m.log?.status ?? 'todo';
    if (status === 'skipped' || (opts.pendingOnly && status === 'done')) continue;
    const owner: Owner = NONNA_SLOTS.includes(m.slot) ? 'nonna' : 'mine';
    for (const c of mealConsumption(m)) add(needs, c.productId, owner, c.qty);
  }
  // Nei giorni senza palestra la creatina si prende a parte (nei giorni palestra è nello shake).
  if (!day.gym && !(opts.pendingOnly && opts.creatineTaken)) add(needs, 'creatina', 'mine', CREATINE_G);
  return needs;
}

export interface ForecastInput {
  resolve: DayResolver;
  from: IsoDate;
  stock: ReadonlyMap<string, number>;
  /** Se true, i pasti di oggi già fatti sono già stati scalati dalla dispensa. */
  autoDeduct: boolean;
  creatineTakenToday?: boolean;
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

/** Simula i prossimi giorni sul piano effettivo e stima quando finisce ogni prodotto. */
export function forecast(input: ForecastInput): Forecast[] {
  const horizon = input.horizon ?? FORECAST_HORIZON_DAYS;
  const remaining = new Map(products.map((p) => [p.id, input.stock.get(p.id) ?? 0]));
  const total = new Map<string, number>();
  const runOut = new Map<string, number>();

  for (let i = 0; i < horizon; i++) {
    const date = addDays(input.from, i);
    const needs = dayNeeds(input.resolve(date), {
      pendingOnly: i === 0 && input.autoDeduct,
      creatineTaken: i === 0 && input.creatineTakenToday,
    });
    for (const [id, n] of needs) {
      const qty = n.mine + n.nonna;
      total.set(id, (total.get(id) ?? 0) + qty);
      const left = (remaining.get(id) ?? 0) - qty;
      remaining.set(id, left);
      if (left < 0 && !runOut.has(id)) runOut.set(id, i);
    }
  }

  return products
    .filter((p) => !p.untracked)
    .map((p) => {
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
    const day = input.resolve(addDays(input.from, i));
    const n = dayNeeds(day, {
      pendingOnly: i === 0 && input.autoDeduct,
      creatineTaken: i === 0 && input.creatineTakenToday,
    });
    for (const [id, q] of n) {
      add(needs, id, 'mine', q.mine);
      add(needs, id, 'nonna', q.nonna);
    }
  }

  const items: ShoppingItem[] = [];
  for (const [productId, need] of needs) {
    const prod = product(productId);
    const format = defaultFormat(prod);
    // La scorta copre prima "la mia parte", poi quella della nonna.
    let stock = input.stock.get(productId) ?? 0;
    for (const owner of ['mine', 'nonna'] as const) {
      const missing = need[owner] - stock;
      stock = Math.max(0, -missing);
      if (missing > 0) {
        items.push({ productId, formatId: format.id, owner, missing, packs: Math.ceil(missing / format.qty), checked: false });
      }
    }
  }
  return items.sort((a, b) => product(a.productId).name.localeCompare(product(b.productId).name, 'it'));
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

/** Prezzo di riferimento: ultimo pagato (in qualunque negozio, non in offerta), altrimenti quello del catalogo. */
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
