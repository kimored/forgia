import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Icon, type IconName } from '../shared/ui/icon';
import { BackupService } from '../core/data/backup.service';

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

  protected readonly nav: NavItem[] = [
    { path: 'oggi', label: 'Oggi', icon: 'today' },
    { path: 'settimana', label: 'Settimana', icon: 'week' },
    { path: 'allenamento', label: 'Allenamento', icon: 'workout' },
    { path: 'dispensa', label: 'Dispensa', icon: 'pantry' },
    { path: 'progressi', label: 'Progressi', icon: 'progress' },
  ];
}
