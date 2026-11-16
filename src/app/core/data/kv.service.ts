import { Injectable } from '@angular/core';
import { db } from './db';

@Injectable({ providedIn: 'root' })
export class KvService {
  async get<T>(key: string): Promise<T | undefined> {
    return (await db.kv.get(key))?.value as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await db.kv.put({ key, value });
  }
}
