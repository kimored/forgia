import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { daysBetween, parseIsoDate, type IsoDate } from '../../core/domain/dates';

export interface TimeSeries {
  label: string;
  points: { date: IsoDate; value: number }[];
  /** Variabile CSS del colore. */
  color: string;
  dashed?: boolean;
  dots?: boolean;
}

/** Grafico a più linee su asse temporale, in SVG (nessuna libreria). Tocca per leggere i valori. */
@Component({
  selector: 'app-time-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let g = geo();
    @if (g) {
      <div class="legend">
        @for (s of g.series; track s.label) {
          <span><i [style.background]="s.color" [class.dash]="s.dashed"></i>{{ s.label }}</span>
        }
      </div>
      <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" role="img" [attr.aria-label]="ariaLabel()"
           (pointerdown)="pick($event)" (pointermove)="$event.buttons && pick($event)">
        @for (t of g.ticks; track t.y) {
          <line class="grid" x1="0" [attr.x2]="W" [attr.y1]="t.y" [attr.y2]="t.y" />
          <text class="tick" x="2" [attr.y]="t.y - 3">{{ t.label }}</text>
        }
        @for (s of g.series; track s.label) {
          <polyline [attr.points]="s.path" [style.stroke]="s.color" [class.dash]="s.dashed" />
          @if (s.dots) {
            @for (p of s.xy; track $index) { <circle [attr.cx]="p.x" [attr.cy]="p.y" r="3.5" [style.stroke]="s.color" /> }
          }
        }
        @if (cursor(); as c) {
          <line class="cursor" [attr.x1]="c.x" [attr.x2]="c.x" y1="0" [attr.y2]="H" />
        }
      </svg>
      <div class="axis muted"><span>{{ g.from }}</span><span>{{ g.to }}</span></div>
      @if (cursor(); as c) {
        <p class="readout">
          <strong>{{ c.date }}</strong>
          @for (v of c.values; track v.label) { <span><i [style.background]="v.color"></i>{{ v.label }}: <b class="num">{{ v.value }}</b></span> }
        </p>
      }
    } @else {
      <p class="muted empty">{{ empty() }}</p>
    }
  `,
  styles: `
    :host { display: grid; gap: 6px; }
    .legend { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 0.78rem; color: var(--text-2); }
    .legend span, .readout span { display: inline-flex; align-items: center; gap: 5px; }
    i { width: 14px; height: 3px; border-radius: 2px; display: inline-block; }
    i.dash { background: repeating-linear-gradient(90deg, currentColor 0 4px, transparent 4px 7px) !important; }
    svg { width: 100%; height: 190px; touch-action: pan-y; overflow: visible; }
    polyline { fill: none; stroke-width: 2.5; vector-effect: non-scaling-stroke; stroke-linejoin: round; stroke-linecap: round; }
    polyline.dash { stroke-dasharray: 6 5; stroke-width: 2; opacity: 0.8; }
    circle { fill: var(--surface); stroke-width: 2; vector-effect: non-scaling-stroke; }
    .grid { stroke: var(--border); stroke-width: 1; vector-effect: non-scaling-stroke; }
    .tick { font-size: 10px; fill: var(--text-2); }
    .cursor { stroke: var(--text-2); stroke-dasharray: 3 3; vector-effect: non-scaling-stroke; }
    .axis { display: flex; justify-content: space-between; font-size: 0.75rem; }
    .readout { margin: 0; display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 0.85rem; }
    .empty { margin: 0; font-size: 0.88rem; }
  `,
})
export class TimeChart {
  readonly series = input<TimeSeries[]>([]);
  readonly unit = input('');
  readonly empty = input('Nessun dato ancora.');
  readonly ariaLabel = input('Grafico');

  protected readonly W = 320;
  protected readonly H = 190;
  private readonly cursorX = signal<number | null>(null);

  private readonly fmtDate = (d: IsoDate) =>
    new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(parseIsoDate(d));
  private readonly fmt = (v: number) => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(v);

  protected readonly geo = computed(() => {
    const series = this.series().filter((s) => s.points.length);
    const all = series.flatMap((s) => s.points);
    if (!all.length || !series.some((s) => s.dots && s.points.length)) return null;
    const dates = all.map((p) => p.date).sort();
    const from = dates[0];
    const to = dates.at(-1)!;
    const span = Math.max(1, daysBetween(from, to));
    const values = all.map((p) => p.value);
    const pad = Math.max(0.5, (Math.max(...values) - Math.min(...values)) * 0.1);
    const min = Math.min(...values) - pad;
    const max = Math.max(...values) + pad;
    const x = (d: IsoDate) => (daysBetween(from, d) / span) * this.W;
    const y = (v: number) => this.H - ((v - min) / (max - min)) * this.H;
    const step = niceStep((max - min) / 4);
    const ticks = [];
    for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push({ y: y(v), label: `${this.fmt(v)} ${this.unit()}`.trim() });
    return {
      from: this.fmtDate(from),
      to: this.fmtDate(to),
      fromDate: from,
      span,
      ticks,
      series: series.map((s) => {
        const xy = [...s.points].sort((a, b) => a.date.localeCompare(b.date)).map((p) => ({ x: x(p.date), y: y(p.value), p }));
        return { ...s, xy, path: xy.map((q) => `${q.x},${q.y}`).join(' ') };
      }),
    };
  });

  protected readonly cursor = computed(() => {
    const g = this.geo();
    const cx = this.cursorX();
    if (!g || cx === null) return null;
    const values = g.series
      .map((s) => {
        const near = s.xy.reduce((a, b) => (Math.abs(b.x - cx) < Math.abs(a.x - cx) ? b : a));
        return Math.abs(near.x - cx) < this.W / 12 ? { label: s.label, color: s.color, value: `${this.fmt(near.p.value)} ${this.unit()}`, x: near.x, date: near.p.date } : null;
      })
      .filter((v): v is NonNullable<typeof v> => !!v);
    if (!values.length) return null;
    return { x: values[0].x, date: this.fmtDate(values[0].date), values };
  });

  protected pick(e: PointerEvent): void {
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    this.cursorX.set(((e.clientX - rect.left) / rect.width) * this.W);
  }
}

function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}
