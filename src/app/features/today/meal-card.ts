import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { ResolvedMeal } from '../../core/domain/day-plan';
import { SLOT_META, portionView } from '../../shared/meal-format';
import { CheckButton } from '../../shared/ui/check-button';
import { LongPress } from '../../shared/ui/long-press';

@Component({
  selector: 'app-meal-card',
  imports: [CheckButton, LongPress],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let m = meal();
    <article class="card meal" [class.selected]="selected()" [class.done]="status() === 'done'"
             [class.skipped]="status() === 'skipped'" [style.--tint]="meta().color"
             (click)="open.emit()" (appLongPress)="menu.emit()"
             role="button" tabindex="0" [attr.aria-label]="meta().label + ' delle ' + m.time + ': apri le varianti'"
             (keydown.enter)="open.emit()" (keydown.space)="$event.preventDefault(); open.emit()">
      <div class="head">
        <span class="emoji" aria-hidden="true">{{ meta().emoji }}</span>
        <div class="title">
          <span class="slot">{{ meta().label }}</span>
          <strong>{{ m.free ? 'Pasto libero' : m.option!.title }}</strong>
        </div>
        <app-check [checked]="status() === 'done'" [skipped]="status() === 'skipped'" [color]="meta().color"
                   [label]="'Segna ' + meta().label.toLowerCase() + ' come fatto'" (toggle)="toggle.emit()" />
      </div>

      @if (!m.free) {
        <ul class="portions">
          @for (p of portions(); track $index) {
            <li><span class="qty num">{{ p.qty }}</span> {{ p.name }}@if (p.note) {<span class="muted"> · {{ p.note }}</span>}</li>
          }
        </ul>
      }

      @if (replaced() || status() === 'skipped' || m.free) {
        <div class="tags">
          @if (m.free) { <span class="badge free">Libero</span> }
          @if (replaced()) { <span class="badge primary">Sostituito</span> }
          @if (status() === 'skipped') { <span class="badge">Saltato</span> }
        </div>
      }
    </article>
  `,
  styleUrl: './meal-card.scss',
})
export class MealCard {
  readonly meal = input.required<ResolvedMeal>();
  readonly selected = input(false);
  readonly open = output<void>();
  readonly menu = output<void>();
  readonly toggle = output<void>();

  protected readonly meta = computed(() => SLOT_META[this.meal().slot]);
  protected readonly status = computed(() => this.meal().log?.status ?? 'todo');
  protected readonly replaced = computed(() => {
    const m = this.meal();
    return !!m.log?.optionId && m.log.optionId !== m.planned?.id;
  });
  protected readonly portions = computed(() => this.meal().portions.map(portionView));
}
