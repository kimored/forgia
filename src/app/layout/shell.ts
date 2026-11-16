import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Icon, type IconName } from '../shared/ui/icon';
import { BackupService } from '../core/data/backup.service';
import { PantryStore } from '../core/data/pantry.store';

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

  /** Badge per tab (per ora: prodotti in esaurimento sulla Dispensa). */
  protected readonly badges = computed<Record<string, number>>(() => ({ dispensa: this.pantry.alerts().length }));

  constructor() {
    // Badge sull'icona dell'app installata, dove supportato (Android/Chrome, iOS 16.4+ installata).
    effect(() => {
      const n = this.pantry.alerts().length;
      const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
      (n ? nav.setAppBadge?.(n) : nav.clearAppBadge?.())?.catch(() => {});
    });
  }

  protected readonly nav: NavItem[] = [
    { path: 'oggi', label: 'Oggi', icon: 'today' },
    { path: 'settimana', label: 'Settimana', icon: 'week' },
    { path: 'allenamento', label: 'Allenamento', icon: 'workout' },
    { path: 'dispensa', label: 'Dispensa', icon: 'pantry' },
    { path: 'progressi', label: 'Progressi', icon: 'progress' },
  ];
}
