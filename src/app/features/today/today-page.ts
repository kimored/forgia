import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { DayStore } from '../../core/data/day.store';
import { ProfileService } from '../../core/data/profile.service';
import { addDays, parseIsoDate, today, type IsoDate } from '../../core/domain/dates';
import { dayTips, dayToggles } from '../../core/domain/day-rules';
import type { ResolvedMeal } from '../../core/domain/day-plan';
import type { MealSlot } from '../../core/models/plan';
import type { PersonalReminder } from '../../core/models/profile';
import { slotMeta } from '../../shared/meal-format';
import { mediaSignal } from '../../shared/media';
import { BottomSheet } from '../../shared/ui/bottom-sheet';
import { CheckButton } from '../../shared/ui/check-button';
import { MealCard } from './meal-card';
import { MealDetail } from './meal-detail';

type Entry =
  | { kind: 'meal'; time: string; meal: ResolvedMeal }
  | { kind: 'gym'; time: string; end: string }
  | { kind: 'reminder'; time: string; reminder: PersonalReminder; done: boolean };

const GLASS_ML = 250;
const SWIPE_MIN_PX = 70;

@Component({
  selector: 'app-today-page',
  imports: [DatePipe, DecimalPipe, MealCard, MealDetail, BottomSheet, CheckButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './today-page.html',
  styleUrl: './today-page.scss',
})
export class TodayPage {
  protected readonly store = inject(DayStore);
  private readonly profiles = inject(ProfileService);

  /** ≥ 900 px: dettaglio affiancato invece del bottom sheet. */
  protected readonly wide = mediaSignal('(min-width: 900px)');

  /** Query param ?d=YYYY-MM-DD&pasto=slot (dalla vista Settimana). */
  readonly d = input<string>();
  readonly pasto = input<string>();

  protected readonly date = signal<IsoDate>(today());

  constructor() {
    effect(() => {
      const d = this.d();
      const slot = this.pasto() as MealSlot | undefined;
      untracked(() => {
        if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d !== this.date()) {
          this.direction.set(null);
          this.date.set(d);
        } else if (!d && this.date() !== today()) {
          // Tap sul tab "Oggi" senza parametri: si torna al giorno corrente.
          this.direction.set(null);
          this.date.set(today());
        }
        if (slot && this.store.catalog().slot(slot)) this.openMeal(slot);
      });
    });
  }
  protected readonly direction = signal<'next' | 'prev' | null>(null);
  protected readonly isToday = computed(() => this.date() === today());
  protected readonly jsDate = computed(() => parseIsoDate(this.date()));

  protected readonly day = computed(() => this.store.day(this.date()));
  protected readonly profile = this.profiles.effective;
  protected readonly habits = computed(() => this.store.habits(this.date()));
  protected readonly tips = computed(() => dayTips(this.store.catalog(), this.day()));
  protected readonly toggles = computed(() => dayToggles(this.store.catalog(), this.day()));
  protected readonly plan = computed(() => this.store.catalog().meta);
  protected readonly hasFree = computed(() => this.day().meals.some((m) => m.free));
  /** Abitudini del piano (es. integratori) con spunta e giorni di fila. */
  protected readonly planHabits = computed(() => {
    const day = this.day();
    const done = this.habits().done ?? {};
    return this.store.catalog().habits.map((h) => ({
      ...h,
      done: !!done[h.id],
      hintNow: (day.gym ? h.hintGym : undefined) ?? h.hint,
      streak: this.store.habitStreak(this.date(), h.id),
    }));
  });

  protected readonly entries = computed<Entry[]>(() => {
    const day = this.day();
    const p = this.profile();
    const doneReminders = new Set(this.habits().reminders ?? []);
    const list: Entry[] = [
      ...p.reminders
        .filter((r) => r.enabled)
        .map<Entry>((r) => ({ kind: 'reminder', time: r.time, reminder: r, done: doneReminders.has(r.id) })),
      ...day.meals.map<Entry>((m) => ({ kind: 'meal', time: m.time, meal: m })),
    ];
    if (day.gym) list.push({ kind: 'gym', time: p.times['palestra'] ?? '22:00', end: p.gymEnd });
    // A parità di orario la palestra viene prima del post-allenamento.
    return list.sort((a, b) => a.time.localeCompare(b.time) || (a.kind === 'gym' ? -1 : 1));
  });

  protected readonly water = computed(() => {
    const ml = this.habits().waterMl ?? 0;
    const target = this.profile().waterTargetMl;
    const glasses = Math.ceil(target / GLASS_ML);
    return { ml, target, glasses, filled: Math.min(glasses, Math.floor(ml / GLASS_ML)) };
  });

  // ---------- Selezione e varianti ----------

  private readonly picked = signal<MealSlot | null>(null);
  protected readonly sheetOpen = signal(false);
  protected readonly menuSlot = signal<MealSlot | null>(null);
  protected readonly menuOpen = signal(false);
  protected readonly toast = signal<string | null>(null);

  /** Su schermi larghi c'è sempre un pasto selezionato: il primo ancora da fare. */
  protected readonly selectedSlot = computed<MealSlot | null>(() => {
    const p = this.picked();
    if (p && this.day().meals.some((m) => m.slot === p)) return p;
    if (!this.wide()) return p;
    const meals = this.day().meals;
    return (meals.find((m) => (m.log?.status ?? 'todo') === 'todo') ?? meals[0]).slot;
  });
  protected readonly selectedMeal = computed(() => this.day().meals.find((m) => m.slot === this.selectedSlot()) ?? null);
  protected readonly variants = computed(() => {
    const slot = this.selectedSlot();
    return slot ? this.store.variants(this.date(), slot) : [];
  });
  protected readonly menuMeal = computed(() => this.day().meals.find((m) => m.slot === this.menuSlot()) ?? null);

  protected slotLabel(slot: MealSlot): string {
    return slotMeta(this.store.catalog(), slot).label;
  }

  protected openMeal(slot: MealSlot): void {
    this.picked.set(slot);
    if (!this.wide()) this.sheetOpen.set(true);
  }

  protected openMenu(slot: MealSlot): void {
    this.menuSlot.set(slot);
    this.menuOpen.set(true);
  }

  protected async pick(optionId: string): Promise<void> {
    const slot = this.selectedSlot();
    if (!slot) return;
    const meal = this.selectedMeal();
    if (meal?.option?.id === optionId) return;
    await this.store.replace(this.date(), slot, optionId);
    this.flash(optionId === meal?.planned?.id ? 'Tornato al previsto' : 'Pasto sostituito');
    if (!this.wide()) setTimeout(() => this.sheetOpen.set(false), 380);
  }

  protected toggle(slot: MealSlot): void {
    void this.store.toggleDone(this.date(), slot);
  }

  protected skip(slot: MealSlot): void {
    const status = this.day().meals.find((m) => m.slot === slot)?.log?.status;
    void this.store.setStatus(this.date(), slot, status === 'skipped' ? 'todo' : 'skipped');
  }

  protected reset(slot: MealSlot): void {
    void this.store.resetToPlan(this.date(), slot);
    this.flash('Tornato al previsto');
  }

  protected menuAction(action: 'done' | 'skip' | 'replace' | 'reset' | 'clear'): void {
    const slot = this.menuSlot();
    if (!slot) return;
    this.menuOpen.set(false);
    const date = this.date();
    switch (action) {
      case 'done':
        void this.store.setStatus(date, slot, 'done');
        break;
      case 'skip':
        void this.store.setStatus(date, slot, 'skipped');
        break;
      case 'clear':
        void this.store.setStatus(date, slot, 'todo');
        break;
      case 'reset':
        void this.store.resetToPlan(date, slot);
        break;
      case 'replace':
        // Aspetta la chiusura del menu prima di aprire le varianti (una voce di cronologia alla volta).
        setTimeout(() => this.openMeal(slot), 260);
        break;
    }
  }

  private flash(text: string): void {
    this.toast.set(text);
    setTimeout(() => this.toast.set(null), 1600);
  }

  // ---------- Opzioni e abitudini ----------

  protected toggleOption(id: string): void {
    void this.store.toggleOption(this.date(), id);
  }

  protected water_(delta: number): void {
    void this.store.addWater(this.date(), delta * GLASS_ML);
  }

  protected setGlasses(n: number): void {
    const target = n * GLASS_ML;
    void this.store.addWater(this.date(), target === this.water().ml ? -GLASS_ML : target - this.water().ml);
  }

  // ---------- Navigazione tra i giorni ----------

  protected go(delta: number): void {
    this.direction.set(delta > 0 ? 'next' : 'prev');
    this.picked.set(null);
    this.date.update((d) => addDays(d, delta));
  }

  protected goToday(): void {
    const t = today();
    this.direction.set(t > this.date() ? 'next' : 'prev');
    this.picked.set(null);
    this.date.set(t);
  }

  private swipe: { x: number; y: number } | null = null;

  protected swipeStart(e: PointerEvent): void {
    if (e.pointerType === 'mouse') return;
    this.swipe = { x: e.clientX, y: e.clientY };
  }

  protected swipeEnd(e: PointerEvent): void {
    if (!this.swipe) return;
    const dx = e.clientX - this.swipe.x;
    const dy = e.clientY - this.swipe.y;
    this.swipe = null;
    if (Math.abs(dx) > SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.5) this.go(dx < 0 ? 1 : -1);
  }

  protected readonly range = (n: number) => Array.from({ length: n }, (_, i) => i);
}
