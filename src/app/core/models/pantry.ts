import type { Unit } from './plan';

/** Prodotti acquistabili (catalogo statico in src/assets/data/products.json). */

export type Store = 'sole365' | 'deco' | 'conad' | 'altro';
export const STORES: { id: Store; name: string }[] = [
  { id: 'sole365', name: 'Sole365' },
  { id: 'deco', name: 'Decò' },
  { id: 'conad', name: 'Conad' },
  { id: 'altro', name: 'Altro' },
];

export type Owner = 'mine' | 'nonna';

export interface ProductFormat {
  id: string;
  label: string;
  /** Quantità della confezione, nell'unità del prodotto. */
  qty: number;
  /** Prezzo di riferimento in euro (null = da inserire). */
  price: number | null;
}

export interface Product {
  id: string;
  name: string;
  brand?: string;
  unit: Unit;
  /** Cibi del piano soddisfatti da questo prodotto (Food.id). */
  foods: string[];
  /** Il primo formato è quello di default per la lista spesa. */
  formats: ProductFormat[];
  /** Parole chiave per riconoscere il prodotto negli scontrini. */
  aliases?: string[];
  /** Prodotto "a scorta": non serve contarlo al grammo (olio, brodo…). */
  untracked?: boolean;
}

/** Dati utente (IndexedDB). */

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
