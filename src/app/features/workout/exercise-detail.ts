import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { ExerciseLibraryService } from '../../core/data/exercise-library.service';
import { CATEGORY_IT, EQUIPMENT_IT, LEVEL_IT } from '../../core/domain/exercise-library';
import { exerciseImages } from '../../core/domain/workout';
import type { ExerciseInfo } from '../../core/models/workout';

/** Dettaglio di un esercizio: esecuzione grande, muscoli, tecnica e varianti. */
@Component({
  selector: 'app-exercise-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let e = info();
    <div class="detail">
      <h2>{{ e.name }}</h2>

      <div class="media" [class.split]="mode() === 'frames'">
        @if (mode() === 'anim') {
          @for (src of images(); track src; let i = $index) {
            <img [src]="src" alt="Esecuzione: fotogramma {{ i + 1 }}" [class.on]="frame() === i" />
          }
        } @else {
          @for (src of images(); track src; let i = $index) {
            <figure><img [src]="src" alt="Esecuzione: fotogramma {{ i + 1 }}" class="on" /><figcaption>{{ i === 0 ? 'Inizio' : 'Fine' }}</figcaption></figure>
          }
        }
      </div>
      <div class="modes" role="radiogroup" aria-label="Visualizzazione">
        <button type="button" role="radio" [attr.aria-checked]="mode() === 'anim'" [class.on]="mode() === 'anim'" (click)="mode.set('anim')">▶ Animazione</button>
        <button type="button" role="radio" [attr.aria-checked]="mode() === 'frames'" [class.on]="mode() === 'frames'" (click)="mode.set('frames')">◫ Fotogrammi</button>
        @if (mode() === 'anim') {
          <button type="button" (click)="slow.set(!slow())">{{ slow() ? '🐢 Lenta' : '🐇 Normale' }}</button>
        }
      </div>

      <p class="chips">
        @for (m of e.primary; track m) { <span class="badge primary">{{ m }}</span> }
        @for (m of e.secondary; track m) { <span class="badge">{{ m }}</span> }
        @if (e.equipment) { <span class="badge">🏋️ {{ eq(e.equipment) }}</span> }
        @if (e.level) { <span class="badge">{{ lvl(e.level) }}</span> }
      </p>

      @if (e.tips.length) {
        <section>
          <h3>Tecnica</h3>
          <ul>@for (t of e.tips; track t) { <li>{{ t }}</li> }</ul>
        </section>
      }
      @if (e.instructions?.length) {
        <details [open]="!e.tips.length">
          <summary>Istruzioni del database (in inglese)</summary>
          <ol>@for (t of e.instructions; track $index) { <li>{{ t }}</li> }</ol>
        </details>
      }

      @if (actionLabel()) {
        <button type="button" class="btn primary" (click)="choose.emit(e.id)">{{ actionLabel() }}</button>
      }

      <section>
        <h3>Varianti</h3>
        @if (!library.loaded()) {
          <p class="muted">Carico il catalogo…</p>
        } @else if (variants().length) {
          <ul class="variants">
            @for (v of variants(); track v.id) {
              <li>
                <button type="button" class="variant" (click)="openVariant(v)">
                  <img [src]="thumb(v)" alt="" loading="lazy" />
                  <span>
                    <strong>{{ v.name }}</strong>
                    <span class="muted">{{ v.equipment ? eq(v.equipment) : '' }}{{ v.level ? ' · ' + lvl(v.level) : '' }}</span>
                  </span>
                </button>
                @if (variantLabel()) {
                  <button type="button" class="btn ghost use" (click)="choose.emit(v.id)">{{ variantLabel() }}</button>
                }
              </li>
            }
          </ul>
        } @else {
          <p class="muted">Nessuna variante simile nel catalogo.</p>
        }
      </section>
    </div>
  `,
  styleUrl: './exercise-detail.scss',
})
export class ExerciseDetail {
  protected readonly library = inject(ExerciseLibraryService);

  readonly info = input.required<ExerciseInfo>();
  /** Testo del bottone principale (es. "Aggiungi alla scheda"); vuoto = nessun bottone. */
  readonly actionLabel = input('');
  /** Testo del bottone accanto a ogni variante (es. "Usa oggi"). */
  readonly variantLabel = input('');
  readonly choose = output<string>();
  readonly navigate = output<ExerciseInfo>();

  protected readonly mode = signal<'anim' | 'frames'>('anim');
  protected readonly slow = signal(false);
  protected readonly frame = signal(0);
  protected readonly images = computed(() => exerciseImages(this.info()));
  protected readonly variants = computed(() => this.library.variants(this.info()));

  constructor() {
    void this.library.load().catch(() => undefined);
    let t: ReturnType<typeof setInterval> | undefined;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    effect(() => {
      const ms = this.slow() ? 1800 : 1000;
      clearInterval(t);
      if (!reduce) t = setInterval(() => this.frame.update((f) => 1 - f), ms);
    });
    inject(DestroyRef).onDestroy(() => clearInterval(t));
  }

  protected eq(k: string): string {
    return EQUIPMENT_IT[k] ?? CATEGORY_IT[k] ?? k;
  }

  protected lvl(k: string): string {
    return LEVEL_IT[k] ?? k;
  }

  protected thumb(v: ExerciseInfo): string {
    return exerciseImages(v)[0] ?? '';
  }

  protected openVariant(v: ExerciseInfo): void {
    this.navigate.emit(v);
  }
}
