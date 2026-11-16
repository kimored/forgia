/**
 * Pre-elaborazione delle foto di documenti (piani alimentari stampati) per l'OCR.
 * Funzioni pure su immagini in scala di grigi (Uint8Array, 0 = nero), usate nel browser
 * (canvas) e nei test/script Node. Niente librerie esterne.
 */

export interface GrayImage {
  data: Uint8Array;
  width: number;
  height: number;
}

export function toGray(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): GrayImage {
  const data = new Uint8Array(width * height);
  for (let i = 0, j = 0; j < data.length; i += 4, j++) {
    data[j] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
  }
  return { data, width, height };
}

/**
 * Soglia adattiva (Bradley): ogni pixel è confrontato con la media della sua zona,
 * così l'ombra su metà pagina non cancella il testo. Restituisce 0 (inchiostro) / 255 (carta).
 */
export function adaptiveThreshold(img: GrayImage, windowFrac = 1 / 16, t = 0.15): GrayImage {
  const { width: w, height: h, data } = img;
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 1; y <= h; y++) {
    let row = 0;
    for (let x = 1; x <= w; x++) {
      row += data[(y - 1) * w + (x - 1)];
      integral[y * (w + 1) + x] = integral[(y - 1) * (w + 1) + x] + row;
    }
  }
  const s = Math.max(8, Math.round(w * windowFrac));
  const half = s >> 1;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(h - 1, y + half);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(w - 1, x + half);
      const count = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[(y1 + 1) * (w + 1) + (x1 + 1)] -
        integral[y0 * (w + 1) + (x1 + 1)] -
        integral[(y1 + 1) * (w + 1) + x0] +
        integral[y0 * (w + 1) + x0];
      out[y * w + x] = data[y * w + x] * count < sum * (1 - t) ? 0 : 255;
    }
  }
  return { data: out, width: w, height: h };
}

interface Blob {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  area: number;
  pixels: number[];
}

/** Componenti connesse dell'inchiostro (8-vicini). */
function components(img: GrayImage): Blob[] {
  const { width: w, height: h, data } = img;
  const seen = new Uint8Array(w * h);
  const blobs: Blob[] = [];
  const stack: number[] = [];
  for (let start = 0; start < data.length; start++) {
    if (data[start] !== 0 || seen[start]) continue;
    const blob: Blob = { x0: w, y0: h, x1: 0, y1: 0, area: 0, pixels: [] };
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w;
      const y = (p - x) / w;
      blob.pixels.push(p);
      blob.area++;
      if (x < blob.x0) blob.x0 = x;
      if (x > blob.x1) blob.x1 = x;
      if (y < blob.y0) blob.y0 = y;
      if (y > blob.y1) blob.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (data[q] === 0 && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
    }
    blobs.push(blob);
  }
  return blobs;
}

/**
 * Toglie le linee puntinate tra alimento e quantità ("Pasta ........ g 40") e i granelli:
 * macchie piccole che hanno altre macchie piccole allineate accanto. I puntini isolati
 * (puntino della i, punto finale) restano.
 */
export function removeDottedLines(img: GrayImage): GrayImage {
  const blobs = components(img);
  const heights = blobs.filter((b) => b.area > 20).map((b) => b.y1 - b.y0 + 1).sort((a, b) => a - b);
  const textH = heights[Math.floor(heights.length * 0.6)] ?? 20;
  const maxDot = Math.max(3, textH * 0.3);
  const small = blobs.filter((b) => b.x1 - b.x0 + 1 <= maxDot && b.y1 - b.y0 + 1 <= maxDot);
  // Raggruppa i puntini per riga (centro verticale vicino) e cerca file di almeno 4.
  const byRow = new Map<number, Blob[]>();
  for (const b of small) {
    const key = Math.round((b.y0 + b.y1) / 2 / Math.max(2, maxDot));
    for (const k of [key - 1, key, key + 1]) {
      const list = byRow.get(k) ?? [];
      list.push(b);
      byRow.set(k, list);
    }
  }
  const erase = new Set<Blob>();
  for (const row of byRow.values()) {
    row.sort((a, b) => a.x0 - b.x0);
    let run: Blob[] = [];
    const flush = () => {
      if (run.length >= 4) run.forEach((b) => erase.add(b));
      run = [];
    };
    for (const b of row) {
      const prev = run.at(-1);
      if (prev && b.x0 - prev.x1 > textH * 1.2) flush();
      run.push(b);
    }
    flush();
  }
  const out = new Uint8Array(img.data);
  for (const b of erase) for (const p of b.pixels) out[p] = 255;
  // Granelli minuscoli (rumore della carta).
  for (const b of blobs) if (b.area <= 2) for (const p of b.pixels) out[p] = 255;
  return { data: out, width: img.width, height: img.height };
}

/**
 * Angolo di inclinazione (gradi) con il profilo di proiezione: le righe di testo dritte
 * danno un profilo orizzontale con picchi netti (varianza massima).
 */
export function estimateSkew(img: GrayImage, maxDeg = 6, step = 0.5): number {
  // Lavora su una versione ridotta per velocità.
  const scale = Math.min(1, 600 / img.width);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const ink: [number, number][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (img.data[Math.floor(y / scale) * img.width + Math.floor(x / scale)] === 0) ink.push([x - w / 2, y - h / 2]);
    }
  }
  let best = 0;
  let bestScore = -1;
  for (let deg = -maxDeg; deg <= maxDeg + 1e-9; deg += step) {
    const a = (deg * Math.PI) / 180;
    const sin = Math.sin(a);
    const cos = Math.cos(a);
    const bins = new Float64Array(h * 2);
    for (const [x, y] of ink) {
      const ry = Math.round(y * cos - x * sin + h);
      if (ry >= 0 && ry < bins.length) bins[ry]++;
    }
    let score = 0;
    for (let i = 1; i < bins.length; i++) score += (bins[i] - bins[i - 1]) ** 2;
    if (score > bestScore) {
      bestScore = score;
      best = deg;
    }
  }
  return best;
}
