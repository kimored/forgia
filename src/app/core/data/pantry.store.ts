import { Injectable, computed, inject, signal } from '@angular/core';
import { liveQuery } from 'dexie';
import type { PantryItem, PriceEntry, Product, ProductSettings, ShoppingItem, ShoppingList, Store } from '../models/pantry';
import { today, type IsoDate } from '../domain/dates';
import {
  defaultFormat,
  forecast,
  latestByStore,
  productsFor,
  referencePrice,
  shoppingList,
  type Forecast,
  type ForecastInput,
} from '../domain/pantry';
import { db } from './db';
import { DayStore } from './day.store';
import { adjustStock, setStock } from './pantry.repo';
import { SettingsService } from './settings.service';

export const SHOPPING_DAYS = 7;

@Injectable({ providedIn: 'root' })
export class PantryStore {
  private readonly days = inject(DayStore);
  private readonly settingsService = inject(SettingsService);

  private readonly items = signal<PantryItem[]>([]);
  readonly prices = signal<PriceEntry[]>([]);
  private readonly lists = signal<ShoppingList[]>([]);
  private readonly settingsRows = signal<ProductSettings[]>([]);
  readonly catalog = this.days.catalog;

  readonly stock = computed(() => new Map(this.items().map((i) => [i.productId, i.qty])));

  /** Prodotti = alimenti del piano attivo, con le personalizzazioni dell'utente. */
  readonly products = computed<Product[]>(() =>
    productsFor(this.days.catalog(), new Map(this.settingsRows().map((s) => [s.productId, s]))),
  );
  private readonly byId = computed(() => new Map(this.products().map((p) => [p.id, p])));

  product(id: string): Product | undefined {
    return this.byId().get(id);
  }
  /** La data cambia a mezzanotte: si ricalcola alla riapertura dell'app. */
  private readonly date = signal<IsoDate>(today());

  constructor() {
    liveQuery(() => db.pantry.toArray()).subscribe((v) => this.items.set(v));
    liveQuery(() => db.prices.toArray()).subscribe((v) => this.prices.set(v));
    liveQuery(() => db.shoppingLists.orderBy('createdAt').toArray()).subscribe((v) => this.lists.set(v));
    liveQuery(() => db.productSettings.toArray()).subscribe((v) => this.settingsRows.set(v));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.date.set(today());
    });
  }

  private forecastInput(): ForecastInput {
    const date = this.date();
    return {
      catalog: this.days.catalog(),
      products: this.products(),
      resolve: this.days.resolver(),
      from: date,
      stock: this.stock(),
      autoDeduct: this.settingsService.settings().pantryAutoDeduct,
      habitsDoneToday: this.days.habits(date).done,
    };
  }

  /** Personalizza marca e confezioni di un prodotto. */
  async saveProductSettings(settings: ProductSettings): Promise<void> {
    await db.productSettings.put(settings);
  }

  readonly forecasts = computed(() => new Map(forecast(this.forecastInput()).map((f) => [f.productId, f])));

  /**
   * Prodotti che finiscono entro la soglia di avviso. Solo quelli di cui è stata inserita
   * una quantità: al primo avvio la dispensa vuota non genera decine di avvisi.
   */
  readonly alerts = computed<Forecast[]>(() => {
    const n = this.settingsService.settings().alertDays;
    const known = this.stock();
    return [...this.forecasts().values()]
      .filter((f) => known.has(f.productId) && f.dailyAvg > 0 && f.daysLeft !== null && f.daysLeft < n)
      .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
  });

  /** Lista spesa in corso (l'ultima non chiusa). */
  readonly currentList = computed(() => this.lists().filter((l) => !l.closedAt).at(-1) ?? null);

  // ---------- Dispensa ----------

  setQty(productId: string, qty: number): Promise<void> {
    return setStock(productId, qty);
  }

  adjust(productId: string, delta: number): Promise<void> {
    return adjustStock([{ productId, qty: Math.abs(delta) }], delta >= 0 ? 1 : -1);
  }

  /** "Ho ricomprato": aggiunge confezioni e, se indicato, registra il prezzo pagato. */
  async restock(
    productId: string,
    formatId: string,
    packs: number,
    paid?: { store: Store; price: number; offer?: boolean },
  ): Promise<void> {
    const p = this.product(productId);
    if (!p) return;
    const format = p.formats.find((f) => f.id === formatId) ?? defaultFormat(p);
    await adjustStock([{ productId, qty: format.qty * packs }], 1);
    if (paid) await this.addPrice({ productId, formatId: format.id, ...paid, date: today(), source: 'spesa' });
  }

  // ---------- Prezzi ----------

  async addPrice(entry: Omit<PriceEntry, 'id'>): Promise<void> {
    await db.prices.add(entry);
  }

  deletePrice(id: number): Promise<void> {
    return db.prices.delete(id);
  }

  history(productId: string): PriceEntry[] {
    return this.prices()
      .filter((h) => h.productId === productId)
      .sort((a, b) => b.date.localeCompare(a.date) || (b.id ?? 0) - (a.id ?? 0));
  }

  // ---------- Lista spesa ----------

  async generateList(days = SHOPPING_DAYS): Promise<void> {
    const input = this.forecastInput();
    const items = shoppingList({ ...input, days });
    await db.shoppingLists.add({ createdAt: new Date().toISOString(), from: input.from, days, items });
  }

  async updateItem(list: ShoppingList, index: number, patch: Partial<ShoppingItem>): Promise<void> {
    const items = list.items.map((it, i) => (i === index ? { ...it, ...patch } : it));
    await db.shoppingLists.update(list.id!, { items });
  }

  async discardList(list: ShoppingList): Promise<void> {
    await db.shoppingLists.delete(list.id!);
  }

  /** Chiude la spesa: gli articoli spuntati entrano in dispensa e i prezzi inseriti finiscono nello storico. */
  async closeList(list: ShoppingList, store: Store): Promise<void> {
    const date = today();
    const bought = list.items.filter((i) => i.checked);
    await adjustStock(
      bought.flatMap((i) => {
        const p = this.product(i.productId);
        if (!p) return [];
        const f = p.formats.find((x) => x.id === i.formatId) ?? defaultFormat(p);
        return [{ productId: i.productId, qty: f.qty * i.packs }];
      }),
      1,
    );
    for (const i of bought) {
      if (i.price !== undefined) {
        await this.addPrice({ productId: i.productId, formatId: i.formatId, store, date, price: i.price, source: 'spesa' });
      }
    }
    await db.shoppingLists.update(list.id!, { closedAt: new Date().toISOString() });
  }

  /** Prezzo stimato di una riga (ultimo pagato nel negozio, altrimenti riferimento). */
  estimate(item: ShoppingItem, store?: Store): number | null {
    const p = this.product(item.productId);
    if (!p) return null;
    const f = p.formats.find((x) => x.id === item.formatId) ?? defaultFormat(p);
    const history = this.prices();
    const info = (store && latestByStore(p, f, history).get(store)) || referencePrice(p, f, history);
    return info ? info.price * item.packs : null;
  }

}
