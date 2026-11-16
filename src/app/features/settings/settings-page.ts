import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ThemeService, type ThemePref } from '../../core/platform/theme.service';
import { InstallService } from '../../core/platform/install.service';
import { StorageService } from '../../core/platform/storage.service';
import { BackupService } from '../../core/data/backup.service';
import { SettingsService } from '../../core/data/settings.service';
import { Icon } from '../../shared/ui/icon';

@Component({
  selector: 'app-settings-page',
  imports: [DatePipe, RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  protected readonly theme = inject(ThemeService);
  protected readonly install = inject(InstallService);
  protected readonly storage = inject(StorageService);
  protected readonly backup = inject(BackupService);
  protected readonly app = inject(SettingsService);

  protected setAlertDays(value: string): void {
    const n = parseInt(value, 10);
    if (n >= 1 && n <= 30) void this.app.update({ alertDays: n });
  }

  protected readonly themes: { value: ThemePref; label: string }[] = [
    { value: 'auto', label: 'Automatico' },
    { value: 'light', label: 'Chiaro' },
    { value: 'dark', label: 'Scuro' },
  ];
  protected readonly importMessage = signal<{ ok: boolean; text: string } | null>(null);

  protected async onImport(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!confirm('Importare il backup? I dati attuali su questo dispositivo verranno sostituiti.')) return;
    try {
      await this.backup.restore(file);
      this.importMessage.set({ ok: true, text: 'Backup importato. Ricarico…' });
      setTimeout(() => location.reload(), 600);
    } catch (e) {
      this.importMessage.set({ ok: false, text: (e as Error).message });
    }
  }
}
