import { Injectable, signal } from '@angular/core';
import type { Worker } from 'tesseract.js';
import type { OcrWord } from '../domain/scale-ocr';

const THRESHOLD = 225;
const MAX_WIDTH = 1600;
const LOAD_TIMEOUT_MS = 90_000;

/** Il motore OCR non si è caricato (prima volta offline, o file mancanti sul server). */
export class OcrLoadError extends Error {}

/**
 * OCR sul dispositivo con Tesseract.js: gratis, senza limiti, offline dopo il primo uso.
 * Libreria, motore WebAssembly e modello italiano sono serviti dall'app stessa (/ocr)
 * e messi in cache dal service worker la prima volta che servono.
 */
@Injectable({ providedIn: 'root' })
export class OcrService {
  private worker: Promise<Worker> | null = null;
  /** 0–1 durante il riconoscimento, null a riposo. */
  readonly progress = signal<number | null>(null);
  readonly status = signal('');

  private getWorker(): Promise<Worker> {
    this.worker ??= (async () => {
      const { createWorker } = await import('tesseract.js');
      const base = new URL('ocr/', document.baseURI).href;
      // Se un file del motore manca, il worker può restare appeso: meglio un errore chiaro.
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('tempo scaduto nel caricamento')), LOAD_TIMEOUT_MS),
      );
      const worker = createWorker('ita', 1, {
        workerPath: `${base}worker.min.js`,
        corePath: `${base}core`,
        langPath: `${base}lang`,
        gzip: true,
        workerBlobURL: false,
        logger: (m: { status: string; progress: number }) => {
          this.status.set(m.status);
          if (m.status === 'recognizing text') this.progress.set(m.progress);
        },
      });
      return Promise.race([worker, timeout]);
    })();
    this.worker.catch(() => (this.worker = null));
    return this.worker.catch((e) => {
      console.error('OCR: caricamento del motore non riuscito', e);
      throw new OcrLoadError(String(e?.message ?? e));
    });
  }

  /** Riconosce le parole di un'immagine, con la loro posizione. */
  async words(file: Blob): Promise<OcrWord[]> {
    this.progress.set(0);
    this.status.set('preparazione');
    try {
      const image = await preprocess(file);
      const worker = await this.getWorker();
      const { data } = await worker.recognize(image, {}, { blocks: true });
      return (data.blocks ?? []).flatMap((b) =>
        b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words.map((w) => ({ text: w.text, ...w.bbox })))),
      );
    } finally {
      this.progress.set(null);
    }
  }

  /**
   * Legge una pagina di documento (foto, scansione o pagina PDF renderizzata): soglia
   * adattiva contro le ombre e rimozione delle linee puntinate, poi righe con posizione.
   */
  async documentLines(source: Blob | HTMLCanvasElement): Promise<{ lines: OcrWord[]; width: number }> {
    this.progress.set(0);
    this.status.set('preparazione');
    try {
      const canvas = await prepareDocument(source);
      const worker = await this.getWorker();
      // PSM 4: una colonna di testo di dimensioni variabili (le righe seguono la curvatura).
      await worker.setParameters({ tessedit_pageseg_mode: '4' as never });
      const { data } = await worker.recognize(canvas, {}, { blocks: true });
      await worker.setParameters({ tessedit_pageseg_mode: '3' as never });
      const lines = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines)).map((l) => ({ text: l.text.trim(), ...l.bbox }));
      return { lines, width: canvas.width };
    } finally {
      this.progress.set(null);
    }
  }
}

const DOC_WIDTH = 1800;

async function prepareDocument(source: Blob | HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const { adaptiveThreshold, removeDottedLines, toGray } = await import('../domain/image-prep');
  const bitmap = source instanceof Blob ? await createImageBitmap(source) : source;
  const scale = DOC_WIDTH / bitmap.width;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if ('close' in bitmap) bitmap.close();

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const clean = removeDottedLines(adaptiveThreshold(toGray(img.data, canvas.width, canvas.height)));
  for (let i = 0, j = 0; j < clean.data.length; i += 4, j++) {
    img.data[i] = img.data[i + 1] = img.data[i + 2] = clean.data[j];
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Scala di grigi + soglia: il testo colorato su fondo chiaro (i numeri verdi di Feelfit)
 * diventa nero su bianco, molto più leggibile per l'OCR. Gli screenshot scuri vengono invertiti.
 */
async function preprocess(file: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = img.data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  const dark = sum / (px.length / 4) < 110;
  for (let i = 0; i < px.length; i += 4) {
    let l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    if (dark) l = 255 - l;
    const v = l > THRESHOLD ? 255 : 0;
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
