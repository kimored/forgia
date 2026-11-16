import type { Food, FoodTag, MealOption, PlanDay, PlanDocument, Portion, SlotDef, Unit, Weekday } from '../models/plan';

/**
 * Importazione di un piano alimentare dal testo di un documento (PDF, Word, OCR di foto).
 * Riconosce il formato più diffuso nei software per nutrizionisti: pagine per giorno
 * ("Lunedì – settimana n. 1"), sezioni per pasto e righe "alimento ... quantità", più la
 * pagina della lista della spesa con le conversioni in grammi. Il risultato è una BOZZA
 * da rivedere: ogni stima è segnalata.
 */

export interface SourceLine {
  text: string;
  /** Posizione (se dall'OCR): serve ad abbinare nomi e quantità su colonne separate. */
  x0?: number;
  y0?: number;
  x1?: number;
  y1?: number;
}

export interface SourcePage {
  lines: SourceLine[];
  width?: number;
}

export interface Quantity {
  /** Numero di unità (es. 3 per "3 cucchiai"); 0 per "quanto basta". */
  amount: number;
  /** "g", "ml", "pz" oppure una misura casalinga normalizzata ("bicchiere", "cucchiaio"…). */
  unit: string;
  /** Testo come scritto (es. "3 cucchiai"). */
  raw: string;
  /** Lettura dubbia (OCR: "E 10" letto come "g 10"…). */
  uncertain?: boolean;
}

export interface DraftItem {
  name: string;
  qty?: Quantity;
  /** Ingrediente di un piatto composto ("- Pasta di semola"). */
  sub?: boolean;
  /** Il nome è stato corretto con il dizionario (lista spesa). */
  corrected?: string;
}

export interface DraftSlot {
  slot: string;
  free?: boolean;
  items: DraftItem[];
}

export interface DraftDay {
  week: number;
  weekday: Weekday;
  slots: DraftSlot[];
}

export interface ImportIssue {
  level: 'warn' | 'info';
  text: string;
}

export interface ImportDraft {
  days: DraftDay[];
  /** Grammi per unità di misura, per alimento (dalla lista spesa): nome → misura → g. */
  conversions: Map<string, Map<string, number>>;
  /** Nomi degli alimenti trovati nella lista spesa (dizionario per correggere l'OCR). */
  lexicon: string[];
  /** Sezione della lista spesa in cui compare ogni alimento (Primi, Secondi, Contorni…). */
  categories: Map<string, string>;
  /** Calorie e proteine se scritte nel documento (es. "Piano da 1.800 kcal"). */
  kcal?: number;
  proteinG?: number;
  issues: ImportIssue[];
}

// ---------------------------------------------------------------------------
// Testo
// ---------------------------------------------------------------------------

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
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
  return 1 - dp[b.length] / Math.max(a.length, b.length);
}

const WEEKDAYS: [RegExp, Weekday][] = [
  [/luned/, 0],
  [/marted/, 1],
  [/mercoled/, 2],
  [/gioved/, 3],
  [/venerd/, 4],
  [/sabato/, 5],
  [/domenica/, 6],
];

/** Sezioni di pasto riconosciute → id slot, etichetta, colore, orario indicativo. */
const SLOT_HEADERS: { id: string; names: string[]; def: Omit<SlotDef, 'id'> }[] = [
  { id: 'colazione', names: ['colazione', 'prima colazione'], def: { label: 'Colazione', color: 'colazione', emoji: '☕', time: '08:00' } },
  { id: 'meta-mattina', names: ['meta mattina', 'meta mattinata', 'spuntino', 'spuntino mattina', 'spuntino di meta mattina', 'spuntino mattutino'], def: { label: 'Metà mattina', color: 'spuntino', emoji: '🍎', time: '10:30' } },
  { id: 'pranzo', names: ['pranzo'], def: { label: 'Pranzo', color: 'pranzo', emoji: '🍝', time: '13:00' } },
  { id: 'merenda', names: ['merenda', 'spuntino pomeriggio', 'spuntino pomeridiano', 'meta pomeriggio'], def: { label: 'Merenda', color: 'spuntino', emoji: '🥣', time: '16:30' } },
  { id: 'cena', names: ['cena'], def: { label: 'Cena', color: 'cena', emoji: '🍽️', time: '20:00' } },
  { id: 'dopocena', names: ['dopocena', 'dopo cena'], def: { label: 'Dopocena', color: 'spuntino', emoji: '🌙', time: '22:00' } },
  { id: 'pre', names: ['pre allenamento', 'pre workout'], def: { label: 'Pre-allenamento', color: 'post', emoji: '⚡', gymOnly: true } },
  { id: 'post', names: ['post allenamento', 'post workout', 'dopo allenamento'], def: { label: 'Post-allenamento', color: 'post', emoji: '🥤', gymOnly: true } },
  { id: 'arco', names: ['arco della giornata', 'durante la giornata', 'nell arco della giornata', 'da distribuire nella giornata'], def: { label: 'Arco della giornata', color: 'arco', emoji: '🧺', allowance: true } },
];

const SHOPPING_SECTIONS = ['primi', 'secondi', 'contorni', 'frutta', 'altri alimenti', 'verdure', 'condimenti', 'bevande'];
/** Parole di intestazione di tabella da ignorare. */
const TABLE_WORDS = /^(alimento|alimenti|quantita|quantità|grammi|porzione)$/;

/** Riconosce l'intestazione di una sezione di pasto, tollerando rumore OCR ("Alim Colazione"). */
export function slotHeader(text: string): (typeof SLOT_HEADERS)[number] | null {
  const n = normalize(text);
  if (!n || /\d/.test(n)) return null;
  const words = n.split(' ').filter((w) => !TABLE_WORDS.test(w) && w.length > 1);
  for (const h of SLOT_HEADERS) {
    for (const name of h.names) {
      const k = name.split(' ').length;
      // Il nome della sezione deve essere quasi tutta la riga (al massimo 1 parola di rumore).
      if (words.length > k + 1) continue;
      for (let i = 0; i + k <= words.length; i++) {
        if (similarity(words.slice(i, i + k).join(' '), name) >= 0.8) return h;
      }
    }
  }
  return null;
}

const UNIT_WORDS: [RegExp, string][] = [
  [/^bicchier/, 'bicchiere'],
  [/^cucchiain/, 'cucchiaino'],
  [/^cucchia/, 'cucchiaio'],
  [/^tazz/, 'tazzina'],
  [/^vasett/, 'vasetto'],
  [/^porzion|^pomion|^porzioni/, 'porzione'],
  [/^fett/, 'fetta'],
  [/^pezz|^pz$/, 'pz'],
  [/^bustin/, 'bustina'],
  [/^scatolett/, 'scatoletta'],
  [/^panin/, 'panino'],
  [/^manciat/, 'manciata'],
  [/^bottigli/, 'bottiglia'],
];

/** Riconosce una quantità alla fine (o come intera) riga. */
export function parseQuantity(text: string): { qty: Quantity; rest: string } | null {
  const t = text.replace(/[_|{}[\]]+/g, ' ').replace(/\s+/g, ' ').trim();

  const qb = t.match(/^(.*?)\s*(\d+\s+)?(quantit[aà]\s*bastant[ei]|q\.?\s?b\.?)\s*$/i);
  if (qb) return { qty: { amount: 0, unit: 'qb', raw: 'q.b.' }, rest: qb[1] };

  // Misure casalinghe per prime: "2 cucchiai e ½" letto "e 4" non deve diventare "4 grammi".
  // "3 cucchiai", "2 cucchiai e ½", "1 bicchiere"
  const house = t.match(/^(.*?)(?:^|\s)(\d+(?:[.,]\d+)?|½|un|una|mezzo|mezza)\s*([a-zà-ù]{4,})(\s+e\s*(?:½|1\/2|mezzo|'?4))?\s*!?\s*$/i);
  if (house) {
    const unit = UNIT_WORDS.find(([re]) => re.test(house[3].toLowerCase()))?.[1];
    if (unit) {
      let amount = /^(un|una)$/i.test(house[2]) ? 1 : /^(mezz|½)/i.test(house[2]) ? 0.5 : num(house[2]);
      const half = !!house[4];
      if (half) amount += 0.5;
      const uncertain = half && /'?4/.test(house[4] ?? '');
      return { qty: { amount, unit, raw: `${house[2]} ${house[3]}${half ? ' e ½' : ''}`, uncertain }, rest: house[1] };
    }
  }

  // "g 40", "8g 40" (OCR di "g"), "40 g", "40g", "E 10" (OCR di "g", incerto)
  const gramsAfter = t.match(/^(.*?)(?:^|\s)(g|gr|8g|gg|e|\[-|&)\.?\s*(\d+(?:[.,]\d+)?)\s*$/i);
  if (gramsAfter) {
    const tok = gramsAfter[2].toLowerCase();
    return {
      qty: { amount: num(gramsAfter[3]), unit: 'g', raw: `g ${gramsAfter[3]}`, uncertain: !['g', 'gr'].includes(tok) },
      rest: gramsAfter[1],
    };
  }
  const gramsBefore = t.match(/^(.*?)(?:^|\s)(\d+(?:[.,]\d+)?)\s*(g|gr|grammi|ml|cl|kg)\.?\s*$/i);
  if (gramsBefore) {
    const u = gramsBefore[3].toLowerCase();
    const amount = num(gramsBefore[2]) * (u === 'kg' ? 1000 : u === 'cl' ? 10 : 1);
    return { qty: { amount, unit: u === 'ml' || u === 'cl' ? 'ml' : 'g', raw: `${gramsBefore[2]} ${u}` }, rest: gramsBefore[1] };
  }

  // "n° 4", "n°1", "nr. 2"
  const count = t.match(/^(.*?)(?:^|\s)(?:n°|n\.|nr\.?|n )\s*(\d+)\s*$/i);
  if (count) return { qty: { amount: Number(count[2]), unit: 'pz', raw: `n° ${count[2]}` }, rest: count[1] };
  return null;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

const num = (s: string) => parseFloat(s.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));

/** Pulisce il nome di un alimento dal rumore OCR; dice se è un ingrediente ("- …"). */
export function cleanName(text: string): { name: string; sub: boolean } {
  let t = text.trim();
  const sub = /^[\s'"„“”‘’|!]*[-–—]/.test(t) || /^["„“]\s*[A-Z]/.test(t);
  t = t.replace(/^[\s'"„“”‘’|!:;.,>?\-–—_]+/, '');
  // Coda di rumore: token lunghi senza senso ("quesetisoosibiontaneronesi…") o ripetizioni.
  const words = t.split(/\s+/);
  // Lettere o accenti isolati in testa ("i È Macedonia", "1! Yogurt") sono rumore.
  while (words.length > 1 && words[0].replace(/[^a-zà-ù]/gi, '').length <= 1) words.shift();
  const keep: string[] = [];
  for (const w of words) {
    // Un numero nel nome di solito è una quantità finita nella riga sbagliata: si taglia lì.
    if (/\d/.test(w)) break;
    const plain = w.replace(/[^a-zà-ù']/gi, '');
    const junk = plain.length > 14 || /(.)\1\1/i.test(plain) || (plain.length >= 2 && !/[aeiouàèéìòù]/i.test(plain) && plain.length > 3);
    if (junk) break;
    keep.push(w);
  }
  // Lettere isolate in coda ("Pomodori i") sono rumore.
  while (keep.length > 1 && keep.at(-1)!.replace(/[^a-zà-ù]/gi, '').length <= 1) keep.pop();
  t = keep.join(' ').replace(/[\s|_.,;:!'’]+$/, '').trim();
  return { name: t, sub };
}

/**
 * Ricostruisce le righe del documento dalle parole OCR con posizione: le parole alla stessa
 * altezza formano una riga, anche se l'OCR ha letto prima la colonna dei nomi e poi quella
 * delle quantità.
 */
export function linesFromWords(words: { text: string; x0: number; y0: number; x1: number; y1: number }[]): SourceLine[] {
  const sorted = words.filter((w) => w.text.trim()).sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
  const rows: (typeof sorted)[] = [];
  for (const w of sorted) {
    const cy = (w.y0 + w.y1) / 2;
    const h = w.y1 - w.y0;
    const row = rows.find((r) => {
      const rcy = r.reduce((s, x) => s + (x.y0 + x.y1) / 2, 0) / r.length;
      const rh = r.reduce((s, x) => s + (x.y1 - x.y0), 0) / r.length;
      return Math.abs(rcy - cy) < Math.max(rh, h) * 0.55;
    });
    if (row) row.push(w);
    else rows.push([w]);
  }
  return rows
    .map((r) => r.sort((a, b) => a.x0 - b.x0))
    .map((r) => ({
      text: r.map((w) => w.text).join(' '),
      x0: Math.min(...r.map((w) => w.x0)),
      y0: Math.min(...r.map((w) => w.y0)),
      x1: Math.max(...r.map((w) => w.x1)),
      y1: Math.max(...r.map((w) => w.y1)),
    }))
    .sort((a, b) => a.y0 - b.y0);
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

interface Parsed {
  line: SourceLine;
  kind: 'day' | 'slot' | 'free' | 'shopping' | 'section' | 'item' | 'qty' | 'noise';
  day?: { week: number; weekday: Weekday };
  slot?: (typeof SLOT_HEADERS)[number];
  name?: string;
  sub?: boolean;
  qty?: Quantity;
  /** Grammi indicati tra parentesi nella lista spesa "(g 60)". */
  grams?: number;
}

function classify(line: SourceLine, lastWeek: number): Parsed {
  const text = line.text.trim();
  const n = normalize(text);
  if (!n) return { line, kind: 'noise' };

  if (/lista della spesa|alimenti assegnati/.test(n)) {
    const w = n.match(/settimana n?\s*(\d+)/);
    return { line, kind: 'shopping', day: { week: w ? Number(w[1]) : lastWeek, weekday: 0 } };
  }
  const wd = WEEKDAYS.find(([re]) => re.test(n));
  if (wd && (/piano|settimana|giorno/.test(n) || n.split(' ').length <= 3)) {
    const w = n.match(/settimana n?\s*(\d+)/);
    return { line, kind: 'day', day: { week: w ? Number(w[1]) : lastWeek, weekday: wd[1] } };
  }
  if (/^pasto libero$|^libero$/.test(n)) return { line, kind: 'free' };
  if (SHOPPING_SECTIONS.includes(n)) return { line, kind: 'section', name: n };
  const header = slotHeader(text);
  if (header) return { line, kind: 'slot', slot: header };

  // Grammi tra parentesi della lista spesa: "3 cucchiai (g 60)"
  let rest = text;
  let grams: number | undefined;
  const paren = rest.match(/[({]\s*(?:g|gg|8g|8|a|e)?[\s_]*([\d.]+)\s*[)}]?\s*$/i);
  if (paren && /[({]/.test(rest)) {
    grams = num(paren[1]);
    rest = rest.slice(0, paren.index).trim();
  }
  const q = parseQuantity(rest);
  const namePart = q ? q.rest : rest;
  const { name, sub } = cleanName(namePart);
  const hasName = /[a-zà-ù]{3,}/i.test(name) && !TABLE_WORDS.test(normalize(name));
  if (q && !hasName) return { line, kind: 'qty', qty: q.qty, grams };
  if (hasName) return { line, kind: 'item', name, sub, qty: q?.qty, grams };
  return { line, kind: 'noise' };
}

/**
 * Abbina quantità e nomi che l'OCR ha letto su righe separate (colonne lette una dopo
 * l'altra): con le posizioni usa la stessa altezza, altrimenti l'ordine.
 */
function pairOrphans(items: Parsed[], qtys: Parsed[]): void {
  // I titoli dei piatti composti (seguiti da ingredienti "- …") non hanno quantità.
  const lonely = items.filter((i, idx) => !i.qty && !items[idx + 1]?.sub);
  const withPos = lonely.every((i) => i.line.y0 !== undefined) && qtys.every((q) => q.line.y0 !== undefined);
  const used = new Set<Parsed>();
  if (withPos && lonely.length && qtys.length) {
    const cy = (p: Parsed) => (p.line.y0! + p.line.y1!) / 2;
    const h = Math.max(10, median(lonely.map((i) => i.line.y1! - i.line.y0!)));
    // Foto inclinata: la colonna delle quantità è spostata in verticale rispetto ai nomi.
    // Si stima lo scostamento tipico dalle coppie più vicine e lo si corregge.
    const offsets = lonely
      .map((i) => qtys.map((q) => cy(q) - cy(i)).sort((a, b) => Math.abs(a) - Math.abs(b))[0])
      .filter((d) => Math.abs(d) < h * 2.5);
    const shift = offsets.length ? median(offsets) : 0;
    const pairs = lonely
      .flatMap((item) => qtys.map((q) => ({ item, q, d: Math.abs(cy(q) - shift - cy(item)) })))
      .filter((x) => x.d < h * 1.2)
      .sort((a, b) => a.d - b.d);
    const done = new Set<Parsed>();
    for (const { item, q } of pairs) {
      if (done.has(item) || used.has(q)) continue;
      item.qty = q.qty;
      item.grams ??= q.grams;
      used.add(q);
      done.add(item);
    }
  } else if (!withPos) {
    const free = qtys.filter((q) => !used.has(q));
    lonely.forEach((item, i) => {
      if (free[i]) {
        item.qty = free[i].qty;
        item.grams ??= free[i].grams;
      }
    });
  }
}

export function parsePlanText(pages: SourcePage[]): ImportDraft {
  const draft: ImportDraft = { days: [], conversions: new Map(), lexicon: [], categories: new Map(), issues: [] };
  let lastWeek = 1;

  // Calorie e proteine, se il documento le indica.
  const allText = pages.flatMap((p) => p.lines.map((l) => l.text)).join(' ');
  const kcal = allText.match(/(\d{1,2}[.\s]?\d{3})\s*kcal/i);
  if (kcal) draft.kcal = Number(kcal[1].replace(/[.\s]/g, ''));
  const prot = allText.match(/proteine[^\d]{0,20}(\d{2,3})\s*g/i);
  if (prot) draft.proteinG = Number(prot[1]);

  // 1. La lista spesa per prima: fornisce dizionario e conversioni per correggere i giorni.
  const dayPages: { day: { week: number; weekday: Weekday } | null; parsed: Parsed[] }[] = [];
  for (const page of pages) {
    const all = page.lines.map((l) => {
      const p = classify(l, lastWeek);
      if (p.day) lastWeek = p.day.week;
      return p;
    });
    // PDF e Word possono avere più giorni nello stesso flusso: si divide a ogni intestazione.
    const segments: Parsed[][] = [[]];
    for (const p of all) {
      if ((p.kind === 'day' || p.kind === 'shopping') && segments.at(-1)!.some((x) => x.kind !== 'noise')) segments.push([]);
      segments.at(-1)!.push(p);
    }
    for (const parsed of segments) {
      if (parsed.some((p) => p.kind === 'shopping')) readShopping(parsed, draft);
      else dayPages.push({ day: parsed.find((p) => p.kind === 'day')?.day ?? null, parsed });
    }
  }

  // 2. Pagine dei giorni.
  for (const { day, parsed } of dayPages) {
    if (!parsed.some((p) => p.kind === 'slot')) continue;
    if (!day) draft.issues.push({ level: 'warn', text: 'Una pagina non indica il giorno: considerata come giorno tipo.' });
    const items = parsed.filter((p) => p.kind === 'item');
    pairOrphans(
      items,
      parsed.filter((p) => p.kind === 'qty'),
    );

    const out: DraftDay = { week: day?.week ?? 1, weekday: day?.weekday ?? 0, slots: [] };
    let current: DraftSlot | null = null;
    for (const p of parsed) {
      if (p.kind === 'slot') {
        current = { slot: p.slot!.id, items: [] };
        out.slots.push(current);
      } else if (p.kind === 'free' && current) {
        current.free = true;
      } else if (p.kind === 'item' && current) {
        const corrected = correct(p.name!, draft.lexicon);
        current.items.push({
          name: corrected ?? p.name!,
          qty: p.qty,
          sub: p.sub,
          ...(corrected && corrected !== p.name ? { corrected: p.name } : {}),
        });
      }
    }
    mergeFragments(out, parsed, draft.lexicon);
    // Un piatto senza quantità seguito da ingredienti "- …" è il titolo del piatto.
    for (const s of out.slots) {
      s.items.forEach((it, i) => {
        if (!it.qty && !it.sub && s.items[i + 1]?.sub) it.sub = false;
      });
    }
    draft.days.push(out);
  }

  // 3. Avvisi per la revisione.
  for (const d of draft.days) {
    for (const s of d.slots) {
      const missing = s.items.filter((i) => !i.qty && !s.items[s.items.indexOf(i) + 1]?.sub);
      if (missing.length) draft.issues.push({ level: 'warn', text: `${dayLabel(d)} · ${slotLabel(s.slot)}: quantità non letta per ${missing.map((m) => m.name).join(', ')}` });
      const unsure = s.items.filter((i) => i.qty?.uncertain);
      if (unsure.length) draft.issues.push({ level: 'info', text: `${dayLabel(d)} · ${slotLabel(s.slot)}: controlla ${unsure.map((m) => `${m.name} (${m.qty!.raw})`).join(', ')}` });
      if (!s.items.length && !s.free) draft.issues.push({ level: 'warn', text: `${dayLabel(d)} · ${slotLabel(s.slot)}: nessun alimento letto` });
    }
  }
  return draft;
}

/**
 * Foto curve: l'OCR spezza una riga in due ("Latte pa" + "rzialmente scr. di vacca…").
 * Due voci consecutive sulla stessa altezza, una sola con quantità e una a sinistra
 * dell'altra, sono la stessa riga.
 */
function mergeFragments(day: DraftDay, parsed: Parsed[], lexicon: string[]): void {
  const lineOf = new Map<string, Parsed>();
  for (const p of parsed) if (p.kind === 'item' && p.name) lineOf.set(p.name, p);
  for (const s of day.slots) {
    for (let i = 0; i + 1 < s.items.length; i++) {
      const a = s.items[i];
      const b = s.items[i + 1];
      const la = lineOf.get(a.corrected ?? a.name)?.line;
      const lb = lineOf.get(b.corrected ?? b.name)?.line;
      if (!la?.y0 || !lb?.y0 || !!a.qty === !!b.qty || a.sub !== b.sub) continue;
      const h = Math.max(la.y1! - la.y0, lb.y1! - lb.y0);
      if (Math.abs((la.y0 + la.y1!) / 2 - (lb.y0 + lb.y1!) / 2) > h * 1.5) continue;
      const [left, right] = la.x0! <= lb.x0! ? [a, b] : [b, a];
      const [ll, rl] = la.x0! <= lb.x0! ? [la, lb] : [lb, la];
      if (ll.x1! > rl.x0! + h) continue;
      const leftName = left.corrected ?? left.name;
      const rightName = right.corrected ?? right.name;
      // "pa" + "rzialmente": parola tagliata, si unisce senza spazio.
      const lastWord = leftName.split(' ').at(-1) ?? '';
      const joined = lastWord.length <= 4 && /^[a-zà-ù]/.test(rightName) ? leftName + rightName : `${leftName} ${rightName}`;
      const fixed = correct(joined, lexicon);
      s.items.splice(i, 2, { name: fixed ?? joined, qty: a.qty ?? b.qty, sub: a.sub, corrected: joined });
    }
  }
}

function readShopping(parsed: Parsed[], draft: ImportDraft): void {
  let section = '';
  const items = parsed.filter((p) => p.kind === 'item');
  pairOrphans(items, parsed.filter((p) => p.kind === 'qty'));
  for (const p of parsed) {
    if (p.kind === 'section') section = p.name!;
    // Solo le righe dentro una sezione (Primi, Secondi…): l'intestazione con il nome della persona resta fuori.
    if (p.kind !== 'item' || !p.name || !section) continue;
    const key = normalize(p.name);
    if (key.length < 3) continue;
    if (!draft.lexicon.some((l) => normalize(l) === key)) draft.lexicon.push(p.name);
    if (section) draft.categories.set(key, section);
    if (p.qty && p.grams && p.qty.amount > 0 && p.qty.unit !== 'g') {
      const map = draft.conversions.get(key) ?? new Map<string, number>();
      map.set(p.qty.unit, Math.round((p.grams / p.qty.amount) * 10) / 10);
      draft.conversions.set(key, map);
    }
  }
}

/** Corregge un nome letto male con il dizionario della lista spesa (se molto simile). */
function correct(name: string, lexicon: string[]): string | null {
  const n = normalize(name);
  let best: string | null = null;
  let bestScore = 0;
  let junkTail = false;
  for (const entry of lexicon) {
    const e = normalize(entry);
    // "Marmellata umana": voce del dizionario + poco rumore in coda → la voce.
    const tail = n.startsWith(`${e} `) && e.length >= 5 && n.length - e.length <= 10;
    // Confronto anche con l'inizio della voce (la lista spesa a volte va a capo).
    const s = Math.max(similarity(n, e), e.startsWith(n) && n.length >= 8 ? 0.9 : 0, tail ? 0.86 : 0);
    if (s > bestScore) {
      bestScore = s;
      best = entry;
      junkTail = tail;
    }
  }
  if (bestScore < 0.72 || !best) return null;
  // Se il nome letto è più completo della voce del dizionario (andata a capo), si tiene il nome.
  return junkTail || normalize(best).length + 3 >= n.length ? best : null;
}

const DAY_NAMES = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const dayLabel = (d: DraftDay) => `${DAY_NAMES[d.weekday]} sett. ${d.week}`;
const slotLabel = (id: string) => SLOT_HEADERS.find((h) => h.id === id)?.def.label ?? id;

// ---------------------------------------------------------------------------
// Bozza → documento di piano
// ---------------------------------------------------------------------------

/** Grammi indicativi per misura casalinga, quando il piano non li dice (segnalati come stima). */
const DEFAULT_GRAMS: Record<string, number> = {
  bicchiere: 200,
  tazzina: 50,
  cucchiaio: 10,
  cucchiaino: 5,
  vasetto: 125,
  porzione: 200,
  fetta: 30,
  bustina: 5,
  scatoletta: 80,
  panino: 80,
  manciata: 30,
  bottiglia: 500,
};

const TAG_RULES: [RegExp, FoodTag][] = [
  [/lenticch|fagiol|cec[ei]|pisell|fave|legum|cicerch|soia|edamame/, 'legume'],
  [/verza|cavol|broccol|cavolfior|cime di rapa|friariell|cappucc/, 'cavolo'],
  [/manzo|vitell|maial|salsicc|macinat|bresaol|agnell|cavall|bovin|suin|lesso di manzo/, 'carne-rossa'],
  [/orata|spigol|branzin|merluzz|nasell|salmon|tonno|gamber|frutti di mare|pesce|sogliol|platessa|sgombr|alic|acciug|sardin|cozz|vongol|calamar|seppi|polp|baccal|lupini/, 'pesce'],
  [/^uov|^uova|frittata/, 'uova'],
  [/prosciutt|salame|mortadell|fesa|speck|affettat|coppa/, 'affettato'],
  [/salsicc/, 'salsiccia'],
  [/latte|yogurt|mozzarell|formagg|ricott|parmigian|grana|stracchin|scamorz|kefir/, 'latticini'],
  [/insalat|lattug|pomodor|carot|spinac|zucchin|melanz|peperon|cicoria|bietol|verdur|finocch|cetriol|rucola|sedano|asparag|carciof|funghi|mais/, 'verdura'],
  [/macedonia|frutta|mela|mele|pera|pere|banan|arancia|arance|kiwi|fragol|pesca|pesche|albicocc|anguria|melone|uva|ananas|mandarin/, 'frutta'],
  [/pasta|riso|pane|fette biscottate|fiocchi|cereali|farro|orzo|cous|pizza|gallett|crackers|grissin|biscott|muesli|avena/, 'cereali'],
];

export function guessTags(name: string, category?: string): FoodTag[] {
  const n = normalize(name);
  const tags = new Set<FoodTag>();
  for (const [re, tag] of TAG_RULES) if (re.test(n)) tags.add(tag);
  if (category === 'contorni') tags.add('verdura');
  if (category === 'frutta' && !/mandorl|noc[ei]|nocciol|pistacch/.test(n)) tags.add('frutta');
  // "Frittata" e "uovo" contano come uova solo se piatto principale: lo decide il professionista in revisione.
  return [...tags];
}

export const slug = (s: string) =>
  normalize(s)
    .replace(/\s+/g, '-')
    .slice(0, 40) || 'alimento';

export interface BuildResult {
  doc: PlanDocument;
  /** Porzioni con grammi stimati da tabella (da controllare). */
  estimated: { food: string; measure: string; grams: number }[];
}

/** Trasforma la bozza in un documento di piano (da rivedere nell'editor). */
export function buildPlan(draft: ImportDraft, meta: { title: string; author?: string }): BuildResult {
  const estimated: BuildResult['estimated'] = [];
  const foods = new Map<string, Food>();
  const meals: MealOption[] = [];
  const slotIds = new Set<string>();

  const foodFor = (name: string, qty?: Quantity): Food => {
    const id = slug(name);
    let f = foods.get(id);
    if (!f) {
      const unit: Unit = qty?.unit === 'pz' && !draft.conversions.get(normalize(name))?.get('pz') ? 'pz' : qty?.unit === 'ml' ? 'ml' : 'g';
      f = { id, name, unit, tags: guessTags(name, draft.categories.get(normalize(name))) };
      const conv = draft.conversions.get(normalize(name));
      if (conv?.size) f.household = Object.fromEntries(conv);
      foods.set(id, f);
    }
    return f;
  };

  const portionFor = (it: DraftItem): Portion | null => {
    const f = foodFor(it.name, it.qty);
    if (!it.qty) return { food: f.id, qty: 0, note: 'quantità da inserire' };
    const q = it.qty;
    if (q.unit === 'qb') return { food: f.id, qty: 0, measure: 'q.b.' };
    if (q.unit === 'g' || q.unit === 'ml') return { food: f.id, qty: q.amount };
    if (q.unit === 'pz' && f.unit === 'pz') return { food: f.id, qty: q.amount, measure: q.raw };
    const per = f.household?.[q.unit] ?? DEFAULT_GRAMS[q.unit];
    if (!f.household?.[q.unit]) estimated.push({ food: f.name, measure: q.unit, grams: per ?? 0 });
    return { food: f.id, qty: Math.round((per ?? 0) * q.amount), measure: q.raw };
  };

  const weeks = Math.max(1, ...draft.days.map((d) => d.week));
  const calendar: PlanDay[][] = Array.from({ length: weeks }, () => Array.from({ length: 7 }, () => ({ meals: {} })));
  const DAY_IDS = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];

  for (const d of draft.days) {
    for (const s of d.slots) {
      slotIds.add(s.slot);
      if (s.free) {
        calendar[d.week - 1][d.weekday].meals[s.slot] = 'libero';
        continue;
      }
      const portions = s.items.filter((it) => it.qty || !s.items[s.items.indexOf(it) + 1]?.sub).map(portionFor).filter((p): p is Portion => !!p);
      if (!portions.length) continue;
      const dishes = s.items.filter((it, i) => !it.qty && s.items[i + 1]?.sub).map((it) => it.name);
      const mains = s.items.filter((it) => !it.sub && it.qty).map((it) => it.name);
      const title = [...dishes, ...mains].slice(0, 3).join(', ') || 'Pasto';
      const id = `s${d.week}-${DAY_IDS[d.weekday]}-${s.slot}`;
      meals.push({ id, slots: [s.slot], title, portions });
      calendar[d.week - 1][d.weekday].meals[s.slot] = id;
    }
  }

  const slots: SlotDef[] = SLOT_HEADERS.filter((h) => slotIds.has(h.id)).map((h) => ({ id: h.id, ...h.def, owner: 'mine' as const }));
  const doc: PlanDocument = {
    format: 'forgia-plan',
    version: 1,
    meta: {
      title: meta.title,
      author: meta.author,
      date: new Date().toISOString().slice(0, 10),
      ...(draft.kcal ? { kcal: draft.kcal } : {}),
      ...(draft.proteinG ? { proteinG: draft.proteinG } : {}),
    },
    slots,
    foods: [...foods.values()],
    meals,
    schedule: { type: 'cycle', weeks: calendar },
    rules: [],
  };
  return { doc, estimated };
}
