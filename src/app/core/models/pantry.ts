import type { ProductFormat, Unit } from './plan';

export type { ProductFormat };

export type Store = 'sole365' | 'deco' | 'conad' | 'altro';
export const STORES: { id: Store; name: string }[] = [
  { id: 'sole365', name: 'Sole365' },
  { id: 'deco', name: 'Decò' },
  { id: 'conad', name: 'Conad' },
  { id: 'altro', name: 'Altro' },
];

/** 'other' = la parte di chi cucina per te (es. la nonna), se la lista spesa è divisa. */
export type Owner = 'mine' | 'other';

/**
 * Prodotto della dispensa: un alimento del piano più le info d'acquisto
 * (dal piano, modificabili dall'utente con ProductSettings).
 */
export interface Product {
  id: string;
  name: string;
  brand?: string;
  unit: Unit;
  /** Il primo formato è quello di default per la lista spesa. */
  formats: ProductFormat[];
  aliases?: string[];
  /** Seguito in dispensa e in lista spesa (i prodotti di base di default no). */
  tracked: boolean;
}

/** Dati utente (IndexedDB). */

/** Personalizzazioni dell'utente su un prodotto (marca, confezioni, prezzi di riferimento). */
export interface ProductSettings {
  productId: string;
  brand?: string;
  formats?: ProductFormat[];
  /** Scelta dell'utente: seguirlo o no in dispensa (assente = default del prodotto). */
  tracked?: boolean;
}

export interface PantryItem {
  productId: string;
  qty: number;
  updatedAt: string;
}

export interface PriceEntry {
  id?: number;
  productId: string;
  formatId: string;
  store: Store;
  date: string;
  /** Prezzo pagato per una confezione. */
  price: number;
  /** Confezioni comprate (per la spesa totale); assente = 1. */
  packs?: number;
  offer?: boolean;
  source: 'manuale' | 'spesa' | 'scontrino';
}

export interface ShoppingItem {
  productId: string;
  formatId: string;
  owner: Owner;
  packs: number;
  /** Quantità che manca (nell'unità del prodotto). */
  missing: number;
  checked: boolean;
  /** Prezzo pagato per confezione, se inserito durante la spesa. */
  price?: number;
}

export interface ShoppingList {
  id?: number;
  createdAt: string;
  from: string;
  days: number;
  items: ShoppingItem[];
  /** Spesa chiusa: articoli spuntati caricati in dispensa. */
  closedAt?: string;
}
