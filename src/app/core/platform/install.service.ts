import { Injectable, computed, signal } from '@angular/core';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

@Injectable({ providedIn: 'root' })
export class InstallService {
  private deferred: BeforeInstallPromptEvent | null = null;

  /** Android/Chrome: il prompt "Installa app" è disponibile. */
  readonly canPrompt = signal(false);
  readonly standalone = signal(
    matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
  );
  /** iPhone/iPad (iPadOS si presenta come Mac con touch). */
  readonly isIos = signal(
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1),
  );
  readonly showIosHelp = computed(() => this.isIos() && !this.standalone());

  init(): void {
    addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferred = e as BeforeInstallPromptEvent;
      this.canPrompt.set(true);
    });
    addEventListener('appinstalled', () => {
      this.deferred = null;
      this.canPrompt.set(false);
      this.standalone.set(true);
    });
  }

  async prompt(): Promise<void> {
    if (!this.deferred) return;
    await this.deferred.prompt();
    await this.deferred.userChoice;
    this.deferred = null;
    this.canPrompt.set(false);
  }
}
