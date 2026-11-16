import type { ResolvedDay } from './day-plan';

/** Consigli contestuali della card "Regola del giorno". */
export function dayTips(day: ResolvedDay): string[] {
  const tips: string[] = [];
  if (day.weekday === 0) tips.push('Pesati a digiuno, prima della colazione.');
  if (day.gym) {
    tips.push('Giorno palestra: cena con metà carboidrati (40 g di pane, niente patate).');
    tips.push('Proteine e creatina nello shake appena torni a casa.');
  } else {
    tips.push('Creatina 5 g nello yogurt delle 17:00 o in acqua.');
  }
  if (day.weekday === 5) {
    tips.push(
      day.options.sushiSwap
        ? 'Swap sushi attivo: pranzo libero, cena da dieta.'
        : 'Cena libera. Sushi a pranzo? Attiva lo swap: la cena diventa da dieta.',
    );
  }
  if (day.weekday === 6) tips.push('Pranzo e cena liberi: colazione e spuntini restano da dieta.');
  if (day.options.cardioExtra && !day.gym) tips.push('Cardio extra: +30 g di pasta a pranzo.');
  return tips;
}
