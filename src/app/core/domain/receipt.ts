import type { Product, Store } from '../models/pantry';
import type { IsoDate } from './dates';

/**
 * Lettura di uno scontrino da testo OCR: negozio, data e righe articolo con prezzo.
 * L'OCR degli scontrini è rumoroso: si estrae quel che si può e l'utente corregge.
 */

export interface ReceiptLine {
  /** Descrizione come stampata (ripulita). */
  text: string;
  /** Prezzo totale della riga; null se l'OCR non l'ha letto. */
  total: number | null;
  /** Pezzi, se lo scontrino ha la riga "2 x 0,10". */
  packs: number;
}

export interface Receipt {
  store: Store | null;
  date: IsoDate | null;
  lines: ReceiptLine[];
  total: number | null;
}

const STORE_NAMES: [RegExp, Store][] = [
  [/conad/i, 'conad'],
  [/dec[oò]\b|decò/i, 'deco'],
  [/sole\s*365/i, 'sole365'],
];

/** Righe che non sono articoli. */
const SKIP = /^(shopper|busta|sacchett|carta\b|carta insieme|resto|contanti|bancomat|pagamento|importo|di cui|iva\b|documento|descrizione|totale|subtotale|arrotond|punti|saldo)/i;
const END = /^(sub\s*totale|totale|total\b|importo pagato|pagamento)/i;
const DISCOUNT = /(sconto|promo|offerta|risparmio|buono)/i;
const PRICE_END = /(-?\d{1,4})\s?[,.]\s?(\d{2})\s*[-]?\s*[^\d]{0,4}$/;
const QTY_LINE = /^[^a-z]*?(\d{1,2})\s*[xX×*]\s*(\d{1,4})[,.](\d{2})\s*$/;

const toNum = (int: string, dec: string) => parseFloat(`${int}.${dec}`);

export function parseReceipt(raw: string[]): Receipt {
  const lines = raw.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const head = lines.slice(0, 8).join(' ');
  const store = STORE_NAMES.find(([re]) => re.test(head))?.[1] ?? (lines.some((l) => /conad/i.test(l)) ? 'conad' : null);

  let date: IsoDate | null = null;
  for (const l of lines) {
    const m = l.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
    if (m) {
      const y = m[3].length === 2 ? `20${m[3]}` : m[3];
      const mo = +m[2];
      const d = +m[1];
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) date = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // Gli articoli partono dopo l'intestazione "DESCRIZIONE … PREZZO" (se c'è) e finiscono al totale.
  let start = lines.findIndex((l) => /descrizione|prezzo/i.test(l));
  start = start < 0 ? 0 : start + 1;
  const out: ReceiptLine[] = [];
  let pendingPacks = 1;
  let total: number | null = null;
  for (let i = start; i < lines.length; i++) {
    const l = lines[i];
    if (END.test(l.replace(/^[^a-z]+/i, ''))) {
      const m = l.match(PRICE_END);
      if (/totale/i.test(l) && m) total = toNum(m[1], m[2]);
      if (!/sub/i.test(l)) break;
      continue;
    }
    const q = l.match(QTY_LINE);
    if (q) {
      pendingPacks = Math.max(1, +q[1]);
      continue;
    }
    const m = l.match(PRICE_END);
    let text = (m ? l.slice(0, m.index) : l)
      .replace(/\b(VI|V[I1l]\*?|[A-D]\*?|\d{1,2}%)\s*$/i, '')
      .replace(/^[^a-z0-9]+/i, '')
      .replace(/[^a-z0-9]+$/i, '')
      .trim();
    const letters = text.replace(/[^a-z]/gi, '').length;
    if (letters < 3) continue;
    const price = m ? toNum(m[1], m[2]) : null;
    if (DISCOUNT.test(text) && out.length) {
      const prev = out[out.length - 1];
      if (price !== null && prev.total !== null) prev.total = Math.max(0, Math.round((prev.total - Math.abs(price)) * 100) / 100);
      continue;
    }
    if (SKIP.test(text)) {
      pendingPacks = 1;
      continue;
    }
    text = text.replace(/\s+[A-Z]?\*$/, '');
    out.push({ text, total: price, packs: pendingPacks });
    pendingPacks = 1;
  }
  return { store, date, lines: out, total };
}

// ---------- Abbinamento ai prodotti del piano ----------

/** Valore di `learned` per le righe che l'utente ha scelto di ignorare (detersivi, ecc.). */
export const IGNORE = '-';

/** Parole da scontrino → parola che compare nel nome del prodotto. */
const SYNONYMS: Record<string, string[]> = {
  insalata: ['lattuga', 'lattughino', 'misticanza', 'rucola', 'valeriana', 'songino', 'iceberg', 'insalat'],
  biscotti: ['frollini', 'biscott', 'saiwa', 'oro'],
  frutta: ['clementine', 'mandarini', 'arance', 'mele', 'pere', 'kiwi', 'uva', 'pesche', 'fragole', 'mirtilli', 'ananas', 'cachi', 'loti'],
  pane: ['panini', 'pane', 'rosette', 'baguette', 'filone', 'piadina'],
  yogurt: ['yogurt', 'yog', 'greco', 'skyr'],
  affettato: ['prosciutto', 'bresaola', 'fesa', 'mortadella', 'salame', 'cotto', 'crudo'],
  latte: ['zymil', 'latte'],
  uova: ['uova', 'uovo'],
  pollo: ['pollo'],
  tacchino: ['tacchino'],
  macinata: ['macinato', 'macinata', 'trito'],
  hamburger: ['hamburger', 'burger'],
  patate: ['patate', 'patata'],
  spinaci: ['spinaci'],
  carote: ['carote', 'carota'],
  tonno: ['tonno'],
  muesli: ['muesli', 'piu pro', 'granola', 'cereali'],
  parmigiano: ['parmigiano', 'grana', 'reggiano'],
  marmellata: ['marmellata', 'confettura'],
  'fette biscottate': ['fette', 'biscottate'],
};

/** Prodotti esclusi da un sinonimo (le clementine non sono frutta secca). */
const NOT_IN: Record<string, RegExp> = { frutta: /secca/, pane: /grattugiato/ };

const STOP = new Set(['di', 'del', 'della', 'con', 'in', 'e', 'o', 'al', 'alla', 'senza', 'conad', 'deco', 'sole', 'gr', 'kg', 'g', 'ml', 'lt']);

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const words = (s: string) => normalize(s).split(' ').filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d/.test(w));
/** Stessa radice: le prime 4-5 lettere (banane/banana, carote/carota). */
const sameStem = (a: string, b: string) => {
  const n = Math.min(5, a.length, b.length);
  return n >= 4 && a.slice(0, n) === b.slice(0, n);
};

/**
 * Prodotto più probabile per una riga di scontrino.
 * `learned`: abbinamenti già confermati dall'utente (testo normalizzato → id prodotto).
 */
export function matchProduct(text: string, products: Product[], learned: Record<string, string> = {}): Product | null {
  const key = normalize(text);
  const known = learned[key];
  if (known === IGNORE) return null;
  if (known) return products.find((p) => p.id === known) ?? null;

  const rw = words(text);
  if (!rw.length) return null;
  let best: { p: Product; score: number } | null = null;
  for (const p of products) {
    const nameWords = words([p.name, ...(p.aliases ?? [])].join(' '));
    let score = 0;
    for (const w of rw) {
      if (nameWords.some((n) => sameStem(n, w))) score += 2;
      for (const [canon, syns] of Object.entries(SYNONYMS)) {
        const pn = normalize(p.name);
        if (!pn.includes(canon) || (NOT_IN[canon] && NOT_IN[canon].test(pn))) continue;
        if (syns.some((s) => (s.includes(' ') ? key.includes(s) : sameStem(s, w) || w.startsWith(s)))) score += 2;
      }
    }
    // A parità, vince il nome più corto (più specifico per la parola trovata).
    const adj = score - nameWords.length * 0.01;
    if (score > 0 && (!best || adj > best.score)) best = { p, score: adj };
  }
  return best?.p ?? null;
}
