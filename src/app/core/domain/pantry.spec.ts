import { describe, expect, it } from 'vitest';
import type { MealLog } from '../models/logs';
import type { PriceEntry } from '../models/pantry';
import { DEFAULT_TIMES } from '../models/profile';
import { exampleCatalog as catalog } from './catalog';
import { addDays, type IsoDate } from './dates';
import { resolveDay } from './day-plan';
import {
  comparePrice,
  dayNeeds,
  defaultFormat,
  forecast,
  latestByStore,
  productOwners,
  productsFor,
  referencePrice,
  shoppingList,
  type ForecastInput,
} from './pantry';
import type { DayResolver } from './rules';

const START = '2026-11-16';
const profile = { startDate: START, gymDays: [0, 2, 4] as (0 | 2 | 4)[], times: DEFAULT_TIMES };
const products = productsFor(catalog);
const product = (id: string) => products.find((p) => p.id === id)!;
const resolver =
  (logs: MealLog[] = []): DayResolver =>
  (date: IsoDate) =>
    resolveDay(catalog, { date, profile, logs: logs.filter((l) => l.date === date) });
const input = (over: Partial<ForecastInput> = {}): ForecastInput => ({
  catalog,
  products,
  resolve: resolver(),
  from: START,
  stock: new Map(),
  autoDeduct: true,
  ...over,
});

describe('dispensa generata dal piano', () => {
  it('ogni alimento contato del piano è un prodotto', () => {
    const tracked = [...catalog.foods.values()].filter((f) => !f.untracked);
    expect(products.map((p) => p.id).sort()).toEqual(tracked.map((f) => f.id).sort());
    expect(products.find((p) => p.id === 'acqua')).toBeUndefined();
  });

  it('usa marca e confezioni del piano, o una confezione di default', () => {
    expect(product('latte')).toMatchObject({ brand: 'Zymil', formats: [{ qty: 1000, price: 1.9 }] });
    expect(defaultFormat(product('pasta')).qty).toBe(500);
  });

  it('le personalizzazioni dell’utente vincono sul piano', () => {
    const custom = productsFor(catalog, new Map([['latte', { productId: 'latte', brand: 'Altra', formats: [{ id: 'x', label: '500 ml', qty: 500, price: 1 }] }]]));
    expect(custom.find((p) => p.id === 'latte')).toMatchObject({ brand: 'Altra', formats: [{ qty: 500 }] });
  });

  it('divide i prodotti tra la mia parte e chi cucina', () => {
    const owners = productOwners(catalog);
    expect([...owners.get('latte')!]).toEqual(['mine']);
    expect([...owners.get('pasta')!]).toEqual(['other']);
    expect(owners.get('pane')!.size).toBe(2);
  });
});

describe('consumi', () => {
  it('lunedì palestra: latte, uova, proteine e creatina nello shake', () => {
    const n = dayNeeds(catalog, resolver()(START));
    expect(n.get('latte')?.mine).toBe(250);
    expect(n.get('uova')?.mine).toBe(2);
    expect(n.get('proteine')?.mine).toBe(30);
    expect(n.get('creatina')?.mine).toBe(5);
    expect(n.get('pasta')?.other).toBe(120);
    expect(n.get('pane')).toEqual({ mine: 90, other: 40 });
  });

  it('giorno di riposo: creatina dall’abitudine del piano, niente proteine', () => {
    const n = dayNeeds(catalog, resolver()(addDays(START, 1)));
    expect(n.get('creatina')?.mine).toBe(5);
    expect(n.has('proteine')).toBe(false);
  });

  it('pasti liberi e saltati non consumano', () => {
    expect(dayNeeds(catalog, resolver()(addDays(START, 6))).has('pasta')).toBe(false);
    const log: MealLog = { date: START, slot: 'colazione', status: 'skipped', at: '' };
    expect(dayNeeds(catalog, resolver([log])(START)).has('latte')).toBe(false);
  });

  it('con pendingOnly i pasti fatti e le abitudini spuntate non contano', () => {
    const log: MealLog = { date: START, slot: 'colazione', status: 'done', at: '' };
    expect(dayNeeds(catalog, resolver([log])(START), { pendingOnly: true }).has('latte')).toBe(false);
    const rest = resolver()(addDays(START, 1));
    expect(dayNeeds(catalog, rest, { pendingOnly: true, habitsDone: { creatina: true } }).has('creatina')).toBe(false);
  });
});

describe('forecast', () => {
  it('stima i giorni di copertura del latte (250 ml al giorno)', () => {
    const latte = forecast(input({ stock: new Map([['latte', 1000]]), horizon: 30 })).find((x) => x.productId === 'latte')!;
    expect(latte.daysLeft).toBe(4);
    expect(latte.runOut).toBe(addDays(START, 4));
    expect(latte.dailyAvg).toBe(250);
  });

  it('i prodotti non usati nel periodo non finiscono', () => {
    expect(forecast(input({ horizon: 7 })).find((x) => x.productId === 'tortellini')!.daysLeft).toBeNull();
  });
});

describe('shoppingList', () => {
  it('confezioni mancanti per la settimana, divise per parte', () => {
    const items = shoppingList({ ...input({ stock: new Map([['latte', 500]]) }), days: 7 });
    const latte = items.find((i) => i.productId === 'latte')!;
    expect(latte).toMatchObject({ missing: 7 * 250 - 500, packs: 2, owner: 'mine' });
    expect(items.find((i) => i.productId === 'pasta')!.owner).toBe('other');
  });

  it('con tutto a zero, ogni alimento del piano della settimana è da comprare', () => {
    const ids = new Set(shoppingList({ ...input(), days: 7 }).map((i) => i.productId));
    expect(ids.has('muesli')).toBe(true);
    expect(ids.has('acqua')).toBe(false);
  });

  it('con la dispensa piena non serve nulla', () => {
    const full = new Map(products.map((p) => [p.id, 100_000]));
    expect(shoppingList({ ...input({ stock: full }), days: 7 })).toEqual([]);
  });
});

describe('prezzi', () => {
  const yogurt = product('yogurt-greco');
  const f500 = yogurt.formats[0];
  const h: PriceEntry[] = [
    { id: 1, productId: 'yogurt-greco', formatId: '500g', store: 'conad', date: '2026-11-01', price: 3.0, source: 'spesa' },
    { id: 2, productId: 'yogurt-greco', formatId: '500g', store: 'sole365', date: '2026-11-14', price: 3.2, source: 'spesa' },
    { id: 3, productId: 'yogurt-greco', formatId: '500g', store: 'deco', date: '2026-11-15', price: 2.0, offer: true, source: 'spesa' },
  ];

  it('ultimo prezzo per negozio, ignorando le offerte', () => {
    const m = latestByStore(yogurt, f500, h);
    expect(m.get('conad')?.price).toBeCloseTo(3.0);
    expect(m.has('deco')).toBe(false);
  });

  it('normalizza formati diversi al prezzo al kg', () => {
    const m = latestByStore(yogurt, f500, [
      { productId: 'yogurt-greco', formatId: '150g', store: 'conad', date: '2026-11-01', price: 1.5, source: 'spesa' },
    ]);
    expect(m.get('conad')?.unitPrice).toBeCloseTo(10);
    expect(m.get('conad')?.price).toBeCloseTo(5);
  });

  it('riferimento: ultimo pagato, altrimenti quello del piano', () => {
    expect(referencePrice(yogurt, f500, h)?.price).toBeCloseTo(3.2);
    expect(referencePrice(yogurt, f500, [])?.price).toBe(3.69);
    expect(referencePrice(product('pasta'), defaultFormat(product('pasta')), [])).toBeNull();
  });

  it('confronto: al Sole365 a 3,20 paghi 0,20 in più che alla Conad', () => {
    const c = comparePrice(yogurt, f500, 3.2, 'sole365', h, '2026-11-15')!;
    expect(c.best.store).toBe('conad');
    expect(c.diff).toBeCloseTo(0.2);
    expect(c.isBest).toBe(false);
    expect(c.ageDays).toBe(14);
  });
});
