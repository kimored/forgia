import { describe, expect, it, vi } from 'vitest';
import { OverlayService } from './overlay.service';

const popstate = () => dispatchEvent(new PopStateEvent('popstate'));

describe('OverlayService (tasto indietro)', () => {
  it('il popstate chiude l’overlay in cima, uno alla volta', () => {
    const service = new OverlayService();
    const a = vi.fn();
    const b = vi.fn();
    service.open(a);
    service.open(b);
    popstate();
    expect(b).toHaveBeenCalledOnce();
    expect(a).not.toHaveBeenCalled();
    popstate();
    expect(a).toHaveBeenCalledOnce();
  });

  it('chiudere dalla UI torna indietro nella cronologia', () => {
    const service = new OverlayService();
    const back = vi.spyOn(history, 'back').mockImplementation(() => popstate());
    const close = vi.fn();
    service.open(close).close();
    expect(back).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    back.mockRestore();
  });

  it('dispose non tocca la cronologia e il popstate successivo non chiude nulla', () => {
    const service = new OverlayService();
    const back = vi.spyOn(history, 'back');
    const close = vi.fn();
    service.open(close).dispose();
    popstate();
    expect(back).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it('senza overlay aperti il popstate è un normale cambio pagina', () => {
    const service = new OverlayService();
    expect(() => popstate()).not.toThrow();
    expect(service).toBeTruthy();
  });
});
