import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PantryStore } from '../../core/data/pantry.store';
import { today } from '../../core/domain/dates';
import { defaultFormat } from '../../core/domain/pantry';
import { STORES, type Store } from '../../core/models/pantry';
import { formatEur } from '../../shared/qty-format';
import { Icon } from '../../shared/ui/icon';
import { KvService } from '../../core/data/kv.service';
import { IGNORE, matchProduct, normalize, parseReceipt } from '../../core/domain/receipt';
import { OcrLoadError, OcrService } from '../../core/platform/ocr.service';

interface ReviewRow {
  text: string;
  productId: string;
  packs: number;
  priceText: string;
}

const LEARNED_KEY = 'receipt-matches';

/** Storico degli acquisti: cosa, quanto e dove, per confrontare i prezzi nel tempo. */
@Component({
  selector: 'app-purchases-page',
  imports: [DatePipe, DecimalPipe, RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="head">
      <a class="icon-btn" routerLink="/dispensa" aria-label="Torna alla dispensa"><app-icon name="back" /></a>
      <h1>Acquisti e prezzi</h1>
    </div>

    <section class="card scan">
      @if (!review()) {
        <label class="btn primary file">
          📷 Carica scontrino
          <input type="file" accept="image/*" (change)="scan($any($event.target))" [disabled]="scanning()" />
        </label>
        @if (scanning()) {
          <p class="muted small">Leggo lo scontrino… {{ ocr.progress() !== null ? (ocr.progress()! * 100 | number: '1.0-0') + '%' : '' }}</p>
        } @else {
          <p class="muted small">Foto dritta e ben illuminata, scontrino intero. La lettura avviene sul telefono, gratis.</p>
        }
        @if (scanError()) { <p class="error">{{ scanError() }}</p> }
      } @else {
        <h2>Controlla lo scontrino</h2>
        <div class="row">
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
        <ul class="review">
          @for (r of review(); track $index; let i = $index) {
            <li [class.off]="!r.productId">
              <span class="raw">{{ r.text }}</span>
              <select [attr.aria-label]="'Prodotto per ' + r.text" (change)="patchRow(i, { productId: $any($event.target).value })">
                <option value="" [selected]="!r.productId">— ignora —</option>
                @for (p of products(); track p.id) { <option [value]="p.id" [selected]="p.id === r.productId">{{ p.name }}</option> }
              </select>
              <input type="number" min="1" class="packs" [attr.aria-label]="'Confezioni ' + r.text" [value]="r.packs"
                     (input)="patchRow(i, { packs: Math.max(1, +$any($event.target).value || 1) })" />
              <input type="text" inputmode="decimal" class="price" placeholder="€" [attr.aria-label]="'Prezzo totale ' + r.text" [value]="r.priceText"
                     (input)="patchRow(i, { priceText: $any($event.target).value })" />
            </li>
          }
        </ul>
        <p class="muted small">Prezzo = totale della riga. Le righe senza prodotto o senza prezzo non vengono salvate; gli abbinamenti che scegli li ricordo per la prossima volta.</p>
        <label class="check"><input type="checkbox" [checked]="toPantry()" (change)="toPantry.set($any($event.target).checked)" /> Aggiungi anche in dispensa</label>
        <div class="actions">
          <button type="button" class="btn primary" [disabled]="!store() || !reviewCount()" (click)="saveReview()">Salva {{ reviewCount() }} acquisti</button>
          <button type="button" class="btn ghost" (click)="review.set(null)">Annulla</button>
        </div>
      }
    </section>

    <section class="card form">
      <h2>Nuovo acquisto a mano</h2>
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
    .scan { display: grid; gap: 10px; }
    .file { position: relative; overflow: hidden; justify-self: start; }
    .file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .error { color: var(--danger); margin: 0; }
    .review li { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.5fr) 56px 76px; gap: 6px; align-items: center; }
    .review li.off .raw { opacity: 0.5; text-decoration: line-through; }
    .raw { font-family: ui-monospace, monospace; font-size: 0.78rem; overflow-wrap: anywhere; }
    .review input, .review select { padding: 0 8px; font-size: 0.9rem; }
    @media (max-width: 560px) { .review li { grid-template-columns: 1fr 56px 76px; } .review .raw { grid-column: 1 / -1; } }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  `,
})
export class PurchasesPage {
  private readonly pantry = inject(PantryStore);
  private readonly kv = inject(KvService);
  protected readonly ocr = inject(OcrService);

  // ---------- Scontrino ----------
  protected readonly scanning = signal(false);
  protected readonly scanError = signal('');
  protected readonly review = signal<ReviewRow[] | null>(null);
  protected readonly reviewCount = computed(() => (this.review() ?? []).filter((r) => r.productId && this.money(r.priceText) !== null).length);

  private money(t: string): number | null {
    const n = parseFloat(t.replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  protected async scan(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.scanning.set(true);
    this.scanError.set('');
    try {
      const { lines } = await this.ocr.documentLines(file);
      const receipt = parseReceipt(lines.map((l) => l.text));
      if (!receipt.lines.length) throw new Error('empty');
      const learned = (await this.kv.get<Record<string, string>>(LEARNED_KEY)) ?? {};
      const products = this.pantry.products();
      this.review.set(
        receipt.lines.map((l) => ({
          text: l.text,
          productId: matchProduct(l.text, products, learned)?.id ?? '',
          packs: l.packs,
          priceText: l.total !== null ? l.total.toFixed(2).replace('.', ',') : '',
        })),
      );
      if (receipt.store) this.store.set(receipt.store);
      this.date.set(receipt.date && receipt.date <= today() ? receipt.date : today());
    } catch (e) {
      this.scanError.set(
        e instanceof OcrLoadError
          ? 'Non riesco a caricare il lettore di testo: serve la connessione la prima volta.'
          : 'Non ho trovato articoli. Riprova con una foto più nitida e dritta, oppure inserisci a mano qui sotto.',
      );
    } finally {
      this.scanning.set(false);
    }
  }

  protected patchRow(i: number, patch: Partial<ReviewRow>): void {
    this.review.update((rows) => rows!.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  protected async saveReview(): Promise<void> {
    const rows = this.review();
    const store = this.store();
    if (!rows || !store) return;
    const learned = (await this.kv.get<Record<string, string>>(LEARNED_KEY)) ?? {};
    for (const r of rows) {
      learned[normalize(r.text)] = r.productId || IGNORE;
      const total = this.money(r.priceText);
      const p = this.pantry.product(r.productId);
      if (!p || total === null) continue;
      await this.pantry.recordPurchase(
        { productId: p.id, formatId: defaultFormat(p).id, store, date: this.date(), price: Math.round((total / r.packs) * 100) / 100, packs: r.packs },
        p.tracked && this.toPantry(),
      );
    }
    await this.kv.set(LEARNED_KEY, learned);
    this.review.set(null);
  }

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
