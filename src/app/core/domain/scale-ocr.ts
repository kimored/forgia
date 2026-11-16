import { toIsoDate, type IsoDate } from './dates';

/**
 * Lettura dei valori di una bilancia impedenziometrica da uno screenshot di qualsiasi app.
 * Lavora sulle parole riconosciute dall'OCR con la loro posizione, perché ogni app dispone
 * etichette e valori in modo diverso (griglia, elenco, valore sopra o sotto l'etichetta).
 */

export interface OcrWord {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface ScaleReading {
  date?: IsoDate;
  weightKg?: number;
  fatPct?: number;
  bmi?: number;
  skeletalMusclePct?: number;
  muscleKg?: number;
  proteinPct?: number;
  bmrKcal?: number;
  visceralFat?: number;
  waterPct?: number;
  boneKg?: number;
  metabolicAge?: number;
}

export type ScaleField = Exclude<keyof ScaleReading, 'date'>;

type Kind = 'pct' | 'mass' | 'other';

interface FieldSpec {
  /** Etichette normalizzate (minuscole, senza accenti né simboli), italiano e inglese. */
  labels: string[];
  min: number;
  max: number;
  kind: Kind;
}

/** Sinonimi delle app di bilance più diffuse (Feelfit, Zepp/Mi Fit, Renpho, Huawei, Withings…). */
const FIELDS: Record<ScaleField, FieldSpec> = {
  weightKg: { labels: ['peso', 'peso corporeo', 'weight', 'body weight'], min: 30, max: 250, kind: 'mass' },
  fatPct: {
    labels: [
      'grasso corporeo', 'grasso', 'massa grassa', 'percentuale di grasso', 'percentuale grasso corporeo',
      'body fat', 'body fat rate', 'fat', 'bfr',
    ],
    min: 3,
    max: 60,
    kind: 'pct',
  },
  bmi: { labels: ['bmi', 'imc', 'indice di massa corporea'], min: 10, max: 60, kind: 'other' },
  skeletalMusclePct: {
    labels: ['muscolo scheletrico', 'massa muscolare scheletrica', 'muscoli scheletrici', 'skeletal muscle', 'skeletal muscle mass', 'smm'],
    min: 10,
    max: 80,
    kind: 'pct',
  },
  muscleKg: { labels: ['massa muscolare', 'muscoli', 'muscle mass', 'muscle'], min: 15, max: 120, kind: 'mass' },
  proteinPct: { labels: ['proteine', 'protein'], min: 5, max: 30, kind: 'pct' },
  bmrKcal: {
    labels: ['bmr', 'metabolismo basale', 'metabolismo', 'basal metabolism', 'basal metabolic rate'],
    min: 800,
    max: 4000,
    kind: 'other',
  },
  visceralFat: {
    labels: ['grasso viscerale', 'grasso addominale', 'indice grasso viscerale', 'visceral fat'],
    min: 1,
    max: 30,
    kind: 'other',
  },
  waterPct: { labels: ['idratazione', 'acqua corporea', 'acqua', 'body water', 'water'], min: 30, max: 80, kind: 'pct' },
  boneKg: { labels: ['massa ossea', 'ossa', 'bone mass', 'bone'], min: 1, max: 6, kind: 'mass' },
  metabolicAge: {
    labels: ['eta metabolica', 'eta corporea', 'eta del corpo', 'metabolic age', 'body age'],
    min: 10,
    max: 100,
    kind: 'other',
  },
};

export const SCALE_FIELD_LABELS: Record<ScaleField, string> = {
  weightKg: 'Peso (kg)',
  fatPct: 'Grasso corporeo (%)',
  bmi: 'BMI',
  skeletalMusclePct: 'Muscolo scheletrico (%)',
  muscleKg: 'Massa muscolare (kg)',
  proteinPct: 'Proteine (%)',
  bmrKcal: 'BMR (kcal)',
  visceralFat: 'Grasso addominale',
  waterPct: 'Idratazione (%)',
  boneKg: 'Massa ossea (kg)',
  metabolicAge: 'Età metabolica',
};

interface Phrase extends OcrWord {
  h: number;
}

/** Unisce le parole vicine sulla stessa riga in frasi ("Grasso" + "corporeo", "80.5" + "kg"). */
export function groupPhrases(words: OcrWord[]): Phrase[] {
  const sorted = words
    .filter((w) => w.text.trim())
    .map((w) => ({ ...w, h: w.y1 - w.y0 }))
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);

  // Righe: parole con il centro verticale vicino.
  const lines: Phrase[][] = [];
  for (const w of sorted) {
    const cy = (w.y0 + w.y1) / 2;
    const line = lines.find((l) => Math.abs((l[0].y0 + l[0].y1) / 2 - cy) < Math.max(l[0].h, w.h) * 0.6);
    if (line) line.push(w);
    else lines.push([w]);
  }

  const phrases: Phrase[] = [];
  for (const line of lines) {
    line.sort((a, b) => a.x0 - b.x0);
    let current: Phrase | null = null;
    for (const w of line) {
      const h = Math.min(w.h, current?.h ?? w.h);
      if (current && w.x0 - current.x1 < h * 1.1) {
        current = {
          text: `${current.text} ${w.text}`,
          x0: current.x0,
          y0: Math.min(current.y0, w.y0),
          x1: w.x1,
          y1: Math.max(current.y1, w.y1),
          h: Math.max(current.h, w.h),
        };
      } else {
        if (current) phrases.push(current);
        current = { ...w };
      }
    }
    if (current) phrases.push(current);
  }
  return phrases;
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]+/g, ' ')
    .trim();
}

function distance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Uguaglianza tollerante agli errori dell'OCR ("ldratazione" ≈ "idratazione"). */
function labelMatches(text: string, label: string): boolean {
  const t = normalize(text);
  if (!t) return false;
  if (t === label) return true;
  // Le etichette corte ("bmi", "fat", "ossa") solo esatte: troppo facili da confondere.
  return label.length >= 6 && distance(t, label) <= Math.max(1, Math.floor(label.length / 8));
}

/** Primo numero della frase; null se è una variazione ("+2 kg", "-0.5"). */
export function parseValue(text: string): number | null {
  const t = text.trim();
  if (/^[+\-−±]/.test(t)) return null;
  const m = t.match(/\d+(?:[.,]\d+)?/);
  return m ? parseFloat(m[0].replace(',', '.')) : null;
}

function findDate(phrases: Phrase[]): IsoDate | undefined {
  const dates: IsoDate[] = [];
  for (const p of phrases) {
    // "Da 25/04/2025" è la data di confronto, non quella della pesata.
    if (/^\s*da\b/i.test(p.text)) continue;
    for (const m of p.text.matchAll(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/g)) {
      const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) dates.push(toIsoDate(new Date(y, mo - 1, d, 12)));
    }
  }
  return dates.sort().at(-1);
}

export interface ScaleParseResult {
  reading: ScaleReading;
  fields: ScaleField[];
}

type Direction = 'below' | 'right' | 'above';
const DIRECTIONS: Direction[] = ['below', 'right', 'above'];
const LB = 0.45359237;

/** Valore di una frase per un campo, con controllo di unità e range (null se non valido). */
function valueFor(text: string, spec: FieldSpec): number | null {
  let v = parseValue(text);
  if (v === null) return null;
  const t = text.toLowerCase();
  if (spec.kind === 'pct' && /kg|lb/.test(t)) return null;
  if (spec.kind !== 'pct' && t.includes('%')) return null;
  if (spec.kind === 'mass' && /lb/.test(t)) v = Math.round(v * LB * 10) / 10;
  return v >= spec.min && v <= spec.max ? v : null;
}

/** Distanza tra etichetta e valore in una direzione (null se non sono allineati). */
function gapIn(dir: Direction, label: Phrase, v: Phrase): number | null {
  const h = label.h;
  const sameColumn = () => {
    const tol = Math.max(label.x1 - label.x0, v.x1 - v.x0) / 2 + h;
    return Math.abs((v.x0 + v.x1) / 2 - (label.x0 + label.x1) / 2) < tol;
  };
  switch (dir) {
    case 'below': {
      const gap = v.y0 - label.y1;
      return gap > -h * 0.3 && gap < h * 4.5 && sameColumn() ? gap : null;
    }
    case 'above': {
      const gap = label.y0 - v.y1;
      return gap > -h * 0.3 && gap < h * 4.5 && sameColumn() ? gap : null;
    }
    case 'right': {
      const sameLine = Math.abs((v.y0 + v.y1) / 2 - (label.y0 + label.y1) / 2) < Math.max(h, v.h) * 0.7;
      const gap = v.x0 - label.x1;
      return sameLine && gap > -h * 0.5 ? gap : null;
    }
  }
}

/** Divide "Peso: 80,5 kg" in etichetta e valore, se la frase li contiene entrambi. */
function splitInline(p: Phrase): { label: string; value: string } | null {
  const m = p.text.match(/^([^\d+\-−±]*[a-zA-Zà-ÿ][^\d+\-−±]*?)\s*[:=]?\s*([+\-−±]?\d.*)$/);
  return m ? { label: m[1], value: m[2] } : null;
}

/**
 * Interpreta le parole dello screenshot di una qualsiasi app di bilancia.
 * Prova le disposizioni più comuni (stessa riga, valore sotto, a destra o sopra l'etichetta)
 * e usa quella che trova più valori plausibili; le altre completano i campi mancanti.
 */
export function parseScaleWords(words: OcrWord[]): ScaleParseResult {
  const phrases = groupPhrases(words);
  const values = phrases.filter((p) => /^\s*[+\-−±]?\d/.test(p.text));
  const entries = Object.entries(FIELDS) as [ScaleField, FieldSpec][];
  const labelsOf = (spec: FieldSpec) => phrases.filter((p) => spec.labels.some((l) => labelMatches(p.text, l)));
  const found = new Map<ScaleField, number>();

  // 1. Etichetta e valore nella stessa frase ("Grasso corporeo 17,2 %").
  for (const p of phrases) {
    const inline = splitInline(p);
    if (!inline) continue;
    for (const [field, spec] of entries) {
      if (found.has(field) || !spec.labels.some((l) => labelMatches(inline.label, l))) continue;
      const v = valueFor(inline.value, spec);
      if (v !== null) found.set(field, v);
    }
  }

  // 2. Etichetta e valore separati: per ogni direzione, il valore più vicino a ogni etichetta.
  const byDirection = new Map<Direction, Map<ScaleField, { v: number; phrase: Phrase }>>();
  for (const dir of DIRECTIONS) {
    const map = new Map<ScaleField, { v: number; phrase: Phrase }>();
    for (const [field, spec] of entries) {
      for (const label of labelsOf(spec)) {
        const nearest = values
          .map((phrase) => ({ phrase, gap: gapIn(dir, label, phrase) }))
          .filter((x): x is { phrase: Phrase; gap: number } => x.gap !== null)
          .sort((a, b) => a.gap - b.gap)[0];
        const v = nearest ? valueFor(nearest.phrase.text, spec) : null;
        if (v !== null) {
          map.set(field, { v, phrase: nearest!.phrase });
          break;
        }
      }
    }
    byDirection.set(dir, map);
  }
  const order = [...DIRECTIONS].sort((a, b) => byDirection.get(b)!.size - byDirection.get(a)!.size);
  const used = new Set<Phrase>();
  for (const dir of order) {
    for (const [field, { v, phrase }] of byDirection.get(dir)!) {
      if (found.has(field) || used.has(phrase)) continue;
      found.set(field, v);
      used.add(phrase);
    }
  }

  // 3. Peso senza etichetta: il numero in kg/lb scritto più grande (il "titolo" della schermata).
  //    Solo se l'etichetta manca davvero: se c'è ma il valore è illeggibile, meglio lasciarlo vuoto.
  if (!found.has('weightKg') && !labelsOf(FIELDS.weightKg).length) {
    const big = values
      .filter((p) => /kg|lb/i.test(p.text) && !used.has(p))
      .map((p) => ({ p, v: valueFor(p.text, FIELDS.weightKg) }))
      .filter((x) => x.v !== null)
      .sort((a, b) => b.p.h - a.p.h)[0];
    if (big) found.set('weightKg', big.v!);
  }

  const reading: ScaleReading = {};
  const fields: ScaleField[] = [];
  for (const [field] of entries) {
    const v = found.get(field);
    if (v !== undefined) {
      reading[field] = v;
      fields.push(field);
    }
  }
  const date = findDate(phrases);
  if (date) reading.date = date;
  return { reading, fields };
}
