import { Injectable, computed, inject, signal } from '@angular/core';
import { SettingsService } from '../data/settings.service';
import { NotificationService } from './notification.service';

/**
 * Timer di recupero tra le serie. Si basa sull'orario di fine (non su un contatore),
 * così resta corretto anche se il browser rallenta i timer con lo schermo spento.
 * A fine recupero: vibrazione (Android) e un suono breve (iOS non vibra dal web).
 */
@Injectable({ providedIn: 'root' })
export class RestTimerService {
  private readonly settings = inject(SettingsService);
  private readonly notifications = inject(NotificationService);
  private endAt = 0;
  private tick: ReturnType<typeof setInterval> | null = null;
  private audio: AudioContext | null = null;

  readonly total = signal(0);
  readonly remaining = signal(0);
  readonly running = computed(() => this.remaining() > 0);
  readonly label = signal('');
  /** Breve stato "Recupero finito" dopo lo scadere. */
  readonly finished = signal(false);

  /** Da chiamare dentro un tap: sblocca l'audio su iOS. */
  start(seconds: number, label = ''): void {
    this.unlockAudio();
    this.endAt = Date.now() + seconds * 1000;
    this.total.set(seconds);
    this.label.set(label);
    this.finished.set(false);
    this.update();
    if (this.tick) clearInterval(this.tick);
    this.tick = setInterval(() => this.update(), 250);
  }

  add(seconds: number): void {
    if (!this.running()) return;
    this.endAt += seconds * 1000;
    this.total.update((t) => t + seconds);
    this.update();
  }

  skip(): void {
    this.stop();
    this.finished.set(false);
  }

  private stop(): void {
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
    this.remaining.set(0);
  }

  private update(): void {
    const left = Math.max(0, Math.ceil((this.endAt - Date.now()) / 1000));
    this.remaining.set(left);
    if (left === 0 && this.tick) {
      this.stop();
      this.finished.set(true);
      this.alert();
      setTimeout(() => this.finished.set(false), 4000);
    }
  }

  private alert(): void {
    if (!this.settings.settings().restAlert) return;
    navigator.vibrate?.([200, 100, 200, 100, 300]);
    this.beep();
    // Con lo schermo su un'altra app, una notifica (se l'utente le ha attivate).
    if (document.hidden && this.settings.settings().notifications) {
      void this.notifications.notify('Recupero finito', this.label() || 'Vai con la prossima serie!', 'rest');
    }
  }

  private unlockAudio(): void {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.audio ??= new Ctx();
      if (this.audio.state === 'suspended') void this.audio.resume();
    } catch {
      this.audio = null;
    }
  }

  /** Tre "bip" brevi generati al volo (nessun file audio). */
  private beep(): void {
    const ctx = this.audio;
    if (!ctx) return;
    const t0 = ctx.currentTime;
    [0, 0.25, 0.5].forEach((dt, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = i === 2 ? 1320 : 880;
      gain.gain.setValueAtTime(0.0001, t0 + dt);
      gain.gain.exponentialRampToValueAtTime(0.4, t0 + dt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + dt);
      osc.stop(t0 + dt + 0.2);
    });
  }
}
