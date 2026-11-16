import { Injectable, computed, inject, signal } from '@angular/core';
import { liveQuery } from 'dexie';
import type { DayOptions, HabitLog, MealLog, MealStatus } from '../models/logs';
import type { MealSlot } from '../models/plan';
import { addDays, type IsoDate } from '../domain/dates';
import { resolveDay, type ResolvedDay } from '../domain/day-plan';
import { variantsFor, type DayResolver, type Variant } from '../domain/rules';
import { mealConsumption } from '../domain/pantry';
import { db } from './db';
import { adjustStock } from './pantry.repo';
import { PlanService } from './plan.service';
import { ProfileService } from './profile.service';
import { SettingsService } from './settings.service';

/**
 * Stato giornaliero reattivo: log dei pasti, opzioni del giorno e abitudini (IndexedDB → signals).
 * I dataset sono piccoli (qualche migliaio di righe in anni), quindi si tengono tutti in memoria.
 */
@Injectable({ providedIn: 'root' })
export class DayStore {
  private readonly profiles = inject(ProfileService);
  private readonly settings = inject(SettingsService);
  private readonly plans = inject(PlanService);
  readonly catalog = this.plans.catalog;

  private readonly logs = signal<MealLog[]>([]);
  private readonly options = signal<DayOptions[]>([]);
  private readonly habitRows = signal<HabitLog[]>([]);

  private readonly logsByDate = computed(() => groupBy(this.logs(), (l) => l.date));
  private readonly optionsByDate = computed(() => new Map(this.options().map((o) => [o.date, o])));
  readonly habitsByDate = computed(() => new Map(this.habitRows().map((h) => [h.date, h])));

  /** Orari: quelli del profilo, altrimenti quelli del piano. */
  private readonly times = computed(() => {
    const own = this.profiles.effective().times;
    const out: Record<string, string> = {};
    for (const s of this.catalog().slots) if (s.time) out[s.id] = s.time;
    return { ...out, ...own };
  });

  constructor() {
    liveQuery(() => db.mealLogs.toArray()).subscribe((v) => this.logs.set(v));
    liveQuery(() => db.dayOptions.toArray()).subscribe((v) => this.options.set(v));
    liveQuery(() => db.habits.toArray()).subscribe((v) => this.habitRows.set(v));
  }

  private dayProfile() {
    const p = this.profiles.effective();
    return { startDate: p.startDate, gymDays: p.gymDays, weekOrder: p.weekOrder, times: this.times() };
  }

  /** Resolver memoizzato: si ricrea quando cambiano piano, log, opzioni o profilo. */
  readonly resolver = computed<DayResolver>(() => {
    const catalog = this.catalog();
    const profile = this.dayProfile();
    const logs = this.logsByDate();
    const options = this.optionsByDate();
    const cache = new Map<IsoDate, ResolvedDay>();
    return (date) => {
      let day = cache.get(date);
      if (!day) {
        day = resolveDay(catalog, { date, profile, logs: logs.get(date), options: options.get(date) });
        cache.set(date, day);
      }
      return day;
    };
  });

  day(date: IsoDate): ResolvedDay {
    return this.resolver()(date);
  }

  variants(date: IsoDate, slot: MealSlot): Variant[] {
    return variantsFor(this.catalog(), this.resolver(), date, slot);
  }

  habits(date: IsoDate): HabitLog {
    return this.habitsByDate().get(date) ?? { date };
  }

  /** Giorni consecutivi con l'abitudine spuntata, fino a oggi (oggi escluso se non ancora fatta). */
  habitStreak(date: IsoDate, habitId: string): number {
    const map = this.habitsByDate();
    const done = (d: IsoDate) => !!map.get(d)?.done?.[habitId];
    let d = done(date) ? date : addDays(date, -1);
    let n = 0;
    while (done(d)) {
      n++;
      d = addDays(d, -1);
    }
    return n;
  }

  // ---------- Pasti ----------

  private get autoDeduct(): boolean {
    return this.settings.settings().pantryAutoDeduct;
  }

  /** Il pasto risolto come sarebbe con una certa sostituzione (undefined = previsto). */
  private mealWith(date: IsoDate, slot: MealSlot, optionId: string | undefined) {
    const others = (this.logsByDate().get(date) ?? []).filter((l) => l.slot !== slot);
    const logs: MealLog[] = optionId ? [...others, { date, slot, status: 'todo', optionId, at: '' }] : others;
    const day = resolveDay(this.catalog(), { date, profile: this.dayProfile(), logs, options: this.optionsByDate().get(date) });
    return day.meals.find((m) => m.slot === slot);
  }

  private async consume(date: IsoDate, slot: MealSlot, optionId: string | undefined, sign: 1 | -1): Promise<void> {
    const meal = this.mealWith(date, slot, optionId);
    if (meal && !meal.free) await adjustStock(mealConsumption(this.catalog(), meal), sign);
  }

  async setStatus(date: IsoDate, slot: MealSlot, status: MealStatus): Promise<void> {
    const current = await db.mealLogs.get([date, slot]);
    if (status === 'todo' && !current?.optionId) await db.mealLogs.delete([date, slot]);
    else await db.mealLogs.put({ date, slot, status, optionId: current?.optionId, at: new Date().toISOString() });

    // Scalo automatico: un pasto che diventa fatto consuma la dispensa, e viceversa.
    const wasDone = current?.status === 'done';
    const isDone = status === 'done';
    if (this.autoDeduct && wasDone !== isDone) await this.consume(date, slot, current?.optionId, isDone ? -1 : 1);
  }

  async toggleDone(date: IsoDate, slot: MealSlot): Promise<void> {
    const current = await db.mealLogs.get([date, slot]);
    await this.setStatus(date, slot, current?.status === 'done' ? 'todo' : 'done');
  }

  /** Sostituisce il pasto (o torna al previsto se `optionId` è quello del piano). */
  async replace(date: IsoDate, slot: MealSlot, optionId: string): Promise<void> {
    const planned = this.day(date).meals.find((m) => m.slot === slot)?.planned?.id;
    const current = await db.mealLogs.get([date, slot]);
    const status = current?.status ?? 'todo';
    const next = optionId === planned ? undefined : optionId;

    if (!next && status === 'todo') await db.mealLogs.delete([date, slot]);
    else await db.mealLogs.put({ date, slot, status, optionId: next, at: new Date().toISOString() });

    // Pasto già fatto: si restituisce il vecchio e si scala il nuovo.
    if (this.autoDeduct && status === 'done') {
      await this.consume(date, slot, current?.optionId, 1);
      await this.consume(date, slot, next, -1);
    }
  }

  async resetToPlan(date: IsoDate, slot: MealSlot): Promise<void> {
    const current = await db.mealLogs.get([date, slot]);
    await db.mealLogs.delete([date, slot]);
    if (this.autoDeduct && current?.status === 'done') await this.consume(date, slot, current.optionId, 1);
  }

  // ---------- Opzioni del giorno (previste dal piano) ----------

  async toggleOption(date: IsoDate, id: string): Promise<void> {
    const current = (await db.dayOptions.get(date)) ?? { date };
    const toggles = { ...current.toggles, [id]: !current.toggles?.[id] };
    await db.dayOptions.put({ ...current, toggles });
  }

  // ---------- Abitudini ----------

  private async patchHabits(date: IsoDate, fn: (h: HabitLog) => HabitLog): Promise<void> {
    await db.transaction('rw', db.habits, async () => {
      const current = (await db.habits.get(date)) ?? { date };
      await db.habits.put(fn(current));
    });
  }

  async toggleHabit(date: IsoDate, habitId: string): Promise<void> {
    const habit = this.catalog().habits.find((h) => h.id === habitId);
    const taken = !this.habits(date).done?.[habitId];
    await this.patchHabits(date, (h) => ({ ...h, done: { ...h.done, [habitId]: taken } }));
    // Se nei giorni di palestra è già in un pasto, non si scala due volte.
    if (this.autoDeduct && habit?.food && habit.qty && !(habit.includedOnGymDays && this.day(date).gym)) {
      await adjustStock([{ productId: habit.food, qty: habit.qty }], taken ? -1 : 1);
    }
  }

  addWater(date: IsoDate, ml: number): Promise<void> {
    return this.patchHabits(date, (h) => ({ ...h, waterMl: Math.max(0, (h.waterMl ?? 0) + ml) }));
  }

  toggleReminder(date: IsoDate, id: string): Promise<void> {
    return this.patchHabits(date, (h) => {
      const set = new Set(h.reminders ?? []);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...h, reminders: [...set] };
    });
  }
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}
