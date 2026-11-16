import { inject } from '@angular/core';
import { Router, type CanActivateFn, type Routes } from '@angular/router';
import { ProfileService } from './core/data/profile.service';
import { Shell } from './layout/shell';

/** Senza profilo si passa dalla configurazione guidata. */
const profileGuard: CanActivateFn = () =>
  inject(ProfileService).configured() || inject(Router).parseUrl('/benvenuto');

const placeholder = () => import('./shared/ui/placeholder-page').then((m) => m.PlaceholderPage);

export const routes: Routes = [
  {
    path: 'benvenuto',
    title: 'Benvenuto · Forgia',
    loadComponent: () => import('./features/profile/onboarding-page').then((m) => m.OnboardingPage),
  },
  {
    path: '',
    component: Shell,
    canActivate: [profileGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'oggi' },
      { path: 'oggi', title: 'Oggi · Forgia', loadComponent: placeholder, data: { title: 'Oggi' } },
      { path: 'settimana', title: 'Settimana · Forgia', loadComponent: placeholder, data: { title: 'Settimana' } },
      { path: 'allenamento', title: 'Allenamento · Forgia', loadComponent: placeholder, data: { title: 'Allenamento' } },
      { path: 'dispensa', title: 'Dispensa · Forgia', loadComponent: placeholder, data: { title: 'Dispensa' } },
      { path: 'progressi', title: 'Progressi · Forgia', loadComponent: placeholder, data: { title: 'Progressi' } },
      {
        path: 'impostazioni',
        title: 'Impostazioni · Forgia',
        loadComponent: () => import('./features/settings/settings-page').then((m) => m.SettingsPage),
      },
      {
        path: 'impostazioni/profilo',
        title: 'I miei dati · Forgia',
        loadComponent: () => import('./features/profile/profile-page').then((m) => m.ProfilePage),
      },
    ],
  },
  { path: '**', redirectTo: 'oggi' },
];
