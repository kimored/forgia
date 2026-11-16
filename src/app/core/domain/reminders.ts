import { addDays, weekdayOf, type IsoDate } from './dates';
import type { ResolvedDay } from './day-plan';

/** Promemoria in-app del giorno (funzione pura: l'app li mostra all'apertura). */

export interface Reminder {
  id: string;
  icon: string;
  text: string;
  /** Pagina da aprire toccando il promemoria. */
  link?: string;
  level: 'info' | 'warn';
}

export interface ReminderInput {
  today: IsoDate;
  /** "HH:mm" attuale. */
  now: string;
  day: ResolvedDay;
  weighedToday: boolean;
  lastMeasure?: IsoDate;
  habits: { id: string; label: string; done: boolean }[];
  pantryAlerts: number;
  workout: { planned: boolean; started: boolean; time?: string };
  personal: { id: string; time: string; text: string; done: boolean }[];
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

export function dailyReminders(i: ReminderInput): Reminder[] {
  const out: Reminder[] = [];
  const now = minutes(i.now);

  // Pesata del lunedì, a digiuno: solo al mattino.
  if (weekdayOf(i.today) === 0 && !i.weighedToday && now < 12 * 60) {
    out.push({ id: 'peso', icon: '⚖️', text: 'Lunedì: pesati a digiuno, prima della colazione.', link: '/progressi', level: 'info' });
  }

  // Promemoria personali (es. un farmaco) scaduti o entro 30 minuti, non ancora fatti.
  for (const r of i.personal) {
    if (!r.done && minutes(r.time) <= now + 30) out.push({ id: `p-${r.id}`, icon: '⏰', text: `${r.time} · ${r.text}`, link: '/oggi', level: 'warn' });
  }

  // Prossimo pasto entro 45 minuti, o pasto già passato da oltre un'ora e non segnato.
  const pending = i.day.meals.filter((m) => !m.free && (m.log?.status ?? 'todo') === 'todo');
  const next = pending.find((m) => minutes(m.time) >= now && minutes(m.time) - now <= 45);
  if (next) out.push({ id: `next-${next.slot}`, icon: '🍽️', text: `Tra poco: ${next.option?.title ?? 'pasto'} alle ${next.time}.`, link: '/oggi', level: 'info' });
  const missed = pending.filter((m) => now - minutes(m.time) > 60);
  if (missed.length) {
    out.push({
      id: 'missed',
      icon: '✅',
      text: missed.length === 1 ? `Hai fatto ${missed[0].option?.title.toLowerCase() ?? 'il pasto'}? Segnalo in Oggi.` : `${missed.length} pasti di oggi da segnare.`,
      link: '/oggi',
      level: 'info',
    });
  }

  // Abitudini del piano (es. creatina) non ancora spuntate nel pomeriggio.
  for (const h of i.habits) {
    if (!h.done && now >= 18 * 60) out.push({ id: `h-${h.id}`, icon: '💊', text: `${h.label}: non ancora segnata oggi.`, link: '/oggi', level: 'info' });
  }

  if (i.workout.planned && !i.workout.started && i.workout.time && minutes(i.workout.time) - now <= 60 && now < minutes(i.workout.time) + 120) {
    out.push({ id: 'gym', icon: '🏋️', text: `Allenamento alle ${i.workout.time}: la scheda è pronta.`, link: '/allenamento', level: 'info' });
  }

  if (i.pantryAlerts) {
    out.push({
      id: 'pantry',
      icon: '🛒',
      text: i.pantryAlerts === 1 ? '1 prodotto sta per finire.' : `${i.pantryAlerts} prodotti stanno per finire.`,
      link: '/dispensa',
      level: 'warn',
    });
  }

  if (!i.lastMeasure || addDays(i.lastMeasure, 28) <= i.today) {
    if (i.lastMeasure) out.push({ id: 'misure', icon: '📏', text: 'È passato un mese: prendi le misure.', link: '/progressi', level: 'info' });
  }
  return out;
}
