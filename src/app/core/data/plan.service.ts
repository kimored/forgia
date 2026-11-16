import { Injectable, computed, inject, signal } from '@angular/core';
import { Catalog, EXAMPLE_PLAN, validatePlan } from '../domain/catalog';
import type { PlanDocument } from '../models/plan';
import { KvService } from './kv.service';

const KEY = 'plan';

export class PlanImportError extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join('\n'));
  }
}

/**
 * Piano alimentare attivo. È un dato dell'utente (lo carica dal file del nutrizionista)
 * e sta in IndexedDB; senza piano caricato si usa il piano di esempio.
 */
@Injectable({ providedIn: 'root' })
export class PlanService {
  private readonly kv = inject(KvService);
  private readonly doc = signal<PlanDocument>(EXAMPLE_PLAN);
  private readonly custom = signal(false);

  readonly plan = this.doc.asReadonly();
  readonly catalog = computed(() => new Catalog(this.doc()));
  readonly isExample = computed(() => !this.custom() || !!this.doc().meta.example);

  async load(): Promise<void> {
    const saved = await this.kv.get<PlanDocument>(KEY);
    if (saved && !validatePlan(saved).length) {
      this.doc.set(saved);
      this.custom.set(true);
    }
  }

  async set(doc: PlanDocument): Promise<void> {
    const errors = validatePlan(doc);
    if (errors.length) throw new PlanImportError(errors);
    await this.kv.set(KEY, doc);
    this.doc.set(doc);
    this.custom.set(true);
  }

  /** Legge e valida un file di piano senza attivarlo. */
  async parseFile(file: Blob): Promise<PlanDocument> {
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      throw new PlanImportError(['Il file non è un JSON valido.']);
    }
    const errors = validatePlan(data);
    if (errors.length) throw new PlanImportError(errors);
    return data as PlanDocument;
  }

  async importFile(file: Blob): Promise<PlanDocument> {
    const doc = await this.parseFile(file);
    await this.set(doc);
    return doc;
  }

  async useExample(): Promise<void> {
    await this.kv.set(KEY, null);
    this.doc.set(EXAMPLE_PLAN);
    this.custom.set(false);
  }

  download(): void {
    const doc = this.doc();
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const slug = doc.meta.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'piano';
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: `piano-${slug}.json` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
