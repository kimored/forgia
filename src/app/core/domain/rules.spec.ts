import { describe, expect, it } from 'vitest';
import type { MealLog } from '../models/logs';
import type { MealSlot } from '../models/plan';
import { DEFAULT_TIMES } from '../models/profile';
import { exampleCatalog as catalog } from './catalog';
import { addDays, type IsoDate } from './dates';
import { resolveDay } from './day-plan';
import { variantsFor, warningsFor, weekSummary, weekWarnings, type DayResolver } from './rules';

const START = '2026-11-16'; // lun settimana 1
const profile = { startDate: START, gymDays: [0, 2, 4] as const, times: DEFAULT_TIMES };

function resolver(logs: MealLog[] = []): DayResolver {
  return (date: IsoDate) =>
    resolveDay(catalog, { date, profile: { ...profile, gymDays: [...profile.gymDays] }, logs: logs.filter((l) => l.date === date) });
}
const d = (offset: number) => addDays(START, offset);
const sub = (offset: number, slot: MealSlot, optionId: string, status: MealLog['status'] = 'todo'): MealLog => ({
  date: d(offset), slot, status, optionId, at: '',
});
const texts = (r: DayResolver, offset: number, slot: MealSlot, id: string) =>
  warningsFor(catalog, r, d(offset), slot, catalog.meal(id)).map((w) => w.text);

describe('regole', () => {
  it('1 · legumi anche ieri (mercoledì dopo le lenticchie di martedì)', () => {
    expect(texts(resolver(), 2, 'pranzo', 'pr-pasta-ceci')).toContain('Legumi anche ieri');
  });

  it('1 · legumi anche domani', () => {
    expect(texts(resolver(), 0, 'pranzo', 'pr-pasta-fagioli')).toContain('Legumi anche domani');
  });

  it('1 · il minestrone con legumi conta, quello di verdure no', () => {
    expect(texts(resolver(), 2, 'pranzo', 'pr-minestrone-legumi')).toContain('Legumi anche ieri');
    expect(texts(resolver(), 2, 'pranzo', 'pr-minestrone')).not.toContain('Legumi anche ieri');
  });

  it('1 · i lupini non sono legumi', () => {
    expect(texts(resolver(), 2, 'pranzo', 'pr-spaghetti-lupini').join()).not.toMatch(/Legumi/);
  });

  it('2 · verza una sola volta a settimana', () => {
    const r = resolver([sub(1, 'pranzo', 'pr-riso-verza')]);
    expect(texts(r, 3, 'pranzo', 'pr-riso-verza')).toContain('Cavoli / verza: 2ª volta questa settimana (max 1)');
    expect(texts(resolver(), 3, 'pranzo', 'pr-riso-verza')).not.toContain('Cavoli / verza: 2ª volta questa settimana (max 1)');
  });

  it('3 · 3ª carne rossa della settimana', () => {
    // sett. 1 ha già l'hamburger di mercoledì; aggiungo il vitello giovedì → il terzo avvisa
    const r = resolver([sub(3, 'cena', 'ce-vitello-spinaci-carote')]);
    expect(texts(r, 4, 'cena', 'ce-hamburger-insalata-carote')).toContain('Carne rossa: 3ª volta questa settimana (max 2)');
    expect(texts(resolver(), 4, 'cena', 'ce-hamburger-insalata-carote')).not.toContain('Carne rossa: 3ª volta questa settimana (max 2)');
  });

  it('4 · togliere il pesce lo porta sotto le 2 volte', () => {
    expect(texts(resolver(), 1, 'cena', 'ce-pollo-insalata-carote')).toContain('Pesce sotto le 2 volte questa settimana');
  });

  it('5 · con uova a pranzo il panino alle uova avvisa', () => {
    // venerdì sett. 1: pasta con uova e pancetta
    expect(texts(resolver(), 4, 'spuntino1', 'sp1-uova')).toContain("Uova già a pranzo: nel panino va l'affettato");
    expect(texts(resolver(), 3, 'spuntino1', 'sp1-uova')).toEqual([]);
  });

  it('5 · frittata a cena dopo il panino alle uova già mangiato', () => {
    const r = resolver([sub(1, 'spuntino1', 'sp1-uova', 'done')]);
    expect(texts(r, 1, 'cena', 'ce-frittata-insalata-carote')).toContain('Uova già a spuntino');
  });

  it('6 · patate a cena in un giorno di palestra', () => {
    expect(texts(resolver(), 0, 'cena', 'ce-orata-patate-insalata')).toContain('Giorno palestra: niente patate, 40 g di pane');
  });

  it('7 · salsicce entro 14 giorni, solo sulle sostituzioni', () => {
    // sett. 2 venerdì (giorno 11) ha le salsicce nel piano
    expect(texts(resolver(), 16, 'cena', 'ce-salsicce-friarielli')).toContain('Salsiccia già negli ultimi 14 giorni');
    expect(texts(resolver(), 38, 'cena', 'ce-salsicce-friarielli')).not.toContain('Salsiccia già negli ultimi 14 giorni');
    // nel piano fisso (sett. 4 giovedì, giorno 24) non avvisa
    expect(texts(resolver(), 24, 'cena', 'ce-salsicce-friarielli')).not.toContain('Salsiccia già negli ultimi 14 giorni');
  });

});

describe('variantsFor', () => {
  it('mette prima il previsto, poi le alternative del piano', () => {
    const v = variantsFor(catalog, resolver(), d(4), 'pranzo');
    expect(v[0]).toMatchObject({ group: 'previsto' });
    expect(v[0].option.id).toBe('pr-pasta-uova-pancetta');
    expect(v[1].option.id).toBe('pr-spaghetti-lupini');
    expect(v[1].group).toBe('piano');
  });

  it('include tutti i pranzi del ciclo (deduplicati) e le sostituzioni extra', () => {
    const ids = variantsFor(catalog, resolver(), d(0), 'pranzo').map((v) => v.option.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('pr-brodo-tortellini');
    expect(ids).toContain('pr-riso-verza');
  });

  it('raggruppa i pasti della stessa settimana del ciclo (regola 11)', () => {
    const v = variantsFor(catalog, resolver(), d(1), 'cena');
    expect(v.find((x) => x.option.id === 'ce-salmone-spinaci')?.group).toBe('settimana');
    expect(v.find((x) => x.option.id === 'ce-cotoletta-insalata-carote')?.group).toBe('altre');
  });
});

describe('weekSummary', () => {
  it('conta pesce e carne rossa della settimana', () => {
    const s = weekSummary(catalog, resolver(), d(0));
    expect(s.find((c) => c.tag === 'pesce')).toMatchObject({ count: 2, min: 2, ok: true });
    expect(s.find((c) => c.tag === 'carne-rossa')).toMatchObject({ count: 1, max: 2, ok: true });
    expect(s.find((c) => c.tag === 'cavolo')).toMatchObject({ count: 0, max: 1, ok: true });
  });
});

describe('weekWarnings', () => {
  it('il piano fisso non ha avvisi', () => {
    for (const w of [0, 7, 14, 21]) expect(weekWarnings(catalog, resolver(), d(w))).toEqual([]);
  });

  it('segnala legumi di fila, pesce mancante e carne rossa in eccesso', () => {
    const r = resolver([
      sub(2, 'pranzo', 'pr-pasta-ceci'), // mer dopo le lenticchie di mar
      sub(1, 'cena', 'ce-vitello-spinaci-carote'), // toglie un pesce, +1 rossa
      sub(3, 'cena', 'ce-hamburger-insalata-carote'), // toglie l'altro pesce, +1 rossa
    ]);
    const texts = weekWarnings(catalog, r, d(0)).map((w) => w.text);
    expect(texts).toContain('Legumi due giorni di fila (mar e mer)');
    expect(texts).toContain('Pesce 0 volte su almeno 2');
    expect(texts).toContain('Carne rossa 3 volte su massimo 2');
  });
});
