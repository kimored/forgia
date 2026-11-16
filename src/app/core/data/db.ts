import Dexie, { type Table } from 'dexie';

/** Record chiave/valore per impostazioni e metadati dell'app. */
export interface KeyValue<T = unknown> {
  key: string;
  value: T;
}

/**
 * Database locale (IndexedDB). Contiene SOLO dati utente: restano sul dispositivo
 * e finiscono nell'export JSON di backup. Le tabelle dei log arrivano con le
 * prossime versioni dello schema.
 */
export class ForgiaDb extends Dexie {
  kv!: Table<KeyValue, string>;

  constructor(name = 'forgia') {
    super(name);
    this.version(1).stores({
      kv: 'key',
    });
  }
}

export const db = new ForgiaDb();
