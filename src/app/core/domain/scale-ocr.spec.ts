import { describe, expect, it } from 'vitest';
import { groupPhrases, parseScaleWords, parseValue, type OcrWord } from './scale-ocr';

/**
 * Layout ricalcato da uno screenshot reale di Feelfit (posizioni delle parole come le
 * restituisce Tesseract), con valori INVENTATI: nessun dato personale nel repo.
 */
const w = (text: string, x0: number, y0: number, x1: number, y1: number): OcrWord => ({ text, x0, y0, x1, y1 });

const FEELFIT: OcrWord[] = [
  w('Utente', 179, 214, 324, 279),
  w('Obiettivo', 665, 407, 829, 438), w('di', 844, 408, 874, 438), w('grasso', 889, 416, 1012, 446),
  w('corporeo', 756, 467, 920, 497),
  w('Da', 53, 644, 102, 674), w('02/03/2025', 114, 643, 323, 674), w('10:00', 341, 644, 439, 674),
  // riga delle variazioni (da ignorare)
  w('Peso', 172, 740, 261, 770), w('BMI', 512, 740, 581, 770), w('Grasso', 768, 740, 898, 771), w('corporeo', 913, 748, 1077, 778),
  w('+3', 160, 810, 229, 857), w('kg', 242, 829, 279, 864), w('+0.9', 484, 810, 611, 858), w('+2', 869, 810, 930, 857), w('%', 951, 829, 982, 857),
  w('03-01-2027', 54, 938, 265, 968), w('08:15', 283, 938, 380, 968),
  w('Ci', 167, 1058, 201, 1090), w('sono', 217, 1067, 305, 1090), w('dati', 320, 1059, 384, 1090),
  // griglia
  w('Peso', 153, 1257, 242, 1287), w('Grasso', 438, 1257, 567, 1287), w('corporeo', 583, 1265, 746, 1295), w('BMI', 952, 1258, 1021, 1287),
  w('81.4', 112, 1324, 236, 1388), w('kg', 248, 1346, 288, 1384), w('17.2%', 510, 1328, 679, 1376), w('24.1', 925, 1330, 1049, 1378),
  w('Livello', 802, 1479, 913, 1509), w('di', 929, 1479, 958, 1509), w('capacità', 974, 1477, 1129, 1516), w('di', 1144, 1479, 1173, 1509),
  w('Muscolo', 14, 1529, 168, 1559), w('scheletrico', 183, 1529, 381, 1559), w('Massa', 433, 1529, 550, 1559), w('muscolare', 566, 1529, 754, 1559),
  w('stoccaggio', 886, 1530, 1088, 1568), w('muscolare', 894, 1581, 1081, 1611),
  w('52%', 142, 1651, 257, 1698), w('63.8', 507, 1650, 631, 1698), w('kg', 643, 1667, 683, 1706), w('4', 1000, 1650, 1030, 1698),
  w('Proteine', 124, 1802, 272, 1831), w('BMR', 549, 1802, 637, 1831), w('Grasso', 808, 1802, 938, 1832), w('addominale', 953, 1802, 1167, 1832),
  w('18.1', 115, 1873, 238, 1921), w('%', 255, 1890, 284, 1921), w('1820kca', 484, 1869, 707, 1933), w('7', 971, 1875, 1003, 1923),
  w('ldratazione', 98, 2023, 298, 2053), w('Massa', 474, 2023, 592, 2053), w('ossea', 606, 2031, 713, 2053),
  w('ETÀ', 817, 2016, 889, 2054), w('METABOLICA', 905, 2024, 1160, 2054),
  w('58.9%', 113, 2094, 285, 2143), w('3.30kg', 507, 2094, 683, 2150), w('31', 953, 2097, 1021, 2145),
];

describe('parseScaleWords (layout Feelfit)', () => {
  const { reading, fields } = parseScaleWords(FEELFIT);

  it('legge tutti i valori della griglia', () => {
    expect(reading).toMatchObject({
      weightKg: 81.4,
      fatPct: 17.2,
      bmi: 24.1,
      skeletalMusclePct: 52,
      muscleKg: 63.8,
      proteinPct: 18.1,
      bmrKcal: 1820,
      visceralFat: 7,
      waterPct: 58.9,
      boneKg: 3.3,
      metabolicAge: 31,
    });
    expect(fields).toHaveLength(11);
  });

  it('ignora la riga delle variazioni (+3 kg, +0.9, +2 %)', () => {
    expect(reading.weightKg).not.toBe(3);
    expect(reading.bmi).not.toBe(0.9);
  });

  it('prende la data della pesata, non quella di confronto ("Da …")', () => {
    expect(reading.date).toBe('2027-01-03');
  });

  it('scarta valori fuori scala (errori OCR tipo "713.2" kg)', () => {
    const words = FEELFIT.map((x) => (x.text === '81.4' ? { ...x, text: '813.4' } : x));
    expect(parseScaleWords(words).reading.weightKg).toBeUndefined();
  });

  it('screenshot senza valori riconoscibili', () => {
    expect(parseScaleWords([w('Ciao', 0, 0, 100, 30)]).fields).toEqual([]);
  });
});

/** Costruisce righe di testo a partire da coordinate semplici (una parola = una frase). */
const row = (y: number, ...cells: [string, number][]) =>
  cells.map(([text, x]) => w(text, x, y, x + text.length * 18, y + 30));

describe('altre app di bilance', () => {
  it('elenco con il valore a destra (stile Renpho / Huawei)', () => {
    const words = [
      ...row(100, ['Peso', 40], ['78,6 kg', 800]),
      ...row(180, ['Grasso corporeo', 40], ['21,3 %', 800]),
      ...row(260, ['Acqua', 40], ['55,1 %', 800]),
      ...row(340, ['Muscoli', 40], ['58,0 kg', 800]),
      ...row(420, ['Ossa', 40], ['2,9 kg', 800]),
      ...row(500, ['Metabolismo basale', 40], ['1745 kcal', 800]),
      ...row(580, ['Grasso viscerale', 40], ['8', 800]),
    ];
    expect(parseScaleWords(words).reading).toMatchObject({
      weightKg: 78.6, fatPct: 21.3, waterPct: 55.1, muscleKg: 58, boneKg: 2.9, bmrKcal: 1745, visceralFat: 8,
    });
  });

  it('valore sopra l’etichetta (stile Xiaomi / Zepp Life)', () => {
    const words = [
      ...row(100, ['78.6kg', 60], ['24.0', 460], ['21.3%', 860]),
      ...row(150, ['Peso', 70], ['BMI', 470], ['Grasso', 870]),
      ...row(300, ['55.1%', 60], ['58.0kg', 460], ['1745kcal', 860]),
      ...row(350, ['Acqua', 70], ['Muscoli', 470], ['BMR', 870]),
    ];
    expect(parseScaleWords(words).reading).toMatchObject({
      weightKg: 78.6, bmi: 24, fatPct: 21.3, waterPct: 55.1, muscleKg: 58, bmrKcal: 1745,
    });
  });

  it('etichetta e valore nella stessa frase', () => {
    const words = [w('Peso: 78,6 kg', 40, 100, 300, 130), w('Grasso corporeo 21,3%', 40, 160, 420, 190), w('BMI 24', 40, 220, 160, 250)];
    expect(parseScaleWords(words).reading).toMatchObject({ weightKg: 78.6, fatPct: 21.3, bmi: 24 });
  });

  it('etichette in inglese e peso in libbre', () => {
    const words = [
      ...row(100, ['Weight', 40], ['173.3 lb', 800]),
      ...row(180, ['Body Fat', 40], ['21.3%', 800]),
      ...row(260, ['Body Water', 40], ['55.1%', 800]),
      ...row(340, ['Metabolic Age', 40], ['30', 800]),
    ];
    expect(parseScaleWords(words).reading).toMatchObject({ weightKg: 78.6, fatPct: 21.3, waterPct: 55.1, metabolicAge: 30 });
  });

  it('peso senza etichetta: il numero in kg più grande', () => {
    const words = [w('78.6', 300, 100, 600, 220), w('kg', 610, 160, 680, 220), ...row(400, ['Grasso', 40], ['21,3 %', 800])];
    expect(parseScaleWords(words).reading).toMatchObject({ weightKg: 78.6, fatPct: 21.3 });
  });

  it('non confonde le unità: un valore in kg non finisce in un campo in %', () => {
    const words = [...row(100, ['Muscolo scheletrico', 40], ['32.5 kg', 800])];
    expect(parseScaleWords(words).reading.skeletalMusclePct).toBeUndefined();
  });
});

describe('helper', () => {
  it('parseValue', () => {
    expect(parseValue('80,5 kg')).toBe(80.5);
    expect(parseValue('1890kcal')).toBe(1890);
    expect(parseValue('+2 kg')).toBeNull();
    expect(parseValue('kg')).toBeNull();
  });

  it('groupPhrases unisce parole vicine e separa le colonne', () => {
    const p = groupPhrases(FEELFIT.filter((x) => ['ldratazione', 'Massa', 'ossea'].includes(x.text) && x.y0 > 2000)).map((x) => x.text);
    expect(p).toEqual(['ldratazione', 'Massa ossea']);
  });
});
