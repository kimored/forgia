import { Injectable, inject, signal } from '@angular/core';
import { db } from './db';
import { exportDb, importDb, isBackupDue, parseBackup } from './backup';
import { KvService } from './kv.service';

const LAST_BACKUP = 'lastBackupAt';
const SNOOZE = 'backupSnoozedUntil';
const FIRST_RUN = 'firstRunAt';
const SNOOZE_DAYS = 7;

@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly kv = inject(KvService);

  readonly lastBackupAt = signal<string | undefined>(undefined);
  readonly due = signal(false);

  async init(): Promise<void> {
    const [last, snooze, firstRun] = await Promise.all([
      this.kv.get<string>(LAST_BACKUP),
      this.kv.get<string>(SNOOZE),
      this.kv.get<string>(FIRST_RUN),
    ]);
    const now = new Date();
    if (!firstRun) await this.kv.set(FIRST_RUN, now.toISOString());
    this.lastBackupAt.set(last);
    // Senza backup precedenti, i 30 giorni partono dal primo avvio.
    this.due.set(isBackupDue(last ?? firstRun ?? now.toISOString(), now, snooze));
  }

  async download(): Promise<void> {
    const now = new Date();
    const backup = await exportDb(db, now);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const name = `forgia-backup-${now.toISOString().slice(0, 10)}.json`;

    // Su iOS/Android il foglio di condivisione permette di salvare su File / Drive.
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Backup Forgia' });
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return;
        this.saveViaLink(blob, name);
      }
    } else {
      this.saveViaLink(blob, name);
    }
    await this.markDone(now);
  }

  async restore(file: Blob): Promise<void> {
    await importDb(db, parseBackup(await file.text()));
    await this.markDone(new Date());
  }

  async snooze(): Promise<void> {
    await this.kv.set(SNOOZE, new Date(Date.now() + SNOOZE_DAYS * 86_400_000).toISOString());
    this.due.set(false);
  }

  private async markDone(at: Date): Promise<void> {
    await this.kv.set(LAST_BACKUP, at.toISOString());
    this.lastBackupAt.set(at.toISOString());
    this.due.set(false);
  }

  private saveViaLink(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
