import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { validatePlan } from '../../core/domain/catalog';
import { WEEKDAY_SHORT } from '../../core/domain/dates';
import { guessTags, slug } from '../../core/domain/plan-import';
import {
  FOOD_TAG_LABELS,
  FREE_MEAL,
  type Food,
  type FoodTag,
  type MealOption,
  type PlanDocument,
  type PlanRule,
  type Portion,
  type Unit,
  type Weekday,
} from '../../core/models/plan';

type Tab = 'giorni' | 'alimenti' | 'regole' | 'dati';

/** Regole proponibili: le sceglie l'utente leggendo il piano del professionista. */
const RULE_TEMPLATES: { key: string; label: string; make: (n: number) => PlanRule; tag: FoodTag; kind: PlanRule['type']; def: number }[] = [
  { key: 'legumi', label: 'Legumi mai due giorni di fila', tag: 'legume', kind: 'no-consecutive', def: 0, make: () => ({ type: 'no-consecutive', tag: 'legume' }) },
  { key: 'rossa', label: 'Carne rossa al massimo … volte a settimana', tag: 'carne-rossa', kind: 'max-per-week', def: 2, make: (n) => ({ type: 'max-per-week', tag: 'carne-rossa', max: n }) },
  { key: 'pesce', label: 'Pesce almeno … volte a settimana', tag: 'pesce', kind: 'min-per-week', def: 2, make: (n) => ({ type: 'min-per-week', tag: 'pesce', min: n }) },
  { key: 'cavoli', label: 'Cavoli e verza al massimo … volte a settimana', tag: 'cavolo', kind: 'max-per-week', def: 1, make: (n) => ({ type: 'max-per-week', tag: 'cavolo', max: n }) },
  { key: 'uova', label: 'Uova al massimo … volte a settimana', tag: 'uova', kind: 'max-per-week', def: 3, make: (n) => ({ type: 'max-per-week', tag: 'uova', max: n }) },
];

/** Editor del documento di piano: revisione dopo l'import e modifica manuale. */
@Component({
  selector: 'app-plan-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './plan-editor.html',
  styleUrl: './plan-editor.scss',
})
export class PlanEditor {
  readonly initial = input.required<PlanDocument>();
  readonly saveLabel = input('Usa questo piano');
  readonly save = output<PlanDocument>();

  protected readonly doc = signal<PlanDocument>(null!);
  protected readonly tab = signal<Tab>('giorni');
  protected readonly week = signal(1);
  protected readonly weekday = signal<Weekday>(0);
  protected readonly errors = signal<string[]>([]);

  protected readonly weekdays = WEEKDAY_SHORT.map((label, i) => ({ label, value: i as Weekday }));
  protected readonly tagList = Object.entries(FOOD_TAG_LABELS) as [FoodTag, string][];
  protected readonly templates = RULE_TEMPLATES;

  constructor() {
    effect(() => {
      const d = this.initial();
      untracked(() => this.doc.set(structuredClone(d)));
    });
  }

  // ---------- Calendario ----------

  protected readonly weeks = computed(() => {
    const s = this.doc().schedule;
    return s.type === 'cycle' ? s.weeks.length : 1;
  });

  private dayRef(doc: PlanDocument, week: number, weekday: Weekday) {
    const s = doc.schedule;
    return s.type === 'template' ? s.day : s.weeks[week - 1][weekday];
  }

  protected readonly weekList = computed(() => Array.from({ length: this.weeks() }, (_, i) => i + 1));

  /** Giorni con almeno un pasto, per i pallini dei tab. */
  protected readonly filledDays = computed(() => {
    const doc = this.doc();
    const w = this.week();
    return this.weekdays.map((d) => Object.keys(this.dayRef(doc, w, d.value).meals).length > 0);
  });

  protected readonly day = computed(() => {
    const doc = this.doc();
    const ref = this.dayRef(doc, this.week(), this.weekday());
    const meals = new Map(doc.meals.map((m) => [m.id, m]));
    const foods = new Map(doc.foods.map((f) => [f.id, f]));
    return doc.slots.map((slot) => {
      const id = ref.meals[slot.id];
      const meal = id && id !== FREE_MEAL ? meals.get(id) : undefined;
      return {
        slot,
        free: id === FREE_MEAL,
        meal,
        shared: meal ? this.usage(doc, meal.id) > 1 : false,
        portions: (meal?.portions ?? []).map((p, i) => ({ ...p, i, food: foods.get(p.food) })),
      };
    });
  });

  protected readonly dayEmpty = computed(() => this.day().every((s) => !s.meal && !s.free));

  /** In quanti giorni compare un pasto (modificarlo cambia tutti quei giorni). */
  private usage(doc: PlanDocument, mealId: string): number {
    const s = doc.schedule;
    const days = s.type === 'template' ? [s.day] : s.weeks.flat();
    return days.filter((d) => Object.values(d.meals).includes(mealId)).length;
  }

  protected readonly otherDays = computed(() => {
    const out: { week: number; weekday: Weekday; label: string }[] = [];
    const doc = this.doc();
    for (let w = 1; w <= this.weeks(); w++) {
      for (const d of this.weekdays) {
        if (w === this.week() && d.value === this.weekday()) continue;
        if (Object.keys(this.dayRef(doc, w, d.value).meals).length) out.push({ week: w, weekday: d.value, label: `${d.label} sett. ${w}` });
      }
    }
    return out;
  });

  private mutate(fn: (doc: PlanDocument) => void): void {
    const next = structuredClone(this.doc());
    fn(next);
    this.doc.set(next);
    this.errors.set([]);
  }

  /** Il pasto dello slot nel giorno selezionato, separato dagli altri giorni se condiviso. */
  private ownMeal(doc: PlanDocument, slotId: string): MealOption {
    const ref = this.dayRef(doc, this.week(), this.weekday());
    let id = ref.meals[slotId];
    let meal = id && id !== FREE_MEAL ? doc.meals.find((m) => m.id === id) : undefined;
    if (!meal || this.usage(doc, meal.id) > 1) {
      const newId = `${slotId}-${this.week()}-${this.weekday()}-${Date.now().toString(36)}`;
      meal = meal
        ? { ...structuredClone(meal), id: newId, extra: false }
        : { id: newId, slots: [slotId], title: doc.slots.find((s) => s.id === slotId)?.label ?? 'Pasto', portions: [] };
      doc.meals.push(meal);
      ref.meals[slotId] = newId;
      id = newId;
    }
    return meal;
  }

  protected setFree(slotId: string, free: boolean): void {
    this.mutate((doc) => {
      const ref = this.dayRef(doc, this.week(), this.weekday());
      if (free) ref.meals[slotId] = FREE_MEAL;
      else delete ref.meals[slotId];
    });
  }

  protected setTitle(slotId: string, title: string): void {
    this.mutate((doc) => (this.ownMeal(doc, slotId).title = title.trim() || 'Pasto'));
  }

  protected addPortion(slotId: string): void {
    this.mutate((doc) => this.ownMeal(doc, slotId).portions.push({ food: '', qty: 0 }));
  }

  protected removePortion(slotId: string, i: number): void {
    this.mutate((doc) => this.ownMeal(doc, slotId).portions.splice(i, 1));
  }

  protected patchPortion(slotId: string, i: number, patch: Partial<Portion>): void {
    this.mutate((doc) => Object.assign(this.ownMeal(doc, slotId).portions[i], patch));
  }

  protected setQty(slotId: string, i: number, value: string): void {
    const n = parseFloat(value.replace(',', '.'));
    this.patchPortion(slotId, i, { qty: Number.isFinite(n) && n >= 0 ? n : 0 });
  }

  /** Alimento scritto a mano: si riusa quello esistente o se ne crea uno nuovo. */
  protected setFood(slotId: string, i: number, name: string): void {
    const clean = name.trim();
    if (!clean) return;
    this.mutate((doc) => {
      let food = doc.foods.find((f) => f.name.toLowerCase() === clean.toLowerCase());
      if (!food) {
        let id = slug(clean);
        while (doc.foods.some((f) => f.id === id)) id += '-2';
        food = { id, name: clean, unit: 'g', tags: guessTags(clean) };
        doc.foods.push(food);
      }
      this.ownMeal(doc, slotId).portions[i].food = food.id;
    });
  }

  protected copyFrom(value: string): void {
    if (!value) return;
    const [w, d] = value.split('-').map(Number);
    this.mutate((doc) => {
      const src = this.dayRef(doc, w, d as Weekday);
      const dst = this.dayRef(doc, this.week(), this.weekday());
      dst.meals = { ...src.meals };
      if (src.alternatives) dst.alternatives = structuredClone(src.alternatives);
    });
  }

  // ---------- Alimenti ----------

  protected readonly foods = computed(() => {
    const doc = this.doc();
    const used = new Set(doc.meals.flatMap((m) => m.portions.map((p) => p.food)));
    return [...doc.foods].filter((f) => used.has(f.id)).sort((a, b) => a.name.localeCompare(b.name, 'it'));
  });

  protected patchFood(id: string, patch: Partial<Food>): void {
    this.mutate((doc) => Object.assign(doc.foods.find((f) => f.id === id)!, patch));
  }

  protected toggleTag(id: string, tag: FoodTag): void {
    this.mutate((doc) => {
      const f = doc.foods.find((x) => x.id === id)!;
      const tags = new Set(f.tags ?? []);
      if (tags.has(tag)) tags.delete(tag);
      else tags.add(tag);
      f.tags = [...tags];
    });
  }

  protected setUnit(id: string, unit: Unit): void {
    this.patchFood(id, { unit });
  }

  protected householdList(f: Food): string {
    return Object.entries(f.household ?? {})
      .map(([m, g]) => `1 ${m} = ${g} ${f.unit === 'pz' ? 'pz' : f.unit}`)
      .join(' · ');
  }

  // ---------- Regole ----------

  protected readonly ruleState = computed(() => {
    const rules = this.doc().rules ?? [];
    return RULE_TEMPLATES.map((t) => {
      const r = rules.find((x) => x.type === t.kind && 'tag' in x && x.tag === t.tag);
      const n = r && 'max' in r ? r.max : r && 'min' in r ? r.min : t.def;
      return { ...t, on: !!r, n };
    });
  });

  protected setRule(key: string, on: boolean, n?: number): void {
    const t = RULE_TEMPLATES.find((x) => x.key === key)!;
    this.mutate((doc) => {
      const rules = (doc.rules ?? []).filter((x) => !(x.type === t.kind && 'tag' in x && x.tag === t.tag));
      if (on) rules.push(t.make(n ?? t.def));
      doc.rules = rules;
    });
  }

  // ---------- Dati ----------

  protected patchMeta(patch: Partial<PlanDocument['meta']>): void {
    this.mutate((doc) => (doc.meta = { ...doc.meta, ...patch, example: false }));
  }

  protected numOrUndef(v: string): number | undefined {
    const n = parseFloat(v.replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  protected patchSlot(id: string, patch: Partial<PlanDocument['slots'][number]>): void {
    this.mutate((doc) => Object.assign(doc.slots.find((s) => s.id === id)!, patch));
  }

  // ---------- Salvataggio ----------

  protected submit(): void {
    const doc = structuredClone(this.doc());
    // Righe lasciate vuote e alimenti non più usati si tolgono.
    for (const m of doc.meals) m.portions = m.portions.filter((p) => p.food);
    const used = new Set(doc.meals.flatMap((m) => m.portions.map((p) => p.food)));
    for (const h of doc.habits ?? []) if (h.food) used.add(h.food);
    doc.foods = doc.foods.filter((f) => used.has(f.id));
    const errors = validatePlan(doc);
    if (errors.length) {
      this.errors.set(errors);
      return;
    }
    this.save.emit(doc);
  }
}
