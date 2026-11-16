import { Injectable, computed, inject, signal } from '@angular/core';
import { liveQuery } from 'dexie';
import type { DayOptions, HabitLog, MealLog, MealStatus } from '../models/logs';
import type { MealSlot } from '../models/plan';
import { catalog } from '../domain/catalog';
import { addDays, type IsoDate } from '../domain/dates';
import { resolveDay, type ResolvedDay } from '../domain/day-plan';
import { variantsFor, type DayResolver, type Variant } from '../domain/rules';
import { db } from './db';
import { ProfileService } from './profile.service';

/**
 * Stato giornaliero reattivo: log dei pasti, opzioni del giorno e abitudini (IndexedDB → signals).
 * I dataset sono piccoli (qualche migliaio di righe in anni), quindi si tengono tutti in memoria.
 */
@Injectable({ providedIn: 'root' })
export class DayStore {
  private readonly profiles = inject(ProfileService);

  private readonly logs = signal<MealLog[]>([]);
  private readonly options = signal<DayOptions[]>([]);
  private readonly habitRows = signal<HabitLog[]>([]);

  private readonly logsByDate = computed(() => groupBy(this.logs(), (l) => l.date));
  private readonly optionsByDate = computed(() => new Map(this.options().map((o) => [o.date, o])));
  readonly habitsByDate = computed(() => new Map(this.habitRows().map((h) => [h.date, h])));

  constructor() {
    liveQuery(() => db.mealLogs.toArray()).subscribe((v) => this.logs.set(v));
    liveQuery(() => db.dayOptions.toArray()).subscribe((v) => this.options.set(v));
    liveQuery(() => db.habits.toArray()).subscribe((v) => this.habitRows.set(v));
  }

  /** Resolver memoizzato: si ricrea quando cambiano log, opzioni o profilo. */
  readonly resolver = computed<DayResolver>(() => {
    const profile = this.profiles.effective();
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
    return variantsFor(catalog, this.resolver(), date, slot);
  }

  habits(date: IsoDate): HabitLog {
    return this.habitsByDate().get(date) ?? { date };
  }

  /** Giorni consecutivi con la creatina presa, fino a oggi (oggi escluso se non ancora presa). */
  creatineStreak(date: IsoDate): number {
    const map = this.habitsByDate();
    let d = map.get(date)?.creatine ? date : addDays(date, -1);
    let n = 0;
    while (map.get(d)?.creatine) {
      n++;
      d = addDays(d, -1);
    }
    return n;
  }

  // ---------- Pasti ----------

  async setStatus(date: IsoDate, slot: MealSlot, status: MealStatus): Promise<void> {
    const current = await db.mealLogs.get([date, slot]);
    if (status === 'todo' && !current?.optionId) {
      await db.mealLogs.delete([date, slot]);
      return;
    }
    await db.mealLogs.put({ date, slot, status, optionId: current?.optionId, at: new Date().toISOString() });
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
    if (optionId === planned) {
      if (status === 'todo') await db.mealLogs.delete([date, slot]);
      else await db.mealLogs.put({ date, slot, status, at: new Date().toISOString() });
      return;
    }
    await db.mealLogs.put({ date, slot, status, optionId, at: new Date().toISOString() });
  }

  async resetToPlan(date: IsoDate, slot: MealSlot): Promise<void> {
    await db.mealLogs.delete([date, slot]);
  }

  // ---------- Opzioni del giorno ----------

  async setOption(date: IsoDate, patch: Partial<Omit<DayOptions, 'date'>>): Promise<void> {
    const current = (await db.dayOptions.get(date)) ?? { date };
    await db.dayOptions.put({ ...current, ...patch });
  }

  // ---------- Abitudini ----------

  private async patchHabits(date: IsoDate, fn: (h: HabitLog) => HabitLog): Promise<void> {
    await db.transaction('rw', db.habits, async () => {
      const current = (await db.habits.get(date)) ?? { date };
      await db.habits.put(fn(current));
    });
  }

  toggleCreatine(date: IsoDate): Promise<void> {
    return this.patchHabits(date, (h) => ({ ...h, creatine: !h.creatine }));
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
