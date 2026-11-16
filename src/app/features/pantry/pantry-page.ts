import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { PantryStore, SHOPPING_DAYS } from '../../core/data/pantry.store';
import { SettingsService } from '../../core/data/settings.service';
import { catalog } from '../../core/domain/catalog';
import { defaultFormat, product, productOwners } from '../../core/domain/pantry';
import { STORES, type Owner, type ShoppingItem, type ShoppingList, type Store } from '../../core/models/pantry';
import { formatEur, formatQty, stepFor } from '../../shared/qty-format';
import { BottomSheet } from '../../shared/ui/bottom-sheet';
import { CheckButton } from '../../shared/ui/check-button';
import { ProductSheet } from './product-sheet';

type Tab = 'dispensa' | 'spesa';
type Filter = 'tutti' | Owner;

const OWNERS = productOwners(catalog.meals.values());

@Component({
  selector: 'app-pantry-page',
  imports: [DatePipe, BottomSheet, ProductSheet, CheckButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pantry-page.html',
  styleUrl: './pantry-page.scss',
})
export class PantryPage {
  protected readonly store = inject(PantryStore);
  private readonly settings = inject(SettingsService);

  protected readonly tab = signal<Tab>('dispensa');
  protected readonly filter = signal<Filter>('tutti');
  protected readonly openId = signal<string | null>(null);
  protected readonly sheetOpen = signal(false);
  protected readonly stores = STORES;
  protected readonly eur = formatEur;
  protected readonly alertDays = computed(() => this.settings.settings().alertDays);
  protected readonly shoppingDays = SHOPPING_DAYS;

  protected readonly rows = computed(() => {
    const f = this.filter();
    const stock = this.store.stock();
    const forecasts = this.store.forecasts();
    const n = this.alertDays();
    return this.store.productsList
      .filter((p) => !p.untracked && (f === 'tutti' || OWNERS.get(p.id)?.has(f)))
      .map((p) => {
        const fc = forecasts.get(p.id);
        const qty = stock.get(p.id) ?? 0;
        const used = !!fc && fc.dailyAvg > 0;
        const known = stock.has(p.id);
        const alert = known && used && fc!.daysLeft !== null && fc!.daysLeft < n;
        return {
          p,
          qty,
          qtyLabel: formatQty(qty, p.unit),
          daily: used ? `${formatQty(fc!.dailyAvg, p.unit)}/giorno` : 'non in uso ora',
          daysLeft: fc?.daysLeft ?? null,
          runOut: fc?.runOut ?? null,
          used,
          known,
          alert,
          step: stepFor(p.unit, defaultFormat(p).qty),
        };
      })
      .sort((a, b) => Number(b.alert) - Number(a.alert) || Number(b.used) - Number(a.used) || (a.daysLeft ?? 999) - (b.daysLeft ?? 999));
  });

  protected openProduct(id: string): void {
    this.openId.set(id);
    this.sheetOpen.set(true);
  }

  // ---------- Lista spesa ----------

  protected readonly list = this.store.currentList;
  protected readonly closing = signal(false);
  protected readonly closeStore = signal<Store | null>(null);

  protected readonly sections = computed(() => {
    const l = this.list();
    if (!l) return [];
    const rows = l.items.map((item, index) => {
      const p = product(item.productId);
      const f = p.formats.find((x) => x.id === item.formatId) ?? defaultFormat(p);
      return {
        item,
        index,
        name: p.name,
        packsLabel: `${item.packs} × ${f.label}`,
        missingLabel: formatQty(item.missing, p.unit),
        estimate: item.price !== undefined ? item.price * item.packs : this.store.estimate(item),
      };
    });
    return (['mine', 'nonna'] as const)
      .map((owner) => {
        const items = rows.filter((r) => r.item.owner === owner);
        return {
          owner,
          title: owner === 'mine' ? 'La mia parte' : 'Per la nonna',
          items,
          total: items.reduce((s, r) => s + (r.estimate ?? 0), 0),
          unknown: items.filter((r) => r.estimate === null).length,
        };
      })
      .filter((s) => s.items.length);
  });

  /** Totale stimato per negozio (solo dove c'è almeno un prezzo registrato). */
  protected readonly storeTotals = computed(() => {
    const l = this.list();
    if (!l) return [];
    const prices = this.store.prices();
    return STORES.filter((s) => prices.some((h) => h.store === s.id))
      .map((s) => ({ ...s, total: l.items.reduce((sum, i) => sum + (this.store.estimate(i, s.id) ?? 0), 0) }))
      .sort((a, b) => a.total - b.total);
  });

  protected readonly progress = computed(() => {
    const l = this.list();
    return l ? { done: l.items.filter((i) => i.checked).length, total: l.items.length } : null;
  });

  protected toggleItem(list: ShoppingList, index: number): void {
    void this.store.updateItem(list, index, { checked: !list.items[index].checked });
  }

  protected setItemPrice(list: ShoppingList, index: number, value: string): void {
    const n = parseFloat(value.replace(',', '.'));
    void this.store.updateItem(list, index, { price: Number.isFinite(n) && n > 0 ? n / list.items[index].packs : undefined });
  }

  protected async close(list: ShoppingList): Promise<void> {
    const store = this.closeStore();
    if (!store) return;
    await this.store.closeList(list, store);
    this.closing.set(false);
    this.closeStore.set(null);
  }

  protected discard(list: ShoppingList): void {
    if (confirm('Eliminare la lista della spesa?')) void this.store.discardList(list);
  }

  protected async share(list: ShoppingList): Promise<void> {
    const lines = [`Lista spesa (${list.days} giorni)`];
    for (const s of this.sections()) {
      lines.push('', s.title.toUpperCase());
      for (const r of s.items) lines.push(`${r.item.checked ? '☑' : '☐'} ${r.name} – ${r.packsLabel}`);
    }
    const text = lines.join('\n');
    try {
      if (navigator.share) await navigator.share({ title: 'Lista spesa', text });
      else {
        await navigator.clipboard.writeText(text);
        alert('Lista copiata negli appunti.');
      }
    } catch {
      /* condivisione annullata */
    }
  }

  protected trackItem(_: number, r: { item: ShoppingItem; index: number }): string {
    return `${r.item.productId}-${r.item.owner}`;
  }
}
