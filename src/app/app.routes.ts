import { Routes } from '@angular/router';

const placeholder = () => import('./shared/ui/placeholder-page').then((m) => m.PlaceholderPage);

export const routes: Routes = [
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
  { path: '**', redirectTo: 'oggi' },
];
