import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlanService } from '../../core/data/plan.service';
import type { PlanDocument } from '../../core/models/plan';
import { Icon } from '../../shared/ui/icon';
import { PlanEditor } from './plan-editor';

@Component({
  selector: 'app-plan-edit-page',
  imports: [PlanEditor, RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="head">
      <a class="icon-btn" routerLink="/impostazioni" aria-label="Torna alle impostazioni"><app-icon name="back" /></a>
      <h1>Modifica il piano</h1>
    </div>
    @if (saved()) { <p class="ok" role="status">✓ Piano salvato</p> }
    <app-plan-editor [initial]="plans.plan()" saveLabel="Salva il piano" (save)="save($event)" />
  `,
  styles: `
    :host { display: grid; gap: 14px; max-width: 900px; }
    .head { display: flex; align-items: center; gap: 4px; margin: 4px 0 0 -8px; }
    .head a { color: inherit; }
    h1 { font-size: 1.75rem; }
    .ok { margin: 0; color: var(--ok); font-weight: 700; }
  `,
})
export class PlanEditPage {
  protected readonly plans = inject(PlanService);
  protected readonly saved = signal(false);

  protected async save(doc: PlanDocument): Promise<void> {
    await this.plans.set(doc);
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 2000);
  }
}
