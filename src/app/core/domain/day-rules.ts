import type { Catalog } from './catalog';
import { activeToggles, type ResolvedDay } from './day-plan';

/** Consigli della card "Regola del giorno": solo quelli scritti nel piano. */
export function dayTips(catalog: Catalog, day: ResolvedDay): string[] {
  const tips = catalog.tips
    .filter((t) => (t.weekday === undefined || t.weekday === day.weekday) && (t.gym === undefined || t.gym === day.gym))
    .map((t) => t.text);
  const { swaps, extras } = activeToggles(catalog, day.options, day.weekday, day.gym);
  for (const s of swaps) tips.push(`${s.label}: attivo.`);
  for (const e of extras) tips.push(`${e.label}: +${e.add} g a ${(catalog.slot(e.slot)?.label ?? e.slot).toLowerCase()}.`);
  return tips;
}

/** Opzioni del giorno che il piano prevede per questa data (pulsanti nella card). */
export function dayToggles(catalog: Catalog, day: ResolvedDay) {
  const on = day.options.toggles ?? {};
  return catalog.rules
    .filter((r) => (r.type === 'day-swap' && r.weekday === day.weekday) || (r.type === 'day-extra' && !(r.restDaysOnly && day.gym)))
    .map((r) => ({ id: (r as { id: string }).id, label: (r as { label: string }).label, on: !!on[(r as { id: string }).id] }));
}
