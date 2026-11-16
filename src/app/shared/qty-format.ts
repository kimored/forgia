import type { Unit } from '../core/models/plan';

const nf = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });
const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

/** 1250 g → "1,3 kg", 750 ml → "750 ml", 3 pz → "3". */
export function formatQty(qty: number, unit: Unit): string {
  if (unit === 'pz') return nf.format(qty);
  if (qty >= 1000) return `${nf.format(qty / 1000)} ${unit === 'g' ? 'kg' : 'L'}`;
  return `${nf.format(Math.round(qty))} ${unit}`;
}

export function formatEur(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : eur.format(n);
}

/** Passo dei bottoni +/− in base al prodotto. */
export function stepFor(unit: Unit, packQty: number): number {
  if (unit === 'pz') return 1;
  return Math.max(10, Math.round(packQty / 10 / 10) * 10);
}

/** 2 → "2 conf.", 1.5 → "1½ conf.", 0 → "0". Per i pezzi singoli "3 pz". */
export function formatPacks(packs: number, unitIsPiece = false): string {
  const whole = Math.floor(packs);
  const half = packs - whole >= 0.5 ? '½' : '';
  const n = whole || !half ? `${whole}${half}` : '½';
  return packs === 0 ? '0' : `${n} ${unitIsPiece ? 'pz' : 'conf.'}`;
}
