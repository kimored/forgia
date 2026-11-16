import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { APP_NAME, APP_TAGLINE } from '../../core/app-info';
import { ProfileForm } from './profile-form';

@Component({
  selector: 'app-onboarding-page',
  imports: [ProfileForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header>
      <img src="icons/icon.svg" alt="" width="56" height="56" />
      <h1>Benvenuto in {{ name }}</h1>
      <p class="muted">{{ tagline }} · Configuriamo il tuo piano in 4 passaggi.</p>
    </header>
    <app-profile-form mode="wizard" (saved)="done()" />
  `,
  styles: `
    :host {
      display: block;
      max-width: 640px;
      margin: 0 auto;
      padding: calc(var(--safe-top) + 24px) calc(var(--safe-right) + 16px) calc(var(--safe-bottom) + 24px)
        calc(var(--safe-left) + 16px);
    }
    header { display: grid; gap: 8px; justify-items: start; margin-bottom: 20px; }
    img { border-radius: 14px; }
    h1 { font-size: 1.6rem; }
    p { margin: 0; }
  `,
})
export class OnboardingPage {
  private readonly router = inject(Router);
  protected readonly name = APP_NAME;
  protected readonly tagline = APP_TAGLINE;

  protected done(): void {
    void this.router.navigateByUrl('/oggi', { replaceUrl: true });
  }
}
