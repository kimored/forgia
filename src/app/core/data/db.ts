import Dexie, { type Table } from 'dexie';
import type { DayOptions, HabitLog, MealLog } from '../models/logs';
import type { PantryItem, PriceEntry, ShoppingList } from '../models/pantry';

/** Record chiave/valore per impostazioni, profilo e metadati dell'app. */
export interface KeyValue<T = unknown> {
  key: string;
  value: T;
}

export interface WeightEntry {
  date: string;
  kg: number;
  fatPct?: number;
  muscleKg?: number;
  bmrKcal?: number;
}

export interface MeasurementEntry {
  date: string;
  waistCm?: number;
  armCm?: number;
  chestCm?: number;
  thighCm?: number;
}

/**
 * Database locale (IndexedDB). Contiene SOLO dati utente: restano sul dispositivo
 * e finiscono nell'export JSON di backup.
 */
export class ForgiaDb extends Dexie {
  kv!: Table<KeyValue, string>;
  mealLogs!: Table<MealLog, [string, string]>;
  dayOptions!: Table<DayOptions, string>;
  habits!: Table<HabitLog, string>;
  weights!: Table<WeightEntry, string>;
  measurements!: Table<MeasurementEntry, string>;
  pantry!: Table<PantryItem, string>;
  prices!: Table<PriceEntry, number>;
  shoppingLists!: Table<ShoppingList, number>;

  constructor(name = 'forgia') {
    super(name);
    this.version(1).stores({
      kv: 'key',
    });
    this.version(2).stores({
      mealLogs: '[date+slot], date',
      dayOptions: 'date',
      habits: 'date',
      weights: 'date',
      measurements: 'date',
    });
    this.version(3).stores({
      pantry: 'productId',
      prices: '++id, productId, date',
      shoppingLists: '++id, createdAt',
    });
  }
}

export const db = new ForgiaDb();
