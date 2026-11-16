import { Injectable, inject, signal } from '@angular/core';
import { KvService } from './kv.service';

export interface AppSettings {
  /** Scala la dispensa quando un pasto viene segnato come fatto. */
  pantryAutoDeduct: boolean;
  /** Avviso quando un prodotto finisce entro N giorni. */
  alertDays: number;
}

const KEY = 'settings';
const DEFAULTS: AppSettings = { pantryAutoDeduct: true, alertDays: 3 };

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly kv = inject(KvService);
  private readonly state = signal<AppSettings>(DEFAULTS);
  readonly settings = this.state.asReadonly();

  async load(): Promise<void> {
    this.state.set({ ...DEFAULTS, ...(await this.kv.get<Partial<AppSettings>>(KEY)) });
  }

  async update(patch: Partial<AppSettings>): Promise<void> {
    const next = { ...this.state(), ...patch };
    this.state.set(next);
    await this.kv.set(KEY, next);
  }
}
