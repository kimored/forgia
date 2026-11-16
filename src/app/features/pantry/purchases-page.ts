import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PantryStore } from '../../core/data/pantry.store';
import { today } from '../../core/domain/dates';
import { defaultFormat } from '../../core/domain/pantry';
import { STORES, type Store } from '../../core/models/pantry';
import { formatEur } from '../../shared/qty-format';
import { Icon } from '../../shared/ui/icon';

/** Storico degli acquisti: cosa, quanto e dove, per confrontare i prezzi nel tempo. */
@Component({
  selector: 'app-purchases-page',
  imports: [DatePipe, RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="head">
      <a class="icon-btn" routerLink="/dispensa" aria-label="Torna alla dispensa"><app-icon name="back" /></a>
      <h1>Acquisti e prezzi</h1>
    </div>

    <section class="card form">
      <h2>Nuovo acquisto</h2>
      <label class="field">
        <span>Prodotto</span>
        <select [value]="productId()" (change)="pickProduct($any($event.target).value)">
          <option value="">Scegli…</option>
          @for (p of products(); track p.id) { <option [value]="p.id" [selected]="p.id === productId()">{{ p.name }}</option> }
        </select>
      </label>
      @if (product(); as p) {
        @if (p.formats.length > 1) {
          <div class="chips">
            @for (f of p.formats; track f.id) {
              <button type="button" class="chip" [class.on]="formatId() === f.id" (click)="formatId.set(f.id)">{{ f.label }}</button>
            }
          </div>
        }
        <div class="row">
          <label class="field">
            <span>Confezioni</span>
            <input type="number" inputmode="numeric" min="1" [value]="packs()" (input)="packs.set(Math.max(1, +$any($event.target).value || 1))" />
          </label>
          <label class="field">
            <span>Prezzo a confezione (€)</span>
            <input type="text" inputmode="decimal" placeholder="es. 2,49" [value]="priceText()" (input)="priceText.set($any($event.target).value)" />
          </label>
          <label class="field">
            <span>Data</span>
            <input type="date" [value]="date()" (change)="date.set($any($event.target).value || date())" />
          </label>
        </div>
        <div class="chips" role="group" aria-label="Negozio">
          @for (s of stores; track s.id) {
            <button type="button" class="chip" [class.on]="store() === s.id" (click)="store.set(s.id)">{{ s.name }}</button>
          }
        </div>
        <label class="check"><input type="checkbox" [checked]="offer()" (change)="offer.set($any($event.target).checked)" /> In offerta</label>
        @if (p.tracked) {
          <label class="check"><input type="checkbox" [checked]="toPantry()" (change)="toPantry.set($any($event.target).checked)" /> Aggiungi anche in dispensa</label>
        }
        <button type="button" class="btn primary" [disabled]="!canSave()" (click)="save()">{{ saved() ? '✓ Salvato' : 'Salva acquisto' }}</button>
      }
    </section>

    <section class="history">
      <div class="filters">
        <select aria-label="Filtra per prodotto" [value]="filterProduct()" (change)="filterProduct.set($any($event.target).value)">
          <option value="">Tutti i prodotti</option>
          @for (p of products(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
        </select>
        <select aria-label="Filtra per negozio" [value]="filterStore()" (change)="filterStore.set($any($event.target).value)">
          <option value="">Tutti i negozi</option>
          @for (s of stores; track s.id) { <option [value]="s.id">{{ s.name }}</option> }
        </select>
      </div>

      @for (m of months(); track m.key) {
        <h2>{{ m.date | date: 'MMMM y' }} <span class="muted num">{{ eur(m.total) }}</span></h2>
        <ul>
          @for (e of m.items; track e.id) {
            <li class="card row-item">
              <div>
                <strong>{{ e.name }}</strong>
                <span class="muted small">
                  {{ e.date | date: 'EEE d' }} · {{ e.storeName }}
                  @if (e.formatLabel) { · {{ e.formatLabel }} }
                  @if (e.offer) { <span class="badge warn">offerta</span> }
                  @if (e.best) { <span class="badge primary">più basso</span> }
                </span>
              </div>
              <span class="num price">
                {{ eur(e.price * e.packs) }}
                @if (e.packs > 1) { <span class="muted small">{{ e.packs }} × {{ eur(e.price) }}</span> }
              </span>
              <button type="button" class="icon-btn" aria-label="Elimina acquisto" (click)="remove(e.id!)">✕</button>
            </li>
          }
        </ul>
      } @empty {
        <p class="muted">Nessun acquisto registrato. Quelli della lista spesa e di "Ho ricomprato" finiscono qui da soli.</p>
      }
    </section>
  `,
  styles: `
    :host { display: grid; gap: 14px; max-width: 900px; }
    .head { display: flex; align-items: center; gap: 4px; margin: 4px 0 0 -8px; }
    .head a { color: inherit; }
    h1 { font-size: 1.75rem; }
    h2 { font-size: 1rem; display: flex; justify-content: space-between; margin: 10px 0 6px; text-transform: capitalize; }
    .form { display: grid; gap: 10px; }
    .field { display: grid; gap: 4px; min-width: 0; }
    .field span { font-size: 0.85rem; font-weight: 600; }
    input, select { min-height: var(--touch); padding: 0 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--surface-2); font-size: 1rem; min-width: 0; width: 100%; }
    .check input { width: auto; min-height: 0; }
    .row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    @media (max-width: 520px) { .row { grid-template-columns: 1fr 1fr; } .row .field:last-child { grid-column: 1 / -1; } }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .check { display: flex; align-items: center; gap: 8px; min-height: 36px; }
    .filters { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
    .row-item { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; align-items: center; padding: 10px 12px; }
    .row-item div { display: grid; gap: 2px; min-width: 0; }
    .price { display: grid; justify-items: end; font-weight: 700; }
    .small { font-size: 0.8rem; }
  `,
})
export class PurchasesPage {
  private readonly pantry = inject(PantryStore);
  protected readonly stores = STORES;
  protected readonly eur = formatEur;
  protected readonly Math = Math;

  protected readonly products = computed(() => [...this.pantry.products()].sort((a, b) => a.name.localeCompare(b.name, 'it')));

  // Nuovo acquisto
  protected readonly productId = signal('');
  protected readonly formatId = signal('');
  protected readonly packs = signal(1);
  protected readonly priceText = signal('');
  protected readonly date = signal(today());
  protected readonly store = signal<Store | null>(null);
  protected readonly offer = signal(false);
  protected readonly toPantry = signal(true);
  protected readonly saved = signal(false);

  protected readonly product = computed(() => this.pantry.product(this.productId()));
  private readonly price = computed(() => {
    const n = parseFloat(this.priceText().replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
  });
  protected readonly canSave = computed(() => !!this.product() && !!this.store() && this.price() !== null);

  protected pickProduct(id: string): void {
    this.productId.set(id);
    const p = this.pantry.product(id);
    this.formatId.set(p ? defaultFormat(p).id : '');
  }

  protected async save(): Promise<void> {
    const p = this.product();
    const store = this.store();
    const price = this.price();
    if (!p || !store || price === null) return;
    await this.pantry.recordPurchase(
      { productId: p.id, formatId: this.formatId() || defaultFormat(p).id, store, date: this.date(), price, packs: this.packs(), offer: this.offer() || undefined },
      p.tracked && this.toPantry(),
    );
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 1500);
    this.priceText.set('');
    this.packs.set(1);
    this.offer.set(false);
  }

  protected remove(id: number): void {
    if (confirm('Eliminare questo acquisto dallo storico?')) void this.pantry.deletePrice(id);
  }

  // Storico
  protected readonly filterProduct = signal('');
  protected readonly filterStore = signal('');

  protected readonly months = computed(() => {
    const fp = this.filterProduct();
    const fs = this.filterStore();
    const all = this.pantry.prices();
    // prezzo più basso per prodotto+formato (non in offerta esclusa: conta tutto ciò che hai pagato)
    const best = new Map<string, number>();
    for (const e of all) {
      const k = `${e.productId}|${e.formatId}`;
      best.set(k, Math.min(best.get(k) ?? Infinity, e.price));
    }
    const rows = all
      .filter((e) => (!fp || e.productId === fp) && (!fs || e.store === fs))
      .sort((a, b) => b.date.localeCompare(a.date) || (b.id ?? 0) - (a.id ?? 0))
      .map((e) => {
        const p = this.pantry.product(e.productId);
        const multi = (all.filter((x) => x.productId === e.productId && x.formatId === e.formatId).length ?? 0) > 1;
        return {
          ...e,
          packs: e.packs ?? 1,
          name: p?.name ?? e.productId,
          storeName: STORES.find((s) => s.id === e.store)?.name ?? e.store,
          formatLabel: p?.formats.find((f) => f.id === e.formatId)?.label ?? '',
          best: multi && e.price === best.get(`${e.productId}|${e.formatId}`),
        };
      });
    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = r.date.slice(0, 7);
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    return [...groups].map(([key, items]) => ({
      key,
      date: `${key}-01`,
      items,
      total: items.reduce((s, r) => s + r.price * r.packs, 0),
    }));
  });
}
