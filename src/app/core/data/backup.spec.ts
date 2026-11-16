import { describe, expect, it } from 'vitest';
import { BACKUP_FORMAT, isBackupDue, parseBackup } from './backup';

describe('isBackupDue', () => {
  const now = new Date('2026-11-16T10:00:00Z');

  it('è dovuto se non è mai stato fatto un backup', () => {
    expect(isBackupDue(undefined, now)).toBe(true);
  });

  it('non è dovuto prima di 30 giorni', () => {
    expect(isBackupDue('2026-10-20T10:00:00Z', now)).toBe(false);
  });

  it('è dovuto dopo 30 giorni', () => {
    expect(isBackupDue('2026-10-17T10:00:00Z', now)).toBe(true);
  });

  it('rispetta il rinvio', () => {
    expect(isBackupDue(undefined, now, '2026-11-20T00:00:00Z')).toBe(false);
    expect(isBackupDue(undefined, now, '2026-11-10T00:00:00Z')).toBe(true);
  });
});

describe('parseBackup', () => {
  it('accetta un backup valido', () => {
    const json = JSON.stringify({ format: BACKUP_FORMAT, schemaVersion: 1, exportedAt: '', tables: { kv: [] } });
    expect(parseBackup(json).tables['kv']).toEqual([]);
  });

  it('rifiuta JSON non valido o di altro formato', () => {
    expect(() => parseBackup('{')).toThrow(/JSON/);
    expect(() => parseBackup('{"foo":1}')).toThrow(/backup di Forgia/);
  });
});
