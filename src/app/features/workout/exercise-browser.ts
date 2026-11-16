import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { ExerciseLibraryService } from '../../core/data/exercise-library.service';
import { CATEGORY_IT, EQUIPMENT_IT, filterLibrary, MUSCLES_IT, type LibraryEntry } from '../../core/domain/exercise-library';

const PAGE = 40;

/** Elenco filtrabile di tutti gli esercizi del catalogo. */
@Component({
  selector: 'app-exercise-browser',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="filters">
      <input type="search" placeholder="Cerca (es. lat machine, panca, rematore…)" aria-label="Cerca esercizio"
             [value]="text()" (input)="text.set($any($event.target).value); limit.set(PAGE)" />
      <div class="selects">
        <select aria-label="Muscolo" [value]="muscle()" (change)="muscle.set($any($event.target).value); limit.set(PAGE)">
          <option value="">Tutti i muscoli</option>
          @for (m of muscles; track m[0]) { <option [value]="m[0]">{{ m[1] }}</option> }
        </select>
        <select aria-label="Attrezzo" [value]="equipment()" (change)="equipment.set($any($event.target).value); limit.set(PAGE)">
          <option value="">Ogni attrezzo</option>
          @for (m of equipments; track m[0]) { <option [value]="m[0]">{{ m[1] }}</option> }
        </select>
        <select aria-label="Tipo" [value]="category()" (change)="category.set($any($event.target).value); limit.set(PAGE)">
          <option value="">Ogni tipo</option>
          @for (m of categories; track m[0]) { <option [value]="m[0]">{{ m[1] }}</option> }
        </select>
      </div>
    </div>

    @if (!library.loaded()) {
      <p class="muted">Carico il catalogo degli esercizi…</p>
    } @else {
      <p class="muted count">{{ results().length }} esercizi</p>
      <ul class="grid">
        @for (e of visible(); track e.id) {
          <li>
            <button type="button" class="item" (click)="open.emit(e)">
              <img [src]="'exercise-lib/' + e.id + '/0.webp'" alt="" loading="lazy" width="160" height="107" />
              <span class="name">{{ library.italianName(e.id) ?? e.name }}</span>
              @if (library.italianName(e.id)) { <span class="orig">{{ e.name }}</span> }
              <span class="muted meta">{{ muscleIt(e.primary[0]) }} · {{ equipIt(e.equipment) }}</span>
            </button>
          </li>
        }
      </ul>
      @if (results().length > limit()) {
        <button type="button" class="btn more" (click)="limit.set(limit() + PAGE)">Mostra altri ({{ results().length - limit() }})</button>
      }
    }
  `,
  styles: `
    :host { display: grid; gap: 10px; }
    .filters { display: grid; gap: 8px; }
    input, select { min-height: var(--touch); padding: 0 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--surface-2); font-size: 1rem; min-width: 0; }
    .selects { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
    @media (max-width: 480px) { .selects { grid-template-columns: 1fr 1fr; } .selects select:last-child { grid-column: 1 / -1; } }
    .count { margin: 0; font-size: 0.85rem; }
    .grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
    .item { width: 100%; height: 100%; display: grid; gap: 4px; align-content: start; text-align: left; padding: 6px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--surface); font: inherit; }
    .item:active { transform: scale(0.98); }
    img { width: 100%; height: auto; aspect-ratio: 3 / 2; object-fit: contain; background: #fff; border-radius: 8px; }
    .name { font-weight: 700; font-size: 0.88rem; line-height: 1.2; }
    .meta { font-size: 0.75rem; }
    .orig { font-size: 0.7rem; color: var(--text-2); line-height: 1.2; }
    .more { justify-self: center; }
  `,
})
export class ExerciseBrowser {
  protected readonly library = inject(ExerciseLibraryService);
  readonly open = output<LibraryEntry>();

  protected readonly PAGE = PAGE;
  protected readonly text = signal('');
  protected readonly muscle = signal('');
  protected readonly equipment = signal('');
  protected readonly category = signal('strength');
  protected readonly limit = signal(PAGE);

  protected readonly muscles = Object.entries(MUSCLES_IT).sort((a, b) => a[1].localeCompare(b[1], 'it'));
  protected readonly equipments = Object.entries(EQUIPMENT_IT);
  protected readonly categories = Object.entries(CATEGORY_IT);

  constructor() {
    void this.library.load().catch(() => undefined);
  }

  protected readonly results = computed(() =>
    filterLibrary(
      this.library.all(),
      { text: this.text(), muscle: this.muscle() || undefined, equipment: this.equipment() || undefined, category: this.category() || undefined },
      this.library.italianName,
    ),
  );
  protected readonly visible = computed(() => this.results().slice(0, this.limit()));

  protected muscleIt(m?: string): string {
    return m ? (MUSCLES_IT[m] ?? m) : '';
  }

  protected equipIt(e: string | null): string {
    return EQUIPMENT_IT[e ?? 'other'] ?? e ?? '';
  }
}
