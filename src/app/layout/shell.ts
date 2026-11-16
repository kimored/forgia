import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Icon, type IconName } from '../shared/ui/icon';
import { BackupService } from '../core/data/backup.service';
import { PantryStore } from '../core/data/pantry.store';
import { ReminderService } from '../core/data/reminder.service';

interface NavItem {
  path: string;
  label: string;
  icon: IconName;
}

/**
 * Struttura responsive:
 *  - < 600 px: tab bar in basso
 *  - ≥ 600 px: navigation rail a sinistra (tablet), con etichette estese oltre 1024 px
 * Il breakpoint è sulla larghezza del viewport, quindi funziona anche in Split View su iPad.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  protected readonly backup = inject(BackupService);
  private readonly pantry = inject(PantryStore);
  protected readonly reminders = inject(ReminderService);

  /** Promemoria e backup stanno nel pannello della campanella, non più fissi sullo schermo. */
  protected readonly notifOpen = signal(false);
  protected readonly notifCount = computed(() => this.reminders.reminders().length + (this.backup.due() ? 1 : 0));

  /** Badge per tab (per ora: prodotti in esaurimento sulla Dispensa). */
  protected readonly badges = computed<Record<string, number>>(() => ({ dispensa: this.pantry.alerts().length }));

  constructor() {
    // Badge sull'icona dell'app installata, dove supportato (Android/Chrome, iOS 16.4+ installata).
    effect(() => {
      const n = this.notifCount();
      const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
      (n ? nav.setAppBadge?.(n) : nav.clearAppBadge?.())?.catch(() => {});
    });
  }

  protected readonly nav: NavItem[] = [
    { path: 'oggi', label: 'Oggi', icon: 'today' },
    { path: 'settimana', label: 'Settimana', icon: 'week' },
    { path: 'allenamento', label: 'Allenamento', icon: 'workout' },
    { path: 'progressi', label: 'Progressi', icon: 'progress' },
  ];
}
