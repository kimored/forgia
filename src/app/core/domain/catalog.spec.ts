import { describe, expect, it } from 'vitest';
import { FREE_MEAL, type MealSlot } from '../models/plan';
import { catalog } from './catalog';

/** Controlli di integrità sui JSON del piano: falliscono se un dato è incoerente. */
describe('dati del piano', () => {
  const weeks = catalog.plan.weeks;
  const idOf = (v: string) => (v === FREE_MEAL ? null : v);

  it('4 settimane da 7 giorni', () => {
    expect(weeks).toHaveLength(4);
    for (const w of weeks) expect(w).toHaveLength(7);
  });

  it('ogni pasto referenziato esiste, è nello slot giusto e usa cibi noti', () => {
    const check = (id: string | null, slot: MealSlot) => {
      if (!id) return;
      expect(catalog.meal(id).slots, id).toContain(slot);
    };
    for (const w of weeks)
      for (const d of w) {
        check(d.colazione, 'colazione');
        check(idOf(d.pranzo), 'pranzo');
        check(idOf(d.cena), 'cena');
        check(d.spuntino2, 'spuntino2');
        d.pranzoAlt?.forEach((a) => check(a, 'pranzo'));
      }
    check(catalog.plan.sushiSwapDinner, 'cena');
    for (const m of catalog.meals.values()) for (const p of m.portions) expect(() => catalog.food(p.food)).not.toThrow();
  });

  it('weekend: sabato cena libera, domenica pranzo e cena liberi', () => {
    for (const w of weeks) {
      expect(w[5].cena).toBe(FREE_MEAL);
      expect(w[6].pranzo).toBe(FREE_MEAL);
      expect(w[6].cena).toBe(FREE_MEAL);
    }
  });

  it('regola 10: nessun cibo vietato nel catalogo', () => {
    const banned = /pisell|zucchin|zucca|melanzan|gallett|arachid/i;
    for (const f of catalog.foods.values()) expect(f.name).not.toMatch(banned);
  });

  it('i lupini contano come pesce e non come legume', () => {
    const lupini = catalog.meal('pr-spaghetti-lupini');
    expect(catalog.hasTag(lupini, 'pesce')).toBe(true);
    expect(catalog.hasTag(lupini, 'legume')).toBe(false);
  });

  it('cotoletta e tortellini non contano come giorno con uova', () => {
    expect(catalog.hasTag(catalog.meal('ce-cotoletta-insalata-carote'), 'uova')).toBe(false);
    expect(catalog.hasTag(catalog.meal('pr-brodo-tortellini'), 'uova')).toBe(false);
  });

  describe('il piano fisso rispetta le regole', () => {
    const mainMeals = (w: number) =>
      weeks[w].map((d) => [idOf(d.pranzo), idOf(d.cena)].filter(Boolean).map((id) => catalog.meal(id!)));

    it.each([0, 1, 2, 3])('settimana %i: max 2 carni rosse, almeno 2 pesce, max 1 cavolo', (w) => {
      const all = mainMeals(w).flat();
      expect(all.filter((m) => catalog.hasTag(m, 'carne-rossa')).length).toBeLessThanOrEqual(2);
      expect(all.filter((m) => catalog.hasTag(m, 'pesce')).length).toBeGreaterThanOrEqual(2);
      expect(all.filter((m) => catalog.hasTag(m, 'cavolo')).length).toBeLessThanOrEqual(1);
    });

    it('legumi mai due giorni di fila (anche a cavallo delle settimane)', () => {
      const days = weeks.flat().map((d) => [idOf(d.pranzo), idOf(d.cena)].some((id) => id && catalog.hasTag(catalog.meal(id), 'legume')));
      for (let i = 0; i < days.length; i++) {
        expect(days[i] && days[(i + 1) % days.length], `giorno ${i}`).toBe(false);
      }
    });

    it('nei giorni palestra (lun/mer/ven) la cena non ha patate', () => {
      for (const w of weeks)
        for (const d of [0, 2, 4]) {
          const cena = idOf(w[d].cena);
          if (cena) expect(catalog.meal(cena).portions.some((p) => p.food === 'patate'), cena).toBe(false);
        }
    });
  });
});
