import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { today } from '../domain/dates';
import { dailyReminders, type Reminder } from '../domain/reminders';
import { NotificationService } from '../platform/notification.service';
import { DayStore } from './day.store';
import { PantryStore } from './pantry.store';
import { ProfileService } from './profile.service';
import { ProgressStore } from './progress.store';
import { SettingsService } from './settings.service';
import { WorkoutStore } from './workout.store';

/** Promemoria del giorno (banner in-app) e notifiche locali programmate per oggi. */
@Injectable({ providedIn: 'root' })
export class ReminderService {
  private readonly days = inject(DayStore);
  private readonly pantry = inject(PantryStore);
  private readonly progress = inject(ProgressStore);
  private readonly workouts = inject(WorkoutStore);
  private readonly profiles = inject(ProfileService);
  private readonly settings = inject(SettingsService);
  private readonly notifications = inject(NotificationService);

  /** Si aggiorna ogni minuto. */
  private readonly clock = signal(new Date());
  private readonly dismissed = signal(new Set<string>());

  constructor() {
    setInterval(() => this.clock.set(new Date()), 60_000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.clock.set(new Date());
    });
    // Notifiche locali per i pasti e i promemoria di oggi (solo se l'utente le ha attivate).
    effect(() => this.schedule());
  }

  private readonly input = computed(() => {
    const now = this.clock();
    const date = today();
    const day = this.days.day(date);
    const habitsDone = this.days.habits(date);
    const profile = this.profiles.effective();
    const plan = this.workouts.plan(date);
    return {
      today: date,
      now: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      day,
      weighedToday: this.progress.weights().some((w) => w.date === date),
      lastMeasure: this.progress.measurements().at(-1)?.date,
      habits: this.days.catalog().habits.map((h) => ({ id: h.id, label: h.label, done: !!habitsDone.done?.[h.id] })),
      pantryAlerts: this.pantry.alerts().length,
      workout: { planned: !!plan, started: !!this.workouts.sessionOn(date), time: profile.times['palestra'] },
      personal: profile.reminders
        .filter((r) => r.enabled)
        .map((r) => ({ id: r.id, time: r.time, text: r.text, done: (habitsDone.reminders ?? []).includes(r.id) })),
    };
  });

  readonly reminders = computed<Reminder[]>(() => {
    const hidden = this.dismissed();
    return dailyReminders(this.input()).filter((r) => !hidden.has(r.id));
  });

  dismiss(id: string): void {
    this.dismissed.update((s) => new Set(s).add(id));
  }

  private schedule(): void {
    const i = this.input();
    this.notifications.cancelAll('day-');
    if (!this.settings.settings().notifications || this.notifications.permission() !== 'granted') return;
    for (const m of i.day.meals) {
      if (m.free || (m.log?.status ?? 'todo') !== 'todo') continue;
      this.notifications.scheduleToday(`day-meal-${m.slot}`, m.time, `${m.time} · ${m.option?.title ?? 'Pasto'}`, 'Apri Forgia per vedere grammature e varianti.');
    }
    for (const r of i.personal) {
      if (!r.done) this.notifications.scheduleToday(`day-rem-${r.id}`, r.time, 'Promemoria', r.text);
    }
  }
}
