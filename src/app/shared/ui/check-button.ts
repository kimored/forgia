import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Checkbox tonda da 44 px con micro-animazione (pop + spunta disegnata). */
@Component({
  selector: 'app-check',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" role="checkbox" [attr.aria-checked]="checked()" [attr.aria-label]="label()"
            [class.on]="checked()" [class.skipped]="skipped()" [style.--tint]="color()"
            (click)="$event.stopPropagation(); toggle.emit()">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        @if (skipped()) {
          <path d="M7 12h10" />
        } @else {
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        }
      </svg>
    </button>
  `,
  styles: `
    :host { display: inline-flex; }
    button {
      width: 44px; height: 44px; border-radius: 50%; padding: 9px;
      border: 2px solid var(--border); background: var(--surface);
      color: transparent; display: grid; place-items: center;
      transition: background 200ms, border-color 200ms, transform 300ms var(--ease-spring);
    }
    button:active { transform: scale(0.88); }
    svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 3;
          stroke-linecap: round; stroke-linejoin: round; }
    path { stroke-dasharray: 24; stroke-dashoffset: 24; }
    .on { background: var(--tint, var(--primary)); border-color: transparent; color: #fff;
          animation: pop 380ms var(--ease-spring); }
    .on path { animation: draw 300ms 80ms ease-out forwards; }
    .skipped { background: var(--surface-2); border-color: var(--border); color: var(--text-2); }
    .skipped path { stroke-dashoffset: 0; }
    @keyframes pop { 40% { transform: scale(1.18); } }
    @keyframes draw { to { stroke-dashoffset: 0; } }
  `,
})
export class CheckButton {
  readonly checked = input(false);
  readonly skipped = input(false);
  readonly label = input('Fatto');
  readonly color = input<string | null>(null);
  readonly toggle = output<void>();
}
