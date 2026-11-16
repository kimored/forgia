import type Dexie from 'dexie';

export const BACKUP_FORMAT = 'forgia-backup';
export const BACKUP_INTERVAL_DAYS = 30;
const DAY_MS = 86_400_000;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

export async function exportDb(database: Dexie, now = new Date()): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {};
  for (const table of database.tables) {
    tables[table.name] = await table.toArray();
  }
  return { format: BACKUP_FORMAT, schemaVersion: database.verno, exportedAt: now.toISOString(), tables };
}

export function parseBackup(json: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('Il file non è un JSON valido.');
  }
  const file = data as Partial<BackupFile>;
  if (file?.format !== BACKUP_FORMAT || typeof file.tables !== 'object' || !file.tables) {
    throw new Error('Il file non è un backup di Forgia.');
  }
  return file as BackupFile;
}

/** Sostituisce tutti i dati con quelli del backup (solo le tabelle note allo schema attuale). */
export async function importDb(database: Dexie, file: BackupFile): Promise<void> {
  if (file.schemaVersion > database.verno) {
    throw new Error("Il backup viene da una versione più recente dell'app: aggiorna l'app e riprova.");
  }
  await database.transaction('rw', database.tables, async () => {
    for (const table of database.tables) {
      await table.clear();
      const rows = file.tables[table.name];
      if (Array.isArray(rows) && rows.length) await table.bulkPut(rows);
    }
  });
}

/** True se è ora di ricordare il backup: mai fatto, o più vecchio di BACKUP_INTERVAL_DAYS. */
export function isBackupDue(lastBackupAt: string | undefined, now = new Date(), snoozedUntil?: string): boolean {
  if (snoozedUntil && new Date(snoozedUntil) > now) return false;
  if (!lastBackupAt) return true;
  return now.getTime() - new Date(lastBackupAt).getTime() >= BACKUP_INTERVAL_DAYS * DAY_MS;
}
