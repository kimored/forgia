import { Injectable } from '@angular/core';

export interface OverlayHandle {
  /** Chiusura dalla UI (tap su sfondo, ✕, drag): consuma la voce di cronologia. */
  close(): void;
  /** Il componente viene distrutto (es. cambio pagina): rimuove l'overlay senza toccare la cronologia. */
  dispose(): void;
}

/**
 * Integra bottom sheet e modali con la cronologia: aprirne uno aggiunge una voce,
 * così il tasto/gesto "indietro" di Android chiude prima l'overlay in cima,
 * e solo dopo cambia pagina.
 */
@Injectable({ providedIn: 'root' })
export class OverlayService {
  private stack: (() => void)[] = [];

  constructor() {
    addEventListener('popstate', () => this.stack.pop()?.());
  }

  open(onClose: () => void): OverlayHandle {
    const entry = () => onClose();
    this.stack.push(entry);
    history.pushState({ ...history.state, overlay: true }, '');
    return {
      close: () => {
        if (this.stack.at(-1) === entry) history.back(); // il popstate chiamerà onClose
        else this.remove(entry, onClose);
      },
      dispose: () => {
        this.stack = this.stack.filter((e) => e !== entry);
      },
    };
  }

  private remove(entry: () => void, onClose: () => void): void {
    this.stack = this.stack.filter((e) => e !== entry);
    onClose();
  }
}
