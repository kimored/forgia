import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

export interface ChartPoint {
  label: string;
  value: number;
}

/** Grafico a linea minimale in SVG (nessuna libreria): tocca un punto per il valore. */
@Component({
  selector: 'app-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let g = geometry();
    <figure>
      <figcaption>
        <span>{{ title() }}</span>
        @if (selected(); as s) {
          <strong class="num">{{ format(s.value) }}</strong> <span class="muted">· {{ s.label }}</span>
        } @else if (g.last) {
          <strong class="num">{{ format(g.last.value) }}</strong> <span class="muted">ultima</span>
        }
      </figcaption>
      @if (points().length >= 2) {
        <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" preserveAspectRatio="none" role="img" [attr.aria-label]="title()">
          <polyline [attr.points]="g.area" class="area" />
          <polyline [attr.points]="g.line" class="line" />
          @for (p of g.dots; track $index) {
            <circle [attr.cx]="p.x" [attr.cy]="p.y" r="5" [class.on]="selectedIndex() === $index"
                    (click)="selectedIndex.set(selectedIndex() === $index ? null : $index)" />
          }
        </svg>
        <div class="axis muted"><span>{{ points()[0].label }}</span><span>{{ points().at(-1)!.label }}</span></div>
      } @else {
        <p class="muted empty">Servono almeno due sedute per il grafico.</p>
      }
    </figure>
  `,
  styles: `
    figure { margin: 0; display: grid; gap: 6px; }
    figcaption { display: flex; gap: 6px; align-items: baseline; font-size: 0.9rem; }
    figcaption > span:first-child { flex: 1; font-weight: 600; color: var(--text-2); }
    svg { width: 100%; height: 120px; overflow: visible; }
    .line { fill: none; stroke: var(--primary); stroke-width: 2.5; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
    .area { fill: color-mix(in srgb, var(--primary) 14%, transparent); stroke: none; }
    circle { fill: var(--surface); stroke: var(--primary); stroke-width: 2; vector-effect: non-scaling-stroke; cursor: pointer; }
    circle.on { fill: var(--primary); }
    .axis { display: flex; justify-content: space-between; font-size: 0.75rem; }
    .empty { margin: 0; font-size: 0.85rem; }
  `,
})
export class LineChart {
  readonly title = input('');
  readonly points = input<ChartPoint[]>([]);
  readonly unit = input('');

  protected readonly W = 300;
  protected readonly H = 120;
  protected readonly selectedIndex = signal<number | null>(null);
  protected readonly selected = computed(() => {
    const i = this.selectedIndex();
    return i === null ? null : this.points()[i];
  });

  protected readonly geometry = computed(() => {
    const pts = this.points();
    const values = pts.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const pad = 10;
    const dots = pts.map((p, i) => ({
      x: pts.length === 1 ? this.W / 2 : (i / (pts.length - 1)) * this.W,
      y: this.H - pad - ((p.value - min) / span) * (this.H - pad * 2),
    }));
    const line = dots.map((d) => `${d.x},${d.y}`).join(' ');
    return { dots, line, area: `0,${this.H} ${line} ${this.W},${this.H}`, last: pts.at(-1) };
  });

  protected format(v: number): string {
    return `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(v)}${this.unit() ? ' ' + this.unit() : ''}`;
  }
}
