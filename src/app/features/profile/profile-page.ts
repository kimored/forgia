import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../shared/ui/icon';
import { ProfileForm } from './profile-form';

@Component({
  selector: 'app-profile-page',
  imports: [ProfileForm, RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="head">
      <a class="icon-btn" routerLink="/impostazioni" aria-label="Torna alle impostazioni"><app-icon name="back" /></a>
      <h1>I miei dati</h1>
    </div>
    <app-profile-form mode="edit" />
  `,
  styles: `
    :host { display: block; max-width: 720px; }
    .head { display: flex; align-items: center; gap: 4px; margin: 4px 0 16px -8px; }
    .head a { color: inherit; }
    h1 { font-size: 1.75rem; }
  `,
})
export class ProfilePage {}
