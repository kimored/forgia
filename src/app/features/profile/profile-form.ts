import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ProfileService } from '../../core/data/profile.service';
import type { Weekday } from '../../core/models/plan';
import type { PersonalReminder, Profile, Sex } from '../../core/models/profile';
import { PlanService } from '../../core/data/plan.service';
import { WEEKDAY_SHORT, mondayOf, parseIsoDate } from '../../core/domain/dates';
import { parseScaleWords, SCALE_FIELD_LABELS, type ScaleField } from '../../core/domain/scale-ocr';
import { OcrLoadError, OcrService } from '../../core/platform/ocr.service';

type Section = 'tu' | 'inizio' | 'piano' | 'palestra' | 'orari';

/**
 * Form "I miei dati". In modalità `wizard` mostra una sezione alla volta (primo avvio),
 * in modalità `edit` tutte insieme (Impostazioni).
 */
@Component({
  selector: 'app-profile-form',
  imports: [DatePipe, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-form.html',
  styleUrl: './profile-form.scss',
})
export class ProfileForm {
  private readonly profiles = inject(ProfileService);
  protected readonly ocr = inject(OcrService);

  readonly mode = input<'wizard' | 'edit'>('edit');
  /** importPlan: l'utente vuole importare subito il piano del nutrizionista. */
  readonly saved = output<{ importPlan: boolean }>();
  protected readonly importAfter = signal(true);

  protected readonly model = signal<Profile>(this.profiles.draft());
  protected readonly step = signal(0);
  protected readonly saving = signal(false);
  protected readonly savedFlash = signal(false);

  // ---------- Import da screenshot della bilancia ----------

  protected readonly scan = signal<
    | { state: 'idle' }
    | { state: 'busy' }
    | { state: 'done'; count: number; date?: Date; extras: { label: string; value: number }[] }
    | { state: 'error'; message: string }
  >({ state: 'idle' });
  /** Campi compilati dall'OCR, evidenziati finché non li tocchi. */
  protected readonly fromOcr = signal<Set<string>>(new Set());

  private static readonly EXTRA: ScaleField[] = [
    'bmi', 'skeletalMusclePct', 'proteinPct', 'visceralFat', 'waterPct', 'boneKg', 'metabolicAge',
  ];

  protected async importScreenshot(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.scan.set({ state: 'busy' });
    try {
      const { reading, fields } = parseScaleWords(await this.ocr.words(file));
      if (!fields.length) {
        this.scan.set({ state: 'error', message: 'Non ho trovato valori nello screenshot. Prova con la schermata dei risultati della pesata, oppure inseriscili a mano.' });
        return;
      }
      const { date, weightKg, ...body } = reading;
      this.model.update((m) => ({
        ...m,
        startWeightKg: weightKg ?? m.startWeightKg,
        body: { ...m.body, ...body, measuredAt: date ?? m.body?.measuredAt },
      }));
      this.fromOcr.set(new Set(fields));
      this.scan.set({
        state: 'done',
        count: fields.length,
        date: date ? parseIsoDate(date) : undefined,
        extras: ProfileForm.EXTRA.filter((f) => reading[f] !== undefined).map((f) => ({ label: SCALE_FIELD_LABELS[f], value: reading[f]! })),
      });
    } catch (e) {
      console.error('OCR: lettura non riuscita', e);
      this.scan.set({
        state: 'error',
        message:
          e instanceof OcrLoadError
            ? 'Non riesco a caricare il motore di lettura. La prima volta serve la connessione: riprova online. Se il problema resta, inserisci i valori a mano.'
            : `Lettura non riuscita (${(e as Error)?.message ?? 'errore sconosciuto'}). Riprova con un altro screenshot, oppure inserisci i valori a mano.`,
      });
    }
  }

  protected touched(field: string): void {
    if (!this.fromOcr().has(field)) return;
    const next = new Set(this.fromOcr());
    next.delete(field);
    this.fromOcr.set(next);
  }

  protected readonly sections: { id: Section; title: string }[] = [
    { id: 'tu', title: 'Su di te' },
    { id: 'inizio', title: 'Punto di partenza' },
    { id: 'piano', title: 'Il tuo piano alimentare' },
    { id: 'palestra', title: 'Palestra e acqua' },
    { id: 'orari', title: 'Orari e promemoria' },
  ];
  protected readonly weekdays = WEEKDAY_SHORT.map((label, i) => ({ label, value: i as Weekday }));
  protected readonly plans = inject(PlanService);

  /** Orari: un campo per ogni pasto del piano attivo, più la palestra. */
  protected readonly timeSlots = computed(() => [
    ...this.plans.catalog().slots.map((s) => ({ id: s.id, label: s.gymOnly ? `${s.label} (giorni palestra)` : s.label, def: s.time ?? '12:00' })),
    { id: 'palestra', label: 'Palestra (inizio)', def: '22:00' },
  ]);

  protected readonly sexes: { value: Sex; label: string }[] = [
    { value: 'M', label: 'Uomo' },
    { value: 'F', label: 'Donna' },
    { value: 'altro', label: 'Altro' },
  ];

  protected readonly visible = computed(() =>
    this.mode() === 'wizard' ? [this.sections[this.step()]] : this.sections,
  );
  protected readonly isLast = computed(() => this.step() === this.sections.length - 1);
  protected readonly startMonday = computed(() => mondayOf(this.model().startDate));
  protected readonly nameMissing = computed(() => !this.model().name.trim());

  protected patch(p: Partial<Profile>): void {
    this.model.update((m) => ({ ...m, ...p }));
  }

  protected num(value: string): number | undefined {
    const n = parseFloat(value.replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }

  protected setBody(key: 'fatPct' | 'muscleKg' | 'bmrKcal', value: string): void {
    this.model.update((m) => ({ ...m, body: { ...m.body, [key]: this.num(value) } }));
  }

  protected setTime(slot: string, value: string): void {
    if (value) this.model.update((m) => ({ ...m, times: { ...m.times, [slot]: value } }));
  }

  protected toggleGymDay(day: Weekday): void {
    this.model.update((m) => {
      const days = m.gymDays.includes(day) ? m.gymDays.filter((d) => d !== day) : [...m.gymDays, day];
      return { ...m, gymDays: days.sort() };
    });
  }

  protected addReminder(): void {
    // Niente crypto.randomUUID(): esiste solo in HTTPS, e in locale (http://192.168…) farebbe fallire il click.
    const r: PersonalReminder = { id: `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, time: '08:00', text: '', enabled: true };
    this.model.update((m) => ({ ...m, reminders: [...m.reminders, r] }));
  }

  protected updateReminder(id: string, p: Partial<PersonalReminder>): void {
    this.model.update((m) => ({ ...m, reminders: m.reminders.map((r) => (r.id === id ? { ...r, ...p } : r)) }));
  }

  protected removeReminder(id: string): void {
    this.model.update((m) => ({ ...m, reminders: m.reminders.filter((r) => r.id !== id) }));
  }

  protected next(): void {
    if (this.step() === 0 && this.nameMissing()) return;
    if (this.isLast()) void this.submit();
    else this.step.update((s) => s + 1);
  }

  protected back(): void {
    this.step.update((s) => Math.max(0, s - 1));
  }

  protected async submit(): Promise<void> {
    if (this.nameMissing()) {
      this.step.set(0);
      return;
    }
    this.saving.set(true);
    const m = this.model();
    await this.profiles.save({ ...m, name: m.name.trim(), reminders: m.reminders.filter((r) => r.text.trim()) });
    this.saving.set(false);
    this.savedFlash.set(true);
    setTimeout(() => this.savedFlash.set(false), 1800);
    this.saved.emit({ importPlan: this.mode() === 'wizard' && this.importAfter() });
  }
}
