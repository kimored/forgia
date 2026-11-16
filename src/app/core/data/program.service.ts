import { Injectable, computed, inject, signal } from '@angular/core';
import { PROGRAM } from '../domain/workout';
import type { WorkoutProgram } from '../models/workout';
import { ExerciseLibraryService } from './exercise-library.service';
import { KvService } from './kv.service';

const KEY = 'workout-program';

/**
 * Programma di allenamento attivo: quello di esempio oppure quello creato dall'utente
 * (con qualsiasi esercizio del catalogo). Sta in IndexedDB ed entra nel backup.
 */
@Injectable({ providedIn: 'root' })
export class ProgramService {
  private readonly kv = inject(KvService);
  private readonly library = inject(ExerciseLibraryService);
  private readonly doc = signal<WorkoutProgram>(PROGRAM);
  private readonly custom = signal(false);

  readonly program = this.doc.asReadonly();
  readonly isExample = computed(() => !this.custom());

  async load(): Promise<void> {
    const saved = await this.kv.get<WorkoutProgram>(KEY);
    if (saved?.phases?.length) {
      this.doc.set(saved);
      this.custom.set(true);
      // Un programma personale può usare esercizi del catalogo completo.
      await this.library.load().catch(() => undefined);
    }
  }

  async save(program: WorkoutProgram): Promise<void> {
    await this.kv.set(KEY, program);
    this.doc.set(program);
    this.custom.set(true);
  }

  async useExample(): Promise<void> {
    await this.kv.set(KEY, null);
    this.doc.set(PROGRAM);
    this.custom.set(false);
  }
}
