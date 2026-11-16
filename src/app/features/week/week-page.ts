import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { DayStore } from '../../core/data/day.store';
import { addDays, mondayOf, parseIsoDate, today, WEEKDAY_SHORT, type IsoDate } from '../../core/domain/dates';
import type { ResolvedMeal } from '../../core/domain/day-plan';
import { weekSummary, weekWarnings } from '../../core/domain/rules';
import type { MealSlot } from '../../core/models/plan';
import { slotMeta } from '../../shared/meal-format';

interface Cell {
  meal: ResolvedMeal | null;
  title: string;
  status: 'todo' | 'done' | 'skipped';
  replaced: boolean;
  tags: string[];
}

@Component({
  selector: 'app-week-page',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './week-page.html',
  styleUrl: './week-page.scss',
})
export class WeekPage {
  private readonly store = inject(DayStore);
  protected meta(slot: MealSlot) {
    return slotMeta(this.catalog(), slot);
  }
  private readonly router = inject(Router);

  protected readonly monday = signal<IsoDate>(mondayOf(today()));
  protected readonly todayDate = today();
  protected readonly catalog = this.store.catalog;
  /** Slot del piano (righe della griglia), con etichetta e colore. */
  protected readonly slots = computed(() => this.catalog().slots.map((s) => ({ id: s.id, ...slotMeta(this.catalog(), s.id) })));

  protected readonly days = computed(() =>
    Array.from({ length: 7 }, (_, i) => {
      const date = addDays(this.monday(), i);
      return { date, jsDate: parseIsoDate(date), short: WEEKDAY_SHORT[i], day: this.store.day(date) };
    }),
  );
  protected readonly isThisWeek = computed(() => this.monday() === mondayOf(today()));
  protected readonly cycleWeek = computed(() => this.days()[0].day.week);
  protected readonly range = computed(() => ({
    from: this.days()[0].jsDate,
    to: this.days()[6].jsDate,
  }));
  protected readonly summary = computed(() => weekSummary(this.catalog(), this.store.resolver(), this.monday()));
  protected readonly warnings = computed(() => weekWarnings(this.catalog(), this.store.resolver(), this.monday()));

  /** Griglia: righe = slot, colonne = giorni. */
  protected readonly grid = computed(() =>
    this.slots()
      .map((s) => ({
        slot: s.id,
        meta: s,
        cells: this.days().map((d) => this.cell(d.day.meals.find((m) => m.slot === s.id) ?? null)),
      }))
      .filter((row) => row.cells.some((c) => c.meal)),
  );

  /** Per il telefono: un elenco per giorno. */
  protected readonly list = computed(() =>
    this.days().map((d) => ({
      ...d,
      cells: d.day.meals.map((m) => this.cell(m)),
    })),
  );

  private cell(meal: ResolvedMeal | null): Cell {
    if (!meal) return { meal: null, title: '', status: 'todo', replaced: false, tags: [] };
    const tags: string[] = [];
    const catalog = this.catalog();
    if (meal.option) {
      if (catalog.hasTag(meal.option, 'pesce')) tags.push('🐟');
      if (catalog.hasTag(meal.option, 'carne-rossa')) tags.push('🥩');
      if (catalog.hasTag(meal.option, 'legume')) tags.push('🫘');
    }
    return {
      meal,
      title: meal.free ? 'Libero' : meal.option!.title,
      status: meal.log?.status ?? 'todo',
      replaced: !!meal.log?.optionId && meal.log.optionId !== meal.planned?.id,
      tags,
    };
  }

  protected go(weeks: number): void {
    this.monday.update((m) => addDays(m, weeks * 7));
  }

  protected goThisWeek(): void {
    this.monday.set(mondayOf(today()));
  }

  protected open(date: IsoDate, slot?: MealSlot): void {
    void this.router.navigate(['/oggi'], { queryParams: { d: date, pasto: slot ?? null } });
  }
}
