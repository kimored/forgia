import { Injectable, computed, signal } from '@angular/core';
import { toInfo, variantGroups, type LibraryEntry } from '../domain/exercise-library';
import { italianExerciseName } from '../domain/exercise-names';
import { EXERCISES } from '../domain/workout';
import type { ExerciseInfo } from '../models/workout';

const curatedById = new Map(EXERCISES.map((e) => [e.id, e]));
const curatedByDb = new Map(EXERCISES.map((e) => [e.db, e]));

/** Catalogo completo degli esercizi, caricato alla prima richiesta (e poi in cache offline). */
@Injectable({ providedIn: 'root' })
export class ExerciseLibraryService {
  private readonly entries = signal<LibraryEntry[] | null>(null);
  private loading: Promise<void> | null = null;

  readonly all = computed(() => this.entries() ?? []);
  readonly loaded = computed(() => this.entries() !== null);
  private readonly byId = computed(() => new Map(this.all().map((e) => [e.id, e])));

  load(): Promise<void> {
    this.loading ??= fetch(new URL('data/exercise-library.json', document.baseURI))
      .then((r) => r.json() as Promise<LibraryEntry[]>)
      .then((list) => this.entries.set(list))
      .catch((e) => {
        this.loading = null;
        throw e;
      });
    return this.loading;
  }

  /** Esercizio per id: uno dei 23 curati, oppure uno del catalogo (id del database). */
  lookup = (id: string): ExerciseInfo => {
    const curated = curatedById.get(id);
    if (curated) return curated;
    const entry = this.byId().get(id);
    if (entry) return toInfo(entry, curatedByDb.get(entry.id));
    // Catalogo non ancora caricato o esercizio rimosso: segnaposto leggibile.
    return { id, name: id.replace(/_/g, ' '), db: id, primary: [], secondary: [], compound: false, increment: 2.5, tips: [], images: [] };
  };

  /** Voce del database corrispondente a un esercizio (anche per quelli curati). */
  entryFor(info: ExerciseInfo): LibraryEntry | undefined {
    return this.byId().get(info.db);
  }

  /** Nome da mostrare: quello dei nostri esercizi, altrimenti la traduzione a regole. */
  italianName = (dbId: string): string | undefined => {
    const curated = curatedByDb.get(dbId)?.name;
    if (curated) return curated;
    const entry = this.byId().get(dbId);
    return entry ? (italianExerciseName(entry.name) ?? undefined) : undefined;
  };

  /** Esercizio da mostrare per una voce del catalogo (con nome italiano se è dei nostri). */
  info(entry: LibraryEntry): ExerciseInfo {
    const curated = curatedByDb.get(entry.id);
    return curated ? toInfo(entry, curated) : toInfo(entry);
  }

  variants(info: ExerciseInfo): { same: ExerciseInfo[]; related: ExerciseInfo[]; movement: string | null } {
    const entry = this.entryFor(info);
    if (!entry) return { same: [], related: [], movement: null };
    const g = variantGroups(entry, this.all());
    return { movement: g.movement, same: g.same.map((e) => this.info(e)), related: g.related.map((e) => this.info(e)) };
  }
}
