import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ThemeService, type ThemePref } from '../../core/platform/theme.service';
import { InstallService } from '../../core/platform/install.service';
import { StorageService } from '../../core/platform/storage.service';
import { BackupService } from '../../core/data/backup.service';
import { SettingsService } from '../../core/data/settings.service';
import { PlanImportError, PlanService } from '../../core/data/plan.service';
import { Icon } from '../../shared/ui/icon';
import { PROGRAM } from '../../core/domain/workout';

@Component({
  selector: 'app-settings-page',
  imports: [DatePipe, DecimalPipe, RouterLink, Icon],
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
  protected readonly phases = PROGRAM.phases;
  protected readonly plans = inject(PlanService);
  protected readonly planMessage = signal<{ ok: boolean; text: string } | null>(null);
  protected readonly hasOtherPart = computed(() => this.plans.catalog().slots.some((s) => s.owner === 'other'));

  protected async importPlan(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const doc = await this.plans.importFile(file);
      this.planMessage.set({ ok: true, text: 'Piano caricato: ' + doc.meta.title });
    } catch (e) {
      const errors = e instanceof PlanImportError ? e.errors : [String(e)];
      this.planMessage.set({ ok: false, text: errors.slice(0, 3).join(' ') });
    }
  }

  protected async useExample(): Promise<void> {
    if (!confirm('Tornare al piano di esempio? Il piano attuale verrà sostituito (esportalo prima se ti serve).')) return;
    await this.plans.useExample();
    this.planMessage.set({ ok: true, text: 'Piano di esempio attivo.' });
  }

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
