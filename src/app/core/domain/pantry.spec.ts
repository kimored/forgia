import { describe, expect, it } from 'vitest';
import type { MealLog } from '../models/logs';
import type { PriceEntry } from '../models/pantry';
import { DEFAULT_TIMES } from '../models/profile';
import { catalog } from './catalog';
import { addDays, type IsoDate } from './dates';
import { resolveDay } from './day-plan';
import {
  comparePrice,
  dayNeeds,
  defaultFormat,
  forecast,
  latestByStore,
  product,
  productForFood,
  products,
  referencePrice,
  shoppingList,
} from './pantry';
import type { DayResolver } from './rules';

const START = '2026-11-16';
const profile = { startDate: START, gymDays: [0, 2, 4] as number[] as (0 | 2 | 4)[], times: DEFAULT_TIMES };
const resolver =
  (logs: MealLog[] = []): DayResolver =>
  (date: IsoDate) =>
    resolveDay(catalog, { date, profile, logs: logs.filter((l) => l.date === date) });

describe('catalogo prodotti', () => {
  it('ogni cibo del piano (tranne l’acqua) ha un prodotto con la stessa unità', () => {
    for (const food of catalog.foods.values()) {
      if (food.id === 'acqua') continue;
      const p = productForFood(food.id);
      expect(p, food.id).toBeDefined();
      expect(p!.unit, food.id).toBe(food.unit);
    }
  });

  it('id unici e almeno un formato', () => {
    expect(new Set(products.map((p) => p.id)).size).toBe(products.length);
    for (const p of products) expect(p.formats.length, p.id).toBeGreaterThan(0);
  });
});

describe('consumi', () => {
  it('lunedì palestra: latte 250, uova 2, proteine 30, creatina nello shake', () => {
    const n = dayNeeds(resolver()(START));
    expect(n.get('latte')?.mine).toBe(250);
    expect(n.get('uova')?.mine).toBe(2);
    expect(n.get('proteine')?.mine).toBe(30);
    expect(n.get('creatina')?.mine).toBe(5);
    expect(n.get('pasta')?.nonna).toBe(120);
    expect(n.get('pane')).toEqual({ mine: 90, nonna: 40 });
  });

  it('giorno di riposo: creatina a parte, niente proteine', () => {
    const n = dayNeeds(resolver()(addDays(START, 1)));
    expect(n.get('creatina')?.mine).toBe(5);
    expect(n.has('proteine')).toBe(false);
  });

  it('pasti liberi e saltati non consumano', () => {
    const sun = dayNeeds(resolver()(addDays(START, 6)));
    expect(sun.has('pasta')).toBe(false);
    const log: MealLog = { date: START, slot: 'colazione', status: 'skipped', at: '' };
    expect(dayNeeds(resolver([log])(START)).has('latte')).toBe(false);
  });

  it('con pendingOnly i pasti già fatti non contano', () => {
    const log: MealLog = { date: START, slot: 'colazione', status: 'done', at: '' };
    expect(dayNeeds(resolver([log])(START), { pendingOnly: true }).has('latte')).toBe(false);
  });
});

describe('forecast', () => {
  it('stima i giorni di copertura del latte (250 ml al giorno)', () => {
    const f = forecast({ resolve: resolver(), from: START, stock: new Map([['latte', 1000]]), autoDeduct: true, horizon: 30 });
    const latte = f.find((x) => x.productId === 'latte')!;
    expect(latte.daysLeft).toBe(4);
    expect(latte.runOut).toBe(addDays(START, 4));
    expect(latte.dailyAvg).toBe(250);
  });

  it('a scorta zero finisce oggi', () => {
    const f = forecast({ resolve: resolver(), from: START, stock: new Map(), autoDeduct: true, horizon: 7 });
    expect(f.find((x) => x.productId === 'muesli')!.daysLeft).toBe(0);
  });

  it('i prodotti non usati nel periodo non finiscono', () => {
    const f = forecast({ resolve: resolver(), from: START, stock: new Map(), autoDeduct: true, horizon: 7 });
    expect(f.find((x) => x.productId === 'tortellini')!.daysLeft).toBeNull();
  });
});

describe('shoppingList', () => {
  it('calcola le confezioni mancanti per la settimana e separa le parti', () => {
    const items = shoppingList({ resolve: resolver(), from: START, stock: new Map([['latte', 500]]), autoDeduct: true, days: 7 });
    const latte = items.find((i) => i.productId === 'latte')!;
    expect(latte.missing).toBe(7 * 250 - 500);
    expect(latte.packs).toBe(2);
    expect(latte.owner).toBe('mine');
    expect(items.find((i) => i.productId === 'pasta')!.owner).toBe('nonna');
  });

  it('pane: la scorta copre prima la mia parte', () => {
    const items = shoppingList({ resolve: resolver(), from: START, stock: new Map([['pane', 630]]), autoDeduct: true, days: 7 });
    expect(items.find((i) => i.productId === 'pane' && i.owner === 'mine')).toBeUndefined();
    expect(items.find((i) => i.productId === 'pane' && i.owner === 'nonna')).toBeDefined();
  });

  it('con la dispensa piena non serve nulla', () => {
    const full = new Map(products.map((p) => [p.id, 100_000]));
    expect(shoppingList({ resolve: resolver(), from: START, stock: full, autoDeduct: true, days: 7 })).toEqual([]);
  });

  it('la mia parte costa circa quanto il riferimento (~38,50 €/settimana)', () => {
    const items = shoppingList({ resolve: resolver(), from: START, stock: new Map(), autoDeduct: true, days: 7 }).filter(
      (i) => i.owner === 'mine',
    );
    const total = items.reduce((s, i) => {
      const p = product(i.productId);
      return s + i.packs * (referencePrice(p, defaultFormat(p), [])?.price ?? 0);
    }, 0);
    // Confezioni intere e senza scorta: un po' sopra il riferimento settimanale.
    expect(total).toBeGreaterThan(30);
    expect(total).toBeLessThan(60);
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
    expect(m.get('conad')?.price).toBeCloseTo(5); // 500 g a 10 €/kg
  });

  it('riferimento: ultimo pagato, altrimenti catalogo', () => {
    expect(referencePrice(yogurt, f500, h)?.price).toBeCloseTo(3.2);
    expect(referencePrice(yogurt, f500, [])?.price).toBe(3.69);
    expect(referencePrice(product('pasta'), defaultFormat(product('pasta')), [])).toBeNull();
  });

  it('confronto: al Sole365 a 3,20 paghi 0,20 in più che alla Conad', () => {
    const c = comparePrice(yogurt, f500, 3.2, 'sole365', h, '2026-11-15')!;
    expect(c.best.store).toBe('conad');
    expect(c.diff).toBeCloseTo(0.2);
    expect(c.diffPct).toBeCloseTo(6.67, 1);
    expect(c.isBest).toBe(false);
    expect(c.ageDays).toBe(14);
  });

  it('confronto: senza altri negozi non c’è confronto', () => {
    expect(comparePrice(yogurt, f500, 3, 'conad', h.slice(0, 1), '2026-11-15')).toBeNull();
  });
});
