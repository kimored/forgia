import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { catalog } from '../../core/domain/catalog';
import type { ResolvedMeal } from '../../core/domain/day-plan';
import type { Variant } from '../../core/domain/rules';
import { parseIsoDate, type IsoDate } from '../../core/domain/dates';
import { SLOT_META, portionView, portionsLine } from '../../shared/meal-format';

const GROUP_LABEL: Record<Variant['group'], string> = {
  previsto: 'Previsto oggi',
  piano: 'Alternativa del piano',
  settimana: 'Dalla stessa settimana',
  altre: 'Altre varianti',
  extra: 'Sostituzioni extra',
};

/** Dettaglio di un pasto con tutte le varianti e gli avvisi delle regole. */
@Component({
  selector: 'app-meal-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './meal-detail.html',
  styleUrl: './meal-detail.scss',
})
export class MealDetail {
  readonly meal = input.required<ResolvedMeal>();
  readonly variants = input.required<Variant[]>();
  readonly date = input.required<IsoDate>();
  readonly pick = output<string>();
  readonly toggle = output<void>();
  readonly skip = output<void>();
  readonly reset = output<void>();

  protected readonly meta = computed(() => SLOT_META[this.meal().slot]);
  protected readonly portions = computed(() => this.meal().portions.map(portionView));
  protected readonly status = computed(() => this.meal().log?.status ?? 'todo');
  protected readonly replaced = computed(() => {
    const m = this.meal();
    return !!m.log?.optionId && m.log.optionId !== m.planned?.id;
  });

  /** Varianti raggruppate, con l'indice globale per lo stagger. */
  protected readonly groups = computed(() => {
    const groups: { label: string; items: { v: Variant; i: number; line: string }[] }[] = [];
    this.variants().forEach((v, i) => {
      const label = GROUP_LABEL[v.group];
      let g = groups.at(-1);
      if (g?.label !== label) groups.push((g = { label, items: [] }));
      g.items.push({ v, i, line: portionsLine(v.option.portions) });
    });
    return groups;
  });

  /** Frutta di stagione, per i pasti che la prevedono. */
  protected readonly fruits = computed(() => {
    if (!this.meal().portions.some((p) => p.food === 'frutta')) return null;
    const season = catalog.seasonFor(parseIsoDate(this.date()).getMonth() + 1);
    return season ? [...season.fruits, ...catalog.seasons.always].join(', ') : null;
  });
}
