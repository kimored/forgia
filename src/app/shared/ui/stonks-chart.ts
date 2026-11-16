import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { addDays, parseIsoDate, today, type IsoDate } from '../../core/domain/dates';

export interface StonksPoint {
  date: IsoDate;
  value: number;
}

type Range = '1M' | '3M' | '6M' | 'ALL';
const RANGES: { id: Range; label: string; days: number | null }[] = [
  { id: '1M', label: '1M', days: 30 },
  { id: '3M', label: '3M', days: 91 },
  { id: '6M', label: '6M', days: 182 },
  { id: 'ALL', label: 'Tutto', days: null },
];

const W = 320;
const H = 140;

/** Grafico "da borsa": linea con area sfumata, variazione sul periodo e selettore 1M / 3M / 6M / Tutto. */
@Component({
  selector: 'app-stonks-chart',
  imports: [DatePipe, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let v = view();
    <div class="top">
      <div>
        <span class="value num">{{ v.last | number: '1.1-1' }} {{ unit() }}</span>
        @if (v.points.length > 1) {
          <span class="change num" [class.up]="v.diff > 0" [class.down]="v.diff < 0">
            {{ v.diff > 0 ? '▲' : v.diff < 0 ? '▼' : '■' }} {{ v.diff > 0 ? '+' : '' }}{{ v.diff | number: '1.1-1' }} {{ unit() }}
            ({{ v.pct > 0 ? '+' : '' }}{{ v.pct | number: '1.1-1' }}%)
          </span>
        }
      </div>
      <div class="ranges" role="radiogroup" aria-label="Periodo">
        @for (r of ranges; track r.id) {
          <button type="button" role="radio" [attr.aria-checked]="range() === r.id" [class.on]="range() === r.id" (click)="range.set(r.id)">{{ r.label }}</button>
        }
      </div>
    </div>
    @if (v.points.length > 1) {
      <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" preserveAspectRatio="none" role="img" [attr.aria-label]="ariaLabel()" [class.up]="v.diff >= 0">
        <defs>
          <linearGradient [attr.id]="gid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="currentColor" stop-opacity="0.35" />
            <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
          </linearGradient>
        </defs>
        @for (g of v.grid; track g) { <line x1="0" [attr.x2]="W" [attr.y1]="g" [attr.y2]="g" class="grid" /> }
        <path [attr.d]="v.area" [attr.fill]="'url(#' + gid + ')'" />
        <path [attr.d]="v.line" class="line" vector-effect="non-scaling-stroke" />
      </svg>
      <div class="axis muted num">
        <span>{{ v.from | date: 'd MMM' }}</span>
        <span>min {{ v.min | number: '1.1-1' }} · max {{ v.max | number: '1.1-1' }}</span>
        <span>{{ v.to | date: 'd MMM' }}</span>
      </div>
    } @else {
      <p class="muted empty">{{ v.points.length ? 'Serve almeno un\\'altra pesata in questo periodo per il grafico.' : empty() }}</p>
    }
  `,
  styles: `
    :host { display: grid; gap: 8px; }
    .top { display: flex; justify-content: space-between; align-items: end; gap: 8px; flex-wrap: wrap; }
    .top > div:first-child { display: grid; }
    .value { font-size: 1.6rem; font-weight: 800; line-height: 1.1; }
    .change { font-weight: 700; font-size: 0.9rem; color: var(--text-2); }
    .change.up { color: var(--ok); }
    .change.down { color: var(--danger); }
    .ranges { display: flex; gap: 2px; background: var(--surface-2); border-radius: 999px; padding: 3px; }
    .ranges button { border: 0; background: transparent; border-radius: 999px; padding: 6px 10px; font-weight: 700; font-size: 0.8rem; color: var(--text-2); min-height: 32px; }
    .ranges button.on { background: var(--surface); color: var(--text); box-shadow: 0 1px 3px rgb(0 0 0 / 0.12); }
    svg { width: 100%; height: 170px; color: var(--danger); display: block; }
    svg.up { color: var(--ok); }
    .line { fill: none; stroke: currentColor; stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
    .grid { stroke: var(--border); stroke-width: 1; stroke-dasharray: 3 4; vector-effect: non-scaling-stroke; }
    .dot { fill: var(--surface); stroke: currentColor; stroke-width: 2.5; }
    .axis { display: flex; justify-content: space-between; font-size: 0.75rem; }
    .empty { margin: 0; padding: 24px 0; text-align: center; font-size: 0.9rem; }
  `,
})
export class StonksChart {
  readonly points = input.required<StonksPoint[]>();
  readonly unit = input('kg');
  readonly ariaLabel = input('Andamento');
  readonly empty = input('Nessun dato.');

  protected readonly W = W;
  protected readonly H = H;
  protected readonly ranges = RANGES;
  protected readonly range = signal<Range>('3M');
  protected readonly gid = `stonks-${Math.random().toString(36).slice(2, 8)}`;

  protected readonly view = computed(() => {
    const all = [...this.points()].sort((a, b) => a.date.localeCompare(b.date));
    const days = RANGES.find((r) => r.id === this.range())!.days;
    const from = days === null ? null : addDays(today(), -days);
    const pts = from ? all.filter((p) => p.date >= from) : all;
    const last = all.at(-1)?.value ?? 0;
    const first = pts[0]?.value ?? last;
    const diff = Math.round((last - first) * 10) / 10;
    const pct = first ? (diff / first) * 100 : 0;
    if (pts.length < 2) return { points: pts, last, diff, pct, line: '', area: '', grid: [], lastX: 0, lastY: 0, min: 0, max: 0, from: null, to: null };

    const t0 = parseIsoDate(pts[0].date).getTime();
    const t1 = parseIsoDate(pts.at(-1)!.date).getTime();
    const values = pts.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(0.3, (max - min) * 0.15);
    const lo = min - pad;
    const hi = max + pad;
    const x = (d: IsoDate) => ((parseIsoDate(d).getTime() - t0) / Math.max(1, t1 - t0)) * W;
    const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
    const xy = pts.map((p) => [x(p.date), y(p.value)] as const);
    const line = xy.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join(' ');
    const area = `${line} L${W},${H} L0,${H} Z`;
    return {
      points: pts,
      last,
      diff,
      pct,
      line,
      area,
      grid: [H * 0.25, H * 0.5, H * 0.75],
      lastX: xy.at(-1)![0],
      lastY: xy.at(-1)![1],
      min,
      max,
      from: parseIsoDate(pts[0].date),
      to: parseIsoDate(pts.at(-1)!.date),
    };
  });
}
