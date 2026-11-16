import { Injectable, signal } from '@angular/core';

/**
 * Chiede al browser di non cancellare IndexedDB quando manca spazio.
 * Su iOS i dati di una PWA possono comunque sparire: per questo c'è anche
 * il promemoria mensile di backup (BackupService).
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  readonly persisted = signal<boolean | null>(null);

  async init(): Promise<void> {
    if (!navigator.storage?.persist) return;
    try {
      const already = await navigator.storage.persisted();
      this.persisted.set(already || (await navigator.storage.persist()));
    } catch {
      this.persisted.set(false);
    }
  }
}
