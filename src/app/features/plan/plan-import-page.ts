import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { PlanService } from '../../core/data/plan.service';
import { buildPlan, parsePlanText, type ImportIssue } from '../../core/domain/plan-import';
import type { PlanDocument } from '../../core/models/plan';
import { DocumentReader, textPage } from '../../core/platform/document-reader';
import { Icon } from '../../shared/ui/icon';
import { PlanEditor } from './plan-editor';

type State =
  | { step: 'pick' }
  | { step: 'reading' }
  | { step: 'review'; doc: PlanDocument; issues: ImportIssue[]; estimated: { food: string; measure: string; grams: number }[]; stats: { days: number; items: number; withQty: number; ocr: boolean } }
  | { step: 'error'; message: string };

@Component({
  selector: 'app-plan-import-page',
  imports: [PlanEditor, RouterLink, Icon, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './plan-import-page.html',
  styleUrl: './plan-import-page.scss',
})
export class PlanImportPage {
  private readonly plans = inject(PlanService);
  private readonly router = inject(Router);
  protected readonly reader = inject(DocumentReader);

  protected readonly state = signal<State>({ step: 'pick' });
  protected readonly pasted = signal('');
  protected readonly showPaste = signal(false);
  protected readonly accuracy = computed(() => {
    const s = this.state();
    return s.step === 'review' && s.stats.items ? s.stats.withQty / s.stats.items : 1;
  });

  protected async onFiles(input: HTMLInputElement): Promise<void> {
    const files = [...(input.files ?? [])];
    input.value = '';
    if (!files.length) return;
    // Un file Forgia (.json) si carica direttamente.
    if (files.length === 1 && files[0].name.toLowerCase().endsWith('.json')) {
      try {
        const doc = await this.plans.parseFile(files[0]);
        this.state.set({ step: 'review', doc, issues: [], estimated: [], stats: { days: 0, items: 0, withQty: 0, ocr: false } });
      } catch (e) {
        this.state.set({ step: 'error', message: (e as Error).message });
      }
      return;
    }
    const unsupported = files.filter((f) => !this.reader.kindOf(f));
    if (unsupported.length) {
      this.state.set({ step: 'error', message: `Formato non supportato: ${unsupported.map((f) => f.name).join(', ')}` });
      return;
    }
    this.state.set({ step: 'reading' });
    try {
      // Le foto si leggono nell'ordine scelto; la lista spesa può stare ovunque.
      const { pages, ocr } = await this.reader.read(files);
      this.analyze(pages, ocr);
    } catch (e) {
      console.error('Import piano', e);
      this.state.set({ step: 'error', message: `Lettura non riuscita: ${(e as Error).message}` });
    }
  }

  protected analyzePasted(): void {
    if (this.pasted().trim()) this.analyze([textPage(this.pasted())], false);
  }

  private analyze(pages: Parameters<typeof parsePlanText>[0], ocr: boolean): void {
    const draft = parsePlanText(pages);
    if (!draft.days.length) {
      this.state.set({
        step: 'error',
        message:
          'Non ho trovato giorni o pasti (Colazione, Pranzo, Cena…) nel documento. ' +
          (ocr ? 'Prova con una scansione più nitida o con il PDF originale, oppure crea il piano a mano.' : 'Puoi creare il piano a mano.'),
      });
      return;
    }
    const { doc, estimated } = buildPlan(draft, { title: 'Piano del nutrizionista' });
    const items = draft.days.flatMap((d) => d.slots.flatMap((s) => s.items));
    this.state.set({
      step: 'review',
      doc,
      issues: draft.issues,
      estimated,
      stats: { days: draft.days.length, items: items.length, withQty: items.filter((i) => i.qty).length, ocr },
    });
  }

  protected async save(doc: PlanDocument): Promise<void> {
    await this.plans.set(doc);
    void this.router.navigateByUrl('/oggi');
  }

  protected restart(): void {
    this.state.set({ step: 'pick' });
  }
}
