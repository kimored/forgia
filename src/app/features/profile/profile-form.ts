import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { ProfileService } from '../../core/data/profile.service';
import type { Weekday } from '../../core/models/plan';
import type { PersonalReminder, Profile, Sex, TimeSlot } from '../../core/models/profile';
import { WEEKDAY_SHORT, mondayOf } from '../../core/domain/dates';

type Section = 'tu' | 'inizio' | 'obiettivi' | 'orari';

/**
 * Form "I miei dati". In modalità `wizard` mostra una sezione alla volta (primo avvio),
 * in modalità `edit` tutte insieme (Impostazioni).
 */
@Component({
  selector: 'app-profile-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-form.html',
  styleUrl: './profile-form.scss',
})
export class ProfileForm {
  private readonly profiles = inject(ProfileService);

  readonly mode = input<'wizard' | 'edit'>('edit');
  readonly saved = output<void>();

  protected readonly model = signal<Profile>(this.profiles.draft());
  protected readonly step = signal(0);
  protected readonly saving = signal(false);
  protected readonly savedFlash = signal(false);

  protected readonly sections: { id: Section; title: string }[] = [
    { id: 'tu', title: 'Su di te' },
    { id: 'inizio', title: 'Punto di partenza' },
    { id: 'obiettivi', title: 'Obiettivi e palestra' },
    { id: 'orari', title: 'Orari e promemoria' },
  ];
  protected readonly weekdays = WEEKDAY_SHORT.map((label, i) => ({ label, value: i as Weekday }));
  protected readonly timeSlots: { id: TimeSlot; label: string }[] = [
    { id: 'colazione', label: 'Colazione' },
    { id: 'spuntino1', label: 'Spuntino mattina' },
    { id: 'pranzo', label: 'Pranzo' },
    { id: 'spuntino2', label: 'Spuntino pomeriggio' },
    { id: 'cena', label: 'Cena' },
    { id: 'palestra', label: 'Palestra (inizio)' },
    { id: 'post', label: 'Post-allenamento' },
  ];
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

  protected setTarget(key: 'kcal' | 'proteinG', value: string): void {
    const n = this.num(value);
    if (n !== undefined) this.model.update((m) => ({ ...m, targets: { ...m.targets, [key]: n } }));
  }

  protected setTime(slot: TimeSlot, value: string): void {
    if (value) this.model.update((m) => ({ ...m, times: { ...m.times, [slot]: value } }));
  }

  protected toggleGymDay(day: Weekday): void {
    this.model.update((m) => {
      const days = m.gymDays.includes(day) ? m.gymDays.filter((d) => d !== day) : [...m.gymDays, day];
      return { ...m, gymDays: days.sort() };
    });
  }

  protected addReminder(): void {
    const r: PersonalReminder = { id: crypto.randomUUID(), time: '08:00', text: '', enabled: true };
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
    this.saved.emit();
  }
}
