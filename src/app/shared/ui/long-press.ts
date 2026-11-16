import { Directive, output } from '@angular/core';

const DELAY_MS = 500;
const MOVE_TOLERANCE = 10;

/**
 * Pressione prolungata (touch e mouse). Dopo un long-press il click successivo viene
 * soppresso, così non scatta anche il tap. Niente menu contestuale nativo su iOS.
 */
@Directive({
  selector: '[appLongPress]',
  host: {
    '(pointerdown)': 'down($event)',
    '(pointermove)': 'move($event)',
    '(pointerup)': 'cancel()',
    '(pointercancel)': 'cancel()',
    '(pointerleave)': 'cancel()',
    '(click)': 'click($event)',
    '(contextmenu)': '$event.preventDefault()',
    style: '-webkit-touch-callout: none; user-select: none; -webkit-user-select: none',
  },
})
export class LongPress {
  readonly appLongPress = output<void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private origin: { x: number; y: number } | null = null;
  private fired = false;

  protected down(e: PointerEvent): void {
    if (e.button > 0) return;
    this.fired = false;
    this.origin = { x: e.clientX, y: e.clientY };
    this.timer = setTimeout(() => {
      this.fired = true;
      navigator.vibrate?.(15);
      this.appLongPress.emit();
    }, DELAY_MS);
  }

  protected move(e: PointerEvent): void {
    if (!this.origin) return;
    if (Math.hypot(e.clientX - this.origin.x, e.clientY - this.origin.y) > MOVE_TOLERANCE) this.cancel();
  }

  protected cancel(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.origin = null;
  }

  protected click(e: MouseEvent): void {
    if (this.fired) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.fired = false;
    }
  }
}
