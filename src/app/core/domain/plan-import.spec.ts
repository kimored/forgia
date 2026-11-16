import { describe, expect, it } from 'vitest';
import { validatePlan } from './catalog';
import { buildPlan, cleanName, parsePlanText, parseQuantity, slotHeader, type SourcePage } from './plan-import';

/** Documenti INVENTATI nel formato tipico dei software per nutrizionisti (nessun dato reale). */
const text = (s: string): SourcePage => ({ lines: s.trim().split('\n').map((t) => ({ text: t })) });

const SPESA = text(`
Mario Rossi
Alimenti assegnati nella settimana n. 1 (lista della spesa)
Primi
Ceci secchi 2 cucchiai (g 40)
Riso integrale 4 cucchiai (g 80)
Contorni
Zucchine 1 porzione (g 200)
Altri alimenti
Latte di soia 7 bicchieri (g 1.400)
Olio extra vergine di oliva 14 cucchiaini (g 56)
Biscotti integrali n° 21 (g 168)
Marmellata 7 cucchiaini (g 70)
`);

const MERCOLEDI = text(`
Mario Rossi
Piano alimentare – Mercoledì – settimana n. 2
Alimento                     Quantità
Colazione
Latte di soia ............ 1 bicchiere
Biscotti integrali ....... n° 3
Marmellata ............... 1 cucchiaino
Spuntino di metà mattina
Mela ..................... 1 porzione
Pranzo
Riso, ceci e zucchine
- Riso integrale ......... 4 cucchiai
- Ceci secchi ............ 2 cucchiai
- Zucchine ............... quantità bastante
Merenda
Yogurt bianco ............ 1 vasetto
Cena
Merluzzo ................. g 150
Insalata mista ........... 1 porzione
Arco della giornata
Pane integrale ........... g 50
Olio extra vergine di oliva 2 cucchiaini
`);

const DOMENICA = text(`
Piano alimentare - Domenica - settimana n. 2
Colazione
Latte di soia 1 bicchiere
Pranzo
Pasto libero
Cena
Uova di gallina n° 2
`);

describe('riconoscimento delle righe', () => {
  it('quantità nei formati più comuni', () => {
    expect(parseQuantity('Pasta di semola g 40')?.qty).toMatchObject({ amount: 40, unit: 'g' });
    expect(parseQuantity('Pasta 80 g')?.qty).toMatchObject({ amount: 80, unit: 'g' });
    expect(parseQuantity('Latte 1 bicchiere')?.qty).toMatchObject({ amount: 1, unit: 'bicchiere' });
    expect(parseQuantity('Riso 2 cucchiai e ½')?.qty).toMatchObject({ amount: 2.5, unit: 'cucchiaio' });
    expect(parseQuantity('Fette biscottate n° 4')?.qty).toMatchObject({ amount: 4, unit: 'pz' });
    expect(parseQuantity('Salsa di pomodoro quantità bastante')?.qty).toMatchObject({ amount: 0, unit: 'qb' });
    expect(parseQuantity('Olio 3 cucchiaini')?.qty).toMatchObject({ amount: 3, unit: 'cucchiaino' });
  });

  it('errori tipici dell’OCR', () => {
    expect(parseQuantity('Pane bianco 8g 40')?.qty).toMatchObject({ amount: 40, unit: 'g', uncertain: true });
    expect(parseQuantity('Riso 2 cucchiai e 4')?.qty).toMatchObject({ amount: 2.5, uncertain: true });
    expect(parseQuantity('Latte 7 bicchieri (g 1.400)')).toBeNull(); // le parentesi le toglie il chiamante
  });

  it('pulisce i nomi e riconosce gli ingredienti', () => {
    expect(cleanName('- Pasta di semola')).toEqual({ name: 'Pasta di semola', sub: true });
    expect(cleanName('Caffè quesetisoosibiontaneronesi AAA')).toMatchObject({ name: 'Caffè' });
    expect(cleanName('i È Macedonia')).toMatchObject({ name: 'Macedonia' });
  });

  it('sezioni di pasto, anche con rumore', () => {
    expect(slotHeader('Colazione')?.id).toBe('colazione');
    expect(slotHeader('Alim Colazione')?.id).toBe('colazione');
    expect(slotHeader('Spuntino di metà mattina')?.id).toBe('meta-mattina');
    expect(slotHeader('Arco della giornata')?.id).toBe('arco');
    expect(slotHeader('Latte parzialmente scremato')).toBeNull();
  });
});

describe('parsePlanText', () => {
  const draft = parsePlanText([SPESA, MERCOLEDI, DOMENICA]);
  const mer = draft.days.find((d) => d.weekday === 2)!;
  const slot = (id: string) => mer.slots.find((s) => s.slot === id)!;

  it('legge giorno, settimana e pasti', () => {
    expect(mer.week).toBe(2);
    expect(mer.slots.map((s) => s.slot)).toEqual(['colazione', 'meta-mattina', 'pranzo', 'merenda', 'cena', 'arco']);
    expect(slot('colazione').items.map((i) => i.name)).toEqual(['Latte di soia', 'Biscotti integrali', 'Marmellata']);
  });

  it('piatto composto con ingredienti', () => {
    const items = slot('pranzo').items;
    expect(items[0]).toMatchObject({ name: 'Riso, ceci e zucchine', sub: false });
    expect(items.slice(1).every((i) => i.sub)).toBe(true);
    expect(items[1].qty).toMatchObject({ amount: 4, unit: 'cucchiaio' });
  });

  it('pasto libero', () => {
    const dom = draft.days.find((d) => d.weekday === 6)!;
    expect(dom.slots.find((s) => s.slot === 'pranzo')!.free).toBe(true);
  });

  it('conversioni dalla lista spesa', () => {
    expect(draft.conversions.get('latte di soia')?.get('bicchiere')).toBe(200);
    expect(draft.conversions.get('olio extra vergine di oliva')?.get('cucchiaino')).toBe(4);
    expect(draft.conversions.get('biscotti integrali')?.get('pz')).toBe(8);
    // il nome della persona in testa alla pagina non entra nel dizionario
    expect(draft.lexicon.some((l) => /rossi/i.test(l))).toBe(false);
  });

  it('abbina nomi e quantità letti su colonne separate (con le posizioni)', () => {
    const page: SourcePage = {
      lines: [
        { text: 'Piano alimentare - Lunedì - settimana n. 1', x0: 100, y0: 0, x1: 900, y1: 30 },
        { text: 'Colazione', x0: 400, y0: 100, x1: 600, y1: 130 },
        { text: 'Latte di soia', x0: 50, y0: 160, x1: 300, y1: 190 },
        { text: 'Biscotti integrali', x0: 50, y0: 210, x1: 350, y1: 240 },
        // colonna delle quantità letta dopo, un po' più in alto (foto inclinata)
        { text: '1 bicchiere', x0: 800, y0: 150, x1: 950, y1: 180 },
        { text: 'n° 3', x0: 880, y0: 200, x1: 950, y1: 230 },
      ],
    };
    const d = parsePlanText([page]).days[0];
    expect(d.slots[0].items.map((i) => i.qty?.raw)).toEqual(['1 bicchiere', 'n° 3']);
  });
});

describe('buildPlan', () => {
  const draft = parsePlanText([SPESA, MERCOLEDI, DOMENICA]);
  const { doc, estimated } = buildPlan(draft, { title: 'Piano di prova' });
  const food = (name: string) => doc.foods.find((f) => f.name === name)!;
  const meal = (slot: string) => doc.meals.find((m) => m.id === `s2-mer-${slot}`)!;

  it('produce un documento di piano valido', () => {
    expect(validatePlan(doc)).toEqual([]);
    expect(doc.schedule.type === 'cycle' && doc.schedule.weeks.length).toBe(2);
  });

  it('converte le misure in grammi con la lista spesa', () => {
    const latte = meal('colazione').portions.find((p) => p.food === food('Latte di soia').id)!;
    expect(latte).toMatchObject({ qty: 200, measure: '1 bicchiere' });
    expect(meal('arco').portions.find((p) => p.food === food('Olio extra vergine di oliva').id)!.qty).toBe(8);
  });

  it('segnala le stime da tabella', () => {
    expect(estimated.some((e) => e.food === 'Yogurt bianco' && e.measure === 'vasetto')).toBe(true);
  });

  it('indovina i tag per le regole', () => {
    expect(food('Ceci secchi').tags).toContain('legume');
    expect(food('Merluzzo').tags).toContain('pesce');
    expect(food('Zucchine').tags).toContain('verdura');
  });

  it('pasto libero e giorni non presenti nel documento', () => {
    const weeks = doc.schedule.type === 'cycle' ? doc.schedule.weeks : [];
    expect(weeks[1][6].meals['pranzo']).toBe('libero');
    expect(weeks[0][0].meals).toEqual({});
    expect(doc.rules).toEqual([]);
  });
});
