import { Routes } from '@angular/router';

const placeholder = () => import('./shared/ui/placeholder-page').then((m) => m.PlaceholderPage);

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'oggi' },
  { path: 'oggi', title: 'Oggi · Massa', loadComponent: placeholder, data: { title: 'Oggi' } },
  { path: 'settimana', title: 'Settimana · Massa', loadComponent: placeholder, data: { title: 'Settimana' } },
  { path: 'allenamento', title: 'Allenamento · Massa', loadComponent: placeholder, data: { title: 'Allenamento' } },
  { path: 'dispensa', title: 'Dispensa · Massa', loadComponent: placeholder, data: { title: 'Dispensa' } },
  { path: 'progressi', title: 'Progressi · Massa', loadComponent: placeholder, data: { title: 'Progressi' } },
  {
    path: 'impostazioni',
    title: 'Impostazioni · Massa',
    loadComponent: () => import('./features/settings/settings-page').then((m) => m.SettingsPage),
  },
  { path: '**', redirectTo: 'oggi' },
];
