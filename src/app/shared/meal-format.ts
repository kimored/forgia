import type { Catalog } from '../core/domain/catalog';
import type { MealSlot, Portion, SlotDef } from '../core/models/plan';

export interface SlotMeta {
  label: string;
  color: string;
  emoji: string;
}

const COLORS: Record<NonNullable<SlotDef['color']>, string> = {
  colazione: 'var(--c-colazione)',
  spuntino: 'var(--c-spuntino)',
  pranzo: 'var(--c-pranzo)',
  cena: 'var(--c-cena)',
  post: 'var(--c-post)',
  arco: 'var(--c-integratori)',
};

/** Etichetta, colore ed emoji di uno slot, dal piano (con ripieghi sensati). */
export function slotMeta(catalog: Catalog, slot: MealSlot): SlotMeta {
  const def = catalog.slot(slot);
  return {
    label: def?.label ?? slot,
    color: COLORS[def?.color ?? 'spuntino'],
    emoji: def?.emoji ?? (def?.allowance ? '🧺' : '🍴'),
  };
}

export interface PortionView {
  qty: string;
  name: string;
  note?: string;
}

/** "120 g Pasta", "1 bicchiere Latte (200 ml)", "q.b. Salsa di pomodoro". */
export function portionView(catalog: Catalog, p: Portion): PortionView {
  const food = catalog.foods.get(p.food);
  const unit = food?.unit ?? 'g';
  const grams = unit === 'pz' ? `${p.qty}` : `${p.qty} ${unit}`;
  const note = [p.measure && p.qty ? grams : null, p.note].filter(Boolean).join(' · ') || undefined;
  return {
    qty: p.measure ?? (p.qty ? grams : 'q.b.'),
    name: food?.name ?? p.food,
    note,
  };
}

/** Riga compatta "120 g pasta · 80 g tonno …" per le liste. */
export function portionsLine(catalog: Catalog, portions: Portion[]): string {
  return portions
    .filter((p) => p.food !== 'olio')
    .map((p) => {
      const v = portionView(catalog, p);
      return `${v.qty} ${v.name.toLowerCase()}`;
    })
    .join(' · ');
}
