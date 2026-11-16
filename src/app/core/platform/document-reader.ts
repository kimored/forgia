import { Injectable, inject, signal } from '@angular/core';
import type { SourceLine, SourcePage } from '../domain/plan-import';
import { OcrService } from './ocr.service';

export type DocumentKind = 'image' | 'pdf' | 'docx' | 'text';

/**
 * Estrae il testo (con posizioni, quando possibile) da foto, scansioni, PDF e Word.
 * Tutto sul dispositivo: pdf.js, mammoth e Tesseract si caricano solo quando servono.
 */
@Injectable({ providedIn: 'root' })
export class DocumentReader {
  private readonly ocr = inject(OcrService);
  readonly status = signal('');
  /** Avanzamento complessivo 0–1. */
  readonly progress = signal<number | null>(null);

  kindOf(file: File): DocumentKind | null {
    const n = file.name.toLowerCase();
    if (file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/.test(n)) return 'image';
    if (file.type === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
    if (n.endsWith('.docx')) return 'docx';
    if (file.type.startsWith('text/') || n.endsWith('.txt')) return 'text';
    return null;
  }

  async read(files: File[]): Promise<{ pages: SourcePage[]; ocr: boolean }> {
    const pages: SourcePage[] = [];
    let ocr = false;
    this.progress.set(0);
    try {
      for (const [i, file] of files.entries()) {
        const kind = this.kindOf(file);
        const base = i / files.length;
        const step = 1 / files.length;
        if (kind === 'image') {
          this.status.set(`Leggo la foto ${i + 1} di ${files.length}…`);
          ocr = true;
          pages.push(await this.ocrPage(file, base, step));
        } else if (kind === 'pdf') {
          const pdf = await this.readPdf(file, base, step);
          ocr ||= pdf.ocr;
          pages.push(...pdf.pages);
        } else if (kind === 'docx') {
          this.status.set(`Leggo ${file.name}…`);
          pages.push(await this.readDocx(file));
        } else if (kind === 'text') {
          pages.push(textPage(await file.text()));
        } else {
          throw new Error(`Formato non supportato: ${file.name}`);
        }
        this.progress.set((i + 1) / files.length);
      }
      return { pages, ocr };
    } finally {
      this.progress.set(null);
      this.status.set('');
    }
  }

  private async ocrPage(source: Blob | HTMLCanvasElement, base: number, step: number): Promise<SourcePage> {
    const watch = setInterval(() => {
      const p = this.ocr.progress();
      if (p !== null) this.progress.set(base + p * step);
    }, 200);
    try {
      const { lines, width } = await this.ocr.documentLines(source);
      return { lines, width };
    } finally {
      clearInterval(watch);
    }
  }

  /** PDF: testo diretto se c'è (esatto), altrimenti pagine renderizzate e OCR (scansioni). */
  private async readPdf(file: File, base: number, step: number): Promise<{ pages: SourcePage[]; ocr: boolean }> {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('ocr/pdf/pdf.worker.min.mjs', document.baseURI).href;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages: SourcePage[] = [];
    let ocr = false;
    for (let n = 1; n <= doc.numPages; n++) {
      this.status.set(`Leggo la pagina ${n} di ${doc.numPages}…`);
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items
        .filter((it): it is typeof it & { str: string; transform: number[]; width: number; height: number } => 'str' in it && !!it.str.trim())
        .map((it) => ({
          text: it.str,
          x0: it.transform[4],
          x1: it.transform[4] + it.width,
          // pdf.js ha l'origine in basso: si ribalta per avere y crescente verso il basso.
          y0: viewport.height - it.transform[5] - (it.height || 10),
          y1: viewport.height - it.transform[5],
        }));
      if (items.length >= 5) {
        pages.push({ lines: joinRows(items), width: viewport.width });
      } else {
        // Pagina scansionata: si renderizza e si legge con l'OCR.
        ocr = true;
        const scale = 2.5;
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
        pages.push(await this.ocrPage(canvas, base + ((n - 1) / doc.numPages) * step, step / doc.numPages));
      }
      this.progress.set(base + (n / doc.numPages) * step);
    }
    return { pages, ocr };
  }

  /** Word: righe delle tabelle ricostruite (cella alimento + cella quantità sulla stessa riga). */
  private async readDocx(file: File): Promise<SourcePage> {
    const mammoth = await import('mammoth');
    const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    const dom = new DOMParser().parseFromString(html, 'text/html');
    const lines: SourceLine[] = [];
    dom.body.querySelectorAll('p, li, h1, h2, h3, h4, tr').forEach((el) => {
      if (el.tagName !== 'TR' && el.closest('tr')) return; // il testo delle celle lo prende la riga
      const text =
        el.tagName === 'TR'
          ? [...el.querySelectorAll('td, th')].map((c) => c.textContent?.trim()).filter(Boolean).join('  ')
          : (el.textContent ?? '').trim();
      if (text) lines.push({ text });
    });
    return { lines };
  }
}

export function textPage(text: string): SourcePage {
  return { lines: text.split(/\r?\n/).map((t) => ({ text: t })) };
}

/** Unisce i frammenti di testo di un PDF che stanno sulla stessa riga. */
function joinRows(items: { text: string; x0: number; x1: number; y0: number; y1: number }[]): SourceLine[] {
  const rows: (typeof items)[] = [];
  for (const it of [...items].sort((a, b) => a.y1 - b.y1)) {
    const h = it.y1 - it.y0;
    const row = rows.find((r) => Math.abs(r[0].y1 - it.y1) < h * 0.5);
    if (row) row.push(it);
    else rows.push([it]);
  }
  return rows.map((r) => {
    r.sort((a, b) => a.x0 - b.x0);
    return {
      text: r.map((x) => x.text).join(' ').replace(/\s+/g, ' ').trim(),
      x0: r[0].x0,
      x1: r.at(-1)!.x1,
      y0: Math.min(...r.map((x) => x.y0)),
      y1: Math.max(...r.map((x) => x.y1)),
    };
  });
}
