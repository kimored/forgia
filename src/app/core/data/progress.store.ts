import { Injectable, computed, inject, signal } from '@angular/core';
import { liveQuery } from 'dexie';
import { db, type MeasurementEntry, type WeightEntry } from './db';
import { ProfileService } from './profile.service';

/** Pesate e misure (IndexedDB → signals). */
@Injectable({ providedIn: 'root' })
export class ProgressStore {
  private readonly profiles = inject(ProfileService);
  private readonly weightRows = signal<WeightEntry[]>([]);
  private readonly measureRows = signal<MeasurementEntry[]>([]);

  readonly weights = computed(() => [...this.weightRows()].sort((a, b) => a.date.localeCompare(b.date)));
  readonly measurements = computed(() => [...this.measureRows()].sort((a, b) => a.date.localeCompare(b.date)));

  /** Punto di partenza: il peso del profilo, altrimenti la prima pesata. */
  readonly start = computed(() => {
    const p = this.profiles.effective();
    const first = this.weights()[0];
    const kg = p.startWeightKg ?? first?.kg;
    return kg === undefined ? null : { kg, date: p.startDate };
  });

  constructor() {
    liveQuery(() => db.weights.toArray()).subscribe((v) => this.weightRows.set(v));
    liveQuery(() => db.measurements.toArray()).subscribe((v) => this.measureRows.set(v));
  }

  /** Una pesata per giorno: la nuova sostituisce quella dello stesso giorno. */
  saveWeight(entry: WeightEntry): Promise<string> {
    return db.weights.put(entry);
  }

  deleteWeight(date: string): Promise<void> {
    return db.weights.delete(date);
  }

  saveMeasurement(entry: MeasurementEntry): Promise<string> {
    return db.measurements.put(entry);
  }

  deleteMeasurement(date: string): Promise<void> {
    return db.measurements.delete(date);
  }
}
