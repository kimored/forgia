import { describe, expect, it } from 'vitest';
import { exampleCatalog } from './catalog';
import { productsFor } from './pantry';
import { matchProduct, normalize, parseReceipt } from './receipt';

// Scontrino inventato, nel formato tipico (con il rumore dell'OCR).
const OCR = [
  'CONAD CITY',
  'NEGOZIO DI PROVA SRL',
  'Via Inventata 1',
  'DOCUMENTO COMMERCIALE',
  'DESCRIZIONE IVA prezzo( €)',
  '- CARTA FEDELTA 0000000000000',
  '2 x 0,10',
  'è SHOPPER BIO GRA VIA 0,20 E',
  'FROLLINI CONAD VI* 1,49 ER &',
  'SPINACI CONAD CUBETT VI* 2,49 8',
  'BANANE DOLE I CAT VI* 1,39',
  'PETTO POLLO FET. C/R VI* ADI',
  'CLEMENTINE FOGLIA 2/ VI* 3,06',
  'LATTUGHINO 90G CONAD VI* 0,99',
  '3 x 0,89',
  'YOGURT GRECO 0% VI* 2,67',
  'SCONTO -0,50',
  'SUBTOTALE 12,29',
  'TOTALE COMPLESSIVO 12,29',
  'Pagamento elettronico 12,29',
  '01-02-2026 10:15',
];

const products = productsFor(exampleCatalog);

describe('scontrino', () => {
  const r = parseReceipt(OCR);

  it('riconosce negozio, data e totale', () => {
    expect(r.store).toBe('conad');
    expect(r.date).toBe('2026-02-01');
    expect(r.total).toBe(12.29);
  });

  it('estrae gli articoli, salta shopper e carta, applica sconti e quantità', () => {
    const t = r.lines.map((l) => l.text);
    expect(t).not.toContain(expect.stringMatching(/shopper|carta/i));
    expect(r.lines.find((l) => /frollini/i.test(l.text))?.total).toBe(1.49);
    expect(r.lines.find((l) => /petto pollo/i.test(l.text))?.total).toBeNull();
    const yog = r.lines.find((l) => /yogurt/i.test(l.text))!;
    expect(yog.packs).toBe(3);
    expect(yog.total).toBe(2.17);
    expect(r.lines.length).toBe(7);
  });

  it('abbina le righe ai prodotti del piano', () => {
    const m = (t: string) => matchProduct(t, products)?.id;
    expect(m('FROLLINI CONAD')).toBe('biscotti');
    expect(m('SPINACI CONAD CUBETT')).toBe('spinaci');
    expect(m('BANANE DOLE I CAT')).toBe('banana');
    expect(m('PETTO POLLO FET. C/R')).toBe('petto-pollo');
    expect(m('CLEMENTINE FOGLIA')).toBe('frutta');
    expect(m('LATTUGHINO 90G CONAD')).toBe('insalata');
    expect(m('PANINI FRESCHI PRECO')).toBe('pane');
    expect(m('CAROTE VASS.750G CON')).toBe('carote');
    expect(m('YOGURT GRECO 0%')).toBe('yogurt-greco');
    expect(m('DETERSIVO PIATTI')).toBeUndefined();
  });

  it('usa gli abbinamenti già confermati', () => {
    expect(matchProduct('FROLLINI CONAD', products, { [normalize('FROLLINI CONAD')]: 'fette-biscottate' })?.id).toBe('fette-biscottate');
  });
});
