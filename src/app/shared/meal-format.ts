import { catalog } from '../core/domain/catalog';
import type { MealSlot, Portion } from '../core/models/plan';

export interface SlotMeta {
  label: string;
  color: string;
  emoji: string;
}

export const SLOT_META: Record<MealSlot, SlotMeta> = {
  colazione: { label: 'Colazione', color: 'var(--c-colazione)', emoji: '☕' },
  spuntino1: { label: 'Spuntino', color: 'var(--c-spuntino)', emoji: '🥪' },
  pranzo: { label: 'Pranzo', color: 'var(--c-pranzo)', emoji: '🍝' },
  spuntino2: { label: 'Spuntino', color: 'var(--c-spuntino)', emoji: '🥣' },
  cena: { label: 'Cena', color: 'var(--c-cena)', emoji: '🍽️' },
  post: { label: 'Post-allenamento', color: 'var(--c-post)', emoji: '🥤' },
};

export interface PortionView {
  qty: string;
  name: string;
  note?: string;
}

export function portionView(p: Portion): PortionView {
  const food = catalog.food(p.food);
  const qty = food.unit === 'pz' ? `${p.qty}` : `${p.qty} ${food.unit}`;
  return { qty, name: food.name, note: p.note };
}

/** Riga compatta "120 g pasta · 80 g tonno …" per le liste. */
export function portionsLine(portions: Portion[]): string {
  return portions
    .filter((p) => p.food !== 'olio')
    .map((p) => {
      const v = portionView(p);
      return `${v.qty} ${v.name.toLowerCase()}`;
    })
    .join(' · ');
}
