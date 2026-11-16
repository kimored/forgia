import { describe, expect, it } from 'vitest';
import { FREE_MEAL, type PlanDocument } from '../models/plan';
import { Catalog, EXAMPLE_PLAN, exampleCatalog as catalog, validatePlan } from './catalog';

/** Controlli di integrità sul piano di esempio: falliscono se un dato è incoerente. */
describe('piano di esempio', () => {
  const weeks = EXAMPLE_PLAN.schedule.type === 'cycle' ? EXAMPLE_PLAN.schedule.weeks : [];
  const main = (d: (typeof weeks)[number][number]) =>
    ['pranzo', 'cena'].map((s) => d.meals[s]).filter((id) => id && id !== FREE_MEAL).map((id) => catalog.meal(id));

  it('è un documento valido', () => {
    expect(validatePlan(EXAMPLE_PLAN)).toEqual([]);
    expect(catalog.cycleLength).toBe(4);
  });

  it('weekend: sabato cena libera, domenica pranzo e cena liberi', () => {
    for (const w of weeks) {
      expect(w[5].meals['cena']).toBe(FREE_MEAL);
      expect(w[6].meals['pranzo']).toBe(FREE_MEAL);
      expect(w[6].meals['cena']).toBe(FREE_MEAL);
    }
  });

  it('nessun cibo vietato nel catalogo', () => {
    const banned = /pisell|zucchin|zucca|melanzan|gallett|arachid/i;
    for (const f of catalog.foods.values()) expect(f.name).not.toMatch(banned);
  });

  it('i lupini contano come pesce; cotoletta e tortellini non come uova', () => {
    expect(catalog.hasTag(catalog.meal('pr-spaghetti-lupini'), 'pesce')).toBe(true);
    expect(catalog.hasTag(catalog.meal('pr-spaghetti-lupini'), 'legume')).toBe(false);
    expect(catalog.hasTag(catalog.meal('ce-cotoletta-insalata-carote'), 'uova')).toBe(false);
    expect(catalog.hasTag(catalog.meal('pr-brodo-tortellini'), 'uova')).toBe(false);
  });

  it.each([0, 1, 2, 3])('settimana %i rispetta le regole del piano', (w) => {
    const all = weeks[w].flatMap(main);
    expect(all.filter((m) => catalog.hasTag(m, 'carne-rossa')).length).toBeLessThanOrEqual(2);
    expect(all.filter((m) => catalog.hasTag(m, 'pesce')).length).toBeGreaterThanOrEqual(2);
    expect(all.filter((m) => catalog.hasTag(m, 'cavolo')).length).toBeLessThanOrEqual(1);
  });

  it('legumi mai due giorni di fila (anche a cavallo delle settimane)', () => {
    const days = weeks.flat().map((d) => main(d).some((m) => catalog.hasTag(m, 'legume')));
    for (let i = 0; i < days.length; i++) expect(days[i] && days[(i + 1) % days.length], `giorno ${i}`).toBe(false);
  });
});

describe('validatePlan', () => {
  it('rifiuta file che non sono piani', () => {
    expect(validatePlan({ foo: 1 })).toEqual(['Il file non è un piano di Forgia.']);
  });

  it('segnala riferimenti mancanti', () => {
    const broken: PlanDocument = structuredClone(EXAMPLE_PLAN);
    broken.meals[0].portions.push({ food: 'unicorno', qty: 10 });
    expect(validatePlan(broken).join()).toMatch(/unicorno/);
  });

  it('accetta un giorno tipo (template)', () => {
    const doc: PlanDocument = {
      format: 'forgia-plan',
      version: 1,
      meta: { title: 'Giorno tipo' },
      slots: [{ id: 'colazione', label: 'Colazione' }],
      foods: [{ id: 'latte', name: 'Latte', unit: 'ml' }],
      meals: [{ id: 'c1', slots: ['colazione'], title: 'Latte', portions: [{ food: 'latte', qty: 200 }] }],
      schedule: { type: 'template', day: { meals: { colazione: 'c1' } } },
    };
    expect(validatePlan(doc)).toEqual([]);
    expect(new Catalog(doc).cycleLength).toBe(1);
  });
});
