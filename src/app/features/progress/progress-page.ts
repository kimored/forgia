import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe, KeyValuePipe } from '@angular/common';
import { DayStore } from '../../core/data/day.store';
import { PlanService } from '../../core/data/plan.service';
import { ProfileService } from '../../core/data/profile.service';
import { ProgressStore } from '../../core/data/progress.store';
import { WorkoutStore } from '../../core/data/workout.store';
import type { MeasurementEntry } from '../../core/data/db';
import { addDays, mondayOf, parseIsoDate, today, weekdayOf, type IsoDate } from '../../core/domain/dates';
import { adherence, projectionSeries, waistAlert, weightStalled } from '../../core/domain/progress';
import { parseScaleWords, SCALE_FIELD_LABELS, type ScaleField } from '../../core/domain/scale-ocr';
import { OcrLoadError, OcrService } from '../../core/platform/ocr.service';
import { TimeChart, type TimeSeries } from '../../shared/ui/time-chart';

const MEASURES: { key: keyof Omit<MeasurementEntry, 'date'>; label: string }[] = [
  { key: 'waistCm', label: 'Girovita' },
  { key: 'armCm', label: 'Braccio' },
  { key: 'chestCm', label: 'Petto' },
  { key: 'thighCm', label: 'Coscia' },
];
const EXTRA_FIELDS: ScaleField[] = ['bmi', 'skeletalMusclePct', 'proteinPct', 'visceralFat', 'waterPct', 'boneKg', 'metabolicAge'];

@Component({
  selector: 'app-progress-page',
  imports: [DatePipe, DecimalPipe, KeyValuePipe, TimeChart],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './progress-page.html',
  styleUrl: './progress-page.scss',
})
export class ProgressPage {
  protected readonly store = inject(ProgressStore);
  private readonly days = inject(DayStore);
  private readonly plans = inject(PlanService);
  private readonly profiles = inject(ProfileService);
  private readonly workouts = inject(WorkoutStore);
  protected readonly ocr = inject(OcrService);

  protected readonly todayDate = today();
  protected readonly measures = MEASURES;
  protected readonly isMonday = weekdayOf(this.todayDate) === 0;

  // ---------- Peso ----------

  protected readonly latest = computed(() => this.store.weights().at(-1) ?? null);
  protected readonly delta = computed(() => {
    const l = this.latest();
    const s = this.store.start();
    return l && s ? Math.round((l.kg - s.kg) * 10) / 10 : null;
  });

  protected readonly weightSeries = computed<TimeSeries[]>(() => {
    const weights = this.store.weights();
    const start = this.store.start();
    const series: TimeSeries[] = [];
    if (start && weights.length) {
      const last = weights.at(-1)!.date;
      const until = addDays(last > this.todayDate ? last : this.todayDate, 28);
      const colors = ['var(--c-pranzo)', 'var(--c-colazione)', 'var(--c-cena)'];
      projectionSeries(this.plans.plan(), start.kg, start.date, until).forEach((p, i) =>
        series.push({ label: p.label, points: p.points, color: colors[i % colors.length], dashed: true }),
      );
    }
    series.unshift({ label: 'Il tuo peso', points: weights.map((w) => ({ date: w.date, value: w.kg })), color: 'var(--primary)', dots: true });
    return series;
  });

  /** Regola "peso fermo" del piano (solo se il professionista l'ha prevista). */
  protected readonly stall = computed(() => {
    const rule = this.plans.catalog().rules.find((r) => r.type === 'weight-stall');
    if (!rule || rule.type !== 'weight-stall') return null;
    return weightStalled(this.store.weights(), rule.weeks, rule.direction, this.todayDate) ? rule.text : null;
  });

  protected readonly form = signal<{ date: IsoDate; kg: string; fat: string; muscle: string; bmr: string; extra: Record<string, number> }>(this.emptyForm());
  protected readonly scan = signal<{ state: 'idle' | 'busy' | 'done' | 'error'; text?: string }>({ state: 'idle' });
  protected readonly saved = signal(false);

  private emptyForm() {
    return { date: today(), kg: '', fat: '', muscle: '', bmr: '', extra: {} as Record<string, number> };
  }

  protected patchForm(p: Partial<ReturnType<ProgressPage['emptyForm']>>): void {
    this.form.update((f) => ({ ...f, ...p }));
  }

  private num(v: string): number | undefined {
    const n = parseFloat(v.replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  protected async saveWeight(): Promise<void> {
    const f = this.form();
    const kg = this.num(f.kg);
    if (!kg) return;
    await this.store.saveWeight({
      date: f.date,
      kg,
      fatPct: this.num(f.fat),
      muscleKg: this.num(f.muscle),
      bmrKcal: this.num(f.bmr),
      extra: Object.keys(f.extra).length ? f.extra : undefined,
    });
    this.form.set(this.emptyForm());
    this.scan.set({ state: 'idle' });
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 1600);
  }

  protected async importScreenshot(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.scan.set({ state: 'busy' });
    try {
      const { reading, fields } = parseScaleWords(await this.ocr.words(file));
      if (!fields.length) {
        this.scan.set({ state: 'error', text: 'Non ho trovato valori nello screenshot: inseriscili a mano.' });
        return;
      }
      const s = (n?: number) => (n === undefined ? '' : String(n).replace('.', ','));
      const extra: Record<string, number> = {};
      for (const k of EXTRA_FIELDS) if (reading[k] !== undefined) extra[k] = reading[k]!;
      this.patchForm({
        date: reading.date ?? this.form().date,
        kg: s(reading.weightKg),
        fat: s(reading.fatPct),
        muscle: s(reading.muscleKg),
        bmr: s(reading.bmrKcal),
        extra,
      });
      this.scan.set({ state: 'done', text: `Letti ${fields.length} valori${reading.date ? ' (pesata del ' + reading.date.split('-').reverse().join('/') + ')' : ''}: controlla e salva.` });
    } catch (e) {
      this.scan.set({
        state: 'error',
        text: e instanceof OcrLoadError ? 'Non riesco a caricare il motore di lettura: riprova online.' : 'Lettura non riuscita: inserisci i valori a mano.',
      });
    }
  }

  protected extraLabel(k: string): string {
    return SCALE_FIELD_LABELS[k as ScaleField] ?? k;
  }

  // ---------- Composizione ----------

  protected readonly composition = computed<TimeSeries[]>(() => {
    const w = this.store.weights();
    return [
      { label: 'Grasso %', points: w.filter((x) => x.fatPct).map((x) => ({ date: x.date, value: x.fatPct! })), color: 'var(--c-colazione)', dots: true },
    ];
  });
  protected readonly muscle = computed<TimeSeries[]>(() => {
    const w = this.store.weights();
    return [{ label: 'Massa muscolare', points: w.filter((x) => x.muscleKg).map((x) => ({ date: x.date, value: x.muscleKg! })), color: 'var(--c-spuntino)', dots: true }];
  });
  protected readonly startBody = computed(() => this.profiles.effective().body);

  // ---------- Misure ----------

  protected readonly mForm = signal<Record<string, string>>({});
  protected readonly waist = computed(() => waistAlert(this.store.measurements(), this.todayDate));
  protected readonly lastMeasure = computed(() => this.store.measurements().at(-1) ?? null);
  protected readonly measureDue = computed(() => {
    const last = this.lastMeasure();
    return !last || addDays(last.date, 28) <= this.todayDate;
  });

  protected setMeasure(key: string, value: string): void {
    this.mForm.update((f) => ({ ...f, [key]: value }));
  }

  protected async saveMeasures(): Promise<void> {
    const f = this.mForm();
    const entry: MeasurementEntry = { date: this.todayDate };
    for (const m of MEASURES) {
      const v = this.num(f[m.key] ?? '');
      if (v) entry[m.key] = v;
    }
    if (Object.keys(entry).length === 1) return;
    await this.store.saveMeasurement(entry);
    this.mForm.set({});
  }

  protected measureDelta(key: keyof Omit<MeasurementEntry, 'date'>): number | null {
    const list = this.store.measurements().filter((m) => m[key] !== undefined);
    if (list.length < 2) return null;
    return Math.round((list.at(-1)![key]! - list[0][key]!) * 10) / 10;
  }

  // ---------- Aderenza ----------

  private readonly startDate = computed(() => this.profiles.effective().startDate);

  protected readonly adherenceNow = computed(() => {
    const resolve = this.days.resolver();
    const start = this.startDate();
    const t = this.todayDate;
    const clamp = (d: IsoDate) => (d < start ? start : d);
    const monthStart = `${t.slice(0, 8)}01`;
    return {
      week: adherence(resolve, clamp(mondayOf(t)), t),
      month: adherence(resolve, clamp(monthStart), t),
    };
  });

  /** Ultime 8 settimane: aderenza alla dieta e sedute di allenamento. */
  protected readonly weeks = computed(() => {
    const resolve = this.days.resolver();
    const start = this.startDate();
    const sessions = this.workouts.sessions();
    const withSets = new Set(this.workouts.sets().map((s) => s.sessionId));
    const target = Math.max(1, this.profiles.effective().gymDays.length);
    const out = [];
    for (let i = 7; i >= 0; i--) {
      const monday = addDays(mondayOf(this.todayDate), -7 * i);
      const sunday = addDays(monday, 6);
      if (sunday < mondayOf(start)) continue;
      const from = monday < start ? start : monday;
      const to = sunday > this.todayDate ? this.todayDate : sunday;
      const a = adherence(resolve, from, to);
      const done = new Set(sessions.filter((s) => s.date >= monday && s.date <= sunday && s.id && withSets.has(s.id)).map((s) => s.date)).size;
      out.push({ monday, jsDate: parseIsoDate(monday), adherence: a, sessions: done, target, dots: Array.from({ length: target }, (_, k) => k < done) });
    }
    return out;
  });
  protected readonly consistency = this.workouts.consistency;
}
