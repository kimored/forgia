import { Injectable, computed, inject, signal } from '@angular/core';
import { defaultProfile, type Profile } from '../models/profile';
import { mondayOf, today } from '../domain/dates';
import { KvService } from './kv.service';

const KEY = 'profile';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly kv = inject(KvService);

  /** undefined = in caricamento, null = configurazione iniziale da fare. */
  private readonly state = signal<Profile | null | undefined>(undefined);
  readonly profile = this.state.asReadonly();
  readonly configured = computed(() => !!this.state());

  /** Profilo valido anche prima della configurazione (valori di default). */
  readonly effective = computed<Profile>(() => this.state() ?? defaultProfile(mondayOf(today())));

  async load(): Promise<void> {
    this.state.set((await this.kv.get<Profile>(KEY)) ?? null);
  }

  async save(profile: Profile): Promise<void> {
    const next: Profile = { ...profile, startDate: mondayOf(profile.startDate), updatedAt: new Date().toISOString() };
    await this.kv.set(KEY, next);
    this.state.set(next);
  }

  /** Bozza per la configurazione iniziale: inizio il lunedì di questa settimana. */
  draft(): Profile {
    return structuredClone(this.state() ?? defaultProfile(mondayOf(today())));
  }
}
