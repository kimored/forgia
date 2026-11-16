import { Injectable, signal } from '@angular/core';

export type NotifyPermission = 'granted' | 'denied' | 'default' | 'unsupported';

/**
 * Notifiche locali. Senza un server non si possono programmare notifiche affidabili ad app
 * chiusa (né su iOS né su Android): qui si notificano solo eventi mentre l'app è aperta o
 * appena messa in background (fine recupero, pasto in arrivo). Su iOS servono iOS 16.4+
 * e l'app installata nella schermata Home.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly permission = signal<NotifyPermission>(this.read());
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  private read(): NotifyPermission {
    return typeof Notification === 'undefined' ? 'unsupported' : (Notification.permission as NotifyPermission);
  }

  /** Da chiamare dentro un tap (richiesto da Safari). */
  async request(): Promise<NotifyPermission> {
    if (typeof Notification === 'undefined') return 'unsupported';
    const p = (await Notification.requestPermission()) as NotifyPermission;
    this.permission.set(p);
    return p;
  }

  async notify(title: string, body: string, tag: string): Promise<void> {
    if (this.read() !== 'granted') return;
    const options: NotificationOptions = {
      body,
      tag,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      // Il service worker di Angular apre/porta in primo piano l'app al tocco.
      data: { onActionClick: { default: { operation: 'focusLastFocusedOrOpen', url: './oggi' } } },
    };
    try {
      // Con il service worker la notifica funziona anche con l'app in background.
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) await reg.showNotification(title, options);
      else new Notification(title, options);
    } catch {
      /* notifiche non disponibili in questo contesto */
    }
  }

  /** Programma una notifica per oggi a un orario "HH:mm" (vale finché l'app resta in memoria). */
  scheduleToday(id: string, time: string, title: string, body: string): void {
    this.cancel(id);
    const [h, m] = time.split(':').map(Number);
    const at = new Date();
    at.setHours(h, m || 0, 0, 0);
    const ms = at.getTime() - Date.now();
    if (ms <= 0 || ms > 24 * 3600 * 1000) return;
    this.timers.set(id, setTimeout(() => void this.notify(title, body, id), ms));
  }

  cancel(id: string): void {
    const t = this.timers.get(id);
    if (t) clearTimeout(t);
    this.timers.delete(id);
  }

  cancelAll(prefix = ''): void {
    for (const id of [...this.timers.keys()]) if (id.startsWith(prefix)) this.cancel(id);
  }
}
