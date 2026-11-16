import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { PantryStore } from '../../core/data/pantry.store';
import { comparePrice, defaultFormat, latestByStore, product, unitLabel } from '../../core/domain/pantry';
import { today } from '../../core/domain/dates';
import { STORES, type Store } from '../../core/models/pantry';
import { formatEur, formatQty, stepFor } from '../../shared/qty-format';

/** Dettaglio di un prodotto: scorta, "ho ricomprato" con prezzo, storico prezzi per negozio. */
@Component({
  selector: 'app-product-sheet',
  imports: [DatePipe, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-sheet.html',
  styleUrl: './product-sheet.scss',
})
export class ProductSheet {
  protected readonly store = inject(PantryStore);
  readonly productId = input.required<string>();

  protected readonly stores = STORES;
  protected readonly fmtQty = formatQty;
  protected readonly eur = formatEur;

  protected readonly p = computed(() => product(this.productId()));
  protected readonly qty = computed(() => this.store.stock().get(this.productId()) ?? 0);
  protected readonly forecast = computed(() => this.store.forecasts().get(this.productId()));
  protected readonly step = computed(() => stepFor(this.p().unit, defaultFormat(this.p()).qty));
  protected readonly unitLabel = computed(() => unitLabel(this.p()));

  // "Ho ricomprato"
  protected readonly formatId = signal('');
  protected readonly packs = signal(1);
  protected readonly buyStore = signal<Store | null>(null);
  protected readonly price = signal<number | null>(null);
  /** Testo digitato (con la virgola), separato dal valore numerico. */
  protected readonly priceText = signal('');
  protected readonly offer = signal(false);
  protected readonly added = signal(false);

  protected readonly format = computed(() => this.p().formats.find((f) => f.id === this.formatId()) ?? defaultFormat(this.p()));

  constructor() {
    effect(() => {
      this.productId();
      this.formatId.set(defaultFormat(this.p()).id);
      this.packs.set(1);
      this.price.set(null);
      this.priceText.set('');
      this.offer.set(false);
    });
  }

  protected readonly comparison = computed(() => {
    const price = this.price();
    const store = this.buyStore();
    if (price === null || !store || this.offer()) return null;
    return comparePrice(this.p(), this.format(), price, store, this.store.history(this.productId()), today());
  });

  /** Ultimo prezzo per negozio, dal più conveniente. */
  protected readonly byStore = computed(() => {
    const p = this.p();
    const latest = latestByStore(p, defaultFormat(p), this.store.history(p.id));
    const list = [...latest.values()].sort((a, b) => a.unitPrice - b.unitPrice);
    return list.map((x, i) => ({ ...x, name: STORES.find((s) => s.id === x.store)!.name, best: i === 0 && list.length > 1 }));
  });
  protected readonly history = computed(() =>
    this.store.history(this.productId()).map((h) => ({
      ...h,
      storeName: STORES.find((s) => s.id === h.store)!.name,
      formatLabel: this.p().formats.find((f) => f.id === h.formatId)?.label ?? '',
    })),
  );

  protected setQty(value: string): void {
    const n = parseFloat(value.replace(',', '.'));
    if (Number.isFinite(n)) void this.store.setQty(this.productId(), n);
  }

  protected setPrice(value: string): void {
    this.priceText.set(value);
    const n = parseFloat(value.replace(',', '.'));
    this.price.set(Number.isFinite(n) && n > 0 ? n : null);
  }

  protected async restock(): Promise<void> {
    const store = this.buyStore();
    const price = this.price();
    await this.store.restock(
      this.productId(),
      this.format().id,
      this.packs(),
      store && price !== null ? { store, price, offer: this.offer() } : undefined,
    );
    this.added.set(true);
    setTimeout(() => this.added.set(false), 1500);
    this.packs.set(1);
    this.price.set(null);
      this.priceText.set('');
  }

  protected readonly abs = Math.abs;
  protected readonly Math = Math;

  protected storeName(id: Store | undefined): string {
    return STORES.find((s) => s.id === id)?.name ?? '';
  }
}
