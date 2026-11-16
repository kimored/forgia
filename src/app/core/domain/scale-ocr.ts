import { toIsoDate, type IsoDate } from './dates';

/**
 * Lettura dei valori di una bilancia impedenziometrica (es. Feelfit) da uno screenshot.
 * Lavora sulle parole riconosciute dall'OCR con la loro posizione: le app mostrano i valori
 * in una griglia (etichetta sopra, valore sotto), quindi a ogni etichetta si associa il
 * numero più vicino sotto di lei nella stessa colonna.
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

interface FieldSpec {
  labels: string[];
  min: number;
  max: number;
}

const FIELDS: Record<ScaleField, FieldSpec> = {
  weightKg: { labels: ['peso', 'weight'], min: 30, max: 250 },
  fatPct: { labels: ['grasso corporeo', 'massa grassa', 'body fat'], min: 3, max: 60 },
  bmi: { labels: ['bmi', 'imc'], min: 10, max: 60 },
  skeletalMusclePct: { labels: ['muscolo scheletrico', 'skeletal muscle'], min: 10, max: 80 },
  muscleKg: { labels: ['massa muscolare', 'muscle mass'], min: 15, max: 120 },
  proteinPct: { labels: ['proteine', 'protein'], min: 5, max: 30 },
  bmrKcal: { labels: ['bmr', 'metabolismo basale'], min: 800, max: 4000 },
  visceralFat: { labels: ['grasso addominale', 'grasso viscerale', 'visceral fat'], min: 1, max: 30 },
  waterPct: { labels: ['idratazione', 'acqua corporea', 'body water'], min: 30, max: 80 },
  boneKg: { labels: ['massa ossea', 'bone mass'], min: 1, max: 6 },
  metabolicAge: { labels: ['eta metabolica', 'metabolic age'], min: 10, max: 100 },
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

/** Unisce le parole vicine sulla stessa riga in frasi ("Grasso" + "corporeo", "73.2" + "kg"). */
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
  return t === label || distance(t, label) <= Math.max(1, Math.floor(label.length / 8));
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

export function parseScaleWords(words: OcrWord[]): ScaleParseResult {
  const phrases = groupPhrases(words);
  const values = phrases.filter((p) => /^\s*[+\-−±]?\d/.test(p.text));
  const reading: ScaleReading = {};
  const fields: ScaleField[] = [];

  for (const [field, spec] of Object.entries(FIELDS) as [ScaleField, FieldSpec][]) {
    const labels = phrases.filter((p) => spec.labels.some((l) => labelMatches(p.text, l)));
    // Per ogni etichetta: il valore più vicino sotto, nella stessa colonna.
    const candidates = labels
      .map((label) => {
        const cx = (label.x0 + label.x1) / 2;
        const best = values
          .filter((v) => {
            const gap = v.y0 - label.y1;
            const vcx = (v.x0 + v.x1) / 2;
            const tolerance = Math.max(label.x1 - label.x0, v.x1 - v.x0) / 2 + label.h;
            return gap > -label.h * 0.3 && gap < label.h * 4.5 && Math.abs(vcx - cx) < tolerance;
          })
          .sort((a, b) => a.y0 - b.y0)[0];
        return best ? parseValue(best.text) : null;
      })
      .filter((v): v is number => v !== null && v >= spec.min && v <= spec.max);
    if (candidates.length) {
      reading[field] = candidates[0];
      fields.push(field);
    }
  }

  const date = findDate(phrases);
  if (date) reading.date = date;
  return { reading, fields };
}
