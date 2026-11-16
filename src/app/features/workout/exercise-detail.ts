import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { ExerciseLibraryService } from '../../core/data/exercise-library.service';
import { CATEGORY_IT, EQUIPMENT_IT, LEVEL_IT } from '../../core/domain/exercise-library';
import { MOVEMENT_IT, type Movement } from '../../core/domain/exercise-names';
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
      @if (e.originalName && e.originalName !== e.name) { <p class="orig">{{ e.originalName }}</p> }

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
        } @else {
          <div class="levels" role="radiogroup" aria-label="Livello">
            @for (l of levels; track l.id) {
              <button type="button" role="radio" [attr.aria-checked]="level() === l.id" [class.on]="level() === l.id" (click)="level.set(l.id)">
                {{ l.label }} <span class="num">{{ count(l.id) }}</span>
              </button>
            }
          </div>
          @for (g of groups(); track g.key) {
            <h4>{{ g.title }} <span class="muted">({{ g.items.length }})</span></h4>
            @if (g.items.length) {
              <ul class="variants">
                @for (v of g.shown; track v.id) {
                  <li>
                    <button type="button" class="variant" (click)="openVariant(v)">
                      <img [src]="thumb(v)" alt="" loading="lazy" />
                      <span>
                        <strong>{{ v.name }}</strong>
                        @if (v.originalName && v.originalName !== v.name) { <span class="orig">{{ v.originalName }}</span> }
                        <span class="muted">
                          {{ v.equipment ? eq(v.equipment) : '' }}
                          @if (v.level) { <span class="lv" [class]="'lv ' + v.level">{{ lvl(v.level) }}</span> }
                        </span>
                      </span>
                    </button>
                    @if (variantLabel()) {
                      <button type="button" class="btn ghost use" (click)="choose.emit(v.id)">{{ variantLabel() }}</button>
                    }
                  </li>
                }
              </ul>
              @if (g.items.length > g.shown.length) {
                <button type="button" class="btn ghost more" (click)="expand(g.key)">Mostra tutte ({{ g.items.length }})</button>
              }
            } @else {
              <p class="muted small">Nessuna con questo filtro.</p>
            }
          }
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
  protected readonly level = signal<'all' | 'beginner' | 'intermediate' | 'expert'>('all');
  private readonly expanded = signal(new Set<string>());
  protected readonly levels = [
    { id: 'all' as const, label: 'Tutti' },
    { id: 'beginner' as const, label: 'Principiante' },
    { id: 'intermediate' as const, label: 'Intermedio' },
    { id: 'expert' as const, label: 'Esperto' },
  ];

  protected count(level: string): number {
    const v = this.variants();
    const all = [...v.same, ...v.related];
    return level === 'all' ? all.length : all.filter((x) => x.level === level).length;
  }

  /** Varianti raggruppate per movimento, filtrate per livello; 8 per gruppo finché non si espande. */
  protected readonly groups = computed(() => {
    const v = this.variants();
    const lv = this.level();
    const open = this.expanded();
    const pick = (list: ExerciseInfo[]) => (lv === 'all' ? list : list.filter((x) => x.level === lv));
    const mv = v.movement ? MOVEMENT_IT[v.movement as Movement] : null;
    return [
      { key: 'same', title: mv ? `Stesso movimento · ${mv}` : 'Stesso movimento', items: pick(v.same) },
      { key: 'related', title: 'Stessi muscoli, movimento diverso', items: pick(v.related) },
    ]
      .filter((g) => g.key === 'same' || g.items.length || v.related.length)
      .map((g) => ({ ...g, shown: open.has(g.key) ? g.items : g.items.slice(0, 8) }));
  });

  protected expand(key: string): void {
    this.expanded.update((s) => new Set(s).add(key));
  }

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
    this.expanded.set(new Set());
    this.navigate.emit(v);
  }
}
