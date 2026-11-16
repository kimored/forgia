import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Pagina provvisoria per le sezioni non ancora implementate. */
@Component({
  selector: 'app-placeholder-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>{{ title() }}</h1>
    <div class="card empty">
      <p class="muted">{{ note() ?? 'In arrivo nei prossimi step.' }}</p>
    </div>
  `,
  styles: `
    h1 { font-size: 1.75rem; margin: 8px 0 16px; }
    .empty { min-height: 160px; display: grid; place-items: center; text-align: center; }
  `,
})
export class PlaceholderPage {
  /** Valorizzati dai `data` della route (withComponentInputBinding). */
  readonly title = input('');
  readonly note = input<string | undefined>();
}
