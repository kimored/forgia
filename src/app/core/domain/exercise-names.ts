/**
 * Nomi italiani "da palestra" e tipo di movimento per gli esercizi del catalogo (che nel
 * database sono in inglese e non distinguono, per esempio, tirata verticale e orizzontale).
 * Regole su parole chiave: il nome originale resta sempre visibile accanto a quello italiano.
 */

export type Movement =
  | 'tirata-verticale'
  | 'tirata-orizzontale'
  | 'spinta-orizzontale'
  | 'spinta-verticale'
  | 'croci'
  | 'squat'
  | 'affondi'
  | 'stacco'
  | 'glutei'
  | 'leg-curl'
  | 'leg-extension'
  | 'curl'
  | 'tricipiti'
  | 'alzate-laterali'
  | 'alzate-frontali'
  | 'alzate-posteriori'
  | 'scrollate'
  | 'polpacci'
  | 'addominali'
  | 'lombari'
  | 'pullover';

export const MOVEMENT_IT: Record<Movement, string> = {
  'tirata-verticale': 'Tirata verticale (trazioni, lat machine)',
  'tirata-orizzontale': 'Tirata orizzontale (rematori)',
  'spinta-orizzontale': 'Spinta orizzontale (panca, piegamenti)',
  'spinta-verticale': 'Spinta verticale (lento, military)',
  croci: 'Croci',
  squat: 'Squat e leg press',
  affondi: 'Affondi e step-up',
  stacco: 'Stacchi e hip hinge',
  glutei: 'Glutei (ponte, hip thrust)',
  'leg-curl': 'Leg curl',
  'leg-extension': 'Leg extension',
  curl: 'Curl bicipiti',
  tricipiti: 'Tricipiti (estensioni, pushdown, dip)',
  'alzate-laterali': 'Alzate laterali',
  'alzate-frontali': 'Alzate frontali',
  'alzate-posteriori': 'Deltoidi posteriori',
  scrollate: 'Scrollate',
  polpacci: 'Polpacci',
  addominali: 'Addominali',
  lombari: 'Lombari',
  pullover: 'Pullover',
};

/** Movimento base: prima le regole più specifiche. [regex sul nome, movimento, nome italiano] */
const BASES: [RegExp, Movement, string][] = [
  [/seated cable rows?/, 'tirata-orizzontale', 'Pulley basso'],
  [/upright .*row|upright row/, 'scrollate', 'Tirate al mento'],
  [/face pull/, 'alzate-posteriori', 'Face pull'],
  [/rear delt|reverse fl(y|ye|yes)|rear lateral/, 'alzate-posteriori', 'Alzate posteriori'],
  [/lat pull ?down|pull ?downs?\b/, 'tirata-verticale', 'Lat machine'],
  [/chin[- ]?ups?|\bchins?\b/, 'tirata-verticale', 'Trazioni presa supina'],
  [/pull[- ]?ups?|pullups?/, 'tirata-verticale', 'Trazioni'],
  [/\brows?\b|rowing/, 'tirata-orizzontale', 'Rematore'],
  [/pullover/, 'pullover', 'Pullover'],
  [/cable crossover|crossover/, 'croci', 'Croci ai cavi'],
  [/\bfl(y|ye|yes)\b|butterfly|pec deck/, 'croci', 'Croci'],
  [/push[- ]?ups?|pushups?/, 'spinta-orizzontale', 'Piegamenti'],
  [/close-grip .*bench press/, 'tricipiti', 'Panca presa stretta'],
  [/floor press/, 'spinta-orizzontale', 'Floor press'],
  [/bench press|chest press|\bpress\b.*(incline|decline)|(incline|decline).*\bpress\b|dumbbell press/, 'spinta-orizzontale', 'Panca'],
  [/military.*press|shoulder.*press|overhead press|arnold press|push press/, 'spinta-verticale', 'Shoulder press'],
  [/front squat/, 'squat', 'Front squat'],
  [/hack squat/, 'squat', 'Hack squat'],
  [/split squat/, 'affondi', 'Split squat'],
  [/leg press/, 'squat', 'Leg press'],
  [/squat/, 'squat', 'Squat'],
  [/lunges?/, 'affondi', 'Affondi'],
  [/step[- ]?ups?/, 'affondi', 'Step-up'],
  [/romanian deadlift/, 'stacco', 'Stacco rumeno'],
  [/stiff[- ]legged deadlift/, 'stacco', 'Stacco a gambe tese'],
  [/sumo deadlift/, 'stacco', 'Stacco sumo'],
  [/deadlift/, 'stacco', 'Stacco'],
  [/good ?mornings?/, 'stacco', 'Good morning'],
  [/hip thrust/, 'glutei', 'Hip thrust'],
  [/glute bridge|butt lift|bridge/, 'glutei', 'Ponte glutei'],
  [/glute kickback|kickbacks? .*glute/, 'glutei', 'Slanci glutei'],
  [/leg curls?|hamstring curl/, 'leg-curl', 'Leg curl'],
  [/leg extensions?/, 'leg-extension', 'Leg extension'],
  [/hammer curls?/, 'curl', 'Curl a martello'],
  [/preacher curls?/, 'curl', 'Curl alla panca Scott'],
  [/concentration curls?/, 'curl', 'Curl di concentrazione'],
  [/reverse (barbell )?curl/, 'curl', 'Curl presa inversa'],
  [/wrist curl/, 'curl', 'Curl per avambracci'],
  [/curls?\b/, 'curl', 'Curl'],
  [/push ?downs?/, 'tricipiti', 'Pushdown tricipiti'],
  [/lying triceps|skull ?crusher|french press/, 'tricipiti', 'French press'],
  [/kickbacks?/, 'tricipiti', 'Kickback tricipiti'],
  [/dips? - chest|chest dip/, 'spinta-orizzontale', 'Dip per il petto'],
  [/\bdips?\b/, 'tricipiti', 'Dip'],
  [/triceps|tricep extension/, 'tricipiti', 'Estensioni tricipiti'],
  [/lateral raise|side raise/, 'alzate-laterali', 'Alzate laterali'],
  [/front raise|front (dumbbell|plate|cable) raise/, 'alzate-frontali', 'Alzate frontali'],
  [/shrugs?/, 'scrollate', 'Scrollate'],
  [/calf|calves/, 'polpacci', 'Calf raise'],
  [/crunch/, 'addominali', 'Crunch'],
  [/sit-?ups?/, 'addominali', 'Sit-up'],
  [/leg raise|knee raise|knee tuck/, 'addominali', 'Sollevamento gambe'],
  [/plank/, 'addominali', 'Plank'],
  [/russian twist|oblique|wood ?chop|side bend/, 'addominali', 'Obliqui'],
  [/ab roll|jackknife/, 'addominali', 'Addominali'],
  [/hyperextension|back extension|superman/, 'lombari', 'Iperestensioni'],
];

/** Modificatori, nell'ordine in cui si aggiungono al nome. */
const MODIFIERS: [RegExp, string][] = [
  [/weighted/, 'zavorrate'],
  [/band[- ]assisted|assisted/, 'assistite'],
  [/incline/, 'inclinata'],
  [/decline/, 'declinata'],
  [/wide[- ]grip/, 'presa larga'],
  [/close[- ]grip|narrow/, 'presa stretta'],
  [/reverse[- ]grip|underhand/, 'presa inversa'],
  [/neutral grip|v-bar|hammer grip/, 'presa neutra'],
  [/behind the neck/, 'dietro la nuca'],
  [/one[- ]arm|single[- ]arm|one arm/, 'a un braccio'],
  [/one[- ]leg|single[- ]leg/, 'a una gamba'],
  [/alternat/, 'alternato'],
  [/seated/, 'da seduto'],
  [/standing/, 'in piedi'],
  [/lying/, 'sdraiato'],
  [/kneeling/, 'in ginocchio'],
  [/smith machine/, 'al multipower'],
  [/leverage|machine/, 'alla macchina'],
  [/e-?z|ez[- ]bar/, 'con bilanciere EZ'],
  [/barbell/, 'con bilanciere'],
  [/dumbbells?/, 'con manubri'],
  [/kettlebell/, 'con kettlebell'],
  [/cable/, 'ai cavi'],
  [/band/, 'con elastico'],
];

const clean = (name: string) => name.toLowerCase().replace(/_/g, ' ');

export function movementOf(name: string): Movement | null {
  const n = clean(name);
  return BASES.find(([re]) => re.test(n))?.[1] ?? null;
}

/** Nome italiano costruito da movimento + modificatori; null se il movimento non è riconosciuto. */
export function italianExerciseName(name: string): string | null {
  const n = clean(name);
  const base = BASES.find(([re]) => re.test(n));
  if (!base) return null;
  let it = base[2];
  const baseLower = it.toLowerCase();
  // Modificatori già impliciti nel nome italiano ("Pulley basso" è sempre da seduto ai cavi).
  const implicit: Record<string, string[]> = {
    'Pulley basso': ['da seduto', 'ai cavi'],
    'Lat machine': ['ai cavi', 'da seduto', 'alla macchina'],
    'Leg press': ['alla macchina', 'da seduto'],
    'Leg extension': ['alla macchina', 'da seduto'],
  };
  const mods: string[] = [];
  for (const [re, label] of MODIFIERS) {
    if (!re.test(n) || implicit[it]?.includes(label)) continue;
    // Niente ripetizioni ("Croci ai cavi ai cavi", "Leg press alla macchina").
    if (baseLower.includes(label.replace(/^(ai|alla|con|al) /, ''))) continue;
    if (label === 'alla macchina' && mods.includes('al multipower')) continue;
    if (label === 'con bilanciere' && mods.includes('con bilanciere EZ')) continue;
    if (label === 'con elastico' && mods.includes('assistite')) {
      mods.push('con elastico');
      continue;
    }
    if (!mods.includes(label)) mods.push(label);
  }
  // Panca inclinata/declinata: l'aggettivo va subito dopo "Panca".
  if (it === 'Panca') {
    const tilt = mods.find((m) => m === 'inclinata' || m === 'declinata');
    if (tilt) {
      it = `Panca ${tilt}`;
      mods.splice(mods.indexOf(tilt), 1);
    } else if (!/press/.test(n) || /chest press/.test(n)) {
      it = /chest press/.test(n) ? 'Chest press' : it;
    } else {
      it = 'Panca piana';
    }
  }
  // "Trazioni zavorrate/assistite" concordano al plurale; altri casi restano invariati.
  return [it, ...mods].join(' ').replace(/\s+/g, ' ');
}
