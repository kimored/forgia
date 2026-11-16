import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  inject,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { OverlayService, type OverlayHandle } from '../../core/platform/overlay.service';

const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 0.6; // px/ms

/**
 * Bottom sheet con apertura "a molla", chiusura trascinando verso il basso,
 * tap sullo sfondo, Esc o tasto indietro di Android.
 */
@Component({
  selector: 'app-bottom-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'open() && open.set(false)' },
  template: `
    @if (open()) {
      <div class="backdrop" animate.enter="fade-in" animate.leave="fade-out" (click)="open.set(false)"></div>
      <section #sheet class="sheet" role="dialog" aria-modal="true" tabindex="-1" [attr.aria-label]="label()"
               animate.enter="sheet-in" animate.leave="sheet-out"
               [class.dragging]="dragY() !== null" [style.translate]="dragY() ? '0 ' + dragY() + 'px' : null">
        <div class="grab" (pointerdown)="dragStart($event)" (pointermove)="dragMove($event)"
             (pointerup)="dragEnd($event)" (pointercancel)="dragEnd($event)">
          <span></span>
        </div>
        <div class="body"><ng-content /></div>
      </section>
    }
  `,
  styleUrl: './bottom-sheet.scss',
})
export class BottomSheet implements OnDestroy {
  private readonly overlays = inject(OverlayService);
  private handle: OverlayHandle | null = null;
  private start: { y: number; t: number } | null = null;

  readonly open = model(false);
  readonly label = input('');
  protected readonly dragY = signal<number | null>(null);
  private readonly sheet = viewChild<ElementRef<HTMLElement>>('sheet');

  constructor() {
    effect(() => {
      const open = this.open();
      if (open && !this.handle) {
        this.handle = this.overlays.open(() => this.open.set(false));
        document.documentElement.classList.add('sheet-open');
      } else if (!open && this.handle) {
        const h = this.handle;
        this.handle = null;
        document.documentElement.classList.remove('sheet-open');
        h.close();
      }
    });
    effect(() => this.sheet()?.nativeElement.focus({ preventScroll: true }));
  }

  ngOnDestroy(): void {
    this.handle?.dispose();
    document.documentElement.classList.remove('sheet-open');
  }

  protected dragStart(e: PointerEvent): void {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    this.start = { y: e.clientY, t: e.timeStamp };
    this.dragY.set(0);
  }

  protected dragMove(e: PointerEvent): void {
    if (!this.start) return;
    const dy = e.clientY - this.start.y;
    // Verso l'alto resiste (effetto elastico), verso il basso segue il dito.
    this.dragY.set(dy > 0 ? dy : dy / 4);
  }

  protected dragEnd(e: PointerEvent): void {
    if (!this.start) return;
    const dy = e.clientY - this.start.y;
    const v = dy / Math.max(1, e.timeStamp - this.start.t);
    this.start = null;
    this.dragY.set(null);
    if (dy > CLOSE_DISTANCE || v > CLOSE_VELOCITY) this.open.set(false);
  }
}
