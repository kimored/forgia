import { describe, expect, it } from 'vitest';
import { italianExerciseName, movementOf } from './exercise-names';

describe('nomi italiani da palestra', () => {
  it.each([
    ['Wide-Grip Lat Pulldown', 'Lat machine presa larga'],
    ['Weighted Pull Ups', 'Trazioni zavorrate'],
    ['Band Assisted Pull-Up', 'Trazioni assistite con elastico'],
    ['Seated Cable Rows', 'Pulley basso'],
    ['One-Arm Dumbbell Row', 'Rematore a un braccio con manubri'],
    ['Incline Dumbbell Press', 'Panca inclinata con manubri'],
    ['Barbell Bench Press - Medium Grip', 'Panca piana con bilanciere'],
    ['Smith Machine Squat', 'Squat al multipower'],
    ['Romanian Deadlift', 'Stacco rumeno'],
    ['Side Lateral Raise', 'Alzate laterali'],
    ['Upright Barbell Row', 'Tirate al mento con bilanciere'],
    ['Dips - Chest Version', 'Dip per il petto'],
    ['Machine Shoulder (Military) Press', 'Shoulder press alla macchina'],
  ])('%s → %s', (en, it_) => expect(italianExerciseName(en)).toBe(it_));

  it('lascia il nome originale se il movimento non è riconosciuto', () => {
    expect(italianExerciseName('Atlas Stones')).toBeNull();
  });

  it('distingue tirata verticale e orizzontale', () => {
    expect(movementOf('Wide-Grip Lat Pulldown')).toBe('tirata-verticale');
    expect(movementOf('Bent Over Barbell Row')).toBe('tirata-orizzontale');
    expect(movementOf('Upright Barbell Row')).toBe('scrollate');
  });
});
