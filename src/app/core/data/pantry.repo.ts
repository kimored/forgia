import { db } from './db';

/**
 * Scritture sulla dispensa condivise da DayStore (scalo automatico) e PantryStore.
 * Modulo senza DI per evitare dipendenze circolari tra i due store.
 */
export async function adjustStock(items: { productId: string; qty: number }[], sign: 1 | -1): Promise<void> {
  if (!items.length) return;
  await db.transaction('rw', db.pantry, async () => {
    for (const { productId, qty } of items) {
      const current = (await db.pantry.get(productId))?.qty ?? 0;
      await db.pantry.put({ productId, qty: Math.max(0, round(current + sign * qty)), updatedAt: new Date().toISOString() });
    }
  });
}

export async function setStock(productId: string, qty: number): Promise<void> {
  await db.pantry.put({ productId, qty: Math.max(0, round(qty)), updatedAt: new Date().toISOString() });
}

const round = (n: number) => Math.round(n * 100) / 100;
